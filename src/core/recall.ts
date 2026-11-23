import { coreWord, displayWords } from './words';

export const PASS_THRESHOLD = 0.95;

const ARCHAIC: Record<string, string> = {
  thee: 'you', thou: 'you', ye: 'you', thy: 'your', thine: 'your', thyself: 'yourself',
  hath: 'has', doth: 'does', art: 'are', wast: 'was', wert: 'were', shalt: 'shall', wilt: 'will',
  hast: 'have', dost: 'do', saith: 'says', unto: 'to', hearken: 'listen',
};

/** Reduce archaic forms (thee/thou/-eth/-est) to a common form. */
export function modernize(w: string): string {
  if (ARCHAIC[w]) return ARCHAIC[w];
  if (w.length > 4 && w.endsWith('eth')) return w.slice(0, -3) + 's';
  if (w.length > 4 && w.endsWith('est')) return w.slice(0, -3);
  return w;
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Small typos tolerated: none for ≤3 letters, 1 for 4–7, 2 for 8+. */
export function wordsMatch(expected: string, typed: string, lenient = false): boolean {
  let a = coreWord(expected);
  let b = coreWord(typed);
  if (lenient) {
    a = modernize(a);
    b = modernize(b);
  }
  if (a === b) return true;
  const tol = a.length >= 8 ? 2 : a.length >= 4 ? 1 : 0;
  return tol > 0 && levenshtein(a, b, tol) <= tol;
}

export interface RecallResult {
  accuracy: number;
  matched: number;
  total: number;
  pass: boolean;
  /** per expected word: was it recalled */
  marks: { word: string; ok: boolean }[];
}

export function scoreRecall(expectedText: string, typedText: string, lenient = false): RecallResult {
  const exp = displayWords(expectedText).filter((w) => coreWord(w));
  const got = displayWords(typedText).filter((w) => coreWord(w));
  const n = exp.length;
  const m = got.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], wordsMatch(exp[i - 1], got[j - 1], lenient) ? dp[i - 1][j - 1] + 1 : 0);
    }
  }
  const ok = new Array<boolean>(n).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (wordsMatch(exp[i - 1], got[j - 1], lenient) && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ok[i - 1] = true;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  const matched = dp[n][m];
  const denom = Math.max(n, m);
  const accuracy = denom === 0 ? 0 : matched / denom;
  return {
    accuracy,
    matched,
    total: n,
    pass: accuracy >= PASS_THRESHOLD - 1e-9,
    marks: exp.map((word, k) => ({ word, ok: ok[k] })),
  };
}
