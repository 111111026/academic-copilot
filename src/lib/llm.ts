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

/** fetch 抛错（而非返回非 2xx）时，浏览器只会给一句 Failed to fetch，
 *  真正的原因几乎总是这两个之一，而用户在控制台里看不出来是哪个。 */
const NETWORK_HINT =
  '常见原因有两个：baseUrl 填写有误（多数服务商需要以 /v1 结尾），' +
  '或该服务商不允许浏览器跨域直连（请求被 CORS 拦下）。';

function describeHttpError(status: number, body: string, model: string): string {
  const detail = body.trim() ? `\n服务商返回：${body.trim().slice(0, 300)}` : '';
  switch (status) {
    case 401:
    case 403:
      return `API Key 无效或无权调用（HTTP ${status}）。请到「设置」页确认 Key 是否填错、已过期或被停用。${detail}`;
    case 402:
      return `账户余额或额度不足（HTTP 402），请充值后再试。${detail}`;
    case 404:
      return `接口或模型不存在（HTTP 404）。请检查 baseUrl 是否完整，以及模型名「${model}」在该服务商是否可用。${detail}`;
    case 429:
      return `请求被限流（HTTP 429），触发了频率或并发限制，稍等片刻再试。${detail}`;
    default:
      return `API 返回 HTTP ${status}。${detail}`;
  }
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
    throw new LlmError(`无法连接到 ${url}：${(e as Error).message}\n${NETWORK_HINT}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new LlmError(describeHttpError(response.status, text, llm.model), response.status);
  }

  return readSseStream(response, options.onDelta);
}
