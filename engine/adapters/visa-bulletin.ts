// Visa Bulletin adapter (ENG-04): builds the link to the current month's bulletin. No network:
// travel.state.gov refuses automated requests (403 on 2026-11-23), so the spec's HEAD check is not
// possible; the current month's bulletin is always published before the month starts, and the
// next month's link is left out because it cannot be checked (decision D34).
import type { RawItem } from '../normalize.ts';
import type { Adapter } from './types.ts';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Month and year in US Eastern time. */
function easternMonth(now: number): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric' }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month') - 1 };
}

/** Bulletins are filed under the US fiscal year, which starts in October. */
export function bulletinUrl(base: string, year: number, month: number): string {
  const fiscalYear = month >= 9 ? year + 1 : year;
  return new URL(`visa-bulletin/${fiscalYear}/visa-bulletin-for-${MONTHS[month]}-${year}.html`, base.replace(/visa-bulletin\.html$/, '')).href;
}

export function visaBulletinItems(endpoint: string, now: number): RawItem[] {
  const { year, month } = easternMonth(now);
  const name = (MONTHS[month] ?? '').replace(/^./, (c) => c.toUpperCase());
  const nextMonthStart = Date.UTC(month === 11 ? year + 1 : year, (month + 1) % 12, 1, 5);
  return [
    {
      guid: `visa-bulletin-${year}-${month + 1}`,
      title: `Visa Bulletin for ${name} ${year}`,
      url: bulletinUrl(endpoint, year, month),
      publishedAt: null,
      expiresAt: new Date(nextMonthStart).toISOString().replace('.000Z', 'Z'),
    },
  ];
}

export const visaBulletinAdapter: Adapter = async (ctx) => {
  if (!ctx.source.endpoint) return { kind: 'error', code: 'no-endpoint' };
  return { kind: 'ok', items: visaBulletinItems(ctx.source.endpoint, ctx.now), etag: null, lastModified: null };
};
