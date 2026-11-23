const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function utc(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  return new Date(utc(key) + n * 86400000).toISOString().slice(0, 10);
}

/** a - b in whole days */
export function diffDays(a: string, b: string): number {
  return Math.round((utc(a) - utc(b)) / 86400000);
}
