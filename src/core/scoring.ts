import type { Mode } from './types';
import type { RecallOutcome } from './scheduling';

export const MODE_POINTS: Record<Mode, number> = {
  read: 2,
  progressive: 4,
  firstletter: 6,
  fill: 8,
  order: 8,
  recall: 15,
  refquiz: 5,
};
export const ON_TIME_BONUS = 10;
export const MEMORIZED_BONUS = 50;
export const MASTERED_BONUS = 100;

/** A review is on time if done on the due date or within one day after. */
export function isOnTime(overdue: number): boolean {
  return overdue <= 1;
}

export interface RecallPoints {
  base: number;
  onTime: number;
  memorized: number;
  mastered: number;
  total: number;
}

/** Points for a full-recall attempt. `alreadyAwardedToday` stops farming extra practice. */
export function recallPoints(o: Pick<RecallOutcome, 'pass' | 'counted' | 'interval' | 'overdue' | 'newlyMemorized' | 'newlyMastered'>, alreadyAwardedToday: boolean): RecallPoints {
  const base = o.pass && (o.counted || !alreadyAwardedToday) ? MODE_POINTS.recall : 0;
  const onTime = o.pass && o.counted && o.interval > 0 && isOnTime(o.overdue) ? ON_TIME_BONUS : 0;
  const memorized = o.newlyMemorized ? MEMORIZED_BONUS : 0;
  const mastered = o.newlyMastered ? MASTERED_BONUS : 0;
  return { base, onTime, memorized, mastered, total: base + onTime + memorized + mastered };
}
