import { chat } from '@/lib/llm';
import { PROMPTS } from '@/config/prompts';
import type { Paper } from '@/types/paper';
import type { Settings } from '@/types/settings';

type LlmConfig = Settings['llm'];

export async function enrichMetadata(
  paper: Paper,
  llm: LlmConfig,
): Promise<Paper> {
  if (!llm.apiKey || !paper.fullText) return paper;
  try {
    const reply = await chat(llm, {
      messages: [
        { role: 'system', content: PROMPTS.extractTitle.systemPrompt },
        { role: 'user', content: paper.fullText.slice(0, 3000) },
      ],
      temperature: 0,
      maxTokens: 300,
    });
    const cleaned = reply.trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
    const json = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned);
    return {
      ...paper,
      title:
        typeof json.title === 'string' && json.title.trim() ? json.title.trim() : paper.title,
      authors: Array.isArray(json.authors)
        ? json.authors.filter(
            (a: unknown): a is string => typeof a === 'string' && a.trim() !== '',
          )
        : paper.authors,
      year:
        typeof json.year === 'number' && Number.isFinite(json.year) ? json.year : paper.year,
    };
  } catch {
    return paper;
  }
}
