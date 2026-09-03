import { chat } from '@/lib/llm';
import { fill } from '@/lib/prompt';
import type { Settings, Skill, SkillExecution, SkillStep, StepResult } from '@/types';

export interface SkillRunOptions {
  skill: Skill;
  userInputs: Record<string, string>;
  llm: Settings['llm'];
  temperature?: number;
  signal?: AbortSignal;
  onStepStart?: (index: number, step: SkillStep) => void;
  onStepDelta?: (index: number, delta: string) => void;
  onStepDone?: (index: number, result: StepResult) => void;
}

/** 选填输入留空时的占位文案。用「未填写」而非「无」：后者会被模型读成
 *  「没有要求」这一事实断言，而实际情况是用户没提供信息。 */
const EMPTY_INPUT_FALLBACK = '（未填写）';

function resolveTemplate(
  skill: Skill,
  step: SkillStep,
  userInputs: Record<string, string>,
  results: Record<string, string>,
): string {
  // 自定义 Skill 创建器只产出 promptTemplate，inputFrom 是空的，
  // 模板里的 {字段ID} / {步骤ID} 得靠先铺开整个作用域才能替换掉；
  // 显式 binding 之后再覆盖一次，constant 才有意义
  const vars: Record<string, string> = { ...userInputs, ...results };
  const constants = new Set<string>();
  for (const binding of step.inputFrom) {
    const key = binding.key ?? binding.value ?? '';
    switch (binding.source) {
      case 'userInput':
        vars[key] = userInputs[key] ?? '';
        break;
      case 'previousStep':
        vars[key] = results[key] ?? '';
        break;
      case 'constant':
        vars[key] = binding.value ?? '';
        constants.add(key);
        break;
    }
  }
  // 必须放在 binding 之后：userInput 绑定会把空值重新写成 ''。
  // 只兜底声明过的输入字段，未声明的占位符仍原样漏出，装配漏洞才看得见。
  for (const input of skill.inputs) {
    if (!constants.has(input.id) && !(vars[input.id] ?? '').trim()) {
      vars[input.id] = EMPTY_INPUT_FALLBACK;
    }
  }
  return fill(step.promptTemplate, vars);
}

export function createExecution(skill: Skill, userInputs: Record<string, string>): SkillExecution {
  return {
    id: crypto.randomUUID(),
    skillId: skill.id,
    skillName: skill.name,
    status: 'running',
    currentStepIndex: 0,
    startedAt: Date.now(),
    steps: skill.steps.map((s) => ({
      stepId: s.id,
      stepName: s.name,
      output: '',
      status: 'pending' as const,
    })),
    results: {},
    userInputs,
  };
}

export async function runSkill(options: SkillRunOptions): Promise<SkillExecution> {
  const { skill, userInputs, llm, temperature, signal, onStepStart, onStepDelta, onStepDone } = options;
  const execution = createExecution(skill, userInputs);
  const results: Record<string, string> = {};

  for (let i = 0; i < skill.steps.length; i++) {
    const step = skill.steps[i];
    execution.currentStepIndex = i;
    const stepResult = execution.steps[i];

    if (step.optional && !userInputs[`__opt_${step.id}`]) {
      stepResult.status = 'skipped';
      onStepDone?.(i, stepResult);
      continue;
    }

    stepResult.status = 'running';
    onStepStart?.(i, step);

    const systemPrompt = resolveTemplate(skill, step, userInputs, results);
    const started = Date.now();

    try {
      const full = await chat(llm, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请执行「${step.name}」。` },
        ],
        temperature: temperature ?? llm.temperature,
        signal,
        onDelta: (delta) => {
          stepResult.output += delta;
          onStepDelta?.(i, delta);
        },
      });

      stepResult.output = full;
      stepResult.status = 'completed';
      stepResult.duration = Date.now() - started;
      results[step.id] = full;
      execution.results[step.id] = full;
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        execution.status = 'cancelled';
        stepResult.status = 'failed';
        stepResult.error = '用户取消';
        onStepDone?.(i, stepResult);
        break;
      }
      stepResult.status = 'failed';
      stepResult.error = (e as Error).message;
      stepResult.duration = Date.now() - started;
      execution.status = 'failed';
      onStepDone?.(i, stepResult);
      break;
    }

    onStepDone?.(i, stepResult);
  }

  if (execution.status === 'running') {
    execution.status = 'completed';
  }
  execution.completedAt = Date.now();
  return execution;
}
