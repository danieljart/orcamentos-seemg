import ExcelJS from 'exceljs';
import fs from 'fs';

async function updateCatalog() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./public/template.xlsx');
  const ws = workbook.getWorksheet('Plan1');

  const catalog = JSON.parse(fs.readFileSync('./public/catalogo.json', 'utf8'));

  for (let item of catalog) {
    if (!item.isCategory && item.rows && item.rows.length > 1) {
      let longDesc = "";
      for (let i = 1; i < item.rows.length; i++) {
         let rowNum = item.rows[i];
         let row = ws.getRow(rowNum);
         let descVal = row.getCell(2).value;
         if (descVal) {
             if (typeof descVal === 'object' && descVal.richText) {
                 longDesc += descVal.richText.map(rt => rt.text).join('') + "\n";
             } else {
                 longDesc += descVal.toString() + "\n";
             }
         }
      }
      
      if (longDesc.trim().length > 0) {
          item.extendedDescription = longDesc.trim();
      }
    }
  }

  fs.writeFileSync('./public/catalogo.json', JSON.stringify(catalog, null, 2));
  console.log('Updated catalogo.json');
}

updateCatalog().catch(console.error);
