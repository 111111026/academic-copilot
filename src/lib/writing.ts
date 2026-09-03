import { PROMPTS } from '@/config/prompts';
import { fill } from '@/lib/prompt';
import type { PromptRequest } from '@/lib/prompt';
import type { Paper } from '@/types/paper';

export type WritingMode =
  | 'polish'
  | 'rewrite'
  | 'outline'
  | 'expand'
  | 'translate'
  | 'references';

export const DEFAULT_POLISH_STYLE = '规范、精炼的学术书面语';

/** 题录格式化和互译要求可复现、少发挥，大纲生成反而需要发散 */
export const WRITING_TEMPERATURE: Record<WritingMode, number> = {
  polish: 0.3,
  rewrite: 0.5,
  outline: 0.7,
  expand: 0.6,
  translate: 0.2,
  references: 0.1,
};

export type TranslateDirection = 'auto' | 'zh2en' | 'en2zh';

/**
 * 判定文本主体语言，供「自动」方向使用。
 * 汉字按字计数，拉丁字母按词组（连续字母段）计数：中文学术句常夹带
 * Transformer、BERT 这类长术语，若两边都数字符，术语的字母数会压过汉字数而误判成英文。
 * 无语言特征（纯数字、符号）时判为中文，因为误判成「中译英」在结果里一眼可见，
 * 误判成「英译中」则容易被直接采用。
 */
export function detectLanguage(text: string): 'zh' | 'en' {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latinWords = (text.match(/[a-z]+/gi) ?? []).length;
  return cjk >= latinWords ? 'zh' : 'en';
}

export function resolveDirection(text: string, direction: TranslateDirection): '中文' | '英文' {
  if (direction === 'zh2en') return '英文';
  if (direction === 'en2zh') return '中文';
  return detectLanguage(text) === 'zh' ? '英文' : '中文';
}

/**
 * 把本地文献库的题录拼成 formatReferences 需要的素材。
 * 缺失字段保留空标签而不是整行删掉：prompt 明确要求缺失处标注[缺失]，
 * 字段名在场模型才知道是「这一项没有」而非「没提供这一项」。
 */
export function buildReferenceList(papers: Paper[]): string {
  return papers
    .map(
      (paper, i) =>
        [
          `【${i + 1}】`,
          `标题：${paper.title}`,
          `作者：${paper.authors.join(', ')}`,
          `年份：${paper.year ?? ''}`,
          `来源：${paper.venue ?? ''}`,
          `DOI：${paper.doi ?? ''}`,
          `链接：${paper.url ?? ''}`,
        ].join('\n'),
    )
    .join('\n\n');
}

export interface WritingFields {
  text?: string;
  style?: string;
  ratio?: number;
  direction?: TranslateDirection;
  writingType?: string;
  topic?: string;
  requirements?: string;
  format?: string;
  references?: string;
}

/**
 * 六种模式共用的请求装配。方案里润色/降重/扩写/互译的 systemPrompt 没有文本占位符，
 * 待处理正文走 user 消息；大纲和参考文献格式化的全部槽位都在 systemPrompt 内，
 * user 消息只作触发，避免同一份内容在两处重复占用上下文。
 */
export function buildWritingRequest(mode: WritingMode, fields: WritingFields): PromptRequest {
  const text = fields.text ?? '';
  switch (mode) {
    case 'polish':
      return {
        system: fill(PROMPTS.polishText.systemPrompt, {
          style: fields.style?.trim() || DEFAULT_POLISH_STYLE,
        }),
        user: `待润色文本：\n${text}`,
      };
    case 'rewrite':
      return {
        system: PROMPTS.rewriteForPlagiarism.systemPrompt,
        user: `待改写文本：\n${text}`,
      };
    case 'expand':
      return {
        system: fill(PROMPTS.expandParagraph.systemPrompt, {
          ratio: String(fields.ratio ?? 2),
        }),
        user: `待扩写段落：\n${text}`,
      };
    case 'translate':
      return {
        system: fill(PROMPTS.translateAcademic.systemPrompt, {
          direction: resolveDirection(text, fields.direction ?? 'auto'),
        }),
        user: `待翻译文本：\n${text}`,
      };
    case 'outline':
      return {
        system: fill(PROMPTS.generateOutline.systemPrompt, {
          writingType: fields.writingType ?? '',
          topic: fields.topic ?? '',
          requirements: fields.requirements?.trim() || '无',
        }),
        user: '请开始生成大纲。',
      };
    case 'references':
      return {
        system: fill(PROMPTS.formatReferences.systemPrompt, {
          format: fields.format ?? '',
          references: fields.references ?? '',
        }),
        user: '请开始转换。',
      };
  }
}
