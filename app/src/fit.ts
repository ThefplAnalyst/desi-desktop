// Equal boxes (D41). From 640 px every tile is one fixed-height grid cell.
// - A collapsed tile shows as many of its rows as fit; the rest go behind "Show more".
// - An expanded or filtered tile ("tall") grows by whole cells until all of its rows fit,
//   so the grid stays even.
// Runs after each render and on resize. Below 640 px tiles size to their content.

const WIDE = '(min-width: 640px)';

function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function fitTiles(grid: HTMLElement): void {
  const tiles = [...grid.querySelectorAll<HTMLElement>('.tile')];
  // Start from the rendered state: rows hidden or buttons shown for an older width may fit now.
  for (const t of tiles) t.style.gridRow = '';
  for (const r of grid.querySelectorAll<HTMLElement>('[data-fit-hidden]')) {
    r.hidden = false;
    delete r.dataset['fitHidden'];
  }
  for (const b of grid.querySelectorAll<HTMLElement>('[data-fit-shown]')) {
    b.hidden = true;
    delete b.dataset['fitShown'];
  }
  if (!window.matchMedia(WIDE).matches) return;

  const style = getComputedStyle(grid);
  const cell = px(style.gridAutoRows);
  const gap = px(style.rowGap);
  if (cell <= 0) return;

  for (const t of tiles) {
    const rows = t.querySelector<HTMLElement>('.rows');
    if (!rows) continue;
    const overflow = () => rows.scrollHeight - rows.clientHeight > 1;

    if (t.classList.contains('tall')) {
      if (!overflow()) continue;
      const natural = t.clientHeight + rows.scrollHeight - rows.clientHeight;
      t.style.gridRow = `span ${Math.max(2, Math.ceil((natural + gap) / (cell + gap)))}`;
      continue;
    }

    if (!overflow()) continue;
    const more = t.querySelector<HTMLElement>('.more');
    if (more?.hidden) {
      more.hidden = false;
      more.dataset['fitShown'] = '';
    }
    const visible = [...rows.querySelectorAll<HTMLElement>(':scope > .row:not([hidden])')];
    // Keep at least one row; hide from the end until the rest fit.
    while (visible.length > 1 && overflow()) {
      const last = visible.pop();
      if (last) {
        last.hidden = true;
        last.dataset['fitHidden'] = '';
      }
    }
  }
}

/** Refits on resize, at most once per frame. */
export function fitOnResize(grid: HTMLElement): void {
  let pending = false;
  window.addEventListener('resize', () => {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(() => {
      pending = false;
      fitTiles(grid);
    });
  });
}
