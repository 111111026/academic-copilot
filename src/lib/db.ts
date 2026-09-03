import Dexie, { type Table } from 'dexie';
import type { Paper, TextChunk } from '@/types/paper';
import type { Comparison } from '@/types/compare';

class AcademicCopilotDB extends Dexie {
  papers!: Table<Paper, string>;
  chunks!: Table<TextChunk, string>;
  comparisons!: Table<Comparison, string>;

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
  }
}

export const db = new AcademicCopilotDB();

export async function savePaper(paper: Paper): Promise<void> {
  await db.transaction('rw', db.papers, db.chunks, async () => {
    await db.papers.put(paper);
    await db.chunks.bulkPut(paper.chunks ?? []);
  });
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
