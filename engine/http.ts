// Safe outbound HTTP (spec 5.5, decision D17). The only module that talks to the network.
// HTTPS only; exact-host allowlist on the first request and every redirect (max 3); no
// credentials, non-standard ports or private/loopback/link-local addresses; 10 s per request,
// 30 s per source, 1 MiB body cap; one retry on network/429/5xx honouring Retry-After within
// budget; conditional requests. Never logs bodies or full URLs.
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Clock } from './scheduler.ts';

export const LIMITS = { requestMs: 10_000, sourceMs: 30_000, maxBytes: 1024 * 1024, maxRedirects: 3 } as const;

export interface HttpDeps {
  fetch: typeof fetch;
  /** Resolves a host name to all its IP addresses. Injected in tests. */
  lookup: (host: string) => Promise<string[]>;
  clock: Clock;
  userAgent: string;
}

export const defaultLookup = async (host: string): Promise<string[]> => (await dnsLookup(host, { all: true })).map((a) => a.address);

export interface SafeRequest {
  url: string;
  allowedHosts: string[];
  /** Accepted media types, e.g. ["application/rss+xml", "application/xml", "text/xml"]. */
  accept: string[];
  etag?: string | null;
  lastModified?: string | null;
}

export type FetchResult =
  | { kind: 'ok'; body: string; contentType: string; etag: string | null; lastModified: string | null }
  | { kind: 'not-modified' }
  | { kind: 'error'; code: string };

/** Sanitized error with a short code; never carries a URL or body. */
class HttpFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  constructor(code: string, retryable = false, retryAfterMs: number | null = null) {
    super(code);
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);
}

const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3],
];

/** True for private, loopback, link-local, CGNAT, multicast and reserved addresses (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return ((n & mask) >>> 0) === ((ipv4ToInt(base) & mask) >>> 0);
    });
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped?.[1]) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v); // unique-local, link-local, multicast
  }
  return true; // not an IP at all: refuse
}

async function checkUrl(raw: string, allowedHosts: string[], lookup: HttpDeps['lookup']): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpFailure('bad-url');
  }
  if (u.protocol !== 'https:') throw new HttpFailure('not-https');
  if (u.username || u.password) throw new HttpFailure('credentials-in-url');
  if (u.port !== '' && u.port !== '443') throw new HttpFailure('non-standard-port');
  const host = u.hostname.toLowerCase();
  if (!allowedHosts.includes(host)) throw new HttpFailure('host-not-allowed');
  if (isIP(host.replace(/^\[|\]$/g, ''))) throw new HttpFailure('ip-literal-host');
  let addresses: string[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new HttpFailure('dns-failed', true);
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new HttpFailure('private-address');
  return u;
}

function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  if (/^\d+$/.test(header.trim())) return Number(header.trim()) * 1000;
  const t = Date.parse(header);
  return Number.isNaN(t) ? null : Math.max(0, t - now);
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) {
    await res.body?.cancel();
    throw new HttpFailure('too-large');
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpFailure('too-large');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(all);
}

async function attempt(req: SafeRequest, deps: HttpDeps, deadline: number): Promise<FetchResult> {
  let current = req.url;
  for (let hop = 0; hop <= LIMITS.maxRedirects; hop++) {
    const url = await checkUrl(current, req.allowedHosts, deps.lookup);
    const remaining = deadline - deps.clock.now();
    if (remaining <= 0) throw new HttpFailure('budget-exceeded');
    const headers: Record<string, string> = { 'User-Agent': deps.userAgent, Accept: req.accept.join(', ') };
    if (req.etag) headers['If-None-Match'] = req.etag;
    if (req.lastModified) headers['If-Modified-Since'] = req.lastModified;

    let res: Response;
    try {
      res = await deps.fetch(url.href, {
        method: 'GET',
        headers,
        redirect: 'manual',
        credentials: 'omit',
        signal: AbortSignal.timeout(Math.min(LIMITS.requestMs, remaining)),
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      throw new HttpFailure(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network', true);
    }

    if (res.status === 304) return { kind: 'not-modified' };
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location) throw new HttpFailure('redirect-without-location');
      current = new URL(location, url).href;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await res.body?.cancel();
      throw new HttpFailure(`http-${res.status}`, true, retryAfterMs(res.headers.get('retry-after'), deps.clock.now()));
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      throw new HttpFailure(`http-${res.status}`);
    }
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!req.accept.includes(contentType)) {
      await res.body?.cancel();
      throw new HttpFailure('unexpected-content-type');
    }
    const body = await readCapped(res, LIMITS.maxBytes);
    return { kind: 'ok', body, contentType, etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') };
  }
  throw new HttpFailure('too-many-redirects');
}

/** Fetches one source endpoint safely. Never throws; failures come back as short error codes. */
export async function safeFetch(req: SafeRequest, deps: HttpDeps): Promise<FetchResult> {
  const deadline = deps.clock.now() + LIMITS.sourceMs;
  for (let tries = 0; ; tries++) {
    try {
      return await attempt(req, deps, deadline);
    } catch (e) {
      const f = e instanceof HttpFailure ? e : new HttpFailure('network', true);
      if (!f.retryable || tries >= 1) return { kind: 'error', code: f.code };
      const wait = f.retryAfterMs ?? 1000;
      // Retry only if the wait plus a minimal request still fits in the source budget.
      if (deps.clock.now() + wait + 1000 > deadline) return { kind: 'error', code: f.code };
      await deps.clock.sleep(wait);
    }
  }
}
