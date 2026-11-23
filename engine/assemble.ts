// Tile assembly (spec 5.4 steps 8–9, 5.7; ENG-05, ENG-06). Pure.
import type { ContentBundle, Item, SourceHealth, TileData } from '../shared/contracts.ts';
import { dedupeById, dedupeByUrl } from './dedupe.ts';
import { isStale } from './health.ts';
import type { Catalog, LinksFile, Source } from './registry.ts';

const HOUR = 3600_000;
export const MAX_TILE_ROWS = 20;
export const MAX_HEADLINE_AGE_HOURS = 7 * 24;
export const REUSE_LIMIT_MS = 48 * HOUR; // failed source: last good rows reused for at most 48 h

export type RowSource =
  | { kind: 'fresh'; items: Item[] } // fetched and normalized this run
  | { kind: 'previous' } // not due, or 304: reuse last bundle's rows (age never reset)
  | { kind: 'failed' } // reuse last rows only within REUSE_LIMIT_MS of last success
  | { kind: 'none' }; // not publishable: no rows at all, not even previous ones (ENG-09)

export interface SourceRun {
  source: Source;
  publishable: boolean;
  rows: RowSource;
  health: SourceHealth; // health after this run
}

export interface AssembleInput {
  catalog: Catalog;
  runs: SourceRun[]; // registry order
  previousRows: Map<string, Item[]>; // by source id, from the previous bundle
  links: LinksFile[];
  now: number;
}

/** Rows one source contributes at `now`. */
export function rowsFor(run: SourceRun, previousRows: Map<string, Item[]>, now: number): Item[] {
  if (!run.publishable) return [];
  const prev = previousRows.get(run.source.id) ?? [];
  let rows: Item[];
  switch (run.rows.kind) {
    case 'fresh':
      rows = run.rows.items;
      break;
    case 'previous':
      rows = prev;
      break;
    case 'failed': {
      const ok = run.health.lastSuccessAt;
      rows = ok && now - Date.parse(ok) <= REUSE_LIMIT_MS ? prev : [];
      break;
    }
    case 'none':
      rows = [];
  }
  const maxAgeMs = Math.min(run.source.maxRetentionHours, MAX_HEADLINE_AGE_HOURS) * HOUR;
  return dedupeById(
    rows.filter((i) => {
      if (i.expiresAt && Date.parse(i.expiresAt) <= now) return false;
      if (i.startsAt) return true; // events live until expiresAt
      return now - Date.parse(i.publishedAt ?? i.firstSeenAt) <= maxAgeMs;
    }),
  )
    .sort((a, b) => (a.startsAt || b.startsAt ? bySoonest(a, b) : byNewest(a, b)))
    .slice(0, run.source.maxItems);
}

const byNewest = (a: Item, b: Item) => {
  if (a.publishedAt === b.publishedAt) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  if (a.publishedAt === null) return 1;
  if (b.publishedAt === null) return -1;
  return a.publishedAt < b.publishedAt ? 1 : -1;
};
const bySoonest = (a: Item, b: Item) => {
  const x = Date.parse(a.startsAt ?? '') - Date.parse(b.startsAt ?? '');
  return x !== 0 ? x : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** Round-robin across sources so one outlet cannot fill a tile; keeps each source's order. */
export function interleave(groups: Item[][]): Item[] {
  const out: Item[] = [];
  const queues = groups.map((g) => [...g]).filter((g) => g.length);
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift() as Item);
  return out;
}

export function assembleTiles(input: AssembleInput): ContentBundle['tiles'] {
  const { catalog, runs, previousRows, links, now } = input;
  const tiles: ContentBundle['tiles'] = {};

  for (const tile of catalog.tiles) {
    if (tile.mode === 'local' || tile.hidden) continue;
    const mapped = runs.filter((r) => r.source.tiles.includes(tile.id));
    const live = mapped.filter((r) => r.publishable);

    // Links are not publisher content, so a tile shows its directory links whatever the sources' rights status.
    const seenUrls = new Set<string>();
    const fallbackLinks = [...links.filter((l) => l.tile === tile.id).flatMap((l) => l.links), ...mapped.flatMap((r) => r.source.fallbackLinks)]
      .filter((l) => (seenUrls.has(l.url) ? false : (seenUrls.add(l.url), true)))
      .slice(0, MAX_TILE_ROWS);

    const title = tile.officialTitle && live.length > 0 && live.every((r) => r.source.official) ? tile.officialTitle : tile.title;

    if (tile.mode === 'links') {
      tiles[tile.id] = { mode: 'links', title, state: fallbackLinks.length ? 'links' : 'empty', items: [], fallbackLinks };
      continue;
    }

    const perSource = live.map((r) => ({ run: r, rows: rowsFor(r, previousRows, now) }));
    const events = perSource.some((p) => p.rows.some((i) => i.startsAt));
    const sorted = perSource.map((p) => [...p.rows].sort(events ? bySoonest : byNewest));
    const merged = dedupeByUrl(events ? sorted.flat().sort(bySoonest) : interleave(sorted)).slice(0, MAX_TILE_ROWS);

    let state: TileData['state'];
    if (merged.length === 0) state = fallbackLinks.length ? 'links' : 'empty';
    // Stale is decided from timestamps (3× interval since last success, D16), whatever the health state.
    else if (perSource.some((p) => p.rows.length && isStale(p.run.health, now))) state = 'stale';
    else if (live.some((r) => r.health.state === 'failing')) state = 'partial';
    else state = 'fresh';

    tiles[tile.id] = { mode: tile.mode, title, state, items: merged, fallbackLinks };
  }
  return tiles;
}
