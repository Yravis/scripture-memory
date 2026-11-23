type Child = Node | string | null | false | undefined;
type Props = Record<string, any>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c !== null && c !== false && c !== undefined) el.append(c);
  return el;
}

export const btn = (label: string, onClick: () => void, cls = 'btn') => h('button', { class: cls, type: 'button', onClick }, label);

export function clear(el: HTMLElement) {
  el.replaceChildren();
}
