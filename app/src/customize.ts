// Customize panel (FR-05, FR-09, FR-10). Every change applies at once through `update`.
import type { Preferences, TileId } from '../../shared/contracts.ts';
import { METROS, SELECTABLE, entry } from './catalog.ts';
import { announce, clear, focusKey, h, preserveFocus } from './dom.ts';
import { icon } from './icons.ts';
import { MAX_SHORTCUTS, checkShortcutUrl, defaults, hostOf, newId } from './prefs.ts';

export interface CustomizeDeps {
  getPrefs: () => Preferences;
  isFiltering: () => boolean;
  update: (mutate: (p: Preferences) => void) => void;
}

export interface CustomizePanel {
  open: () => void;
  refresh: () => void;
}

const titleOf = (id: TileId) => entry(id)?.title ?? id;

function move<T>(list: T[], from: number, to: number): void {
  const [x] = list.splice(from, 1);
  if (x !== undefined) list.splice(Math.max(0, Math.min(to, list.length)), 0, x);
}

export function createCustomize(dialog: HTMLDialogElement, opener: HTMLElement, deps: CustomizeDeps): CustomizePanel {
  const find = <T extends HTMLElement>(sel: string): T => {
    const el = dialog.querySelector<T>(sel);
    if (!el) throw new Error(`Customize panel markup missing: ${sel}`);
    return el;
  };
  const body = find<HTMLElement>('.panel-body');
  const closeBtn = find<HTMLButtonElement>('.panel-close');

  let confirmingReset = false;
  let shortcutMessage = '';
  let dragId: TileId | null = null;

  closeBtn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    confirmingReset = false;
    shortcutMessage = '';
    opener.focus();
  });
  // Click on the backdrop closes the panel.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  const moveTile = (id: TileId, to: number) => {
    deps.update((p) => move(p.tiles, p.tiles.indexOf(id), to));
    const p = deps.getPrefs();
    announce(`${titleOf(id)} moved to position ${p.tiles.indexOf(id) + 1} of ${p.tiles.length}`);
  };

  function tilesSection(p: Preferences): HTMLElement {
    const filtering = deps.isFiltering();
    const shown = p.tiles;
    const list = h(
      'ol',
      { class: 'panel-list', 'aria-label': 'Tiles on your page' },
      ...shown.map((id, i) => {
        const title = titleOf(id);
        const li = h(
          'li',
          { class: 'panel-item', 'data-id': id, draggable: filtering ? null : 'true' },
          h('span', { class: 'grip' }, icon('grip')),
          h('span', { class: 'panel-item-title' }, title),
          h(
            'button',
            {
              type: 'button',
              class: 'icon-button',
              'aria-label': `Move ${title} up`,
              'data-key': `up:${id}`,
              disabled: filtering || i === 0,
              onclick: () => {
                moveTile(id, i - 1);
                if (!focusKey(body, `up:${id}`)) focusKey(body, `down:${id}`);
              },
            },
            icon('up'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'icon-button',
              'aria-label': `Move ${title} down`,
              'data-key': `down:${id}`,
              disabled: filtering || i === shown.length - 1,
              onclick: () => {
                moveTile(id, i + 1);
                if (!focusKey(body, `down:${id}`)) focusKey(body, `up:${id}`);
              },
            },
            icon('down'),
          ),
          h('input', {
            type: 'checkbox',
            role: 'switch',
            class: 'switch',
            checked: true,
            'aria-label': `Show ${title}`,
            'data-key': `show:${id}`,
            onchange: () => {
              deps.update((q) => {
                q.tiles = q.tiles.filter((t) => t !== id);
              });
              announce(`${title} hidden`);
              focusKey(body, `show:${id}`);
            },
          }),
        );
        if (!filtering) {
          li.addEventListener('dragstart', (e) => {
            dragId = id;
            e.dataTransfer?.setData('text/plain', id);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            li.classList.add('dragging');
          });
          li.addEventListener('dragend', () => li.classList.remove('dragging'));
          li.addEventListener('dragover', (e) => e.preventDefault());
          li.addEventListener('drop', (e) => {
            e.preventDefault();
            const from = (e.dataTransfer?.getData('text/plain') as TileId | undefined) || dragId;
            dragId = null;
            if (from && from !== id && deps.getPrefs().tiles.includes(from)) moveTile(from, deps.getPrefs().tiles.indexOf(id));
          });
        }
        return li;
      }),
    );

    const more = SELECTABLE.filter((t) => !shown.includes(t.id));
    return h(
      'section',
      { class: 'panel-section', 'aria-labelledby': 'cz-tiles' },
      h('h3', { id: 'cz-tiles' }, 'On your page'),
      filtering ? h('p', { class: 'panel-note' }, 'Clear the filter to reorder tiles.') : null,
      shown.length ? list : h('p', { class: 'panel-note' }, 'No tiles on your page. Switch some on below.'),
      h('h3', { id: 'cz-more' }, 'More tiles'),
      more.length
        ? h(
            'ul',
            { class: 'panel-list', 'aria-labelledby': 'cz-more' },
            ...more.map((t) =>
              h(
                'li',
                { class: 'panel-item' },
                h('span', { class: 'panel-item-title' }, t.title),
                h('input', {
                  type: 'checkbox',
                  role: 'switch',
                  class: 'switch',
                  'aria-label': `Show ${t.title}`,
                  'data-key': `show:${t.id}`,
                  onchange: () => {
                    deps.update((q) => {
                      if (!q.tiles.includes(t.id)) q.tiles.push(t.id);
                    });
                    announce(`${t.title} added at position ${deps.getPrefs().tiles.length}`);
                    focusKey(body, `show:${t.id}`);
                  },
                }),
              ),
            ),
          )
        : h('p', { class: 'panel-note' }, 'Every tile is on your page.'),
    );
  }

  function areaSection(p: Preferences): HTMLElement {
    const sorted = [...METROS].sort((a, b) => a.name.localeCompare(b.name));
    const select = h(
      'select',
      {
        id: 'cz-metro',
        'data-key': 'metro',
        onchange: (e) => {
          const v = (e.target as HTMLSelectElement).value;
          deps.update((q) => {
            q.metroId = v || null;
          });
        },
      },
      h('option', { value: '', selected: p.metroId === null }, 'None'),
      ...sorted.map((m) => h('option', { value: m.id, selected: p.metroId === m.id }, m.name)),
    );
    return h(
      'section',
      { class: 'panel-section' },
      h('h3', {}, h('label', { for: 'cz-metro' }, 'Your area')),
      select,
      h('p', { class: 'panel-note' }, 'Used for weather and Desi Near Me. Desi Desktop never asks for your location.'),
    );
  }

  function layoutSection(p: Preferences): HTMLElement {
    const radio = (n: 3 | 4, text: string) =>
      h(
        'label',
        { class: 'radio' },
        h('input', {
          type: 'radio',
          name: 'cz-columns',
          value: String(n),
          checked: p.columns === n,
          'data-key': `cols:${n}`,
          onchange: () =>
            deps.update((q) => {
              q.columns = n;
            }),
        }),
        text,
      );
    return h(
      'section',
      { class: 'panel-section' },
      h('fieldset', {}, h('legend', {}, 'Layout'), radio(3, '3 columns'), radio(4, '4 columns on wide screens')),
    );
  }

  function shortcutsSection(p: Preferences): HTMLElement {
    const list = h(
      'ol',
      { class: 'panel-list', 'aria-label': 'Your shortcuts' },
      ...p.shortcuts.map((s, i) =>
        h(
          'li',
          { class: 'panel-item shortcut-item' },
          h('input', {
            type: 'text',
            class: 'shortcut-name',
            value: s.title,
            maxlength: 60,
            'aria-label': `Name for ${hostOf(s.url)}`,
            'data-key': `name:${s.id}`,
            onchange: (e) => {
              const v = (e.target as HTMLInputElement).value.trim();
              deps.update((q) => {
                const x = q.shortcuts.find((y) => y.id === s.id);
                if (x) x.title = v || hostOf(x.url);
              });
            },
          }),
          h('span', { class: 'shortcut-host' }, hostOf(s.url)),
          h(
            'button',
            {
              type: 'button',
              class: 'icon-button',
              'aria-label': `Move ${s.title} up`,
              'data-key': `sup:${s.id}`,
              disabled: i === 0,
              onclick: () => {
                deps.update((q) => move(q.shortcuts, i, i - 1));
                if (!focusKey(body, `sup:${s.id}`)) focusKey(body, `sdown:${s.id}`);
              },
            },
            icon('up'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'icon-button',
              'aria-label': `Move ${s.title} down`,
              'data-key': `sdown:${s.id}`,
              disabled: i === p.shortcuts.length - 1,
              onclick: () => {
                deps.update((q) => move(q.shortcuts, i, i + 1));
                if (!focusKey(body, `sdown:${s.id}`)) focusKey(body, `sup:${s.id}`);
              },
            },
            icon('down'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'icon-button',
              'aria-label': `Remove ${s.title}`,
              'data-key': `srm:${s.id}`,
              onclick: () => {
                deps.update((q) => {
                  q.shortcuts = q.shortcuts.filter((y) => y.id !== s.id);
                });
                announce(`${s.title} removed`);
                focusKey(body, 'sc-name');
              },
            },
            icon('close', 16),
          ),
        ),
      ),
    );

    const full = p.shortcuts.length >= MAX_SHORTCUTS;
    const form = h(
      'form',
      {
        class: 'shortcut-form',
        novalidate: true,
        onsubmit: (e) => {
          e.preventDefault();
          const f = e.currentTarget as HTMLFormElement;
          const name = (f.elements.namedItem('sc-name') as HTMLInputElement).value.trim();
          const addr = (f.elements.namedItem('sc-url') as HTMLInputElement).value;
          if (deps.getPrefs().shortcuts.length >= MAX_SHORTCUTS) return;
          const check = checkShortcutUrl(addr);
          if (!check.ok) {
            shortcutMessage = check.reason;
            refresh();
            focusKey(body, 'sc-url');
            return;
          }
          const title = (name || hostOf(check.url)).slice(0, 60);
          deps.update((q) => {
            q.shortcuts.push({ id: newId(), title, url: check.url });
          });
          shortcutMessage = check.insecure
            ? `Added ${title}. Warning: this address uses http://, which is not secure.`
            : `Added ${title}.`;
          refresh();
          focusKey(body, 'sc-name');
        },
      },
      h('label', { for: 'sc-name' }, 'Name'),
      h('input', { id: 'sc-name', name: 'sc-name', type: 'text', maxlength: 60, autocomplete: 'off', disabled: full, 'data-key': 'sc-name' }),
      h('label', { for: 'sc-url' }, 'Web address'),
      h('input', {
        id: 'sc-url',
        name: 'sc-url',
        type: 'url',
        inputmode: 'url',
        autocomplete: 'off',
        placeholder: 'https://',
        disabled: full,
        'data-key': 'sc-url',
      }),
      h('button', { type: 'submit', class: 'button', disabled: full, 'data-key': 'sc-add' }, 'Add shortcut'),
    );

    return h(
      'section',
      { class: 'panel-section', 'aria-labelledby': 'cz-shortcuts' },
      h('h3', { id: 'cz-shortcuts' }, 'Shortcuts'),
      h('p', { class: 'panel-note' }, `${p.shortcuts.length} of ${MAX_SHORTCUTS}. Shortcuts stay in this browser.`),
      p.shortcuts.length ? list : null,
      full ? h('p', { class: 'panel-note' }, `You can have up to ${MAX_SHORTCUTS} shortcuts.`) : null,
      form,
      h('p', { class: 'panel-message', role: 'status' }, shortcutMessage),
    );
  }

  function resetSection(): HTMLElement {
    if (!confirmingReset) {
      return h(
        'section',
        { class: 'panel-section' },
        h(
          'button',
          {
            type: 'button',
            class: 'button secondary',
            'data-key': 'reset',
            onclick: () => {
              confirmingReset = true;
              refresh();
              focusKey(body, 'reset-cancel');
            },
          },
          'Reset to defaults',
        ),
      );
    }
    return h(
      'section',
      { class: 'panel-section confirm', role: 'group', 'aria-labelledby': 'cz-reset-q' },
      h('p', { id: 'cz-reset-q' }, 'Reset tiles, area, layout and shortcuts to the defaults?'),
      h(
        'button',
        {
          type: 'button',
          class: 'button danger',
          'data-key': 'reset-confirm',
          onclick: () => {
            confirmingReset = false;
            deps.update((q) => {
              const d = defaults();
              q.tiles = d.tiles;
              q.metroId = d.metroId;
              q.columns = d.columns;
              q.shortcuts = d.shortcuts;
            });
            announce('Settings reset to defaults');
            focusKey(body, 'reset');
          },
        },
        'Reset',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'button secondary',
          'data-key': 'reset-cancel',
          onclick: () => {
            confirmingReset = false;
            refresh();
            focusKey(body, 'reset');
          },
        },
        'Cancel',
      ),
    );
  }

  function refresh(): void {
    if (!dialog.open) return;
    const p = deps.getPrefs();
    preserveFocus(body, () => {
      clear(body);
      body.append(tilesSection(p), areaSection(p), layoutSection(p), shortcutsSection(p), resetSection());
    });
  }

  return {
    open() {
      if (!dialog.open) dialog.showModal();
      refresh();
      closeBtn.focus();
    },
    refresh,
  };
}
