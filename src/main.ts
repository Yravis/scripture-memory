import './style.css';
import { dayKey } from './core/dates';
import { canonicalRef, STARTERS } from './core/reference';
import { dueReviews, getStatus, todayPlan, type TodayItem } from './core/scheduling';
import { computeStreak } from './core/streak';
import type { Mode, Status } from './core/types';
import { fetchVerse } from './api';
import { addVerse, exportJson, findVerse, getData, parseData, removeVerse, replaceAll, resetAll, setSettings, setText } from './store';
import { btn, h } from './ui/dom';
import { friendlyDate, runFlow, stepsFor } from './ui/flow';
import { MODE_LABEL } from './ui/modes';

type View = { name: 'home' } | { name: 'verses' } | { name: 'add' } | { name: 'settings' } | { name: 'detail'; ref: string } | { name: 'session'; queue: string[]; idx: number; points: number };
let view: View = { name: 'home' };

const app = document.getElementById('app')!;
const STATUS_LABEL: Record<Status, string> = { learning: 'Learning', memorized: 'Memorized', 'needs-review': 'Needs review', mastered: 'Mastered' };

function applyTheme() {
  const t = getData().settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#14181a' : '#f6f4ef');
}

function go(v: View) {
  view = v;
  render();
  window.scrollTo(0, 0);
}

const badge = (s: Status) => h('span', { class: 'badge ' + s }, STATUS_LABEL[s]);

function render() {
  applyTheme();
  app.replaceChildren();
  const main = h('main', { class: 'screen' });
  app.append(main);
  if (view.name === 'session') return renderSession(main, view);
  if (view.name === 'home') renderHome(main);
  else if (view.name === 'verses') renderVerses(main);
  else if (view.name === 'add') renderAdd(main);
  else if (view.name === 'settings') renderSettings(main);
  else if (view.name === 'detail') renderDetail(main, view.ref);
  app.append(tabs());
}

function tabs() {
  const t = (name: View['name'], icon: string, label: string) =>
    h('button', { class: 'tab' + (view.name === name || (name === 'verses' && view.name === 'detail') ? ' on' : ''), type: 'button', onClick: () => go({ name } as View) }, h('span', { class: 'ti' }, icon), label);
  return h('nav', { class: 'tabs' }, t('home', '☀', 'Today'), t('verses', '📖', 'Verses'), t('add', '＋', 'Add'), t('settings', '⚙', 'Settings'));
}

function statTiles() {
  const d = getData();
  const today = dayKey();
  const streak = computeStreak(d.activity, today);
  return h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('div', { class: 'num' }, `🔥 ${streak}`), h('div', { class: 'lbl' }, streak === 1 ? 'day streak' : 'day streak')),
    h('div', { class: 'stat' }, h('div', { class: 'num' }, `⭐ ${d.points.toLocaleString()}`), h('div', { class: 'lbl' }, 'points')));
}

// ---------- Home ----------
function renderHome(main: HTMLElement) {
  const d = getData();
  const today = dayKey();
  main.append(h('h1', {}, 'Scripture Memory'), statTiles());
  if (d.verses.length === 0) {
    main.append(h('div', { class: 'card center' }, h('h2', {}, 'Welcome'), h('p', {}, 'Add your first verse to begin. A few minutes a day is all it takes.'), btn('Add a verse', () => go({ name: 'add' }), 'btn primary big')));
    return;
  }
  const plan = todayPlan(d.verses, today);
  const todo = plan.filter((p) => !p.done);
  const doneN = plan.length - todo.length;
  const doneToday = d.activity.includes(today);
  main.append(
    h('div', { class: 'card' },
      h('div', { class: 'goal-head' }, h('h2', {}, 'Today'), h('span', { class: 'hint' }, plan.length ? `${doneN} of ${plan.length} done` : 'nothing scheduled')),
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: `width:${plan.length ? (doneN / plan.length) * 100 : 100}%` })),
      ...plan.map(planRow),
      plan.length === 0 ? h('p', { class: 'hint' }, 'No verses to practice today. Add another verse, or practice any verse from the Verses tab.') : null),
  );
  if (todo.length) main.append(btn(`Start${todo.length > 1 ? ` (${todo.length})` : ''}`, () => go({ name: 'session', queue: todo.map((t) => t.verse.ref), idx: 0, points: 0 }), 'btn primary huge'));
  else if (doneToday) main.append(h('div', { class: 'card center' }, h('div', { class: 'big-emoji' }, '🎉'), h('h2', {}, 'Today’s goal complete'), h('p', { class: 'hint' }, 'Streak kept. See you tomorrow!')));
}

function planRow(p: TodayItem) {
  const kind = p.kind === 'review' ? 'Review' : p.kind === 'new' ? 'New verse' : 'Learning';
  return h('button', { class: 'row-item' + (p.done ? ' done' : ''), type: 'button', onClick: () => go({ name: 'detail', ref: p.verse.ref }) },
    h('span', { class: 'check' }, p.done ? '✓' : ''), h('span', { class: 'grow' }, h('strong', {}, p.verse.ref), h('small', {}, kind)));
}

// ---------- Session ----------
function renderSession(main: HTMLElement, s: Extract<View, { name: 'session' }>) {
  if (s.idx >= s.queue.length) return renderSessionDone(main, s);
  const ref = s.queue[s.idx];
  const verse = findVerse(ref);
  if (!verse) return go({ ...s, idx: s.idx + 1 });
  const head = h('div', { class: 'session-top' }, `${ref} · verse ${s.idx + 1} of ${s.queue.length}`);
  const box = h('div', {});
  main.append(head, box);
  const start = (steps: Mode[], retry: boolean) =>
    runFlow(box, ref, steps, retry ? () => start(['firstletter', 'recall'], true) : null,
      (r) => go({ name: 'session', queue: s.queue, idx: s.idx + 1, points: s.points + r.points }),
      () => go({ name: 'home' }));
  start(stepsFor(ref), true);
  // keep running total in case of exit mid-way
}

function renderSessionDone(main: HTMLElement, s: Extract<View, { name: 'session' }>) {
  const streak = computeStreak(getData().activity, dayKey());
  main.append(
    h('div', { class: 'card center done-card' },
      h('div', { class: 'big-emoji' }, '🎉'),
      h('h1', {}, 'Session complete'),
      h('p', { class: 'pts' }, `+${s.points} points`),
      h('p', {}, `🔥 ${streak}-day streak · ⭐ ${getData().points.toLocaleString()} total`),
      btn('Back to Today', () => go({ name: 'home' }), 'btn primary big')),
  );
}

// ---------- Verses list ----------
function renderVerses(main: HTMLElement) {
  const d = getData();
  const today = dayKey();
  main.append(h('h1', {}, 'Verses'));
  if (!d.verses.length) main.append(h('div', { class: 'card center' }, h('p', {}, 'No verses yet.'), btn('Add a verse', () => go({ name: 'add' }), 'btn primary big')));
  const due = new Set(dueReviews(d.verses, today).map((v) => v.ref));
  main.append(
    h('div', { class: 'list' }, ...d.verses.map((v) =>
      h('button', { class: 'row-item', type: 'button', onClick: () => go({ name: 'detail', ref: v.ref }) },
        h('span', { class: 'grow' }, h('strong', {}, v.ref), h('small', {}, due.has(v.ref) ? 'due now' : v.due ? `next: ${friendlyDate(v.due)}` : 'not started')),
        badge(getStatus(v, today))))),
  );
}

function renderDetail(main: HTMLElement, ref: string) {
  const v = findVerse(ref);
  if (!v) return go({ name: 'verses' });
  const today = dayKey();
  const status = getStatus(v, today);
  const last = v.history[v.history.length - 1];
  const practice = (mode: Mode) => {
    const box = h('div', {});
    main.replaceChildren(h('div', { class: 'session-top' }, ref), box);
    runFlow(box, ref, [mode], null, () => go({ name: 'detail', ref }), () => go({ name: 'detail', ref }));
  };
  const modes: Mode[] = ['read', 'progressive', 'firstletter', 'fill', 'order', 'recall', 'refquiz'];
  const ta = h('textarea', { rows: 5, value: v.text, 'aria-label': 'Verse text' });
  main.append(
    h('button', { class: 'link back', type: 'button', onClick: () => go({ name: 'verses' }) }, '‹ Verses'),
    h('h1', {}, ref, h('span', { class: 'tag' }, 'KJV')),
    h('div', { class: 'row' }, badge(status), h('span', { class: 'hint' }, v.due ? `Next review ${friendlyDate(v.due)}` : 'Not yet passed full recall')),
    h('div', { class: 'card' }, h('p', { class: 'verse-text' }, v.text), last ? h('p', { class: 'hint' }, `Last recall: ${Math.round(last.acc * 100)}% on ${last.date}`) : null),
    h('h2', {}, 'Practice'),
    h('div', { class: 'grid' }, ...modes.map((m) => btn(MODE_LABEL[m], () => practice(m), 'btn'))),
    h('p', { class: 'hint' }, 'Extra practice earns points once per mode per day and never changes your review schedule.'),
    h('details', {}, h('summary', {}, 'Edit text'),
      h('p', { class: 'hint' }, v.custom ? 'Using your own text.' : 'Fix or replace the KJV text if needed.'), ta,
      btn('Save text', () => { const t = ta.value.replace(/\s+/g, ' ').trim(); if (t) { setText(ref, t); go({ name: 'detail', ref }); } }, 'btn')),
    btn('Remove verse', () => { if (confirm(`Remove ${ref} and its progress?`)) { removeVerse(ref); go({ name: 'verses' }); } }, 'btn danger'),
  );
}

// ---------- Add ----------
let addMsg = '';
let addBusy = false;
function renderAdd(main: HTMLElement) {
  const inp = h('input', { type: 'text', placeholder: 'e.g. Proverbs 3:5-6', autocapitalize: 'words', autocomplete: 'off', autocorrect: 'off', spellcheck: false, 'aria-label': 'Reference' });
  const own = h('textarea', { rows: 4, placeholder: 'Paste or type the verse text', 'aria-label': 'Own text' });
  const msg = h('p', { class: 'hint msg' }, addMsg);
  const say = (m: string) => { addMsg = m; msg.textContent = m; };
  const add = async (refIn: string, ownText = '') => {
    const ref = canonicalRef(refIn);
    if (!ref) return say('Enter a reference like “John 3:16” or “Proverbs 3:5-6”.');
    if (findVerse(ref)) return say(`${ref} is already in your list.`);
    if (addBusy) return;
    try {
      if (ownText.trim()) addVerse(ref, ownText.replace(/\s+/g, ' ').trim(), true);
      else {
        addBusy = true;
        say(`Fetching ${ref}…`);
        addVerse(ref, await fetchVerse(ref), false);
      }
      addBusy = false;
      say(`Added ${ref}.`);
      render();
    } catch (e) {
      addBusy = false;
      say(`${(e as Error).message} You can also paste the text below and tap “Add with my text”.`);
    }
  };
  const remaining = STARTERS.filter((s) => !findVerse(s));
  const addAll = async () => {
    for (const s of remaining) {
      if (findVerse(s)) continue;
      try {
        say(`Fetching ${s}…`);
        addVerse(s, await fetchVerse(s), false);
        await new Promise((r) => setTimeout(r, 2100)); // bible-api: 15 requests / 30s
      } catch (e) {
        say(`${s}: ${(e as Error).message}`);
        return render();
      }
    }
    say('Added all suggestions.');
    render();
  };
  main.append(
    h('h1', {}, 'Add a verse'),
    h('div', { class: 'card' },
      h('label', {}, 'Reference (KJV)'), inp,
      btn('Add verse', () => add(inp.value), 'btn primary big'),
      msg,
      h('details', {}, h('summary', {}, 'Use my own text instead'), own, btn('Add with my text', () => add(inp.value, own.value), 'btn'))),
    h('h2', {}, 'Suggestions'),
    remaining.length ? h('div', { class: 'chips left' }, ...remaining.map((s) => h('button', { class: 'chip', type: 'button', onClick: () => add(s) }, '+ ' + s))) : h('p', { class: 'hint' }, 'You’ve added all the suggestions.'),
    ...(remaining.length > 3 ? [btn('Add all suggestions (takes ~30s)', addAll, 'btn ghost')] : []),
  );
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(inp.value); });
}

// ---------- Settings ----------
function renderSettings(main: HTMLElement) {
  const s = getData().settings;
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  const note = h('p', { class: 'hint' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const next = parseData(JSON.parse(await f.text()));
      if (!confirm(`Replace everything on this device with the backup (${next.verses.length} verses, ${next.points} points)?`)) return;
      replaceAll(next);
      go({ name: 'home' });
    } catch (e) {
      note.textContent = (e as Error).message || 'Could not read that file.';
    }
  });
  const theme = h('select', { 'aria-label': 'Theme', onChange: (e: Event) => { setSettings({ theme: (e.target as HTMLSelectElement).value as 'auto' }); applyTheme(); } },
    ...(['auto', 'light', 'dark'] as const).map((t) => h('option', { value: t, selected: s.theme === t }, t === 'auto' ? 'Match my phone' : t[0].toUpperCase() + t.slice(1))));
  main.append(
    h('h1', {}, 'Settings'),
    h('div', { class: 'card' },
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.lenient, onChange: (e: Event) => setSettings({ lenient: (e.target as HTMLInputElement).checked }) }),
        h('span', {}, h('strong', {}, 'Lenient on archaic words'), h('small', {}, 'Accept “you/your/has” for thee/thou/thy/hath, and -eth/-est endings. Off by default: exact KJV wording.'))),
      h('label', {}, 'Theme'), theme),
    h('div', { class: 'card' },
      h('h2', {}, 'Backup'),
      h('p', { class: 'hint' }, 'Everything is stored only on this device. Export a backup now and then, or to move to a new phone.'),
      btn('Export backup', () => {
        const a = h('a', { href: URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' })), download: `scripture-memory-${dayKey()}.json` });
        document.body.append(a); a.click(); a.remove();
      }, 'btn'),
      btn('Import backup', () => file.click(), 'btn'), file, note),
    h('div', { class: 'card' }, h('button', { class: 'btn danger', type: 'button', onClick: () => { if (confirm('Delete all verses, progress and points on this device?')) { resetAll(); go({ name: 'home' }); } } }, 'Erase all data')),
    h('p', { class: 'hint center' }, 'Scripture text: King James Version (KJV), via bible-api.com.'),
  );
}

render();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && view.name === 'home') render(); });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
}

