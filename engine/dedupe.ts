// Deduplication (spec 5.4 step 7): same id within a source; same canonical URL across sources.
// Similar titles with different URLs are never merged.
import type { Item } from '../shared/contracts.ts';

export function dedupeById(items: Item[]): Item[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

/**
 * Across sources the first row for a URL wins, in registry order (decision D33: the Item contract
 * carries one sourceId, so the first source's attribution is kept).
 */
export function dedupeByUrl(items: Item[]): Item[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
}
