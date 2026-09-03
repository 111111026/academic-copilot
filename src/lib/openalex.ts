import type { SearchResult, SearchPage, SearchSource } from '@/types/search';

const BASE = 'https://api.openalex.org/works';

// arXiv 官方 API 不返回 Access-Control-Allow-Origin，浏览器直连必被 CORS 拦截。
// OpenAlex 索引了 arXiv 全库（source S4306400194，约 320 万条）且开放 CORS，
// 因此「arXiv 检索」走 OpenAlex 按来源过滤实现，保持零后端。
export const ARXIV_SOURCE_ID = 'S4306400194';

interface OpenAlexWork {
  id: string;
  doi: string | null;
  title: string | null;
  display_name?: string | null;
  publication_year: number | null;
  cited_by_count?: number;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: { author?: { display_name?: string | null } }[];
  primary_location?: { source?: { display_name?: string | null } | null } | null;
  landing_page_url?: string | null;
  open_access?: { oa_url?: string | null } | null;
}

interface OpenAlexResponse {
  results: OpenAlexWork[];
  meta?: { count?: number; page?: number; per_page?: number };
}

export interface OpenAlexSearchOptions {
  page?: number;
  perPage?: number;
  sourceId?: string;
  sourceLabel?: SearchSource;
  signal?: AbortSignal;
}

// OpenAlex 不直接返回摘要字符串，而是「词 → 出现位置数组」的倒排索引，需按位置还原
function rebuildAbstract(index?: Record<string, number[]> | null): string {
  if (!index) return '';
  const slots: [number, string][] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) slots.push([pos, word]);
  }
  return slots
    .sort((a, b) => a[0] - b[0])
    .map(([, word]) => word)
    .join(' ');
}

// OpenAlex 的 doi 形如 https://doi.org/10.1234/xxx，入库前剥掉前缀
function normalizeDoi(doi?: string | null): string | undefined {
  if (!doi) return undefined;
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') || undefined;
}

// arXiv 预印本的 landing_page_url 常为 null，但 DOI 固定是 10.48550/arxiv.<id>，可据此还原原文页
function arxivAbsUrl(doi?: string): string | undefined {
  const match = doi?.match(/^10\.48550\/arxiv\.(.+)$/i);
  return match ? `https://arxiv.org/abs/${match[1]}` : undefined;
}

function toSearchResult(work: OpenAlexWork, label: SearchSource): SearchResult {
  const doi = normalizeDoi(work.doi);
  const oaUrl = work.open_access?.oa_url ?? undefined;
  const url =
    arxivAbsUrl(doi) || work.landing_page_url || oaUrl || (doi ? `https://doi.org/${doi}` : undefined);
  return {
    key: work.id,
    source: label,
    title: (work.title || work.display_name || '（无标题）').replace(/\s+/g, ' ').trim(),
    authors: (work.authorships ?? [])
      .map((a) => a.author?.display_name)
      .filter((n): n is string => typeof n === 'string' && n.trim() !== ''),
    year: work.publication_year ?? null,
    abstract: rebuildAbstract(work.abstract_inverted_index),
    doi,
    url,
    pdfUrl: oaUrl && /arxiv\.org\/pdf\//i.test(oaUrl) ? oaUrl : undefined,
    venue: work.primary_location?.source?.display_name ?? undefined,
    citedBy: work.cited_by_count ?? undefined,
  };
}

export async function searchOpenAlex(
  query: string,
  options: OpenAlexSearchOptions = {},
): Promise<SearchPage> {
  const page = options.page ?? 1;
  const perPage = Math.min(options.perPage ?? 25, 50);
  const label = options.sourceLabel ?? 'openalex';
  const params = new URLSearchParams({
    search: query,
    page: String(page),
    'per-page': String(perPage),
  });
  if (options.sourceId) params.set('filter', `primary_location.source.id:${options.sourceId}`);

  const response = await fetch(`${BASE}?${params.toString()}`, { signal: options.signal });
  if (!response.ok) {
    throw new Error(`OpenAlex 返回 ${response.status}：${(await response.text().catch(() => '')).slice(0, 200)}`);
  }
  const data = (await response.json()) as OpenAlexResponse;
  return {
    results: (data.results ?? []).map((w) => toSearchResult(w, label)),
    total: data.meta?.count ?? 0,
    page: data.meta?.page ?? page,
    perPage: data.meta?.per_page ?? perPage,
  };
}
