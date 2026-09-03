'use client';

import { Button, Result, Space, Typography } from 'antd';
import { HomeOutlined, ReloadOutlined } from '@ant-design/icons';
import Link from 'next/link';

// 刻意不复用 AppShell：这一层是页面级崩溃的兜底，而异常很可能正来自 AppShell 本身
// （每个页面都套着它）。边界自己的 fallback 再抛错，React 会反复重试直到主线程卡死，
// 实测就是整页白屏且无响应。所以这里只依赖 antd 与 next/link。
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 24,
      }}
    >
      <Result
        status="error"
        title="页面渲染出错了"
        subTitle="这一页在渲染时抛出了异常。文献、执行记录与设置都存在浏览器本地，不会因此丢失。"
        extra={
          <Space>
            <Button type="primary" icon={<ReloadOutlined />} onClick={reset}>
              重试
            </Button>
            <Link href="/workspace">
              <Button icon={<HomeOutlined />}>回到文献工作台</Button>
            </Link>
          </Space>
        }
      >
        {/* 纯前端部署没有服务端日志，出错时这行是用户唯一能提供给你的线索 */}
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          {error.message || error.digest || '未提供错误详情'}
        </Typography.Paragraph>
      </Result>
    </div>
  );
}
