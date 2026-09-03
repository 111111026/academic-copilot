'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Input,
  Segmented,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd';
import {
  CopyOutlined,
  EditOutlined,
  ImportOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import Markdown from 'react-markdown';
import { useLiveQuery } from 'dexie-react-hooks';
import AppShell from '@/components/AppShell';
import { db } from '@/lib/db';
import { chat } from '@/lib/llm';
import { useSettings } from '@/lib/settings';
import {
  DEFAULT_POLISH_STYLE,
  MAX_INPUT_CHARS,
  WRITING_TEMPERATURE,
  buildReferenceList,
  buildWritingRequest,
  copyText,
  detectLanguage,
  resolveDirection,
} from '@/lib/writing';
import type { TranslateDirection, WritingMode } from '@/lib/writing';
import type { Paper } from '@/types';

const MODE_LABEL: Record<WritingMode, string> = {
  polish: '学术润色',
  rewrite: '降重建议',
  outline: '大纲生成',
  expand: '段落扩写',
  translate: '中英互译',
  references: '参考文献格式化',
};

const MODE_OPTIONS: { label: string; value: WritingMode }[] = (
  Object.keys(MODE_LABEL) as WritingMode[]
).map((value) => ({ value, label: MODE_LABEL[value] }));

/** 大纲和参考文献格式化的输出本身就是 Markdown 结构，其余四种是连续散文，按原样换行更好复制 */
const MARKDOWN_MODES: WritingMode[] = ['outline', 'references'];

const TEXT_PLACEHOLDER: Partial<Record<WritingMode, string>> = {
  polish: '粘贴需要润色的段落…',
  rewrite: '粘贴重复率偏高、需要改写表达方式的段落…',
  expand: '粘贴需要扩写的段落（哪怕只有几句核心观点也可以）…',
  translate: '粘贴需要翻译的文本…',
};

const EMPTY_HINT: Partial<Record<WritingMode, string>> = {
  polish: '填写目标风格并粘贴文本，AI 会直接输出润色后的段落，不附加修改说明。',
  rewrite: '粘贴段落后点击「开始生成」。AI 只更换表达方式，不会替你核实学术规范。',
  outline: '选择写作类型、填写题目，AI 会输出两级标题加要点说明的大纲。',
  expand: '粘贴段落并选择扩写倍数，AI 会补充论证与衔接，但不编造数据和文献。',
  translate: '粘贴文本，方向设为「自动检测」时会按汉字与拉丁字母占比判断中译英还是英译中。',
  references: '选择引用格式，粘贴题录或从本地文献库导入，AI 会输出规范条目并标注缺失项。',
};

const STYLE_OPTIONS = [
  { value: DEFAULT_POLISH_STYLE },
  { value: '更简洁，删去冗余修饰' },
  { value: '更正式，避免口语化表达' },
  { value: '母语化英文学术表达' },
];

const WRITING_TYPE_OPTIONS = [
  '期刊论文',
  '硕士学位论文',
  '博士学位论文',
  '课程论文',
  '文献综述',
  '开题报告',
  '基金申请书',
].map((value) => ({ value, label: value }));

const FORMAT_OPTIONS = [
  'GB/T 7714-2015',
  'APA 第 7 版',
  'MLA 第 9 版',
  'Chicago（作者-年代）',
  'IEEE',
].map((value) => ({ value, label: value }));

const DIRECTION_OPTIONS: { value: TranslateDirection; label: string }[] = [
  { value: 'auto', label: '自动检测' },
  { value: 'zh2en', label: '中文 → 英文' },
  { value: 'en2zh', label: '英文 → 中文' },
];

const RATIO_OPTIONS = [
  { value: 1.5, label: '约 1.5 倍' },
  { value: 2, label: '约 2 倍' },
  { value: 3, label: '约 3 倍' },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Typography.Text
        type="secondary"
        style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
      >
        {label}
      </Typography.Text>
      {children}
    </div>
  );
}

export default function WritingPage() {
  const papersQuery = useLiveQuery(() => db.papers.orderBy('addedAt').reverse().toArray());
  const llm = useSettings((s) => s.settings.llm);
  const papers = useMemo(() => papersQuery ?? [], [papersQuery]);

  const [mode, setMode] = useState<WritingMode>('polish');
  const [text, setText] = useState('');
  const [style, setStyle] = useState(DEFAULT_POLISH_STYLE);
  const [ratio, setRatio] = useState(2);
  const [direction, setDirection] = useState<TranslateDirection>('auto');
  const [writingType, setWritingType] = useState('期刊论文');
  const [topic, setTopic] = useState('');
  const [requirements, setRequirements] = useState('');
  const [format, setFormat] = useState(FORMAT_OPTIONS[0].value);
  const [references, setReferences] = useState('');
  const [refIds, setRefIds] = useState<string[]>([]);

  // 每种模式各存一份结果，切走再切回来不会丢掉上一次的输出
  const [results, setResults] = useState<Record<WritingMode, string>>({
    polish: '',
    rewrite: '',
    outline: '',
    expand: '',
    translate: '',
    references: '',
  });
  const [activeGen, setActiveGen] = useState<WritingMode | null>(null);
  const [error, setError] = useState('');
  const [messageApi, contextHolder] = message.useMessage();

  const generating = activeGen !== null;
  const result = results[mode];
  const isMarkdown = MARKDOWN_MODES.includes(mode);

  const hasInput =
    mode === 'outline'
      ? !!topic.trim()
      : mode === 'references'
        ? !!references.trim()
        : !!text.trim();

  const canGenerate = hasInput && !!llm.apiKey && !generating;

  const generate = async () => {
    if (!canGenerate) return;
    // 生成过程中切到别的模式，增量仍写回发起时那个模式的槽位
    const target = mode;
    const previous = results[target];
    setActiveGen(target);
    setError('');
    setResults((prev) => ({ ...prev, [target]: '' }));
    try {
      const request = buildWritingRequest(target, {
        text,
        style,
        ratio,
        direction,
        writingType,
        topic,
        requirements,
        format,
        references,
      });
      const full = await chat(llm, {
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        temperature: WRITING_TEMPERATURE[target],
        onDelta: (delta) =>
          setResults((prev) => ({ ...prev, [target]: prev[target] + delta })),
      });
      setResults((prev) => ({ ...prev, [target]: full }));
      messageApi.success(`${MODE_LABEL[target]}完成`);
    } catch (e) {
      setError((e as Error).message);
      // 结果不落库，失败时若沿用清空后的空槽，上一次的成功输出会连带丢失
      setResults((prev) => ({ ...prev, [target]: previous }));
    } finally {
      setActiveGen(null);
    }
  };

  const onCopy = async () => {
    if (!result) return;
    const ok = await copyText(result);
    if (ok) messageApi.success('已复制到剪贴板');
    else messageApi.error('浏览器拒绝了剪贴板访问，请手动选中文本复制');
  };

  const importReferences = () => {
    const picked = refIds
      .map((id) => papers.find((p) => p.id === id))
      .filter((p): p is Paper => !!p);
    if (!picked.length) return;
    const block = buildReferenceList(picked);
    setReferences((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${block}` : block));
    messageApi.success(`已填入 ${picked.length} 条题录`);
  };

  const textArea = (
    <Input.TextArea
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder={TEXT_PLACEHOLDER[mode] ?? '粘贴文本…'}
      autoSize={{ minRows: 8, maxRows: 18 }}
      maxLength={MAX_INPUT_CHARS}
      showCount
    />
  );

  const inputPanel = (
    <>
      {mode === 'polish' && (
        <>
          <Field label="目标风格">
            <AutoComplete
              value={style}
              onChange={(v: string) => setStyle(v)}
              options={STYLE_OPTIONS}
              placeholder={DEFAULT_POLISH_STYLE}
              style={{ width: 360 }}
            />
          </Field>
          <Field label="待润色文本">{textArea}</Field>
        </>
      )}

      {mode === 'rewrite' && (
        <>
          <Field label="待改写文本">{textArea}</Field>
          <Alert
            type="info"
            showIcon
            message="降重只改变表达方式，不改变观点归属"
            description="引用他人成果仍须按规范标注出处。改写结果请逐句核对，确认没有歪曲原意。"
          />
        </>
      )}

      {mode === 'outline' && (
        <>
          <Field label="写作类型">
            <Select
              value={writingType}
              onChange={(v: string) => setWritingType(v)}
              options={WRITING_TYPE_OPTIONS}
              style={{ width: 360 }}
            />
          </Field>
          <Field label="题目 / 主题">
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：面向低资源语言的跨模态检索方法研究"
              maxLength={200}
              style={{ width: 520 }}
            />
          </Field>
          <Field label="额外要求（选填）">
            <Input.TextArea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="例如：共六章，第三章须包含实验设计，字数约 3 万字"
              autoSize={{ minRows: 2, maxRows: 6 }}
              maxLength={1000}
            />
          </Field>
        </>
      )}

      {mode === 'expand' && (
        <>
          <Field label="扩写倍数">
            <Select
              value={ratio}
              onChange={(v: number) => setRatio(v)}
              options={RATIO_OPTIONS}
              style={{ width: 200 }}
            />
          </Field>
          <Field label="待扩写段落">{textArea}</Field>
        </>
      )}

      {mode === 'translate' && (
        <>
          <Field label="翻译方向">
            <Space>
              <Select
                value={direction}
                onChange={(v: TranslateDirection) => setDirection(v)}
                options={DIRECTION_OPTIONS}
                style={{ width: 200 }}
              />
              {direction === 'auto' && text.trim() && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  检测到{detectLanguage(text) === 'zh' ? '中文' : '英文'}，将译为
                  {resolveDirection(text, 'auto')}
                </Typography.Text>
              )}
            </Space>
          </Field>
          <Field label="待翻译文本">{textArea}</Field>
        </>
      )}

      {mode === 'references' && (
        <>
          <Field label="引用格式">
            <Select
              value={format}
              onChange={(v: string) => setFormat(v)}
              options={FORMAT_OPTIONS}
              style={{ width: 360 }}
            />
          </Field>
          {papers.length > 0 && (
            <Field label="从本地文献库导入（选填）">
              <Space.Compact style={{ width: '100%' }}>
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="按标题筛选并勾选文献…"
                  value={refIds}
                  onChange={(v: string[]) => setRefIds(v)}
                  options={papers.map((p) => ({ value: p.id, label: p.title }))}
                  maxTagCount="responsive"
                  style={{ width: '100%' }}
                />
                <Button
                  icon={<ImportOutlined />}
                  onClick={importReferences}
                  disabled={!refIds.length}
                >
                  填入题录
                </Button>
              </Space.Compact>
            </Field>
          )}
          <Field label="题录信息">
            <Input.TextArea
              value={references}
              onChange={(e) => setReferences(e.target.value)}
              placeholder={'粘贴原始题录，或从上方文献库导入。例如：\n标题：Attention Is All You Need\n作者：Vaswani, A., Shazeer, N.\n年份：2017\n来源：NeurIPS'}
              autoSize={{ minRows: 6, maxRows: 16 }}
              maxLength={MAX_INPUT_CHARS}
              showCount
            />
          </Field>
        </>
      )}
    </>
  );

  return (
    <AppShell>
      {contextHolder}
      <Typography.Title level={3} style={{ marginBottom: 8 }}>
        学术写作助手
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        润色、降重、大纲、扩写、互译、参考文献格式化六种模式，各自保留本次会话的结果，可直接复制到你的文档里。
      </Typography.Paragraph>

      {!llm.apiKey && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="尚未配置 API Key"
          description={
            <>
              写作助手需要调用大模型，请先到 <Link href="/settings">设置</Link> 填写你的 API Key。
            </>
          }
        />
      )}

      <Segmented<WritingMode>
        options={MODE_OPTIONS}
        value={mode}
        onChange={(v) => {
          setMode(v);
          setError('');
        }}
        style={{ marginBottom: 16 }}
      />

      <Card
        size="small"
        title={MODE_LABEL[mode]}
        style={{ marginBottom: 16 }}
        extra={
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={generate}
            loading={activeGen === mode}
            disabled={!canGenerate}
            title={hasInput ? '' : '请先填写必填内容'}
          >
            {result ? '重新生成' : '开始生成'}
          </Button>
        }
      >
        {inputPanel}
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <EditOutlined />
            生成结果
          </Space>
        }
        extra={
          <Button
            icon={<CopyOutlined />}
            onClick={onCopy}
            disabled={!result || activeGen === mode}
          >
            复制结果
          </Button>
        }
      >
        {error && (
          <Alert type="error" showIcon closable message={error} style={{ marginBottom: 12 }} />
        )}

        {activeGen === mode && !result && (
          <Space>
            <Spin size="small" />
            <Typography.Text type="secondary">AI 正在生成…</Typography.Text>
          </Space>
        )}

        {result ? (
          isMarkdown ? (
            <div className="markdown-body">
              <Markdown>{result}</Markdown>
            </div>
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.8 }}>
              {result}
            </div>
          )
        ) : (
          activeGen !== mode && (
            <Typography.Text type="secondary">{EMPTY_HINT[mode]}</Typography.Text>
          )
        )}

        {result && activeGen !== mode && (
          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, display: 'block', marginTop: 12 }}
          >
            内容由 AI 生成，仅供写作辅助。请自行核实事实与引用，并遵守所在院校的学术诚信与 AI 使用规定。
          </Typography.Text>
        )}
      </Card>
    </AppShell>
  );
}
