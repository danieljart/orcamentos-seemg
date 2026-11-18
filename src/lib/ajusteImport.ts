/**
 * Leitura da planilha de contrato para o módulo Ajustes.
 *
 * Aceita dois formatos:
 * - PLANILHA DE SERVIÇOS SEE (contrato homologado, aba Plan1): código em A,
 *   descrição em B, unidade em C, quantidade em D e preço unitário em E.
 * - PLANILHA DE AJUSTES (ajuste anterior): CONTRATADO em D/E e REAL A
 *   EXECUTAR em M/N. Para o ajuste seguinte o usuário escolhe qual dos dois
 *   vira o "contratado".
 */
import * as ExcelJS from 'exceljs';
import { isSetopCode, isSudecapCode } from './catalog';
import { cellText, sanitizeUnit } from './xlsx';
import { newId } from './ajuste';
import type { AjusteFonte, AjusteItem } from './ajuste';

const XL: typeof ExcelJS = ((ExcelJS as any).Workbook ? ExcelJS : (ExcelJS as any).default) as typeof ExcelJS;

export type FormatoPlanilha = 'servicos' | 'ajuste';

export interface ContratoLido {
  formato: FormatoPlanilha;
  /** Linhas com o contratado do arquivo (colunas D/E). */
  itens: AjusteItem[];
  /** Só na planilha de ajuste: o REAL A EXECUTAR (colunas M/N) como contratado. */
  itensReal?: AjusteItem[];
  bdiObra?: number;
  bdiProjeto?: number;
  /** TOTAL GERAL da coluna do contratado, quando o arquivo traz o resultado. */
  totalGeral?: number;
  totalGeralReal?: number;
  tc?: string;
  valorTC?: number;
  /** VALOR TOTAL CONTRATADO do quadro do fator de desconto. */
  valorContratado?: number;
  /** Percentuais dos AJUSTE / ADITIVO já preenchidos no quadro. */
  percentuais?: number[];
  numeroAjuste?: string;
}

const numero = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const o = v as any;
    if ('result' in o) return numero(o.result);
    if (Array.isArray(o.richText)) return numero(cellText(o));
    return 0;
  }
  const s = String(v).replace(/[R$\s]/g, '');
  if (!s) return 0;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Reconhece o código do serviço. Nas planilhas validadas, serviços de outra
 * base aparecem como "260001 (ED-49664)": o código que interessa é o de dentro.
 */
const lerCodigo = (raw: string): { code: string; source: AjusteFonte } | null => {
  const s = raw.trim();
  const dentro = s.match(/\(([^)]+)\)/);
  const candidato = dentro ? dentro[1].trim() : s;
  if (isSetopCode(candidato)) return { code: candidato, source: 'SETOP' };
  if (isSudecapCode(candidato)) return { code: candidato, source: 'SUDECAP' };
  if (/^2600\d{2}/.test(s)) return { code: s.slice(0, 6), source: 'MANUAL' };
  if (/^\d{6}$/.test(s) && !s.endsWith('0000') && !/^\d{4}00$/.test(s)) return { code: s, source: 'SEE' };
  return null;
};

export async function lerPlanilhaContrato(file: File): Promise<ContratoLido> {
  if (/\.xls$/i.test(file.name)) {
    throw new Error('Arquivos .xls (Excel 97-2003) não são lidos no navegador. Abra no Excel e salve como .xlsx.');
  }
  const wb = new XL.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  // A aba certa é a que tem o cabeçalho ITEM / DESCRIÇÃO nas primeiras linhas.
  let ws: ExcelJS.Worksheet | undefined;
  let formato: FormatoPlanilha = 'servicos';
  for (const sheet of wb.worksheets) {
    let achou = false;
    for (let r = 1; r <= 12 && !achou; r++) {
      const row = sheet.getRow(r);
      const linha = [1, 2, 3, 4, 7, 10, 13].map(c => cellText(row.getCell(c).value).toUpperCase()).join('|');
      if (linha.includes('ITEM') && linha.includes('DESCRI')) {
        achou = true;
        formato = linha.includes('ACRESCIDO') || linha.includes('SUPRIMIDO') ? 'ajuste' : 'servicos';
      }
    }
    if (achou) { ws = sheet; break; }
  }
  if (!ws) ws = wb.getWorksheet('Plan1') || wb.worksheets[0];
  if (!ws) throw new Error('A planilha está vazia.');

  const itens: AjusteItem[] = [];
  const itensReal: AjusteItem[] = [];
  let bdiObra: number | undefined, bdiProjeto: number | undefined;
  let totalGeral: number | undefined, totalGeralReal: number | undefined;
  let tc: string | undefined, valorTC: number | undefined, numeroAjuste: string | undefined;
  let valorContratado: number | undefined;
  const percentuais: number[] = [];
  let rodape = false;

  ws.eachRow((row, r) => {
    const a = cellText(row.getCell(1).value).trim();
    const b = cellText(row.getCell(2).value).trim();
    const c = cellText(row.getCell(3).value).trim();
    const d = cellText(row.getCell(4).value).toUpperCase();
    const bu = b.toUpperCase();
    const cu = c.toUpperCase();

    if (r <= 3) {
      for (let col = 1; col <= 21; col++) {
        const t = cellText(row.getCell(col).value);
        const mTc = t.match(/(?:TC \/ PAC Nº|TERMO DE COMPROMISSO Nº)\s*:?\s*(.+)/i);
        if (mTc && mTc[1].trim()) tc = mTc[1].trim();
        const mAj = t.match(/AJUSTE Nº\s*:?\s*(\S+)/i);
        if (mAj) numeroAjuste = mAj[1].trim();
      }
    }

    if (cu.includes('TOTAL CUSTO')) rodape = true;
    if (d.includes('BDI PROJETO')) bdiProjeto = numero(row.getCell(3).value) || bdiProjeto;
    if (d.includes('BDI OBRA')) bdiObra = numero(row.getCell(3).value) || bdiObra;
    if (cu.includes('TOTAL GERAL')) {
      totalGeral = numero(row.getCell(6).value) || totalGeral;
      if (formato === 'ajuste') totalGeralReal = numero(row.getCell(15).value) || totalGeralReal;
    }
    if (bu.startsWith('NUMERO DO TERMO') && !tc) tc = cellText(row.getCell(3).value).trim() || tc;
    if (bu.startsWith('VALOR DO TERMO')) valorTC = numero(row.getCell(3).value) || valorTC;
    if (bu.startsWith('VALOR TOTAL CONTRATADO')) valorContratado = numero(row.getCell(3).value) || valorContratado;
    if (/^AJUSTE \/ ADITIVO \d+/.test(bu)) {
      const p = numero(row.getCell(3).value);
      if (p > 0) percentuais.push(p);
    }
    if (rodape) return;

    const cod = lerCodigo(a);
    if (!cod) return;
    const unit = sanitizeUnit(c) || '';
    const base = {
      code: cod.code,
      description: b,
      unit,
      source: cod.source,
      refPrice: 0,
      addQty: '',
      supQty: '',
      memory: '',
      location: '',
    };

    if (formato === 'ajuste') {
      const qD = numero(row.getCell(4).value);
      const pE = numero(row.getCell(5).value);
      const memoria = cellText(row.getCell(16).value).trim();
      if (qD > 0) itens.push({ ...base, id: newId(), contractQty: qD, contractPrice: pE, memory: memoria });
      const qM = numero(row.getCell(13).value);
      const pN = numero(row.getCell(14).value) || pE || numero(row.getCell(8).value);
      if (qM > 0) itensReal.push({ ...base, id: newId(), contractQty: qM, contractPrice: pN, memory: memoria });
    } else {
      const q = numero(row.getCell(4).value);
      const p = numero(row.getCell(5).value);
      if (q > 0) {
        itens.push({
          ...base,
          id: newId(),
          contractQty: q,
          contractPrice: p,
          memory: cellText(row.getCell(7).value).trim(),
          location: cellText(row.getCell(9).value).trim(),
        });
      }
    }
  });

  if (itens.length === 0 && itensReal.length === 0) {
    throw new Error('Não encontrei serviços com quantidade na planilha. Confira se é a planilha de contrato ou de ajuste no modelo SEE.');
  }

  return {
    formato,
    itens: juntarRepetidos(itens),
    itensReal: formato === 'ajuste' ? juntarRepetidos(itensReal) : undefined,
    bdiObra, bdiProjeto, totalGeral, totalGeralReal, tc, valorTC, numeroAjuste,
    valorContratado, percentuais,
  };
}

/** Um mesmo código em duas linhas (ocorrências) vira uma linha só, somando. */
function juntarRepetidos(itens: AjusteItem[]): AjusteItem[] {
  const porCodigo = new Map<string, AjusteItem>();
  for (const it of itens) {
    const key = `${it.code}|${it.contractPrice}`;
    const atual = porCodigo.get(key);
    if (!atual) { porCodigo.set(key, { ...it }); continue; }
    atual.contractQty = Math.round((atual.contractQty + it.contractQty) * 10000) / 10000;
    atual.memory = [atual.memory, it.memory].filter(Boolean).join(' + ');
    atual.location = [atual.location, it.location].filter(Boolean).join(' / ');
  }
  return [...porCodigo.values()];
}
