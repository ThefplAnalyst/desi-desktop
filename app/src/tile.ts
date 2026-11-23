// Renders one tile (FR-03). All text goes in as text nodes.
import type { TileId } from '../../shared/contracts.ts';
import type { Clock } from './clocks.ts';
import { h } from './dom.ts';
import { highlighted } from './filter.ts';
import { icon } from './icons.ts';

export interface Row {
  key: string;
  title: string;
  url?: string;
  meta?: string;
  value?: string;
  change?: number;
}

export type TileState = 'fresh' | 'partial' | 'stale' | 'curated' | 'links' | 'empty' | 'local' | 'loading';

export interface TileModel {
  id: TileId;
  title: string;
  icon: string;
  state: TileState;
  label: string;
  rows: Row[];
  clocks?: Clock[];
  message?: { text: string; customize?: boolean };
  footer: string[];
}

export interface TileRenderOptions {
  rows: Row[]; // rows to consider (already filtered when a filter is active)
  terms: string[];
  filtering: boolean;
  headingMatch: boolean;
  expanded: boolean;
  onHide: (id: TileId) => void;
  onToggleMore: (id: TileId) => void;
  onCustomize: () => void;
}

export const ROWS_DEFAULT = 5;
export const ROWS_MORE = 10;

function changeText(change: number): string {
  const sign = change > 0 ? '+' : change < 0 ? '−' : '';
  return `${sign}${Math.abs(change).toFixed(2)}%`;
}

function rowEl(row: Row, terms: string[]): HTMLLIElement {
  const title = h('span', { class: 'row-title' }, highlighted(row.title, terms));
  const meta = row.meta ? h('span', { class: 'row-meta' }, row.meta) : null;
  const value =
    row.value !== undefined
      ? h(
          'span',
          { class: 'row-value' },
          row.value,
          row.change !== undefined
            ? h('span', { class: `row-change ${row.change < 0 ? 'down' : 'up'}` }, ` ${changeText(row.change)}`)
            : null,
        )
      : null;
  const body = [h('span', { class: 'row-text' }, title, meta), value];
  const inner = row.url
    ? h('a', { class: 'row-link', href: row.url, rel: 'noopener noreferrer', 'data-key': row.key }, ...body)
    : h('div', { class: 'row-link' }, ...body);
  return h('li', { class: 'row' }, inner);
}

export function renderTile(m: TileModel, o: TileRenderOptions): HTMLElement {
  const headingId = `tile-title-${m.id}`;
  const limit = o.filtering ? (o.expanded ? o.rows.length : ROWS_MORE) : o.expanded ? ROWS_MORE : ROWS_DEFAULT;
  const shown = o.rows.slice(0, limit);
  const canMore = o.filtering ? o.rows.length > ROWS_MORE : Math.min(o.rows.length, ROWS_MORE) > ROWS_DEFAULT;

  const article = h(
    'article',
    { class: `tile state-${m.state}`, 'data-tile': m.id, 'aria-labelledby': headingId, 'aria-busy': m.state === 'loading' ? 'true' : null },
    h(
      'header',
      { class: 'tile-head' },
      h('span', { class: 'tile-icon' }, icon(m.icon)),
      h('h2', { class: 'tile-title', id: headingId }, o.headingMatch ? highlighted(m.title, o.terms) : m.title),
      h(
        'button',
        {
          type: 'button',
          class: 'tile-hide icon-button',
          'aria-label': `Hide ${m.title}`,
          'data-key': `hide:${m.id}`,
          onclick: () => o.onHide(m.id),
        },
        icon('close', 16),
      ),
    ),
    m.label ? h('p', { class: 'tile-label' }, m.label) : null,
  );

  if (m.state === 'loading') {
    article.append(h('div', { class: 'skeleton', 'aria-hidden': 'true' }, ...[1, 2, 3, 4, 5].map(() => h('span', { class: 'bar' }))));
    article.append(h('p', { class: 'visually-hidden' }, 'Loading'));
    return article;
  }

  if (m.clocks && !o.filtering) {
    article.append(
      h(
        'ul',
        { class: 'clocks', 'aria-label': 'Family time' },
        ...m.clocks.map((c) =>
          h('li', { class: 'clock' }, h('span', { class: 'clock-label' }, c.label), h('span', { class: 'clock-time' }, `${c.day} ${c.time}`)),
        ),
      ),
    );
  }

  if (o.filtering && o.rows.length === 0) {
    article.append(h('p', { class: 'tile-message' }, 'No matching items'));
  } else if (shown.length) {
    article.append(h('ul', { class: 'rows' }, ...shown.map((r) => rowEl(r, o.terms))));
  } else if (m.message) {
    article.append(
      h(
        'p',
        { class: 'tile-message' },
        m.message.text,
        m.message.customize
          ? h('button', { type: 'button', class: 'link-button', 'data-key': `msg:${m.id}`, onclick: () => o.onCustomize() }, 'Open Customize')
          : null,
      ),
    );
  }

  if (canMore) {
    article.append(
      h(
        'button',
        {
          type: 'button',
          class: 'more',
          'aria-expanded': String(o.expanded),
          'data-key': `more:${m.id}`,
          onclick: () => o.onToggleMore(m.id),
        },
        o.expanded ? 'Show less' : 'Show more',
      ),
    );
  }

  if (m.footer.length) {
    article.append(h('footer', { class: 'tile-foot' }, ...m.footer.map((f) => h('p', {}, f))));
  }
  return article;
}
