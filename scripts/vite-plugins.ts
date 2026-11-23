// Build-time helpers for vite.config.ts. Node only; never bundled into the app.
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * FR-13: the About page's source list, generated from the registry so it is always current.
 * Lists only sources that are enabled AND approved (ENG-09). Pure, so it is unit-tested.
 */
export function renderSourcesList(registry: unknown): string {
  const list = isObj(registry) && Array.isArray(registry['sources']) ? registry['sources'] : [];
  const rows: string[] = [];
  for (const s of list) {
    if (!isObj(s) || s['enabled'] !== true) continue;
    const rights = isObj(s['rights']) ? s['rights'] : {};
    if (rights['status'] !== 'approved') continue;
    const publisher = typeof s['publisher'] === 'string' ? s['publisher'] : String(s['id']);
    const attribution = typeof s['attribution'] === 'string' ? s['attribution'] : publisher;
    const tiles = Array.isArray(s['tiles']) ? s['tiles'].filter((t): t is string => typeof t === 'string').join(', ') : '';
    const mode = s['adapter'] === 'curated' ? 'Curated' : 'Updates';
    const terms = typeof rights['termsUrl'] === 'string' && rights['termsUrl'].startsWith('https://') ? rights['termsUrl'] : '';
    rows.push(
      `<li><strong>${esc(publisher)}</strong> (${esc(attribution)}) — ${mode}${tiles ? `, tiles: ${esc(tiles)}` : ''}` +
        (terms ? ` · <a href="${esc(terms)}" rel="noopener noreferrer">Terms</a>` : '') +
        '</li>',
    );
  }
  return rows.length ? `<ul class="sources">${rows.join('')}</ul>` : '<p>No sources are switched on yet.</p>';
}

export function aboutSources(registryPath = 'config/sources.json'): Plugin {
  return {
    name: 'desi-about-sources',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!html.includes('<!-- sources-list -->') || !ctx.filename.replace(/\\/g, '/').endsWith('about/index.html')) return html;
        const registry = existsSync(registryPath) ? (JSON.parse(readFileSync(registryPath, 'utf8')) as unknown) : null;
        return html.replace('<!-- sources-list -->', renderSourcesList(registry));
      },
    },
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;

/** Shifts every ISO timestamp in a JSON value by `deltaMs` (dev only: makes fixtures look recent). */
export function shiftTimes(value: unknown, deltaMs: number): unknown {
  if (typeof value === 'string' && ISO.test(value)) return new Date(Date.parse(value) + deltaMs).toISOString();
  if (Array.isArray(value)) return value.map((v) => shiftTimes(v, deltaMs));
  if (isObj(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftTimes(v, deltaMs)]));
  return value;
}

/**
 * `npm run dev` only: serves tests/fixtures/*.sample.json as /data/*.json (development-only sample data).
 * Timestamps are shifted so the sample looks 25 minutes old. Never part of a build.
 */
export function devFixtures(dir = 'tests/fixtures'): Plugin {
  const files: Record<string, string> = {
    '/data/content.json': 'content.sample.json',
    '/data/health.json': 'health.sample.json',
    '/data/sources.json': 'sources.sample.json',
  };
  return {
    name: 'desi-dev-fixtures',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const file = files[(req.url ?? '').split('?')[0] ?? ''];
        if (!file) return next();
        const content = JSON.parse(readFileSync(join(dir, 'content.sample.json'), 'utf8')) as { generatedAt: string };
        const delta = Date.now() - 25 * 60_000 - Date.parse(content.generatedAt);
        const body = JSON.stringify(shiftTimes(JSON.parse(readFileSync(join(dir, file), 'utf8')), delta));
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
      });
    },
  };
}
