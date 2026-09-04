'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Empty, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { db, deleteExecution } from '@/lib/db';
import type { SkillExecution } from '@/types/execution';

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  completed: { color: 'green', label: '完成' },
  failed: { color: 'red', label: '中断' },
  cancelled: { color: 'orange', label: '取消' },
  running: { color: 'blue', label: '执行中' },
};

export default function HistoryPage() {
  const [executions, setExecutions] = useState<SkillExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageApi, contextHolder] = message.useMessage();

  const load = () => {
    db.skillExecutions
      .orderBy('startedAt')
      .reverse()
      .toArray()
      .then((rows) => {
        setExecutions(rows);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const handleDelete = async (id: string) => {
    await deleteExecution(id);
    messageApi.success('已删除');
    load();
  };

  const columns = [
    {
      title: 'Skill',
      dataIndex: 'skillName',
      key: 'skillName',
      width: 160,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s: string) => {
        const m = STATUS_MAP[s] ?? { color: 'default', label: s };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '步骤',
      key: 'steps',
      width: 100,
      render: (_: unknown, r: SkillExecution) =>
        `${r.steps.filter((s) => s.status === 'completed').length}/${r.steps.length}`,
    },
    {
      title: '时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 170,
      render: (t: number) => new Date(t).toLocaleString('zh-CN'),
    },
    {
      title: '耗时',
      key: 'duration',
      width: 80,
      render: (_: unknown, r: SkillExecution) =>
        r.completedAt ? `${((r.completedAt - r.startedAt) / 1000).toFixed(1)}s` : '—',
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: unknown, r: SkillExecution) => (
        <Space size="small">
          <Link href={`/skills/run?id=${r.skillId}&exec=${r.id}`}>
            <Button size="small" type="text" icon={<EyeOutlined />}>
              查看
            </Button>
          </Link>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

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
        执行历史
      </Typography.Title>

      <Card size="small">
        {executions.length === 0 && !loading ? (
          <Empty description="暂无执行记录" />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={executions}
            loading={loading}
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: false }}
          />
        )}
      </Card>
    </AppShell>
  );
}
