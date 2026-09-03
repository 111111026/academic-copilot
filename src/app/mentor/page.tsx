'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
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
import { CommentOutlined, CopyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import Link from 'next/link';
import Markdown from 'react-markdown';
import AppShell from '@/components/AppShell';
import { useSettings } from '@/lib/settings';
import { usePromptTool } from '@/hooks/usePromptTool';
import { copyText } from '@/lib/clipboard';
import { MAX_INPUT_CHARS } from '@/lib/prompt';
import { MENTOR_TEMPERATURE, buildMentorRequest } from '@/lib/mentor';
import type { MentorMode } from '@/lib/mentor';

const MODE_LABEL: Record<MentorMode, string> = {
  email: '邮件草稿',
  report: '组会汇报大纲',
  defense: '模拟答辩提问',
};

const MENTOR_MODES = Object.keys(MODE_LABEL) as MentorMode[];

const MODE_OPTIONS: { label: string; value: MentorMode }[] = MENTOR_MODES.map((value) => ({
  value,
  label: MODE_LABEL[value],
}));

const PURPOSE_OPTIONS = [
  '汇报研究进展',
  '请求指导与反馈',
  '预约面谈',
  '论文送审请求',
  '延期申请',
  '请假',
  '推荐信请求',
  '致谢',
].map((value) => ({ value, label: value }));

const TONE_OPTIONS = ['正式恭敬', '诚恳平和', '简洁直接'].map((value) => ({ value, label: value }));

const DURATION_OPTIONS = ['5 分钟', '10 分钟', '15 分钟', '20 分钟'].map((value) => ({
  value,
  label: value,
}));

const AUDIENCE_OPTIONS = ['导师与同门', '仅导师', '跨方向听众', '答辩委员会'].map((value) => ({
  value,
  label: value,
}));

const ROLE_OPTIONS = [
  '答辩委员会主席',
  '同方向评审专家',
  '跨方向评审专家',
  '企业评审专家',
].map((value) => ({ value, label: value }));

const COUNT_OPTIONS = [5, 8, 10].map((value) => ({ value, label: `${value} 个问题` }));

const EMPTY_HINT: Record<MentorMode, string> = {
  email: '选择邮件目的、写清要点，AI 会输出含主题行、称谓、正文、落款的完整邮件。',
  report: '写下这一阶段的研究进展，AI 会按时长生成逐页 PPT 大纲，每页含标题与要点。',
  defense: '粘贴论文题目与摘要或已有总结，AI 会以指定评委身份提出可能被问到的问题。',
};

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

export default function MentorPage() {
  const llm = useSettings((s) => s.settings.llm);
  const [messageApi, contextHolder] = message.useMessage();

  const [recipient, setRecipient] = useState('');
  const [purpose, setPurpose] = useState(PURPOSE_OPTIONS[0].value);
  const [points, setPoints] = useState('');
  const [tone, setTone] = useState(TONE_OPTIONS[0].value);
  const [progress, setProgress] = useState('');
  const [duration, setDuration] = useState(DURATION_OPTIONS[1].value);
  const [audience, setAudience] = useState(AUDIENCE_OPTIONS[0].value);
  const [role, setRole] = useState(ROLE_OPTIONS[0].value);
  const [count, setCount] = useState(8);
  const [content, setContent] = useState('');

  const tool = usePromptTool(MENTOR_MODES, llm);
  const { mode, setMode, result, activeGen, generating, error } = tool;

  const fields = useMemo(
    () => ({ recipient, purpose, points, tone, progress, duration, audience, role, count, content }),
    [recipient, purpose, points, tone, progress, duration, audience, role, count, content],
  );

  const hasInput =
    mode === 'email'
      ? !!points.trim()
      : mode === 'report'
        ? !!progress.trim()
        : !!content.trim();

  const canGenerate = hasInput && !!llm.apiKey && !generating;

  const generate = async () => {
    if (!canGenerate) return;
    const full = await tool.run(buildMentorRequest(mode, fields), MENTOR_TEMPERATURE[mode]);
    if (full !== null) messageApi.success(`${MODE_LABEL[mode]}完成`);
  };

  const onCopy = async () => {
    if (!result) return;
    const ok = await copyText(result);
    if (ok) messageApi.success('已复制到剪贴板');
    else messageApi.error('浏览器拒绝了剪贴板访问，请手动选中文本复制');
  };

  const inputPanel = (
    <>
      {mode === 'email' && (
        <>
          <Field label="收件人">
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="例如：张老师（留空则按「导师」处理）"
              maxLength={60}
              style={{ width: 360 }}
            />
          </Field>
          <Field label="邮件目的">
            <Select
              value={purpose}
              onChange={(v: string) => setPurpose(v)}
              options={PURPOSE_OPTIONS}
              style={{ width: 360 }}
            />
          </Field>
          <Field label="需要传达的要点">
            <Input.TextArea
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder={
                '例如：第三章实验已完成，F1 提升 4.2 个点；\n' +
                '遇到标注数据不足的问题，想申请多用两台服务器跑一轮；\n' +
                '希望本周四下午当面汇报。'
              }
              autoSize={{ minRows: 6, maxRows: 16 }}
              maxLength={MAX_INPUT_CHARS}
              showCount
            />
          </Field>
          <Field label="语气">
            <Select
              value={tone}
              onChange={(v: string) => setTone(v)}
              options={TONE_OPTIONS}
              style={{ width: 240 }}
            />
          </Field>
        </>
      )}

      {mode === 'report' && (
        <>
          <Field label="研究进展">
            <Input.TextArea
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
              placeholder={
                '例如：本周读完了 12 篇跨模态检索的文献并整理成对比表；\n' +
                '复现了基线模型，在自建数据集上 Recall@10 为 0.41；\n' +
                '下周计划加入对比学习损失。'
              }
              autoSize={{ minRows: 8, maxRows: 20 }}
              maxLength={MAX_INPUT_CHARS}
              showCount
            />
          </Field>
          <Field label="汇报时长">
            <Space>
              <Select
                value={duration}
                onChange={(v: string) => setDuration(v)}
                options={DURATION_OPTIONS}
                style={{ width: 180 }}
              />
              <Select
                value={audience}
                onChange={(v: string) => setAudience(v)}
                options={AUDIENCE_OPTIONS}
                style={{ width: 200 }}
              />
            </Space>
          </Field>
        </>
      )}

      {mode === 'defense' && (
        <>
          <Field label="评委身份">
            <Space>
              <Select
                value={role}
                onChange={(v: string) => setRole(v)}
                options={ROLE_OPTIONS}
                style={{ width: 220 }}
              />
              <Select
                value={count}
                onChange={(v: number) => setCount(v)}
                options={COUNT_OPTIONS}
                style={{ width: 160 }}
              />
            </Space>
          </Field>
          <Field label="研究内容">
            <Input.TextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                '粘贴论文题目、摘要，或文献工作台里已生成的结构化总结。\n' +
                '内容越具体，问题就越贴近真实答辩。'
              }
              autoSize={{ minRows: 8, maxRows: 22 }}
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
        导师沟通助手
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        邮件草稿、组会汇报 PPT 大纲、模拟答辩提问。草稿只是起点，发出前请按你和导师的实际相处方式改一遍。
      </Typography.Paragraph>

      {!llm.apiKey && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="尚未配置 API Key"
          description={
            <>
              导师沟通助手需要调用大模型，请先到 <Link href="/settings">设置</Link> 填写你的 API Key。
            </>
          }
        />
      )}

      <Segmented<MentorMode>
        options={MODE_OPTIONS}
        value={mode}
        onChange={setMode}
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
            <CommentOutlined />
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
          <div className="markdown-body">
            <Markdown>{result}</Markdown>
          </div>
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
            内容由 AI 生成，仅供起草参考。请核对事实、时间与承诺后再发出，涉及他人成果时注意表述准确。
          </Typography.Text>
        )}
      </Card>
    </AppShell>
  );
}
