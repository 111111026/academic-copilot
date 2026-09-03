'use client';

import { useMemo, useState } from 'react';
import type { Key } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  List,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  DownloadOutlined,
  HistoryOutlined,
  SwapOutlined,
  TableOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import Markdown from 'react-markdown';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import AppShell from '@/components/AppShell';
import { db, deleteComparison, saveComparison } from '@/lib/db';
import { chat } from '@/lib/llm';
import { useSettings } from '@/lib/settings';
import { PROMPTS } from '@/config/prompts';
import {
  BASIS_LABEL,
  MAX_COMPARE,
  MIN_COMPARE,
  buildCompareInput,
  buildMarkdownDocument,
  compareBasis,
  compareFilename,
  parseMarkdownTable,
  tableToCsv,
} from '@/lib/compare';
import { downloadTextFile } from '@/lib/download';
import type { Comparison, Paper } from '@/types';

type ResultRow = Record<string, string>;

export default function ComparePage() {
  const papersQuery = useLiveQuery(() => db.papers.orderBy('addedAt').reverse().toArray());
  const comparisonsQuery = useLiveQuery(() =>
    db.comparisons.orderBy('createdAt').reverse().toArray(),
  );
  const llm = useSettings((s) => s.settings.llm);

  const papers = useMemo(() => papersQuery ?? [], [papersQuery]);
  const comparisons = useMemo(() => comparisonsQuery ?? [], [comparisonsQuery]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [messageApi, contextHolder] = message.useMessage();

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return papers;
    return papers.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.authors.some((a) => a.toLowerCase().includes(q)),
    );
  }, [papers, keyword]);

  // 按排序后的 id 集合认记录，与勾选顺序无关，同一组文献只会存一条
  const selectionKey = useMemo(() => Array.from(selectedIds).sort().join('|'), [selectedIds]);
  const saved = useMemo(
    () => comparisons.find((c) => Array.from(c.paperIds).sort().join('|') === selectionKey),
    [comparisons, selectionKey],
  );
  const pinned = useMemo(
    () => comparisons.find((c) => c.id === pinnedId) ?? null,
    [comparisons, pinnedId],
  );

  const selectedPapers = useMemo(
    () => papers.filter((p) => selectedIds.includes(p.id)),
    [papers, selectedIds],
  );

  const result = draft ?? pinned?.result ?? saved?.result ?? '';
  // 流式输出期间表格还没闭合，先按 Markdown 渲染，结束后再切成结构化表格，避免中途闪烁
  const parsed = useMemo(
    () => (!generating && result ? parseMarkdownTable(result) : null),
    [generating, result],
  );

  const activeTitles = pinned?.titles ?? selectedPapers.map((p) => p.title);
  const activeCreatedAt = pinned?.createdAt ?? saved?.createdAt ?? Date.now();
  const weakCount = selectedPapers.filter((p) => compareBasis(p) === 'abstract').length;
  const canGenerate =
    selectedIds.length >= MIN_COMPARE && selectedIds.length <= MAX_COMPARE && !!llm.apiKey;

  const onSelectionChange = (keys: Key[]) => {
    setSelectedIds(keys as string[]);
    setPinnedId(null);
    setDraft(null);
  };

  const generate = async () => {
    if (!canGenerate || generating) return;
    setPinnedId(null);
    setGenerating(true);
    setError('');
    setDraft('');
    try {
      const text = await chat(llm, {
        messages: [
          { role: 'system', content: PROMPTS.comparePapers.systemPrompt },
          { role: 'user', content: buildCompareInput(selectedPapers) },
        ],
        temperature: 0.3,
        onDelta: (delta) => setDraft((prev) => (prev ?? '') + delta),
      });
      await saveComparison({
        id: saved?.id ?? uuidv4(),
        paperIds: selectedPapers.map((p) => p.id),
        titles: selectedPapers.map((p) => p.title),
        result: text,
        createdAt: Date.now(),
      });
      messageApi.success(`已对比 ${selectedPapers.length} 篇文献，结果已存到本地`);
    } catch (e) {
      setError((e as Error).message);
      setDraft(null);
    } finally {
      setGenerating(false);
    }
  };

  const openHistory = (record: Comparison) => {
    setPinnedId(record.id);
    setDraft(null);
    setSelectedIds(record.paperIds.filter((id) => papers.some((p) => p.id === id)));
  };

  const exportMarkdown = () => {
    downloadTextFile(
      compareFilename('md', activeCreatedAt),
      buildMarkdownDocument(result, activeTitles, activeCreatedAt),
      'text/markdown',
    );
    messageApi.success('已导出 Markdown');
  };

  const exportCsv = () => {
    if (!parsed) return;
    downloadTextFile(
      compareFilename('csv', activeCreatedAt),
      tableToCsv(parsed),
      'text/csv',
    );
    messageApi.success('已导出 CSV');
  };

  const pickerColumns = [
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
      width: 200,
      render: (authors: string[]) =>
        authors.length
          ? authors.slice(0, 2).join(', ') + (authors.length > 2 ? ' 等' : '')
          : '—',
    },
    {
      title: '年份',
      dataIndex: 'year',
      key: 'year',
      width: 72,
      render: (year: number | null) => year ?? '—',
    },
    {
      title: '对比依据',
      key: 'basis',
      width: 96,
      render: (_: unknown, record: Paper) => {
        const basis = compareBasis(record);
        const color =
          basis === 'summary' ? 'green' : basis === 'fulltext' ? 'cyan' : basis === 'abstract' ? 'orange' : 'red';
        return <Tag color={color}>{BASIS_LABEL[basis]}</Tag>;
      },
    },
  ];

  const resultColumns = parsed
    ? parsed.headers.map((header, i) => ({
        title: header || `维度 ${i + 1}`,
        dataIndex: String(i),
        key: String(i),
        width: i === 0 ? 200 : 260,
        fixed: i === 0 ? ('left' as const) : undefined,
        render: (value: string) => (value.trim() ? value : '—'),
      }))
    : [];

  const resultRows: ResultRow[] = parsed
    ? parsed.rows.map((cells, i) => {
        const row: ResultRow = { key: String(i) };
        cells.forEach((cell, j) => {
          row[String(j)] = cell;
        });
        return row;
      })
    : [];

  return (
    <AppShell>
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 8 }}>
        文献对比
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        从本地文献库勾选 {MIN_COMPARE}-{MAX_COMPARE} 篇，AI 按研究问题、方法、数据集、结论、创新点、局限六个维度生成对比表格。
      </Typography.Paragraph>

      {!llm.apiKey && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="尚未配置 API Key"
          description={
            <>
              文献对比需要调用大模型，请先到 <Link href="/settings">设置</Link> 填写你的 API Key。
            </>
          }
        />
      )}

      {papersQuery !== undefined && papers.length === 0 ? (
        <Empty description="本地文献库还是空的" style={{ padding: '48px 0' }}>
          <Space>
            <Link href="/workspace">
              <Button type="primary">上传 PDF</Button>
            </Link>
            <Link href="/search">
              <Button>去检索文献</Button>
            </Link>
          </Space>
        </Empty>
      ) : (
        <>
          <Card
            size="small"
            title={`选择文献（已选 ${selectedIds.length}/${MAX_COMPARE}）`}
            style={{ marginBottom: 16 }}
            extra={
              <Input.Search
                placeholder="按标题或作者筛选..."
                allowClear
                size="small"
                onChange={(e) => setKeyword(e.target.value)}
                style={{ width: 220 }}
              />
            }
          >
            <Table<Paper>
              rowKey="id"
              size="small"
              loading={papersQuery === undefined}
              columns={pickerColumns}
              dataSource={filtered}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: onSelectionChange,
                getCheckboxProps: (record) => ({
                  disabled:
                    compareBasis(record) === 'none' ||
                    (selectedIds.length >= MAX_COMPARE && !selectedIds.includes(record.id)),
                }),
              }}
              pagination={{ pageSize: 8, showTotal: (t) => `共 ${t} 篇` }}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              标为「无内容」的条目既没有全文也没有摘要，无法参与对比。「已总结」的文献对比质量最好。
            </Typography.Text>
          </Card>

          {weakCount > 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`所选文献中有 ${weakCount} 篇只有题录与摘要`}
              description="这些条目没有全文，对比只能基于摘要，方法与局限等维度可能标为「未提及」。"
            />
          )}

          <Card
            size="small"
            title={
              <Space>
                <SwapOutlined />
                对比结果
              </Space>
            }
            style={{ marginBottom: 16 }}
            extra={
              <Space>
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={generate}
                  loading={generating}
                  disabled={!canGenerate}
                >
                  {result ? '重新生成' : '生成对比'}
                </Button>
                <Button
                  icon={<TableOutlined />}
                  onClick={exportCsv}
                  disabled={!result || generating || !parsed}
                  title={parsed ? '导出为 CSV（可用 Excel 打开）' : '模型输出不是标准表格，无法导出 CSV'}
                >
                  导出 CSV
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={exportMarkdown}
                  disabled={!result || generating}
                >
                  导出 Markdown
                </Button>
              </Space>
            }
          >
            {error && (
              <Alert type="error" showIcon closable message={error} style={{ marginBottom: 12 }} />
            )}
            {pinned && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message={`正在查看 ${new Date(pinned.createdAt).toLocaleString('zh-CN')} 生成的对比（${pinned.titles.length} 篇）`}
                description="勾选文献或重新生成会离开这条历史记录。"
              />
            )}

            {generating && !result && (
              <Space>
                <Spin size="small" />
                <Typography.Text type="secondary">
                  AI 正在对比 {selectedPapers.length} 篇文献…
                </Typography.Text>
              </Space>
            )}

            {result ? (
              parsed ? (
                <Table<ResultRow>
                  size="small"
                  columns={resultColumns}
                  dataSource={resultRows}
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  bordered
                />
              ) : (
                <div className="markdown-body">
                  <Markdown>{result}</Markdown>
                </div>
              )
            ) : (
              !generating && (
                <Typography.Text type="secondary">
                  {selectedIds.length < MIN_COMPARE
                    ? `再选 ${MIN_COMPARE - selectedIds.length} 篇文献即可开始对比。`
                    : '点击「生成对比」，AI 将输出六维度对比表格。'}
                </Typography.Text>
              )
            )}

            {result && !generating && (
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, display: 'block', marginTop: 12 }}
              >
                表格由 AI 依据所选文献的已有总结或原文节选生成，可能存在偏差，引用前请核对原文。
              </Typography.Text>
            )}
          </Card>

          <Card size="small" title={<Space><HistoryOutlined />历史对比</Space>}>
            {comparisons.length === 0 ? (
              <Typography.Text type="secondary">
                还没有保存过对比结果。生成的对比会自动存到本机浏览器，刷新页面也不会丢。
              </Typography.Text>
            ) : (
              <List<Comparison>
                size="small"
                dataSource={comparisons}
                renderItem={(record) => (
                  <List.Item
                    actions={[
                      <Button key="open" type="link" size="small" onClick={() => openHistory(record)}>
                        打开
                      </Button>,
                      <Popconfirm
                        key="delete"
                        title="删除这条对比记录？"
                        onConfirm={async () => {
                          await deleteComparison(record.id);
                          if (pinnedId === record.id) {
                            setPinnedId(null);
                            setDraft(null);
                          }
                          messageApi.success('已删除');
                        }}
                      >
                        <Button type="link" size="small" danger>
                          删除
                        </Button>
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      title={`${record.titles.length} 篇 · ${new Date(record.createdAt).toLocaleString('zh-CN')}`}
                      description={
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {record.titles.join(' / ')}
                        </Typography.Text>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
