'use client';

import {
  Card,
  Form,
  Input,
  Select,
  Slider,
  InputNumber,
  Button,
  Space,
  Alert,
  message,
  Typography,
} from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import AppShell from '@/components/AppShell';
import { useSettings } from '@/lib/settings';
import { PROVIDER_PRESETS } from '@/config/settings';
import type { LlmProvider } from '@/types/settings';
import { chat } from '@/lib/llm';

export default function SettingsPage() {
  const { settings, updateLlm, setProvider, updateUi } = useSettings();
  const [messageApi, contextHolder] = message.useMessage();

  const onTest = async () => {
    try {
      const reply = await chat(settings.llm, {
        messages: [{ role: 'user', content: '请只回复：连接成功' }],
        maxTokens: 20,
      });
      messageApi.success(`连接成功：${reply.trim().slice(0, 50)}`);
    } catch (e) {
      messageApi.error(`连接失败：${(e as Error).message}`);
    }
  };

  return (
    <AppShell>
      {contextHolder}
      <Typography.Title level={3}>设置</Typography.Title>

      <Card title="LLM 服务配置（自带 API Key）" style={{ marginBottom: 24 }}>
        <Form layout="vertical" style={{ maxWidth: 640 }}>
          <Form.Item label="服务商">
            <Select<LlmProvider>
              value={settings.llm.provider}
              onChange={(v) => setProvider(v)}
              options={Object.entries(PROVIDER_PRESETS).map(([value, p]) => ({
                value: value as LlmProvider,
                label: p.label,
              }))}
            />
          </Form.Item>
          <Form.Item label="API Base URL" required>
            <Input
              value={settings.llm.baseUrl}
              onChange={(e) => updateLlm({ baseUrl: e.target.value })}
              placeholder="https://api.deepseek.com/v1"
            />
          </Form.Item>
          <Form.Item label="API Key" required extra="仅保存在你自己的浏览器 localStorage 中">
            <Input.Password
              value={settings.llm.apiKey}
              onChange={(e) => updateLlm({ apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </Form.Item>
          <Form.Item label="模型" required>
            <Input
              value={settings.llm.model}
              onChange={(e) => updateLlm({ model: e.target.value })}
              placeholder="deepseek-chat"
            />
          </Form.Item>
          <Form.Item label={`温度（temperature：${settings.llm.temperature}）`}>
            <Slider
              min={0}
              max={2}
              step={0.1}
              value={settings.llm.temperature}
              onChange={(v) => updateLlm({ temperature: v })}
              style={{ maxWidth: 320 }}
            />
          </Form.Item>
          <Form.Item label="最大输出 tokens">
            <InputNumber
              min={256}
              max={32768}
              step={256}
              value={settings.llm.maxTokens}
              onChange={(v) => updateLlm({ maxTokens: v ?? 4096 })}
            />
          </Form.Item>
          <Space>
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={onTest}>
              测试连接
            </Button>
          </Space>
        </Form>
      </Card>

      <Card title="界面">
        <Form layout="vertical" style={{ maxWidth: 320 }}>
          <Form.Item label="主题">
            <Select
              value={settings.ui.theme}
              onChange={(v) => updateUi({ theme: v })}
              options={[
                { value: 'light', label: '浅色' },
                { value: 'dark', label: '深色' },
              ]}
            />
          </Form.Item>
        </Form>
      </Card>

      <Alert
        style={{ marginTop: 24 }}
        type="info"
        showIcon
        title="隐私说明"
        description="本应用为纯前端应用，无后端服务器。你的 API Key 和所有文献数据都只保存在本机浏览器中，不会上传到任何第三方（除你自己配置的 LLM API）。"
      />
    </AppShell>
  );
}
