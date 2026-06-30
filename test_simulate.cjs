const ExcelJS = require('exceljs');
const path = require('path');

async function run() {
  const workbook = new ExcelJS.Workbook();
  const templatePath = path.join(__dirname, 'public/template_copia.xlsx');
  await workbook.xlsx.readFile(templatePath);
  
  const worksheet = workbook.worksheets[0];
  
  console.log("Simulando preenchimento da planilha...");

  // Nós vamos pegar o primeiro bloco de itens.
  // Vamos dizer que ele começa na linha 10.
  // Vamos iterar até achar a linha de SUB-TOT (que no log anterior estava na 68).
  // E vamos deletar quase todas as linhas desse bloco, exceto as duas primeiras (10 e 11).

  let firstSubTotRow = -1;
  let rowsToDelete = [];
  
  for (let i = 10; i <= 100; i++) {
    const row = worksheet.getRow(i);
    const col3Text = row.getCell(3).text;
    
    if (col3Text && col3Text.includes('SUB-TOT')) {
      firstSubTotRow = i;
      break;
    }
    
    // Se for uma linha que não vamos usar (ex: linha 12 até o SUB-TOT)
    if (i > 11) {
      // Guardar para deletar depois (deve ser de trás pra frente)
      rowsToDelete.push(i);
    } else {
      // Preencher quantidade nas linhas 10 e 11
      console.log(`Preenchendo quantidade na linha ${i}`);
      row.getCell(4).value = 10; // QTD
      row.getCell(7).value = 500; // Valor Total Fixo simulado
    }
  }

  // Deletar de trás pra frente
  rowsToDelete.reverse();
  console.log(`\nDeletando ${rowsToDelete.length} linhas de trás pra frente: [${rowsToDelete.join(', ')}]...`);
  
  for (const r of rowsToDelete) {
    worksheet.spliceRows(r, 1);
  }

  // Agora a linha de sub-tot que estava na posição 'firstSubTotRow' subiu.
  // Subiu a quantidade exata de linhas que deletamos.
  const newSubTotRow = firstSubTotRow - rowsToDelete.length;
  
  console.log(`\nLinha de SUB-TOT foi da ${firstSubTotRow} para a ${newSubTotRow}`);
  
  // Injetar a nova fórmula do subtotal
  // Os itens que sobraram são a linha 10 e 11.
  const endItemRow = newSubTotRow - 1;
  const newFormula = `SUM(G10:G${endItemRow})`;
  
  console.log(`Injetando fórmula do subtotal: ${newFormula}`);
  worksheet.getRow(newSubTotRow).getCell(7).value = { formula: newFormula };
  
  // Salvar a planilha
  const outPath = path.join(__dirname, 'resultado_teste.xlsx');
  await workbook.xlsx.writeFile(outPath);
  console.log(`\nPlanilha gerada e salva com sucesso em: ${outPath}`);
}

run().catch(console.error);
