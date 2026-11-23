import { describe, expect, it } from 'vitest';
import { canonicalUrl, decodeEntitiesOnce, makeId, normalizeItem, parseDate, plainText } from '../../engine/normalize.ts';
import { isRelevant } from '../../engine/relevance.ts';
import { NOW } from './helpers.ts';

describe('T-10 ENG-05 normalization', () => {
  it('T-10 ENG-05 HTML is stripped and entities are decoded exactly once', () => {
    expect(plainText('<b>India</b> &amp; <i>US</i> sign&nbsp;pact')).toBe('India & US sign pact');
    expect(plainText('Rates &amp;lt;b&amp;gt; rise')).toBe('Rates &lt;b&gt; rise');
    expect(decodeEntitiesOnce('&#8377; &#x20B9; &rupee;')).toBe('₹ ₹ ₹');
    expect(plainText('<![CDATA[Visa <em>news</em>]]>')).toBe('Visa news');
  });

  it('T-10 ENG-05 control and invisible characters are removed; whitespace collapsed', () => {
    expect(plainText('A\u0000B​C D\n\tE')).toBe('A B C D E');
  });

  it('T-10 ENG-05 titles are capped at 180 characters', () => {
    const t = plainText('word '.repeat(100));
    expect(t.length).toBeLessThanOrEqual(180);
    expect(t.endsWith('…')).toBe(true);
  });

  it('T-10 ENG-05 URLs: https only, fragment and tracking parameters removed', () => {
    expect(canonicalUrl('https://example.org/a?id=7&utm_source=x&fbclid=y&gclid=z#top')).toBe('https://example.org/a?id=7');
    expect(canonicalUrl('https://example.org/a?utm_medium=rss')).toBe('https://example.org/a');
    expect(canonicalUrl('/news/1', 'https://www.pib.gov.in/feed')).toBe('https://www.pib.gov.in/news/1');
    expect(canonicalUrl('https://example.org/a?x=1&amp;y=2')).toBe('https://example.org/a?x=1&y=2');
    for (const bad of ['http://example.org/', 'javascript:alert(1)', 'https://u:p@example.org/', 'https://example.org:8443/', `https://example.org/${'a'.repeat(2050)}`]) {
      expect(canonicalUrl(bad), bad).toBeNull();
    }
  });

  it('T-10 ENG-07 dates are parsed strictly; invalid dates become null', () => {
    expect(parseDate('Thu, 19 Nov 2026 14:05:00 GMT', NOW)).toBe('2026-11-19T14:05:00Z');
    expect(parseDate('Thu, 19 Nov 2026 19:35:00 +0530', NOW)).toBe('2026-11-19T14:05:00Z');
    expect(parseDate('2026-11-19T09:05:00-05:00', NOW)).toBe('2026-11-19T14:05:00Z');
    for (const bad of ['', 'yesterday', '2026-11-19', '2026-11-19 14:05', '19/11/2026', 'Thu, 19 Nov 1999 14:05:00 GMT', 'Sat, 19 Dec 2026 14:05:00 GMT']) {
      expect(parseDate(bad, NOW), bad).toBeNull();
    }
  });

  it('T-10 ENG-07 publishedAt is never replaced by fetch time; firstSeenAt is carried forward', () => {
    const ctx = { sourceId: 'pib', now: NOW, firstSeen: new Map<string, string>() };
    const a = normalizeItem({ title: 'No date', url: 'https://example.org/1' }, ctx);
    expect(a?.publishedAt).toBeNull();
    expect(a?.firstSeenAt).toBe('2026-11-20T12:00:00Z');
    const seen = new Map([[a?.id ?? '', '2026-11-18T08:00:00Z']]);
    expect(normalizeItem({ title: 'No date', url: 'https://example.org/1' }, { ...ctx, firstSeen: seen })?.firstSeenAt).toBe('2026-11-18T08:00:00Z');
  });

  it('T-10 ENG-05 ids are 16 hex chars from GUID or canonical URL', () => {
    expect(makeId('pib', 'guid-1', 'https://x.org/')).toMatch(/^[0-9a-f]{16}$/);
    expect(makeId('pib', 'guid-1', 'https://x.org/a')).toBe(makeId('pib', 'guid-1', 'https://x.org/b'));
    expect(makeId('pib', null, 'https://x.org/a')).not.toBe(makeId('pib', null, 'https://x.org/b'));
    expect(makeId('pib', null, 'https://x.org/a')).not.toBe(makeId('dawn', null, 'https://x.org/a'));
  });

  it('T-10 ENG-05 rows with no title or an unsafe URL are dropped', () => {
    const ctx = { sourceId: 's', now: NOW, firstSeen: new Map<string, string>() };
    expect(normalizeItem({ title: '<p> </p>', url: 'https://example.org/' }, ctx)).toBeNull();
    expect(normalizeItem({ title: 'OK', url: 'http://example.org/' }, ctx)).toBeNull();
  });

  it('T-10 ENG-05 relevance uses only the source include/exclude lists', () => {
    const rules = { include: ['visa', 'h-1b', 'green card'], exclude: ['webinar'] };
    expect(isRelevant('New H-1B registration rule', rules)).toBe(true);
    expect(isRelevant('Green Card webinar', rules)).toBe(false);
    expect(isRelevant('Office closures', rules)).toBe(false);
    expect(isRelevant('Anything', { include: [], exclude: [] })).toBe(true);
  });
});
