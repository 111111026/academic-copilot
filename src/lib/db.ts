import Dexie, { type Table } from 'dexie';
import type { Paper, TextChunk } from '@/types/paper';

class AcademicCopilotDB extends Dexie {
  papers!: Table<Paper, string>;
  chunks!: Table<TextChunk, string>;

  constructor() {
    super('academic-copilot');
    this.version(1).stores({
      papers: 'id, title, addedAt, year, source',
      chunks: 'id, paperId, chunkIndex',
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
