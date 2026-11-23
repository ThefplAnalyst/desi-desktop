// Federal Register API adapter (ENG-04): documents.json for the agencies in `params.agencies`.
import { z } from 'zod';
import { safeFetch } from '../http.ts';
import type { RawItem } from '../normalize.ts';
import type { Adapter } from './types.ts';

const Response = z.object({
  results: z
    .array(
      z.object({
        title: z.string(),
        html_url: z.string(),
        publication_date: z.iso.date(),
        document_number: z.string(),
      }),
    )
    .default([]),
});

const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function federalRegisterUrl(endpoint: string, agencies: string[], perPage = 20): string {
  const u = new URL(endpoint);
  u.searchParams.set('per_page', String(perPage));
  u.searchParams.set('order', 'newest');
  for (const a of agencies) u.searchParams.append('conditions[agencies][]', a);
  for (const f of ['title', 'html_url', 'publication_date', 'document_number']) u.searchParams.append('fields[]', f);
  return u.href;
}

/**
 * The API gives a publication *date*. It becomes midnight US Eastern (05:00 UTC) of that day — the
 * earliest the document can have appeared, never the fetch time (decision D34).
 */
export function federalRegisterItems(json: unknown): RawItem[] | null {
  const r = Response.safeParse(json);
  if (!r.success) return null;
  return r.data.results.map((d) => ({
    guid: d.document_number,
    title: d.title,
    url: d.html_url,
    publishedAt: `${d.publication_date}T05:00:00Z`,
  }));
}

export const federalRegisterAdapter: Adapter = async (ctx) => {
  if (!ctx.source.endpoint) return { kind: 'error', code: 'no-endpoint' };
  const agencies = list(ctx.source.params['agencies']);
  if (agencies.length === 0) return { kind: 'error', code: 'no-agencies' };
  const r = await safeFetch(
    { url: federalRegisterUrl(ctx.source.endpoint, agencies), allowedHosts: ctx.source.allowedHosts, accept: ['application/json'] },
    ctx.http,
  );
  if (r.kind !== 'ok') return r;
  let json: unknown;
  try {
    json = JSON.parse(r.body);
  } catch {
    return { kind: 'error', code: 'malformed-json' };
  }
  const items = federalRegisterItems(json);
  return items ? { kind: 'ok', items, etag: r.etag, lastModified: r.lastModified } : { kind: 'error', code: 'unexpected-json' };
};
