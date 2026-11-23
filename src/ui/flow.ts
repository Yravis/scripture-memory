import { dayKey } from '../core/dates';
import { passCount } from '../core/scheduling';
import type { Mode } from '../core/types';
import { completeMode, completeRecall, findVerse, getData } from '../store';
import { btn, h } from './dom';
import { MODE_FN, MODE_LABEL, type ModeResult } from './modes';

export interface FlowEnd {
  points: number;
  passedRecall: boolean | null;
}

/**
 * Runs a series of practice steps for one verse inside `root`.
 * Calls onEnd after the last step (or onQuit if the user leaves).
 */
export function runFlow(root: HTMLElement, ref: string, steps: Mode[], retry: (() => void) | null, onEnd: (r: FlowEnd) => void, onQuit: () => void) {
  let i = 0;
  let points = 0;
  let passedRecall: boolean | null = null;

  const shell = (title: string) => {
    root.replaceChildren();
    const body = h('div', { class: 'step-body' });
    root.append(
      h('div', { class: 'step-head' },
        h('span', { class: 'crumb' }, `${MODE_LABEL[steps[i]]} · ${i + 1}/${steps.length}`),
        h('button', { class: 'link', type: 'button', onClick: onQuit }, 'Exit')),
      h('div', { class: 'dots' }, ...steps.map((_, k) => h('span', { class: 'dot' + (k < i ? ' done' : k === i ? ' cur' : '') }))),
      body,
    );
    void title;
    return body;
  };

  const next = () => {
    i++;
    if (i >= steps.length) onEnd({ points, passedRecall });
    else show();
  };

  const show = () => {
    const mode = steps[i];
    const v = findVerse(ref);
    if (!v) return onQuit();
    const body = shell(mode);
    const finish = (r: ModeResult) => {
      let gained = 0;
      let extra: Node[] = [];
      let failed = false;
      if (mode === 'recall') {
        const done = completeRecall(ref, r.acc ?? 0);
        if (done) {
          gained = done.points.total;
          passedRecall = done.outcome.pass;
          failed = !done.outcome.pass;
          const p = done.points;
          const nv = done.outcome.verse;
          if (done.outcome.pass) {
            if (done.outcome.counted && nv.due) extra.push(h('p', { class: 'hint' }, `Next review: ${friendlyDate(nv.due)}.`));
            if (p.onTime) extra.push(h('p', { class: 'bonus' }, `On-time review +${p.onTime}`));
            if (p.memorized) extra.push(h('p', { class: 'bonus' }, `🎉 Memorized! +${p.memorized}`));
            if (p.mastered) extra.push(h('p', { class: 'bonus' }, `🏆 Mastered! +${p.mastered}`));
          } else if (done.outcome.counted && nv.relearn) {
            extra.push(h('p', { class: 'hint' }, 'Back to the 1-day step. Try first letters, then recall again.'));
          }
        }
      } else if (r.ok) {
        gained = completeMode(ref, mode);
      }
      points += gained;
      body.replaceChildren(
        h('div', { class: 'result ' + (r.ok ? 'good' : 'bad') },
          h('div', { class: 'big-emoji' }, r.ok ? '✓' : mode === 'recall' ? '✗' : '–'),
          h('h2', {}, r.ok ? (mode === 'recall' ? `Passed${r.acc !== undefined ? ' · ' + Math.round(r.acc * 100) + '%' : ''}` : 'Nice work') : mode === 'recall' ? 'Not quite' : 'Not this time'),
          gained ? h('p', { class: 'pts' }, `+${gained} points`) : h('p', { class: 'hint' }, r.ok ? 'Points already earned today for this one.' : ''),
          r.detail,
          ...extra),
        ...(failed && retry ? [btn('Try again (first letters first)', retry, 'btn primary big')] : []),
        btn(i + 1 >= steps.length ? 'Finish' : 'Continue', next, failed && retry ? 'btn ghost' : 'btn primary big'),
      );
    };
    const stage = h('div', {});
    body.append(stage);
    const settings = getData().settings;
    MODE_FN[mode]({ ref, text: v.text, lenient: settings.lenient, passes: passCount(v), seed: ref + ':' + (mode === 'fill' || mode === 'order' ? v.history.length + dayKey() : ''), el: stage, finish });
    if (mode !== 'recall' && mode !== 'refquiz' && steps.length > 1) body.append(btn('Skip this step', next, 'link skip'));
    if (mode === 'refquiz') body.append(btn('Skip', next, 'link skip'));
  };

  show();
}

export function friendlyDate(key: string): string {
  const today = dayKey();
  const d = (Date.parse(key) - Date.parse(today)) / 86400000;
  if (d === 1) return 'tomorrow';
  if (d === 0) return 'today';
  return `in ${d} days (${new Date(key + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`;
}

/** Which steps to run for a verse in today's session. */
export function stepsFor(ref: string): Mode[] {
  const v = findVerse(ref)!;
  const passed = v.history.some((e) => e.pass);
  if (v.step < 0 && !passed) {
    return v.startedOn && v.startedOn !== dayKey() || v.history.length > 0
      ? ['firstletter', 'fill', 'recall', 'refquiz']
      : ['read', 'progressive', 'firstletter', 'fill', 'order', 'recall', 'refquiz'];
  }
  return v.relearn ? ['firstletter', 'recall', 'refquiz'] : ['recall', 'refquiz'];
}
