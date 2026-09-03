export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  source: 'upload' | 'openalex' | 'arxiv' | 'manual';
  doi?: string;
  url?: string;
  fullText?: string;
  chunks?: TextChunk[];
  summary?: string;
  addedAt: number;
  fileSize?: number;
  pageCount?: number;
}

export interface TextChunk {
  id: string;
  paperId: string;
  content: string;
  chunkIndex: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
