'use client';

import { Button, ConfigProvider, Result, Space, Typography } from 'antd';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import zhCN from 'antd/locale/zh_CN';

// 根布局崩了才会走到这里，所以刻意不复用 AppShell：
// 如果异常正是 AppShell 抛的，再渲染一次只会又掉回同一个坑。
// 同理不依赖 Next 的客户端路由，跳转一律走浏览器原生行为。
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <ConfigProvider locale={zhCN}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
              <Result
                status="error"
                title="研途智伴 出错了"
                subTitle="应用整体渲染失败。数据都存在浏览器本地（IndexedDB 与 localStorage），刷新通常就能恢复；如果反复出现，请清理站点数据后重试。"
                extra={
                  <Space>
                    <Button type="primary" onClick={reset}>
                      重试
                    </Button>
                    <Button onClick={() => { window.location.href = '/'; }}>回到首页</Button>
                  </Space>
                }
              >
                {/* 纯前端部署没有服务端日志，出错时这行是用户唯一能提供给你的线索 */}
                <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                  {error.message || error.digest || '未提供错误详情'}
                </Typography.Paragraph>
              </Result>
            </div>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
