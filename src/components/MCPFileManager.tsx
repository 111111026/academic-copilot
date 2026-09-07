'use client';

import { useState } from 'react';
import { Button, Modal, List, Tag, message, Spin, Alert } from 'antd';
import { FolderOpenOutlined, ExportOutlined } from '@ant-design/icons';
import { callTool } from '@/lib/mcp-client';

interface MCPFile {
  name: string;
  type: 'file' | 'dir';
  path: string;
}

export default function MCPFileManager() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<MCPFile[]>([]);
  const [currentPath, setCurrentPath] = useState('.');
  const [error, setError] = useState('');

  const loadDir = async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await callTool('filesystem', 'list_dir', { path });
      const text = res.content?.[0]?.text || '';
      const items: MCPFile[] = text.split('\n').filter(Boolean).map((line) => {
        const [name, type] = line.split(' ');
        return {
          name,
          type: type === '[dir]' ? 'dir' : 'file',
          path: path === '.' ? name : `${path}/${name}`,
        };
      });
      setFiles(items);
      setCurrentPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const importPdfs = async () => {
    const pdfFiles = files.filter((f) => f.type === 'file' && f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      message.warning('当前目录没有 PDF 文件');
      return;
    }

    // 这里只是演示，实际导入需要调用文献工作台的 processFile 逻辑
    message.info(`找到 ${pdfFiles.length} 个 PDF 文件，实际导入需要集成到文献工作台`);
    console.log('PDF files to import:', pdfFiles);
  };

  const exportNotes = async () => {
    // 示例：导出文献笔记到本地文件
    const notes = JSON.stringify({ exportDate: new Date().toISOString(), papers: [] }, null, 2);
    try {
      await callTool('filesystem', 'write_file', {
        path: 'exported-notes.json',
        content: notes,
      });
      message.success('笔记已导出到 exported-notes.json');
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <Button icon={<FolderOpenOutlined />} onClick={() => { setOpen(true); loadDir('.'); }}>
        MCP 文件管理
      </Button>

      <Modal
        title="MCP 文件管理器"
        open={open}
        onCancel={() => setOpen(false)}
        width={700}
        footer={[
          <Button key="export" icon={<ExportOutlined />} onClick={exportNotes}>
            导出笔记
          </Button>,
          <Button key="import" type="primary" onClick={importPdfs}>
            导入 PDF
          </Button>,
        ]}
      >
        <Alert
          message={`当前路径：${currentPath}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : (
          <List
            dataSource={files}
            style={{ maxHeight: 400, overflow: 'auto' }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  item.type === 'dir' ? (
                    <Button key="open" size="small" onClick={() => loadDir(item.path)}>
                      打开
                    </Button>
                  ) : null,
                ]}
              >
                <List.Item.Meta
                  title={
                    <span>
                      {item.name}
                      <Tag style={{ marginLeft: 8 }} color={item.type === 'dir' ? 'blue' : 'default'}>
                        {item.type === 'dir' ? '目录' : '文件'}
                      </Tag>
                    </span>
                  }
                  description={item.path}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </>
  );
}
