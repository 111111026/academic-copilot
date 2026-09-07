import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Paper, TextChunk } from '@/types/paper';
import type { Comparison } from '@/types/compare';
import type { SkillExecution } from '@/types/execution';
import type { Skill } from '@/types/skill';

class AcademicCopilotDB extends Dexie {
  papers!: Table<Paper, string>;
  chunks!: Table<TextChunk, string>;
  comparisons!: Table<Comparison, string>;
  skillExecutions!: Table<SkillExecution, string>;
  customSkills!: Table<Skill, string>;

  constructor() {
    super('academic-copilot');
    this.version(1).stores({
      papers: 'id, title, addedAt, year, source',
      chunks: 'id, paperId, chunkIndex',
    });
    this.version(2).stores({
      papers: 'id, title, addedAt, year, source',
      chunks: 'id, paperId, chunkIndex',
      comparisons: 'id, createdAt',
    });
    this.version(3).stores({
      papers: 'id, title, addedAt, year, source',
      chunks: 'id, paperId, chunkIndex',
      comparisons: 'id, createdAt',
      skillExecutions: 'id, skillId, startedAt, status',
      customSkills: 'id, name, category',
    });
  }
}

const db = new AcademicCopilotDB();

// ===== 响应式 hooks（封装 useLiveQuery，页面不再直接依赖 Dexie） =====

export function usePapersByDate(): Paper[] {
  return useLiveQuery(() => db.papers.orderBy('addedAt').reverse().toArray(), [], [] as Paper[]);
}

export function useAllPapers(): Paper[] {
  return useLiveQuery(() => db.papers.toArray(), [], [] as Paper[]);
}

export function usePaper(id: string | null): Paper | null | undefined {
  return useLiveQuery(async () => (id ? (await db.papers.get(id)) ?? null : null), [id]);
}

export function useComparisonsByDate(): Comparison[] {
  return useLiveQuery(() => db.comparisons.orderBy('createdAt').reverse().toArray(), [], [] as Comparison[]);
}

// ===== 一次性读取 =====

export async function getAllPapers(): Promise<Paper[]> {
  return db.papers.toArray();
}

export async function getCustomSkills(): Promise<Skill[]> {
  return db.customSkills.toArray();
}

export async function getCustomSkill(id: string): Promise<Skill | undefined> {
  return db.customSkills.get(id);
}

export async function getExecution(id: string): Promise<SkillExecution | undefined> {
  return db.skillExecutions.get(id);
}

export async function getExecutionsByDate(): Promise<SkillExecution[]> {
  return db.skillExecutions.orderBy('startedAt').reverse().toArray();
}

// ===== 写操作 =====

export async function savePaper(paper: Paper): Promise<void> {
  await db.transaction('rw', db.papers, db.chunks, async () => {
    await db.papers.put(paper);
    await db.chunks.bulkPut(paper.chunks ?? []);
  });
}

export async function updatePaperSummary(id: string, summary: string): Promise<void> {
  await db.papers.update(id, { summary });
}

export async function deletePaper(id: string): Promise<void> {
  await db.transaction('rw', db.papers, db.chunks, async () => {
    await db.papers.delete(id);
    await db.chunks.where('paperId').equals(id).delete();
  });
}

export async function saveComparison(comparison: Comparison): Promise<void> {
  await db.comparisons.put(comparison);
}

export async function deleteComparison(id: string): Promise<void> {
  await db.comparisons.delete(id);
}

export async function saveExecution(execution: SkillExecution): Promise<void> {
  await db.skillExecutions.put(execution);
}

export async function deleteExecution(id: string): Promise<void> {
  await db.skillExecutions.delete(id);
}

export async function saveCustomSkill(skill: Skill): Promise<void> {
  await db.customSkills.put(skill);
}

export async function deleteCustomSkill(id: string): Promise<void> {
  await db.customSkills.delete(id);
}
