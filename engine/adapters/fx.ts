// Currency adapter (ENG-04): USD to INR, PKR, BDT, NPR, LKR. Two providers, chosen by endpoint host:
//   api.frankfurter.dev — central-bank (ECB) reference rates; daily change from a short time series.
//     Covers INR only of our five currencies (checked 2026-11-23).
//   open.er-api.com     — ExchangeRate-API open access; covers all five; no history, so no change.
import { z } from 'zod';
import { safeFetch } from '../http.ts';
import type { RawItem } from '../normalize.ts';
import { toIso } from '../normalize.ts';
import type { Adapter } from './types.ts';

export const CURRENCY_NAMES: Record<string, string> = {
  INR: 'Indian rupee',
  PKR: 'Pakistani rupee',
  BDT: 'Bangladeshi taka',
  NPR: 'Nepalese rupee',
  LKR: 'Sri Lankan rupee',
};

const Rates = z.record(z.string(), z.number().positive());
const FrankfurterSeries = z.object({ base: z.literal('USD'), rates: z.record(z.iso.date(), Rates) });
const OpenEr = z.object({ result: z.literal('success'), base_code: z.literal('USD'), time_last_update_unix: z.number(), rates: Rates });

const DAY = 24 * 3600_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const symbolsOf = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(',') : Object.keys(CURRENCY_NAMES));

const row = (cur: string, rate: number, publishedAt: string, url: string, change?: number): RawItem => ({
  guid: `${cur}-${publishedAt.slice(0, 10)}`,
  title: `US dollar to ${CURRENCY_NAMES[cur] ?? cur}`,
  url,
  publishedAt,
  value: rate.toFixed(2),
  ...(change !== undefined ? { change } : {}),
});

/** Latest rate per currency, with % change from the previous published date. */
export function frankfurterItems(json: unknown, symbols: string[]): RawItem[] | null {
  const r = FrankfurterSeries.safeParse(json);
  if (!r.success) return null;
  const dates = Object.keys(r.data.rates).sort();
  const last = dates.at(-1);
  if (!last) return [];
  const prev = dates.at(-2);
  return symbols.flatMap((cur) => {
    const now = r.data.rates[last]?.[cur];
    if (now === undefined) return [];
    const before = prev ? r.data.rates[prev]?.[cur] : undefined;
    // ECB publishes a date, not a time: midnight UTC of that date is used (decision D34).
    return [row(cur, now, `${last}T00:00:00Z`, 'https://frankfurter.dev/', before ? ((now - before) / before) * 100 : undefined)];
  });
}

export function openErItems(json: unknown, symbols: string[]): RawItem[] | null {
  const r = OpenEr.safeParse(json);
  if (!r.success) return null;
  const at = toIso(r.data.time_last_update_unix * 1000);
  return symbols.flatMap((cur) => {
    const rate = r.data.rates[cur];
    return rate === undefined ? [] : [row(cur, rate, at, 'https://www.exchangerate-api.com/')];
  });
}

export const fxAdapter: Adapter = async (ctx) => {
  if (!ctx.source.endpoint) return { kind: 'error', code: 'no-endpoint' };
  const host = new URL(ctx.source.endpoint).hostname;
  const symbols = symbolsOf(ctx.source.params['symbols']);
  let url: string;
  if (host === 'api.frankfurter.dev') {
    const u = new URL(`${ymd(ctx.now - 10 * DAY)}..`, ctx.source.endpoint);
    u.searchParams.set('base', 'USD');
    u.searchParams.set('symbols', symbols.join(','));
    url = u.href;
  } else if (host === 'open.er-api.com') {
    url = ctx.source.endpoint;
  } else {
    return { kind: 'error', code: 'unknown-fx-provider' };
  }
  const r = await safeFetch({ url, allowedHosts: ctx.source.allowedHosts, accept: ['application/json'] }, ctx.http);
  if (r.kind !== 'ok') return r;
  let json: unknown;
  try {
    json = JSON.parse(r.body);
  } catch {
    return { kind: 'error', code: 'malformed-json' };
  }
  const items = host === 'api.frankfurter.dev' ? frankfurterItems(json, symbols) : openErItems(json, symbols);
  if (!items) return { kind: 'error', code: 'unexpected-json' };
  return { kind: 'ok', items, etag: r.etag, lastModified: r.lastModified };
};
