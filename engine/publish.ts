// Bundle writing (ENG-10, spec 5.4 steps 10–11). Only a complete, schema-valid bundle with
// consistent cross-references ever replaces the output folder; the swap is a rename.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { z } from 'zod';
import {
  ContentBundleSchema,
  HealthFileSchema,
  MetaFileSchema,
  SourcesFileSchema,
  type ContentBundle,
  type MetaFile,
} from '../shared/contracts.ts';

/** JSON with object keys sorted, so equal data always gives equal bytes and hashes. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** Hash of what a visitor can see: rows, tile states, fallback links and forecasts — no run timestamps. */
export function visibleHash(bundle: Pick<ContentBundle, 'tiles' | 'weather'>): string {
  return createHash('sha256').update(canonicalJson({ tiles: bundle.tiles, weather: bundle.weather })).digest('hex');
}

export interface BundleFiles {
  content: z.infer<typeof ContentBundleSchema>;
  health: z.infer<typeof HealthFileSchema>;
  sources: z.infer<typeof SourcesFileSchema>;
  meta: MetaFile;
}

export class BundleError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid bundle, not written:\n  - ${problems.join('\n  - ')}`);
    this.problems = problems;
  }
}

/** Schema and cross-reference checks for a whole bundle. Returns problems (empty when valid). */
export function bundleProblems(files: BundleFiles, registryIds: Set<string>): string[] {
  const problems: string[] = [];
  const check = (name: string, schema: z.ZodType, value: unknown) => {
    const r = schema.safeParse(value);
    if (!r.success) problems.push(...r.error.issues.slice(0, 10).map((i) => `${name}: ${i.path.join('.')}: ${i.message}`));
  };
  check('content.json', ContentBundleSchema, files.content);
  check('health.json', HealthFileSchema, files.health);
  check('sources.json', SourcesFileSchema, files.sources);
  check('meta.json', MetaFileSchema, files.meta);
  if (problems.length) return problems;

  const published = new Set(files.sources.sources.map((s) => s.id));
  for (const [tileId, tile] of Object.entries(files.content.tiles)) {
    for (const item of tile?.items ?? []) {
      if (!published.has(item.sourceId)) problems.push(`content.json: ${tileId} row ${item.id} cites unpublished source "${item.sourceId}"`);
    }
  }
  for (const h of files.health.sources) if (!registryIds.has(h.id)) problems.push(`health.json: unknown source "${h.id}"`);
  for (const s of files.sources.sources) if (!registryIds.has(s.id)) problems.push(`sources.json: unknown source "${s.id}"`);
  if (files.content.contentHash !== visibleHash(files.content)) problems.push('content.json: contentHash does not match content');
  const stamps = new Set([files.content.generatedAt, files.health.generatedAt, files.sources.generatedAt, files.meta.generatedAt]);
  if (stamps.size !== 1) problems.push('generatedAt differs between files');
  return problems;
}

/**
 * Writes the four files to a temporary sibling folder, re-reads and validates them, then swaps the
 * folder into place. On any problem the temporary folder is removed and `outDir` is untouched.
 */
export function writeBundle(outDir: string, files: BundleFiles, registryIds: Set<string>): void {
  const before = bundleProblems(files, registryIds);
  if (before.length) throw new BundleError(before);

  const parent = dirname(outDir);
  mkdirSync(parent, { recursive: true });
  const tmp = join(parent, `.${basename(outDir)}.tmp-${randomBytes(4).toString('hex')}`);
  mkdirSync(tmp);
  try {
    for (const [name, value] of Object.entries(files)) writeFileSync(join(tmp, `${name}.json`), `${canonicalJson(value)}\n`);
    const reread = Object.fromEntries(
      Object.keys(files).map((name) => [name, JSON.parse(readFileSync(join(tmp, `${name}.json`), 'utf8')) as unknown]),
    ) as unknown as BundleFiles;
    const after = bundleProblems(reread, registryIds);
    if (after.length) throw new BundleError(after);

    const old = `${outDir}.old-${randomBytes(4).toString('hex')}`;
    if (existsSync(outDir)) renameSync(outDir, old);
    renameSync(tmp, outDir);
    rmSync(old, { recursive: true, force: true });
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}

/** Reads a previous bundle folder as untrusted input; anything invalid is ignored (spec 5.4 step 2). */
export function readPrevious(dir: string | null): { content: ContentBundle | null; health: Map<string, z.infer<typeof HealthFileSchema>['sources'][number]> } {
  const empty = { content: null, health: new Map() };
  if (!dir) return empty;
  const read = (name: string, schema: z.ZodType) => {
    try {
      const text = readFileSync(join(dir, `${name}.json`), 'utf8');
      if (text.length > 512 * 1024) return null;
      const r = schema.safeParse(JSON.parse(text));
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  };
  const content = read('content', ContentBundleSchema) as ContentBundle | null;
  const health = read('health', HealthFileSchema) as z.infer<typeof HealthFileSchema> | null;
  return { content, health: new Map((health?.sources ?? []).map((h) => [h.id, h])) };
}
