/**
 * 内置 MCP 服务 - 文件系统操作
 * 用于测试 MCP 代理链路，无需额外安装
 */

export function createFilesystemMCP(rootDir: string) {
  const tools = {
    'read_file': {
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
    'list_dir': {
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
    'write_file': {
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
  };

  async function handleTool(name: string, args: Record<string, unknown>) {
    const { readFileSync, writeFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');

    const fullPath = join(rootDir, args.path as string);

    switch (name) {
      case 'read_file': {
        const content = readFileSync(fullPath, 'utf-8');
        return {
          content: [{ type: 'text', text: content }],
        };
      }
      case 'list_dir': {
        const items = readdirSync(fullPath);
        const details = items.map((item) => {
          const stat = statSync(join(fullPath, item));
          return `${item} ${stat.isDirectory() ? '[dir]' : '[file]'}`;
        });
        return {
          content: [{ type: 'text', text: details.join('\n') }],
        };
      }
      case 'write_file': {
        writeFileSync(fullPath, args.content as string, 'utf-8');
        return {
          content: [{ type: 'text', text: `文件已写入：${args.path}` }],
        };
      }
      default:
        throw new Error(`未知 tool: ${name}`);
    }
  }

  return { tools, handleTool };
}
