import { describe, expect, it } from 'vitest';
import type { Item, SourceHealth, TileData } from '../../shared/contracts.ts';
import { LABELS, ago, tileView, visibleItems } from '../../app/src/freshness.ts';

const NOW = Date.parse('2026-11-20T12:25:00Z');
const iso = (minutesBefore: number) => new Date(NOW - minutesBefore * 60_000).toISOString();

const item = (id: string, sourceId: string, extra: Partial<Item> = {}): Item => ({
  id,
  title: `Row ${id}`,
  url: `https://example.org/${id}`,
  sourceId,
  publishedAt: iso(30),
  firstSeenAt: iso(30),
  expiresAt: null,
  ...extra,
});

const health = (id: string, lastSuccessMinutesAgo: number | null, staleAfterMinutes: number): [string, SourceHealth] => [
  id,
  {
    id,
    state: 'ok',
    lastAttemptAt: iso(5),
    lastSuccessAt: lastSuccessMinutesAgo === null ? null : iso(lastSuccessMinutesAgo),
    consecutiveFailures: 0,
    etag: null,
    lastModified: null,
    staleAfterMinutes,
    errorCode: null,
  },
];

const live = (items: Item[], state: TileData['state'] = 'fresh', fallbackLinks: TileData['fallbackLinks'] = []): TileData => ({
  mode: 'live',
  title: 'India Updates',
  state,
  items,
  fallbackLinks,
});

describe('T-03 FR-04 NFR-HONEST freshness', () => {
  it('T-03 FR-04 age text', () => {
    expect(ago(iso(0), NOW)).toBe('just now');
    expect(ago(iso(-5), NOW)).toBe('just now');
    expect(ago(iso(25), NOW)).toBe('25 min ago');
    expect(ago(iso(180), NOW)).toBe('3 h ago');
    expect(ago(iso(3 * 24 * 60), NOW)).toBe('3 days ago');
  });

  it('T-03 FR-03 fresh tile label shows the source age', () => {
    const v = tileView(live([item('a', 'pib')]), new Map([health('pib', 25, 90)]), NOW);
    expect(v.state).toBe('fresh');
    expect(v.label).toBe('Updated 25 min ago');
  });

  it('T-03 FR-03 partial tile label', () => {
    const v = tileView(live([item('a', 'pib')], 'partial'), new Map([health('pib', 25, 90)]), NOW);
    expect(v.label).toBe(`Updated 25 min ago · ${LABELS.partialSuffix}`);
  });

  it('T-03 FR-04 browser marks a tile stale from timestamps even if the engine said fresh', () => {
    const v = tileView(live([item('a', 'pib')]), new Map([health('pib', 120, 90)]), NOW);
    expect(v.state).toBe('stale');
    expect(v.label).toBe('May be out of date');
  });

  it('T-03 FR-04 the oldest source decides the tile age; each source keeps its own age', () => {
    const v = tileView(live([item('a', 'pib'), item('b', 'uscis')]), new Map([health('pib', 10, 90), health('uscis', 50, 180)]), NOW);
    expect(v.label).toBe('Updated 50 min ago');
    expect(v.sources.map((s) => s.id)).toEqual(['pib', 'uscis']);
  });

  it('T-03 FR-04 expired rows vanish in the browser', () => {
    const t = live([item('a', 'pib', { expiresAt: iso(1) }), item('b', 'pib', { expiresAt: iso(-60) })]);
    expect(visibleItems(t, new Map([health('pib', 5, 90)]), NOW).map((i) => i.id)).toEqual(['b']);
  });

  it('T-03 ENG-06 a source without success for 48 h is dropped and the tile falls back to links', () => {
    const t = live([item('a', 'pib')], 'fresh', [{ title: 'PIB', url: 'https://example.org/pib' }]);
    const v = tileView(t, new Map([health('pib', 49 * 60, 90)]), NOW);
    expect(v.state).toBe('links');
    expect(v.label).toBe('Useful links — not a live feed');
    expect(v.items).toEqual([]);
  });

  it('T-03 D16 headline rows older than 7 days are dropped', () => {
    const t = live([item('old', 'pib', { publishedAt: iso(8 * 24 * 60) }), item('new', 'pib')]);
    expect(visibleItems(t, new Map([health('pib', 5, 90)]), NOW).map((i) => i.id)).toEqual(['new']);
  });

  it('T-03 FR-03 links tiles show the links label and no timestamps', () => {
    const v = tileView({ mode: 'links', title: 'South Asia', state: 'links', items: [], fallbackLinks: [{ title: 'L', url: 'https://example.org/' }] }, new Map(), NOW);
    expect(v).toMatchObject({ state: 'links', label: 'Useful links — not a live feed', sources: [] });
  });

  it('T-03 FR-14 a missing tile or one with nothing left is empty', () => {
    expect(tileView(undefined, new Map(), NOW)).toMatchObject({ state: 'empty', label: 'Nothing to show right now' });
    expect(tileView(live([]), new Map(), NOW).state).toBe('empty');
  });

  it('T-03 FR-03 curated tiles have no freshness label', () => {
    const v = tileView({ mode: 'curated', title: 'Cricket', state: 'fresh', items: [item('a', 'cricket')], fallbackLinks: [] }, new Map(), NOW);
    expect(v).toMatchObject({ state: 'curated', label: '' });
  });
});
