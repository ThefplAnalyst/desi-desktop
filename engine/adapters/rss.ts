// RSS 2.0 / RSS 1.0 adapter (ENG-04) and the shared safe XML parsing used by atom.ts.
// Safety (T-11): DTDs and entity declarations are refused before parsing, malformed or truncated
// XML is refused by the validator, entity processing is off, and HTML pages posing as feeds fail.
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { safeFetch } from '../http.ts';
import type { RawItem } from '../normalize.ts';
import type { Adapter, AdapterResult } from './types.ts';

export const FEED_TYPES = ['application/rss+xml', 'application/atom+xml', 'application/rdf+xml', 'application/xml', 'text/xml'];

export type XmlResult = { ok: true; doc: Record<string, unknown> } | { ok: false; code: string };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false, // decoded once later by normalize.ts
  htmlEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ['item', 'entry', 'link'].includes(name),
});

/** Parses untrusted XML safely, or returns a short error code. */
export function parseXml(body: string): XmlResult {
  const head = body.trimStart().slice(0, 512).toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return { ok: false, code: 'html-not-feed' };
  if (/<!doctype|<!entity/i.test(body)) return { ok: false, code: 'dtd-not-allowed' };
  if (XMLValidator.validate(body) !== true) return { ok: false, code: 'malformed-xml' };
  try {
    return { ok: true, doc: parser.parse(body) as Record<string, unknown> };
  } catch {
    return { ok: false, code: 'malformed-xml' };
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Text of an element that may be a plain value or { "#text": ... } with attributes. */
export function text(v: unknown): string {
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (isObj(v) && '#text' in v) return text(v['#text']);
  return '';
}

export function rssItems(doc: Record<string, unknown>): { items: RawItem[]; baseUrl?: string } | null {
  const rss = doc['rss'];
  const rdf = doc['rdf:RDF'];
  const channel = isObj(rss) ? rss['channel'] : null;
  const list = isObj(channel) ? channel['item'] : isObj(rdf) ? rdf['item'] : null;
  if (!isObj(channel) && !isObj(rdf)) return null;
  const items = (Array.isArray(list) ? list : []).filter(isObj).map((it) => ({
    guid: text(it['guid']) || null,
    title: text(it['title']),
    url: text(it['link']),
    publishedAt: text(it['pubDate']) || text(it['dc:date']) || null,
  }));
  const base = isObj(rss) ? text(rss['@_xml:base']) : '';
  return base ? { items, baseUrl: base } : { items };
}

export async function fetchFeed(ctx: Parameters<Adapter>[0], accept = FEED_TYPES): Promise<{ ok: true; body: string; etag: string | null; lastModified: string | null } | Exclude<AdapterResult, { kind: 'ok' }>> {
  if (!ctx.source.endpoint) return { kind: 'error', code: 'no-endpoint' };
  const r = await safeFetch(
    { url: ctx.source.endpoint, allowedHosts: ctx.source.allowedHosts, accept, etag: ctx.previous?.etag ?? null, lastModified: ctx.previous?.lastModified ?? null },
    ctx.http,
  );
  if (r.kind !== 'ok') return r;
  return { ok: true, body: r.body, etag: r.etag, lastModified: r.lastModified };
}

export const rssAdapter: Adapter = async (ctx) => {
  const f = await fetchFeed(ctx);
  if (!('ok' in f)) return f;
  const xml = parseXml(f.body);
  if (!xml.ok) return { kind: 'error', code: xml.code };
  const feed = rssItems(xml.doc);
  if (!feed) return { kind: 'error', code: 'not-rss' };
  return { kind: 'ok', items: feed.items, etag: f.etag, lastModified: f.lastModified, ...(feed.baseUrl ? { baseUrl: feed.baseUrl } : {}) };
};
