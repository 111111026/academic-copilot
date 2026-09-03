import { PROMPTS } from '@/config/prompts';
import { fill } from '@/lib/prompt';
import type { PromptRequest } from '@/lib/prompt';

export type CodeMode = 'stats' | 'codegen' | 'interpret' | 'debug';

export const CODE_TEMPERATURE: Record<CodeMode, number> = {
  stats: 0.3,
  codegen: 0.2,
  interpret: 0.3,
  debug: 0.2,
};

export interface CodeBlock {
  lang: string;
  code: string;
}

const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;

/**
 * 从 Markdown 里抽出围栏代码块，让「复制代码」直接拿到可运行的部分，
 * 不必让用户手动跳过模型写的解释文字。
 * 用逐行扫描而不是整段正则：闭合围栏必须与开启处同种字符且不更短、后面不带信息串，
 * 否则代码里出现的 ``` 会被误判成边界。模型不闭合围栏时（流式输出中途必然如此）
 * 保留已累积的内容，而不是把它整块丢掉。
 */
export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let open: { marker: string; lang: string; lines: string[] } | null = null;

  for (const line of markdown.split('\n')) {
    const m = line.match(FENCE);
    if (open) {
      const closes =
        m !== null &&
        m[2][0] === open.marker[0] &&
        m[2].length >= open.marker.length &&
        m[3].trim() === '';
      if (closes) {
        blocks.push({ lang: open.lang, code: open.lines.join('\n') });
        open = null;
      } else {
        open.lines.push(line);
      }
    } else if (m) {
      open = { marker: m[2], lang: m[3].trim(), lines: [] };
    }
  }

  if (open && open.lines.some((line) => line.trim() !== '')) {
    blocks.push({ lang: open.lang, code: open.lines.join('\n') });
  }
  return blocks;
}

/** 多个代码块时优先取与目标语言匹配的那个，其次取最长的一个 */
export function pickPrimaryBlock(blocks: CodeBlock[], language: string): CodeBlock | null {
  if (!blocks.length) return null;
  const want = language.toLowerCase();
  const matched = blocks.filter((b) => b.lang.toLowerCase() === want);
  const pool = matched.length ? matched : blocks;
  return pool.reduce((longest, b) => (b.code.length > longest.code.length ? b : longest));
}

export interface CodeFields {
  design?: string;
  language?: string;
  task?: string;
  dataFormat?: string;
  requirements?: string;
  output?: string;
  code?: string;
  error?: string;
}

/**
 * 四种模式的槽位都在方案的 systemPrompt 内，所以 user 消息只作触发，
 * 避免同一份材料在系统消息和用户消息里各占一次上下文。
 */
export function buildCodeRequest(mode: CodeMode, fields: CodeFields): PromptRequest {
  switch (mode) {
    case 'stats':
      return {
        system: fill(PROMPTS.recommendStats.systemPrompt, { design: fields.design ?? '' }),
        user: '请开始推荐。',
      };
    case 'codegen':
      return {
        system: fill(PROMPTS.generateCode.systemPrompt, {
          language: fields.language ?? '',
          task: fields.task ?? '',
          dataFormat: fields.dataFormat?.trim() || '未提供，请按常见格式假设并在注释中说明',
          requirements: fields.requirements?.trim() || '无',
        }),
        user: '请开始生成代码。',
      };
    case 'interpret':
      return {
        system: fill(PROMPTS.interpretStats.systemPrompt, { output: fields.output ?? '' }),
        user: '请开始解释。',
      };
    case 'debug':
      return {
        system: fill(PROMPTS.debugCode.systemPrompt, {
          language: fields.language ?? '',
          code: fields.code ?? '',
          error: fields.error?.trim() || '未提供报错信息，只有代码本身的疑问',
        }),
        user: '请开始诊断。',
      };
  }
}
