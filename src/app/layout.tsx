import type { Metadata } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import './globals.css';

export const metadata: Metadata = {
  title: '研途智伴 Academic Copilot',
  description:
    '研究生 AI 学术工具：文献阅读、检索、对比、写作辅助、数据与代码、导师沟通，以及可自定义的多步 Skills。纯前端部署，自带 API Key，数据仅存本机。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <ConfigProvider locale={zhCN}>{children}</ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
