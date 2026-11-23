import { dayKey } from './core/dates';
import { applyRecall, newVerse, type RecallOutcome } from './core/scheduling';
import { MODE_POINTS, recallPoints, type RecallPoints } from './core/scoring';
import type { AppData, Mode, Verse } from './core/types';

const KEY = 'scripture-memory:v1';

const defaults = (): AppData => ({ version: 1, verses: [], settings: { lenient: false, theme: 'auto' }, points: 0, activity: [] });

function fixVerse(x: any, today: string): Verse | null {
  if (!x || typeof x.ref !== 'string' || typeof x.text !== 'string') return null;
  const v = newVerse(x.ref, x.text, !!x.custom, typeof x.addedAt === 'string' ? x.addedAt : today);
  return {
    ...v,
    startedOn: typeof x.startedOn === 'string' ? x.startedOn : null,
    step: Number.isInteger(x.step) ? x.step : -1,
    due: typeof x.due === 'string' ? x.due : null,
    relearn: !!x.relearn,
    history: Array.isArray(x.history)
      ? x.history.filter((h: any) => h && typeof h.date === 'string').map((h: any) => ({ date: h.date, acc: Number(h.acc) || 0, pass: !!h.pass, interval: Number(h.interval) || 0 }))
      : [],
    awarded: x.awarded && typeof x.awarded === 'object' ? x.awarded : {},
    memorizedAt: typeof x.memorizedAt === 'string' ? x.memorizedAt : null,
    masteredAt: typeof x.masteredAt === 'string' ? x.masteredAt : null,
  };
}

/** Validate/normalise arbitrary JSON into AppData (used by load and import). Throws on bad shape. */
export function parseData(raw: unknown): AppData {
  const x = raw as any;
  if (!x || typeof x !== 'object' || !Array.isArray(x.verses)) throw new Error('Not a Scripture Memory backup file.');
  const today = dayKey();
  const d = defaults();
  d.verses = x.verses.map((v: unknown) => fixVerse(v, today)).filter((v: Verse | null): v is Verse => v !== null);
  d.points = Number.isFinite(x.points) ? Math.max(0, Math.round(x.points)) : 0;
  d.activity = Array.isArray(x.activity) ? x.activity.filter((a: unknown) => typeof a === 'string') : [];
  if (x.settings && typeof x.settings === 'object') {
    d.settings.lenient = !!x.settings.lenient;
    if (['auto', 'light', 'dark'].includes(x.settings.theme)) d.settings.theme = x.settings.theme;
  }
  return d;
}

let data: AppData = (() => {
  try {
    const s = localStorage.getItem(KEY);
    return s ? parseData(JSON.parse(s)) : defaults();
  } catch {
    return defaults();
  }
})();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full or blocked */
  }
}

export const getData = () => data;
export const findVerse = (ref: string) => data.verses.find((v) => v.ref === ref);

export function replaceAll(next: AppData) {
  data = next;
  save();
}
export function resetAll() {
  data = defaults();
  save();
}
export function exportJson(): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}

export function addVerse(ref: string, text: string, custom: boolean): Verse {
  const existing = findVerse(ref);
  if (existing) return existing;
  const v = newVerse(ref, text, custom, dayKey());
  data.verses.push(v);
  save();
  return v;
}
export function removeVerse(ref: string) {
  data.verses = data.verses.filter((v) => v.ref !== ref);
  save();
}
export function setText(ref: string, text: string) {
  const v = findVerse(ref);
  if (v) {
    v.text = text;
    v.custom = true;
    save();
  }
}
export function setSettings(p: Partial<AppData['settings']>) {
  Object.assign(data.settings, p);
  save();
}

function markActive(today: string) {
  if (!data.activity.includes(today)) data.activity.push(today);
}
export function markStarted(ref: string) {
  const v = findVerse(ref);
  if (v && !v.startedOn) {
    v.startedOn = dayKey();
    save();
  }
}

/** Award points for finishing a non-recall mode; once per verse/mode/day. */
export function completeMode(ref: string, mode: Mode): number {
  const v = findVerse(ref);
  if (!v) return 0;
  const today = dayKey();
  markStarted(ref);
  if (v.awarded[mode] === today) return 0;
  v.awarded[mode] = today;
  data.points += MODE_POINTS[mode];
  save();
  return MODE_POINTS[mode];
}

export interface RecallDone {
  outcome: RecallOutcome;
  points: RecallPoints;
}

export function completeRecall(ref: string, accuracy: number): RecallDone | null {
  const i = data.verses.findIndex((v) => v.ref === ref);
  if (i < 0) return null;
  const today = dayKey();
  const cur = data.verses[i];
  const outcome = applyRecall({ ...cur, startedOn: cur.startedOn ?? today }, accuracy, today);
  const points = recallPoints(outcome, cur.awarded.recall === today);
  const verse = outcome.verse;
  if (points.base > 0) verse.awarded = { ...verse.awarded, recall: today };
  data.verses[i] = verse;
  data.points += points.total;
  markActive(today);
  save();
  return { outcome, points };
}
