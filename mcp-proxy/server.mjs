/**
 * MCP 代理服务器
 * 浏览器 → HTTP/SSE → 本代理 → MCP 执行型服务 (stdio/socket)
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const PORT = Number(process.env.MCP_PROXY_PORT || 4500);

// ===== MCP 服务配置 =====
const MCP_SERVERS = {
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
  },
  // 示例：添加更多 MCP 服务
  // database: {
  //   command: 'npx',
  //   args: ['-y', '@modelcontextprotocol/server-sqlite', './data.db'],
  // },
};

// ===== 活跃连接管理 =====
const activeConnections = new Map();

// ===== MCP 会话管理 =====
class MCPSession {
  constructor(name, config) {
    this.name = name;
    this.process = null;
    this.rl = null;
    this.messageId = 0;
    this.pending = new Map();
    this.ready = false;
    this.config = config;
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.process = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.rl = createInterface({ input: this.process.stdout });

      this.process.on('error', (err) => {
        reject(new Error(`MCP 服务 ${this.name} 启动失败：${err.message}`));
      });

      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`MCP 服务 ${this.name} 异常退出，code=${code}`);
        }
        this.ready = false;
      });

      this.rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) {
              reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
              resolve(msg.result);
            }
          }
        } catch (err) {
          console.error(`解析 ${this.name} 响应失败：`, err.message);
        }
      });

      // 发送 initialize 请求
      this.send('initialize', { protocolVersion: '2024-11-05', capabilities: {} })
        .then(() => {
          this.ready = true;
          resolve();
        })
        .catch(reject);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const msg = { jsonrpc: '2.0', id, method, params };
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify(msg) + '\n');

      // 超时保护
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP 请求超时：${method}`));
        }
      }, 30000);
    });
  }

  async callTool(name, args = {}) {
    return this.send('tools/call', { name, arguments: args });
  }

  stop() {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
  }
}

// ===== 初始化 MCP 服务 =====
const sessions = new Map();

async function initMCPServers() {
  for (const [name, config] of Object.entries(MCP_SERVERS)) {
    try {
      const session = new MCPSession(name, config);
      await session.start();
      sessions.set(name, session);
      console.log(`✓ MCP 服务 [${name}] 已连接`);
    } catch (err) {
      console.error(`✗ MCP 服务 [${name}] 启动失败：`, err.message);
    }
  }
}

// ===== HTTP 路由 =====
const routes = {
  // 列出可用的 MCP 服务
  'GET /api/mcp/servers': async () => {
    const servers = [];
    for (const [name, session] of sessions) {
      servers.push({
        name,
        ready: session.ready,
      });
    }
    return { servers };
  },

  // 列出 MCP 服务的 tools
  'POST /api/mcp/tools': async (body) => {
    const { server, method } = body;
    const session = sessions.get(server);
    if (!session || !session.ready) {
      throw new Error(`MCP 服务 ${server} 未就绪`);
    }
    const result = await session.send(method || 'tools/list', {});
    return result;
  },

  // 调用 MCP tool
  'POST /api/mcp/call': async (body) => {
    const { server, tool, arguments: args } = body;
    const session = sessions.get(server);
    if (!session || !session.ready) {
      throw new Error(`MCP 服务 ${server} 未就绪`);
    }
    const result = await session.callTool(tool, args);
    return result;
  },

  // LLM 代理（转发到配置的 LLM 服务商）
  'POST /api/llm/chat': async (body) => {
    const { messages, model, baseUrl, apiKey } = body;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM 请求失败 (${res.status}): ${text}`);
    }
    return res.json();
  },

  // SSE 流式 LLM
  'POST /api/llm/stream': async (body, res) => {
    const { messages, model, baseUrl, apiKey } = body;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(`data: ${chunk}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      res.write(`data: {"error":"${err.message}"}\n\n`);
      res.end();
    }
  },
};

// ===== HTTP 服务器 =====
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;
  const route = routes[key];

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!route) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  try {
    let body = null;
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    }

    const result = await route(body, res);
    if (result && !res.writableEnded) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    }
  } catch (err) {
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
});

// ===== 启动 =====
server.listen(PORT, async () => {
  console.log(`MCP 代理服务器启动：http://localhost:${PORT}`);
  await initMCPServers();
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n正在关闭 MCP 服务...');
  for (const session of sessions.values()) session.stop();
  process.exit(0);
});
