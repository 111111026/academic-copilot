import { PROMPTS } from '@/config/prompts';
import { fill } from '@/lib/prompt';
import type { PromptRequest } from '@/lib/prompt';

export type MentorMode = 'email' | 'report' | 'defense';

export const MENTOR_TEMPERATURE: Record<MentorMode, number> = {
  email: 0.5,
  report: 0.6,
  defense: 0.7,
};

export interface MentorFields {
  recipient?: string;
  purpose?: string;
  points?: string;
  tone?: string;
  progress?: string;
  duration?: string;
  audience?: string;
  role?: string;
  count?: number;
  content?: string;
}

/**
 * 三种模式的槽位都在方案的 systemPrompt 内，user 消息只作触发。
 * 收件人留空时兜底成「导师」，否则 prompt 里会出现「收件人：」这样的空标签，
 * 模型往往会自行编一个称呼出来。
 */
export function buildMentorRequest(mode: MentorMode, fields: MentorFields): PromptRequest {
  switch (mode) {
    case 'email':
      return {
        system: fill(PROMPTS.generateEmail.systemPrompt, {
          recipient: fields.recipient?.trim() || '导师',
          purpose: fields.purpose ?? '',
          points: fields.points ?? '',
          tone: fields.tone ?? '',
        }),
        user: '请开始撰写。',
      };
    case 'report':
      return {
        system: fill(PROMPTS.generateReportOutline.systemPrompt, {
          progress: fields.progress ?? '',
          duration: fields.duration ?? '',
          audience: fields.audience ?? '',
        }),
        user: '请开始生成大纲。',
      };
    case 'defense':
      return {
        system: fill(PROMPTS.mockDefense.systemPrompt, {
          role: fields.role ?? '',
          count: String(fields.count ?? 8),
          content: fields.content ?? '',
        }),
        user: '请开始提问。',
      };
  }
}
