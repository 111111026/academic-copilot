'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { CloudDownloadOutlined, ImportOutlined, SearchOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import AppShell from '@/components/AppShell';
import { db, savePaper } from '@/lib/db';
import { ARXIV_SOURCE_ID, searchOpenAlex } from '@/lib/openalex';
import { parseBibtex, type ParsedReference } from '@/lib/bibtex';
import type { Paper } from '@/types/paper';
import type { SearchPage, SearchResult } from '@/types/search';

type Mode = 'openalex' | 'arxiv' | 'manual';

const MODE_OPTIONS: { label: string; value: Mode }[] = [
  { label: 'OpenAlex', value: 'openalex' },
  { label: 'arXiv', value: 'arxiv' },
  { label: '手动导入', value: 'manual' },
];

const PER_PAGE = 25;

interface ManualForm {
  title: string;
  authors: string;
  year: number | null;
  doi: string;
  url: string;
  venue: string;
  abstract: string;
}

function toPaper(
  input: Pick<Paper, 'title' | 'authors' | 'year' | 'abstract'> &
    Partial<Pick<Paper, 'source' | 'doi' | 'url' | 'venue'>>,
): Paper {
  return {
    id: uuidv4(),
    title: input.title,
    authors: input.authors,
    year: input.year,
    abstract: input.abstract,
    source: input.source ?? 'manual',
    doi: input.doi || undefined,
    url: input.url || undefined,
    venue: input.venue || undefined,
    addedAt: Date.now(),
  };
}

export default function SearchPage() {
  const [mode, setMode] = useState<Mode>('openalex');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<SearchPage | null>(null);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [importing, setImporting] = useState(false);
  const [bibtexText, setBibtexText] = useState('');
  const [parsed, setParsed] = useState<ParsedReference[]>([]);
  const [parsedKeys, setParsedKeys] = useState<React.Key[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<ManualForm>();

  const existing = useLiveQuery(() => db.papers.toArray(), [], [] as Paper[]);

  // 检索结果与本地库按 DOI → URL → 标题依次比对，避免重复导入同一篇
  const importedKeys = useMemo(() => {
    const dois = new Set<string>();
    const urls = new Set<string>();
    const titles = new Set<string>();
    for (const p of existing) {
      if (p.doi) dois.add(p.doi.toLowerCase());
      if (p.url) urls.add(p.url.toLowerCase());
      titles.add(p.title.trim().toLowerCase());
    }
    return { dois, urls, titles };
  }, [existing]);

  const isImported = (r: SearchResult): boolean => {
    if (r.doi && importedKeys.dois.has(r.doi.toLowerCase())) return true;
    if (r.url && importedKeys.urls.has(r.url.toLowerCase())) return true;
    return importedKeys.titles.has(r.title.trim().toLowerCase());
  };

  const runSearch = async (page = 1) => {
    const q = query.trim();
    if (!q) {
      messageApi.warning('请输入检索词');
      return;
    }
    setLoading(true);
    setError('');
    setSelected([]);
    try {
      const isArxiv = mode === 'arxiv';
      const result = await searchOpenAlex(q, {
        page,
        perPage: PER_PAGE,
        sourceId: isArxiv ? ARXIV_SOURCE_ID : undefined,
        sourceLabel: isArxiv ? 'arxiv' : 'openalex',
      });
      setData(result);
      if (!result.results.length) messageApi.info('没有检索到结果，试试更换关键词');
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const importResults = async (items: SearchResult[]) => {
    if (!items.length) return;
    setImporting(true);
    let imported = 0;
    let skipped = 0;
    try {
      for (const r of items) {
        if (isImported(r)) {
          skipped++;
          continue;
        }
        await savePaper(
          toPaper({
            title: r.title,
            authors: r.authors,
            year: r.year,
            abstract: r.abstract,
            source: r.source,
            doi: r.doi,
            url: r.url,
            venue: r.venue,
          }),
        );
        imported++;
      }
      messageApi.success(
        skipped ? `已导入 ${imported} 篇，跳过 ${skipped} 篇（本地已存在）` : `已导入 ${imported} 篇`,
      );
      setSelected([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const importReferences = async (refs: ParsedReference[]) => {
    if (!refs.length) return;
    setImporting(true);
    try {
      let imported = 0;
      for (const r of refs) {
        if (!r.title) continue;
        await savePaper(
          toPaper({
            title: r.title,
            authors: r.authors,
            year: r.year,
            abstract: r.abstract,
            source: 'manual',
            doi: r.doi,
            url: r.url,
            venue: r.venue,
          }),
        );
        imported++;
      }
      messageApi.success(imported ? `已导入 ${imported} 条题录` : '没有可导入的题录（缺少标题）');
      setParsedKeys([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const onParseBibtex = () => {
    if (!bibtexText.trim()) {
      messageApi.warning('请先粘贴 BibTeX');
      return;
    }
    const refs = parseBibtex(bibtexText);
    setParsed(refs);
    setParsedKeys(refs.map((_, i) => i));
    if (!refs.length) messageApi.error('未解析出任何 @entry，请检查 BibTeX 格式');
    else messageApi.success(`解析出 ${refs.length} 条题录`);
  };

  const onSubmitManual = async () => {
    const values = await form.validateFields();
    await savePaper(
      toPaper({
        title: values.title.trim(),
        authors: values.authors
          .split(/[,;，；\n]/)
          .map((a) => a.trim())
          .filter(Boolean),
        year: values.year ?? null,
        abstract: values.abstract?.trim() ?? '',
        source: 'manual',
        doi: values.doi?.trim(),
        url: values.url?.trim(),
        venue: values.venue?.trim(),
      }),
    );
    messageApi.success('已导入题录');
    form.resetFields();
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: SearchResult) => (
        <Space orientation="vertical" size={2}>
          {record.url ? (
            <Typography.Link href={record.url} target="_blank" rel="noreferrer">
              {title}
            </Typography.Link>
          ) : (
            <span>{title}</span>
          )}
          {isImported(record) && <Tag color="green">已导入</Tag>}
        </Space>
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
      title: '来源',
      dataIndex: 'venue',
      key: 'venue',
      width: 200,
      ellipsis: true,
      render: (v?: string) => v || '—',
    },
    {
      title: '被引',
      dataIndex: 'citedBy',
      key: 'citedBy',
      width: 80,
      render: (n?: number) => (typeof n === 'number' ? n : '—'),
    },
  ];

  const onlinePanel = (
    <>
      <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
        <Input
          placeholder={
            mode === 'arxiv'
              ? 'arXiv 关键词，例如：additive manufacturing thermal simulation'
              : 'OpenAlex 关键词，例如：digital twin additive manufacturing'
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={() => runSearch(1)}
          allowClear
          size="large"
        />
        <Button
          type="primary"
          size="large"
          icon={<SearchOutlined />}
          loading={loading}
          onClick={() => runSearch(1)}
        >
          检索
        </Button>
      </Space.Compact>

      {mode === 'arxiv' && (
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
          arXiv 官方 API 不允许浏览器跨域访问，这里检索的是 OpenAlex 索引的 arXiv 库（约 320 万条预印本），最新提交的收录可能有延迟。
        </Typography.Text>
      )}

      {data && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Typography.Text type="secondary">
              共 {data.total} 条结果，当前第 {data.page} 页
            </Typography.Text>
            <Space>
              <Button
                type="primary"
                icon={<CloudDownloadOutlined />}
                disabled={!selected.length}
                loading={importing}
                onClick={() =>
                  importResults(data.results.filter((r) => selected.includes(r.key)))
                }
              >
                导入选中的 {selected.length} 篇
              </Button>
              <Button disabled={!selected.length} onClick={() => setSelected([])}>
                清空选择
              </Button>
            </Space>
          </div>
          <Table<SearchResult>
            rowKey="key"
            size="small"
            columns={columns}
            dataSource={data.results}
            loading={loading}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: setSelected,
              getCheckboxProps: (record) => ({ disabled: isImported(record) }),
            }}
            expandable={{
              expandedRowRender: (record) => (
                <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                  {record.abstract || '该条目没有摘要'}
                </Typography.Paragraph>
              ),
            }}
            pagination={{
              current: data.page,
              pageSize: PER_PAGE,
              total: data.total,
              showSizeChanger: false,
              onChange: (p) => runSearch(p),
            }}
          />
        </>
      )}
    </>
  );

  const manualPanel = (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" title="粘贴 BibTeX 批量导入">
        <Input.TextArea
          rows={6}
          value={bibtexText}
          onChange={(e) => setBibtexText(e.target.value)}
          placeholder={'@article{doe2023,\n  title = {Some Title},\n  author = {Doe, John and Smith, Jane},\n  year = {2023},\n  journal = {Nature},\n  doi = {10.1234/xyz}\n}'}
          style={{ fontFamily: 'monospace', marginBottom: 12 }}
        />
        <Space>
          <Button onClick={onParseBibtex}>解析</Button>
          <Button
            type="primary"
            icon={<ImportOutlined />}
            disabled={!parsedKeys.length}
            loading={importing}
            onClick={() => importReferences(parsed.filter((_, i) => parsedKeys.includes(i)))}
          >
            导入选中的 {parsedKeys.length} 条
          </Button>
        </Space>
        {parsed.length > 0 && (
          <Table<ParsedReference>
            style={{ marginTop: 12 }}
            rowKey={(_, i) => i as number}
            size="small"
            dataSource={parsed}
            pagination={false}
            rowSelection={{ selectedRowKeys: parsedKeys, onChange: setParsedKeys }}
            columns={[
              { title: '标题', dataIndex: 'title', render: (t: string) => t || '（无标题）' },
              {
                title: '作者',
                dataIndex: 'authors',
                width: 200,
                render: (a: string[]) => (a.length ? a.join(', ') : '—'),
              },
              { title: '年份', dataIndex: 'year', width: 80, render: (y: number | null) => y ?? '—' },
              { title: '类型', dataIndex: 'entryType', width: 100, render: (t: string) => <Tag>{t}</Tag> },
            ]}
          />
        )}
      </Card>

      <Card size="small" title="手动填写单条题录">
        <Form<ManualForm> form={form} layout="vertical" style={{ maxWidth: 640 }}>
          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, message: '请填写标题' }]}
          >
            <Input placeholder="论文标题" />
          </Form.Item>
          <Form.Item label="作者" name="authors" extra="多位作者用逗号或换行分隔">
            <Input.TextArea rows={2} placeholder="张三, 李四" />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item label="年份" name="year">
              <InputNumber min={1800} max={2100} placeholder="2024" />
            </Form.Item>
            <Form.Item label="DOI" name="doi">
              <Input placeholder="10.1234/xyz" />
            </Form.Item>
          </Space>
          <Form.Item label="链接" name="url">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item label="期刊/会议" name="venue">
            <Input placeholder="Nature" />
          </Form.Item>
          <Form.Item label="摘要" name="abstract">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Button type="primary" icon={<ImportOutlined />} loading={importing} onClick={onSubmitManual}>
            导入这条题录
          </Button>
        </Form>
      </Card>
    </Space>
  );

  return (
    <AppShell>
      {contextHolder}
      <Typography.Title level={3}>文献检索助手</Typography.Title>

      <Segmented<Mode>
        options={MODE_OPTIONS}
        value={mode}
        onChange={(v) => {
          setMode(v);
          setData(null);
          setError('');
          setSelected([]);
        }}
        style={{ marginBottom: 16 }}
      />

      {error && (
        <Alert type="error" showIcon closable title={error} style={{ marginBottom: 16 }} />
      )}

      {mode === 'manual' ? manualPanel : onlinePanel}
    </AppShell>
  );
}
