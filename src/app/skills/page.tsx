'use client';

import { useEffect, useState } from 'react';
import { Card, Col, Row, Tag, Typography, Segmented, Empty, Button, Space } from 'antd';
import { ThunderboltOutlined, PlusOutlined, HistoryOutlined } from '@ant-design/icons';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { BUILTIN_SKILLS } from '@/config/skills';
import { getCustomSkills } from '@/lib/db';
import type { Skill } from '@/types/skill';

const CATEGORY_LABEL: Record<string, string> = {
  reading: '文献阅读',
  writing: '学术写作',
  research: '研究设计',
  data: '数据与代码',
  communication: '沟通汇报',
  custom: '自定义',
};

type Filter = 'all' | 'builtin' | 'custom';

export default function SkillsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [customSkills, setCustomSkills] = useState<Skill[]>([]);

  useEffect(() => {
    getCustomSkills().then(setCustomSkills);
  }, []);

  const all: Skill[] = [...BUILTIN_SKILLS, ...customSkills];
  const shown =
    filter === 'builtin' ? BUILTIN_SKILLS : filter === 'custom' ? customSkills : all;

  return (
    <AppShell>
      <Typography.Title level={3} style={{ marginBottom: 8 }}>
        Skills 中心
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        多步骤学术工作流：填写输入 → 逐步执行 → 每步结果可独立查看与导出。不是单次问答，而是完整的任务链。
      </Typography.Paragraph>

      <Space style={{ marginBottom: 16 }}>
        <Link href="/skills/create">
          <Button icon={<PlusOutlined />}>创建自定义 Skill</Button>
        </Link>
        <Link href="/skills/history">
          <Button icon={<HistoryOutlined />}>执行历史</Button>
        </Link>
      </Space>

      <Segmented<Filter>
        options={[
          { value: 'all', label: `全部 (${all.length})` },
          { value: 'builtin', label: `内置 (${BUILTIN_SKILLS.length})` },
          { value: 'custom', label: `自定义 (${customSkills.length})` },
        ]}
        value={filter}
        onChange={setFilter}
        style={{ marginBottom: 16 }}
      />

      {shown.length === 0 ? (
        <Empty description="暂无自定义 Skill" />
      ) : (
        <Row gutter={[16, 16]}>
          {shown.map((skill) => (
            <Col key={skill.id} xs={24} sm={12} lg={8}>
              <Link href={`/skills/run?id=${skill.id}`}>
                <Card
                  hoverable
                  size="small"
                  style={{ height: '100%' }}
                  title={
                    <span>
                      {skill.icon} {skill.name}
                    </span>
                  }
                  extra={
                    <Tag color={skill.isBuiltin ? 'blue' : 'green'}>
                      {skill.isBuiltin ? '内置' : '自定义'}
                    </Tag>
                  }
                >
                  <Typography.Paragraph
                    type="secondary"
                    ellipsis={{ rows: 2 }}
                    style={{ marginBottom: 8, minHeight: 44 }}
                  >
                    {skill.description}
                  </Typography.Paragraph>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {skill.tags.map((t) => (
                      <Tag key={t} style={{ fontSize: 11 }}>
                        {t}
                      </Tag>
                    ))}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    <ThunderboltOutlined style={{ marginRight: 4 }} />
                    {skill.steps.length} 步 · {CATEGORY_LABEL[skill.category] ?? skill.category}
                  </Typography.Text>
                </Card>
              </Link>
            </Col>
          ))}
        </Row>
      )}
    </AppShell>
  );
}
