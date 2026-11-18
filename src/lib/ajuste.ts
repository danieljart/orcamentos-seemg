/**
 * Módulo Ajustes: modelo de dados, regras de cada tipo de solicitação,
 * cálculo dos totais da planilha de ajuste e a "marretada" (arremate fino).
 *
 * A planilha de ajuste da SEE tem quatro blocos de colunas por serviço:
 * CONTRATADO (D/E/F), ACRESCIDO (G/H/I), SUPRIMIDO (J/K/L) e REAL A EXECUTAR
 * (M/N/O), com REAL = CONTRATADO + ACRESCIDO − SUPRIMIDO. Tudo aqui segue essa
 * mesma conta, para que o que aparece na tela seja o que o Excel recalcula.
 */
import { evaluateMath } from './math';
import type { CatalogSource } from './catalog';

// ---------------------------------------------------------------------------
// Tipos de solicitação
// ---------------------------------------------------------------------------

export type AjusteTipo = 'ajuste' | 'alteracao_projeto' | 'saldo_complementar' | 'saldo_nova_cotacao';

/**
 * O que o valor final da planilha precisa atingir.
 * - equilibrio: total acrescido = total suprimido (o valor do contrato não muda)
 * - recurso: total acrescido = recurso disponível (em conta + a liberar + aditivo)
 */
export type AjusteAlvo = 'equilibrio' | 'recurso';

export interface AjusteTipoInfo {
  id: AjusteTipo;
  titulo: string;
  /** Rótulo curto para etiquetas e filtros. */
  curto: string;
  resumo: string;
  alvo: AjusteAlvo;
  permiteSupressao: boolean;
  /** Título que vai na linha 1 da planilha exportada. */
  tituloPlanilha: string;
  /** Assunto do e-mail, no padrão DORE. */
  assunto: string;
  email: string[];
  sei: string[];
  regras: string[];
}

export const EMAIL_DORE = 'dore.ajuste@educacao.mg.gov.br';
export const UNIDADE_SEI = 'SEE/DORE – Ajustes e Saldos';

export const AJUSTE_TIPOS: AjusteTipoInfo[] = [
  {
    id: 'ajuste',
    titulo: 'Ajuste de Obra',
    curto: 'Ajuste',
    resumo: 'Supressão de serviços superestimados ou desnecessários e acréscimo de serviços subestimados ou não previstos, sem alterar o valor do contrato.',
    alvo: 'equilibrio',
    permiteSupressao: true,
    tituloPlanilha: 'PLANILHA DE AJUSTE',
    assunto: 'AJUSTE Nº {numero} – {sre} - {escola} – TERMO DE COMPROMISSO ({tc})',
    email: [
      'Planilha de Serviços (Ajuste) em Excel conforme modelo padrão SEE/MG',
      'Projeto em DWG, no caso de alteração de projeto (situação atual autorizada no TC e situação pretendida)',
    ],
    sei: [
      'Planilha das Medições acumuladas (pdf)',
      'Relatório Técnico (pdf) + Justificativa (pdf) explicando as supressões e os acréscimos',
      'Ata do Colegiado (se houver alteração de meta e/ou projeto)',
      'Relatório fotográfico das áreas ajustadas',
      'Planilha(s) de Contrato homologada(s)',
      'Documentos complementares, se for o caso (sondagem, projetos, BO, laudo da Defesa Civil...)',
    ],
    regras: [
      'Total acrescido = total suprimido: o valor do contrato é preservado.',
      'Use o mesmo BDI da planilha de contrato.',
      'Valores unitários do contrato são mantidos em todas as colunas.',
      'Serviços novos usam o preço da SEE multiplicado pelo fator de desconto (contratado ÷ TC).',
      'Não é permitido ajuste em planilhão: uma planilha por meta do Termo de Compromisso.',
      'Os serviços ajustados só podem ser executados após validação do Órgão Central.',
    ],
  },
  {
    id: 'alteracao_projeto',
    titulo: 'Alteração de Projeto',
    curto: 'Alt. projeto',
    resumo: 'Mudança do projeto aprovado no atendimento inicial, sem ajuste de obra nem alteração de meta. A análise é feita sobre os projetos em DWG.',
    alvo: 'equilibrio',
    permiteSupressao: true,
    tituloPlanilha: 'PLANILHA DE AJUSTE - ALTERAÇÃO DE PROJETO',
    assunto: 'ALTERAÇÃO DE PROJETO – {sre} - {escola} – TERMO DE COMPROMISSO ({tc})',
    email: [
      'Projeto básico em DWG com a situação atual (validada no atendimento inicial) e a nova situação pretendida, com escalas, legendas e carimbo padrão DORE, formato A1',
    ],
    sei: [
      'Relatório Técnico (pdf) + Justificativa (pdf) explicando a necessidade da alteração',
      'Relatório fotográfico da situação atual e das áreas da alteração',
      'Ata do Colegiado',
      'Documentos complementares, se for o caso',
    ],
    regras: [
      'Não pode haver necessidade de ajuste de obra nem alteração de meta: o valor da planilha não muda.',
      'É vedado executar a alteração antes da validação do Órgão Central.',
    ],
  },
  {
    id: 'saldo_complementar',
    titulo: 'Saldo Complementar',
    curto: 'Saldo compl.',
    resumo: 'Acréscimo de serviços com recurso disponível em conta, a liberar ou por aditivo, sem alteração de meta.',
    alvo: 'recurso',
    permiteSupressao: false,
    tituloPlanilha: 'PLANILHA DE SALDO COMPLEMENTAR',
    assunto: 'SERVIÇOS COMPLEMENTARES – {sre} - {escola} – TERMO DE COMPROMISSO ({tc})',
    email: [
      'Planilha de Serviços (Saldo) em Excel, com o quadro do fator de desconto ao final',
      'Projeto em DWG, se houver alteração de projeto',
    ],
    sei: [
      'Extrato bancário atualizado',
      'Declaração da escola: saldo disponível após deduções, valor a ser liberado e valor do aditivo',
      'Planilha das Medições acumuladas (pdf)',
      'Relatório Técnico (pdf) + Justificativa (pdf) dos acréscimos',
      'Relatório fotográfico da situação atual e das áreas do saldo',
      'Documentos complementares, se for o caso',
    ],
    regras: [
      'Não pode haver alteração de meta.',
      'Percentuais cumulativos: até 25% do contrato em ampliação/construção e até 50% em reforma/acessibilidade (cobertura de rampa conta 25%).',
      'Mesmos critérios de preço do ajuste e mesmo BDI do contrato.',
      'Recurso: primeiro o disponível em conta, depois o previsto no TC a liberar, por fim o aditivo.',
      'A execução só pode ser autorizada após aprovação do Órgão Central e liberação financeira.',
    ],
  },
  {
    id: 'saldo_nova_cotacao',
    titulo: 'Saldo Nova Cotação – Obra Distratada',
    curto: 'Nova cotação',
    resumo: 'Uma planilha por meta com todos os serviços necessários para concluir o objeto após o distrato, dentro do recurso disponível.',
    alvo: 'recurso',
    permiteSupressao: true,
    tituloPlanilha: 'PLANILHA DE SALDO - NOVA COTAÇÃO - OBRA DISTRATADA',
    assunto: 'NOVA COTAÇÃO – OBRA DISTRATADA – {sre} - {escola} – TERMO DE COMPROMISSO ({tc})',
    email: [
      'Apenas a planilha em Excel com os serviços para a conclusão do objeto do Termo de Compromisso',
    ],
    sei: [
      'Extrato bancário atualizado',
      'Declaração da escola: saldo disponível, valor a ser liberado e valor do aditivo',
      'Planilha das Medições acumuladas (pdf)',
      'Distrato assinado por ambas as partes (ou AR de envio à empresa)',
      'Relatório Técnico de distrato (pdf) e Justificativa técnica assinada (pdf)',
      'Ata do Colegiado',
      'Relatório fotográfico da situação atual',
      'Projeto básico com a situação atual e a pretendida',
    ],
    regras: [
      'Avaliação técnica in loco pelo técnico da SRE.',
      'A planilha deve conter todos os serviços para cumprir o objeto, não só os da planilha original.',
      'Uma única planilha por meta (não separar saldo em conta, liberação e aditivo).',
      'Não pode haver alteração de meta nem de projeto.',
    ],
  },
];

export const tipoInfo = (tipo: AjusteTipo | undefined): AjusteTipoInfo =>
  AJUSTE_TIPOS.find(t => t.id === tipo) || AJUSTE_TIPOS[0];

export const SUBTIPOS_AJUSTE = [
  { value: 'sem_meta', label: 'Ajuste sem alteração de meta' },
  { value: 'com_meta', label: 'Ajuste com alteração/acréscimo de meta' },
  { value: 'sem_meta_projeto', label: 'Ajuste sem alteração de meta e com alteração de projeto' },
  { value: 'com_meta_projeto', label: 'Ajuste com alteração/acréscimo de meta e alteração de projeto' },
] as const;

export const REFERENTE_OPCOES = ['Reforma', 'Ampliação', 'Quadra', 'Acessibilidade', 'Outros'] as const;

/** Os dois valores aceitos pela lista suspensa OBJETO da planilha padrão. */
export const OBJETO_OPCOES = ['Reforma', 'Obras e serviços de engenharia'] as const;
export type AjusteObjeto = typeof OBJETO_OPCOES[number];

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

export type AjusteFonte = CatalogSource | 'MANUAL';

export interface AjusteItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  source: AjusteFonte;
  /** Quantidade e preço unitário da planilha de contrato. Zero quando o serviço é novo. */
  contractQty: number;
  contractPrice: number;
  /** Preço na base de referência (SEE, SETOP ou SUDECAP), usado para serviços novos. */
  refPrice: number;
  /** Expressões, como na memória de cálculo do orçamento ("3,5 x 2"). */
  addQty: string;
  supQty: string;
  memory: string;
  location: string;
  /** Fica de fora da marretada. */
  locked?: boolean;
  /** Preço unitário definido à mão, para quando o fator não se aplica. */
  priceOverride?: number;
}

export interface AjusteData {
  tipo: AjusteTipo;
  subtipo?: string;
  numero: string;
  tc: string;
  objeto: AjusteObjeto;
  referente: string;
  valorTC: number;
  /** Valor total contratado (com BDI). Zero = usar o total calculado das linhas. */
  valorContratado: number;
  valorLiberado: number;
  bdiObra: number;
  bdiProjeto: number;
  /** Percentuais (em fração) dos ajustes/aditivos já validados, na ordem. */
  ajustesAnteriores: number[];
  recursoEmConta: number;
  recursoALiberar: number;
  recursoAditivo: number;
  seiProcesso: string;
  seiInicial: string;
  meta: string;
  novaMeta: string;
  justificativa: string;
  /** Itens do checklist DORE já providenciados, por chave tipo:grupo:índice. */
  checklist?: Record<string, boolean>;
  items: AjusteItem[];
}

export const novoAjusteData = (tipo: AjusteTipo, base: '2025' | '2026'): AjusteData => ({
  tipo,
  subtipo: tipo === 'ajuste' ? 'sem_meta' : undefined,
  numero: '01',
  tc: '',
  objeto: 'Reforma',
  referente: 'Reforma',
  valorTC: 0,
  valorContratado: 0,
  valorLiberado: 0,
  // Pontos de partida da tabela SEE; o correto é o BDI informado pela empresa no contrato.
  bdiObra: base === '2026' ? 0.2474 : 0.2443,
  bdiProjeto: base === '2026' ? 0.2958 : 0.2926,
  ajustesAnteriores: [],
  recursoEmConta: 0,
  recursoALiberar: 0,
  recursoAditivo: 0,
  seiProcesso: '',
  seiInicial: '',
  meta: '',
  novaMeta: '',
  justificativa: '',
  items: [],
});

/** Lê o JSON salvo no banco tolerando campos que versões antigas não gravavam. */
export const parseAjusteData = (raw: unknown, base: '2025' | '2026'): AjusteData => {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<AjusteData>;
  const tipo = AJUSTE_TIPOS.some(t => t.id === obj.tipo) ? obj.tipo as AjusteTipo : 'ajuste';
  const defaults = novoAjusteData(tipo, base);
  return {
    ...defaults,
    ...obj,
    tipo,
    ajustesAnteriores: Array.isArray(obj.ajustesAnteriores) ? obj.ajustesAnteriores.map(Number).filter(n => isFinite(n)) : [],
    items: Array.isArray(obj.items) ? obj.items.map(normalizeItem) : [],
  };
};

const normalizeItem = (raw: any): AjusteItem => ({
  id: String(raw?.id || newId()),
  code: String(raw?.code ?? ''),
  description: String(raw?.description ?? ''),
  unit: String(raw?.unit ?? ''),
  source: (raw?.source as AjusteFonte) || 'SEE',
  contractQty: Number(raw?.contractQty) || 0,
  contractPrice: Number(raw?.contractPrice) || 0,
  refPrice: Number(raw?.refPrice) || 0,
  addQty: raw?.addQty == null ? '' : String(raw.addQty),
  supQty: raw?.supQty == null ? '' : String(raw.supQty),
  memory: String(raw?.memory ?? ''),
  location: String(raw?.location ?? ''),
  locked: !!raw?.locked,
  priceOverride: raw?.priceOverride == null || raw.priceOverride === '' ? undefined : Number(raw.priceOverride),
});

export const newId = () => Math.random().toString(36).substring(2, 11);

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const qtyOf = (expr: string): number => {
  const n = Number(evaluateMath(expr));
  return isFinite(n) ? n : 0;
};

/** Valor de qualquer número do usuário ("1.234,56", "1234.56", "R$ 10"). */
export const parseMoney = (s: string): number => {
  const clean = String(s ?? '').replace(/[R$\s]/g, '');
  if (!clean) return 0;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const n = Number(normalized);
  return isFinite(n) ? n : 0;
};

export const isNovo = (item: AjusteItem) => !(item.contractPrice > 0);

/** Serviços do grupo 24 (levantamentos e projetos) levam o BDI de projeto. */
export const isProjeto = (item: AjusteItem) => item.source === 'SEE' && item.code.startsWith('24');

export interface Fator {
  /** Valor usado: contratado ÷ TC, ou 1 quando falta algum dos dois. */
  valor: number;
  definido: boolean;
}

export const fatorDesconto = (data: AjusteData, contratadoGeral: number): Fator => {
  const contratado = data.valorContratado > 0 ? data.valorContratado : contratadoGeral;
  if (data.valorTC > 0 && contratado > 0) return { valor: contratado / data.valorTC, definido: true };
  return { valor: 1, definido: false };
};

/**
 * Preço unitário do serviço em todas as colunas: o do contrato quando existe
 * (observação 3 da planilha), senão o de referência com o fator de desconto
 * (observação 4).
 */
export const unitPrice = (item: AjusteItem, fator: number): number => {
  if (item.priceOverride != null && isFinite(item.priceOverride)) return item.priceOverride;
  if (item.contractPrice > 0) return item.contractPrice;
  return round2(item.refPrice * fator);
};

export interface Coluna {
  custo: number;
  /** Parcela do custo que é do grupo 24 (projetos). */
  projeto: number;
  bdiProjeto: number;
  bdiObra: number;
  geral: number;
}

const coluna = (custo: number, projeto: number, data: AjusteData): Coluna => {
  const bdiProjeto = projeto * data.bdiProjeto;
  const bdiObra = (custo - projeto) * data.bdiObra;
  return { custo, projeto, bdiProjeto, bdiObra, geral: custo + bdiProjeto + bdiObra };
};

export interface AjusteTotais {
  contratado: Coluna;
  acrescido: Coluna;
  suprimido: Coluna;
  real: Coluna;
  fator: Fator;
  /** Contratado de referência: o informado, ou o calculado das linhas. */
  valorContratado: number;
}

export function calcTotais(data: AjusteData): AjusteTotais {
  // O fator depende do contratado, e o contratado só usa preços do contrato,
  // então ele é calculado antes, sem fator.
  let cCusto = 0, cProj = 0;
  for (const it of data.items) {
    const v = it.contractQty * it.contractPrice;
    cCusto += v;
    if (isProjeto(it)) cProj += v;
  }
  const contratado = coluna(cCusto, cProj, data);
  const fator = fatorDesconto(data, contratado.geral);

  let aCusto = 0, aProj = 0, sCusto = 0, sProj = 0;
  for (const it of data.items) {
    const p = unitPrice(it, fator.valor);
    const a = qtyOf(it.addQty) * p;
    const s = qtyOf(it.supQty) * p;
    aCusto += a; sCusto += s;
    if (isProjeto(it)) { aProj += a; sProj += s; }
  }
  const acrescido = coluna(aCusto, aProj, data);
  const suprimido = coluna(sCusto, sProj, data);
  const real = coluna(cCusto + aCusto - sCusto, cProj + aProj - sProj, data);

  return {
    contratado, acrescido, suprimido, real, fator,
    valorContratado: data.valorContratado > 0 ? data.valorContratado : contratado.geral,
  };
}

export const recursoTotal = (data: AjusteData) => data.recursoEmConta + data.recursoALiberar + data.recursoAditivo;

/** Limite cumulativo de acréscimo, pela natureza do objeto. */
export const limitePercentual = (data: AjusteData) => (data.objeto === 'Reforma' ? 0.5 : 0.25);

export interface Balanco {
  alvo: AjusteAlvo;
  /** Quanto falta acrescentar ao total acrescido (negativo = sobra). */
  gap: number;
  /** Valor de referência que o acrescido deve atingir. */
  meta: number;
  fechado: boolean;
  percentualAtual: number;
  percentualAcumulado: number;
  limite: number;
}

export function calcBalanco(data: AjusteData, t: AjusteTotais): Balanco {
  const info = tipoInfo(data.tipo);
  const meta = info.alvo === 'equilibrio' ? t.suprimido.geral : recursoTotal(data);
  const gap = meta - t.acrescido.geral;
  const base = t.valorContratado;
  const percentualAtual = base > 0 ? t.acrescido.geral / base : 0;
  const anteriores = data.ajustesAnteriores.reduce((s, p) => s + p, 0);
  return {
    alvo: info.alvo,
    gap,
    meta,
    fechado: round2(t.acrescido.geral) === round2(meta) && (info.alvo === 'equilibrio' || meta > 0),
    percentualAtual,
    percentualAcumulado: anteriores + percentualAtual,
    limite: limitePercentual(data),
  };
}

export type Nivel = 'ok' | 'aviso' | 'erro';
export interface Verificacao { nivel: Nivel; texto: string }

/** Conferências que a DORE faz ao receber a planilha. */
export function verificar(data: AjusteData, t: AjusteTotais, b: Balanco): Verificacao[] {
  const info = tipoInfo(data.tipo);
  const out: Verificacao[] = [];
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (data.items.length === 0) {
    out.push({ nivel: 'aviso', texto: 'Importe a planilha de contrato ou adicione os serviços.' });
    return out;
  }

  if (!t.fator.definido) {
    out.push({ nivel: 'aviso', texto: 'Informe o valor do TC para calcular o fator de desconto dos serviços novos.' });
  } else if (data.ajustesAnteriores.length === 0 && data.valorContratado > 0 && Math.abs(data.valorContratado - t.contratado.geral) >= 0.01 && t.contratado.geral > 0) {
    // Depois de um ajuste o "contratado" das linhas é o real a executar, que não bate com o contrato original.
    out.push({ nivel: 'aviso', texto: `O contratado informado (${brl(data.valorContratado)}) difere do total das linhas (${brl(t.contratado.geral)}). Confira quantidades, preços e BDI.` });
  }

  if (b.alvo === 'equilibrio') {
    if (b.fechado) out.push({ nivel: 'ok', texto: `Acréscimo = supressão (${brl(t.acrescido.geral)}). O valor do contrato está preservado.` });
    else out.push({ nivel: 'erro', texto: `Acréscimo e supressão diferem em ${brl(Math.abs(b.gap))}. Use a marretada para fechar.` });
  } else {
    const recurso = recursoTotal(data);
    if (recurso <= 0) out.push({ nivel: 'aviso', texto: 'Informe o recurso disponível (em conta, a liberar e aditivo).' });
    else if (b.fechado) out.push({ nivel: 'ok', texto: `Acréscimo igual ao recurso disponível (${brl(recurso)}).` });
    else if (b.gap < 0) out.push({ nivel: 'erro', texto: `O acréscimo passa do recurso disponível em ${brl(-b.gap)}.` });
    else out.push({ nivel: 'aviso', texto: `Ainda há ${brl(b.gap)} de recurso disponível. A marretada fecha no valor exato.` });
  }

  if (!info.permiteSupressao && t.suprimido.geral > 0) {
    out.push({ nivel: 'erro', texto: `${info.titulo} não prevê supressão de serviços.` });
  }

  if (data.tipo !== 'alteracao_projeto' && b.percentualAcumulado > b.limite + 1e-9) {
    out.push({ nivel: 'erro', texto: `Acréscimo acumulado de ${(b.percentualAcumulado * 100).toFixed(2)}% passa do limite de ${(b.limite * 100).toFixed(0)}% para ${data.objeto.toLowerCase()}.` });
  }

  for (const it of data.items) {
    const sup = qtyOf(it.supQty);
    if (sup > it.contractQty + 1e-9 && it.contractQty >= 0) {
      out.push({ nivel: 'erro', texto: `${it.code}: suprimido (${sup}) maior que o contratado (${it.contractQty}).` });
    }
    if (qtyOf(it.addQty) < 0 || sup < 0) {
      out.push({ nivel: 'erro', texto: `${it.code}: quantidades não podem ser negativas.` });
    }
    if (isNovo(it) && qtyOf(it.addQty) > 0 && !(it.refPrice > 0) && it.priceOverride == null) {
      out.push({ nivel: 'aviso', texto: `${it.code}: serviço novo sem preço de referência.` });
    }
  }

  if (data.bdiObra <= 0) out.push({ nivel: 'aviso', texto: 'Informe o BDI de obra do contrato.' });
  return out;
}

// ---------------------------------------------------------------------------
// Marretada
// ---------------------------------------------------------------------------

export interface Golpe {
  itemId: string;
  code: string;
  description: string;
  lado: 'acrescido' | 'suprimido';
  de: number;
  para: number;
}

export interface Marretada {
  golpes: Golpe[];
  /** Diferença que sobra depois dos golpes, em reais. */
  residuo: number;
  exato: boolean;
}

interface Movimento {
  item: AjusteItem;
  lado: 'acrescido' | 'suprimido';
  atual: number;
  /** Efeito no total acrescido − suprimido de cada 0,01 de quantidade. */
  passo: number;
  /** Faixa de centésimos permitida (quantidade não fica negativa nem passa do contratado). */
  minK: number;
  maxK: number;
  /** Menor mudança aceita, em centésimos: 100 para unidades contadas inteiras. */
  gran: number;
}

/** Unidades que não fazem sentido em fração (uma placa, um vaso sanitário). */
const UNIDADES_INTEIRAS = new Set(['UN', 'UND', 'UNID', 'PC', 'PÇ', 'CJ', 'JG', 'PAR', 'VB', 'CONJ', 'CONJUNTO']);
export const unidadeInteira = (unit: string) => UNIDADES_INTEIRAS.has(unit.trim().toUpperCase().replace(/\.$/, ''));

const toCents = (q: number) => Math.round(q * 100);

/**
 * Procura a menor mudança de quantidades que leva o total acrescido ao alvo,
 * ao centavo. Primeiro tenta um serviço só; se a diferença não fecha no
 * centavo (o passo de 0,01 de quantidade raramente bate exato), combina dois,
 * testando ao redor do ponto ideal do primeiro para o segundo absorver a sobra.
 *
 * `candidatos` limita quais linhas podem receber o golpe; sem ele, valem todas
 * as que não estão travadas e já têm acréscimo ou supressão.
 */
export function calcMarretada(data: AjusteData, candidatos?: Set<string>): Marretada | null {
  const t = calcTotais(data);
  const b = calcBalanco(data, t);
  const info = tipoInfo(data.tipo);
  const alvoDelta = b.gap; // quanto o (acrescido − suprimido) precisa subir, em reais com BDI
  if (Math.abs(alvoDelta) < 0.005) return { golpes: [], residuo: 0, exato: true };

  const movs: Movimento[] = [];
  for (const it of data.items) {
    if (it.locked) continue;
    const add = qtyOf(it.addQty);
    const sup = qtyOf(it.supQty);
    const usado = add > 0 || sup > 0;
    if (candidatos ? !candidatos.has(it.id) : !usado) continue;
    const preco = unitPrice(it, t.fator.valor);
    if (!(preco > 0)) continue;
    const mult = preco * (1 + (isProjeto(it) ? data.bdiProjeto : data.bdiObra));
    const passo = mult / 100;
    const gran = unidadeInteira(it.unit) ? 100 : 1;

    if (add > 0 || (candidatos && sup === 0)) {
      movs.push({ item: it, lado: 'acrescido', atual: add, passo, minK: -toCents(add), maxK: Number.MAX_SAFE_INTEGER, gran });
    }
    if (info.alvo === 'equilibrio' && info.permiteSupressao && (sup > 0 || (candidatos && add === 0 && it.contractQty > 0))) {
      // Suprimir mais reduz o lado da supressão: o efeito no saldo é o oposto.
      movs.push({ item: it, lado: 'suprimido', atual: sup, passo: -passo, minK: -toCents(sup), maxK: toCents(it.contractQty) - toCents(sup), gran });
    }
  }
  // Em equilíbrio, mexer na supressão também muda o alvo (o alvo é o próprio
  // suprimido). O saldo (acrescido − suprimido) é linear nos dois lados, então
  // basta tratar o objetivo como "saldo sobe alvoDelta" com o sinal de cada lado.
  if (movs.length === 0) return null;

  // Arredonda para a granularidade da linha e mantém dentro da faixa permitida.
  const clamp = (m: Movimento, k: number) => {
    const g = Math.round(k / m.gran) * m.gran;
    const lo = Math.ceil(m.minK / m.gran) * m.gran;
    const hi = m.maxK === Number.MAX_SAFE_INTEGER ? g : Math.floor(m.maxK / m.gran) * m.gran;
    return Math.max(lo, Math.min(hi, g));
  };
  type Cand = { ks: [Movimento, number][]; residuo: number; custo: number };
  let melhor: Cand | null = null;

  const avaliar = (ks: [Movimento, number][]) => {
    let efeito = 0, custo = 0;
    for (const [m, k] of ks) {
      efeito += k * m.passo;
      // Prefere mexer pouco, em proporção à quantidade da linha.
      custo += Math.abs(k) / Math.max(100, toCents(m.atual));
    }
    const residuo = alvoDelta - efeito;
    const cand: Cand = { ks, residuo, custo: custo + ks.length * 0.001 };
    const exato = Math.abs(residuo) < 0.005;
    if (!melhor) { melhor = cand; return; }
    const melhorExato = Math.abs(melhor.residuo) < 0.005;
    if (exato && !melhorExato) melhor = cand;
    else if (exato === melhorExato) {
      if (exato ? cand.custo < melhor.custo : Math.abs(residuo) < Math.abs(melhor.residuo)) melhor = cand;
    }
  };

  // Um serviço só.
  for (const m of movs) {
    const ideal = clamp(m, Math.round(alvoDelta / m.passo));
    if (ideal !== 0) avaliar([[m, ideal]]);
  }

  // Dois serviços. A janela cobre o suficiente para o segundo passo encontrar
  // um resto múltiplo do seu valor; limitada para não travar com muitas linhas.
  const pares = movs.slice(0, 40);
  const JANELA = 150;
  for (let i = 0; i < pares.length; i++) {
    const m1 = pares[i];
    const ideal1 = Math.round(alvoDelta / m1.passo);
    for (let j = 0; j < pares.length; j++) {
      if (i === j || pares[j].item.id === m1.item.id) continue;
      const m2 = pares[j];
      for (let d = -JANELA; d <= JANELA; d++) {
        const k1 = clamp(m1, ideal1 + d * m1.gran);
        const resto = alvoDelta - k1 * m1.passo;
        const k2 = clamp(m2, Math.round(resto / m2.passo));
        if (k1 === 0 || k2 === 0) continue;
        avaliar([[m1, k1], [m2, k2]]);
      }
    }
  }

  const escolhido = melhor as Cand | null;
  if (!escolhido) return null;
  const golpes: Golpe[] = escolhido.ks.map(([m, k]) => ({
    itemId: m.item.id,
    code: m.item.code,
    description: m.item.description,
    lado: m.lado,
    de: m.atual,
    para: (toCents(m.atual) + k) / 100,
  }));
  return { golpes, residuo: escolhido.residuo, exato: Math.abs(escolhido.residuo) < 0.005 };
}

/** Aplica os golpes da marretada às linhas. */
export function aplicarMarretada(items: AjusteItem[], m: Marretada): AjusteItem[] {
  const porId = new Map(m.golpes.map(g => [g.itemId + g.lado, g]));
  return items.map(it => {
    const ga = porId.get(it.id + 'acrescido');
    const gs = porId.get(it.id + 'suprimido');
    if (!ga && !gs) return it;
    const fmt = (n: number) => n.toFixed(2).replace('.', ',');
    return {
      ...it,
      ...(ga && { addQty: fmt(ga.para) }),
      ...(gs && { supQty: fmt(gs.para) }),
    };
  });
}

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = (n: number, casas = 2) => `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
export const num = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
