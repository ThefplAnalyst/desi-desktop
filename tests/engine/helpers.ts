// Offline test helpers: fake sources, fake fetch, fake DNS and a fake clock (ENG-12).
import { readFileSync } from 'node:fs';
import type { Item } from '../../shared/contracts.ts';
import type { Adapter } from '../../engine/adapters/types.ts';
import type { HttpDeps } from '../../engine/http.ts';
import type { RawItem } from '../../engine/normalize.ts';
import { CatalogSchema, SourceSchema, type Config, type Source } from '../../engine/registry.ts';
import { fakeClock } from '../../engine/scheduler.ts';

export const NOW = Date.parse('2026-11-20T12:00:00Z');
export const iso = (minutesBefore: number, from = NOW) => new Date(from - minutesBefore * 60_000).toISOString().replace('.000Z', 'Z');

export const catalog = CatalogSchema.parse(JSON.parse(readFileSync('config/catalog.json', 'utf8')));

export const approvedRights = {
  status: 'approved' as const,
  basis: 'test',
  termsUrl: 'https://example.org/terms',
  commercialUse: true,
  allowedFields: ['title' as const, 'url' as const, 'publishedAt' as const],
  reviewedBy: 'owner',
  reviewedAt: '2026-11-01',
  reviewDueAt: '2027-11-01',
};

export function source(id: string, overrides: Partial<Source> = {}): Source {
  return SourceSchema.parse({
    id,
    publisher: `Publisher ${id}`,
    adapter: 'rss',
    endpoint: `https://${id}.example.org/feed`,
    allowedHosts: [`${id}.example.org`],
    tiles: ['india-news'],
    minIntervalMinutes: 30,
    maxItems: 20,
    maxRetentionHours: 168,
    attribution: id.toUpperCase(),
    enabled: true,
    rights: approvedRights,
    ...overrides,
  });
}

export function config(sources: Source[]): Config {
  return { registry: sources, catalog, metros: { version: 1, metros: [] } as unknown as Config['metros'], links: [] };
}

export const raw = (n: number, over: Partial<RawItem> = {}): RawItem => ({
  guid: `g${n}`,
  title: `Headline ${n}`,
  url: `https://news.example.org/a/${n}`,
  publishedAt: iso(n),
  ...over,
});

/** An adapter that returns whatever the test scripted for each source id. */
export function scriptedAdapter(script: Record<string, () => ReturnType<Adapter>>): Adapter {
  return (ctx) => {
    const f = script[ctx.source.id];
    return f ? f() : Promise.resolve({ kind: 'error', code: 'unscripted' });
  };
}

export const ok = (items: RawItem[], etag: string | null = null) => Promise.resolve({ kind: 'ok' as const, items, etag, lastModified: null });

export function deps(start = NOW, fetchImpl?: typeof fetch, addresses: string[] = ['93.184.216.34']) {
  const clock = fakeClock(start);
  const http: HttpDeps = {
    fetch: fetchImpl ?? (() => Promise.reject(new Error('no network in tests'))),
    lookup: () => Promise.resolve(addresses),
    clock,
    userAgent: 'DesiDesktopBot/1.0 (+test)',
  };
  return { clock, http };
}

export const titles = (items: Item[] | undefined) => (items ?? []).map((i) => i.title);
