'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Card,
  Typography,
  Button,
  Space,
  Spin,
  Input,
  Alert,
  Descriptions,
  Divider,
} from 'antd';
import { ThunderboltOutlined, SendOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
import Markdown from 'react-markdown';
import { useLiveQuery } from 'dexie-react-hooks';
import AppShell from '@/components/AppShell';
import { db } from '@/lib/db';
import { chat } from '@/lib/llm';
import { retrieveContext } from '@/lib/pdf';
import { useSettings } from '@/lib/settings';
import { PROMPTS } from '@/config/prompts';
import type { ChatMessage } from '@/types/paper';

interface QaTurn {
  question: string;
  answer: string;
}

export default function PaperDetailPage({ params }: { params: { id: string } }) {
  const paper = useLiveQuery(() => db.papers.get(params.id), [params.id]);
  const llm = useSettings((s) => s.settings.llm);

  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [qaTurns, setQaTurns] = useState<QaTurn[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const qaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paper?.summary) setSummary(paper.summary);
  }, [paper?.id, paper?.summary]);

  const generateSummary = async () => {
    if (!paper?.fullText) return;
    setSummarizing(true);
    setError('');
    setSummary('');
    try {
      const text = await chat(llm, {
        messages: [
          { role: 'system', content: PROMPTS.summarizePaper.systemPrompt },
          { role: 'user', content: paper.fullText.slice(0, 60000) },
        ],
        temperature: 0.3,
        onDelta: (d) => setSummary((prev) => prev + d),
      });
      await db.papers.update(paper.id, { summary: text });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSummarizing(false);
    }
  };

  const askQuestion = async () => {
    if (!question.trim() || !paper) return;
    const q = question.trim();
    setQuestion('');
    setAsking(true);
    setError('');
    setQaTurns((prev) => [...prev, { question: q, answer: '' }]);
    try {
      const context = retrieveContext(paper.chunks ?? [], q);
      const history: ChatMessage[] = qaTurns.slice(-4).flatMap((t) => [
        { role: 'user' as const, content: t.question },
        { role: 'assistant' as const, content: t.answer },
      ]);
      await chat(llm, {
        messages: [
          { role: 'system', content: `${PROMPTS.paperQA.systemPrompt}\n\n论文内容：\n${context}` },
          ...history,
          { role: 'user', content: q },
        ],
        temperature: 0.3,
        onDelta: (d) =>
          setQaTurns((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = {
              ...copy[copy.length - 1],
              answer: copy[copy.length - 1].answer + d,
            };
            return copy;
          }),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
      setTimeout(() => qaRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  if (!paper) {
    return (
      <AppShell>
        <Spin tip="加载中..." size="large" style={{ marginTop: 120 }} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Space style={{ marginBottom: 16 }}>
        <Link href="/workspace">
          <Button icon={<ArrowLeftOutlined />}>返回列表</Button>
        </Link>
      </Space>

      <Typography.Title level={3}>{paper.title}</Typography.Title>
      <Descriptions size="small" style={{ marginBottom: 8 }}>
        <Descriptions.Item label="作者">
          {paper.authors.length ? paper.authors.join(', ') : '未知'}
        </Descriptions.Item>
        <Descriptions.Item label="年份">{paper.year ?? '未知'}</Descriptions.Item>
        <Descriptions.Item label="页数">{paper.pageCount ?? '—'}</Descriptions.Item>
      </Descriptions>

      {error && (
        <Alert
          type="error"
          showIcon
          closable
          message={error}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card
        title="结构化总结"
        extra={
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={generateSummary}
            loading={summarizing}
            disabled={!paper.fullText}
          >
            {summary ? '重新生成' : '生成总结'}
          </Button>
        }
        style={{ marginBottom: 24 }}
      >
        {summarizing && !summary && <Spin tip="AI 正在阅读论文..." />}
        {summary ? (
          <div className="markdown-body">
            <Markdown>{summary}</Markdown>
          </div>
        ) : (
          !summarizing && (
            <Typography.Text type="secondary">
              点击「生成总结」，AI 将提取研究问题、方法、发现、创新点与局限。
            </Typography.Text>
          )
        )}
      </Card>

      <Card title="文献问答" style={{ marginBottom: 24 }}>
        {qaTurns.length === 0 && (
          <Typography.Text type="secondary">
            基于这篇论文的内容提问，例如：这篇论文用了什么数据集？结论的适用范围是什么？
          </Typography.Text>
        )}
        {qaTurns.map((turn, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <Typography.Paragraph strong>问：{turn.question}</Typography.Paragraph>
            <Typography.Paragraph style={{ background: 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 8 }}>
              {turn.answer || (asking && i === qaTurns.length - 1 ? '正在思考…' : '')}
            </Typography.Paragraph>
          </div>
        ))}
        <div ref={qaRef} />
        <Divider style={{ margin: '8px 0 16px' }} />
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="输入关于这篇论文的问题..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onPressEnter={askQuestion}
            disabled={asking}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={askQuestion}
            loading={asking}
          />
        </Space.Compact>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          AI 回答由大模型基于论文内容生成，可能存在偏差，重要信息请核对原文。
        </Typography.Text>
      </Card>
    </AppShell>
  );
}
