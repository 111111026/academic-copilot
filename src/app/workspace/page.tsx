'use client';

import { useMemo, useState } from 'react';
import {
  Table,
  Typography,
  Upload,
  Button,
  Popconfirm,
  message,
  Tooltip,
  Tag,
  Input,
  Space,
  Alert,
} from 'antd';
import { InboxOutlined, DeleteOutlined, ReadOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import AppShell from '@/components/AppShell';
import { db, deletePaper, savePaper } from '@/lib/db';
import { buildPaperFromPdf } from '@/lib/pdf';
import { chat } from '@/lib/llm';
import { useSettings } from '@/lib/settings';
import { PROMPTS } from '@/config/prompts';
import type { Paper } from '@/types/paper';

export default function WorkspacePage() {
  const papers = useLiveQuery(() => db.papers.orderBy('addedAt').reverse().toArray(), [], [] as Paper[]);
  const llm = useSettings((s) => s.settings.llm);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [messageApi, contextHolder] = message.useMessage();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return papers;
    return papers.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.authors.some((a) => a.toLowerCase().includes(q)),
    );
  }, [papers, search]);

  // 尽力提取题录；未配置 Key 或模型返回异常时保留文件名兜底，不阻断导入
  const enrichMetadata = async (paper: Paper): Promise<Paper> => {
    if (!llm.apiKey || !paper.fullText) return paper;
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
      return {
        ...paper,
        title: typeof json.title === 'string' && json.title.trim() ? json.title.trim() : paper.title,
        authors: Array.isArray(json.authors)
          ? json.authors.filter((a: unknown): a is string => typeof a === 'string' && a.trim() !== '')
          : paper.authors,
        year: typeof json.year === 'number' && Number.isFinite(json.year) ? json.year : paper.year,
      };
    } catch {
      return paper;
    }
  };

  const processFile = async (file: File) => {
    setPending((n) => n + 1);
    try {
      const paper = await enrichMetadata(await buildPaperFromPdf({ file }));
      await savePaper(paper);
      messageApi.success(`已导入「${paper.title.slice(0, 40)}」`);
    } catch (e) {
      setError((prev) => (prev ? prev + '；' : '') + (e as Error).message);
    } finally {
      setPending((n) => n - 1);
    }
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: Paper) => (
        <Link href={`/workspace/paper?id=${record.id}`}>{title}</Link>
      ),
    },
    {
      title: '作者',
      dataIndex: 'authors',
      key: 'authors',
      width: 220,
      render: (authors: string[]) =>
        authors.length ? authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' 等' : '') : '—',
    },
    { title: '年份', dataIndex: 'year', key: 'year', width: 80, render: (y: number | null) => y ?? '—' },
    {
      title: '页数',
      dataIndex: 'pageCount',
      key: 'pageCount',
      width: 80,
      render: (n?: number) => n ?? '—',
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 90,
      render: (s: Paper['source']) =>
        s === 'upload' ? <Tag>PDF 上传</Tag> : <Tag color="blue">{s}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: Paper) => (
        <Space>
          <Tooltip title="阅读">
            <Link href={`/workspace/paper?id=${record.id}`}>
              <Button size="small" icon={<ReadOutlined />} />
            </Link>
          </Tooltip>
          <Popconfirm
            title="确定删除这篇文献？"
            onConfirm={async () => {
              await deletePaper(record.id);
              messageApi.success('已删除');
            }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <AppShell>
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 16 }}>
        文献阅读工作台
      </Typography.Title>

      <Upload.Dragger
        multiple
        accept=".pdf"
        showUploadList={false}
        disabled={pending > 0}
        beforeUpload={(file) => {
          if (!file.name.toLowerCase().endsWith('.pdf')) {
            messageApi.error(`「${file.name}」不是 PDF，已跳过`);
            return Upload.LIST_IGNORE;
          }
          void processFile(file);
          return Upload.LIST_IGNORE;
        }}
        style={{ marginBottom: 16 }}
      >
        <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">
          {pending > 0 ? `正在解析 ${pending} 个文件…` : '点击或拖拽 PDF 到此处'}
        </p>
        <p className="ant-upload-hint" style={{ fontSize: 12 }}>
          支持单篇或批量上传；全文仅在本机浏览器内解析，不会上传到任何服务器
        </p>
      </Upload.Dragger>

      {error && <Alert type="error" showIcon closable title={error} style={{ marginBottom: 16 }} />}

      <Input.Search
        placeholder="按标题或作者搜索..."
        allowClear
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 360, marginBottom: 16 }}
      />

      <Table<Paper>
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        loading={!papers}
        pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 篇` }}
      />
    </AppShell>
  );
}
