import type { Paper } from '@/types/paper';

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 5;

/** 全部论文合计的字符预算，按篇数均分，避免 5 篇全文撑爆上下文 */
const TOTAL_CHAR_BUDGET = 24000;
const MIN_PER_PAPER = 3000;

export type CompareBasis = 'summary' | 'fulltext' | 'abstract' | 'none';

export const BASIS_LABEL: Record<CompareBasis, string> = {
  summary: '已总结',
  fulltext: '全文',
  abstract: '仅摘要',
  none: '无内容',
};

/**
 * 上传的 PDF 其 abstract 只是正文前 300 字的碎片，检索导入的条目则没有 fullText，
 * 所以优先级是「结构化总结 → 全文 → 摘要」，两条入库路径都能拿到当前最好的素材。
 */
export function compareBasis(paper: Paper): CompareBasis {
  if (paper.summary?.trim()) return 'summary';
  if (paper.fullText?.trim()) return 'fulltext';
  if (paper.abstract?.trim()) return 'abstract';
  return 'none';
}

export function buildCompareInput(papers: Paper[]): string {
  const budget = Math.max(MIN_PER_PAPER, Math.floor(TOTAL_CHAR_BUDGET / papers.length));
  return papers
    .map((paper, i) => {
      const basis = compareBasis(paper);
      const body =
        (basis === 'summary'
          ? paper.summary
          : basis === 'fulltext'
            ? paper.fullText
            : paper.abstract) ?? '';
      const lines = [
        `【论文 ${i + 1}】`,
        `标题：${paper.title}`,
        paper.authors.length ? `作者：${paper.authors.join(', ')}` : '',
        paper.year ? `年份：${paper.year}` : '',
        paper.venue ? `来源：${paper.venue}` : '',
        basis === 'summary' ? '以下是已生成的结构化总结：' : '以下是原文节选：',
        body.slice(0, budget),
      ];
      return lines.filter(Boolean).join('\n');
    })
    .join('\n\n');
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/**
 * 按未转义的 `|` 切分一行。必须边扫描边处理反斜杠转义：
 * 先 split 再还原会让含 `\|` 的单元格被切成多列，整行右移，
 * 随后按表头对齐时把尾部维度静默截掉。
 * 不用正则后行断言，旧版 Safari 解析含 lookbehind 的正则字面量会直接抛语法错误。
 */
function splitCells(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') {
      current += '|';
      i++;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  // 行首行尾的管道只是表格边框，会各产生一个空单元
  if (cells.length > 1 && cells[0] === '') cells.shift();
  if (cells.length > 1 && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

/**
 * 模型按 systemPrompt 输出 Markdown 表格，但导出 CSV 和结构化展示都需要二维数组。
 * 解析失败（模型没按表格格式回答）时返回 null，由调用方降级为直接渲染 Markdown。
 */
export function parseMarkdownTable(markdown: string): ParsedTable | null {
  const isSeparator = (cells: string[]) =>
    cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));

  const rows = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map(splitCells)
    .filter((cells) => cells.some((c) => c !== ''));

  if (rows.length < 2 || isSeparator(rows[0])) return null;

  const headers = rows[0];
  const body = rows.slice(1).filter((cells) => !isSeparator(cells));
  if (!body.length) return null;

  const width = headers.length;
  return {
    headers,
    // 模型偶尔漏列或多列，按表头宽度对齐，否则表格会整体错位
    rows: body.map((cells) =>
      cells.length === width
        ? cells
        : cells.length < width
          ? [...cells, ...Array<string>(width - cells.length).fill('')]
          : cells.slice(0, width),
    ),
  };
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Excel 按本地编码打开 CSV，不加 BOM 中文表头会乱码 */
export function tableToCsv(table: ParsedTable): string {
  const lines = [table.headers, ...table.rows].map((row) => row.map(csvCell).join(','));
  return '\ufeff' + lines.join('\r\n');
}

function formatStamp(date: Date, separator: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${separator}${pad(date.getMonth() + 1)}${separator}${pad(date.getDate())}`;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function compareFilename(extension: 'md' | 'csv', createdAt: number): string {
  const date = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `文献对比_${stamp}.${extension}`;
}

export function buildMarkdownDocument(
  result: string,
  titles: string[],
  createdAt: number,
): string {
  return [
    '# 文献对比',
    '',
    `生成时间：${formatStamp(new Date(createdAt), '-')}`,
    '',
    '对比文献：',
    '',
    ...titles.map((title, i) => `${i + 1}. ${title}`),
    '',
    result.trim(),
    '',
    '---',
    '',
    '> 本表格由 AI 生成，仅供研究辅助。请核对原文后使用，并遵守学术诚信规范。',
    '',
  ].join('\n');
}
