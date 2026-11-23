import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ContentBundle } from '../../shared/contracts.ts';
import { BundleError, canonicalJson, readPrevious, writeBundle } from '../../engine/publish.ts';
import { runEngine, type RunResult } from '../../engine/run.ts';
import { isDue } from '../../engine/scheduler.ts';
import type { Source } from '../../engine/registry.ts';
import { NOW, config, deps, ok, raw, scriptedAdapter, source, titles } from './helpers.ts';

type Script = Parameters<typeof scriptedAdapter>[0];
const MIN = 60_000;

async function run(sources: Source[], script: Script, at = NOW, prev?: RunResult, force = false) {
  return runEngine(
    {
      config: config(sources),
      previous: prev
        ? { content: prev.files.content, health: new Map(prev.files.health.sources.map((h) => [h.id, h])) }
        : { content: null, health: new Map() },
      root: '.',
      force,
      adapters: { rss: scriptedAdapter(script) },
    },
    deps(at),
  );
}

describe('T-12 ENG-06 failure isolation and freshness limits', () => {
  const pib = source('pib');
  const hindu = source('hindu');
  const uscis = source('uscis', { tiles: ['visa'] });

  it('T-12 ENG-06 a failing source keeps its rows only within 48 h; healthy tiles are unaffected', async () => {
    const first = await run([pib, uscis], { pib: () => ok([raw(1)]), uscis: () => ok([raw(2, { url: 'https://uscis.example.org/2' })]) });
    const failing: Script = { pib: () => Promise.resolve({ kind: 'error', code: 'http-503' }), uscis: () => ok([raw(3, { url: 'https://uscis.example.org/3' })]) };

    const soon = await run([pib, uscis], failing, NOW + 60 * MIN, first);
    expect(titles(soon.files.content.tiles['india-news']?.items)).toEqual(['Headline 1']);
    expect(soon.files.content.tiles['india-news']?.state).toBe('partial');
    expect(soon.files.content.tiles.visa?.state).toBe('fresh');
    expect(soon.files.health.sources.find((h) => h.id === 'pib')).toMatchObject({ state: 'failing', consecutiveFailures: 1, errorCode: 'http-503' });

    const late = await run([pib, uscis], failing, NOW + 49 * 60 * MIN, soon);
    expect(late.files.content.tiles['india-news']?.items).toEqual([]);
    expect(late.files.content.tiles['india-news']?.state).toBe('empty');
    expect(titles(late.files.content.tiles.visa?.items)).toEqual(['Headline 3']);
  });

  it('T-12 ENG-06 a valid empty feed is "empty", not failed', async () => {
    const r = await run([pib], { pib: () => ok([]) });
    expect(r.files.health.sources[0]?.state).toBe('ok');
    expect(r.files.content.tiles['india-news']?.state).toBe('empty');
  });

  it('T-12 ENG-06 an adapter crash only affects its own source', async () => {
    const r = await run([pib, hindu], { pib: () => Promise.reject(new Error('boom')), hindu: () => ok([raw(1)]) });
    expect(r.outcomes.find((o) => o.id === 'pib')).toMatchObject({ outcome: 'error', code: 'adapter-crashed' });
    expect(titles(r.files.content.tiles['india-news']?.items)).toEqual(['Headline 1']);
  });
});

describe('T-13 ENG-07 ENG-08 304, ages and health', () => {
  const pib = source('pib');

  it('T-13 ENG-07 a 304 reuses rows without resetting their age', async () => {
    const first = await run([pib], { pib: () => ok([raw(1, { publishedAt: null })], '"v1"') });
    const row = first.files.content.tiles['india-news']?.items[0];
    const second = await run([pib], { pib: () => Promise.resolve({ kind: 'not-modified' }) }, NOW + 45 * MIN, first);
    const again = second.files.content.tiles['india-news']?.items[0];
    expect(again).toEqual(row);
    expect(again?.firstSeenAt).toBe('2026-11-20T12:00:00Z');
    expect(second.files.health.sources[0]).toMatchObject({ state: 'ok', etag: '"v1"', lastSuccessAt: '2026-11-20T12:45:00Z' });
  });

  it('T-13 ENG-08 health shows each source; a successful run with one stale source reports it stale', async () => {
    const slow = source('slow', { minIntervalMinutes: 60 });
    const first = await run([pib, slow], { pib: () => ok([raw(1)]), slow: () => ok([raw(2, { url: 'https://news.example.org/slow' })]) });
    // Four hours later only pib is fetched (slow's adapter fails) — the run itself still succeeds.
    const later = await run([pib, slow], { pib: () => ok([raw(1)]), slow: () => Promise.resolve({ kind: 'error', code: 'timeout' }) }, NOW + 4 * 60 * MIN, first);
    const h = Object.fromEntries(later.files.health.sources.map((x) => [x.id, x.state]));
    expect(h).toEqual({ pib: 'ok', slow: 'failing' });
    const quiet = await run([pib, slow], { pib: () => ok([raw(1)]) }, NOW + 4 * 60 * MIN + 10 * MIN, later);
    expect(quiet.files.health.sources.find((x) => x.id === 'slow')?.state).toBe('failing');
  });

  it('T-13 ENG-08 a source that is not due keeps its rows and stays ok', async () => {
    const daily = source('daily', { minIntervalMinutes: 1440 });
    const first = await run([daily], { daily: () => ok([raw(1)]) });
    const notDue = await run([daily], {}, NOW + 20 * 60 * MIN, first);
    expect(notDue.outcomes[0]?.outcome).toBe('not-due');
    expect(notDue.files.health.sources[0]?.state).toBe('ok');
    expect(titles(notDue.files.content.tiles['india-news']?.items)).toEqual(['Headline 1']);
    expect(notDue.files.content.tiles['india-news']?.state).toBe('fresh');
  });

  it('T-13 D16 reused rows older than 3× the interval make the tile stale, not just partial', async () => {
    const pib30 = source('pib'); // 30-minute interval: stale after 90 minutes without success
    const first = await run([pib30], { pib: () => ok([raw(1)]) });
    const fail: Script = { pib: () => Promise.resolve({ kind: 'error', code: 'timeout' }) };
    const at60 = await run([pib30], fail, NOW + 60 * MIN, first);
    expect(at60.files.content.tiles['india-news']?.state).toBe('partial');
    const at3h = await run([pib30], fail, NOW + 180 * MIN, at60);
    expect(at3h.files.content.tiles['india-news']?.state).toBe('stale');
    expect(titles(at3h.files.content.tiles['india-news']?.items)).toEqual(['Headline 1']);
  });

  it('T-13 spec 5.3 scheduling: due after the interval; force ignores it', () => {
    const s = source('s', { minIntervalMinutes: 60 });
    const h = { lastAttemptAt: '2026-11-20T11:30:00Z' } as Parameters<typeof isDue>[1];
    expect(isDue(s, h, NOW)).toBe(false);
    expect(isDue(s, h, NOW + 30 * MIN)).toBe(true);
    expect(isDue(s, h, NOW, true)).toBe(true);
    expect(isDue(s, undefined, NOW)).toBe(true);
  });
});

describe('T-14 ENG-05 ENG-10 assembly and publishing', () => {
  it('T-14 ENG-05 identical input gives identical output and hash', async () => {
    const sources = [source('pib'), source('hindu')];
    const script: Script = { pib: () => ok([raw(1), raw(2)]), hindu: () => ok([raw(3, { url: 'https://hindu.example.org/3' })]) };
    const a = await run(sources, script);
    const b = await run(sources, script);
    expect(canonicalJson(a.files)).toBe(canonicalJson(b.files));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(b.hash);
  });

  it('T-14 ENG-05 tiles are capped at 20 rows and sources are interleaved', async () => {
    const many = (prefix: string) => Array.from({ length: 20 }, (_, i) => raw(i + 1, { guid: `${prefix}${i}`, url: `https://${prefix}.example.org/${i}`, title: `${prefix} ${i}` }));
    const r = await run([source('pib'), source('hindu')], { pib: () => ok(many('pib')), hindu: () => ok(many('hindu')) });
    const items = r.files.content.tiles['india-news']?.items ?? [];
    expect(items).toHaveLength(20);
    expect(items.slice(0, 4).map((i) => i.sourceId)).toEqual(['pib', 'hindu', 'pib', 'hindu']);
  });

  it('T-14 ENG-05 cross-source dedupe is by canonical URL only', async () => {
    const r = await run([source('pib'), source('hindu')], {
      pib: () => ok([raw(1, { url: 'https://shared.example.org/x?utm_source=rss' }), raw(2, { title: 'Same words', url: 'https://a.example.org/' })]),
      hindu: () => ok([raw(5, { url: 'https://shared.example.org/x' }), raw(6, { title: 'Same words', url: 'https://b.example.org/' })]),
    });
    const items = r.files.content.tiles['india-news']?.items ?? [];
    expect(items.filter((i) => i.url === 'https://shared.example.org/x')).toHaveLength(1);
    expect(items.filter((i) => i.title === 'Same words')).toHaveLength(2);
  });

  it('T-14 ENG-10 a valid bundle is written; an invalid bundle is never written and the old one stays', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dd-bundle-'));
    const out = join(dir, 'data');
    const r = await run([source('pib')], { pib: () => ok([raw(1)]) });
    const ids = new Set(['pib']);
    writeBundle(out, r.files, ids);
    expect(readdirSync(out).sort()).toEqual(['content.json', 'health.json', 'meta.json', 'sources.json']);
    const before = readFileSync(join(out, 'content.json'), 'utf8');

    const broken = structuredClone(r.files);
    const first = broken.content.tiles['india-news']?.items[0];
    if (first) first.url = 'javascript:alert(1)';
    expect(() => writeBundle(out, broken, ids)).toThrow(BundleError);
    expect(readFileSync(join(out, 'content.json'), 'utf8')).toBe(before);
    expect(readdirSync(dir)).toEqual(['data']); // no temp folders left behind

    const orphan = structuredClone(r.files);
    orphan.sources.sources = [];
    expect(() => writeBundle(out, orphan, ids)).toThrow(/unpublished source "pib"/);
  });

  it('T-14 spec 5.4 step 2: a previous bundle is untrusted input; invalid files are ignored', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dd-prev-'));
    writeFileSync(join(dir, 'content.json'), JSON.stringify({ schemaVersion: 2, tiles: { 'india-news': 'nope' } } satisfies Partial<ContentBundle> | object));
    writeFileSync(join(dir, 'health.json'), '{not json');
    const p = readPrevious(dir);
    expect(p.content).toBeNull();
    expect(p.health.size).toBe(0);
    expect(existsSync(join(dir, 'nothing'))).toBe(false);
    expect(readPrevious(null).content).toBeNull();
  });
});
