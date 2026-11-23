import { addDays } from './dates';

/** Consecutive active days ending today (or yesterday, if today isn't done yet). */
export function computeStreak(activity: string[], today: string): number {
  const days = new Set(activity);
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
