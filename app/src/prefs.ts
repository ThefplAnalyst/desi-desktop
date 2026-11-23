// Preferences (spec 6.4, FR-08). The only module that touches localStorage.
import type { Preferences, TileId } from '../../shared/contracts.ts';
import { DEFAULT_TILES, METROS, SELECTABLE_IDS } from './catalog.ts';

export const PREFS_KEY = 'desiDesktop:prefs:v1';
export const MAX_SHORTCUTS = 12;

type Shortcut = Preferences['shortcuts'][number];

const STARTER_SHORTCUTS: Omit<Shortcut, 'id'>[] = [
  { title: 'Gmail', url: 'https://mail.google.com/' },
  { title: 'WhatsApp Web', url: 'https://web.whatsapp.com/' },
  { title: 'LinkedIn', url: 'https://www.linkedin.com/' },
  { title: 'GitHub', url: 'https://github.com/' },
  { title: 'USCIS case status', url: 'https://egov.uscis.gov/' },
];

export function defaults(): Preferences {
  return {
    version: 1,
    tiles: [...DEFAULT_TILES],
    metroId: null,
    columns: 3,
    shortcuts: STARTER_SHORTCUTS.map((s, i) => ({ id: `s${i + 1}`, ...s })),
    tipDismissed: false,
  };
}

export type UrlCheck = { ok: true; url: string; insecure: boolean } | { ok: false; reason: string };

/** FR-09: only https: (and http: with a warning). Bare domains get https://. */
export function checkShortcutUrl(input: string): UrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'Enter a web address.' };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'That does not look like a web address.' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, reason: 'Only web addresses starting with https:// can be added.' };
  }
  if (u.username || u.password) return { ok: false, reason: 'Addresses with a username or password cannot be added.' };
  if (!u.hostname.includes('.') && u.hostname !== 'localhost') return { ok: false, reason: 'That does not look like a web address.' };
  if (u.href.length > 2048) return { ok: false, reason: 'That address is too long.' };
  return { ok: true, url: u.href, insecure: u.protocol === 'http:' };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Pure: turns whatever was stored into valid Preferences. Anything unusable falls back to defaults. */
export function sanitize(raw: unknown): Preferences {
  const d = defaults();
  if (!isObj(raw) || raw['version'] !== 1) return d;

  const tiles: TileId[] = [];
  if (Array.isArray(raw['tiles'])) {
    for (const t of raw['tiles']) {
      if (typeof t === 'string' && SELECTABLE_IDS.has(t as TileId) && !tiles.includes(t as TileId)) tiles.push(t as TileId);
    }
  }

  const metroId = typeof raw['metroId'] === 'string' && METROS.some((m) => m.id === raw['metroId']) ? raw['metroId'] : null;

  const shortcuts: Shortcut[] = [];
  if (Array.isArray(raw['shortcuts'])) {
    for (const s of raw['shortcuts']) {
      if (shortcuts.length >= MAX_SHORTCUTS) break;
      if (!isObj(s) || typeof s['url'] !== 'string' || typeof s['title'] !== 'string') continue;
      const check = checkShortcutUrl(s['url']);
      if (!check.ok || check.url !== s['url']) continue;
      const id = typeof s['id'] === 'string' && s['id'] ? s['id'] : newId();
      if (shortcuts.some((x) => x.id === id)) continue;
      shortcuts.push({ id, title: s['title'].slice(0, 60) || hostOf(check.url), url: check.url });
    }
  }

  return {
    version: 1,
    tiles: Array.isArray(raw['tiles']) ? tiles : d.tiles,
    metroId,
    columns: raw['columns'] === 4 ? 4 : 3,
    shortcuts: Array.isArray(raw['shortcuts']) ? shortcuts : d.shortcuts,
    tipDismissed: raw['tipDismissed'] === true,
  };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function newId(): string {
  return `s${Math.random().toString(36).slice(2, 10)}`;
}

export interface PrefsStore {
  load(): Preferences;
  /** Returns false when the browser would not save (blocked or full storage). */
  save(p: Preferences): boolean;
}

/** `getStorage` is injected so tests can pass a fake, a throwing getter, or null. */
export function createPrefsStore(getStorage: () => Storage | null = () => window.localStorage): PrefsStore {
  return {
    load() {
      try {
        const text = getStorage()?.getItem(PREFS_KEY);
        return text ? sanitize(JSON.parse(text)) : defaults();
      } catch {
        return defaults();
      }
    },
    save(p) {
      try {
        const storage = getStorage();
        if (!storage) return false;
        storage.setItem(PREFS_KEY, JSON.stringify(p));
        return true;
      } catch {
        return false;
      }
    },
  };
}
