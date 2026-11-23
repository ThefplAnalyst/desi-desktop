// Row normalization (ENG-05, ENG-07, spec 5.4 step 5). Pure functions.
import { createHash } from 'node:crypto';
import type { Item } from '../shared/contracts.ts';

export const MAX_TITLE = 180;
export const MAX_URL = 2048;

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', rupee: '₹',
};

/** Decodes HTML entities exactly once ("&amp;lt;" becomes "&lt;", not "<"). */
export function decodeEntitiesOnce(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : m;
    }
    return NAMED[body.toLowerCase()] ?? m;
  });
}

/** Plain text title: tags stripped, entities decoded once, control characters removed, ≤ 180 chars. */
export function plainText(raw: string, max = MAX_TITLE): string {
  const text = decodeEntitiesOnce(raw.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, ' '))
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|mkt_tok|ref_src)$/i;

/** Safe canonical https URL: fragment and known tracking parameters removed. Null if not acceptable. */
export function canonicalUrl(raw: string, base?: string): string | null {
  let u: URL;
  try {
    u = new URL(decodeEntitiesOnce(raw.trim()), base);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  if (u.port !== '' && u.port !== '443') return null;
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  const href = u.href.replace(/\?$/, '');
  return href.length <= MAX_URL ? href : null;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;
const RFC822 = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*)?\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4}\s+\d{1,2}:\d{2}(:\d{2})?\s*(GMT|UTC?|Z|[+-]\d{4}|[ECMP][SD]T)$/i;

export const toIso = (t: number) => new Date(t).toISOString().replace('.000Z', 'Z');

/**
 * Strict date parsing: ISO 8601 with a zone, or RFC 822 (RSS). Anything else, dates before
 * 2000, or more than a day in the future become null. Never substitutes the fetch time (ENG-07).
 */
export function parseDate(raw: string | null | undefined, now: number): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!ISO.test(s) && !RFC822.test(s)) return null;
  // RSS feeds (e.g. USCIS) may use 2-digit years: "Mon, 23 Nov 26 09:56:22 -0500" means 2026.
  const fourDigitYear = s.replace(/^((?:[A-Za-z]{3},\s*)?\d{1,2}\s+[A-Za-z]{3}\s+)(\d{2})(\s)/, '$120$2$3');
  const t = Date.parse(fourDigitYear.replace(/\s+(UT)$/i, ' GMT'));
  if (Number.isNaN(t) || t < Date.UTC(2000, 0, 1) || t > now + 24 * 3600_000) return null;
  return toIso(t);
}

/** 16 hex chars: SHA-256 of source id + GUID (or canonical URL when there is no GUID). */
export function makeId(sourceId: string, guid: string | null | undefined, url: string): string {
  return createHash('sha256').update(`${sourceId}\n${guid?.trim() || url}`).digest('hex').slice(0, 16);
}

/** What adapters return before normalization. */
export interface RawItem {
  guid?: string | null;
  title: string;
  url: string;
  publishedAt?: string | null;
  expiresAt?: string | null;
  startsAt?: string;
  value?: string;
  change?: number;
}

export interface NormalizeContext {
  sourceId: string;
  now: number;
  /** firstSeenAt of rows already seen in the previous bundle, by id. */
  firstSeen: Map<string, string>;
  baseUrl?: string;
}

/** Turns a raw row into a contract Item, or null when it cannot be shown safely. */
export function normalizeItem(raw: RawItem, ctx: NormalizeContext): Item | null {
  const title = plainText(raw.title);
  const url = canonicalUrl(raw.url, ctx.baseUrl);
  if (!title || !url) return null;
  const id = makeId(ctx.sourceId, raw.guid, url);
  const item: Item = {
    id,
    title,
    url,
    sourceId: ctx.sourceId,
    publishedAt: parseDate(raw.publishedAt, ctx.now),
    firstSeenAt: ctx.firstSeen.get(id) ?? toIso(ctx.now),
    expiresAt: raw.expiresAt ? parseDate(raw.expiresAt, Number.POSITIVE_INFINITY) : null,
  };
  if (raw.startsAt) item.startsAt = raw.startsAt;
  if (raw.value !== undefined) item.value = plainText(raw.value, 32);
  if (raw.change !== undefined && Number.isFinite(raw.change)) item.change = Math.round(raw.change * 100) / 100;
  return item;
}
