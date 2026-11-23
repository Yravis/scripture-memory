import { scoreRecall, wordsMatch } from '../core/recall';
import { canonicalRef, sameRef } from '../core/reference';
import { blankCount, coreWord, displayWords, firstLetterHint, hiddenIndices, pickBlanks, shuffled } from '../core/words';
import { btn, h } from './dom';

export interface ModeResult {
  ok: boolean; // earned credit
  acc?: number;
  detail?: Node;
}

export interface ModeCtx {
  ref: string;
  text: string;
  lenient: boolean;
  passes: number;
  seed: string;
  el: HTMLElement;
  finish: (r: ModeResult) => void;
}

const refHeader = (ref: string) => h('div', { class: 'ref' }, ref, h('span', { class: 'tag' }, 'KJV'));

export function readMode(c: ModeCtx) {
  const words = displayWords(c.text);
  const hidden = new Set<number>();
  const box = h('p', { class: 'verse-text' });
  const draw = () => {
    box.replaceChildren(
      ...words.map((w, i) => h('span', { class: 'w' + (hidden.has(i) ? ' hide' : ''), onClick: () => { hidden.has(i) ? hidden.delete(i) : hidden.add(i); draw(); } }, w + ' ')),
    );
  };
  draw();
  c.el.append(
    refHeader(c.ref),
    h('p', { class: 'hint' }, 'Read it aloud a few times. Tap any word to hide or reveal it.'),
    box,
    h('div', { class: 'row' },
      btn('Hide all', () => { words.forEach((_, i) => hidden.add(i)); draw(); }, 'btn ghost'),
      btn('Show all', () => { hidden.clear(); draw(); }, 'btn ghost')),
    btn('Done reading', () => c.finish({ ok: true }), 'btn primary big'),
  );
}

export function progressiveMode(c: ModeCtx) {
  const words = displayWords(c.text);
  const levels = [0.25, 0.5, 0.75, 1];
  let lv = 0;
  const peek = new Set<number>();
  const info = h('p', { class: 'hint' });
  const box = h('p', { class: 'verse-text' });
  const nextBtn = h('button', { class: 'btn primary big', type: 'button' });
  const draw = () => {
    const hid = hiddenIndices(words.length, levels[lv], c.seed);
    info.textContent = `${levels[lv] * 100}% hidden. Say the verse aloud, tap a blank to peek.`;
    box.replaceChildren(
      ...words.map((w, i) => {
        const hide = hid.has(i) && !peek.has(i);
        return h('span', { class: 'w' + (hide ? ' hide' : ''), onClick: () => { if (hid.has(i)) { peek.has(i) ? peek.delete(i) : peek.add(i); draw(); } } }, w + ' ');
      }),
    );
    nextBtn.textContent = lv < levels.length - 1 ? `Hide more (${levels[lv + 1] * 100}%)` : 'I can say it';
  };
  nextBtn.onclick = () => {
    if (lv < levels.length - 1) { lv++; peek.clear(); draw(); } else c.finish({ ok: true });
  };
  draw();
  c.el.append(refHeader(c.ref), info, box, nextBtn);
}

export function firstLetterMode(c: ModeCtx) {
  const words = displayWords(c.text);
  const shown = new Set<number>();
  const box = h('p', { class: 'verse-text letters' });
  const draw = () =>
    box.replaceChildren(
      ...words.map((w, i) => h('span', { class: 'w' + (shown.has(i) ? ' shown' : ''), onClick: () => { shown.has(i) ? shown.delete(i) : shown.add(i); draw(); } }, (shown.has(i) ? w : firstLetterHint(w)) + ' ')),
    );
  draw();
  c.el.append(
    refHeader(c.ref),
    h('p', { class: 'hint' }, 'Say the verse using the first letters. Tap a word if you need it.'),
    box,
    h('div', { class: 'row' }, btn('Show verse', () => { words.forEach((_, i) => shown.add(i)); draw(); }, 'btn ghost'), btn('Hide again', () => { shown.clear(); draw(); }, 'btn ghost')),
    btn('I got it', () => c.finish({ ok: true }), 'btn primary big'),
  );
}

export function fillMode(c: ModeCtx) {
  const words = displayWords(c.text);
  const blanks = new Set(pickBlanks(words, blankCount(c.passes, words.length), c.seed));
  const inputs = new Map<number, HTMLInputElement>();
  const box = h('p', { class: 'verse-text fill' });
  const msg = h('p', { class: 'hint' }, `Fill in the ${blanks.size} missing words.`);
  let tries = 0;
  words.forEach((w, i) => {
    if (!blanks.has(i)) return void box.append(h('span', { class: 'w' }, w + ' '));
    const core = coreWord(w);
    const inp = h('input', { type: 'text', autocapitalize: 'none', autocomplete: 'off', autocorrect: 'off', spellcheck: false, class: 'blank', style: `width:${Math.max(3, core.length + 1)}ch`, 'aria-label': 'missing word' });
    inputs.set(i, inp);
    const lead = /^[^\p{L}\p{N}]*/u.exec(w)?.[0] ?? '';
    const trail = /[^\p{L}\p{N}]*$/u.exec(w)?.[0] ?? '';
    box.append(lead, inp, trail + ' ');
  });
  const check = () => {
    tries++;
    let wrong = 0;
    inputs.forEach((inp, i) => {
      const ok = wordsMatch(words[i], inp.value, c.lenient);
      inp.classList.toggle('bad', !ok);
      inp.classList.toggle('good', ok);
      if (!ok) wrong++;
    });
    if (wrong === 0) c.finish({ ok: true });
    else msg.textContent = `${wrong} not right yet. Fix them and check again.`;
  };
  const give = () => {
    inputs.forEach((inp, i) => { inp.value = coreWord(words[i]); inp.disabled = true; });
    c.finish({ ok: false });
  };
  c.el.append(refHeader(c.ref), msg, box, btn('Check', check, 'btn primary big'), btn('Show answers', () => { if (tries > 0 || confirm('Show the answers? No points for this round.')) give(); }, 'btn ghost'));
  inputs.values().next().value?.focus();
}

export function orderMode(c: ModeCtx) {
  const words = displayWords(c.text);
  const chips = shuffled(words.map((w, i) => ({ w, i })), c.seed + c.text.length);
  const used = new Set<number>();
  const placed: number[] = [];
  let mistakes = 0;
  const built = h('p', { class: 'verse-text built' });
  const pool = h('div', { class: 'chips' });
  const info = h('p', { class: 'hint' }, 'Tap the words in the right order.');
  const draw = () => {
    built.replaceChildren(...placed.map((i) => h('span', { class: 'w shown' }, words[i] + ' ')), h('span', { class: 'cursor' }, '▍'));
    pool.replaceChildren(
      ...chips.filter((c2) => !used.has(c2.i)).map((ch) =>
        h('button', { class: 'chip', type: 'button', onClick: (e: Event) => pick(ch, e.currentTarget as HTMLElement) }, ch.w)),
    );
  };
  const pick = (ch: { w: string; i: number }, el: HTMLElement) => {
    if (ch.w === words[placed.length]) {
      used.add(ch.i);
      placed.push(placed.length);
      // placed holds word indices in order
      draw();
      if (placed.length === words.length) c.finish({ ok: true, detail: h('p', { class: 'hint' }, mistakes ? `${mistakes} wrong tap${mistakes > 1 ? 's' : ''}.` : 'No mistakes!') });
    } else {
      mistakes++;
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 400);
    }
  };
  draw();
  c.el.append(refHeader(c.ref), info, built, pool);
}

export function recallMode(c: ModeCtx) {
  const ta = h('textarea', { rows: 6, placeholder: 'Type the verse from memory…', autocapitalize: 'none', autocomplete: 'off', autocorrect: 'off', spellcheck: false, 'aria-label': 'Verse text' });
  c.el.append(
    refHeader(c.ref),
    h('p', { class: 'hint' }, 'Type the whole verse. Case and punctuation don’t matter; tiny typos are forgiven. 95% to pass.'),
    ta,
    btn('Check', () => {
      const r = scoreRecall(c.text, ta.value, c.lenient);
      const diff = h('p', { class: 'verse-text diff' }, ...r.marks.map((m) => h('span', { class: m.ok ? 'ok' : 'miss' }, m.word + ' ')));
      c.finish({ ok: r.pass, acc: r.accuracy, detail: h('div', {}, h('p', { class: 'hint' }, `${Math.round(r.accuracy * 100)}% · ${r.matched} of ${r.total} words`), diff) });
    }, 'btn primary big'),
  );
  ta.focus();
}

/** Text → reference. */
export function refQuizMode(c: ModeCtx) {
  const inp = h('input', { type: 'text', placeholder: 'e.g. John 3:16', autocapitalize: 'words', autocomplete: 'off', autocorrect: 'off', spellcheck: false, 'aria-label': 'Reference' });
  const go = () => {
    const ok = sameRef(inp.value, c.ref);
    c.finish({ ok, detail: h('p', { class: 'hint' }, ok ? `Yes, ${canonicalRef(c.ref)}.` : `It was ${c.ref}.`) });
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  c.el.append(
    h('div', { class: 'ref' }, 'Where is this verse?'),
    h('p', { class: 'verse-text' }, c.text),
    h('p', { class: 'hint' }, 'Type the book, chapter and verse.'),
    inp,
    btn('Check', go, 'btn primary big'),
  );
}

export const MODE_LABEL: Record<string, string> = {
  read: 'Read', progressive: 'Hide words', firstletter: 'First letters', fill: 'Fill in the blanks', order: 'Word order', recall: 'Full recall', refquiz: 'Name the reference',
};
export const MODE_FN = { read: readMode, progressive: progressiveMode, firstletter: firstLetterMode, fill: fillMode, order: orderMode, recall: recallMode, refquiz: refQuizMode };
