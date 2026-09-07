'use client';

import { useEffect, useState } from 'react';
import { Card, List, Button, message, Spin, Alert } from 'antd';
import { listServers, listTools, callTool } from '@/lib/mcp-client';

export default function MCPTestPage() {
  const [servers, setServers] = useState<Array<{ name: string; ready: boolean }>>([]);
  const [tools, setTools] = useState<Array<{ name: string; description?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');

  useEffect(() => {
    loadServers();
  }, []);

  async function loadServers() {
    try {
      const data = await listServers();
      setServers(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`加载 MCP 服务失败：${msg}`);
    }
  }

  async function loadTools(server: string) {
    setLoading(true);
    try {
      const data = await listTools(server);
      setTools(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`获取 tools 失败：${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function testTool(server: string, tool: string) {
    setLoading(true);
    setResult('');
    try {
      const res = await callTool(server, tool, { path: process.cwd() });
      setResult(JSON.stringify(res, null, 2));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult(`错误：${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>MCP 服务测试</h1>

      <Card title="可用 MCP 服务" style={{ marginBottom: 16 }}>
        <List
          dataSource={servers}
          renderItem={(s) => (
            <List.Item
              actions={[
                <Button key="tools" onClick={() => loadTools(s.name)} loading={loading}>
                  查看 Tools
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={s.name}
                description={s.ready ? '✓ 已连接' : '✗ 未就绪'}
              />
            </List.Item>
          )}
        />
      </Card>

      <Card title="Tools 列表" style={{ marginBottom: 16 }}>
        {loading ? (
          <Spin />
        ) : (
          <List
            dataSource={tools}
            renderItem={(t) => (
              <List.Item
                actions={[
                  <Button key="test" size="small" onClick={() => testTool('filesystem', t.name)}>
                    测试
                  </Button>,
                ]}
              >
                <List.Item.Meta title={t.name} description={t.description} />
              </List.Item>
            )}
          />
        )}
      </Card>

      {result && (
        <Card title="执行结果">
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{result}</pre>
        </Card>
      )}

      <Alert
        message="提示"
        description="此页面用于测试 MCP 代理连接。确保已运行 start.bat 启动 MCP 代理服务。"
        type="info"
        showIcon
        style={{ marginTop: 16 }}
      />
    </div>
  );
}
