const ExcelJS = require('exceljs');
const path = require('path');

async function run() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(__dirname, 'public/template.xlsx'));
  
  const worksheet = workbook.worksheets[0];
  
  let targetRow = -1;
  
  for (let i = 1; i <= 500; i++) {
    const row = worksheet.getRow(i);
    const col3Text = row.getCell(3).text;
    if (col3Text && col3Text.includes('SUB-TOT')) {
      console.log(`Found SUB-TOT at row ${i}`);
      console.log(`Formula in Col 7 (G):`, row.getCell(7).formula);
      if (targetRow === -1) targetRow = i;
    }
  }

  if (targetRow > 2) {
    const spliceRow = targetRow - 1; // row right above it
    console.log(`Splicing row ${spliceRow}`);
    worksheet.spliceRows(spliceRow, 1);
    const newTarget = targetRow - 1;
    console.log(`After splice, SUB-TOT moved to row ${newTarget}`);
    console.log(`Formula in Col 7 (G):`, worksheet.getRow(newTarget).getCell(7).formula);
  }
}

run().catch(console.error);
