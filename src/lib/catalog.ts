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
  /** Which price base the entry came from. Absent means the SEE base. */
  source?: CatalogSource;
  /** SETOP only: the table (SETOP-ED / SETOP-RO / SETOP-CO) it belongs to. */
  table?: string;
  /** SETOP only: the group header the service is listed under. */
  group?: string;
  /** SETOP only: 0 for a table heading, 1 for a group heading. */
  level?: number;
}

export type CatalogSource = 'SEE' | 'SETOP';

/** Which bases the catalogue panel shows. */
export type BaseFilter = 'ambas' | 'SEE' | 'SETOP';

/** `short` is what the closed control shows, so it stays out of the way of the search field. */
export const BASE_FILTERS: { value: BaseFilter; label: string; short: string }[] = [
  { value: 'ambas', label: 'Ambas as bases', short: 'Ambas' },
  { value: 'SEE', label: 'Somente SEE', short: 'SEE' },
  { value: 'SETOP', label: 'Somente SETOP', short: 'SETOP' },
];

export const SETOP_CATALOG_PATH = '/catalogo_setop.json';

/** Matches a SETOP service code, as used across the app to route an item. */
export const SETOP_CODE_RE = /^(?:ED|RO|CO)-\d+$/;

export const isSetopCode = (code: string): boolean => SETOP_CODE_RE.test(code);

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

let setopCatalogCache: CatalogItem[] | null = null;
let setopCatalogPending: Promise<CatalogItem[]> | null = null;

/**
 * Loads and caches the SETOP (SICOR-MG) catalogue.
 *
 * This one file holds over six thousand services, so the in-flight promise is
 * cached as well: the editor asks for it while rendering, and without that a
 * second render would start a second download of the same few megabytes.
 */
export async function loadSetopCatalog(): Promise<CatalogItem[]> {
  if (setopCatalogCache) return setopCatalogCache;
  if (setopCatalogPending) return setopCatalogPending;

  setopCatalogPending = fetch(SETOP_CATALOG_PATH)
    .then(res => {
      if (!res.ok) throw new Error(`Falha ao carregar a base SETOP (${res.status})`);
      return res.json();
    })
    .then((data: CatalogItem[]) => {
      setopCatalogCache = data;
      return data;
    })
    .finally(() => {
      setopCatalogPending = null;
    });

  return setopCatalogPending;
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
