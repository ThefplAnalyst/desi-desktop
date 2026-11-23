import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, isPublishable, loadConfig, registryProblems } from '../../engine/registry.ts';
import { runEngine } from '../../engine/run.ts';
import { NOW, approvedRights, config, deps, ok, raw, scriptedAdapter, source, titles } from './helpers.ts';

describe('T-09 ENG-02 ENG-09 registry and rights gate', () => {
  it('T-09 ENG-02 the repository config, registry and curated files are valid', () => {
    const c = loadConfig('.');
    expect(c.registry.length).toBeGreaterThanOrEqual(8);
    expect(c.links.length).toBe(9);
  });

  it('T-09 ENG-09 every source in the repository starts disabled and unapproved (owner approves)', () => {
    const c = loadConfig('.');
    for (const s of c.registry) {
      expect(s.enabled, s.id).toBe(false);
      expect(s.rights.status, s.id).not.toBe('approved');
    }
  });

  it('T-09 ENG-09 registry rejects enabled unapproved sources', () => {
    const problems = registryProblems([source('a', { rights: { ...approvedRights, status: 'reviewed' } })]);
    expect(problems.join()).toMatch(/enabled but rights.status is "reviewed"/);
  });

  it('T-09 ENG-09 approval needs a recorded review', () => {
    const problems = registryProblems([source('a', { rights: { ...approvedRights, reviewedBy: null } })]);
    expect(problems.join()).toMatch(/without a recorded review/);
  });

  it('T-09 ENG-09 loadConfig fails the run on an enabled unapproved source', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dd-config-'));
    cpSync('config', join(dir, 'config'), { recursive: true });
    cpSync('content', join(dir, 'content'), { recursive: true });
    const reg = JSON.parse(readFileSync(join(dir, 'config/sources.json'), 'utf8')) as { sources: { enabled: boolean }[] };
    const first = reg.sources[0];
    if (first) first.enabled = true;
    writeFileSync(join(dir, 'config/sources.json'), JSON.stringify(reg));
    expect(() => loadConfig(dir)).toThrow(ConfigError);
  });

  it('T-09 ENG-09 publishable only when enabled, approved and review not overdue', () => {
    expect(isPublishable(source('a'), NOW)).toBe(true);
    expect(isPublishable(source('a', { enabled: false }), NOW)).toBe(false);
    expect(isPublishable(source('a', { rights: { ...approvedRights, status: 'revoked' } }), NOW)).toBe(false);
    expect(isPublishable(source('a', { rights: { ...approvedRights, reviewDueAt: '2026-11-19' } }), NOW)).toBe(false);
  });

  for (const [name, change] of [
    ['revoked', { rights: { ...approvedRights, status: 'revoked' as const }, enabled: false }],
    ['overdue review', { rights: { ...approvedRights, reviewDueAt: '2026-11-20' } }],
  ] as const) {
    it(`T-09 ENG-09 a ${name} source loses its rows immediately, including fallback (previous) rows`, async () => {
      const pib = source('pib', { fallbackLinks: [{ title: 'PIB', url: 'https://www.pib.gov.in/' }] });
      const adapters = { rss: scriptedAdapter({ pib: () => ok([raw(1), raw(2)]) }) };
      const first = await runEngine({ config: config([pib]), previous: { content: null, health: new Map() }, root: '.', adapters }, deps());
      expect(titles(first.files.content.tiles['india-news']?.items)).toEqual(['Headline 1', 'Headline 2']);

      const later = deps(NOW + 10 * 60_000); // not even due again: rows would normally be reused
      const second = await runEngine(
        {
          config: config([source('pib', { ...change, fallbackLinks: pib.fallbackLinks })]),
          previous: { content: first.files.content, health: new Map(first.files.health.sources.map((h) => [h.id, h])) },
          root: '.',
          adapters,
        },
        later,
      );
      const tile = second.files.content.tiles['india-news'];
      expect(tile?.items).toEqual([]);
      expect(tile?.state).toBe('links');
      expect(second.files.sources.sources).toEqual([]);
      expect(second.files.health.sources[0]?.state).toBe('disabled');
    });
  }
});
