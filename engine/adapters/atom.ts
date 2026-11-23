// Atom adapter (ENG-04). Shares the safe XML parsing in rss.ts.
import type { RawItem } from '../normalize.ts';
import { fetchFeed, parseXml, text } from './rss.ts';
import type { Adapter } from './types.ts';

const ATOM_TYPES = ['application/atom+xml', 'application/xml', 'text/xml'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The entry's page link: rel="alternate" (or no rel), else the first link with an href. */
function entryLink(links: unknown): string {
  const list = (Array.isArray(links) ? links : [links]).filter(isObj);
  const alt = list.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? list[0];
  return alt ? text(alt['@_href']) : '';
}

export function atomItems(doc: Record<string, unknown>): { items: RawItem[]; baseUrl?: string } | null {
  const feed = doc['feed'];
  if (!isObj(feed)) return null;
  const entries = Array.isArray(feed['entry']) ? feed['entry'] : [];
  const items = entries.filter(isObj).map((e) => ({
    guid: text(e['id']) || null,
    title: text(e['title']),
    url: entryLink(e['link']),
    publishedAt: text(e['published']) || text(e['updated']) || null,
  }));
  const base = text(feed['@_xml:base']);
  return base ? { items, baseUrl: base } : { items };
}

export const atomAdapter: Adapter = async (ctx) => {
  const f = await fetchFeed(ctx, ATOM_TYPES);
  if (!('ok' in f)) return f;
  const xml = parseXml(f.body);
  if (!xml.ok) return { kind: 'error', code: xml.code };
  const feed = atomItems(xml.doc);
  if (!feed) return { kind: 'error', code: 'not-atom' };
  return { kind: 'ok', items: feed.items, etag: f.etag, lastModified: f.lastModified, ...(feed.baseUrl ? { baseUrl: feed.baseUrl } : {}) };
};
