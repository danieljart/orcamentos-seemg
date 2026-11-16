/** Accent- and case-insensitive form used for every catalogue search. */
export const normalizeSearchText = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * How well one entry answers the search, lowest first.
 *
 * A search for "piso" has to reach "CONTRAPISO" too, so the plain substring
 * match that finds both is kept; what changes is the order, since "PISO
 * CERÂMICO" is almost always what was meant.
 */
export const RANK_NO_MATCH = -1;
export const RANK_STARTS_WITH = 0; // the description opens with the word
export const RANK_WORD_START = 1; // some word of the description opens with it
export const RANK_CONTAINS = 2; // it appears inside a longer word
export const RANK_CODE_ONLY = 3; // only the service code matches

/**
 * Ranks one entry on its own text. `normalizedDescription` must already be
 * normalized; `term` is matched raw against the code, which carries no accents.
 */
export function rankEntry(
  normalizedDescription: string,
  code: string,
  term: string,
  normalizedTerm: string,
): number {
  const at = normalizedDescription.indexOf(normalizedTerm);
  if (at === 0) return RANK_STARTS_WITH;
  if (at > 0) return normalizedDescription.includes(' ' + normalizedTerm) ? RANK_WORD_START : RANK_CONTAINS;
  if (code.includes(term)) return RANK_CODE_ONLY;
  return RANK_NO_MATCH;
}
