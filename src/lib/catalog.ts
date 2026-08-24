/**
 * Centralized catalog management for multiple price bases.
 * Handles loading, caching, and switching between different SEEMG price catalogs.
 */

export interface CatalogItem {
  item: string;
  description: string;
  unit: string;
  price: number;
  isCategory: boolean;
  rows: number[];
  extendedDescription?: string;
}

export type PriceBase = '2025' | '2026';

export const PRICE_BASES: { value: PriceBase; label: string }[] = [
  { value: '2025', label: 'SEEMG Rev 01/2025' },
  { value: '2026', label: 'SEEMG Rev 00/2026' },
];

export const DEFAULT_PRICE_BASE: PriceBase = '2026';

const CATALOG_PATHS: Record<PriceBase, string> = {
  '2025': '/catalogo.json',
  '2026': '/catalogo_2026.json',
};

const TEMPLATE_PATHS: Record<PriceBase, string> = {
  '2025': '/template_copia.xlsx',
  '2026': '/template_2026.xlsx',
};

// In-memory cache to avoid re-fetching
const catalogCache: Partial<Record<PriceBase, CatalogItem[]>> = {};

/**
 * Returns the URL path for the catalog JSON of a given price base.
 */
export function getCatalogPath(base: PriceBase): string {
  return CATALOG_PATHS[base] || CATALOG_PATHS['2025'];
}

/**
 * Returns the URL path for the XLSX export template of a given price base.
 */
export function getTemplatePath(base: PriceBase): string {
  return TEMPLATE_PATHS[base] || TEMPLATE_PATHS['2025'];
}

/**
 * Loads and caches the catalog for a given price base.
 * Returns cached data if available.
 */
export async function loadCatalog(base: PriceBase): Promise<CatalogItem[]> {
  if (catalogCache[base]) {
    return catalogCache[base]!;
  }

  const path = getCatalogPath(base);
  const res = await fetch(path);
  const data: CatalogItem[] = await res.json();
  catalogCache[base] = data;
  return data;
}

/**
 * Clears the cache for a specific base or all bases.
 */
export function clearCatalogCache(base?: PriceBase): void {
  if (base) {
    delete catalogCache[base];
  } else {
    Object.keys(catalogCache).forEach(k => delete catalogCache[k as PriceBase]);
  }
}

/**
 * Get a user-friendly label for a price base value.
 */
export function getPriceBaseLabel(base: string | undefined): string {
  const found = PRICE_BASES.find(pb => pb.value === base);
  return found ? found.label : PRICE_BASES[0].label;
}
