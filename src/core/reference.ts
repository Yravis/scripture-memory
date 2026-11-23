export interface ParsedRef {
  book: string;
  chapter: number;
  start: number;
  end: number | null;
}

const RE = /^\s*((?:[1-3]|i{1,3})?\s*\.?\s*[a-z]+(?:\s+(?:of\s+)?[a-z]+)*?)\s+(\d+)\s*:\s*(\d+)(?:\s*[-–—]\s*(\d+))?\s*$/i;

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3' };

function titleCase(s: string): string {
  return s
    .split(' ')
    .map((w) => (w === 'of' ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

export function parseReference(input: string): ParsedRef | null {
  const m = RE.exec(input.replace(/\s+/g, ' '));
  if (!m) return null;
  let book = m[1].toLowerCase().replace(/\./g, '').trim();
  const lead = /^(i{1,3}|[1-3])\s*(.*)$/.exec(book);
  if (lead && lead[2]) book = `${ROMAN[lead[1]] ?? lead[1]} ${lead[2]}`;
  if (book === 'psalms') book = 'psalm';
  if (book === 'song of songs') book = 'song of solomon';
  const chapter = Number(m[2]);
  const start = Number(m[3]);
  const end = m[4] ? Number(m[4]) : null;
  if (!chapter || !start) return null;
  if (end !== null && end <= start) return end === start ? { book: titleCase(book), chapter, start, end: null } : null;
  return { book: titleCase(book), chapter, start, end };
}

export function formatReference(p: ParsedRef): string {
  return `${p.book} ${p.chapter}:${p.start}${p.end ? '-' + p.end : ''}`;
}

/** Canonical reference string, or null if unparseable. */
export function canonicalRef(input: string): string | null {
  const p = parseReference(input);
  return p ? formatReference(p) : null;
}

export function sameRef(a: string, b: string): boolean {
  const x = canonicalRef(a);
  const y = canonicalRef(b);
  return !!x && !!y && x.toLowerCase() === y.toLowerCase();
}

export function apiUrl(ref: string): string {
  return `https://bible-api.com/${encodeURIComponent(ref)}?translation=kjv`;
}

export const STARTERS = [
  'John 3:16',
  'Joshua 1:9',
  'Proverbs 3:5-6',
  'Romans 8:28',
  'Philippians 4:6-7',
  'Philippians 4:13',
  'Isaiah 40:31',
  'Psalm 23:1',
  'Psalm 119:11',
  'Jeremiah 29:11',
  'Matthew 6:33',
  '2 Timothy 3:16-17',
  'Romans 12:2',
  'Ephesians 2:8-9',
  'Galatians 2:20',
];
