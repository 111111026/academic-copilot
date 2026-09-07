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
import AppShell from '@/components/AppShell';
import MCPFileManager from '@/components/MCPFileManager';
import { deletePaper, savePaper, usePapersByDate } from '@/lib/db';
import { buildPaperFromPdf } from '@/lib/pdf';
import { enrichMetadata } from '@/lib/enrich';
import { useSettings } from '@/lib/settings';
import type { Paper } from '@/types/paper';

export default function WorkspacePage() {
  const papers = usePapersByDate();
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

  const processFile = async (file: File) => {
    setPending((n) => n + 1);
    try {
      const paper = await enrichMetadata(await buildPaperFromPdf({ file }), llm);
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

      <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
        <Input.Search
          placeholder="按标题或作者搜索..."
          allowClear
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <MCPFileManager />
      </div>

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
