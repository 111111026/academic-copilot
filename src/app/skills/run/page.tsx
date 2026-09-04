'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Input,
  Popconfirm,
  Progress,
  Select,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CaretRightOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import Markdown from 'react-markdown';
import AppShell from '@/components/AppShell';
import { getBuiltinSkill } from '@/config/skills';
import { db, deleteCustomSkill, saveExecution } from '@/lib/db';
import { downloadTextFile, localDateStamp } from '@/lib/download';
import { runSkill } from '@/lib/skill-engine';
import { copyText } from '@/lib/clipboard';
import { useSettings } from '@/lib/settings';
import type { Skill, SkillInput } from '@/types/skill';
import type { SkillExecution } from '@/types/execution';

function SkillRunBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const execParam = searchParams.get('exec');
  const llm = useSettings((s) => s.settings.llm);
  const [messageApi, contextHolder] = message.useMessage();

  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [execution, setExecution] = useState<SkillExecution | null>(null);
  const [execLoading, setExecLoading] = useState(!!execParam);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!id) {
      setSkill(null);
      setLoading(false);
      return;
    }
    const builtin = getBuiltinSkill(id);
    if (builtin) {
      setSkill(builtin);
      setLoading(false);
      return;
    }
    db.customSkills.get(id).then((s) => {
      setSkill(s ?? null);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!skill) return;
    // 只填空缺的键：?exec= 恢复输入是异步读 IndexedDB，可能先于这里落地，
    // 无条件覆盖会把已恢复的表单清空
    setInputs((prev) => {
      const next = { ...prev };
      for (const inp of skill.inputs) {
        if (next[inp.id] === undefined) next[inp.id] = inp.defaultValue ?? '';
      }
      return next;
    });
  }, [skill]);

  useEffect(() => {
    if (!execParam) return;
    setExecLoading(true);
    db.skillExecutions.get(execParam).then((row) => {
      if (row) {
        setExecution(row);
        setInputs(row.userInputs);
      }
      setExecLoading(false);
    });
  }, [execParam]);

  const requiredFilled = useMemo(() => {
    if (!skill) return false;
    return skill.inputs
      .filter((i) => i.required)
      .every((i) => (inputs[i.id] ?? '').trim().length > 0);
  }, [skill, inputs]);

  const canRun = requiredFilled && !!llm.apiKey && !running;

  const startExecution = useCallback(async () => {
    if (!skill || !canRun) return;
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const exec = await runSkill({
      skill,
      userInputs: inputs,
      llm,
      signal: controller.signal,
      onStepStart: (index) => {
        setExecution((prev) => {
          if (!prev) return prev;
          const steps = [...prev.steps];
          steps[index] = { ...steps[index], status: 'running', output: '' };
          return { ...prev, currentStepIndex: index, steps };
        });
      },
      onStepDelta: (index, delta) => {
        setExecution((prev) => {
          if (!prev) return prev;
          const steps = [...prev.steps];
          steps[index] = { ...steps[index], output: steps[index].output + delta };
          return { ...prev, steps };
        });
      },
      onStepDone: (index, result) => {
        setExecution((prev) => {
          if (!prev) return prev;
          const steps = [...prev.steps];
          steps[index] = { ...result };
          return { ...prev, steps };
        });
      },
    });

    setExecution(exec);
    setRunning(false);
    abortRef.current = null;

    if (exec.status === 'completed') {
      messageApi.success(`${skill.name} 执行完成`);
    } else if (exec.status === 'failed') {
      messageApi.error('执行中断，已完成步骤的结果已保留');
    }

    await saveExecution(exec);
  }, [skill, canRun, inputs, llm, messageApi]);

  const cancel = () => {
    abortRef.current?.abort();
  };

  const startFresh = useCallback(() => {
    if (!skill) return;
    setExecution({
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
      userInputs: inputs,
    });
  }, [skill, inputs]);

  const handleRun = () => {
    startFresh();
    startExecution();
  };

  const exportMd = () => {
    if (!execution) return;
    // 用执行记录里的 skillName：Skill 定义被删了也还能导出
    const name = execution.skillName;
    const lines: string[] = [`# ${name}`, ''];
    for (const step of execution.steps) {
      if (step.status === 'skipped') continue;
      lines.push(`## ${step.stepName}`, '', step.output, '');
    }
    downloadTextFile(`${name}_${localDateStamp()}.md`, lines.join('\n'), 'text/markdown');
    messageApi.success('已导出 Markdown');
  };

  const handleDeleteSkill = async () => {
    if (!skill) return;
    await deleteCustomSkill(skill.id);
    messageApi.success('已删除');
    router.push('/skills');
  };

  // Skill 定义找不到时执行记录是唯一的真相来源，得等它落地再决定渲染哪种视图，
  // 否则会先闪一下「Skill 不存在」再切到回看
  if (loading || (!skill && execLoading)) {
    return (
      <AppShell>
        <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />
      </AppShell>
    );
  }

  if (!skill && !execution) {
    return (
      <AppShell>
        <Alert
          type="error"
          title={id ? 'Skill 不存在' : '缺少 Skill ID'}
          description={id ? `找不到 ID 为「${id}」的 Skill。` : '请从 Skills 中心选择一个 Skill 进入。'}
        />
        <Link href="/skills">
          <Button type="link" icon={<ArrowLeftOutlined />} style={{ marginTop: 12 }}>
            返回 Skills 中心
          </Button>
        </Link>
      </AppShell>
    );
  }

  const completedSteps = execution?.steps.filter((s) => s.status === 'completed').length ?? 0;
  const totalSteps = skill?.steps.length ?? execution?.steps.length ?? 0;
  // 中断的执行里最后一步往往根本没跑，展开它只会看到「等待执行…」，
  // 所以退而求其次找最后一个真的产出过内容或报错的步骤
  const openStepKey =
    execution?.steps.find((s) => s.status === 'running')?.stepId ??
    [...(execution?.steps ?? [])]
      .reverse()
      .find((s) => s.status === 'completed' || s.status === 'failed')?.stepId ??
    execution?.steps[execution.steps.length - 1]?.stepId;

  return (
    <AppShell>
      {contextHolder}
      <Space style={{ marginBottom: 12 }}>
        <Link href="/skills">
          <Button type="text" icon={<ArrowLeftOutlined />} size="small">
            Skills 中心
          </Button>
        </Link>
      </Space>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            {skill ? `${skill.icon} ${skill.name}` : execution?.skillName}
          </Typography.Title>
          {skill && (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
              {skill.description}
            </Typography.Paragraph>
          )}
        </div>
        {skill && !skill.isBuiltin && (
          <Popconfirm
            title="删除这个自定义 Skill？"
            description="已有的执行历史会保留。"
            okText="删除"
            okButtonProps={{ danger: true }}
            onConfirm={handleDeleteSkill}
          >
            <Button danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        )}
      </div>

      {!skill && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="该 Skill 已被删除"
          description="执行记录自带每一步的名称与产出，所以下面的结果仍可回看和导出，但无法再次执行。"
        />
      )}

      {skill && !llm.apiKey && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="尚未配置 API Key"
          description={
            <>
              Skill 执行需要调用大模型，请先到 <Link href="/settings">设置</Link> 填写。
            </>
          }
        />
      )}

      {skill && (
        <Card size="small" title="输入" style={{ marginBottom: 16 }}>
          {skill.inputs.map((inp) => (
            <InputField
              key={inp.id}
              input={inp}
              value={inputs[inp.id] ?? ''}
              onChange={(v) => setInputs((prev) => ({ ...prev, [inp.id]: v }))}
              disabled={running}
            />
          ))}
          <Space style={{ marginTop: 12 }}>
            <Button
              type="primary"
              icon={<CaretRightOutlined />}
              onClick={handleRun}
              disabled={!canRun}
              loading={running && !execution}
            >
              {execution ? '重新执行' : '开始执行'}
            </Button>
            {running && (
              <Button danger icon={<StopOutlined />} onClick={cancel}>
                取消
              </Button>
            )}
          </Space>
        </Card>
      )}

      {execution && (
        <>
          <Card
            size="small"
            title={
              <Space>
                执行进度
                <Tag color={execution.status === 'completed' ? 'green' : execution.status === 'failed' ? 'red' : 'blue'}>
                  {execution.status === 'completed' ? '已完成' : execution.status === 'failed' ? '中断' : execution.status === 'cancelled' ? '已取消' : '执行中'}
                </Tag>
              </Space>
            }
            extra={
              <Space>
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={exportMd}
                  disabled={completedSteps === 0}
                >
                  导出 Markdown
                </Button>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <Progress
              percent={Math.round((completedSteps / totalSteps) * 100)}
              status={execution.status === 'failed' ? 'exception' : execution.status === 'completed' ? 'success' : 'active'}
              style={{ marginBottom: 16 }}
            />
            <Steps
              orientation="vertical"
              size="small"
              current={execution.currentStepIndex}
              items={execution.steps.map((s) => ({
                title: s.stepName,
                status:
                  s.status === 'completed' ? 'finish' :
                  s.status === 'running' ? 'process' :
                  s.status === 'failed' ? 'error' :
                  s.status === 'skipped' ? 'finish' : 'wait',
                content: s.duration ? `${(s.duration / 1000).toFixed(1)}s` : undefined,
              }))}
            />
          </Card>

          <Card size="small" title="各步结果">
            <Collapse
              accordion
              defaultActiveKey={openStepKey}
              items={execution.steps
                .filter((s) => s.status !== 'skipped')
                .map((s) => ({
                  key: s.stepId,
                  label: (
                    <Space>
                      {s.stepName}
                      {s.status === 'running' && <Spin size="small" />}
                      {s.status === 'failed' && <Tag color="red">失败</Tag>}
                    </Space>
                  ),
                  extra: s.output ? (
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyText(s.output).then((ok) =>
                          ok ? messageApi.success('已复制') : messageApi.error('复制失败'),
                        );
                      }}
                    />
                  ) : undefined,
                  children: s.output ? (
                    <div className="markdown-body">
                      <Markdown>{s.output}</Markdown>
                    </div>
                  ) : s.error ? (
                    <Alert type="error" title={s.error} />
                  ) : (
                    <Typography.Text type="secondary">等待执行…</Typography.Text>
                  ),
                }))}
            />
          </Card>

          {execution.status === 'completed' && (
            <Typography.Text
              type="secondary"
              style={{ fontSize: 12, display: 'block', marginTop: 16 }}
            >
              内容由 AI 生成，仅供学术辅助。请核实事实与引用，遵守所在院校的学术诚信与 AI 使用规定。
            </Typography.Text>
          )}
        </>
      )}
    </AppShell>
  );
}

export default function SkillRunPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />
        </AppShell>
      }
    >
      <SkillRunBody />
    </Suspense>
  );
}

function InputField({
  input,
  value,
  onChange,
  disabled,
}: {
  input: SkillInput;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const label = (
    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
      {input.label}
      {input.required && <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>}
    </Typography.Text>
  );

  let control: React.ReactNode;
  switch (input.type) {
    case 'textarea':
      control = (
        <Input.TextArea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={input.placeholder}
          autoSize={{ minRows: 4, maxRows: 16 }}
          maxLength={12000}
          showCount
          disabled={disabled}
        />
      );
      break;
    case 'select':
      control = (
        <Select
          value={value || undefined}
          onChange={onChange}
          options={(input.options ?? []).map((o) => ({ value: o, label: o }))}
          placeholder={input.placeholder}
          style={{ width: 300 }}
          disabled={disabled}
        />
      );
      break;
    case 'number':
      control = (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={input.placeholder}
          style={{ width: 200 }}
          disabled={disabled}
        />
      );
      break;
    default:
      control = (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={input.placeholder}
          maxLength={200}
          disabled={disabled}
        />
      );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {label}
      {control}
      {input.description && (
        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
          {input.description}
        </Typography.Text>
      )}
    </div>
  );
}
