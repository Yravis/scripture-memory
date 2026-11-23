import { describe, expect, it } from 'vitest';
import { addDays, diffDays } from '../src/core/dates';
import { canonicalRef, parseReference, sameRef } from '../src/core/reference';
import { scoreRecall, wordsMatch } from '../src/core/recall';
import { INTERVALS, applyRecall, getStatus, isEligible, newVerse, todayPlan } from '../src/core/scheduling';
import { MASTERED_BONUS, MEMORIZED_BONUS, MODE_POINTS, ON_TIME_BONUS, recallPoints } from '../src/core/scoring';
import { computeStreak } from '../src/core/streak';
import { blankCount, firstLetterHint, hiddenIndices, pickBlanks, displayWords } from '../src/core/words';
import type { Verse } from '../src/core/types';

const D0 = '2026-01-01';
const V = () => newVerse('John 3:16', 'For God so loved the world', false, D0);

/** pass a recall on each given day, applying the verse state forward */
function run(v: Verse, days: string[], acc = 1) {
  let cur = v;
  for (const d of days) cur = applyRecall(cur, acc, d).verse;
  return cur;
}

describe('dates', () => {
  it('adds and diffs across month boundaries', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
    expect(diffDays('2026-03-01', '2026-02-01')).toBe(28);
  });
});

describe('reference', () => {
  it('parses single, range and numbered books', () => {
    expect(canonicalRef('john 3:16')).toBe('John 3:16');
    expect(canonicalRef('Proverbs 3:5–6')).toBe('Proverbs 3:5-6');
    expect(canonicalRef('2 timothy 3:16-17')).toBe('2 Timothy 3:16-17');
    expect(canonicalRef('II Timothy 3:16')).toBe('2 Timothy 3:16');
    expect(canonicalRef('Psalms 23:1')).toBe('Psalm 23:1');
    expect(canonicalRef('Song of Solomon 2:1')).toBe('Song of Solomon 2:1');
  });
  it('rejects junk and backwards ranges', () => {
    expect(parseReference('hello')).toBeNull();
    expect(parseReference('John 3')).toBeNull();
    expect(parseReference('John 3:16-10')).toBeNull();
  });
  it('compares refs loosely', () => {
    expect(sameRef('john  3:16', 'John 3:16')).toBe(true);
    expect(sameRef('John 3:17', 'John 3:16')).toBe(false);
  });
});

describe('recall accuracy', () => {
  const t = 'The LORD is my shepherd; I shall not want.';
  it('ignores case and punctuation', () => {
    const r = scoreRecall(t, 'the lord is my shepherd i shall not want');
    expect(r.accuracy).toBe(1);
    expect(r.pass).toBe(true);
  });
  it('tolerates small typos but not on short words', () => {
    expect(scoreRecall(t, 'The LORD is my shepard; I shall not want.').pass).toBe(true);
    expect(wordsMatch('not', 'nit')).toBe(false);
    expect(wordsMatch('shepherd', 'shepherds')).toBe(true);
  });
  it('fails on a missing word in a short verse and reports marks', () => {
    const r = scoreRecall(t, 'The LORD is my shepherd I shall want');
    expect(r.accuracy).toBeCloseTo(8 / 9);
    expect(r.pass).toBe(false);
    expect(r.marks.filter((m) => !m.ok).map((m) => m.word)).toEqual(['not']);
  });
  it('passes at exactly 95% (19/20) and penalises extra words', () => {
    const exp = Array.from({ length: 20 }, (_, i) => 'word' + 'abcdefghijklmnopqrst'[i] + 'zz').join(' ');
    const typed = exp.split(' ').slice(0, 19).join(' ');
    expect(scoreRecall(exp, typed).pass).toBe(true);
    expect(scoreRecall(exp, typed.split(' ').slice(0, 18).join(' ')).pass).toBe(false);
    expect(scoreRecall(exp, exp + ' extra extra').pass).toBe(false);
  });
  it('handles empty input', () => {
    expect(scoreRecall(t, '').accuracy).toBe(0);
  });
  it('is strict about archaic forms by default, lenient when opted in', () => {
    const kjv = 'Trust in the LORD with all thine heart';
    const modern = 'Trust in the LORD with all your heart';
    expect(scoreRecall(kjv, modern).pass).toBe(false);
    expect(scoreRecall(kjv, modern, true).pass).toBe(true);
    expect(scoreRecall('He maketh me to lie down', 'He makes me to lie down', true).pass).toBe(true);
    expect(scoreRecall('He maketh me to lie down', 'He makes me to lie down', false).pass).toBe(false);
  });
});

describe('word helpers', () => {
  it('builds first-letter hints with punctuation', () => {
    expect(displayWords('The LORD is my shepherd; “I shall”').map(firstLetterHint).join(' ')).toBe('T L i m s; “I s”');
    expect(firstLetterHint('God-ward,')).toBe('G,');
  });
  it('hides nested fractions', () => {
    const a = hiddenIndices(20, 0.25, 'x');
    const b = hiddenIndices(20, 0.5, 'x');
    expect(a.size).toBe(5);
    expect(b.size).toBe(10);
    expect([...a].every((i) => b.has(i))).toBe(true);
  });
  it('picks 3-5 blanks growing with passes, favouring key words', () => {
    expect(blankCount(0, 30)).toBe(3);
    expect(blankCount(4, 30)).toBe(5);
    expect(blankCount(20, 30)).toBe(5);
    expect(blankCount(0, 3)).toBe(2);
    const words = displayWords('For God so loved the world, that he gave his only begotten Son');
    const picks = pickBlanks(words, 3, 's');
    expect(picks).toHaveLength(3);
    expect(picks.every((i) => words[i].replace(/\W/g, '').length >= 4)).toBe(true);
  });
});

describe('scheduling', () => {
  it('first pass schedules 1 day out; learning verses stay due-less until then', () => {
    const v = V();
    expect(isEligible(v, D0)).toBe(true);
    const o = applyRecall(v, 1, D0);
    expect(o.verse.step).toBe(0);
    expect(o.verse.due).toBe(addDays(D0, 1));
    expect(o.verse.history[0].interval).toBe(0);
  });
  it('follows 1,3,7,14,30,60,120 and caps at 120', () => {
    let v = V();
    let day = D0;
    const gaps: number[] = [];
    for (let i = 0; i < 9; i++) {
      v = applyRecall(v, 1, day).verse;
      gaps.push(diffDays(v.due!, day));
      day = v.due!;
    }
    expect(gaps).toEqual([1, 3, 7, 14, 30, 60, 120, 120, 120]);
    expect(INTERVALS).toEqual([1, 3, 7, 14, 30, 60, 120]);
  });
  it('failed first attempt keeps a new verse learning', () => {
    const o = applyRecall(V(), 0.5, D0);
    expect(o.verse.step).toBe(-1);
    expect(o.verse.due).toBeNull();
    expect(getStatus(o.verse, D0)).toBe('learning');
  });
  it('failed review drops to the 1-day step and sets relearn', () => {
    let v = run(V(), [D0, addDays(D0, 1), addDays(D0, 4)]);
    expect(v.step).toBe(2);
    const o = applyRecall(v, 0.8, v.due!);
    expect(o.pass).toBe(false);
    expect(o.verse.step).toBe(0);
    expect(o.verse.due).toBe(addDays(v.due!, 1));
    expect(o.verse.relearn).toBe(true);
    expect(getStatus(o.verse, v.due!)).toBe('needs-review');
    // passing again clears relearn, stays at 1-day step
    const again = applyRecall(o.verse, 1, v.due!);
    expect(again.verse.relearn).toBe(false);
    expect(again.verse.step).toBe(0);
    expect(getStatus(again.verse, v.due!)).toBe('learning');
  });
  it('extra practice before due does not change the schedule', () => {
    const v = run(V(), [D0]);
    const o = applyRecall(v, 0.2, D0);
    expect(o.counted).toBe(false);
    expect(o.verse).toBe(v);
  });
});

describe('status transitions', () => {
  it('learning -> needs review when due -> memorized after the 7-day review', () => {
    let v = V();
    expect(getStatus(v, D0)).toBe('learning');
    v = run(v, [D0]);
    expect(getStatus(v, D0)).toBe('learning');
    expect(getStatus(v, addDays(D0, 1))).toBe('needs-review');
    v = run(v, [addDays(D0, 1)]); // 1-day review
    expect(getStatus(v, addDays(D0, 1))).toBe('learning'); // 2 days so far
    const d4 = addDays(D0, 4);
    v = run(v, [d4]); // 3-day review => 3 separate days but not 7-day yet
    expect(getStatus(v, d4)).toBe('learning');
    const d11 = addDays(d4, 7);
    const o = applyRecall(v, 1, d11);
    expect(o.newlyMemorized).toBe(true);
    expect(getStatus(o.verse, d11)).toBe('memorized');
    expect(o.verse.memorizedAt).toBe(d11);
  });
  it('requires >=95% on the passes (a fail resets the run)', () => {
    let v = run(V(), [D0, addDays(D0, 1), addDays(D0, 4)]);
    v = applyRecall(v, 0.9, v.due!).verse;
    expect(getStatus(v, addDays(D0, 100))).toBe('needs-review');
  });
  it('mastered after passing the 30-day review', () => {
    let v = V();
    let day = D0;
    let last;
    for (let i = 0; i < 6; i++) {
      last = applyRecall(v, 1, day);
      v = last.verse;
      day = v.due!;
    }
    // passes at intervals 0,1,3,7,14,30
    expect(v.history.map((h) => h.interval)).toEqual([0, 1, 3, 7, 14, 30]);
    expect(last!.newlyMastered).toBe(true);
    expect(getStatus(v, addDays(day, -1))).toBe('mastered');
    expect(getStatus(v, day)).toBe('needs-review');
  });
  it('a lapse after mastery removes mastery until re-earned', () => {
    let v = V();
    let day = D0;
    for (let i = 0; i < 6; i++) {
      v = applyRecall(v, 1, day).verse;
      day = v.due!;
    }
    v = applyRecall(v, 0.5, day).verse;
    expect(getStatus(v, day)).toBe('needs-review');
    v = applyRecall(v, 1, day).verse;
    expect(getStatus(v, day)).toBe('learning');
  });
});

describe('scoring', () => {
  const base = { pass: true, counted: true, interval: 0, overdue: 0, newlyMemorized: false, newlyMastered: false };
  it('orders modes by difficulty', () => {
    expect(MODE_POINTS.recall).toBeGreaterThan(MODE_POINTS.order);
    expect(MODE_POINTS.order).toBe(MODE_POINTS.fill);
    expect(MODE_POINTS.fill).toBeGreaterThan(MODE_POINTS.firstletter);
    expect(MODE_POINTS.firstletter).toBeGreaterThan(MODE_POINTS.read);
  });
  it('gives on-time bonus for reviews only', () => {
    expect(recallPoints(base, false).total).toBe(MODE_POINTS.recall);
    expect(recallPoints({ ...base, interval: 3, overdue: 0 }, false).total).toBe(MODE_POINTS.recall + ON_TIME_BONUS);
    expect(recallPoints({ ...base, interval: 3, overdue: 1 }, false).onTime).toBe(ON_TIME_BONUS);
    expect(recallPoints({ ...base, interval: 3, overdue: 5 }, false).onTime).toBe(0);
  });
  it('adds memorized/mastered bonuses and nothing for failures', () => {
    expect(recallPoints({ ...base, interval: 7, newlyMemorized: true }, false).memorized).toBe(MEMORIZED_BONUS);
    expect(recallPoints({ ...base, interval: 30, newlyMastered: true }, false).mastered).toBe(MASTERED_BONUS);
    expect(recallPoints({ ...base, pass: false }, false).total).toBe(0);
  });
  it('does not repay extra practice on the same day', () => {
    expect(recallPoints({ ...base, counted: false }, true).total).toBe(0);
    expect(recallPoints({ ...base, counted: false }, false).total).toBe(MODE_POINTS.recall);
  });
});

describe('streak', () => {
  it('counts consecutive days, surviving an unfinished today', () => {
    const a = ['2026-02-01', '2026-02-02', '2026-02-03'];
    expect(computeStreak(a, '2026-02-03')).toBe(3);
    expect(computeStreak(a, '2026-02-04')).toBe(3);
    expect(computeStreak(a, '2026-02-05')).toBe(0);
    expect(computeStreak(['2026-02-01', '2026-02-03'], '2026-02-03')).toBe(1);
    expect(computeStreak([], '2026-02-03')).toBe(0);
  });
});

describe('today plan', () => {
  const mk = (ref: string) => newVerse(ref, 'a b c d', false, D0);
  it('lists due reviews first, then one new verse', () => {
    const reviewed = run(mk('A 1:1'), [D0]);
    const b = mk('B 1:1');
    const c = mk('C 1:1');
    const plan = todayPlan([b, reviewed, c], addDays(D0, 1));
    expect(plan.map((p) => [p.verse.ref, p.kind])).toEqual([
      ['A 1:1', 'review'],
      ['B 1:1', 'new'],
    ]);
  });
  it('keeps started learning verses and marks completed ones done', () => {
    const today = D0;
    const started = { ...mk('B 1:1'), startedOn: today };
    const failed = applyRecall(started, 0.1, today).verse;
    const plan = todayPlan([failed, mk('C 1:1')], today);
    expect(plan).toHaveLength(1); // no second new verse on the same day
    expect(plan[0]).toMatchObject({ kind: 'learning', done: true });
    const tomorrow = todayPlan([failed, mk('C 1:1')], addDays(today, 1));
    expect(tomorrow.map((p) => [p.verse.ref, p.kind, p.done])).toEqual([
      ['B 1:1', 'learning', false],
      ['C 1:1', 'new', false],
    ]);
  });
  it('shows a new verse passed today as done', () => {
    const v = run({ ...mk('A 1:1'), startedOn: D0 }, [D0]);
    expect(todayPlan([v], D0).map((p) => [p.kind, p.done])).toEqual([['new', true]]);
    expect(todayPlan([v], addDays(D0, 1)).map((p) => [p.kind, p.done])).toEqual([['review', false]]);
  });
  it('shows a review as done after completing it today', () => {
    const v = run(mk('A 1:1'), [D0, addDays(D0, 1)]);
    const plan = todayPlan([v], addDays(D0, 1));
    expect(plan[0]).toMatchObject({ kind: 'review', done: true });
  });
});
