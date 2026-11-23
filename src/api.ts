import { apiUrl } from './core/reference';

export function cleanText(s: string): string {
  return s.replace(/[¶¶]/g, '').replace(/\s+/g, ' ').trim();
}

export async function fetchVerse(ref: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(apiUrl(ref), { signal: ctrl.signal });
    if (res.status === 404) throw new Error('Reference not found. Check the book, chapter and verse.');
    if (res.status === 429) throw new Error('Too many requests right now. Wait a few seconds and try again.');
    if (!res.ok) throw new Error(`Couldn't fetch the verse (error ${res.status}).`);
    const j = await res.json();
    const text = cleanText(String(j.text ?? ''));
    if (!text) throw new Error('No text returned for that reference.');
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('Timed out. Check your connection or paste the text yourself.');
    if (e instanceof TypeError) throw new Error("Can't reach bible-api.com (offline?). You can paste the text yourself.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
