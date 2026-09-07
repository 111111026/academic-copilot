import { v4 as uuidv4 } from 'uuid';
import type { Paper, TextChunk } from '@/types/paper';

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

export async function extractPdfText(file: File): Promise<{ text: string; pageCount: number }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pageTexts.push(text);
  }

  const fullText = pageTexts.filter(Boolean).join('\n\n');
  return { text: fullText, pageCount: doc.numPages };
}

export function chunkText(paperId: string, text: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  if (!text) return chunks;
  let index = 0;
  for (let start = 0; start < text.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    const content = text.slice(start, start + CHUNK_SIZE).trim();
    if (!content) break;
    chunks.push({ id: uuidv4(), paperId, content, chunkIndex: index++ });
    if (start + CHUNK_SIZE >= text.length) break;
  }
  return chunks;
}

export interface UploadedPaperInput {
  file: File;
  title?: string;
  authors?: string[];
  year?: number | null;
  abstract?: string;
}

export async function buildPaperFromPdf(input: UploadedPaperInput): Promise<Paper> {
  const id = uuidv4();
  const { text, pageCount } = await extractPdfText(input.file);
  if (!text) {
    throw new Error(
      `「${input.file.name}」无法提取文本。可能是扫描版 PDF（无文字层），当前版本暂不支持 OCR。`,
    );
  }
  return {
    id,
    title: input.title || input.file.name.replace(/\.pdf$/i, ''),
    authors: input.authors ?? [],
    year: input.year ?? null,
    abstract: input.abstract ?? text.slice(0, 300),
    source: 'upload',
    fullText: text,
    chunks: chunkText(id, text),
    addedAt: Date.now(),
    fileSize: input.file.size,
    pageCount,
  };
}

// 中文无空格分词，整句当单个 token 会导致检索恒不命中，故拆成「ASCII 词 + CJK 二元组」
function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  for (const word of lower.match(/[a-z0-9][a-z0-9._-]*/g) ?? []) {
    if (word.length >= 2) tokens.push(word);
  }
  for (const run of lower.match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
  }
  return tokens;
}

// 轻量检索：按关键词重叠给 chunk 打分，取 top K 拼上下文
export function retrieveContext(chunks: TextChunk[], query: string, topK = 6): string {
  if (!chunks.length) return '';
  const terms = Array.from(new Set(tokenize(query)));
  const join = (list: TextChunk[]) => list.map((c) => c.content).join('\n---\n');
  if (!terms.length) return join(chunks.slice(0, topK));

  const scored = chunks
    .map((chunk) => {
      const lower = chunk.content.toLowerCase();
      return { chunk, score: terms.reduce((sum, t) => sum + (lower.includes(t) ? 1 : 0), 0) };
    })
    .sort((a, b) => b.score - a.score || a.chunk.chunkIndex - b.chunk.chunkIndex);

  const hits = scored.filter((s) => s.score > 0).slice(0, topK);
  const picked = hits.length ? hits : scored.slice(0, topK);
  // 按原文顺序拼接，避免打乱论文叙述逻辑
  return join(picked.sort((a, b) => a.chunk.chunkIndex - b.chunk.chunkIndex).map((s) => s.chunk));
}

export function base64ToFile(base64: string, name: string): File {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new File([bytes], name, { type: 'application/pdf' });
}
