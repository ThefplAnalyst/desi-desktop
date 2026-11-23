import catalogJson from '../../config/catalog.json';
import metrosJson from '../../config/metros.json';
import type { CatalogEntry, Metro, TileId } from '../../shared/contracts.ts';

export const CATALOG = catalogJson.tiles as CatalogEntry[];
export const METROS = metrosJson.metros as Metro[];

/** Tiles a visitor can choose (hidden tiles are not offered yet). */
export const SELECTABLE = CATALOG.filter((t) => !t.hidden);
export const SELECTABLE_IDS = new Set<TileId>(SELECTABLE.map((t) => t.id));
export const ALL_IDS = new Set<string>(CATALOG.map((t) => t.id));

export const DEFAULT_TILES: TileId[] = SELECTABLE.filter((t) => t.defaultOn).map((t) => t.id);

export function entry(id: TileId): CatalogEntry | undefined {
  return CATALOG.find((t) => t.id === id);
}

export function metro(id: string | null): Metro | undefined {
  return id ? METROS.find((m) => m.id === id) : undefined;
}
