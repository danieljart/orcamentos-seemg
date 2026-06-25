const ExcelJS = require('exceljs');

async function test() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('d:/Projetos/Planilha/PLANILHA DE SERVIÇOS SEEMG REVISAO 01 2025.xlsx');
  const ws = workbook.getWorksheet('Plan1');
  
  // Try to delete row 1837
  ws.spliceRows(1837, 1);
  
  await workbook.xlsx.writeFile('d:/Projetos/Planilha/test_out.xlsx');
  console.log("Done");
}
test();
