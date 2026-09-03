export interface ParsedReference {
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  doi?: string;
  url?: string;
  venue?: string;
  entryType: string;
  citeKey: string;
}

// BibTeX 值里的保护性花括号、转义符和 LaTeX 排版命令，展示前需要还原
function cleanValue(value: string): string {
  return value
    .replace(/\\([{}$%&#_~^\\])/g, '$1') // \& \{ 等转义符还原
    .replace(/\\[a-zA-Z]+\s*/g, ' ') // \em \textbf 等排版命令
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Last, First" → "First Last"；已是 "First Last" 的原样保留
function normalizeAuthor(raw: string): string {
  const name = cleanValue(raw);
  if (!name) return '';
  const comma = name.indexOf(',');
  if (comma === -1) return name;
  const last = name.slice(0, comma).trim();
  const first = name.slice(comma + 1).trim();
  return first ? `${first} ${last}` : last;
}

function parseFields(body: string): { citeKey: string; fields: Record<string, string> } {
  const firstComma = body.indexOf(',');
  const citeKey = (firstComma === -1 ? body : body.slice(0, firstComma)).trim();
  let pos = firstComma === -1 ? body.length : firstComma + 1;

  const fields: Record<string, string> = {};
  while (pos < body.length) {
    while (pos < body.length && /\s/.test(body[pos])) pos++;
    const nameStart = pos;
    while (pos < body.length && /[^\s=]/.test(body[pos])) pos++;
    const name = body.slice(nameStart, pos).toLowerCase();
    while (pos < body.length && /\s/.test(body[pos])) pos++;
    if (body[pos] !== '=') {
      pos++;
      continue;
    }
    pos++;
    while (pos < body.length && /\s/.test(body[pos])) pos++;

    const marker = body[pos];
    let value = '';
    if (marker === '{') {
      const start = pos;
      let depth = 0;
      for (; pos < body.length; pos++) {
        if (body[pos] === '{') depth++;
        else if (body[pos] === '}') {
          depth--;
          if (depth === 0) {
            pos++;
            break;
          }
        }
      }
      value = body.slice(start + 1, pos - 1);
    } else if (marker === '"') {
      const start = ++pos;
      while (pos < body.length && body[pos] !== '"') pos++;
      value = body.slice(start, pos);
      pos++;
    } else {
      const start = pos;
      while (pos < body.length && body[pos] !== ',') pos++;
      value = body.slice(start, pos);
    }
    if (name) fields[name] = value.trim();

    while (pos < body.length && body[pos] !== ',') pos++;
    pos++;
  }
  return { citeKey, fields };
}

interface RawEntry {
  entryType: string;
  body: string;
}

// 按花括号深度定位每条 @entry{...} 的闭合位置，避免值里的嵌套括号截断解析
function splitEntries(input: string): RawEntry[] {
  const entries: RawEntry[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const at = input.indexOf('@', cursor);
    if (at === -1) break;
    const head = /^@([A-Za-z]+)\s*([{(])/.exec(input.slice(at));
    if (!head) {
      cursor = at + 1;
      continue;
    }
    const open = head[2];
    const close = open === '{' ? '}' : ')';
    let depth = 0;
    let end = -1;
    for (let i = at + head[0].length - 1; i < input.length; i++) {
      if (input[i] === open) depth++;
      else if (input[i] === close && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) break; // 括号未闭合，后面的内容不可信
    entries.push({
      entryType: head[1].toLowerCase(),
      body: input.slice(at + head[0].length, end),
    });
    cursor = end + 1;
  }
  return entries;
}

export function parseBibtex(input: string): ParsedReference[] {
  return splitEntries(input).map(({ entryType, body }) => {
    const { citeKey, fields } = parseFields(body);
    const yearSource = fields.year || fields.date || '';
    const yearMatch = yearSource.match(/(1[89]\d{2}|20\d{2}|21\d{2})/);
    const doi = fields.doi ? cleanValue(fields.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : undefined;
    return {
      title: cleanValue(fields.title || ''),
      authors: (fields.author || '')
        .split(/\s+and\s+/i)
        .map(normalizeAuthor)
        .filter(Boolean),
      year: yearMatch ? Number(yearMatch[1]) : null,
      abstract: cleanValue(fields.abstract || ''),
      doi: doi || undefined,
      url: fields.url ? cleanValue(fields.url) : undefined,
      venue: cleanValue(fields.journal || fields.booktitle || fields.howpublished || '') || undefined,
      entryType,
      citeKey,
    };
  });
}
