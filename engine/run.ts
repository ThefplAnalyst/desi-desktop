// Engine run (spec 5.4). `runEngine` is pure apart from its injected dependencies, so tests drive
// it with fixtures, a fake clock and a fake fetch (ENG-12). The CLI at the bottom wires real ones.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ItemSchema, type ContentBundle, type Item, type SourceHealth } from '../shared/contracts.ts';
import { atomAdapter } from './adapters/atom.ts';
import { cricketDataAdapter } from './adapters/cricketdata.ts';
import { curatedAdapter } from './adapters/curated.ts';
import { federalRegisterAdapter } from './adapters/federal-register.ts';
import { fxAdapter } from './adapters/fx.ts';
import { nwsAdapter } from './adapters/nws.ts';
import { rssAdapter } from './adapters/rss.ts';
import type { Adapter, AdapterResult } from './adapters/types.ts';
import { visaBulletinAdapter } from './adapters/visa-bulletin.ts';
import { assembleTiles, type RowSource, type SourceRun } from './assemble.ts';
import { nextHealth, type Outcome } from './health.ts';
import { defaultLookup, type HttpDeps } from './http.ts';
import { normalizeItem, toIso } from './normalize.ts';
import { readPrevious, visibleHash, writeBundle, type BundleFiles } from './publish.ts';
import { ConfigError, isPublishable, loadConfig, type Config, type Source } from './registry.ts';
import { isRelevant } from './relevance.ts';
import { isDue, systemClock, type Clock } from './scheduler.ts';

export const ENGINE_VERSION = '0.3.0';
const CONCURRENCY = 3;
const REPO_URL = 'https://github.com/ThefplAnalyst/desi-desktop';
const HOUR = 3600_000;

export const ADAPTERS: Record<Source['adapter'], Adapter> = {
  rss: rssAdapter,
  atom: atomAdapter,
  'federal-register': federalRegisterAdapter,
  fx: fxAdapter,
  nws: nwsAdapter,
  'visa-bulletin': visaBulletinAdapter,
  curated: curatedAdapter,
  cricketdata: cricketDataAdapter,
};

/** Bot identity (spec 5.5). Contact is the owner's address when configured, else the public repo. */
export function userAgent(site: string | undefined, contact: string | undefined): string {
  return `DesiDesktopBot/1.0 (+${site ? `${site.replace(/\/$/, '')}/about/` : REPO_URL}${contact ? `; ${contact}` : ''})`;
}

export interface RunOptions {
  config: Config;
  previous: { content: ContentBundle | null; health: Map<string, SourceHealth> };
  root: string;
  force?: boolean;
  /** Dev preview only: treat curated sources as publishable and allow unverified files. Never deployable. */
  previewCurated?: boolean;
  commit?: string;
  adapters?: Partial<Record<Source['adapter'], Adapter>>;
}

export interface RunDeps {
  clock: Clock;
  http: HttpDeps;
}

export interface RunResult {
  files: BundleFiles;
  hash: string;
  outcomes: { id: string; outcome: Outcome['kind']; code?: string; rows: number }[];
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Forecasts from the weather source: this run's if fetched; otherwise the previous bundle's, but only
 * while the source is publishable and within its retention since the last success. Ended periods
 * are dropped, and so are metros with nothing left.
 */
export function assembleWeather(
  runs: SourceRun[],
  fresh: Map<string, ContentBundle['weather']>,
  previous: ContentBundle['weather'],
  now: number,
): ContentBundle['weather'] {
  const run = runs.find((r) => r.source.adapter === 'nws' && r.publishable);
  if (!run) return {};
  let source = fresh.get(run.source.id);
  if (!source) {
    const ok = run.health.lastSuccessAt;
    source = ok && now - Date.parse(ok) <= run.source.maxRetentionHours * HOUR ? previous : {};
  }
  const out: ContentBundle['weather'] = {};
  for (const [metroId, w] of Object.entries(source).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const periods = w.periods.filter((p) => Date.parse(p.endsAt) > now);
    if (periods.length) out[metroId] = { ...w, periods };
  }
  return out;
}

export async function runEngine(opts: RunOptions, deps: RunDeps): Promise<RunResult> {
  const now = deps.clock.now();
  const { config, previous } = opts;
  const adapters = opts.adapters ?? ADAPTERS;

  // Previous rows by source — used only for sources that are still publishable (never as fetch targets).
  const previousRows = new Map<string, Item[]>();
  const firstSeen = new Map<string, string>();
  for (const tile of Object.values(previous.content?.tiles ?? {})) {
    for (const item of tile?.items ?? []) {
      const list = previousRows.get(item.sourceId) ?? [];
      if (!list.some((x) => x.id === item.id)) list.push(item);
      previousRows.set(item.sourceId, list);
      firstSeen.set(item.id, item.firstSeenAt);
    }
  }

  const publishable = (s: Source) => isPublishable(s, now) || (!!opts.previewCurated && s.adapter === 'curated');
  const freshWeather = new Map<string, ContentBundle['weather']>();

  const runs = await pool(config.registry, CONCURRENCY, async (source): Promise<SourceRun & { outcome: Outcome }> => {
    const prevHealth = previous.health.get(source.id);
    if (!publishable(source)) {
      const outcome: Outcome = { kind: 'unpublishable' };
      return { source, publishable: false, rows: { kind: 'none' }, outcome, health: nextHealth(source, prevHealth, outcome, now) };
    }
    if (!isDue(source, prevHealth, now, opts.force)) {
      const outcome: Outcome = { kind: 'not-due' };
      return { source, publishable: true, rows: { kind: 'previous' }, outcome, health: nextHealth(source, prevHealth, outcome, now) };
    }
    const adapter = adapters[source.adapter];
    let result: AdapterResult;
    if (!adapter) {
      result = { kind: 'error', code: 'adapter-not-built' };
    } else {
      try {
        result = await adapter({
          source,
          now,
          root: opts.root,
          http: deps.http,
          previous: prevHealth,
          allowUnverified: !!opts.previewCurated,
          metros: config.metros.metros,
        });
      } catch {
        result = { kind: 'error', code: 'adapter-crashed' };
      }
    }
    let rows: RowSource;
    let outcome: Outcome;
    if (result.kind === 'ok') {
      const items = result.items
        .map((raw) => normalizeItem(raw, { sourceId: source.id, now, firstSeen, ...(result.baseUrl ? { baseUrl: result.baseUrl } : {}) }))
        .filter((i): i is Item => i !== null && isRelevant(i.title, source.relevance));
      rows = { kind: 'fresh', items };
      outcome = { kind: 'ok', etag: result.etag, lastModified: result.lastModified };
      if (result.weather) freshWeather.set(source.id, result.weather);
    } else if (result.kind === 'not-modified') {
      rows = { kind: 'previous' };
      outcome = { kind: 'not-modified' };
    } else {
      rows = { kind: 'failed' };
      outcome = { kind: 'error', code: result.code };
    }
    return { source, publishable: true, rows, outcome, health: nextHealth(source, prevHealth, outcome, now) };
  });

  const tiles = assembleTiles({ catalog: config.catalog, runs, previousRows, links: config.links, now });
  const weather = assembleWeather(runs, freshWeather, previous.content?.weather ?? {}, now);
  const generatedAt = toIso(now);
  const content: ContentBundle = { schemaVersion: 2, generatedAt, contentHash: '', tiles, weather };
  content.contentHash = visibleHash(content);

  const files: BundleFiles = {
    content,
    health: { generatedAt, sources: runs.map((r) => r.health) },
    sources: {
      generatedAt,
      sources: runs
        .filter((r) => r.publishable)
        .map((r) => ({
          id: r.source.id,
          publisher: r.source.publisher,
          attribution: r.source.attribution,
          termsUrl: r.source.rights.termsUrl ?? REPO_URL,
          mode: r.source.adapter === 'curated' ? ('curated' as const) : ('live' as const),
        })),
    },
    meta: { generatedAt, engineVersion: ENGINE_VERSION, commit: opts.commit ?? 'local', preview: !!opts.previewCurated },
  };

  const counts = new Map<string, number>();
  for (const t of Object.values(tiles)) for (const i of t?.items ?? []) counts.set(i.sourceId, (counts.get(i.sourceId) ?? 0) + 1);
  return {
    files,
    hash: content.contentHash,
    outcomes: runs.map((r) => ({
      id: r.source.id,
      outcome: r.outcome.kind,
      ...(r.outcome.kind === 'error' ? { code: r.outcome.code } : {}),
      rows: counts.get(r.source.id) ?? 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// CLI: node engine/run.ts [--validate-only] [--out tmp/data] [--previous <dir>] [--force]
//                         [--preview-curated] [--now <ISO>]
// ---------------------------------------------------------------------------

/**
 * `npm run content:probe` (spec 7.2): opt-in live check of each source's endpoint and parser,
 * whatever its rights status. Records technical availability only — counts and error codes go to
 * tmp/probe.json; no titles, bodies or rows are saved, and nothing is published (decision D34).
 */
async function probe(config: Config, http: HttpDeps, root: string, only?: string): Promise<void> {
  const now = http.clock.now();
  const ids = only ? new Set(only.split(',')) : null;
  const report: Record<string, unknown>[] = [];
  for (const source of config.registry) {
    if (ids && !ids.has(source.id)) continue;
    if (source.adapter === 'curated' || source.adapter === 'cricketdata') continue; // no network / paid key
    const result = await ADAPTERS[source.adapter]({ source, now, root, http, previous: undefined, allowUnverified: false, metros: config.metros.metros });
    const entry: Record<string, unknown> = { id: source.id, rightsStatus: source.rights.status, outcome: result.kind };
    if (result.kind === 'error') entry['code'] = result.code;
    if (result.kind === 'ok') {
      const items = result.items
        .map((raw) => normalizeItem(raw, { sourceId: source.id, now, firstSeen: new Map(), ...(result.baseUrl ? { baseUrl: result.baseUrl } : {}) }))
        .filter((i): i is Item => i !== null);
      const relevant = items.filter((i) => isRelevant(i.title, source.relevance));
      Object.assign(entry, {
        rawRows: result.items.length,
        validRows: items.filter((i) => ItemSchema.safeParse(i).success).length,
        relevantRows: relevant.length,
        withPublishedAt: items.filter((i) => i.publishedAt).length,
        newestPublishedAt: items.map((i) => i.publishedAt).filter(Boolean).sort().at(-1) ?? null,
        ...(result.weather ? { weatherMetros: Object.keys(result.weather).length } : {}),
      });
    }
    report.push(entry);
    console.log(
      `  ${source.id.padEnd(26)} ${String(entry['outcome']).padEnd(6)} ${entry['code'] ?? `${entry['validRows']}/${entry['rawRows']} valid rows, ${entry['relevantRows']} relevant${entry['weatherMetros'] !== undefined ? `, ${entry['weatherMetros']} metros` : ''}`}`,
    );
  }
  mkdirSync(join(root, 'tmp'), { recursive: true });
  writeFileSync(join(root, 'tmp', 'probe.json'), `${JSON.stringify({ checkedAt: toIso(now), userAgent: http.userAgent, sources: report }, null, 2)}\n`);
  console.log('Probe report (technical availability only): tmp/probe.json');
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const root = resolve('.');
  let config: Config;
  try {
    config = loadConfig(root);
  } catch (e) {
    console.error(e instanceof ConfigError ? e.message : `Config could not be read: ${String(e)}`);
    process.exitCode = 1;
    return;
  }
  const approved = config.registry.filter((s) => isPublishable(s, Date.now()));
  if (process.argv.includes('--validate-only')) {
    console.log(`Config valid: ${config.registry.length} sources (${approved.length} approved and enabled), ${config.catalog.tiles.length} tiles, ${config.metros.metros.length} metros, ${config.links.length} link files.`);
    for (const l of config.links) if (l.review.status !== 'verified') console.log(`  note: content/curated link file for "${l.tile}" is not verified by the owner yet`);
    return;
  }

  const nowArg = arg('--now');
  const clock: Clock = nowArg ? { ...systemClock, now: () => Date.parse(nowArg) } : systemClock;
  const http: HttpDeps = { fetch, lookup: defaultLookup, clock, userAgent: userAgent(process.env['SITE_URL'], process.env['OWNER_CONTACT_EMAIL']) };

  if (process.argv.includes('--probe')) {
    await probe(config, http, root, arg('--only'));
    return;
  }

  const previewCurated = process.argv.includes('--preview-curated');
  const out = resolve(arg('--out') ?? 'tmp/data');

  const result = await runEngine(
    {
      config,
      previous: readPrevious(arg('--previous') ?? null),
      root,
      force: process.argv.includes('--force'),
      previewCurated,
      commit: process.env['GITHUB_SHA']?.slice(0, 12) ?? 'local',
    },
    { clock, http },
  );
  writeBundle(out, result.files, new Set(config.registry.map((s) => s.id)));

  console.log(`Bundle written to ${out}${previewCurated ? '  [PREVIEW: includes unapproved curated content; never deployable]' : ''}`);
  console.log(`  content hash ${result.hash.slice(0, 12)}…`);
  for (const o of result.outcomes) console.log(`  ${o.id.padEnd(18)} ${o.outcome.padEnd(14)} ${String(o.rows).padStart(2)} rows${o.code ? `  (${o.code})` : ''}`);
}

if (import.meta.main) await main();
