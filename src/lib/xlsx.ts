/** Helpers shared by every module that reads or writes the SEE spreadsheets with ExcelJS. */

const SUPERSCRIPT_DIGITS: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/**
 * Flattens an ExcelJS cell value to plain text.
 *
 * A cell is not always a string: rich text arrives as { richText: [...] },
 * formulas as { formula, result }, hyperlinks as { text, hyperlink }. Calling
 * toString() on any of those yields "[object Object]", which is how that
 * string ended up stored as a unit. Superscript runs are mapped to the
 * matching Unicode character so "M" + superscript "2" reads back as "M²".
 */
export const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString('pt-BR');
  if (typeof value !== 'object') return String(value);

  const cell = value as any;
  if (Array.isArray(cell.richText)) {
    return cell.richText.map((run: any) => {
      const text = run?.text ?? '';
      if (run?.font?.vertAlign === 'superscript') {
        return String(text).replace(/[0-9]/g, (d: string) => SUPERSCRIPT_DIGITS[d]);
      }
      return String(text);
    }).join('');
  }
  if ('result' in cell) return cell.result === null || cell.result === undefined ? '' : String(cell.result);
  if ('text' in cell) return String(cell.text);
  if ('error' in cell) return '';
  return '';
};

/**
 * Budgets saved before cellText() existed can carry the literal string
 * "[object Object]" as their unit. Dropping it here lets the item fall back to
 * the unit from the catalogue instead of showing that string on screen and in
 * the export.
 */
export const sanitizeUnit = (unit: unknown): string | undefined => {
  if (typeof unit !== 'string') return undefined;
  const trimmed = unit.trim();
  return trimmed && trimmed !== '[object Object]' ? trimmed : undefined;
};

/**
 * Grows row heights so nothing is clipped in the exported sheet.
 *
 * Excel only auto-fits a row's height while editing it; a file written by a
 * library keeps whatever height it was given, so long memories of calculation
 * and long locations come out cut off mid-line. There is no text metrics API
 * here, so the number of lines is estimated from the text length against the
 * width of the columns the cell spans, taking merges into account.
 *
 * Heights are only ever increased: rows the template sized deliberately, such
 * as the header band, keep their own height unless their content needs more.
 */
export function growRowsToFitContent(worksheet: any): void {
  const DEFAULT_COLUMN_WIDTH = 8.43;
  const FALLBACK_FONT_SIZE = 11;
  // Width is counted in characters of the default font. Text set in a larger
  // font fits proportionally fewer, and the 0.95 leaves a little slack so a
  // word that wraps early does not spill past the last visible line.
  const charsPerWidthUnit = (fontSize: number) => (FALLBACK_FONT_SIZE / fontSize) * 0.95;

  const columnWidth = (col: number): number => {
    const column = worksheet.getColumn(col);
    return (column && column.width) || DEFAULT_COLUMN_WIDTH;
  };

  // Map every merged cell to the range it belongs to, so a description that
  // spans B:F is measured against all of those columns together.
  const spanByAnchor = new Map<string, { lastCol: number }>();
  const covered = new Set<string>();
  const merges: string[] = worksheet.model && worksheet.model.merges ? worksheet.model.merges : [];

  for (const range of merges) {
    const [from, to] = range.split(':');
    const start = from && from.match(/([A-Z]+)(\d+)/);
    const end = to && to.match(/([A-Z]+)(\d+)/);
    if (!start || !end) continue;

    const colOf = (letters: string) => letters.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
    const c1 = colOf(start[1]);
    const c2 = colOf(end[1]);
    const r1 = parseInt(start[2], 10);
    const r2 = parseInt(end[2], 10);

    spanByAnchor.set(`${r1}:${c1}`, { lastCol: c2 });
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (r !== r1 || c !== c1) covered.add(`${r}:${c}`);
      }
    }
  }

  worksheet.eachRow((row: any, rowNumber: number) => {
    let neededLines = 1;
    let largestFont = FALLBACK_FONT_SIZE;

    for (let col = 1; col <= 12; col++) {
      if (covered.has(`${rowNumber}:${col}`)) continue;

      const cell = row.getCell(col);
      const text = cellText(cell.value);
      if (!text) continue;

      const span = spanByAnchor.get(`${rowNumber}:${col}`);
      const lastCol = span ? span.lastCol : col;
      let width = 0;
      for (let c = col; c <= lastCol; c++) width += columnWidth(c);

      const fontSize = (cell.font && cell.font.size) || FALLBACK_FONT_SIZE;
      largestFont = Math.max(largestFont, fontSize);

      const capacity = Math.max(1, Math.floor(width * charsPerWidthUnit(fontSize)));
      const lines = text
        .split(/\r?\n/)
        .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / capacity)), 0);

      neededLines = Math.max(neededLines, lines);
    }

    const lineHeight = largestFont * 1.3;
    const needed = Math.ceil(neededLines * lineHeight);
    if (!row.height || row.height < needed) {
      row.height = needed;
    }
  });
}
