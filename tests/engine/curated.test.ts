import { describe, expect, it } from 'vitest';
import { curatedAdapter, festivalRows } from '../../engine/adapters/curated.ts';
import { loadConfig } from '../../engine/registry.ts';
import { runEngine } from '../../engine/run.ts';
import { NOW, deps } from './helpers.ts';

const cfg = loadConfig('.');
const festivals = cfg.registry.find((s) => s.id === 'festivals');

describe('ENG-04 D25 curated adapter', () => {
  it('D25 refuses curated files the owner has not verified, unless it is a dev preview', async () => {
    if (!festivals) throw new Error('festivals source missing');
    const ctx = { source: festivals, now: NOW, root: '.', http: deps().http, previous: undefined, metros: [] };
    expect(await curatedAdapter({ ...ctx, allowUnverified: false })).toEqual({ kind: 'error', code: 'curated-unverified' });
    const r = await curatedAdapter({ ...ctx, allowUnverified: true });
    expect(r.kind).toBe('ok');
  });

  it('ENG-04 estimated festival dates are labelled "(expected)" and expire after the day ends in the US', () => {
    const rows = festivalRows({
      review: { status: 'verified', verifiedBy: 'owner', verifiedAt: '2026-11-23' },
      items: [{ id: 'eid', title: 'Eid al-Fitr', date: '2027-03-10', url: 'https://example.org/eid', countries: ['PK'], estimated: true, source: 'x' }],
    });
    expect(rows[0]).toMatchObject({ title: 'Eid al-Fitr (expected)', startsAt: '2027-03-10', expiresAt: '2027-03-11T12:00:00Z' });
  });

  it('M2 exit: a dry run from curated content only writes a valid preview bundle; the real gate shows links', async () => {
    const preview = await runEngine({ config: cfg, previous: { content: null, health: new Map() }, root: '.', previewCurated: true }, deps());
    expect(preview.files.meta.preview).toBe(true);
    expect(preview.files.content.tiles.festivals?.items.length).toBeGreaterThan(5);
    const gated = await runEngine({ config: cfg, previous: { content: null, health: new Map() }, root: '.' }, deps());
    expect(gated.files.meta.preview).toBe(false);
    expect(gated.files.sources.sources).toEqual([]);
    expect(gated.files.content.tiles['south-asia']?.state).toBe('links');
    expect(gated.files.content.tiles['india-news']).toMatchObject({ state: 'links', title: 'India News' });
  });
});
