import { describe, expect, it } from 'vitest';
import { LIMITS, isPrivateAddress, safeFetch, type SafeRequest } from '../../engine/http.ts';
import { deps } from './helpers.ts';

const XML = ['application/rss+xml', 'application/xml', 'text/xml'];
const req = (over: Partial<SafeRequest> = {}): SafeRequest => ({ url: 'https://feeds.example.org/rss', allowedHosts: ['feeds.example.org'], accept: XML, ...over });

type Step = (url: string, init: RequestInit) => Response | Promise<Response>;
/** A fake fetch that answers each call with the next scripted step and records the calls. */
function scripted(...steps: Step[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const step = steps[calls.length - 1];
    if (!step) throw new Error('unexpected extra request');
    return step(url, init ?? {});
  }) as typeof fetch;
  return { f, calls };
}
const rss = (body = '<rss/>', headers: Record<string, string> = {}) => () =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/rss+xml; charset=utf-8', ...headers } });
const status = (code: number, headers: Record<string, string> = {}) => () => new Response(null, { status: code, headers });

describe('T-11 ENG-04 NFR-SEC safe HTTP', () => {
  it('T-11 NFR-SEC sends the bot User-Agent, Accept and conditional headers', async () => {
    const { f, calls } = scripted(rss());
    const r = await safeFetch(req({ etag: '"abc"', lastModified: 'Thu, 19 Nov 2026 10:00:00 GMT' }), deps(undefined, f).http);
    expect(r.kind).toBe('ok');
    const h = calls[0]?.init.headers as Record<string, string>;
    expect(h['User-Agent']).toMatch(/^DesiDesktopBot\/1\.0/);
    expect(h['If-None-Match']).toBe('"abc"');
    expect(h['If-Modified-Since']).toBe('Thu, 19 Nov 2026 10:00:00 GMT');
    expect(calls[0]?.init.redirect).toBe('manual');
  });

  it('T-11 NFR-SEC rejects http, credentials, other ports and hosts not on the allowlist before any request', async () => {
    const { f, calls } = scripted();
    const d = deps(undefined, f).http;
    expect(await safeFetch(req({ url: 'http://feeds.example.org/rss' }), d)).toEqual({ kind: 'error', code: 'not-https' });
    expect(await safeFetch(req({ url: 'https://u:p@feeds.example.org/rss' }), d)).toEqual({ kind: 'error', code: 'credentials-in-url' });
    expect(await safeFetch(req({ url: 'https://feeds.example.org:8443/rss' }), d)).toEqual({ kind: 'error', code: 'non-standard-port' });
    expect(await safeFetch(req({ url: 'https://evil.example.net/rss' }), d)).toEqual({ kind: 'error', code: 'host-not-allowed' });
    expect(calls).toHaveLength(0);
  });

  it('T-11 NFR-SEC rejects hosts that resolve to private, loopback or link-local addresses', async () => {
    for (const addr of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '192.168.1.10', '172.20.0.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      const { f, calls } = scripted(rss());
      expect(await safeFetch(req(), deps(undefined, f, [addr]).http), addr).toEqual({ kind: 'error', code: 'private-address' });
      expect(calls).toHaveLength(0);
    }
    const { f } = scripted(rss());
    expect((await safeFetch(req(), deps(undefined, f, ['93.184.216.34', '10.0.0.1']).http)).kind).toBe('error');
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });

  it('T-11 NFR-SEC a redirect to another host is rejected; same-host redirects are followed (max 3)', async () => {
    const away = scripted(status(302, { location: 'https://evil.example.net/rss' }));
    expect(await safeFetch(req(), deps(undefined, away.f).http)).toEqual({ kind: 'error', code: 'host-not-allowed' });
    expect(away.calls).toHaveLength(1);

    const same = scripted(status(301, { location: '/rss2' }), rss('<rss>ok</rss>'));
    const r = await safeFetch(req(), deps(undefined, same.f).http);
    expect(r).toMatchObject({ kind: 'ok', body: '<rss>ok</rss>' });
    expect(same.calls[1]?.url).toBe('https://feeds.example.org/rss2');

    const loop = scripted(...Array.from({ length: 4 }, () => status(302, { location: '/again' })));
    expect(await safeFetch(req(), deps(undefined, loop.f).http)).toEqual({ kind: 'error', code: 'too-many-redirects' });
  });

  it('T-11 NFR-SEC oversized bodies are rejected (declared and streamed)', async () => {
    const big = 'x'.repeat(LIMITS.maxBytes + 1);
    const declared = scripted(() => new Response('small', { headers: { 'content-type': 'application/xml', 'content-length': String(LIMITS.maxBytes + 1) } }));
    expect(await safeFetch(req(), deps(undefined, declared.f).http)).toEqual({ kind: 'error', code: 'too-large' });
    const streamed = scripted(() => new Response(big, { headers: { 'content-type': 'application/xml' } }));
    expect(await safeFetch(req(), deps(undefined, streamed.f).http)).toEqual({ kind: 'error', code: 'too-large' });
  });

  it('T-11 NFR-SEC an HTML error page posing as a feed is rejected', async () => {
    const { f } = scripted(() => new Response('<html>Service unavailable</html>', { headers: { 'content-type': 'text/html' } }));
    expect(await safeFetch(req(), deps(undefined, f).http)).toEqual({ kind: 'error', code: 'unexpected-content-type' });
  });

  it('T-13 ENG-07 a 304 comes back as not-modified', async () => {
    const { f } = scripted(status(304));
    expect(await safeFetch(req({ etag: '"v1"' }), deps(undefined, f).http)).toEqual({ kind: 'not-modified' });
  });
});

describe('T-12 ENG-06 bounded retry', () => {
  it('T-12 ENG-06 a timeout is retried once, then succeeds', async () => {
    const timeout = () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    };
    const { f, calls } = scripted(timeout, rss());
    const d = deps(undefined, f);
    expect((await safeFetch(req(), d.http)).kind).toBe('ok');
    expect(calls).toHaveLength(2);
    expect(d.clock.slept).toEqual([1000]);
  });

  it('T-12 ENG-06 429 honours Retry-After within the 30 s budget', async () => {
    const { f, calls } = scripted(status(429, { 'retry-after': '5' }), rss());
    const d = deps(undefined, f);
    expect((await safeFetch(req(), d.http)).kind).toBe('ok');
    expect(calls).toHaveLength(2);
    expect(d.clock.slept).toEqual([5000]);
  });

  it('T-12 ENG-06 Retry-After beyond the budget means no retry', async () => {
    const { f, calls } = scripted(status(503, { 'retry-after': '120' }));
    expect(await safeFetch(req(), deps(undefined, f).http)).toEqual({ kind: 'error', code: 'http-503' });
    expect(calls).toHaveLength(1);
  });

  it('T-12 ENG-06 5xx twice gives up after exactly one retry', async () => {
    const { f, calls } = scripted(status(502), status(503));
    expect(await safeFetch(req(), deps(undefined, f).http)).toEqual({ kind: 'error', code: 'http-503' });
    expect(calls).toHaveLength(2);
  });

  it('T-12 ENG-06 4xx (other than 429) is not retried', async () => {
    const { f, calls } = scripted(status(404));
    expect(await safeFetch(req(), deps(undefined, f).http)).toEqual({ kind: 'error', code: 'http-404' });
    expect(calls).toHaveLength(1);
  });
});
