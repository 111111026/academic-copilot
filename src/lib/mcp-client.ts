/**
 * MCP 客户端 - 浏览器端调用代理 API
 */

const PROXY_BASE = process.env.NEXT_PUBLIC_MCP_PROXY_URL || 'http://localhost:4500';

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPServer {
  name: string;
  ready: boolean;
}

export interface MCPToolResult {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/** 列出可用的 MCP 服务 */
export async function listServers(): Promise<MCPServer[]> {
  const res = await fetch(`${PROXY_BASE}/api/mcp/servers`);
  if (!res.ok) throw new Error(`获取 MCP 服务列表失败：${res.status}`);
  const data = await res.json();
  return data.servers;
}

/** 列出指定 MCP 服务的 tools */
export async function listTools(server: string): Promise<MCPTool[]> {
  const res = await fetch(`${PROXY_BASE}/api/mcp/tools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ server, method: 'tools/list' }),
  });
  if (!res.ok) throw new Error(`获取 tools 失败：${res.status}`);
  const data = await res.json();
  return data.tools || [];
}

/** 调用 MCP tool */
export async function callTool(
  server: string,
  tool: string,
  args: Record<string, unknown> = {},
): Promise<MCPToolResult> {
  const res = await fetch(`${PROXY_BASE}/api/mcp/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ server, tool, arguments: args }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `调用 ${tool} 失败`);
  }
  return res.json();
}

/** LLM 对话（非流式） */
export async function llmChat(
  messages: Array<{ role: string; content: string }>,
  config: { model: string; baseUrl: string; apiKey: string },
): Promise<{ choices: Array<{ message: { content: string } }> }> {
  const res = await fetch(`${PROXY_BASE}/api/llm/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, messages }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM 请求失败：${text}`);
  }
  return res.json();
}

/** LLM 流式对话（SSE） */
export async function llmStream(
  messages: Array<{ role: string; content: string }>,
  config: { model: string; baseUrl: string; apiKey: string },
  onChunk: (text: string) => void,
): Promise<void> {
  const res = await fetch(`${PROXY_BASE}/api/llm/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...config, messages }),
  });
  if (!res.ok) throw new Error(`LLM 流式请求失败：${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('响应体为空');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          const text = json.choices?.[0]?.delta?.content || '';
          if (text) onChunk(text);
        } catch {
          // 忽略解析错误
        }
      }
    }
  }
}
