// Data contracts shared by app/ and engine/ (spec 6.2). Names here are binding.
// M2 adds the Zod schemas the engine validates with; the browser imports types only
// (`import type`), so Zod never enters the browser bundle (decision D6).

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
