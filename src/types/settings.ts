export type LlmProvider = 'openai' | 'deepseek' | 'moonshot' | 'custom';

export interface Settings {
  llm: {
    provider: LlmProvider;
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  ui: {
    theme: 'light' | 'dark';
    language: 'zh' | 'en';
  };
}
