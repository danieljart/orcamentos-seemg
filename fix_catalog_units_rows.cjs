const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

/**
 * Repairs the generated catalogs in place, fixing two defects that came from
 * the original generation pass:
 *
 * 1. UNIT CELLS WRITTEN AS "[object Object]".
 *    Units like M² / M³ are stored in the spreadsheet as rich text ("M" plus a
 *    superscript "2"). The generator called toString() on the cell value, which
 *    yields "[object Object]" for a rich text object. Those units are re-read
 *    here with the rich text flattened, superscript digits included.
 *
 * 2. CATEGORY ROWS COLLAPSED TO A SINGLE ROW.
 *    The generator gave every category `rows: [headerRow]`. The explanatory
 *    paragraphs that follow a category header (the measurement criteria shared
 *    by all items of that group, e.g. under "Projetos" or "Transportes e
 *    retirada de entulho") therefore belonged to no entry at all, and the XLSX
 *    export — which only keeps rows referenced by some entry — dropped them.
 *    Categories now span up to the next boundary row, exactly like items do.
 */

const SUPERSCRIPT = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/**
 * Flattens any ExcelJS cell value to plain text. Rich text runs marked as
 * superscript keep their meaning by being mapped to the matching Unicode
 * character, so "M" + superscript "2" reads back as "M²".
 */
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);

  if (Array.isArray(value.richText)) {
    return value.richText.map(run => {
      const text = run.text || '';
      if (run.font && run.font.vertAlign === 'superscript') {
        return text.replace(/[0-9]/g, d => SUPERSCRIPT[d]);
      }
      return text;
    }).join('');
  }
  if ('result' in value) return value.result === null || value.result === undefined ? '' : String(value.result);
  if ('text' in value) return String(value.text);
  if (value instanceof Date) return value.toISOString();
  return '';
}

/** Rows that start a new entry: a 6-digit code, or a sub-total line. */
function collectBoundaries(worksheet) {
  const boundaries = [];
  for (let r = 6; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const code = cellText(row.getCell(1).value).trim();
    const colC = cellText(row.getCell(3).value).toUpperCase();
    if (/^\d{6}$/.test(code) || colC.includes('SUB-TOT')) {
      boundaries.push(r);
    }
  }
  return boundaries;
}

async function repair(catalogFile, templateFile) {
  const catalogPath = path.resolve(__dirname, 'public', catalogFile);
  const templatePath = path.resolve(__dirname, 'public', templateFile);

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const worksheet = workbook.getWorksheet('Plan1');
  if (!worksheet) throw new Error(`Worksheet 'Plan1' not found in ${templateFile}`);

  const boundaries = collectBoundaries(worksheet);
  const nextBoundaryAfter = r => boundaries.find(b => b > r);

  let unitsFixed = 0;
  let rowsFixed = 0;

  catalog.forEach(entry => {
    const headerRow = entry.rows && entry.rows.length > 0 ? entry.rows[0] : null;
    if (!headerRow) return;

    if (entry.unit === '[object Object]') {
      const unit = cellText(worksheet.getRow(headerRow).getCell(3).value).trim();
      if (unit && unit !== '[object Object]') {
        entry.unit = unit;
        unitsFixed++;
      }
    }

    if (entry.isCategory && entry.rows.length === 1) {
      const next = nextBoundaryAfter(headerRow);
      const end = next ? next - 1 : headerRow;
      if (end > headerRow) {
        const span = [];
        for (let r = headerRow; r <= end; r++) span.push(r);
        entry.rows = span;
        rowsFixed++;
      }
    }
  });

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  console.log(`${catalogFile}: ${unitsFixed} unidade(s) corrigida(s), ${rowsFixed} categoria(s) com linhas ampliadas`);

  const remaining = catalog.filter(c => c.unit === '[object Object]').length;
  if (remaining > 0) {
    console.warn(`  ATENCAO: ainda restam ${remaining} unidade(s) sem correcao`);
  }
}

(async () => {
  await repair('catalogo.json', 'template_copia.xlsx');
  await repair('catalogo_2026.json', 'template_2026.xlsx');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
