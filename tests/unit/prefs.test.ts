import { describe, expect, it } from 'vitest';
import { DEFAULT_TILES } from '../../app/src/catalog.ts';
import { MAX_SHORTCUTS, PREFS_KEY, checkShortcutUrl, createPrefsStore, defaults, sanitize } from '../../app/src/prefs.ts';

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('T-06 FR-08 preferences', () => {
  it('T-06 FR-08 defaults are the nine default tiles in catalog order', () => {
    const d = defaults();
    expect(d.tiles).toEqual([
      'shortcuts',
      'india-news',
      'us-news',
      'cricket',
      'visa',
      'currency',
      'south-asia',
      'time-weather',
      'festivals',
    ]);
    expect(d).toMatchObject({ version: 1, metroId: null, columns: 4, tipDismissed: false });
    expect(d.shortcuts).toHaveLength(5);
  });

  it('T-06 FR-08 empty storage loads defaults', () => {
    expect(createPrefsStore(() => new MemoryStorage()).load()).toEqual(defaults());
  });

  it('T-06 FR-08 corrupt JSON loads defaults', () => {
    const s = new MemoryStorage();
    s.setItem(PREFS_KEY, '{not json');
    expect(createPrefsStore(() => s).load()).toEqual(defaults());
  });

  it('T-06 FR-08 future version loads defaults', () => {
    expect(sanitize({ version: 2, tiles: ['cricket'] })).toEqual(defaults());
  });

  it('T-06 FR-08 blocked storage loads defaults and save reports failure', () => {
    const blocked = createPrefsStore(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(blocked.load()).toEqual(defaults());
    expect(blocked.save(defaults())).toBe(false);
    expect(createPrefsStore(() => null).save(defaults())).toBe(false);
  });

  it('T-06 FR-08 full storage makes save report failure', () => {
    const s = new MemoryStorage();
    s.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    expect(createPrefsStore(() => s).save(defaults())).toBe(false);
  });

  it('T-06 FR-08 save then load round-trips', () => {
    const s = new MemoryStorage();
    const store = createPrefsStore(() => s);
    const p = { ...defaults(), tiles: ['cricket' as const, 'visa' as const], metroId: 'austin', columns: 3 as const, tipDismissed: true };
    expect(store.save(p)).toBe(true);
    expect(store.load()).toEqual(p);
  });

  it('T-06 FR-08 unknown and duplicate tile ids are dropped; hidden tiles are not selectable', () => {
    const p = sanitize({ version: 1, tiles: ['cricket', 'bogus', 'cricket', 'deals', 'visa'] });
    expect(p.tiles).toEqual(['cricket', 'visa']);
  });

  it('T-06 FR-06 an empty tile list is respected', () => {
    expect(sanitize({ version: 1, tiles: [] }).tiles).toEqual([]);
    expect(sanitize({ version: 1 }).tiles).toEqual(DEFAULT_TILES);
  });

  it('T-06 FR-10 D40 unknown metro becomes none; columns other than 3 become 4', () => {
    expect(sanitize({ version: 1, metroId: 'atlantis', columns: 7 })).toMatchObject({ metroId: null, columns: 4 });
    expect(sanitize({ version: 1, columns: 3 })).toMatchObject({ columns: 3 });
  });

  it('T-07 FR-09 stored shortcuts with non-http(s) URLs are dropped and the list is capped at 12', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, title: `S${i}`, url: `https://example${i}.org/` }));
    const p = sanitize({
      version: 1,
      shortcuts: [{ id: 'bad', title: 'Bad', url: 'javascript:alert(1)' }, { id: 'd', title: 'Data', url: 'data:text/html,x' }, ...many],
    });
    expect(p.shortcuts).toHaveLength(MAX_SHORTCUTS);
    expect(p.shortcuts.every((s) => s.url.startsWith('https://'))).toBe(true);
  });
});

describe('T-07 FR-09 shortcut URL validation', () => {
  it('T-07 FR-09 accepts https and adds https:// to bare domains', () => {
    expect(checkShortcutUrl('https://mail.google.com')).toEqual({ ok: true, url: 'https://mail.google.com/', insecure: false });
    expect(checkShortcutUrl('  example.org/path ')).toEqual({ ok: true, url: 'https://example.org/path', insecure: false });
  });

  it('T-07 FR-09 accepts http with a warning flag', () => {
    expect(checkShortcutUrl('http://example.org')).toMatchObject({ ok: true, insecure: true });
  });

  it('T-07 FR-09 rejects other schemes, credentials and junk', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.org', 'file:///c:/x', 'https://user:pw@example.org', '', 'not a url']) {
      expect(checkShortcutUrl(bad).ok, bad).toBe(false);
    }
  });
});
