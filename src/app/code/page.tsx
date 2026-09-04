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
  Tag,
  Typography,
  message,
} from 'antd';
import { CodeOutlined, CopyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import Link from 'next/link';
import Markdown from 'react-markdown';
import AppShell from '@/components/AppShell';
import { useSettings } from '@/lib/settings';
import { usePromptTool } from '@/hooks/usePromptTool';
import { copyText } from '@/lib/clipboard';
import { MAX_INPUT_CHARS } from '@/lib/prompt';
import {
  CODE_TEMPERATURE,
  buildCodeRequest,
  extractCodeBlocks,
  pickPrimaryBlock,
} from '@/lib/code';
import type { CodeMode } from '@/lib/code';

const MODE_LABEL: Record<CodeMode, string> = {
  stats: '统计方法推荐',
  codegen: '分析代码生成',
  interpret: '统计结果解释',
  debug: '代码报错调试',
};

const CODE_MODES = Object.keys(MODE_LABEL) as CodeMode[];

const MODE_OPTIONS: { label: string; value: CodeMode }[] = CODE_MODES.map((value) => ({
  value,
  label: MODE_LABEL[value],
}));

const LANGUAGE_OPTIONS = [
  { value: 'Python', label: 'Python' },
  { value: 'R', label: 'R' },
];

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

const EMPTY_HINT: Record<CodeMode, string> = {
  stats: '描述研究设计（变量类型、组数、是否重复测量、样本量），AI 会给出方法推荐、前提假设、替代方案与实现代码。',
  codegen: '描述分析任务，AI 会输出完整可运行代码与关键步骤注释。',
  interpret: '粘贴统计软件的输出（回归表、方差分析表、检验结果等），AI 会解释指标含义并提醒需要警惕的问题。',
  debug: '粘贴代码与报错信息，AI 会定位根本原因并给出修复后的完整代码。',
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

export default function CodePage() {
  const llm = useSettings((s) => s.settings.llm);
  const [messageApi, contextHolder] = message.useMessage();

  const [design, setDesign] = useState('');
  const [language, setLanguage] = useState('Python');
  const [task, setTask] = useState('');
  const [dataFormat, setDataFormat] = useState('');
  const [requirements, setRequirements] = useState('');
  const [output, setOutput] = useState('');
  const [code, setCode] = useState('');
  const [errorText, setErrorText] = useState('');

  const tool = usePromptTool(CODE_MODES, llm);
  const { mode, setMode, result, activeGen, generating, error } = tool;

  const fields = useMemo(
    () => ({ design, language, task, dataFormat, requirements, output, code, error: errorText }),
    [design, language, task, dataFormat, requirements, output, code, errorText],
  );

  const hasInput =
    mode === 'stats'
      ? !!design.trim()
      : mode === 'codegen'
        ? !!task.trim()
        : mode === 'interpret'
          ? !!output.trim()
          : !!code.trim();

  const canGenerate = hasInput && !!llm.apiKey && !generating;

  const blocks = useMemo(() => (result ? extractCodeBlocks(result) : []), [result]);
  const primaryBlock = useMemo(
    () => pickPrimaryBlock(blocks, mode === 'stats' || mode === 'interpret' ? '' : language),
    [blocks, mode, language],
  );

  const generate = async () => {
    if (!canGenerate) return;
    const full = await tool.run(buildCodeRequest(mode, fields), CODE_TEMPERATURE[mode]);
    if (full !== null) messageApi.success(`${MODE_LABEL[mode]}完成`);
  };

  const copyResult = async (text: string, what: string) => {
    const ok = await copyText(text);
    if (ok) messageApi.success(`已复制${what}`);
    else messageApi.error('浏览器拒绝了剪贴板访问，请手动选中文本复制');
  };

  const codeArea = (value: string, onChange: (v: string) => void, placeholder: string, rows = 10) => (
    <Input.TextArea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoSize={{ minRows: rows, maxRows: 24 }}
      maxLength={MAX_INPUT_CHARS}
      showCount
      style={{ fontFamily: MONO, fontSize: 13 }}
    />
  );

  const inputPanel = (
    <>
      {mode === 'stats' && (
        <Field label="研究设计">
          <Input.TextArea
            value={design}
            onChange={(e) => setDesign(e.target.value)}
            placeholder={
              '例如：30 名被试分为实验组与对照组，干预前后各测一次量表得分，' +
              '想看干预是否有效，数据近似正态。'
            }
            autoSize={{ minRows: 8, maxRows: 20 }}
            maxLength={MAX_INPUT_CHARS}
            showCount
          />
        </Field>
      )}

      {mode === 'codegen' && (
        <>
          <Field label="语言">
            <Select
              value={language}
              onChange={(v: string) => setLanguage(v)}
              options={LANGUAGE_OPTIONS}
              style={{ width: 200 }}
            />
          </Field>
          <Field label="任务描述">
            <Input.TextArea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="例如：读取 CSV，剔除缺失值超过 20% 的列，对两组做独立样本 t 检验并画出箱线图"
              autoSize={{ minRows: 5, maxRows: 14 }}
              maxLength={MAX_INPUT_CHARS}
              showCount
            />
          </Field>
          <Field label="数据格式（选填）">
            <Input.TextArea
              value={dataFormat}
              onChange={(e) => setDataFormat(e.target.value)}
              placeholder={'例如：data.csv，列为 id, group(A/B), score, age；UTF-8 编码'}
              autoSize={{ minRows: 2, maxRows: 8 }}
              maxLength={4000}
              style={{ fontFamily: MONO, fontSize: 13 }}
            />
          </Field>
          <Field label="其他要求（选填）">
            <Input.TextArea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="例如：只用 pandas 与 scipy，不要 seaborn；结果导出为 xlsx"
              autoSize={{ minRows: 2, maxRows: 6 }}
              maxLength={2000}
            />
          </Field>
        </>
      )}

      {mode === 'interpret' && (
        <Field label="统计输出">
          {codeArea(
            output,
            setOutput,
            '粘贴统计软件的原始输出，例如：\nCoefficients:\n             Estimate Std. Error t value Pr(>|t|)\n(Intercept)    2.1451     0.3312   6.477  1.2e-08\ngroupB         0.8413     0.2904   2.897  0.00524',
            10,
          )}
        </Field>
      )}

      {mode === 'debug' && (
        <>
          <Field label="语言">
            <Select
              value={language}
              onChange={(v: string) => setLanguage(v)}
              options={LANGUAGE_OPTIONS}
              style={{ width: 200 }}
            />
          </Field>
          <Field label="待调试代码">{codeArea(code, setCode, '粘贴出问题的代码…', 10)}</Field>
          <Field label="报错信息（选填）">
            <Input.TextArea
              value={errorText}
              onChange={(e) => setErrorText(e.target.value)}
              placeholder="粘贴完整的 traceback 或控制台报错，保留行号有助于定位"
              autoSize={{ minRows: 3, maxRows: 10 }}
              maxLength={8000}
              style={{ fontFamily: MONO, fontSize: 13 }}
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
        数据与代码助手
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        统计方法推荐、分析代码生成、统计结果解释、代码报错调试。代码只在你的机器上生成，本工具不会执行它。
      </Typography.Paragraph>

      {!llm.apiKey && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="尚未配置 API Key"
          description={
            <>
              数据与代码助手需要调用大模型，请先到 <Link href="/settings">设置</Link> 填写你的 API Key。
            </>
          }
        />
      )}

      <Segmented<CodeMode>
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
            <CodeOutlined />
            生成结果
            {primaryBlock && (
              <Tag color="blue">
                {primaryBlock.lang ? `${primaryBlock.lang} 代码块` : '代码块'}
              </Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={<CopyOutlined />}
              onClick={() => primaryBlock && copyResult(primaryBlock.code, '代码')}
              disabled={!primaryBlock || activeGen === mode}
              title={primaryBlock ? '只复制代码，不含解释文字' : '本次结果中没有代码块'}
            >
              复制代码
            </Button>
            <Button
              icon={<CopyOutlined />}
              onClick={() => copyResult(result, '结果')}
              disabled={!result || activeGen === mode}
            >
              复制全文
            </Button>
          </Space>
        }
      >
        {error && (
          <Alert type="error" showIcon closable title={error} style={{ marginBottom: 12 }} />
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
            代码与统计建议由 AI 生成，未经执行验证。运行前请先在小样本上试跑，并自行核对方法与前提假设是否适用于你的数据。
          </Typography.Text>
        )}
      </Card>
    </AppShell>
  );
}
