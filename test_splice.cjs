const ExcelJS = require('exceljs');

async function test() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('../PLANILHA DE SERVIÇOS SEEMG REVISAO 01 2025.xlsx');
  const ws = wb.getWorksheet('Plan1');

  // formula before
  console.log('Before F2029:', ws.getCell('F2029').formula);
  console.log('Before F2028:', ws.getCell('F2028').formula);

  // delete a row, e.g. row 10
  ws.spliceRows(10, 1);

  // The formula should have moved to F2028 now
  console.log('After F2028:', ws.getCell('F2028').formula);
}
test();
