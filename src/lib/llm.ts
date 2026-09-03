import type { ChatMessage, Settings } from '@/types';

export class LlmError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'LlmError';
  }
}

interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
}

async function readSseStream(
  response: Response,
  onDelta?: (text: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new LlmError('响应中没有可读流');
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return full;
      try {
        const json = JSON.parse(payload);
        const delta: string = json.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          onDelta?.(delta);
        }
      } catch {
        // 忽略无法解析的 SSE 行
      }
    }
  }
  return full;
}

export async function chat(llm: Settings['llm'], options: ChatOptions): Promise<string> {
  if (!llm.apiKey) {
    throw new LlmError('尚未配置 API Key，请先到「设置」页填写');
  }
  const url = `${llm.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = JSON.stringify({
    model: llm.model,
    messages: options.messages,
    temperature: options.temperature ?? llm.temperature,
    max_tokens: options.maxTokens ?? llm.maxTokens,
    stream: true,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body,
      signal: options.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new LlmError(`网络请求失败：${(e as Error).message}。请检查网络或 baseUrl 是否正确`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new LlmError(`API 返回 ${response.status}：${text.slice(0, 300)}`, response.status);
  }

  return readSseStream(response, options.onDelta);
}
