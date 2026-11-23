import { addDays, diffDays } from './dates';
import { PASS_THRESHOLD } from './recall';
import type { HistoryEntry, Status, Verse } from './types';

export const INTERVALS = [1, 3, 7, 14, 30, 60, 120];

export function newVerse(ref: string, text: string, custom: boolean, today: string): Verse {
  return {
    ref, text, custom, addedAt: today, startedOn: null, step: -1, due: null, relearn: false,
    history: [], awarded: {}, memorizedAt: null, masteredAt: null,
  };
}

/** Does a recall attempt today affect the schedule? */
export function isEligible(v: Verse, today: string): boolean {
  return v.step < 0 || v.relearn || (v.due !== null && v.due <= today);
}

/** Attempts since (and excluding) the last failed recall. */
function currentRun(h: HistoryEntry[]): HistoryEntry[] {
  let k = h.length;
  while (k > 0 && h[k - 1].pass) k--;
  return h.slice(k);
}

export function isMemorized(h: HistoryEntry[]): boolean {
  const run = currentRun(h);
  return new Set(run.map((e) => e.date)).size >= 3 && run.some((e) => e.interval >= 7 && e.acc >= PASS_THRESHOLD - 1e-9);
}

export function isMastered(h: HistoryEntry[]): boolean {
  return currentRun(h).some((e) => e.interval >= 30);
}

export function getStatus(v: Verse, today: string): Status {
  const h = v.history;
  if (!h.some((e) => e.pass)) return 'learning';
  if (!h[h.length - 1].pass || (v.due !== null && v.due <= today)) return 'needs-review';
  if (isMastered(h)) return 'mastered';
  if (isMemorized(h)) return 'memorized';
  return 'learning';
}

export interface RecallOutcome {
  verse: Verse;
  pass: boolean;
  counted: boolean; // false = extra practice, schedule untouched
  interval: number;
  overdue: number; // days past due when reviewed
  newlyMemorized: boolean;
  newlyMastered: boolean;
}

/** Apply a full-recall attempt (reference -> text) to a verse. Pure. */
export function applyRecall(v: Verse, accuracy: number, today: string): RecallOutcome {
  const pass = accuracy >= PASS_THRESHOLD - 1e-9;
  if (!isEligible(v, today)) {
    return { verse: v, pass, counted: false, interval: 0, overdue: 0, newlyMemorized: false, newlyMastered: false };
  }
  const overdue = v.due ? Math.max(0, diffDays(today, v.due)) : 0;
  let { step, due, relearn } = v;
  let interval = 0;
  if (pass) {
    if (v.step < 0 || v.relearn) {
      step = 0;
      relearn = false;
    } else {
      interval = INTERVALS[v.step];
      step = Math.min(v.step + 1, INTERVALS.length - 1);
    }
    due = addDays(today, INTERVALS[step]);
  } else if (v.step >= 0) {
    step = 0;
    due = addDays(today, 1);
    relearn = true;
  }
  const history = [...v.history, { date: today, acc: accuracy, pass, interval }];
  const memorized = isMemorized(history);
  const mastered = isMastered(history);
  const newlyMemorized = memorized && !v.memorizedAt;
  const newlyMastered = mastered && !v.masteredAt;
  const verse: Verse = {
    ...v, step, due, relearn, history,
    memorizedAt: newlyMemorized ? today : v.memorizedAt,
    masteredAt: newlyMastered ? today : v.masteredAt,
  };
  return { verse, pass, counted: true, interval, overdue, newlyMemorized, newlyMastered };
}

export function passCount(v: Verse): number {
  return v.history.filter((e) => e.pass).length;
}

/** Due reviews (most overdue first). */
export function dueReviews(verses: Verse[], today: string): Verse[] {
  return verses
    .filter((v) => v.step >= 0 && (v.relearn || (v.due !== null && v.due <= today)))
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
}

export type TodayKind = 'review' | 'learning' | 'new';
export interface TodayItem {
  verse: Verse;
  kind: TodayKind;
  done: boolean;
}

/** Today's session: due reviews first, verses still being learned, and 1 new verse. */
export function todayPlan(verses: Verse[], today: string): TodayItem[] {
  const doneToday = (v: Verse) => v.history.length > 0 && v.history[v.history.length - 1].date === today;
  const items: TodayItem[] = [];
  const reviewSet = new Set<string>();
  for (const v of verses) {
    const wasDue = v.step >= 0 && (v.relearn || (v.due !== null && v.due <= today));
    // Reviewed today and now rescheduled: still show as done.
    const reviewedToday = v.step >= 0 && v.history.some((e) => e.date === today && e.interval > 0);
    if (wasDue || reviewedToday) reviewSet.add(v.ref);
  }
  for (const v of dueReviews(verses, today)) items.push({ verse: v, kind: 'review', done: false });
  for (const v of verses) {
    if (reviewSet.has(v.ref) && !items.some((i) => i.verse.ref === v.ref)) items.push({ verse: v, kind: 'review', done: true });
  }
  const learning = verses.filter((v) => v.step < 0 && v.startedOn !== null);
  for (const v of learning) items.push({ verse: v, kind: 'learning', done: doneToday(v) });
  for (const v of verses) {
    // New verse whose first full recall passed today: counts as a finished new-verse session.
    if (v.startedOn === today && v.step >= 0 && !reviewSet.has(v.ref)) items.push({ verse: v, kind: 'new', done: true });
  }
  const startedToday = verses.some((v) => v.startedOn === today);
  if (!startedToday) {
    const fresh = verses.find((v) => v.step < 0 && v.startedOn === null);
    if (fresh) items.push({ verse: fresh, kind: 'new', done: false });
  }
  const rank: Record<TodayKind, number> = { review: 0, learning: 1, new: 2 };
  return items.sort((a, b) => Number(a.done) - Number(b.done) || rank[a.kind] - rank[b.kind]);
}
