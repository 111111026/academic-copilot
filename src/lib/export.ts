import type { Paper } from '@/types/paper';

export function paperToBibTeX(paper: Paper): string {
  const key =
    (paper.authors[0]?.split(' ')[0] || 'unknown') +
    (paper.year || '') +
    (paper.title?.split(' ')[0] || '');
  return `@article{${key},
  title={${paper.title || 'Untitled'}},
  author={${paper.authors.join(' and ')}},
  year={${paper.year || 'unknown'}},
  abstract={${paper.abstract || ''}}
}`;
}

export function paperToMarkdown(paper: Paper): string {
  return `# ${paper.title || 'Untitled'}

**作者**: ${paper.authors.join(', ') || '未知'}
**年份**: ${paper.year || '未知'}
**来源**: ${paper.source}

## 摘要

${paper.abstract || '无摘要'}

## 全文

${paper.fullText?.slice(0, 500) || '无内容'}...
`;
}

export type ExportFormat = 'json' | 'bibtex' | 'markdown';

export function formatPapers(papers: Paper[], format: ExportFormat): string {
  switch (format) {
    case 'bibtex':
      return papers.map(paperToBibTeX).join('\n\n');
    case 'markdown':
      return papers.map(paperToMarkdown).join('\n\n---\n\n');
    default:
      return JSON.stringify({ exportDate: new Date().toISOString(), papers }, null, 2);
  }
}

export function exportFilename(format: ExportFormat): string {
  switch (format) {
    case 'bibtex':
      return 'papers.bib';
    case 'markdown':
      return 'papers.md';
    default:
      return 'papers.json';
  }
}
