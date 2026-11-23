// Freshness rules the browser re-applies on its own clock (FR-04, spec 5.7, decision D16).
// Pure functions: no DOM, no Date.now() — `now` is always passed in.
import type { Item, SourceHealth, TileData } from '../../shared/contracts.ts';

const MIN = 60_000;
export const DROP_SOURCE_AFTER_MS = 48 * 60 * MIN; // no success for 48 h: rows dropped, links shown
export const MAX_HEADLINE_AGE_MS = 7 * 24 * 60 * MIN; // headline rows older than 7 days dropped

export const LABELS = {
  stale: 'May be out of date',
  links: 'Useful links — not a live feed',
  empty: 'Nothing to show right now',
  partialSuffix: 'Some sources unavailable',
} as const;

/** "just now", "25 min ago", "3 h ago", "2 days ago". Future times count as "just now". */
export function ago(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  if (!(ms >= MIN)) return 'just now';
  const min = Math.floor(ms / MIN);
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 48) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

export function isSourceStale(h: SourceHealth | undefined, now: number): boolean {
  if (!h) return false;
  if (!h.lastSuccessAt) return true;
  return now - Date.parse(h.lastSuccessAt) > h.staleAfterMinutes * MIN;
}

function sourceDropped(h: SourceHealth | undefined, now: number): boolean {
  if (!h) return false; // unknown health: trust the engine's own retention
  if (!h.lastSuccessAt) return true;
  return now - Date.parse(h.lastSuccessAt) > DROP_SOURCE_AFTER_MS;
}

/** Rows that may still be shown at `now`. */
export function visibleItems(tile: TileData, health: Map<string, SourceHealth>, now: number): Item[] {
  return tile.items.filter((i) => {
    if (i.expiresAt && Date.parse(i.expiresAt) <= now) return false;
    if (tile.mode === 'live') {
      if (sourceDropped(health.get(i.sourceId), now)) return false;
      const born = i.publishedAt ?? i.firstSeenAt;
      if (!i.expiresAt && now - Date.parse(born) > MAX_HEADLINE_AGE_MS) return false;
    }
    return true;
  });
}

export type ViewState = 'fresh' | 'partial' | 'stale' | 'curated' | 'links' | 'empty';

export interface TileView {
  state: ViewState;
  label: string; // the muted mode label in the tile header
  items: Item[];
  links: { title: string; url: string }[]; // shown instead of rows in links state
  sources: { id: string; stale: boolean; updated: string | null }[]; // footer, per source
}

/** Decides what a data-backed tile shows at `now` (FR-03, FR-04, NFR-HONEST). */
export function tileView(tile: TileData | undefined, health: Map<string, SourceHealth>, now: number): TileView {
  const none: TileView = { state: 'empty', label: LABELS.empty, items: [], links: [], sources: [] };
  if (!tile) return none;

  const asLinks = (): TileView =>
    tile.fallbackLinks.length ? { state: 'links', label: LABELS.links, items: [], links: tile.fallbackLinks, sources: [] } : none;

  if (tile.mode === 'links' || tile.mode === 'local') return asLinks();

  const items = visibleItems(tile, health, now);
  if (items.length === 0) return asLinks();
  if (tile.mode === 'curated') return { state: 'curated', label: '', items, links: [], sources: [] };

  const ids = [...new Set(items.map((i) => i.sourceId))];
  const sources = ids.map((id) => {
    const h = health.get(id);
    return { id, stale: isSourceStale(h, now), updated: h?.lastSuccessAt ?? null };
  });
  const known = sources.filter((s) => s.updated !== null).map((s) => s.updated as string);
  const oldest = known.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const updated = oldest ? `Updated ${ago(oldest, now)}` : '';

  if (tile.state === 'stale' || sources.some((s) => s.stale)) return { state: 'stale', label: LABELS.stale, items, links: [], sources };
  if (tile.state === 'partial') {
    return { state: 'partial', label: [updated, LABELS.partialSuffix].filter(Boolean).join(' · '), items, links: [], sources };
  }
  return { state: 'fresh', label: updated, items, links: [], sources };
}
