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

export interface MCPFile {
  name: string;
  type: 'file' | 'dir';
  path: string;
}

export function parseMcpListDir(text: string, basePath: string): MCPFile[] {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, type] = line.split(' ');
      return {
        name,
        type: type === '[dir]' ? 'dir' : 'file',
        path: basePath === '.' ? name : `${basePath}/${name}`,
      };
    });
}
