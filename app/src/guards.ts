// Hand-written guards for /data/* (decision D6: no Zod in the browser).
// Everything from the network is untrusted: anything invalid is dropped, never "fixed up".
import type { ContentBundle, Item, PublicSource, SourceHealth, TileData, TileId, TileMode, WeatherPeriod } from '../../shared/contracts.ts';
import { ALL_IDS } from './catalog.ts';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 2048): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isDate = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isDateOrNull = (v: unknown): v is string | null => v === null || isDate(v);
const MODES: TileMode[] = ['live', 'curated', 'links', 'local'];
const STATES: TileData['state'][] = ['fresh', 'partial', 'stale', 'links', 'empty'];
const HEALTH_STATES: SourceHealth['state'][] = ['ok', 'stale', 'failing', 'disabled'];

export function isHttpsUrl(v: unknown): v is string {
  if (!isStr(v, 2048)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

function item(v: unknown): Item | null {
  if (!isObj(v)) return null;
  const { id, title, url, sourceId, publishedAt, firstSeenAt, expiresAt, value, change, startsAt } = v;
  if (!isStr(id, 64) || !isStr(title, 180) || !isHttpsUrl(url) || !isStr(sourceId, 64)) return null;
  if (!isDateOrNull(publishedAt) || !isDate(firstSeenAt) || !isDateOrNull(expiresAt)) return null;
  const out: Item = { id, title, url, sourceId, publishedAt, firstSeenAt, expiresAt };
  if (value !== undefined) {
    if (!isStr(value, 32)) return null;
    out.value = value;
  }
  if (change !== undefined) {
    if (typeof change !== 'number' || !Number.isFinite(change)) return null;
    out.change = change;
  }
  if (startsAt !== undefined) {
    if (!isDate(startsAt)) return null;
    out.startsAt = startsAt;
  }
  return out;
}

function link(v: unknown): { title: string; url: string } | null {
  return isObj(v) && isStr(v['title'], 180) && isHttpsUrl(v['url']) ? { title: v['title'], url: v['url'] } : null;
}

const keep = <T>(arr: unknown, f: (v: unknown) => T | null, max: number): T[] =>
  Array.isArray(arr) ? arr.map(f).filter((x): x is T => x !== null).slice(0, max) : [];

function tile(v: unknown): TileData | null {
  if (!isObj(v)) return null;
  if (!MODES.includes(v['mode'] as TileMode) || !STATES.includes(v['state'] as TileData['state']) || !isStr(v['title'], 80)) return null;
  return {
    mode: v['mode'] as TileMode,
    title: v['title'],
    state: v['state'] as TileData['state'],
    items: keep(v['items'], item, 20),
    fallbackLinks: keep(v['fallbackLinks'], link, 20),
  };
}

function period(v: unknown): WeatherPeriod | null {
  if (!isObj(v)) return null;
  const { name, tempF, summary, startsAt, endsAt } = v;
  if (!isStr(name, 40) || typeof tempF !== 'number' || !Number.isFinite(tempF) || !isStr(summary, 120)) return null;
  if (!isDate(startsAt) || !isDate(endsAt)) return null;
  return { name, tempF, summary, startsAt, endsAt };
}

/** Returns null for anything that is not a schemaVersion 2 bundle (spec 6.2). */
export function parseBundle(raw: unknown): ContentBundle | null {
  if (!isObj(raw) || raw['schemaVersion'] !== 2 || !isDate(raw['generatedAt']) || !isObj(raw['tiles'])) return null;
  const tiles: ContentBundle['tiles'] = {};
  for (const [id, t] of Object.entries(raw['tiles'])) {
    if (!ALL_IDS.has(id)) continue;
    const parsed = tile(t);
    if (parsed) tiles[id as TileId] = parsed;
  }
  const weather: ContentBundle['weather'] = {};
  if (isObj(raw['weather'])) {
    for (const [metroId, w] of Object.entries(raw['weather'])) {
      if (!isObj(w) || !isDate(w['issuedAt']) || !isHttpsUrl(w['url'])) continue;
      weather[metroId] = { periods: keep(w['periods'], period, 14), issuedAt: w['issuedAt'], url: w['url'] };
    }
  }
  return {
    schemaVersion: 2,
    generatedAt: raw['generatedAt'],
    contentHash: isStr(raw['contentHash'], 128) ? raw['contentHash'] : '',
    tiles,
    weather,
  };
}

export function parseHealth(raw: unknown): Map<string, SourceHealth> {
  const out = new Map<string, SourceHealth>();
  if (!isObj(raw) || !Array.isArray(raw['sources'])) return out;
  for (const s of raw['sources']) {
    if (!isObj(s) || !isStr(s['id'], 64) || !HEALTH_STATES.includes(s['state'] as SourceHealth['state'])) continue;
    if (!isDateOrNull(s['lastAttemptAt']) || !isDateOrNull(s['lastSuccessAt'])) continue;
    if (typeof s['staleAfterMinutes'] !== 'number' || !(s['staleAfterMinutes'] > 0)) continue;
    out.set(s['id'], {
      id: s['id'],
      state: s['state'] as SourceHealth['state'],
      lastAttemptAt: s['lastAttemptAt'],
      lastSuccessAt: s['lastSuccessAt'],
      consecutiveFailures: typeof s['consecutiveFailures'] === 'number' ? s['consecutiveFailures'] : 0,
      etag: null,
      lastModified: null,
      staleAfterMinutes: s['staleAfterMinutes'],
      errorCode: null,
    });
  }
  return out;
}

export function parseSources(raw: unknown): Map<string, PublicSource> {
  const out = new Map<string, PublicSource>();
  const list = isObj(raw) && Array.isArray(raw['sources']) ? raw['sources'] : Array.isArray(raw) ? raw : [];
  for (const s of list) {
    if (!isObj(s) || !isStr(s['id'], 64) || !isStr(s['attribution'], 80)) continue;
    out.set(s['id'], {
      id: s['id'],
      publisher: isStr(s['publisher'], 120) ? s['publisher'] : s['attribution'],
      attribution: s['attribution'],
      ...(isObj(s['credit']) && isStr(s['credit']['text'], 80) && isHttpsUrl(s['credit']['url'])
        ? { credit: { text: s['credit']['text'], url: s['credit']['url'] } }
        : {}),
      termsUrl: isHttpsUrl(s['termsUrl']) ? s['termsUrl'] : '',
      mode: MODES.includes(s['mode'] as TileMode) ? (s['mode'] as TileMode) : 'live',
    });
  }
  return out;
}
