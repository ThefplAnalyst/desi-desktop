import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkRefresh } from '../../watchdog/src/index.ts';
import { failingForMs, planDeployAlert, planSourceAlerts } from '../../engine/alert.ts';
import { decideDeploy, fetchLive, newerHealth, smoke, smokeOnce, stageData, StageError } from '../../engine/deploy.ts';
import type { AdapterContext } from '../../engine/adapters/types.ts';
import { writeBundle } from '../../engine/publish.ts';
import { runEngine } from '../../engine/run.ts';
import type { SourceHealth } from '../../shared/contracts.ts';
import { NOW, config, deps, ok, raw, scriptedAdapter, source } from './helpers.ts';

const HOUR = 3600_000;
const empty = { content: null, health: new Map<string, SourceHealth>() };

async function bundleFor(sources = [source('a')], at = NOW, previous: Parameters<typeof runEngine>[0]['previous'] = empty) {
  const r = await runEngine({ config: config(sources), previous, root: '.', commit: 'abc123', adapters: { rss: scriptedAdapter({ a: () => ok([raw(1), raw(2)]) }) } }, deps(at));
  return r;
}

describe('T-15 ENG-10 change detection and heartbeat', () => {
  it('T-15 ENG-10 unchanged content skips the deploy, except one daily heartbeat', async () => {
    const first = await bundleFor();
    const live = { content: first.files.content, meta: first.files.meta };
    // The next run reads the live bundle as its previous state, as refresh.yml does.
    const again = await bundleFor([source('a')], NOW + 30 * 60_000, { content: first.files.content, health: new Map(first.files.health.sources.map((h) => [h.id, h])) });
    expect(again.hash).toBe(first.hash);
    expect(decideDeploy({ contentHash: again.hash, commit: 'abc123', live, now: NOW + 30 * 60_000 })).toEqual({ deploy: false, reason: 'unchanged' });
    const nextDay = Date.parse('2026-11-21T00:10:00Z');
    expect(decideDeploy({ contentHash: again.hash, commit: 'abc123', live, now: nextDay })).toEqual({ deploy: true, reason: 'heartbeat' });
  });

  it('T-15 ENG-10 changed content deploys once; after that deploy it is unchanged again', async () => {
    const first = await bundleFor();
    const changed = await runEngine(
      { config: config([source('a')]), previous: empty, root: '.', commit: 'abc123', adapters: { rss: scriptedAdapter({ a: () => ok([raw(1), raw(3)]) }) } },
      deps(NOW + HOUR),
    );
    const before = { content: first.files.content, meta: first.files.meta };
    expect(decideDeploy({ contentHash: changed.hash, commit: 'abc123', live: before, now: NOW + HOUR })).toEqual({ deploy: true, reason: 'content-changed' });
    const after = { content: changed.files.content, meta: changed.files.meta };
    expect(decideDeploy({ contentHash: changed.hash, commit: 'abc123', live: after, now: NOW + HOUR })).toEqual({ deploy: false, reason: 'unchanged' });
  });

  it('T-15 D38 a first deploy, a new commit and a forced run always deploy', async () => {
    const b = await bundleFor();
    const live = { content: b.files.content, meta: b.files.meta };
    expect(decideDeploy({ contentHash: b.hash, commit: 'abc123', live: { content: null, meta: null }, now: NOW }).reason).toBe('first-deploy');
    expect(decideDeploy({ contentHash: b.hash, commit: 'def456', live, now: NOW }).reason).toBe('code-changed');
    expect(decideDeploy({ contentHash: b.hash, commit: 'abc123', live, now: NOW, force: true }).reason).toBe('forced');
  });

  it('T-15 D38 health is scheduled from the newer of the live file and the workflow cache', () => {
    const live = { generatedAt: '2026-11-20T10:00:00Z', sources: [] };
    const cached = { generatedAt: '2026-11-20T11:30:00Z', sources: [] };
    expect(newerHealth(live, cached)).toBe(cached);
    expect(newerHealth({ ...live, generatedAt: '2026-11-20T12:00:00Z' }, cached)?.generatedAt).toBe('2026-11-20T12:00:00Z');
    expect(newerHealth(null, cached)).toBe(cached);
  });

  it('T-13 D38 conditional headers are sent only when the previous rows exist, so a 304 never empties a tile', async () => {
    const seen: (string | null | undefined)[] = [];
    const adapter = (ctx: AdapterContext) => {
      seen.push(ctx.previous?.etag);
      return ok([raw(1)]);
    };
    const health = new Map<string, SourceHealth>([
      ['a', { id: 'a', state: 'ok', lastAttemptAt: '2026-11-19T00:00:00Z', lastSuccessAt: '2026-11-19T00:00:00Z', consecutiveFailures: 0, etag: '"v1"', lastModified: null, staleAfterMinutes: 90, errorCode: null }],
    ]);
    await runEngine({ config: config([source('a')]), previous: { content: null, health }, root: '.', adapters: { rss: adapter } }, deps());
    const withRows = await bundleFor();
    await runEngine({ config: config([source('a')]), previous: { content: withRows.files.content, health }, root: '.', adapters: { rss: adapter } }, deps());
    expect(seen).toEqual([null, '"v1"']);
  });
});

describe('T-16 ENG-11 disabling and forcing', () => {
  it('T-16 ENG-11 disabling a source in config and re-running removes its rows', async () => {
    const first = await bundleFor();
    expect(first.files.content.tiles['india-news']?.items.length).toBe(2);
    const off = await runEngine({ config: config([source('a', { enabled: false })]), previous: { content: first.files.content, health: new Map() }, root: '.' }, deps(NOW + 60_000));
    expect(off.files.content.tiles['india-news']?.items ?? []).toEqual([]);
    expect(off.files.sources.sources).toEqual([]);
  });

  it('T-16 ENG-11 a forced run still never fetches a source without approval', async () => {
    const adapter = vi.fn(() => ok([raw(1)]));
    const r = await runEngine(
      { config: config([source('a', { enabled: false, rights: { ...source('a').rights, status: 'reviewed' } })]), previous: empty, root: '.', force: true, adapters: { rss: adapter } },
      deps(),
    );
    expect(adapter).not.toHaveBeenCalled();
    expect(r.outcomes[0]?.outcome).toBe('unpublishable');
  });
});

describe('T-17 ENG-13 NFR-PRIV no secrets or raw bodies', () => {
  it('T-17 ENG-13 raw feed bodies and the contact address never reach /data/*', async () => {
    const marker = 'RAW-BODY-MARKER-7f3a';
    const feed = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>Visa news</title><link>https://a.example.org/x</link><description>${marker}</description><guid>g1</guid></item></channel></rss>`;
    const fetchImpl = (() => Promise.resolve(new Response(feed, { status: 200, headers: { 'content-type': 'application/rss+xml' } }))) as typeof fetch;
    const d = deps(NOW, fetchImpl);
    d.http.userAgent = 'DesiDesktopBot/1.0 (+https://example.org/about/; owner-contact@example.org)';
    const r = await runEngine({ config: config([source('a')]), previous: empty, root: '.' }, d);
    expect(r.files.content.tiles['india-news']?.items[0]?.title).toBe('Visa news');
    const dir = join(mkdtempSync(join(tmpdir(), 'dd-t17-')), 'data');
    writeBundle(dir, r.files, new Set(['a']));
    for (const f of readdirSync(dir)) {
      const text = readFileSync(join(dir, f), 'utf8');
      expect(text, f).not.toContain(marker);
      expect(text, f).not.toContain('owner-contact@example.org');
    }
  });

  it('T-17 D38 a preview bundle (unapproved curated content) can never be staged for deploy', async () => {
    const r = await bundleFor();
    const root = mkdtempSync(join(tmpdir(), 'dd-stage-'));
    const bundle = join(root, 'data');
    writeBundle(bundle, { ...r.files, meta: { ...r.files.meta, preview: true } }, new Set(['a']));
    const dist = join(root, 'dist');
    mkdirSync(dist);
    writeFileSync(join(dist, 'index.html'), '<title>Desi Desktop</title>');
    expect(() => stageData(bundle, dist)).toThrow(StageError);
    writeBundle(bundle, r.files, new Set(['a']));
    stageData(bundle, dist);
    expect(JSON.parse(readFileSync(join(dist, 'data', 'meta.json'), 'utf8'))).toMatchObject({ preview: false, commit: 'abc123' });
  });
});

// A fake deployed site for smoke tests.
function site(files: Record<string, unknown>, opts: { csp?: boolean; status?: number } = {}) {
  return ((url: string) => {
    const path = new URL(url).pathname;
    if (path.startsWith('/data/')) {
      const body = files[path];
      return Promise.resolve(body === undefined ? new Response('not found', { status: 404 }) : new Response(JSON.stringify(body), { status: 200 }));
    }
    const headers: Record<string, string> = opts.csp === false ? {} : { 'content-security-policy': "default-src 'self'; script-src 'self'" };
    return Promise.resolve(new Response('<!doctype html><title>Desi Desktop</title>', { status: opts.status ?? 200, headers }));
  }) as typeof fetch;
}

describe('T-18 NFR-MAINT alerts, smoke test and rollback trigger', () => {
  const failing = (over: Partial<SourceHealth> = {}): SourceHealth => ({
    id: 'a',
    state: 'failing',
    lastAttemptAt: new Date(NOW).toISOString(),
    lastSuccessAt: new Date(NOW - 2 * HOUR).toISOString(),
    consecutiveFailures: 3,
    etag: null,
    lastModified: null,
    staleAfterMinutes: 90,
    errorCode: 'http-503',
    ...over,
  });
  const registry = [{ id: 'a', minIntervalMinutes: 30 }];

  it('T-18 NFR-MAINT a failing source opens an Issue only after 3 hours', () => {
    expect(planSourceAlerts([failing()], registry, [], NOW)).toEqual([]);
    const late = failing({ lastSuccessAt: new Date(NOW - 4 * HOUR).toISOString(), consecutiveFailures: 7 });
    const actions = planSourceAlerts([late], registry, [], NOW);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: 'open', title: 'Source failing: a' });
    expect(JSON.stringify(actions)).toContain('http-503');
    // Still failing next run: the same Issue is updated, not duplicated.
    expect(planSourceAlerts([late], registry, [{ number: 12, title: 'Source failing: a' }], NOW)).toEqual([expect.objectContaining({ kind: 'update', number: 12 })]);
  });

  it('T-18 NFR-MAINT the Issue closes itself when the source recovers', () => {
    const recovered = failing({ state: 'ok', consecutiveFailures: 0, errorCode: null });
    expect(planSourceAlerts([recovered], registry, [{ number: 12, title: 'Source failing: a' }, { number: 13, title: 'Something else' }], NOW)).toEqual([
      expect.objectContaining({ kind: 'close', number: 12 }),
    ]);
  });

  it('T-18 NFR-MAINT a source that never succeeded counts failures by interval', () => {
    expect(failingForMs(failing({ lastSuccessAt: null, consecutiveFailures: 6 }), { minIntervalMinutes: 30 }, NOW)).toBe(2.5 * HOUR);
    expect(failingForMs(failing({ lastSuccessAt: null, consecutiveFailures: 7 }), { minIntervalMinutes: 30 }, NOW)).toBe(3 * HOUR);
  });

  it('T-18 NFR-MAINT the smoke test passes a good deploy and fails a bad one', async () => {
    const r = await bundleFor();
    const good = { '/data/content.json': r.files.content, '/data/health.json': r.files.health, '/data/meta.json': r.files.meta };
    const expectNow = { contentHash: r.hash, commit: 'abc123' };
    expect(await smokeOnce('https://s.example.org', expectNow, site(good))).toEqual([]);
    expect(await smokeOnce('https://s.example.org', expectNow, site(good, { csp: false }))).toContain('/: Content-Security-Policy header missing');
    expect(await smokeOnce('https://s.example.org', expectNow, site({ ...good, '/data/content.json': { broken: true } }))).toContain('/data/content.json: missing or invalid');
    expect(await smokeOnce('https://s.example.org', { ...expectNow, commit: 'zzz' }, site(good))).toContain('/data/meta.json: not the commit just deployed');
    const preview = { ...good, '/data/meta.json': { ...r.files.meta, preview: true } };
    expect(await smokeOnce('https://s.example.org', expectNow, site(preview))).toContain('/data/meta.json: a preview bundle is live');
    expect(await smokeOnce('https://s.example.org', expectNow, site(good, { status: 500 }))).toContain('/: HTTP 500');
  });

  it('T-18 NFR-MAINT the smoke test waits for the new version to reach the edge, then gives up', async () => {
    const r = await bundleFor();
    const old = { '/data/content.json': { ...r.files.content, contentHash: 'a'.repeat(64) }, '/data/health.json': r.files.health, '/data/meta.json': r.files.meta };
    const good = { ...old, '/data/content.json': r.files.content };
    let calls = 0;
    const flipping = ((url: string) => (++calls > 12 ? site(good) : site(old))(url)) as typeof fetch;
    const sleep = vi.fn(() => Promise.resolve());
    expect(await smoke('https://s.example.org', { contentHash: r.hash, commit: 'abc123' }, flipping, { sleep })).toEqual([]);
    expect(sleep).toHaveBeenCalled();
    const never = await smoke('https://s.example.org', { contentHash: r.hash, commit: 'abc123' }, site(old), { sleep, attempts: 3 });
    expect(never).toContain('/data/content.json: not the bundle just deployed');
  });

  it('T-18 NFR-MAINT a failed deploy opens one Issue and the next good deploy closes it', () => {
    const open = planDeployAlert('staging', { problems: ['/: HTTP 500'], rolledBack: true }, [], NOW);
    expect(open).toEqual([expect.objectContaining({ kind: 'open', title: 'Deploy failed: staging' })]);
    expect(JSON.stringify(open)).toContain('rolled back');
    expect(planDeployAlert('staging', null, [{ number: 4, title: 'Deploy failed: staging' }], NOW)).toEqual([expect.objectContaining({ kind: 'close', number: 4 })]);
    expect(planDeployAlert('staging', null, [], NOW)).toEqual([]);
  });

  it('T-18 ENG-04 the live bundle is read as untrusted, size-capped input', async () => {
    const huge = ((url: string) =>
      Promise.resolve(url.includes('content') ? new Response('x'.repeat(600 * 1024), { status: 200 }) : new Response('{"not":"valid"}', { status: 200 }))) as typeof fetch;
    expect(await fetchLive('https://s.example.org', huge)).toEqual({ content: null, health: null, meta: null });
  });
});

describe('T-19 watchdog', () => {
  const env = { GH_TOKEN: 'test-token', GH_REPO: 'owner/repo' };
  function github(state: string, lastRun: string | null) {
    const calls: string[] = [];
    const fetchFn = (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${new URL(url).pathname.replace('/repos/owner/repo/actions/workflows/refresh.yml', '')}`);
      if (url.endsWith('/runs?per_page=1')) return Promise.resolve(Response.json({ workflow_runs: lastRun ? [{ created_at: lastRun }] : [] }));
      if (method === 'GET') return Promise.resolve(Response.json({ state }));
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    return { calls, fetchFn };
  }

  it('T-19 an active workflow that ran recently is left alone', async () => {
    const g = github('active', new Date(NOW - 45 * 60_000).toISOString());
    expect(await checkRefresh(env, g.fetchFn, NOW)).toEqual({ action: 'none', ageMinutes: 45 });
    expect(g.calls).toEqual(['GET ', 'GET /runs']);
  });

  it('T-19 a disabled workflow is re-enabled and dispatched', async () => {
    const g = github('disabled_inactivity', new Date(NOW - 61 * 24 * 60 * 60_000).toISOString());
    expect(await checkRefresh(env, g.fetchFn, NOW)).toMatchObject({ action: 'dispatched', reenabled: true });
    expect(g.calls).toEqual(['GET ', 'GET /runs', 'PUT /enable', 'POST /dispatches']);
  });

  it('T-19 a silent workflow (no run for 2 hours, or never) is dispatched', async () => {
    const silent = github('active', new Date(NOW - 130 * 60_000).toISOString());
    expect(await checkRefresh(env, silent.fetchFn, NOW)).toEqual({ action: 'dispatched', reenabled: false, ageMinutes: 130 });
    expect(silent.calls).toEqual(['GET ', 'GET /runs', 'POST /dispatches']);
    const never = github('active', null);
    expect(await checkRefresh(env, never.fetchFn, NOW)).toEqual({ action: 'dispatched', reenabled: false, ageMinutes: null });
  });

  it('T-19 ENG-13 the watchdog reports errors without exposing its token', async () => {
    const denied = (() => Promise.resolve(new Response('{"message":"Bad credentials"}', { status: 401 }))) as typeof fetch;
    const r = await checkRefresh(env, denied, NOW);
    expect(r).toEqual({ action: 'error', detail: 'workflow lookup: HTTP 401' });
    expect(JSON.stringify(r)).not.toContain('test-token');
    expect(await checkRefresh({ GH_TOKEN: '', GH_REPO: 'owner/repo' }, denied, NOW)).toMatchObject({ action: 'error' });
  });
});
