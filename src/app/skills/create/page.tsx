'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Divider,
  Input,
  Select,
  Space,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownloadOutlined,
  PlusOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { saveCustomSkill } from '@/lib/db';
import { downloadTextFile } from '@/lib/download';
import type { Skill, SkillInput, SkillStep } from '@/types/skill';

const CATEGORY_OPTIONS = [
  { value: 'reading', label: '文献阅读' },
  { value: 'writing', label: '学术写作' },
  { value: 'research', label: '研究设计' },
  { value: 'data', label: '数据与代码' },
  { value: 'communication', label: '沟通汇报' },
  { value: 'custom', label: '其他' },
];

const INPUT_TYPE_OPTIONS = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'select', label: '下拉选择' },
  { value: 'number', label: '数字' },
];

function emptyInput(): SkillInput {
  return { id: crypto.randomUUID().slice(0, 8), label: '', type: 'textarea', required: true, placeholder: '' };
}

function emptyStep(): SkillStep {
  return {
    id: crypto.randomUUID().slice(0, 8),
    name: '',
    inputFrom: [],
    promptTemplate: '',
  };
}

export default function SkillCreatorPage() {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('⚡');
  const [category, setCategory] = useState<Skill['category']>('custom');
  const [tags, setTags] = useState('');
  const [inputs, setInputs] = useState<SkillInput[]>([emptyInput()]);
  const [steps, setSteps] = useState<SkillStep[]>([emptyStep()]);
  const [error, setError] = useState('');

  const validate = (): string | null => {
    if (!name.trim()) return '请填写 Skill 名称';
    if (!description.trim()) return '请填写功能描述';
    if (inputs.length === 0) return '至少需要一个输入字段';
    if (inputs.some((i) => !i.label.trim())) return '每个输入字段都需要标签';
    if (steps.length === 0) return '至少需要一个执行步骤';
    if (steps.some((s) => !s.name.trim())) return '每个步骤都需要名称';
    if (steps.some((s) => !s.promptTemplate.trim())) return '每个步骤都需要 Prompt 模板';
    return null;
  };

  const buildSkill = (): Skill => ({
    id: `custom-${Date.now().toString(36)}`,
    name: name.trim(),
    description: description.trim(),
    icon: icon.trim() || '⚡',
    category,
    version: '1.0.0',
    author: '用户自定义',
    tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
    inputs: inputs.map((inp) => ({
      ...inp,
      options: inp.type === 'select' ? inp.placeholder?.split(/[,，]/).map((o) => o.trim()).filter(Boolean) : undefined,
    })),
    steps,
    output: { format: 'markdown', exportFormats: ['md'] },
    isBuiltin: false,
  });

  const handleSave = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');

    const skill = buildSkill();

    await saveCustomSkill(skill);
    messageApi.success('已保存');
    router.push(`/skills/run?id=${skill.id}`);
  };

  const handleExport = () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    const skill = buildSkill();
    downloadTextFile(`${skill.name}.skill.json`, JSON.stringify(skill, null, 2), 'application/json');
    messageApi.success('已导出 JSON');
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const skill = JSON.parse(reader.result as string) as Skill;
        if (!skill.name || !skill.inputs || !skill.steps) {
          throw new Error('缺少必要字段');
        }
        setName(skill.name);
        setDescription(skill.description ?? '');
        setIcon(skill.icon ?? '⚡');
        setCategory(skill.category ?? 'custom');
        setTags((skill.tags ?? []).join(', '));
        setInputs(skill.inputs);
        setSteps(skill.steps);
        setError('');
        messageApi.success('已导入，请检查后保存');
      } catch (e) {
        setError(`导入失败：${(e as Error).message}`);
      }
    };
    reader.readAsText(file);
    return false;
  };

  return (
    <AppShell>
      {contextHolder}
      <Space style={{ marginBottom: 12 }}>
        <Link href="/skills">
          <Button type="text" icon={<ArrowLeftOutlined />} size="small">
            Skills 中心
          </Button>
        </Link>
      </Space>

      <Typography.Title level={3} style={{ marginBottom: 16 }}>
        创建自定义 Skill
      </Typography.Title>

      {error && <Alert type="error" message={error} closable style={{ marginBottom: 16 }} onClose={() => setError('')} />}

      <Card size="small" title="基本信息" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>名称 *</Typography.Text>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：论文审稿意见回复" maxLength={50} />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>描述 *</Typography.Text>
            <Input.TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="一句话说明这个 Skill 做什么" autoSize={{ minRows: 2, maxRows: 4 }} maxLength={200} />
          </div>
          <Space>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>图标</Typography.Text>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} style={{ width: 80 }} maxLength={4} />
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>分类</Typography.Text>
              <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} style={{ width: 160 }} />
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>标签（逗号分隔）</Typography.Text>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="审稿, 回复" style={{ width: 240 }} />
            </div>
          </Space>
        </Space>
      </Card>

      <Card
        size="small"
        title="输入字段"
        style={{ marginBottom: 16 }}
        extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setInputs([...inputs, emptyInput()])}>添加</Button>}
      >
        {inputs.map((inp, idx) => (
          <Card key={inp.id} size="small" type="inner" style={{ marginBottom: 8 }}
            title={<Typography.Text code style={{ fontSize: 12 }}>字段 ID：{inp.id}</Typography.Text>}
            extra={<Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setInputs(inputs.filter((_, i) => i !== idx))} />}
          >
            <Space wrap>
              <Input
                value={inp.label}
                onChange={(e) => { const next = [...inputs]; next[idx] = { ...inp, label: e.target.value }; setInputs(next); }}
                placeholder="字段标签 *"
                style={{ width: 160 }}
              />
              <Select
                value={inp.type}
                onChange={(v) => { const next = [...inputs]; next[idx] = { ...inp, type: v as SkillInput['type'] }; setInputs(next); }}
                options={INPUT_TYPE_OPTIONS}
                style={{ width: 130 }}
              />
              <Input
                value={inp.placeholder}
                onChange={(e) => { const next = [...inputs]; next[idx] = { ...inp, placeholder: e.target.value }; setInputs(next); }}
                placeholder={inp.type === 'select' ? '选项（逗号分隔）' : '占位提示'}
                style={{ width: 240 }}
              />
              <Select
                value={inp.required ? 'required' : 'optional'}
                onChange={(v) => { const next = [...inputs]; next[idx] = { ...inp, required: v === 'required' }; setInputs(next); }}
                options={[{ value: 'required', label: '必填' }, { value: 'optional', label: '选填' }]}
                style={{ width: 90 }}
              />
            </Space>
          </Card>
        ))}
      </Card>

      <Card
        size="small"
        title="执行步骤"
        style={{ marginBottom: 16 }}
        extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setSteps([...steps, emptyStep()])}>添加</Button>}
      >
        {steps.map((step, idx) => (
          <Card key={step.id} size="small" type="inner" style={{ marginBottom: 8 }}
            title={<span>步骤 {idx + 1} · <Typography.Text code style={{ fontSize: 12 }}>{step.id}</Typography.Text></span>}
            extra={<Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setSteps(steps.filter((_, i) => i !== idx))} disabled={steps.length <= 1} />}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Input
                value={step.name}
                onChange={(e) => { const next = [...steps]; next[idx] = { ...step, name: e.target.value }; setSteps(next); }}
                placeholder="步骤名称 *（例如：生成初稿）"
                style={{ width: 300 }}
              />
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Prompt 模板 *（用 {'{字段ID}'} 引用输入，用 {'{步骤ID}'} 引用前序步骤输出）
                </Typography.Text>
                <Input.TextArea
                  value={step.promptTemplate}
                  onChange={(e) => { const next = [...steps]; next[idx] = { ...step, promptTemplate: e.target.value }; setSteps(next); }}
                  placeholder={'你是一位学术助理。请根据以下信息完成任务。\n\n用户输入：{input_id}\n前序结果：{step_id}'}
                  autoSize={{ minRows: 4, maxRows: 14 }}
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                />
              </div>
            </Space>
          </Card>
        ))}
      </Card>

      <Divider />

      <Space>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
          保存并执行
        </Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>
          导出 JSON
        </Button>
        <Upload accept=".json" showUploadList={false} beforeUpload={handleImport}>
          <Button icon={<UploadOutlined />}>导入 JSON</Button>
        </Upload>
      </Space>
    </AppShell>
  );
}
