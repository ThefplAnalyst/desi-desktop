// Curated adapter (ENG-04): original content written and checked by hand in content/curated/.
// No network. Files the owner has not verified are refused unless a dev preview allows them (D25).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import type { RawItem } from '../normalize.ts';
import { FestivalsFileSchema, FixturesFileSchema } from '../registry.ts';
import type { Adapter } from './types.ts';

const nextDayNoonUtc = (date: string) => {
  const t = Date.parse(`${date}T12:00:00Z`) + 24 * 3600_000;
  return new Date(t).toISOString().replace('.000Z', 'Z');
};

export function festivalRows(file: z.infer<typeof FestivalsFileSchema>): RawItem[] {
  return file.items.map((f) => ({
    guid: f.id,
    title: f.estimated ? `${f.title} (expected)` : f.title,
    url: f.url,
    publishedAt: null,
    startsAt: f.date,
    // A holiday stays listed until its date has ended everywhere in the US.
    expiresAt: nextDayNoonUtc(f.date),
  }));
}

export function fixtureRows(file: z.infer<typeof FixturesFileSchema>): RawItem[] {
  return file.fixtures.map((f) => ({ guid: f.id, title: f.title, url: f.url, publishedAt: null, startsAt: f.startsAt, expiresAt: f.endsAt }));
}

export const curatedAdapter: Adapter = async (ctx) => {
  const path = join(ctx.root, 'content', 'curated', ctx.source.file ?? '');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { kind: 'error', code: 'curated-unreadable' };
  }
  const isFestivals = ctx.source.id === 'festivals';
  const parsed = (isFestivals ? FestivalsFileSchema : FixturesFileSchema).safeParse(raw);
  if (!parsed.success) return { kind: 'error', code: 'curated-invalid' };
  if (parsed.data.review.status !== 'verified' && !ctx.allowUnverified) return { kind: 'error', code: 'curated-unverified' };
  const items = isFestivals
    ? festivalRows(parsed.data as z.infer<typeof FestivalsFileSchema>)
    : fixtureRows(parsed.data as z.infer<typeof FixturesFileSchema>);
  return { kind: 'ok', items, etag: null, lastModified: null };
};
