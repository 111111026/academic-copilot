'use client';

import { Layout, Menu } from 'antd';
import {
  FileTextOutlined,
  ReadOutlined,
  SearchOutlined,
  SettingOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSettings } from '@/lib/settings';
import type { ReactNode } from 'react';

const { Sider, Content, Header } = Layout;

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const darkMode = useSettings((s) => s.settings.ui.theme === 'dark');

  const items = [
    { key: '/workspace', icon: <ReadOutlined />, label: <Link href="/workspace">文献工作台</Link> },
    { key: '/search', icon: <SearchOutlined />, label: <Link href="/search">文献检索</Link> },
    { key: '/compare', icon: <SwapOutlined />, label: <Link href="/compare">文献对比</Link> },
    { key: '/settings', icon: <SettingOutlined />, label: <Link href="/settings">设置</Link> },
  ];

  const selected =
    pathname.startsWith('/workspace') || pathname === '/' ? '/workspace' : pathname;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme={darkMode ? 'dark' : 'light'} width={200}>
        <div
          style={{
            padding: '20px 16px',
            fontSize: 18,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <FileTextOutlined />
          研途智伴
        </div>
        <Menu
          mode="inline"
          theme={darkMode ? 'dark' : 'light'}
          selectedKeys={[selected]}
          items={items}
        />
        <div style={{ position: 'absolute', bottom: 12, left: 16, right: 16, fontSize: 12, opacity: 0.5 }}>
          MVP v0.1.0 · 数据仅存本地
        </div>
      </Sider>
      <Layout>
        <Header
          style={{
            background: 'transparent',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            AI 生成内容仅供辅助，请遵守学术诚信规范
          </span>
        </Header>
        <Content style={{ padding: '0 24px 24px', maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
