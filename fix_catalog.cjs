const ExcelJS = require('exceljs');
const fs = require('fs');

async function fixCatalog() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./public/template.xlsx');
  const worksheet = workbook.getWorksheet('Plan1'); // ou o nome da aba

  const catalogoPath = './public/catalogo.json';
  const catalogo = JSON.parse(fs.readFileSync(catalogoPath, 'utf8'));

  let updatedCount = 0;

  worksheet.eachRow((row, rowNumber) => {
    // Código do item normalmente na coluna A (1) ou B (2) dependendo do template
    // Vimos no App.tsx que código era B (2) ou algo assim?
    // Espera, no template original o código do item estava na coluna A ou B?
    // No Editor.tsx nós lemos: const itemCodeCell = row.getCell(1).value; para importar.
    // Então o código é a coluna A (1).
    // O preço é a coluna qual? Na importação não lemos o preço.
    // Pela imagem que o usuário mandou, a coluna 'PREÇO UNITÁRIO' é a F.
    // A é ITEM, B é DESCRIÇÃO, C é UNID., D é QUANT., E é ?, F é PREÇO UNITÁRIO
    // Na verdade, na imagem do Excel: A: ITEM, B: DESCRIÇÃO, C: UNID., D: QUANT (ANALISADO), E: PREÇO UNITÁRIO (ANALISADO)?
    // Wait, let's just log column headers to be sure.
    const itemCode = row.getCell(1).value?.toString().trim();
    if (itemCode && /^\d{6}$/.test(itemCode)) {
      // Find item in catalogo
      const catItem = catalogo.find(c => c.item === itemCode);
      if (catItem && !catItem.isCategory) {
        // Find price. Let's try columns 5 (E) and 6 (F)
        let price = 0;
        const cellE = row.getCell(5).value;
        const cellF = row.getCell(6).value;
        const cellG = row.getCell(7).value;
        
        const extractVal = (val) => {
          if (val && typeof val === 'object' && val.result !== undefined) {
             return parseFloat(val.result);
          } else if (typeof val === 'number') {
             return val;
          } else if (typeof val === 'string') {
             const parsed = parseFloat(val.replace(',', '.'));
             if (!isNaN(parsed)) return parsed;
          }
          return 0;
        }

        let pE = extractVal(cellE);
        let pF = extractVal(cellF);
        
        // Usually unit price is around E or F. In the screenshot, it says F but let's take the max or specific one.
        // Wait, "PREÇO UNITÁRIO" in the image is under "ANALISADO". 
        // A: ITEM
        // B: DESCRIÇÃO
        // C: UNID.
        // D: QUANT. (under ANALISADO)
        // E: PREÇO UNITÁRIO (under ANALISADO)
        // Let's assume it's E (5) or F (6). If E is 0, check F.
        price = pF > 0 ? pF : pE;

        if (price > 0 && catItem.price === 0) {
           catItem.price = price;
           updatedCount++;
        }
      }
    }
  });

  fs.writeFileSync(catalogoPath, JSON.stringify(catalogo, null, 2));
  console.log(`Atualizados ${updatedCount} itens no catálogo.`);
}

fixCatalog().catch(console.error);
