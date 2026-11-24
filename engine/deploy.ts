// Publishing helpers for refresh.yml (spec 5.4 steps 2, 11, 12; ENG-10; T-15, T-18). Pure apart from
// the injected fetch and sleep, so tests never touch a real site.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { ContentBundleSchema, HealthFileSchema, MetaFileSchema, SourcesFileSchema, type ContentBundle, type MetaFile } from '../shared/contracts.ts';

type HealthFile = z.infer<typeof HealthFileSchema>;
export type Fetch = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;

/** Largest live data file the engine will read back (spec 5.4 step 2: size-capped, untrusted). */
export const MAX_PREVIOUS_BYTES = 512 * 1024;
const BUNDLE_FILES = ['content', 'health', 'sources', 'meta'] as const;

export interface LiveState {
  content: ContentBundle | null;
  health: HealthFile | null;
  meta: MetaFile | null;
}

async function getJson(fetchFn: Fetch, url: string, schema: z.ZodType): Promise<unknown> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_PREVIOUS_BYTES) return null;
    const text = await res.text();
    if (text.length > MAX_PREVIOUS_BYTES) return null;
    const r = schema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** The live site's bundle, each file schema-checked; anything missing or invalid is null. */
export async function fetchLive(siteUrl: string, fetchFn: Fetch): Promise<LiveState> {
  const base = siteUrl.replace(/\/$/, '');
  const bust = `?engine=${Date.now().toString(36)}`;
  const [content, health, meta] = await Promise.all([
    getJson(fetchFn, `${base}/data/content.json${bust}`, ContentBundleSchema),
    getJson(fetchFn, `${base}/data/health.json${bust}`, HealthFileSchema),
    getJson(fetchFn, `${base}/data/meta.json${bust}`, MetaFileSchema),
  ]);
  return { content: content as ContentBundle | null, health: health as HealthFile | null, meta: meta as MetaFile | null };
}

/**
 * Health to schedule from: the newer of the live file and the copy the workflow cached after its
 * last good run (the live file only changes on deploy; decision D38). Health holds timestamps and
 * validators only, never publisher content.
 */
export function newerHealth(live: HealthFile | null, cached: HealthFile | null): HealthFile | null {
  if (!live) return cached;
  if (!cached) return live;
  return Date.parse(cached.generatedAt) > Date.parse(live.generatedAt) ? cached : live;
}

export function readHealthFile(path: string): HealthFile | null {
  try {
    const text = readFileSync(path, 'utf8');
    if (text.length > MAX_PREVIOUS_BYTES) return null;
    const r = HealthFileSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export type DeployReason = 'first-deploy' | 'forced' | 'content-changed' | 'code-changed' | 'heartbeat';
export type DeployDecision = { deploy: true; reason: DeployReason } | { deploy: false; reason: 'unchanged' };

/**
 * Spec 5.4 step 11 / T-15: deploy when visible content changed, when the code changed (so merges
 * reach the site without a second deploy path; D38), or once a day as a heartbeat. Otherwise skip.
 */
export function decideDeploy(input: { contentHash: string; commit: string; live: Pick<LiveState, 'content' | 'meta'>; now: number; force?: boolean }): DeployDecision {
  const { live } = input;
  if (!live.content || !live.meta) return { deploy: true, reason: 'first-deploy' };
  if (input.force) return { deploy: true, reason: 'forced' };
  if (live.content.contentHash !== input.contentHash) return { deploy: true, reason: 'content-changed' };
  if (live.meta.commit !== input.commit) return { deploy: true, reason: 'code-changed' };
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  if (day(Date.parse(live.meta.generatedAt)) !== day(input.now)) return { deploy: true, reason: 'heartbeat' };
  return { deploy: false, reason: 'unchanged' };
}

export class StageError extends Error {}

/**
 * Copies an engine bundle into the built site (dist/data). Refuses preview bundles (unapproved
 * curated content) and anything that does not validate, so they can never be deployed.
 */
export function stageData(bundleDir: string, distDir: string): void {
  for (const name of BUNDLE_FILES) if (!existsSync(join(bundleDir, `${name}.json`))) throw new StageError(`missing ${name}.json in ${bundleDir}`);
  const meta = MetaFileSchema.safeParse(JSON.parse(readFileSync(join(bundleDir, 'meta.json'), 'utf8')));
  if (!meta.success) throw new StageError('meta.json is invalid');
  if (meta.data.preview) throw new StageError('refusing to deploy a PREVIEW bundle (it may contain unapproved curated content)');
  const schemas = { content: ContentBundleSchema, health: HealthFileSchema, sources: SourcesFileSchema, meta: MetaFileSchema };
  for (const name of BUNDLE_FILES) {
    if (!schemas[name].safeParse(JSON.parse(readFileSync(join(bundleDir, `${name}.json`), 'utf8'))).success) throw new StageError(`${name}.json is invalid`);
  }
  if (!existsSync(join(distDir, 'index.html'))) throw new StageError(`${distDir} has no built site`);
  mkdirSync(join(distDir, 'data'), { recursive: true });
  for (const name of BUNDLE_FILES) copyFileSync(join(bundleDir, `${name}.json`), join(distDir, 'data', `${name}.json`));
}

export interface SmokeExpect {
  contentHash: string;
  commit: string;
}

/** One pass over the deployed site. Returns problems; empty means healthy. Without `expect`, only checks validity. */
export async function smokeOnce(siteUrl: string, expect: SmokeExpect | null, fetchFn: Fetch): Promise<string[]> {
  const base = siteUrl.replace(/\/$/, '');
  const bust = `?smoke=${Date.now().toString(36)}`;
  const problems: string[] = [];
  const get = async (path: string) => {
    try {
      return await fetchFn(`${base}${path}`, { signal: AbortSignal.timeout(15_000) });
    } catch {
      problems.push(`${path}: request failed`);
      return null;
    }
  };

  const home = await get(`/${bust}`);
  if (home) {
    if (home.status !== 200) problems.push(`/: HTTP ${home.status}`);
    const csp = home.headers.get('content-security-policy') ?? '';
    if (!csp.includes("default-src 'self'")) problems.push('/: Content-Security-Policy header missing');
    const html = await home.text();
    if (!html.includes('<title>Desi Desktop</title>')) problems.push('/: page title missing');
  }
  for (const page of ['/about/', '/help/', '/privacy/']) {
    const r = await get(`${page}${bust}`);
    if (r && r.status !== 200) problems.push(`${page}: HTTP ${r.status}`);
  }
  const live = await fetchLive(base, fetchFn);
  if (!live.content) problems.push('/data/content.json: missing or invalid');
  else if (expect && live.content.contentHash !== expect.contentHash) problems.push('/data/content.json: not the bundle just deployed');
  if (!live.health) problems.push('/data/health.json: missing or invalid');
  if (!live.meta) problems.push('/data/meta.json: missing or invalid');
  else {
    if (live.meta.preview) problems.push('/data/meta.json: a preview bundle is live');
    if (expect && live.meta.commit !== expect.commit) problems.push('/data/meta.json: not the commit just deployed');
  }
  return problems;
}

/** Smoke test with retries, because a new version can take a few seconds to reach every edge. */
export async function smoke(
  siteUrl: string,
  expect: SmokeExpect | null,
  fetchFn: Fetch,
  opts: { attempts?: number; waitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<string[]> {
  const attempts = opts.attempts ?? 6;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let problems: string[] = [];
  for (let i = 0; i < attempts; i++) {
    problems = await smokeOnce(siteUrl, expect, fetchFn);
    if (problems.length === 0) return [];
    if (i < attempts - 1) await sleep(opts.waitMs ?? 10_000);
  }
  return problems;
}
