// Builds tile models from preferences + data, and renders the grid (FR-02, FR-03, FR-06, FR-07, FR-14).
import type { Item, Preferences, TileId } from '../../shared/contracts.ts';
import { entry, metro } from './catalog.ts';
import { clocks } from './clocks.ts';
import type { SiteData } from './data.ts';
import { clear, h } from './dom.ts';
import { filterDashboard, terms } from './filter.ts';
import { LABELS, ago, isSourceStale, tileView } from './freshness.ts';
import { nearMeLinks } from './nearme.ts';
import { hostOf } from './prefs.ts';
import { renderTile, type FooterLine, type Row, type TileModel } from './tile.ts';

export interface ModelInput {
  prefs: Preferences;
  data: SiteData | null; // null while loading
  now: number;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatStart(iso: string): string {
  if (DATE_ONLY.test(iso)) {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(Date.parse(iso));
  }
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
    Date.parse(iso),
  );
}

function itemRow(tileId: TileId, i: Item, attribution: string, now: number): Row {
  const base = { key: `row:${tileId}:${i.id}`, title: i.title, url: i.url };
  if (i.value !== undefined) return { ...base, value: i.value, ...(i.change !== undefined ? { change: i.change } : {}), meta: attribution };
  if (i.startsAt) return { ...base, meta: formatStart(i.startsAt) };
  return { ...base, meta: i.publishedAt ? `${attribution} · ${ago(i.publishedAt, now)}` : attribution };
}

function localModel(id: TileId, base: Omit<TileModel, 'state' | 'label' | 'rows' | 'footer'>, input: ModelInput): TileModel {
  const { prefs, data, now } = input;
  const m = metro(prefs.metroId);
  const needArea = { text: 'Choose your area in Customize.', customize: true };

  if (id === 'shortcuts') {
    return {
      ...base,
      state: 'local',
      label: '',
      rows: prefs.shortcuts.map((s) => ({ key: `row:shortcuts:${s.id}`, title: s.title, url: s.url, meta: hostOf(s.url) })),
      ...(prefs.shortcuts.length ? {} : { message: { text: 'No shortcuts yet.', customize: true } }),
      footer: [],
    };
  }

  if (id === 'near-me') {
    if (!m) return { ...base, state: 'local', label: '', rows: [], message: needArea, footer: [] };
    return {
      ...base,
      state: 'local',
      label: '',
      rows: nearMeLinks(m).map((l, i) => ({ key: `row:near-me:${i}`, title: l.title, url: l.url, meta: 'Google Maps' })),
      footer: [`Map searches near ${m.name}`],
    };
  }

  // time-weather: clocks are always local; the forecast comes from the engine (NWS).
  const model: TileModel = { ...base, state: 'local', label: '', rows: [], clocks: clocks(now), footer: [] };
  if (!m) return { ...model, message: { text: 'Choose your area in Customize to see the weather.', customize: true } };
  if (!data) return { ...model, message: { text: `Loading the forecast for ${m.name}…` } };
  const w = data.bundle?.weather[m.id];
  const periods = w ? w.periods.filter((p) => Date.parse(p.endsAt) > now) : [];
  if (!w || periods.length === 0) return { ...model, message: { text: `Weather for ${m.name}: ${LABELS.empty.toLowerCase()}.` } };
  const stale = isSourceStale(data.health.get('nws'), now);
  return {
    ...model,
    rows: periods.map((p, i) => ({ key: `row:time-weather:${i}`, title: `${p.name}: ${p.summary}`, value: `${p.tempF}°F`, url: w.url })),
    footer: [`${m.name} forecast: National Weather Service · ${stale ? LABELS.stale : `issued ${ago(w.issuedAt, now)}`}`],
  };
}

export function buildModels(input: ModelInput): TileModel[] {
  const { prefs, data, now } = input;
  const models: TileModel[] = [];
  for (const id of prefs.tiles) {
    const cat = entry(id);
    if (!cat) continue;
    const base = { id, title: cat.title, icon: cat.icon };

    if (cat.mode === 'local') {
      models.push(localModel(id, base, input));
      continue;
    }
    if (!data) {
      models.push({ ...base, state: 'loading', label: '', rows: [], footer: [] });
      continue;
    }

    const tile = data.bundle?.tiles[id];
    const view = tileView(tile, data.health, now);
    const attribution = (sourceId: string) => data.sources.get(sourceId)?.attribution ?? sourceId;
    const rows: Row[] =
      view.state === 'links'
        ? view.links.map((l, i) => ({ key: `row:${id}:link${i}`, title: l.title, url: l.url }))
        : view.items.map((i) => itemRow(id, i, attribution(i.sourceId), now));
    const footer: FooterLine[] =
      view.state === 'curated'
        ? ['Curated by Desi Desktop']
        : view.sources.map((s) => {
            const status = s.stale ? LABELS.stale : s.updated ? `Updated ${ago(s.updated, now)}` : '';
            const credit = data.sources.get(s.id)?.credit;
            if (credit) return { link: credit, rest: status ? ` · ${status}` : '' };
            return `${attribution(s.id)} · ${status}`.replace(/ · $/, '');
          });
    models.push({
      ...base,
      title: tile?.title ?? cat.title,
      state: view.state,
      label: view.label,
      rows,
      footer,
    });
  }
  return models;
}

export interface GridOptions {
  query: string;
  expanded: Set<TileId>;
  onHide: (id: TileId) => void;
  onToggleMore: (id: TileId) => void;
  onCustomize: () => void;
}

/** Renders the grid; returns counts for the filter announcement. */
export function renderGrid(container: HTMLElement, models: TileModel[], o: GridOptions): { items: number; tiles: number } {
  clear(container);
  const ts = terms(o.query);
  const filtering = ts.length > 0;

  if (models.length === 0) {
    container.append(
      h(
        'div',
        { class: 'page-empty' },
        h('p', {}, 'Your page has no tiles.'),
        h('button', { type: 'button', class: 'button', 'data-key': 'add-tiles', onclick: () => o.onCustomize() }, 'Add tiles'),
      ),
    );
    return { items: 0, tiles: 0 };
  }

  const results = filterDashboard(
    models.map((m) => ({ id: m.id, title: m.title, items: m.rows })),
    o.query,
  );

  if (filtering && results.length === 0) {
    container.append(h('div', { class: 'page-empty' }, h('p', {}, `Nothing matches “${o.query.trim()}”.`)));
    return { items: 0, tiles: 0 };
  }

  let items = 0;
  for (const r of results) {
    const m = models.find((x) => x.id === r.tileId);
    if (!m) continue;
    items += filtering ? r.items.length : 0;
    container.append(
      renderTile(m, {
        rows: r.items,
        terms: ts,
        filtering,
        headingMatch: r.headingMatch,
        expanded: o.expanded.has(m.id),
        onHide: o.onHide,
        onToggleMore: o.onToggleMore,
        onCustomize: o.onCustomize,
      }),
    );
  }
  return { items, tiles: results.length };
}
