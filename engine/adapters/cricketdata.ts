// CricketData adapter (ENG-04, decision D21): built and tested, OFF until the owner confirms rights
// (and possibly a paid plan). Needs CRICKETDATA_KEY in the environment; the key is added only at
// request time and never appears in logs, health or the bundle.
import { z } from 'zod';
import { safeFetch } from '../http.ts';
import type { RawItem } from '../normalize.ts';
import type { Adapter } from './types.ts';

const Matches = z.object({
  status: z.literal('success'),
  data: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        dateTimeGMT: z.string(),
        teams: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export function cricketItems(json: unknown, now: number): RawItem[] | null {
  const r = Matches.safeParse(json);
  if (!r.success) return null;
  return r.data.data.flatMap((m) => {
    const start = Date.parse(`${m.dateTimeGMT.replace(/Z?$/, '')}Z`);
    if (Number.isNaN(start)) return [];
    return [
      {
        guid: m.id,
        title: `${m.name}: ${m.status}`,
        url: 'https://cricketdata.org/',
        publishedAt: null,
        startsAt: new Date(start).toISOString().replace('.000Z', 'Z'),
        expiresAt: new Date(Math.max(start, now) + 24 * 3600_000).toISOString().replace('.000Z', 'Z'),
      },
    ];
  });
}

export const cricketDataAdapter: Adapter = async (ctx) => {
  const key = process.env['CRICKETDATA_KEY'];
  if (!ctx.source.endpoint) return { kind: 'error', code: 'no-endpoint' };
  if (!key) return { kind: 'error', code: 'missing-api-key' };
  const u = new URL(ctx.source.endpoint);
  u.searchParams.set('apikey', key);
  u.searchParams.set('offset', '0');
  const r = await safeFetch({ url: u.href, allowedHosts: ctx.source.allowedHosts, accept: ['application/json'] }, ctx.http);
  if (r.kind !== 'ok') return r;
  let json: unknown;
  try {
    json = JSON.parse(r.body);
  } catch {
    return { kind: 'error', code: 'malformed-json' };
  }
  const items = cricketItems(json, ctx.now);
  return items ? { kind: 'ok', items, etag: null, lastModified: null } : { kind: 'error', code: 'unexpected-json' };
};
