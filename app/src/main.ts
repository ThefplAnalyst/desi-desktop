// App entry: wires preferences, data, grid, filter and Customize together (spec 4.1).
import type { Preferences, TileId } from '../../shared/contracts.ts';
import { entry } from './catalog.ts';
import { createCustomize } from './customize.ts';
import { loadData, type SiteData } from './data.ts';
import { announce, focusKey, preserveFocus } from './dom.ts';
import { terms } from './filter.ts';
import { buildModels, renderGrid } from './grid.ts';
import { createPrefsStore } from './prefs.ts';
import { greeting, initSearch, todayText } from './search.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const grid = $<HTMLElement>('grid');
const filterInput = $<HTMLInputElement>('filter');
const filterStatus = $<HTMLElement>('filter-status');
const tip = $<HTMLElement>('tip');
const sessionNote = $<HTMLElement>('session-note');
const customizeButton = $<HTMLButtonElement>('customize-open');

const store = createPrefsStore(() => window.localStorage);
const prefs: Preferences = store.load();
let data: SiteData | null = null;
let query = '';
let saveFailed = false;
const expanded = new Set<TileId>();

function update(mutate: (p: Preferences) => void): void {
  mutate(prefs);
  if (!store.save(prefs)) saveFailed = true;
  render();
  customize.refresh();
}

function hideTile(id: TileId): void {
  const i = prefs.tiles.indexOf(id);
  const next = prefs.tiles[i + 1] ?? prefs.tiles[i - 1];
  update((p) => {
    p.tiles = p.tiles.filter((t) => t !== id);
  });
  announce(`${entry(id)?.title ?? id} hidden. Add it back in Customize.`);
  if (!(next && focusKey(grid, `hide:${next}`)) && !focusKey(grid, 'add-tiles')) filterInput.focus();
}

function render(): void {
  const now = Date.now();
  const today = new Date(now);
  $('greeting').textContent = greeting(today);
  $('today').textContent = todayText(today);

  grid.classList.toggle('cols-4', prefs.columns === 4);
  grid.parentElement?.classList.toggle('wide', prefs.columns === 4);
  tip.hidden = prefs.tipDismissed;
  sessionNote.hidden = !saveFailed;

  let counts = { items: 0, tiles: 0 };
  preserveFocus(grid, () => {
    counts = renderGrid(grid, buildModels({ prefs, data, now }), {
      query,
      expanded,
      onHide: hideTile,
      onToggleMore: (id) => {
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
        render();
      },
      onCustomize: () => customize.open(),
    });
  });
  const filtering = terms(query).length > 0;
  const statusText = filtering ? `${counts.items} ${counts.items === 1 ? 'item' : 'items'} in ${counts.tiles} ${counts.tiles === 1 ? 'tile' : 'tiles'}` : '';
  if (filterStatus.textContent !== statusText) filterStatus.textContent = statusText;
}

const customize = createCustomize($<HTMLDialogElement>('customize'), customizeButton, {
  getPrefs: () => prefs,
  isFiltering: () => terms(query).length > 0,
  update,
});

// Filter (FR-07): debounced 80 ms; Escape clears while the box has focus.
let filterTimer: number | undefined;
filterInput.addEventListener('input', () => {
  window.clearTimeout(filterTimer);
  filterTimer = window.setTimeout(() => {
    query = filterInput.value;
    expanded.clear();
    render();
  }, 80);
});
filterInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && filterInput.value) {
    e.preventDefault();
    window.clearTimeout(filterTimer);
    filterInput.value = '';
    query = '';
    render();
  }
});

$('tip-dismiss').addEventListener('click', () => {
  update((p) => {
    p.tipDismissed = true;
  });
  filterInput.focus();
});

customizeButton.addEventListener('click', () => customize.open());
customizeButton.hidden = false;
$('tools').hidden = false;

initSearch($<HTMLFormElement>('search-form'), $<HTMLInputElement>('q'));

// Clocks and freshness labels follow the browser clock (FR-04).
window.setInterval(() => {
  if (document.visibilityState === 'visible') render();
}, 60_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});

render();
void loadData().then((d) => {
  data = d;
  render();
});
