const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

/**
 * Generates catalogo_2026.json from the 2026 XLSX spreadsheet.
 * Structure is identical to catalogo.json (2025) but with updated prices.
 * 
 * Spreadsheet column mapping:
 *   A (1) = ITEM code (6-digit)
 *   B (2) = DESCRIÇÃO
 *   C (3) = UNID.
 *   D (4) = QUANT.
 *   E (5) = PREÇO UNITÁRIO
 *   F (6) = TOTAL (formula)
 */
const SUPERSCRIPT = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/**
 * Flattens any cell value to plain text. Units such as M² are stored as rich
 * text ("M" plus a superscript "2"), so a bare toString() would produce
 * "[object Object]"; superscript runs are mapped to the Unicode character.
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
  return '';
}

async function generateCatalog2026() {
  const workbook = new ExcelJS.Workbook();
  const xlsxPath = path.resolve(__dirname, '..', 'PLANILHA DE SERVIÇOS SEEMG REVISAO 00 2026.xlsx');
  
  console.log('Reading:', xlsxPath);
  await workbook.xlsx.readFile(xlsxPath);
  
  const worksheet = workbook.getWorksheet('Plan1');
  if (!worksheet) {
    console.error("Worksheet 'Plan1' not found!");
    process.exit(1);
  }

  // 1. Identify all boundary rows (item codes and subtotals)
  const boundaries = [];
  for (let r = 6; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const col1 = row.getCell(1).value;
    const col3 = row.getCell(3).value;

    const itemCode = col1 ? col1.toString().trim() : '';
    const isItem = /^\d{6}$/.test(itemCode);
    const isSubtotal = col3 && String(col3).toUpperCase().includes('SUB-TOT');

    if (isItem || isSubtotal) {
      boundaries.push({
        row: r,
        code: isItem ? itemCode : 'SUBTOTAL'
      });
    }
  }

  const catalog = [];

  for (let i = 0; i < boundaries.length; i++) {
    const curr = boundaries[i];
    if (curr.code === 'SUBTOTAL') continue;

    const rowNumber = curr.row;
    const nextRowNumber = (i + 1 < boundaries.length) ? boundaries[i + 1].row : rowNumber + 1;
    const row = worksheet.getRow(rowNumber);

    const description = cellText(row.getCell(2).value);

    const unit = cellText(row.getCell(3).value).trim();

    const priceCell = row.getCell(5).value;
    let price = 0;
    if (priceCell) {
      if (typeof priceCell === 'object' && priceCell.result !== undefined) {
        price = parseFloat(priceCell.result) || 0;
      } else if (typeof priceCell === 'number') {
        price = priceCell;
      } else if (typeof priceCell === 'string') {
        price = parseFloat(priceCell.replace(',', '.')) || 0;
      }
    }

    const isCategory = curr.code.endsWith('0000') || 
      (curr.code.endsWith('00') && !curr.code.endsWith('0000') && unit === '');

    let itemRows = [];
    let extDesc = '';

    // Categories span up to the next boundary just like items do. The rows
    // between a category header and its first item hold the measurement
    // criteria shared by the whole group; leaving them out of `rows` orphans
    // them, and the XLSX export drops every row no entry claims.
    for (let r = rowNumber; r < nextRowNumber; r++) {
      itemRows.push(r);
      if (r > rowNumber && !isCategory) {
        const t = cellText(worksheet.getRow(r).getCell(2).value);
        if (t.trim()) {
          extDesc += t.trim() + '\n';
        }
      }
    }

    const itemObj = {
      item: curr.code,
      description: description.trim(),
      unit,
      price: isCategory ? 0 : price,
      isCategory,
      rows: itemRows
    };

    if (extDesc.trim().length > 0) {
      itemObj.extendedDescription = extDesc.trim();
    }

    catalog.push(itemObj);
  }

  const outputPath = path.resolve(__dirname, 'public', 'catalogo_2026.json');
  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2));
  
  const itemCount = catalog.filter(c => !c.isCategory).length;
  const catCount = catalog.filter(c => c.isCategory).length;
  console.log(`Generated ${outputPath}`);
  console.log(`  Items: ${itemCount}, Categories: ${catCount}, Total: ${catalog.length}`);
  
  const rowDist = {};
  catalog.filter(c => !c.isCategory).forEach(x => {
    const len = x.rows ? x.rows.length : 0;
    rowDist[len] = (rowDist[len] || 0) + 1;
  });
  console.log('  Row length distribution in 2026:', rowDist);
}

generateCatalog2026().catch(console.error);
