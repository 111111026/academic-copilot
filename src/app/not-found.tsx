'use client';

import { Button, Result } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import Link from 'next/link';
import AppShell from '@/components/AppShell';

export default function NotFound() {
  return (
    <AppShell>
      <Result
        status="404"
        title="页面不存在"
        subTitle="地址可能拼错了，或者这个页面在本地静态站点里没有对应的文件。"
        extra={
          <Link href="/workspace">
            <Button type="primary" icon={<HomeOutlined />}>
              回到文献工作台
            </Button>
          </Link>
        }
      />
    </AppShell>
  );
}
