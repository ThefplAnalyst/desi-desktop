// Data contracts shared by app/ and engine/ (spec 6.2). Names here are binding.
// M2 adds the Zod schemas the engine validates with; the browser imports types only
// (`import type`), so Zod never enters the browser bundle (decision D6).
import { z } from 'zod';

export type TileId =
  | 'shortcuts'
  | 'india-news'
  | 'us-news'
  | 'cricket'
  | 'visa'
  | 'currency'
  | 'south-asia'
  | 'time-weather'
  | 'festivals'
  | 'movies'
  | 'tech'
  | 'deals'
  | 'near-me'
  | 'prayer'
  | 'jobs';

export type TileMode = 'live' | 'curated' | 'links' | 'local';

export interface Item {
  id: string; // 16 hex chars
  title: string; // plain text, 1-180 chars
  url: string; // https, <= 2048 chars
  sourceId: string;
  publishedAt: string | null; // ISO 8601 UTC from the source, never fetch time
  firstSeenAt: string;
  expiresAt: string | null;
  value?: string; // metrics, e.g. "90.42"
  change?: number; // percent, metrics only
  startsAt?: string; // fixtures, festivals
}

export interface TileData {
  mode: TileMode;
  title: string; // e.g. "India Updates" while official-only
  state: 'fresh' | 'partial' | 'stale' | 'links' | 'empty';
  items: Item[]; // <= 20
  fallbackLinks: { title: string; url: string }[];
}

export interface WeatherPeriod {
  name: string;
  tempF: number;
  summary: string;
  startsAt: string;
  endsAt: string;
}

export interface ContentBundle {
  schemaVersion: 2;
  generatedAt: string;
  contentHash: string;
  tiles: Partial<Record<TileId, TileData>>;
  weather: Record<string /* metroId */, { periods: WeatherPeriod[]; issuedAt: string; url: string }>;
}

export interface SourceHealth {
  id: string;
  state: 'ok' | 'stale' | 'failing' | 'disabled';
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  consecutiveFailures: number;
  etag: string | null;
  lastModified: string | null;
  staleAfterMinutes: number;
  errorCode: string | null; // sanitized code only
}

/** Public attribution entry in /data/sources.json (spec 6.2), used by the About page. */
export interface PublicSource {
  id: string;
  publisher: string;
  attribution: string;
  termsUrl: string;
  mode: TileMode;
}

/** One tile in config/catalog.json. `hidden` tiles are not offered in Customize yet. */
export interface CatalogEntry {
  id: TileId;
  title: string;
  mode: TileMode;
  defaultOn: boolean;
  icon: string;
  hidden?: boolean;
  officialTitle?: string; // used while every enabled source of the tile is official (spec 2.3)
}

/** One metro area in config/metros.json (spec 6.5). */
export interface Metro {
  id: string;
  name: string;
  searchName: string; // place name used in map searches
  lat: number;
  lon: number;
  timeZone: string;
  nwsGridId: string | null; // cached NWS grid id, filled in M3
}

export interface Preferences {
  version: 1;
  tiles: TileId[]; // shown tiles, in order; [] is a valid choice
  metroId: string | null;
  columns: 3 | 4;
  shortcuts: { id: string; title: string; url: string }[]; // <= 12
  tipDismissed: boolean;
}

// ---------------------------------------------------------------------------
// Zod schemas (decision D6): the engine validates everything it reads and writes with these.
// The browser imports only types from this file (`import type`), so Zod never reaches the
// browser bundle; ESLint enforces that in app/.
// ---------------------------------------------------------------------------

export const TILE_IDS = [
  'shortcuts', 'india-news', 'us-news', 'cricket', 'visa', 'currency', 'south-asia', 'time-weather',
  'festivals', 'movies', 'tech', 'deals', 'near-me', 'prayer', 'jobs',
] as const satisfies readonly TileId[];

const isoUtc = z.iso.datetime(); // "2026-11-20T12:00:00Z" (UTC, optional fractional seconds)
const dateOrDateTime = z.union([z.iso.date(), isoUtc]);
export const HttpsUrl = z
  .string()
  .max(2048)
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === 'https:' && !u.username && !u.password;
    } catch {
      return false;
    }
  }, 'must be an https URL without credentials');

export const TileIdSchema = z.enum(TILE_IDS);
export const TileModeSchema = z.enum(['live', 'curated', 'links', 'local']);
export const LinkSchema = z.object({ title: z.string().min(1).max(180), url: HttpsUrl }).strict();

export const ItemSchema = z
  .object({
    id: z.string().regex(/^[0-9a-f]{16}$/),
    title: z.string().min(1).max(180),
    url: HttpsUrl,
    sourceId: z.string().min(1).max(64),
    publishedAt: isoUtc.nullable(),
    firstSeenAt: isoUtc,
    expiresAt: isoUtc.nullable(),
    value: z.string().max(32).optional(),
    change: z.number().finite().optional(),
    startsAt: dateOrDateTime.optional(),
  })
  .strict();

export const TileDataSchema = z
  .object({
    mode: TileModeSchema,
    title: z.string().min(1).max(80),
    state: z.enum(['fresh', 'partial', 'stale', 'links', 'empty']),
    items: z.array(ItemSchema).max(20),
    fallbackLinks: z.array(LinkSchema).max(20),
  })
  .strict();

export const WeatherPeriodSchema = z
  .object({ name: z.string().min(1).max(40), tempF: z.number().finite(), summary: z.string().min(1).max(120), startsAt: isoUtc, endsAt: isoUtc })
  .strict();

export const ContentBundleSchema = z
  .object({
    schemaVersion: z.literal(2),
    generatedAt: isoUtc,
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    tiles: z.partialRecord(TileIdSchema, TileDataSchema),
    weather: z.record(z.string(), z.object({ periods: z.array(WeatherPeriodSchema).max(14), issuedAt: isoUtc, url: HttpsUrl }).strict()),
  })
  .strict();

export const SourceHealthSchema = z
  .object({
    id: z.string().min(1).max(64),
    state: z.enum(['ok', 'stale', 'failing', 'disabled']),
    lastAttemptAt: isoUtc.nullable(),
    lastSuccessAt: isoUtc.nullable(),
    consecutiveFailures: z.number().int().min(0),
    etag: z.string().max(256).nullable(),
    lastModified: z.string().max(64).nullable(),
    staleAfterMinutes: z.number().int().positive(),
    errorCode: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable(),
  })
  .strict();

export const HealthFileSchema = z.object({ generatedAt: isoUtc, sources: z.array(SourceHealthSchema) }).strict();

export const PublicSourceSchema = z
  .object({ id: z.string().min(1).max(64), publisher: z.string().min(1).max(120), attribution: z.string().min(1).max(80), termsUrl: HttpsUrl, mode: TileModeSchema })
  .strict();
export const SourcesFileSchema = z.object({ generatedAt: isoUtc, sources: z.array(PublicSourceSchema) }).strict();

export const MetaFileSchema = z
  .object({ generatedAt: isoUtc, engineVersion: z.string(), commit: z.string(), preview: z.boolean() })
  .strict();
export type MetaFile = z.infer<typeof MetaFileSchema>;

// Compile-time proof that the schemas and the spec 6.2 interfaces describe the same shapes.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const proofs: [
  Same<z.infer<typeof ItemSchema>, Item>,
  Same<z.infer<typeof TileDataSchema>, TileData>,
  Same<z.infer<typeof SourceHealthSchema>, SourceHealth>,
  Same<z.infer<typeof PublicSourceSchema>, PublicSource>,
  Same<z.infer<typeof WeatherPeriodSchema>, WeatherPeriod>,
] = [true, true, true, true, true];
void proofs;
