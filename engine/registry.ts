// Source registry, config and curated-content validation, and the rights gate (ENG-02, ENG-09, spec 5.1–5.2).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { HttpsUrl, LinkSchema, TileIdSchema, TileModeSchema } from '../shared/contracts.ts';

export const ADAPTERS = ['rss', 'atom', 'federal-register', 'fx', 'nws', 'visa-bulletin', 'curated', 'cricketdata'] as const;
export const RIGHTS_STATES = ['draft', 'verified', 'reviewed', 'approved', 'revoked'] as const;

const day = z.iso.date();
const hostname = z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'exact lowercase host name');

export const RightsSchema = z
  .object({
    status: z.enum(RIGHTS_STATES),
    basis: z.string().min(1),
    termsUrl: HttpsUrl.nullable(),
    commercialUse: z.boolean().nullable(),
    allowedFields: z.array(z.enum(['title', 'url', 'publishedAt'])),
    reviewedBy: z.string().min(1).nullable(),
    reviewedAt: day.nullable(),
    reviewDueAt: day.nullable(),
  })
  .strict();

export const SourceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,64}$/),
    publisher: z.string().min(1).max(120),
    adapter: z.enum(ADAPTERS),
    endpoint: HttpsUrl.nullable(),
    file: z.string().regex(/^[a-z0-9-]+\.json$/).optional(), // curated: file in content/curated/
    allowedHosts: z.array(hostname),
    tiles: z.array(TileIdSchema).min(1),
    official: z.boolean().default(false),
    relevance: z.object({ include: z.array(z.string().min(1)), exclude: z.array(z.string().min(1)) }).strict().default({ include: [], exclude: [] }),
    minIntervalMinutes: z.number().int().min(5),
    maxItems: z.number().int().min(1).max(20),
    maxRetentionHours: z.number().int().min(1).max(24 * 366),
    attribution: z.string().min(1).max(80),
    enabled: z.boolean(),
    rights: RightsSchema,
    fallbackLinks: z.array(LinkSchema).max(20).default([]),
    /** Adapter-specific settings, e.g. Federal Register agencies or currency symbols. */
    params: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.adapter === 'curated') {
      if (!s.file) ctx.addIssue({ code: 'custom', message: 'curated sources need "file"' });
      if (s.endpoint !== null) ctx.addIssue({ code: 'custom', message: 'curated sources use "endpoint": null' });
    } else if (s.endpoint) {
      const host = new URL(s.endpoint).hostname;
      if (!s.allowedHosts.includes(host)) ctx.addIssue({ code: 'custom', message: `endpoint host ${host} is not in allowedHosts` });
    }
  });
export type Source = z.infer<typeof SourceSchema>;

export const RegistrySchema = z.object({ version: z.literal(1), sources: z.array(SourceSchema) }).strict();

export const CatalogSchema = z
  .object({
    version: z.literal(1),
    tiles: z.array(
      z
        .object({
          id: TileIdSchema,
          title: z.string().min(1).max(80),
          officialTitle: z.string().min(1).max(80).optional(),
          mode: TileModeSchema,
          defaultOn: z.boolean(),
          icon: z.string(),
          hidden: z.boolean().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type Catalog = z.infer<typeof CatalogSchema>;

export const MetrosSchema = z
  .object({
    version: z.literal(1),
    metros: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]+$/),
            name: z.string().min(1),
            searchName: z.string().min(1),
            lat: z.number().min(18).max(72),
            lon: z.number().min(-180).max(-60),
            timeZone: z.string().startsWith('America/'),
            nwsGridId: z.string().nullable(),
          })
          .strict(),
      )
      .length(20),
  })
  .strict();
export type Metros = z.infer<typeof MetrosSchema>;

/** Hand-checked curated content: every file records whether the owner has verified it (decision D25). */
export const ReviewSchema = z
  .object({
    status: z.enum(['unverified', 'verified']),
    verifiedBy: z.string().nullable(),
    verifiedAt: day.nullable(),
    notes: z.string().optional(),
  })
  .strict();

export const FixturesFileSchema = z
  .object({
    review: ReviewSchema,
    fixtures: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9-]+$/),
          title: z.string().min(1).max(180),
          startsAt: z.iso.datetime(),
          endsAt: z.iso.datetime(),
          url: HttpsUrl,
        })
        .strict(),
    ),
  })
  .strict();

export const FestivalsFileSchema = z
  .object({
    review: ReviewSchema,
    items: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9-]+$/),
          title: z.string().min(1).max(180),
          date: day,
          url: HttpsUrl,
          countries: z.array(z.enum(['US', 'IN', 'PK', 'BD', 'NP', 'LK'])).min(1),
          estimated: z.boolean(),
          source: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const LinksFileSchema = z
  .object({ tile: TileIdSchema, review: ReviewSchema, links: z.array(LinkSchema).min(1).max(20) })
  .strict();
export type LinksFile = z.infer<typeof LinksFileSchema>;

export interface Config {
  registry: Source[];
  catalog: Catalog;
  metros: Metros;
  links: LinksFile[];
}

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.problems = problems;
  }
}

const describe = (file: string, e: z.ZodError) => e.issues.map((i) => `${file}: ${i.path.join('.') || '(root)'}: ${i.message}`);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Pure rights gate (ENG-09). A source may be fetched or published only when it is enabled,
 * approved, has a recorded review, and that review has not passed its due date.
 */
export function isPublishable(s: Source, now: number): boolean {
  const r = s.rights;
  if (!s.enabled || r.status !== 'approved') return false;
  if (!r.reviewedBy || !r.reviewedAt || !r.reviewDueAt) return false;
  return now < Date.parse(`${r.reviewDueAt}T00:00:00Z`);
}

/** Problems that must stop a run (spec 5.4 step 1). Overdue reviews are not errors: they just unpublish. */
export function registryProblems(sources: Source[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    if (seen.has(s.id)) problems.push(`sources.json: duplicate id "${s.id}"`);
    seen.add(s.id);
    if (s.enabled && s.rights.status !== 'approved') {
      problems.push(`sources.json: "${s.id}" is enabled but rights.status is "${s.rights.status}" (ENG-09: only approved sources may be enabled)`);
    }
    if (s.enabled && s.rights.status === 'approved' && (!s.rights.reviewedBy || !s.rights.reviewedAt || !s.rights.reviewDueAt)) {
      problems.push(`sources.json: "${s.id}" is approved without a recorded review (reviewedBy, reviewedAt, reviewDueAt)`);
    }
    if (s.enabled && s.adapter !== 'curated' && !s.endpoint) problems.push(`sources.json: "${s.id}" is enabled but has no endpoint`);
  }
  return problems;
}

/** Reads and validates every config and curated file. Throws ConfigError listing all problems. */
export function loadConfig(root = '.'): Config {
  const problems: string[] = [];
  const parse = <T>(rel: string, schema: z.ZodType<T>): T | null => {
    try {
      const r = schema.safeParse(readJson(join(root, rel)));
      if (r.success) return r.data;
      problems.push(...describe(rel, r.error));
    } catch (e) {
      problems.push(`${rel}: ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  };

  const registry = parse('config/sources.json', RegistrySchema);
  const catalog = parse('config/catalog.json', CatalogSchema);
  const metros = parse('config/metros.json', MetrosSchema);

  const links: LinksFile[] = [];
  for (const file of LINK_FILES) {
    const l = parse(`content/curated/${file}`, LinksFileSchema);
    if (l) links.push(l);
  }

  if (registry) {
    problems.push(...registryProblems(registry.sources));
    for (const s of registry.sources.filter((x) => x.adapter === 'curated')) {
      const schema = s.id === 'festivals' ? FestivalsFileSchema : FixturesFileSchema;
      parse(`content/curated/${s.file ?? ''}`, schema as z.ZodType<unknown>);
    }
  }
  if (catalog && registry) {
    const ids = new Set(catalog.tiles.map((t) => t.id));
    for (const s of registry.sources) for (const t of s.tiles) if (!ids.has(t)) problems.push(`sources.json: "${s.id}" maps to unknown tile "${t}"`);
  }

  if (problems.length || !registry || !catalog || !metros) throw new ConfigError(problems);
  return { registry: registry.sources, catalog, metros, links };
}

/** Link directories shown by links tiles and as fallbacks (curated, original lists; decision D33). */
export const LINK_FILES = [
  'consulates.json',
  'links/cricket.json',
  'links/currency.json',
  'links/india-news.json',
  'links/jobs.json',
  'links/movies.json',
  'links/south-asia.json',
  'links/tech.json',
  'links/us-news.json',
] as const;
