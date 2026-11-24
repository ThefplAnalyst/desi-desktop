import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { curatedAdapter, festivalRows } from '../../engine/adapters/curated.ts';
import { loadConfig } from '../../engine/registry.ts';
import { runEngine } from '../../engine/run.ts';
import { NOW, deps } from './helpers.ts';

const real = loadConfig('.');
// Curated content only: network sources the owner has approved are switched off for this test.
const cfg = { ...real, registry: real.registry.map((s) => (s.adapter === 'curated' ? s : { ...s, enabled: false })) };
const festivals = cfg.registry.find((s) => s.id === 'festivals');

/** A copy of content/ in which every curated file is back to "unverified", as before the owner checks it. */
function unverifiedRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dd-curated-'));
  cpSync('content', join(root, 'content'), { recursive: true });
  const dir = join(root, 'content/curated');
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const f = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { review?: Record<string, unknown> };
    if (f.review) f.review = { ...f.review, status: 'unverified', verifiedBy: null, verifiedAt: null };
    writeFileSync(join(dir, name), JSON.stringify(f));
  }
  return root;
}

describe('ENG-04 D25 curated adapter', () => {
  it('D25 refuses curated files the owner has not verified, unless it is a dev preview', async () => {
    if (!festivals) throw new Error('festivals source missing');
    const ctx = { source: festivals, now: NOW, root: unverifiedRoot(), http: deps().http, previous: undefined, metros: [] };
    expect(await curatedAdapter({ ...ctx, allowUnverified: false })).toEqual({ kind: 'error', code: 'curated-unverified' });
    const r = await curatedAdapter({ ...ctx, allowUnverified: true });
    expect(r.kind).toBe('ok');
  });

  it('D37 the owner-verified festivals file is published without preview mode', async () => {
    if (!festivals) throw new Error('festivals source missing');
    const r = await curatedAdapter({ source: festivals, now: NOW, root: '.', http: deps().http, previous: undefined, metros: [], allowUnverified: false });
    expect(r.kind).toBe('ok');
  });

  it('ENG-04 estimated festival dates are labelled "(expected)" and expire after the day ends in the US', () => {
    const rows = festivalRows({
      review: { status: 'verified', verifiedBy: 'owner', verifiedAt: '2026-11-23' },
      items: [{ id: 'eid', title: 'Eid al-Fitr', date: '2027-03-10', url: 'https://example.org/eid', countries: ['PK'], estimated: true, source: 'x' }],
    });
    expect(rows[0]).toMatchObject({ title: 'Eid al-Fitr (expected)', startsAt: '2027-03-10', expiresAt: '2027-03-11T12:00:00Z' });
  });

  it('M2 exit: a dry run from unverified curated content writes a valid preview bundle; the real gate shows links', async () => {
    const root = unverifiedRoot();
    const preview = await runEngine({ config: cfg, previous: { content: null, health: new Map() }, root, previewCurated: true }, deps());
    expect(preview.files.meta.preview).toBe(true);
    expect(preview.files.content.tiles.festivals?.items.length).toBeGreaterThan(5);
    const gated = await runEngine({ config: cfg, previous: { content: null, health: new Map() }, root }, deps());
    expect(gated.files.meta.preview).toBe(false);
    expect(gated.files.content.tiles.festivals?.items).toEqual([]);
    expect(gated.files.content.tiles['south-asia']?.state).toBe('links');
    expect(gated.files.content.tiles['india-news']).toMatchObject({ state: 'links', title: 'India News' });
  });
});
