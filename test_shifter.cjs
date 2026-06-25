const ExcelJS = require('exceljs');

function shiftFormula(formula, deletedRows) {
  // formula is a string like "+F2028+F1839*C2030" or "SUM(F2015:F2027)"
  return formula.replace(/([A-Z]+)(\d+)/g, (match, col, rowStr) => {
    let r = parseInt(rowStr, 10);
    // count how many deleted rows were BEFORE this row
    let shift = 0;
    for(let d of deletedRows) {
      if (d < r) shift++;
      else if (d === r) {
        // if the reference itself is deleted, what to do? Excel usually gives #REF!
        // We'll just point to the row above for simplicity or keep it
        shift++;
      }
    }
    return col + (r - shift);
  });
}

async function test() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('../PLANILHA DE SERVIÇOS SEEMG REVISAO 01 2025.xlsx');
  const ws = wb.getWorksheet('Plan1');

  const rowsToDelete = [10, 11, 12];
  
  const beforeFormula = ws.getCell('F2029').formula;
  console.log('Before F2029:', beforeFormula);

  // shift formulas first?
  // Note: If we splice rows one by one, we'd have to update formulas each time.
  // Better to collect all rows to delete, then update all formulas, then delete from bottom to top!

  const shifted = shiftFormula(beforeFormula, rowsToDelete);
  console.log('After Shift:', shifted);

}
test();
