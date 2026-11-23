// Filter (spec 6.3, FR-07, decision D13). A heading or a row matches only if that one
// heading or row title contains every word: any order, case-insensitive, NFKC-normalized.
import type { TileId } from '../../shared/contracts.ts';

const norm = (s: string) => s.normalize('NFKC').toLowerCase();
export const terms = (q: string) => norm(q.trim()).split(/\s+/).filter(Boolean);
const hasAll = (text: string, ts: string[]) => {
  const t = norm(text);
  return ts.every((w) => t.includes(w));
};

export interface FilterResult<T> {
  tileId: TileId;
  headingMatch: boolean;
  items: T[];
}

/** Pure. Tiles in display order; returns only tiles to show. Generic over row type (spec uses Item). */
export function filterDashboard<T extends { title: string }>(
  tiles: { id: TileId; title: string; items: T[] }[],
  query: string,
): FilterResult<T>[] {
  const ts = terms(query);
  if (ts.length === 0) return tiles.map((t) => ({ tileId: t.id, headingMatch: false, items: t.items }));
  return tiles.flatMap((t) => {
    const items = t.items.filter((i) => hasAll(i.title, ts));
    const headingMatch = hasAll(t.title, ts);
    return items.length || headingMatch ? [{ tileId: t.id, headingMatch, items }] : [];
  });
}

/** Character ranges in `text` that match any term, merged. Empty if normalization changes length. */
export function matchRanges(text: string, ts: string[]): [number, number][] {
  const n = norm(text);
  if (n.length !== text.length || ts.length === 0) return [];
  const ranges: [number, number][] = [];
  for (const w of ts) {
    let from = 0;
    for (let i = n.indexOf(w, from); i !== -1; i = n.indexOf(w, from)) {
      ranges.push([i, i + w.length]);
      from = i + w.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** Text with matches wrapped in <mark>, built with DOM APIs only (spec 6.3). */
export function highlighted(text: string, ts: string[]): Node {
  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const [a, b] of matchRanges(text, ts)) {
    if (a > pos) frag.append(text.slice(pos, a));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(a, b);
    frag.append(mark);
    pos = b;
  }
  if (pos < text.length) frag.append(text.slice(pos));
  return frag;
}
