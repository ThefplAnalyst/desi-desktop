import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isHttpsUrl, parseBundle, parseHealth } from '../../app/src/guards.ts';

const fixture = JSON.parse(readFileSync('tests/fixtures/content.sample.json', 'utf8')) as Record<string, unknown>;

describe('NFR-SEC browser data guards', () => {
  it('NFR-SEC the development fixture bundle is valid', () => {
    const b = parseBundle(fixture);
    expect(b?.schemaVersion).toBe(2);
    expect(Object.keys(b?.tiles ?? {})).toContain('india-news');
  });

  it('FR-14 a bundle with an unknown schemaVersion is rejected', () => {
    expect(parseBundle({ ...fixture, schemaVersion: 3 })).toBeNull();
    expect(parseBundle(null)).toBeNull();
    expect(parseBundle('nope')).toBeNull();
  });

  it('NFR-SEC rows with non-https URLs or oversized titles are dropped; unknown tiles ignored', () => {
    const ok = { id: 'a', title: 'OK', url: 'https://example.org/a', sourceId: 's', publishedAt: null, firstSeenAt: '2026-11-20T12:00:00Z', expiresAt: null };
    const b = parseBundle({
      schemaVersion: 2,
      generatedAt: '2026-11-20T12:00:00Z',
      tiles: {
        'india-news': {
          mode: 'live',
          title: 'India',
          state: 'fresh',
          fallbackLinks: [{ title: 'bad', url: 'javascript:alert(1)' }],
          items: [ok, { ...ok, id: 'b', url: 'http://example.org/' }, { ...ok, id: 'c', url: 'javascript:alert(1)' }, { ...ok, id: 'd', title: 'x'.repeat(181) }],
        },
        'not-a-tile': { mode: 'live', title: 'X', state: 'fresh', items: [ok], fallbackLinks: [] },
      },
    });
    expect(b?.tiles['india-news']?.items.map((i) => i.id)).toEqual(['a']);
    expect(b?.tiles['india-news']?.fallbackLinks).toEqual([]);
    expect(Object.keys(b?.tiles ?? {})).toEqual(['india-news']);
  });

  it('NFR-SEC isHttpsUrl', () => {
    expect(isHttpsUrl('https://example.org/x')).toBe(true);
    for (const bad of ['http://example.org', 'javascript:x', 'https://u:p@example.org', '', 42, `https://example.org/${'a'.repeat(2050)}`]) {
      expect(isHttpsUrl(bad)).toBe(false);
    }
  });

  it('ENG-08 health entries with bad fields are skipped', () => {
    const h = parseHealth({
      sources: [
        { id: 'pib', state: 'ok', lastAttemptAt: null, lastSuccessAt: '2026-11-20T12:00:00Z', staleAfterMinutes: 90 },
        { id: 'bad', state: 'weird', lastAttemptAt: null, lastSuccessAt: null, staleAfterMinutes: 90 },
        { id: 'bad2', state: 'ok', lastAttemptAt: null, lastSuccessAt: 'yesterday', staleAfterMinutes: 90 },
      ],
    });
    expect([...h.keys()]).toEqual(['pib']);
  });
});
