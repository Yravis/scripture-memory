export function displayWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

const LEAD = /^[^\p{L}\p{N}]*/u;
const TRAIL = /[^\p{L}\p{N}]*$/u;

/** Word with surrounding punctuation stripped, lowercased. */
export function coreWord(w: string): string {
  return w.replace(/[’']/g, '').replace(LEAD, '').replace(TRAIL, '').toLowerCase();
}

/** First letter plus the word's surrounding punctuation: "shepherd;" -> "s;" */
export function firstLetterHint(w: string): string {
  const lead = LEAD.exec(w)?.[0] ?? '';
  const trail = TRAIL.exec(w.slice(lead.length))?.[0] ?? '';
  const core = w.slice(lead.length, w.length - trail.length);
  return lead + core.charAt(0) + trail;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: T[], seed: string): T[] {
  const r = rng(seed);
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Indices of words hidden at a given fraction; nested (25% ⊂ 50% ⊂ ...). */
export function hiddenIndices(count: number, fraction: number, seed: string): Set<number> {
  const order = shuffled([...Array(count).keys()], seed);
  return new Set(order.slice(0, Math.ceil(count * fraction)));
}

const STOP = new Set(
  'the and but for are was not you his her him they them that with this from have unto shall which will thou thee thy all were been when then there their into upon also let may our your who whom what'.split(' '),
);

/** Number of fill-in-the-blank words: 3 at first, growing to 5 with successful reviews. */
export function blankCount(passes: number, wordCount: number): number {
  return Math.max(1, Math.min(3 + Math.floor(passes / 2), 5, wordCount - 1));
}

export function pickBlanks(words: string[], count: number, seed: string): number[] {
  const idx = words.map((w, i) => ({ i, c: coreWord(w) }));
  const key = idx.filter((x) => x.c.length >= 4 && !STOP.has(x.c)).map((x) => x.i);
  const rest = idx.filter((x) => !key.includes(x.i) && x.c.length > 0).sort((a, b) => b.c.length - a.c.length).map((x) => x.i);
  const pool = [...shuffled(key, seed), ...rest];
  return pool.slice(0, count).sort((a, b) => a - b);
}
