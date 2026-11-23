// Engine run (spec 5.4). `runEngine` is pure apart from its injected dependencies, so tests drive
// it with fixtures, a fake clock and a fake fetch (ENG-12). The CLI at the bottom wires real ones.
import { resolve } from 'node:path';
import type { ContentBundle, Item, SourceHealth } from '../shared/contracts.ts';
import { curatedAdapter } from './adapters/curated.ts';
import type { Adapter, AdapterResult } from './adapters/types.ts';
import { assembleTiles, type RowSource, type SourceRun } from './assemble.ts';
import { nextHealth, type Outcome } from './health.ts';
import { defaultLookup, type HttpDeps } from './http.ts';
import { normalizeItem, toIso } from './normalize.ts';
import { readPrevious, visibleHash, writeBundle, type BundleFiles } from './publish.ts';
import { ConfigError, isPublishable, loadConfig, type Config, type Source } from './registry.ts';
import { isRelevant } from './relevance.ts';
import { isDue, systemClock, type Clock } from './scheduler.ts';

export const ENGINE_VERSION = '0.2.0';
const CONCURRENCY = 3;
const REPO_URL = 'https://github.com/ThefplAnalyst/desi-desktop';

/** Adapters available in this milestone. Network adapters arrive in M3. */
export const ADAPTERS: Partial<Record<Source['adapter'], Adapter>> = { curated: curatedAdapter };

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
        result = await adapter({ source, now, root: opts.root, http: deps.http, previous: prevHealth, allowUnverified: !!opts.previewCurated });
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
  const generatedAt = toIso(now);
  const content: ContentBundle = { schemaVersion: 2, generatedAt, contentHash: '', tiles, weather: {} };
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
  const contact = process.env['OWNER_CONTACT_EMAIL'];
  const site = process.env['SITE_URL'] ?? REPO_URL;
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
    {
      clock,
      http: { fetch, lookup: defaultLookup, clock, userAgent: `DesiDesktopBot/1.0 (+${site}/about/${contact ? `; ${contact}` : ''})` },
    },
  );
  writeBundle(out, result.files, new Set(config.registry.map((s) => s.id)));

  console.log(`Bundle written to ${out}${previewCurated ? '  [PREVIEW: includes unapproved curated content; never deployable]' : ''}`);
  console.log(`  content hash ${result.hash.slice(0, 12)}…`);
  for (const o of result.outcomes) console.log(`  ${o.id.padEnd(18)} ${o.outcome.padEnd(14)} ${String(o.rows).padStart(2)} rows${o.code ? `  (${o.code})` : ''}`);
}

if (import.meta.main) await main();
