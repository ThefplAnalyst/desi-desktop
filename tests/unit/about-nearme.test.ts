import { describe, expect, it } from 'vitest';
import { METROS } from '../../app/src/catalog.ts';
import { NEAR_ME_SEARCHES, nearMeLinks } from '../../app/src/nearme.ts';
import { renderSourcesList, shiftTimes } from '../../scripts/vite-plugins.ts';

describe('T-08 FR-13 About & Sources list', () => {
  const src = (id: string, enabled: boolean, status: string) => ({
    id,
    publisher: `Pub ${id}`,
    attribution: `Attr ${id}`,
    adapter: 'rss',
    tiles: ['india-news'],
    enabled,
    rights: { status, termsUrl: 'https://example.org/terms' },
  });

  it('T-08 FR-13 lists every enabled, approved source with attribution and terms link', () => {
    const html = renderSourcesList({ sources: [src('a', true, 'approved'), src('b', true, 'approved')] });
    expect(html).toContain('Pub a');
    expect(html).toContain('Pub b');
    expect(html).toContain('href="https://example.org/terms"');
  });

  it('T-08 ENG-09 never lists disabled or unapproved sources', () => {
    const html = renderSourcesList({ sources: [src('off', false, 'approved'), src('draft', true, 'draft'), src('rev', true, 'revoked')] });
    expect(html).toBe('<p>No sources are switched on yet.</p>');
    expect(renderSourcesList(null)).toBe('<p>No sources are switched on yet.</p>');
  });

  it('T-08 NFR-SEC escapes registry text', () => {
    const html = renderSourcesList({ sources: [{ ...src('x', true, 'approved'), publisher: '<script>alert(1)</script>' }] });
    expect(html).not.toContain('<script>');
  });

  it('M1 dev fixtures: timestamps shift, other strings do not', () => {
    expect(shiftTimes({ a: '2026-11-20T12:00:00.000Z', b: 'hello', c: ['2026-11-20T12:00:00Z'] }, 60_000)).toEqual({
      a: '2026-11-20T12:01:00.000Z',
      b: 'hello',
      c: ['2026-11-20T12:01:00.000Z'],
    });
  });
});

describe('T-07 FR-10 metro areas', () => {
  it('T-07 FR-10 there are 20 metros with unique ids and valid coordinates', () => {
    expect(METROS).toHaveLength(20);
    expect(new Set(METROS.map((m) => m.id)).size).toBe(20);
    for (const m of METROS) {
      expect(m.lat).toBeGreaterThan(24);
      expect(m.lat).toBeLessThan(50);
      expect(m.lon).toBeLessThan(-66);
      expect(m.timeZone).toMatch(/^America\//);
    }
  });

  it('T-07 FR-10 Desi Near Me builds 10 Google Maps searches for the chosen metro', () => {
    const austin = METROS.find((m) => m.id === 'austin');
    if (!austin) throw new Error('austin missing');
    const links = nearMeLinks(austin);
    expect(links).toHaveLength(NEAR_ME_SEARCHES.length);
    expect(links[0]?.url).toBe('https://www.google.com/maps/search/Indian+grocery+Austin%2C+TX');
  });
});
