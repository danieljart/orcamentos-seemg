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

    const descCell = row.getCell(2).value;
    let description = '';
    if (descCell) {
      if (typeof descCell === 'object' && descCell.richText) {
        description = descCell.richText.map(rt => rt.text).join('');
      } else {
        description = descCell.toString();
      }
    }

    const unitCell = row.getCell(3).value;
    const unit = unitCell ? unitCell.toString().trim() : '';

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

    if (isCategory) {
      itemRows = [rowNumber];
    } else {
      for (let r = rowNumber; r < nextRowNumber; r++) {
        itemRows.push(r);
        if (r > rowNumber) {
          const rCell = worksheet.getRow(r).getCell(2).value;
          if (rCell) {
            let t = '';
            if (typeof rCell === 'object' && rCell.richText) {
              t = rCell.richText.map(rt => rt.text).join('');
            } else {
              t = rCell.toString();
            }
            if (t.trim()) {
              extDesc += t.trim() + '\n';
            }
          }
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
