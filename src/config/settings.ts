import type { Settings } from '@/types/settings';

export const PROVIDER_PRESETS: Record<
  string,
  { label: string; baseUrl: string; defaultModel: string }
> = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  moonshot: { label: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k' },
  custom: { label: '自定义（OpenAI 兼容）', baseUrl: '', defaultModel: '' },
};

export const DEFAULT_SETTINGS: Settings = {
  llm: {
    provider: 'deepseek',
    baseUrl: PROVIDER_PRESETS.deepseek.baseUrl,
    apiKey: '',
    model: PROVIDER_PRESETS.deepseek.defaultModel,
    temperature: 0.7,
    maxTokens: 4096,
  },
  ui: { theme: 'light', language: 'zh' },
};
