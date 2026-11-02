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
  /** SETOP and SUDECAP: the table (SETOP-ED, SUDECAP-01, ...) it belongs to. */
  table?: string;
  /** SETOP and SUDECAP: the group header the service is listed under. */
  group?: string;
  /** SETOP and SUDECAP: 0 for a table heading, 1 for a group heading. */
  level?: number;
}

export type CatalogSource = 'SEE' | 'SETOP' | 'SUDECAP';

/** The price bases the catalogue panel can show; any combination can be on. */
export type BaseId = CatalogSource;

/** `short` is what the closed control shows, so it stays out of the way of the search field. */
export const BASE_OPTIONS: { value: BaseId; label: string; short: string }[] = [
  { value: 'SEE', label: 'SEE', short: 'SEE' },
  { value: 'SETOP', label: 'SETOP', short: 'SETOP' },
  { value: 'SUDECAP', label: 'SUDECAP', short: 'SUDECAP' },
];

export const ALL_BASES: BaseId[] = BASE_OPTIONS.map(option => option.value);

/** The bases whose services go into the "OUTROS" block of the spreadsheet. */
export type ExternalBase = Exclude<BaseId, 'SEE'>;

const EXTERNAL_BASES: Record<ExternalBase, { path: string; codeRe: RegExp }> = {
  SETOP: { path: '/catalogo_setop.json', codeRe: /^(?:ED|RO|CO)-\d+$/ },
  SUDECAP: { path: '/catalogo_sudecap.json', codeRe: /^SU-\d+(?:\.\d+)+$/ },
};

export const isSetopCode = (code: string): boolean => EXTERNAL_BASES.SETOP.codeRe.test(code);

export const isSudecapCode = (code: string): boolean => EXTERNAL_BASES.SUDECAP.codeRe.test(code);

/** Whether a service code belongs to a base other than SEE, as used across the app to route an item. */
export const isExternalCode = (code: string): boolean => isSetopCode(code) || isSudecapCode(code);
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

const externalCache: Partial<Record<ExternalBase, CatalogItem[]>> = {};
const externalPending: Partial<Record<ExternalBase, Promise<CatalogItem[]>>> = {};

/**
 * Loads and caches one of the external catalogues (SETOP or SUDECAP).
 *
 * These files hold thousands of services, so the in-flight promise is cached
 * as well: the editor asks for them while rendering, and without that a second
 * render would start a second download of the same few megabytes.
 */
export async function loadExternalCatalog(base: ExternalBase): Promise<CatalogItem[]> {
  const cached = externalCache[base];
  if (cached) return cached;
  const pending = externalPending[base];
  if (pending) return pending;

  const request = fetch(EXTERNAL_BASES[base].path)
    .then(res => {
      if (!res.ok) throw new Error(`Falha ao carregar a base ${base} (${res.status})`);
      return res.json();
    })
    .then((data: CatalogItem[]) => {
      externalCache[base] = data;
      return data;
    })
    .finally(() => {
      delete externalPending[base];
    });

  externalPending[base] = request;
  return request;
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
