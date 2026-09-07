'use client';

import { useState } from 'react';
import { Button, Modal, List, Tag, message, Spin, Alert, Select } from 'antd';
import { FolderOpenOutlined, ExportOutlined, ImportOutlined } from '@ant-design/icons';
import { callTool, parseMcpListDir, type MCPFile } from '@/lib/mcp-client';
import { base64ToFile, buildPaperFromPdf } from '@/lib/pdf';
import { getAllPapers, savePaper } from '@/lib/db';
import { enrichMetadata } from '@/lib/enrich';
import { formatPapers, exportFilename, type ExportFormat } from '@/lib/export';
import { useSettings } from '@/lib/settings';

export default function MCPFileManager() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<MCPFile[]>([]);
  const [currentPath, setCurrentPath] = useState('.');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('json');

  const llm = useSettings((s) => s.settings.llm);

  const loadDir = async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await callTool('filesystem', 'list_dir', { path });
      const text = res.content?.[0]?.text || '';
      setFiles(parseMcpListDir(text, path));
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

    setImporting(true);
    setError('');
    let successCount = 0;
    let failCount = 0;

    try {
      for (const pdfFile of pdfFiles) {
        try {
          const readRes = await callTool('filesystem', 'read_file', { path: pdfFile.path });
          const base64Content = readRes.content?.[0]?.text;
          if (!base64Content) {
            failCount++;
            continue;
          }

          const file = base64ToFile(base64Content, pdfFile.name);
          const paper = await enrichMetadata(await buildPaperFromPdf({ file }), llm);
          await savePaper(paper);
          successCount++;
        } catch (err) {
          console.error(`导入 ${pdfFile.name} 失败:`, err);
          failCount++;
        }
      }

      message.success(`导入完成：成功 ${successCount} 篇，失败 ${failCount} 篇`);
      if (failCount > 0) {
        setError(`${failCount} 个文件导入失败，可能是扫描版 PDF 或文件损坏`);
      }
    } finally {
      setImporting(false);
    }
  };

  const exportPapers = async () => {
    const papers = await getAllPapers();
    if (papers.length === 0) {
      message.warning('没有文献可导出');
      return;
    }

    setLoading(true);
    try {
      const content = formatPapers(papers, exportFormat);
      const filename = exportFilename(exportFormat);
      await callTool('filesystem', 'write_file', { path: filename, content });
      message.success(`已导出 ${papers.length} 篇文献到 ${filename}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
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
          <div key="actions" style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>导出格式:</span>
              <Select
                value={exportFormat}
                onChange={setExportFormat}
                options={[
                  { value: 'json', label: 'JSON' },
                  { value: 'bibtex', label: 'BibTeX' },
                  { value: 'markdown', label: 'Markdown' },
                ]}
                style={{ width: 120 }}
              />
              <Button icon={<ExportOutlined />} onClick={exportPapers} loading={loading}>
                导出文献
              </Button>
            </div>
            <Button type="primary" icon={<ImportOutlined />} onClick={importPdfs} loading={importing}>
              导入 PDF ({files.filter((f) => f.type === 'file' && f.name.toLowerCase().endsWith('.pdf')).length})
            </Button>
          </div>,
        ]}
      >
        <Alert
          message={`当前路径：${currentPath}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {error && <Alert type="error" message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} />}

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
                  ) : item.name.toLowerCase().endsWith('.pdf') ? (
                    <Tag color="red">PDF</Tag>
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
