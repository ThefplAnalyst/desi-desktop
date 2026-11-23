// ENG-04 adapter fixture tests and T-11 XML safety. All feed content below is invented for tests.
import { describe, expect, it } from 'vitest';
import { atomAdapter, atomItems } from '../../engine/adapters/atom.ts';
import { cricketItems } from '../../engine/adapters/cricketdata.ts';
import { federalRegisterAdapter, federalRegisterItems, federalRegisterUrl } from '../../engine/adapters/federal-register.ts';
import { frankfurterItems, fxAdapter, openErItems } from '../../engine/adapters/fx.ts';
import { forecastPeriods, nwsAdapter } from '../../engine/adapters/nws.ts';
import { parseXml, rssAdapter, rssItems } from '../../engine/adapters/rss.ts';
import type { AdapterContext } from '../../engine/adapters/types.ts';
import { bulletinUrl, visaBulletinItems } from '../../engine/adapters/visa-bulletin.ts';
import { normalizeItem } from '../../engine/normalize.ts';
import { loadConfig, type Source } from '../../engine/registry.ts';
import { assembleWeather, userAgent } from '../../engine/run.ts';
import { NOW, deps, source } from './helpers.ts';

const RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xml:base="https://feeds.example.org/">
  <channel><title>Test feed</title>
    <item><title>Invented visa notice &amp; update</title><link>https://feeds.example.org/a/1?utm_source=rss</link>
      <guid isPermaLink="false">id-1</guid><pubDate>Thu, 19 Nov 26 09:56:22 -0500</pubDate></item>
    <item><title><![CDATA[Second <b>invented</b> item]]></title><link>/a/2</link><dc:date>2026-11-18T10:00:00Z</dc:date></item>
    <item><title>No date item</title><link>https://feeds.example.org/a/3</link></item>
  </channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test atom</title>
  <entry><id>tag:example.org,2026:1</id><title type="html">Invented atom entry</title>
    <link rel="self" href="https://feeds.example.org/self/1"/><link rel="alternate" href="https://feeds.example.org/e/1"/>
    <updated>2026-11-19T08:00:00Z</updated><published>2026-11-19T07:00:00Z</published></entry>
  <entry><id>tag:example.org,2026:2</id><title>Second entry</title><link href="https://feeds.example.org/e/2"/><updated>2026-11-18T08:00:00Z</updated></entry>
</feed>`;

function ctx(s: Source, body: string | null, contentType = 'application/rss+xml', metros: AdapterContext['metros'] = []): AdapterContext {
  const fetchImpl = (() =>
    Promise.resolve(body === null ? new Response(null, { status: 500 }) : new Response(body, { headers: { 'content-type': contentType } }))) as typeof fetch;
  return { source: s, now: NOW, root: '.', http: deps(NOW, fetchImpl).http, previous: undefined, allowUnverified: false, metros };
}

describe('T-11 NFR-SEC XML safety', () => {
  it('T-11 NFR-SEC malformed and truncated XML are rejected', () => {
    expect(parseXml('<rss><channel><item><title>x</title></channel></rss>')).toEqual({ ok: false, code: 'malformed-xml' });
    expect(parseXml(RSS.slice(0, RSS.length - 40))).toEqual({ ok: false, code: 'malformed-xml' });
  });

  it('T-11 NFR-SEC DTDs and external entities are refused before parsing', () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel><item><title>&x;</title></item></channel></rss>`;
    expect(parseXml(xxe)).toEqual({ ok: false, code: 'dtd-not-allowed' });
    const bomb = `<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><rss/>`;
    expect(parseXml(bomb)).toEqual({ ok: false, code: 'dtd-not-allowed' });
  });

  it('T-11 NFR-SEC an HTML error page posing as a feed is rejected', () => {
    expect(parseXml('<!DOCTYPE html><html><body>Access denied</body></html>')).toEqual({ ok: false, code: 'html-not-feed' });
    expect(parseXml('<html><body>Oops</body></html>')).toEqual({ ok: false, code: 'html-not-feed' });
  });

  it('T-11 ENG-04 entities are left for normalize.ts to decode exactly once', () => {
    const r = parseXml(RSS);
    if (!r.ok) throw new Error(r.code);
    expect(rssItems(r.doc)?.items[0]?.title).toBe('Invented visa notice &amp; update');
  });
});

describe('ENG-04 RSS and Atom adapters', () => {
  it('ENG-04 RSS: titles, links (relative via xml:base), GUIDs, pubDate and dc:date', async () => {
    const r = await rssAdapter(ctx(source('feeds'), RSS));
    if (r.kind !== 'ok') throw new Error(JSON.stringify(r));
    const items = r.items.map((raw) => normalizeItem(raw, { sourceId: 'feeds', now: NOW, firstSeen: new Map(), ...(r.baseUrl ? { baseUrl: r.baseUrl } : {}) }));
    expect(items.map((i) => i?.title)).toEqual(['Invented visa notice & update', 'Second invented item', 'No date item']);
    expect(items.map((i) => i?.url)).toEqual(['https://feeds.example.org/a/1', 'https://feeds.example.org/a/2', 'https://feeds.example.org/a/3']);
    expect(items.map((i) => i?.publishedAt)).toEqual(['2026-11-19T14:56:22Z', '2026-11-18T10:00:00Z', null]);
  });

  it('ENG-04 RSS: an HTML page or a non-feed document is an error, not rows', async () => {
    expect(await rssAdapter(ctx(source('feeds'), '<html>nope</html>', 'text/xml'))).toEqual({ kind: 'error', code: 'html-not-feed' });
    expect(await rssAdapter(ctx(source('feeds'), '<?xml version="1.0"?><other/>'))).toEqual({ kind: 'error', code: 'not-rss' });
    expect(await rssAdapter(ctx(source('feeds'), null))).toMatchObject({ kind: 'error' });
  });

  it('ENG-04 Atom: alternate link, id, published before updated', async () => {
    const r = await atomAdapter(ctx(source('feeds', { adapter: 'atom' }), ATOM, 'application/atom+xml'));
    if (r.kind !== 'ok') throw new Error(JSON.stringify(r));
    expect(r.items).toEqual([
      { guid: 'tag:example.org,2026:1', title: 'Invented atom entry', url: 'https://feeds.example.org/e/1', publishedAt: '2026-11-19T07:00:00Z' },
      { guid: 'tag:example.org,2026:2', title: 'Second entry', url: 'https://feeds.example.org/e/2', publishedAt: '2026-11-18T08:00:00Z' },
    ]);
    const xml = parseXml(RSS);
    expect(xml.ok && atomItems(xml.doc)).toBeNull();
  });
});

describe('ENG-04 provider adapters', () => {
  const fr = source('federal-register', {
    adapter: 'federal-register',
    endpoint: 'https://www.federalregister.gov/api/v1/documents.json',
    allowedHosts: ['www.federalregister.gov'],
    params: { agencies: ['u-s-citizenship-and-immigration-services'] },
  });

  it('ENG-04 Federal Register: query, rows, and publication date as midnight US Eastern', async () => {
    const url = new URL(federalRegisterUrl('https://www.federalregister.gov/api/v1/documents.json', ['a', 'b']));
    expect(url.searchParams.getAll('conditions[agencies][]')).toEqual(['a', 'b']);
    expect(url.searchParams.get('order')).toBe('newest');
    const json = { count: 1, results: [{ title: 'Invented rule', html_url: 'https://www.federalregister.gov/documents/2026/11/19/x', publication_date: '2026-11-19', document_number: '2026-00001' }] };
    expect(federalRegisterItems(json)).toEqual([{ guid: '2026-00001', title: 'Invented rule', url: 'https://www.federalregister.gov/documents/2026/11/19/x', publishedAt: '2026-11-19T05:00:00Z' }]);
    expect(federalRegisterItems({ results: [{ title: 1 }] })).toBeNull();
    const r = await federalRegisterAdapter(ctx(fr, JSON.stringify(json), 'application/json'));
    expect(r).toMatchObject({ kind: 'ok', items: [{ guid: '2026-00001' }] });
    expect(await federalRegisterAdapter(ctx(source('x', { adapter: 'federal-register', endpoint: fr.endpoint, allowedHosts: fr.allowedHosts }), '{}', 'application/json'))).toEqual({ kind: 'error', code: 'no-agencies' });
  });

  it('ENG-04 Frankfurter: latest rate per currency with daily % change; missing currencies are skipped', () => {
    const json = { amount: 1, base: 'USD', start_date: '2026-11-13', end_date: '2026-11-20', rates: { '2026-11-19': { INR: 92.0 }, '2026-11-20': { INR: 92.92 } } };
    const items = frankfurterItems(json, ['INR', 'PKR']);
    expect(items).toHaveLength(1);
    expect(items?.[0]).toMatchObject({ title: 'US dollar to Indian rupee', value: '92.92', publishedAt: '2026-11-20T00:00:00Z' });
    expect(items?.[0]?.change).toBeCloseTo(1.0, 5);
  });

  it('ENG-04 ExchangeRate-API open access: all five currencies, no change', async () => {
    const json = { result: 'success', base_code: 'USD', time_last_update_unix: Date.parse('2026-11-20T00:02:00Z') / 1000, rates: { INR: 92.7, PKR: 276.5, BDT: 124.4, NPR: 148.4, LKR: 332.4, EUR: 0.9 } };
    const items = openErItems(json, ['INR', 'PKR', 'BDT', 'NPR', 'LKR']);
    expect(items?.map((i) => i.value)).toEqual(['92.70', '276.50', '124.40', '148.40', '332.40']);
    expect(items?.every((i) => i.change === undefined)).toBe(true);
    const s = source('er', { adapter: 'fx', endpoint: 'https://open.er-api.com/v6/latest/USD', allowedHosts: ['open.er-api.com'] });
    expect(await fxAdapter(ctx(s, JSON.stringify(json), 'application/json'))).toMatchObject({ kind: 'ok' });
    expect(await fxAdapter(ctx(s, JSON.stringify({ result: 'error' }), 'application/json'))).toEqual({ kind: 'error', code: 'unexpected-json' });
  });

  it('ENG-04 D22 NWS: next periods in UTC and °F; a failing metro does not hide the others', async () => {
    const forecast = {
      properties: {
        updateTime: '2026-11-20T10:30:00-06:00',
        periods: [
          { name: 'Overnight', startTime: '2026-11-20T00:00:00-06:00', endTime: '2026-11-20T05:00:00-06:00', temperature: 40, temperatureUnit: 'F', shortForecast: 'Clear' },
          { name: 'Today', startTime: '2026-11-20T06:00:00-06:00', endTime: '2026-11-20T18:00:00-06:00', temperature: 20, temperatureUnit: 'C', shortForecast: 'Sunny' },
          { name: 'Tonight', startTime: '2026-11-20T18:00:00-06:00', endTime: '2026-11-21T06:00:00-06:00', temperature: 45, temperatureUnit: 'F', shortForecast: 'Mostly Clear' },
        ],
      },
    };
    const f = forecastPeriods(forecast, NOW);
    expect(f?.issuedAt).toBe('2026-11-20T16:30:00Z');
    expect(f?.periods.map((p) => [p.name, p.tempF, p.startsAt])).toEqual([
      ['Today', 68, '2026-11-20T12:00:00Z'],
      ['Tonight', 45, '2026-11-21T00:00:00Z'],
    ]);

    const metros = loadConfig('.').metros.metros.slice(0, 2);
    let call = 0;
    const fetchImpl = (() =>
      Promise.resolve(
        call++ === 0
          ? new Response(JSON.stringify(forecast), { headers: { 'content-type': 'application/geo+json' } })
          : new Response(null, { status: 404 }),
      )) as typeof fetch;
    const nws = source('nws', { adapter: 'nws', endpoint: 'https://api.weather.gov/', allowedHosts: ['api.weather.gov'] });
    const r = await nwsAdapter({ source: nws, now: NOW, root: '.', http: deps(NOW, fetchImpl).http, previous: undefined, allowUnverified: false, metros });
    if (r.kind !== 'ok') throw new Error(JSON.stringify(r));
    expect(Object.keys(r.weather ?? {})).toEqual([metros[0]?.id]);
    expect(r.weather?.[metros[0]?.id ?? '']?.url).toMatch(/^https:\/\/forecast\.weather\.gov\/MapClick\.php\?lat=/);
  });

  it('ENG-04 Visa Bulletin: current month link in the fiscal-year folder, expiring when the month ends', () => {
    const base = 'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html';
    expect(bulletinUrl(base, 2026, 11)).toBe('https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/2027/visa-bulletin-for-december-2026.html');
    expect(bulletinUrl(base, 2027, 2)).toBe('https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/2027/visa-bulletin-for-march-2027.html');
    expect(visaBulletinItems(base, NOW)).toEqual([
      {
        guid: 'visa-bulletin-2026-11',
        title: 'Visa Bulletin for November 2026',
        url: 'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/2027/visa-bulletin-for-november-2026.html',
        publishedAt: null,
        expiresAt: '2026-12-01T05:00:00Z',
      },
    ]);
  });

  it('ENG-04 D21 CricketData (off by default): matches become rows with start times', () => {
    const json = { status: 'success', data: [{ id: 'm1', name: 'Team A vs Team B, 1st T20I', status: 'Match not started', dateTimeGMT: '2026-11-21T14:00:00', teams: ['Team A', 'Team B'] }] };
    expect(cricketItems(json, NOW)).toEqual([
      { guid: 'm1', title: 'Team A vs Team B, 1st T20I: Match not started', url: 'https://cricketdata.org/', publishedAt: null, startsAt: '2026-11-21T14:00:00Z', expiresAt: '2026-11-22T14:00:00Z' },
    ]);
    expect(cricketItems({ status: 'failure' }, NOW)).toBeNull();
  });
});

describe('ENG-06 D22 weather assembly and bot identity', () => {
  const w = (endsAt: string) => ({ 'austin': { periods: [{ name: 'Tonight', tempF: 45, summary: 'Clear', startsAt: '2026-11-20T00:00:00Z', endsAt }], issuedAt: '2026-11-20T10:00:00Z', url: 'https://forecast.weather.gov/MapClick.php?lat=1&lon=2' } });
  const nws = source('nws', { adapter: 'nws', endpoint: 'https://api.weather.gov/', allowedHosts: ['api.weather.gov'], maxRetentionHours: 24 });
  const health = (ok: string | null) => ({ id: 'nws', state: 'failing' as const, lastAttemptAt: null, lastSuccessAt: ok, consecutiveFailures: 1, etag: null, lastModified: null, staleAfterMinutes: 540, errorCode: 'timeout' });

  it('ENG-06 a failed weather run reuses previous forecasts within retention, dropping ended periods', () => {
    const runs = [{ source: nws, publishable: true, rows: { kind: 'failed' as const }, health: health('2026-11-20T06:00:00Z') }];
    expect(Object.keys(assembleWeather(runs, new Map(), w('2026-11-20T18:00:00Z'), NOW))).toEqual(['austin']);
    expect(assembleWeather(runs, new Map(), w('2026-11-20T11:00:00Z'), NOW)).toEqual({});
    const old = [{ ...runs[0], health: health('2026-11-18T06:00:00Z') }] as typeof runs;
    expect(assembleWeather(old, new Map(), w('2026-11-20T18:00:00Z'), NOW)).toEqual({});
    const off = [{ ...runs[0], publishable: false }] as typeof runs;
    expect(assembleWeather(off, new Map(), w('2026-11-20T18:00:00Z'), NOW)).toEqual({});
  });

  it('NFR-PRIV spec 5.5 the bot identifies itself; contact comes from configuration, never hard-coded', () => {
    expect(userAgent(undefined, undefined)).toBe('DesiDesktopBot/1.0 (+https://github.com/ThefplAnalyst/desi-desktop)');
    expect(userAgent('https://desi.example.org/', 'bot@example.org')).toBe('DesiDesktopBot/1.0 (+https://desi.example.org/about/; bot@example.org)');
  });
});
