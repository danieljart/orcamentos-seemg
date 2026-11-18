/**
 * Exporta o ajuste na PLANILHA DE AJUSTES padrão SEE/MG.
 *
 * O modelo oficial (public/template_ajuste_<base>.xlsx) traz todos os ~650
 * serviços da tabela, três linhas cada. A planilha entregue à DORE leva só os
 * serviços do contrato e os acrescidos, com o cabeçalho, as categorias, os
 * subtotais e o rodapé do modelo. Então as linhas usadas são copiadas, com
 * estilo, altura e mesclagens, para uma planilha nova, e as fórmulas são
 * escritas apontando para as posições novas (com o resultado já calculado,
 * para abrir certo mesmo onde o Excel não recalcula).
 */
import * as ExcelJS from 'exceljs';
import type { Workbook } from '../services/db';
import type { PriceBase } from './catalog';
import { growRowsToFitContent } from './xlsx';
import {
  calcTotais, qtyOf, unitPrice, isNovo, tipoInfo, round2, limitePercentual,
} from './ajuste';
import type { AjusteData, AjusteItem } from './ajuste';

// O bundle do navegador expõe Workbook direto; o ESM do Node (testes) o põe em default.
const XL: typeof ExcelJS = ((ExcelJS as any).Workbook ? ExcelJS : (ExcelJS as any).default) as typeof ExcelJS;

export const ajusteTemplatePath = (base: PriceBase) => `/template_ajuste_${base}.xlsx`;

const LAST_COL = 21; // U
const colLetter = (c: number) => String.fromCharCode(64 + c);
const text = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as any;
    if (Array.isArray(o.richText)) return o.richText.map((r: any) => r.text).join('');
    if ('result' in o) return o.result == null ? '' : String(o.result);
    if ('text' in o) return String(o.text);
    return '';
  }
  return String(v);
};
const upper = (v: unknown) => text(v).toUpperCase();
const clone = <T,>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));

type F = { formula: string; result: number };
const f = (formula: string, result: number): F => ({ formula, result: Number.isFinite(result) ? result : 0 });

interface OutRow {
  src: number;
  /** Linha de item: recebe os valores do serviço. */
  item?: AjusteItem;
  /** Linha de subtotal da categoria. */
  subtotalOf?: string;
}

interface ExportInput {
  workbook: Workbook;
  data: AjusteData;
  base: PriceBase;
}

export async function buildAjusteXlsx({ workbook, data, base }: ExportInput): Promise<Blob> {
  const response = await fetch(ajusteTemplatePath(base));
  if (!response.ok) throw new Error('Modelo da planilha de ajuste não encontrado.');
  const srcWb = new XL.Workbook();
  await srcWb.xlsx.load(await response.arrayBuffer());
  const srcWs = srcWb.worksheets[0];
  if (!srcWs) throw new Error('O modelo da planilha de ajuste está vazio.');

  const t = calcTotais(data);
  const fator = t.fator.valor;
  const info = tipoInfo(data.tipo);

  // ---------------------------------------------------------------------
  // 1. Lê a estrutura do modelo
  // ---------------------------------------------------------------------
  let rowTotalCusto = 0, rowBdiProj = 0, rowBdiObra = 0, rowTotalGeral = 0, rowTech = 0;
  const quadro = new Map<string, number>();
  const aditivos: number[] = [];
  srcWs.eachRow((row, r) => {
    const a = upper(row.getCell(1).value);
    const b = upper(row.getCell(2).value);
    const c = upper(row.getCell(3).value);
    const d = upper(row.getCell(4).value);
    if (!rowTotalCusto && c.includes('TOTAL CUSTO')) rowTotalCusto = r;
    if (!rowBdiProj && d.includes('BDI PROJETO')) rowBdiProj = r;
    if (!rowBdiObra && d.includes('BDI OBRA')) rowBdiObra = r;
    if (!rowTotalGeral && c.includes('TOTAL GERAL')) rowTotalGeral = r;
    if (!rowTech && a.includes('NOME DO TÉCNICO')) rowTech = r;
    if (b.startsWith('NUMERO DO TERMO')) quadro.set('tc', r);
    if (b.startsWith('TIPO DE SERVIÇO')) quadro.set('tipo', r);
    if (b.startsWith('VALOR DO TERMO')) quadro.set('valorTC', r);
    if (b.startsWith('VALOR TOTAL CONTRATADO')) quadro.set('contratado', r);
    if (b.startsWith('DIFERENÇA ENTRE')) quadro.set('diferenca', r);
    if (b.startsWith('FATOR DE DESCONTO')) quadro.set('fator', r);
    if (b.startsWith('LIMITE PARA AJUSTAMENTO')) quadro.set('limite', r);
    if (/^AJUSTE \/ ADITIVO \d+/.test(b)) aditivos.push(r);
    if (b.startsWith('AJUSTE / ADITIVO ACUMULADO')) quadro.set('acumulado', r);
  });
  if (!rowTotalCusto || !rowTotalGeral) throw new Error('Não encontrei o rodapé (TOTAL CUSTO / TOTAL GERAL) no modelo.');

  /** Linha do modelo de cada código de serviço, e a estrutura de categorias. */
  const codeRow = new Map<string, number>();
  type Cat = { code: string; header: number; subtotal: number; subgroups: Map<string, number> };
  const cats: Cat[] = [];
  let cur: Cat | null = null;
  for (let r = 6; r < rowTotalCusto; r++) {
    const row = srcWs.getRow(r);
    const a = text(row.getCell(1).value).trim();
    const c = upper(row.getCell(3).value);
    if (/^\d{2}0000$/.test(a)) {
      cur = { code: a, header: r, subtotal: 0, subgroups: new Map() };
      cats.push(cur);
    } else if (/^\d{4}00$/.test(a) && cur) {
      cur.subgroups.set(a, r);
    } else if (/^\d{6}$/.test(a)) {
      if (!codeRow.has(a)) codeRow.set(a, r);
    }
    if (cur && !cur.subtotal && (c.includes('SUBTOTAL') || c.includes('SUB-TOTAL'))) cur.subtotal = r;
  }
  const outros = cats.find(c => c.code === '260000');
  const outrosSlot = codeRow.get('260001') || (outros ? outros.header + 1 : 0);

  // ---------------------------------------------------------------------
  // 2. Planeja as linhas de saída
  // ---------------------------------------------------------------------
  const usados = data.items.filter(it => it.contractQty > 0 || qtyOf(it.addQty) > 0 || qtyOf(it.supQty) > 0);
  // Fica na linha própria do modelo só o serviço SEE que existe nele; o resto
  // (SETOP, SUDECAP, serviços avulsos) vai para o bloco OUTROS, como no orçamento.
  const naLinhaPropria = (it: AjusteItem) => it.source === 'SEE' && codeRow.has(it.code) && !it.code.startsWith('2600');
  const emOutros = usados.filter(it => !naLinhaPropria(it));

  const plan: OutRow[] = [];
  for (let r = 1; r <= 5; r++) plan.push({ src: r });
  for (const cat of cats) {
    const prefix = cat.code.slice(0, 2);
    const doGrupo = cat.code === '260000'
      ? emOutros
      : usados.filter(it => naLinhaPropria(it) && it.code.startsWith(prefix)).sort((x, y) => codeRow.get(x.code)! - codeRow.get(y.code)!);
    if (doGrupo.length === 0) continue;
    plan.push({ src: cat.header });
    let lastSub = '';
    for (const it of doGrupo) {
      if (cat.code !== '260000') {
        const sub = it.code.slice(0, 4) + '00';
        const subRow = cat.subgroups.get(sub);
        if (subRow && sub !== lastSub) plan.push({ src: subRow });
        lastSub = sub;
      }
      plan.push({ src: cat.code === '260000' ? outrosSlot : codeRow.get(it.code)!, item: it });
    }
    if (cat.subtotal) plan.push({ src: cat.subtotal, subtotalOf: cat.code });
  }
  const footerStart = plan.length + 1;
  for (let r = rowTotalCusto; r <= srcWs.rowCount; r++) plan.push({ src: r });

  // Mapa linha do modelo → linha nova, para o rodapé e as mesclagens.
  const oldToNew = new Map<number, number>();
  plan.forEach((p, i) => { if (!p.item && !oldToNew.has(p.src)) oldToNew.set(p.src, i + 1); });
  const nr = (old: number) => oldToNew.get(old) || 0;

  // ---------------------------------------------------------------------
  // 3. Planilha nova com o visual do modelo
  // ---------------------------------------------------------------------
  const wb = new XL.Workbook();
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet(srcWs.name || 'MEDIÇÃO', {
    properties: clone(srcWs.properties),
    pageSetup: { ...clone(srcWs.pageSetup), printArea: undefined },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5, topLeftCell: 'A6', showGridLines: false, zoomScale: 80 }],
  });
  for (let c = 1; c <= LAST_COL; c++) {
    const w = srcWs.getColumn(c).width;
    if (w) ws.getColumn(c).width = w;
  }

  plan.forEach((p, i) => {
    const r = i + 1;
    const src = srcWs.getRow(p.src);
    const dst = ws.getRow(r);
    if (src.height) dst.height = src.height;
    for (let c = 1; c <= LAST_COL; c++) {
      const sc = src.getCell(c);
      const dc = dst.getCell(c);
      if (sc.style) dc.style = clone(sc.style);
      const v = sc.value as any;
      if (p.item) continue; // linhas de item são preenchidas abaixo
      if (v && typeof v === 'object' && 'formula' in v) continue; // fórmulas reescritas abaixo
      if (v !== null && v !== undefined) dc.value = clone(v);
    }
  });

  // Mesclagens do modelo que continuam inteiras no recorte.
  for (const range of (srcWs.model as any).merges as string[] || []) {
    const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!m) continue;
    const r1 = Number(m[2]), r2 = Number(m[4]);
    const n1 = nr(r1), n2 = nr(r2);
    if (!n1 || !n2 || n2 - n1 !== r2 - r1) continue;
    try { ws.mergeCells(`${m[1]}${n1}:${m[3]}${n2}`); } catch { /* sobreposição: mantém a primeira */ }
  }

  // Brasão do cabeçalho.
  const media = (srcWb as any).media as { buffer: ArrayBuffer; extension: string }[] | undefined;
  const images = srcWs.getImages ? srcWs.getImages() : [];
  if (media && media.length && images.length) {
    const ids = media.map(m => wb.addImage({ buffer: m.buffer as any, extension: m.extension as any }));
    for (const img of images as any[]) {
      const id = ids[Number(img.imageId)] ?? ids[0];
      const tl = { col: img.range?.tl?.col ?? 0, row: img.range?.tl?.row ?? 0 };
      if (img.range?.ext) ws.addImage(id, { tl, ext: { width: img.range.ext.width, height: img.range.ext.height }, editAs: 'oneCell' } as any);
      else if (img.range?.br) ws.addImage(id, { tl, br: { col: img.range.br.col, row: img.range.br.row }, editAs: 'oneCell' } as any);
    }
  }

  // ---------------------------------------------------------------------
  // 4. Cabeçalho
  // ---------------------------------------------------------------------
  const titulo = ws.getCell('B1');
  titulo.value = upper(titulo.value).includes('PLANILHA DE AJUSTE')
    ? text(titulo.value).replace(/PLANILHA DE AJUSTE\s*$/i, info.tituloPlanilha + ' ')
    : titulo.value;

  const header: [RegExp, string][] = [
    [/^S\.?R\.?E\.?:/, workbook.sre || ''],
    [/^MUNIC[IÍ]PIO:/, workbook.municipio || ''],
    [/^ESCOLA( ESTADUAL)?:/, workbook.escola || ''],
    [/^CODESC:/, workbook.cod_escola || ''],
    [/^(TC \/ PAC Nº|TERMO DE COMPROMISSO Nº):/, data.tc || ''],
    [/^SERVI[ÇC]OS:/, workbook.servicos || ''],
    [/^AJUSTE Nº:/, data.numero || ''],
  ];
  for (const r of [2, 3]) {
    const row = ws.getRow(r);
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = row.getCell(c);
      if (cell.isMerged && cell.master !== cell) continue;
      const label = text(cell.value).trim();
      if (!label) continue;
      if (/^OBJETO:/i.test(label)) {
        const alvo = row.getCell(c + 1);
        alvo.value = data.objeto;
        alvo.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Reforma,Obras e serviços de engenharia"'] };
        continue;
      }
      const hit = header.find(([re]) => re.test(label.toUpperCase()));
      if (hit) cell.value = `${label.replace(/\s+$/, '')} ${hit[1]}`.trim();
    }
  }

  // ---------------------------------------------------------------------
  // 5. Serviços e subtotais
  // ---------------------------------------------------------------------
  let outrosSeq = 0;
  const catRows = new Map<string, number[]>();
  let catAtual = '';
  const subtotalRow = new Map<string, number>();
  plan.forEach((p, i) => {
    const r = i + 1;
    const srcA = text(srcWs.getRow(p.src).getCell(1).value).trim();
    if (!p.item && /^\d{2}0000$/.test(srcA)) catAtual = srcA;
    if (p.subtotalOf) subtotalRow.set(p.subtotalOf, r);
    if (!p.item) return;
    const it = p.item;
    (catRows.get(catAtual) || catRows.set(catAtual, []).get(catAtual)!).push(r);

    const row = ws.getRow(r);
    const preco = unitPrice(it, fator);
    const add = qtyOf(it.addQty);
    const sup = qtyOf(it.supQty);
    const D = it.contractQty, E = it.contractPrice;

    if (catAtual === '260000') {
      outrosSeq++;
      const slot = `2600${String(outrosSeq).padStart(2, '0')}`;
      // Como nas planilhas validadas: "260001 (ED-49664)" para serviço de outra base.
      row.getCell(1).value = it.code.startsWith('2600') ? it.code : `${slot} (${it.code})`;
      row.getCell(2).value = it.description;
      row.getCell(3).value = it.unit;
    } else {
      // Serviço SEE: código, descrição e unidade do próprio modelo.
      const src = srcWs.getRow(p.src);
      for (const c of [1, 2, 3]) row.getCell(c).value = clone(src.getCell(c).value);
    }

    if (D > 0) row.getCell(4).value = D;
    if (E > 0) row.getCell(5).value = E;
    row.getCell(6).value = f(`D${r}*E${r}`, D * E);
    if (add > 0) { row.getCell(7).value = add; row.getCell(8).value = preco; }
    row.getCell(9).value = f(`H${r}*G${r}`, add * (add > 0 ? preco : 0));
    if (sup > 0) { row.getCell(10).value = sup; row.getCell(11).value = preco; }
    row.getCell(12).value = f(`K${r}*J${r}`, sup * (sup > 0 ? preco : 0));
    const M = D + add - sup;
    row.getCell(13).value = f(`D${r}+G${r}-J${r}`, M);
    // N: preço do contrato quando há; senão o preço do acréscimo (observações 3 e 4).
    if (!isNovo(it) && it.priceOverride == null) row.getCell(14).value = f(`E${r}`, E);
    else if (add > 0) row.getCell(14).value = f(`H${r}`, preco);
    else row.getCell(14).value = preco;
    row.getCell(15).value = f(`M${r}*N${r}`, M * preco);

    const memoria = [it.location, it.memory].filter(Boolean).join(': ');
    if (memoria) {
      row.getCell(16).value = memoria;
      try { ws.mergeCells(`P${r}:U${r}`); } catch { /* já mesclada */ }
      row.getCell(16).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    }
  });

  const sumCol = (col: string, rows: number[], pick: (it: AjusteItem) => number) => {
    if (rows.length === 0) return f('0', 0);
    const first = Math.min(...rows), last = Math.max(...rows);
    const total = plan.slice(first - 1, last).reduce((s, p) => s + (p.item ? pick(p.item) : 0), 0);
    return f(`SUM(${col}${first}:${col}${last})`, total);
  };
  const vC = (it: AjusteItem) => it.contractQty * it.contractPrice;
  const vA = (it: AjusteItem) => qtyOf(it.addQty) * unitPrice(it, fator);
  const vS = (it: AjusteItem) => qtyOf(it.supQty) * unitPrice(it, fator);
  const vR = (it: AjusteItem) => (it.contractQty + qtyOf(it.addQty) - qtyOf(it.supQty)) * unitPrice(it, fator);
  const COLS: [string, (it: AjusteItem) => number][] = [['F', vC], ['I', vA], ['L', vS], ['O', vR]];

  const subtotais: { code: string; row: number; vals: Record<string, number> }[] = [];
  for (const [code, r] of subtotalRow) {
    const rows = catRows.get(code) || [];
    const vals: Record<string, number> = {};
    for (const [col, pick] of COLS) {
      const cell = sumCol(col, rows, pick);
      ws.getCell(`${col}${r}`).value = cell;
      vals[col] = cell.result;
    }
    subtotais.push({ code, row: r, vals });
  }

  // ---------------------------------------------------------------------
  // 6. Totais, BDI do contrato e total geral
  // ---------------------------------------------------------------------
  const tc = nr(rowTotalCusto), tg = nr(rowTotalGeral), bp = nr(rowBdiProj), bo = nr(rowBdiObra);
  const proj = subtotais.find(s => s.code === '240000');
  const totalPor = (col: string) => subtotais.reduce((s, x) => s + x.vals[col], 0);
  const projPor = (col: string) => (proj ? proj.vals[col] : 0);
  for (const [col] of COLS) {
    const custo = totalPor(col);
    ws.getCell(`${col}${tc}`).value = f(subtotais.length ? subtotais.map(s => `${col}${s.row}`).join('+') : '0', custo);
    const bdiP = projPor(col) * data.bdiProjeto;
    const bdiO = (custo - projPor(col)) * data.bdiObra;
    if (bp) ws.getCell(`${col}${bp}`).value = f(proj ? `$C$${bp}*${col}${proj.row}` : `$C$${bp}*0`, bdiP);
    if (bo) ws.getCell(`${col}${bo}`).value = f(proj ? `(${col}${tc}-${col}${proj.row})*$C$${bo}` : `${col}${tc}*$C$${bo}`, bdiO);
    ws.getCell(`${col}${tg}`).value = f(`SUM(${col}${tc}:${col}${bo || bp || tc})`, custo + bdiP + bdiO);
    ws.getCell(`${col}4`).value = f(`${col}${tg}`, custo + bdiP + bdiO);
  }
  if (bp) {
    ws.getCell(`C${bp}`).value = data.bdiProjeto;
    for (const col of ['G', 'J', 'M']) ws.getCell(`${col}${bp}`).value = f(`$C$${bp}`, data.bdiProjeto);
  }
  if (bo) {
    ws.getCell(`C${bo}`).value = data.bdiObra;
    for (const col of ['G', 'J', 'M']) ws.getCell(`${col}${bo}`).value = f(`$C$${bo}`, data.bdiObra);
  }

  // ---------------------------------------------------------------------
  // 7. Responsável técnico
  // ---------------------------------------------------------------------
  const tech = nr(rowTech);
  if (tech) {
    const dataBr = workbook.data_elaboracao
      ? new Date(`${workbook.data_elaboracao}T00:00:00`).toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR');
    const row = ws.getRow(tech);
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = row.getCell(c);
      if (cell.isMerged && cell.master !== cell) continue;
      const label = text(cell.value);
      if (/^Nome do técnico/i.test(label)) cell.value = `Nome do técnico responsável pela elaboração da planilha: ${(workbook.engenheiro || '').toUpperCase()}`;
      else if (/^CREA/i.test(label)) cell.value = `CREA/CAU/CFT: ${workbook.crea || ''}`;
      else if (/^Data da elabora/i.test(label)) cell.value = `Data da elaboração: ${dataBr}`;
    }
  }

  // ---------------------------------------------------------------------
  // 8. Quadro do fator de desconto e dos ajustes acumulados
  // ---------------------------------------------------------------------
  const q = (k: string) => nr(quadro.get(k) || 0);
  const contratado = data.valorContratado > 0 ? data.valorContratado : round2(t.contratado.geral);
  if (q('tc')) ws.getCell(`C${q('tc')}`).value = data.tc || '';
  if (q('tipo')) ws.getCell(`C${q('tipo')}`).value = workbook.servicos || '';
  if (q('valorTC')) ws.getCell(`C${q('valorTC')}`).value = data.valorTC || 0;
  if (q('contratado')) ws.getCell(`C${q('contratado')}`).value = contratado;
  if (q('diferenca') && q('valorTC') && q('contratado')) {
    ws.getCell(`C${q('diferenca')}`).value = f(`C${q('valorTC')}-C${q('contratado')}`, (data.valorTC || 0) - contratado);
  }
  if (q('fator') && q('valorTC') && q('contratado')) {
    ws.getCell(`C${q('fator')}`).value = f(`IF(C${q('valorTC')}=0,0,C${q('contratado')}/C${q('valorTC')})`, data.valorTC ? contratado / data.valorTC : 0);
  }
  if (q('limite') && q('contratado')) {
    const lim = limitePercentual(data);
    // O modelo compara B3 com "Obra de engenharia", que não é um dos valores da
    // própria lista (Reforma / Obras e serviços de engenharia) e devolve 0.
    const objCell = 'B3';
    ws.getCell(`E${q('limite')}`).value = f(`IF(UPPER(${objCell})="REFORMA",0.5,0.25)`, lim);
    ws.getCell(`C${q('limite')}`).value = f(`C${q('contratado')}*E${q('limite')}`, contratado * lim);
  }

  const aditRows = aditivos.map(nr).filter(Boolean).sort((a, b) => a - b);
  if (aditRows.length && q('contratado')) {
    const percentuais = [...data.ajustesAnteriores];
    const atual = contratado > 0 ? t.acrescido.geral / contratado : 0;
    const n = parseInt(String(data.numero).replace(/\D/g, ''), 10);
    const idx = Number.isFinite(n) && n >= 1 ? n - 1 : percentuais.length;
    while (percentuais.length < idx) percentuais.push(0);
    percentuais[idx] = atual;
    aditRows.forEach((r, i) => {
      const p = percentuais[i] || 0;
      ws.getCell(`C${r}`).value = p;
      ws.getCell(`E${r}`).value = f(`C${r}*$C$${q('contratado')}`, p * contratado);
    });
    if (q('acumulado')) {
      const soma = percentuais.slice(0, aditRows.length).reduce((s, p) => s + (p || 0), 0);
      const first = aditRows[0], last = aditRows[aditRows.length - 1];
      ws.getCell(`C${q('acumulado')}`).value = f(`SUM(C${first}:C${last})`, soma);
      ws.getCell(`E${q('acumulado')}`).value = f(`SUM(E${first}:E${last})`, soma * contratado);
    }
  }

  // Fórmulas restantes do rodapé que não foram reescritas acima: aponta para as
  // linhas novas, ou zera se a linha de origem foi retirada.
  for (let i = footerStart - 1; i < plan.length; i++) {
    const r = i + 1;
    const src = srcWs.getRow(plan[i].src);
    for (let c = 1; c <= LAST_COL; c++) {
      const dc = ws.getRow(r).getCell(c);
      if (dc.value !== null && dc.value !== undefined) continue;
      const sv = src.getCell(c).value as any;
      if (!sv || typeof sv !== 'object' || !('formula' in sv)) continue;
      const formula = String(sv.formula).replace(/(\$?)([A-Z]{1,2})(\$?)(\d+)/g, (_m, d1, col, d2, row) => {
        const n = nr(Number(row));
        return n ? `${d1}${col}${d2}${n}` : '0';
      });
      dc.value = { formula, result: typeof sv.result === 'number' ? sv.result : undefined } as any;
    }
  }

  ws.pageSetup.printArea = `A1:${colLetter(LAST_COL)}${plan.length}`;
  growRowsToFitContent(ws);

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export const nomeArquivoAjuste = (workbook: Workbook, data: AjusteData) => {
  const info = tipoInfo(data.tipo);
  const escola = (workbook.escola || 'ESCOLA').replace(/[\\/:*?"<>|]/g, '').trim();
  const prefixo = data.tipo === 'ajuste' ? `PLANILHA DE AJUSTE ${data.numero || ''}`.trim() : info.tituloPlanilha;
  return `${prefixo} - ${escola}.xlsx`;
};
