// Loads /data/content.json, health.json and sources.json. Never throws: failures mean "no data" (FR-14).
import type { ContentBundle, PublicSource, SourceHealth } from '../../shared/contracts.ts';
import { parseBundle, parseHealth, parseSources } from './guards.ts';

export interface SiteData {
  bundle: ContentBundle | null;
  health: Map<string, SourceHealth>;
  sources: Map<string, PublicSource>;
}

const MAX_BYTES = 512 * 1024;

async function getJson(url: string, fetchFn: typeof fetch): Promise<unknown> {
  const res = await fetchFn(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('too large');
  return JSON.parse(text);
}

export async function loadData(fetchFn: typeof fetch = fetch): Promise<SiteData> {
  const [content, health, sources] = await Promise.allSettled([
    getJson('/data/content.json', fetchFn),
    getJson('/data/health.json', fetchFn),
    getJson('/data/sources.json', fetchFn),
  ]);
  return {
    bundle: content.status === 'fulfilled' ? parseBundle(content.value) : null,
    health: health.status === 'fulfilled' ? parseHealth(health.value) : new Map(),
    sources: sources.status === 'fulfilled' ? parseSources(sources.value) : new Map(),
  };
}
