// Tiny DOM builder. Text always goes in through text nodes, never as HTML (NFR-SEC).

type AttrValue = string | number | boolean | null | undefined;
type Listener = (e: Event) => void;
export type Attrs = Record<string, AttrValue | Listener>;
export type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else if (value !== false && value !== null && value !== undefined) {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Re-render helper: remembers which element (by data-key) had focus and restores it. */
export function preserveFocus(container: Element, render: () => void): void {
  const active = document.activeElement;
  const key = active instanceof HTMLElement && container.contains(active) ? active.dataset['key'] : undefined;
  render();
  if (key) focusKey(container, key);
}

export function focusKey(container: ParentNode, key: string): boolean {
  const target = container.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
  if (target && !target.hasAttribute('disabled')) {
    target.focus();
    return true;
  }
  return false;
}

let announceTimer: number | undefined;
/** Polite screen-reader announcement through the page's single live region. */
export function announce(message: string): void {
  const region = document.getElementById('announcer');
  if (!region) return;
  region.textContent = '';
  window.clearTimeout(announceTimer);
  announceTimer = window.setTimeout(() => {
    region.textContent = message;
  }, 50);
}
