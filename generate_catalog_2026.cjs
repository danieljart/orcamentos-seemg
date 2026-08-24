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

  const catalog = [];
  let currentItemRows = null;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 5) return; // Skip header rows

    const itemCodeCell = row.getCell(1).value;
    if (!itemCodeCell) {
      // This is a continuation row (extended description)
      if (currentItemRows) {
        currentItemRows.push(rowNumber);
      }
      return;
    }

    const itemCode = itemCodeCell.toString().trim();
    if (!/^\d{6}$/.test(itemCode)) return;

    // If we had a previous item being tracked, finalize its rows
    // (rows are finalized when we encounter the next item)

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

    // Determine if this is a category
    const isCategory = itemCode.endsWith('0000') || 
      (itemCode.endsWith('00') && !itemCode.endsWith('0000') && unit === '');

    currentItemRows = [rowNumber];

    catalog.push({
      item: itemCode,
      description: description.trim(),
      unit,
      price: isCategory ? 0 : price,
      isCategory,
      rows: currentItemRows
    });
  });

  // Now add extended descriptions by reading continuation rows
  for (const item of catalog) {
    if (!item.isCategory && item.rows.length === 1) {
      // Look at subsequent rows for extended description
      const startRow = item.rows[0];
      const extraRows = [];
      for (let r = startRow + 1; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r);
        const col1 = row.getCell(1).value;
        if (col1) break; // Next item found
        
        const col2 = row.getCell(2).value;
        if (col2) {
          let text = '';
          if (typeof col2 === 'object' && col2.richText) {
            text = col2.richText.map(rt => rt.text).join('');
          } else {
            text = col2.toString();
          }
          if (text.trim()) {
            extraRows.push(r);
          }
        } else {
          // Empty row = end of extended description
          extraRows.push(r);
          break;
        }
      }
      
      if (extraRows.length > 0) {
        item.rows = [item.rows[0], ...extraRows];
        
        // Build extended description
        let extDesc = '';
        for (let i = 1; i < item.rows.length; i++) {
          const row = worksheet.getRow(item.rows[i]);
          const descVal = row.getCell(2).value;
          if (descVal) {
            if (typeof descVal === 'object' && descVal.richText) {
              extDesc += descVal.richText.map(rt => rt.text).join('') + '\n';
            } else {
              extDesc += descVal.toString() + '\n';
            }
          }
        }
        
        if (extDesc.trim().length > 0) {
          item.extendedDescription = extDesc.trim();
        }
      }
    }
  }

  const outputPath = path.resolve(__dirname, 'public', 'catalogo_2026.json');
  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2));
  
  const itemCount = catalog.filter(c => !c.isCategory).length;
  const catCount = catalog.filter(c => c.isCategory).length;
  console.log(`Generated ${outputPath}`);
  console.log(`  Items: ${itemCount}, Categories: ${catCount}, Total: ${catalog.length}`);
  
  // Compare with 2025
  const catalog2025Path = path.resolve(__dirname, 'public', 'catalogo.json');
  if (fs.existsSync(catalog2025Path)) {
    const catalog2025 = JSON.parse(fs.readFileSync(catalog2025Path, 'utf8'));
    const items2025 = catalog2025.filter(c => !c.isCategory).length;
    console.log(`  2025 catalog had ${items2025} items`);
    
    // Show some price comparisons
    console.log('\n  Sample price comparisons (2025 -> 2026):');
    const sampled = ['010001', '010002', '020101', '030101'];
    for (const code of sampled) {
      const old = catalog2025.find(c => c.item === code);
      const neu = catalog.find(c => c.item === code);
      if (old && neu) {
        const diff = ((neu.price - old.price) / old.price * 100).toFixed(1);
        console.log(`    ${code}: R$${old.price.toFixed(2)} -> R$${neu.price.toFixed(2)} (${diff}%)`);
      }
    }
  }
}

generateCatalog2026().catch(console.error);
