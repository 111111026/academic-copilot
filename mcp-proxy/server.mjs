/**
 * MCP 代理服务器
 * 浏览器 → HTTP/SSE → 本代理 → MCP 执行型服务 (内置/stdio)
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.MCP_PROXY_PORT || 4500);
const ROOT_DIR = process.cwd();

// ===== 内置 MCP 服务 =====
const builtinFilesystem = {
  tools: {
    read_file: {
      name: 'read_file',
      description: '读取文件内容',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（相对于项目根目录）' },
        },
        required: ['path'],
      },
    },
    list_dir: {
      name: 'list_dir',
      description: '列出目录内容',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径（相对于项目根目录）' },
        },
        required: ['path'],
      },
    },
    write_file: {
      name: 'write_file',
      description: '写入文件内容',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（相对于项目根目录）' },
          content: { type: 'string', description: '文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  async handleTool(name, args) {
    const fullPath = join(ROOT_DIR, args.path);
    switch (name) {
      case 'read_file': {
        const content = readFileSync(fullPath, 'utf-8');
        return { content: [{ type: 'text', text: content }] };
      }
      case 'list_dir': {
        const items = readdirSync(fullPath);
        const details = items.map((item) => {
          const stat = statSync(join(fullPath, item));
          return `${item} ${stat.isDirectory() ? '[dir]' : '[file]'}`;
        });
        return { content: [{ type: 'text', text: details.join('\n') }] };
      }
      case 'write_file': {
        writeFileSync(fullPath, args.content, 'utf-8');
        return { content: [{ type: 'text', text: `文件已写入：${args.path}` }] };
      }
      default:
        throw new Error(`未知 tool: ${name}`);
    }
  },
};

// ===== MCP 会话管理 =====
class MCPSession {
  constructor(name, type, impl) {
    this.name = name;
    this.type = type; // 'builtin' | 'stdio'
    this.impl = impl;
    this.process = null;
    this.rl = null;
    this.messageId = 0;
    this.pending = new Map();
    this.ready = true; // 内置服务直接就绪
  }

  async start() {
    if (this.type === 'stdio') {
      return new Promise((resolve, reject) => {
        this.process = spawn(this.impl.command, this.impl.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.rl = createInterface({ input: this.process.stdout });

        this.process.on('error', (err) => reject(new Error(`MCP 服务 ${this.name} 启动失败：${err.message}`)));
        this.process.on('exit', (code) => { if (code !== 0) this.ready = false; });

        this.rl.on('line', (line) => {
          try {
            const msg = JSON.parse(line);
            if (msg.id && this.pending.has(msg.id)) {
              const { resolve, reject } = this.pending.get(msg.id);
              this.pending.delete(msg.id);
              if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
              else resolve(msg.result);
            }
          } catch (err) { console.error(`解析 ${this.name} 响应失败：`, err.message); }
        });

        this.send('initialize', { protocolVersion: '2024-11-05', capabilities: {} })
          .then(() => { this.ready = true; resolve(); })
          .catch(reject);
      });
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const msg = { jsonrpc: '2.0', id, method, params };
      this.pending.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify(msg) + '\n');
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`MCP 请求超时：${method}`)); } }, 30000);
    });
  }

  async callTool(name, args = {}) {
    if (this.type === 'builtin') {
      return this.impl.handleTool(name, args);
    }
    return this.send('tools/call', { name, arguments: args });
  }

  listTools() {
    if (this.type === 'builtin') {
      return Object.values(this.impl.tools);
    }
    return this.send('tools/list', {});
  }

  stop() {
    if (this.process && !this.process.killed) this.process.kill();
  }
}

// ===== 初始化 MCP 服务 =====
const sessions = new Map();

async function initMCPServers() {
  // 内置文件系统服务
  const fsSession = new MCPSession('filesystem', 'builtin', builtinFilesystem);
  sessions.set('filesystem', fsSession);
  console.log('✓ MCP 服务 [filesystem] 已就绪（内置）');

  // 示例：外部 stdio 服务
  // const dbSession = new MCPSession('database', 'stdio', {
  //   command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite', './data.db'],
  // });
  // await dbSession.start();
  // sessions.set('database', dbSession);
  // console.log('✓ MCP 服务 [database] 已连接');
}

// ===== HTTP 路由 =====
const routes = {
  'GET /api/mcp/servers': async () => {
    const servers = [];
    for (const [name, session] of sessions) {
      servers.push({ name, ready: session.ready });
    }
    return { servers };
  },

  'POST /api/mcp/tools': async (body) => {
    const { server } = body;
    const session = sessions.get(server);
    if (!session || !session.ready) throw new Error(`MCP 服务 ${server} 未就绪`);
    const tools = await session.listTools();
    return { tools };
  },

  'POST /api/mcp/call': async (body) => {
    const { server, tool, arguments: args } = body;
    const session = sessions.get(server);
    if (!session || !session.ready) throw new Error(`MCP 服务 ${server} 未就绪`);
    return session.callTool(tool, args);
  },
};

// ===== HTTP 服务器 =====
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;
  const route = routes[key];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (!route) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not Found' })); return; }

  try {
    let body = null;
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    }
    const result = await route(body, res);
    if (result && !res.writableEnded) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)); }
  } catch (err) {
    if (!res.writableEnded) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: err.message })); }
  }
});

// ===== 启动 =====
server.listen(PORT, async () => {
  console.log(`MCP 代理服务器启动：http://localhost:${PORT}`);
  await initMCPServers();
});

process.on('SIGINT', () => { console.log('\n正在关闭 MCP 服务...'); for (const s of sessions.values()) s.stop(); process.exit(0); });
