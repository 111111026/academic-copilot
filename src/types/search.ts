export type SearchSource = 'openalex' | 'arxiv';

// OpenAlex 与 arXiv 字段差异较大，统一收敛到这个形状后再入库
export interface SearchResult {
  key: string;
  source: SearchSource;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  doi?: string;
  url?: string;
  pdfUrl?: string;
  venue?: string;
  citedBy?: number;
}

export interface SearchPage {
  results: SearchResult[];
  total: number;
  page: number;
  perPage: number;
}
