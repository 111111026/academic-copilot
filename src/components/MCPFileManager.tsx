'use client';

import { useState } from 'react';
import { Button, Modal, List, Tag, message, Spin, Alert, Select } from 'antd';
import { FolderOpenOutlined, ExportOutlined, ImportOutlined } from '@ant-design/icons';
import { callTool } from '@/lib/mcp-client';
import { buildPaperFromPdf } from '@/lib/pdf';
import { savePaper } from '@/lib/db';
import { chat } from '@/lib/llm';
import { useSettings } from '@/lib/settings';
import { PROMPTS } from '@/config/prompts';
import type { Paper } from '@/types/paper';

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
  const [importing, setImporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'bibtex' | 'markdown'>('json');

  const llm = useSettings((s) => s.settings.llm);

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

    setImporting(true);
    setError('');
    let successCount = 0;
    let failCount = 0;

    try {
      for (const pdfFile of pdfFiles) {
        try {
          // 读取 PDF 文件内容（base64）
          const readRes = await callTool('filesystem', 'read_file', { path: pdfFile.path });
          const base64Content = readRes.content?.[0]?.text;

          if (!base64Content) {
            failCount++;
            continue;
          }

          // 将 base64 转换为 File 对象
          const binaryString = atob(base64Content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const file = new File([bytes], pdfFile.name, { type: 'application/pdf' });

          // 构建文献对象
          const paper = await buildPaperFromPdf({ file });

          // 尝试用 LLM 提取元数据
          if (llm.apiKey && paper.fullText) {
            try {
              const reply = await chat(llm, {
                messages: [
                  { role: 'system', content: PROMPTS.extractTitle.systemPrompt },
                  { role: 'user', content: paper.fullText.slice(0, 3000) },
                ],
                temperature: 0,
                maxTokens: 300,
              });
              const cleaned = reply.trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
              const json = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned);
              paper.title = typeof json.title === 'string' && json.title.trim() ? json.title.trim() : paper.title;
              paper.authors = Array.isArray(json.authors)
                ? json.authors.filter((a: unknown): a is string => typeof a === 'string' && a.trim() !== '')
                : paper.authors;
              paper.year = typeof json.year === 'number' && Number.isFinite(json.year) ? json.year : paper.year;
            } catch {
              // LLM 提取失败，保留文件名
            }
          }

          // 保存到数据库
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
    // 从数据库获取所有文献
    const { db } = await import('@/lib/db');
    const papers = await db.papers.toArray();

    if (papers.length === 0) {
      message.warning('没有文献可导出');
      return;
    }

    setLoading(true);
    try {
      let content: string;
      let filename: string;

      switch (exportFormat) {
        case 'bibtex':
          content = papers.map(paperToBibTeX).join('\n\n');
          filename = 'papers.bib';
          break;
        case 'markdown':
          content = papers.map(paperToMarkdown).join('\n\n---\n\n');
          filename = 'papers.md';
          break;
        default:
          content = JSON.stringify({ exportDate: new Date().toISOString(), papers }, null, 2);
          filename = 'papers.json';
      }

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

// ===== 导出格式转换 =====

function paperToBibTeX(paper: Paper): string {
  const key = (paper.authors[0]?.split(' ')[0] || 'unknown') + (paper.year || '') + (paper.title?.split(' ')[0] || '');
  return `@article{${key},
  title={${paper.title || 'Untitled'}},
  author={${paper.authors.join(' and ')}},
  year={${paper.year || 'unknown'}},
  abstract={${paper.abstract || ''}}
}`;
}

function paperToMarkdown(paper: Paper): string {
  return `# ${paper.title || 'Untitled'}

**作者**: ${paper.authors.join(', ') || '未知'}
**年份**: ${paper.year || '未知'}
**来源**: ${paper.source}

## 摘要

${paper.abstract || '无摘要'}

## 全文

${paper.fullText?.slice(0, 500) || '无内容'}...
`;
}
