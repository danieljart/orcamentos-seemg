/**
 * E-mail no "PADRÃO DE E-MAIL - SALDOS E AJUSTES" da DORE, montado com os
 * dados da solicitação. O texto segue o modelo campo a campo, marcando com X
 * as opções que se aplicam.
 */
import { tipoInfo, brl, pct, recursoTotal, SUBTIPOS_AJUSTE, REFERENTE_OPCOES } from './ajuste';
import type { AjusteData, AjusteTotais, Balanco } from './ajuste';

interface Escola {
  escola: string;
  cod_escola: string;
  municipio: string;
  sre: string;
}

const marca = (sim: boolean) => (sim ? '(X)' : '( )');

export function montarEmail(wb: Escola, data: AjusteData, t: AjusteTotais, b: Balanco): { assunto: string; corpo: string } {
  const info = tipoInfo(data.tipo);
  const assunto = info.assunto
    .replace('{numero}', data.numero || 'XX')
    .replace('{sre}', (wb.sre || 'SRE').toUpperCase())
    .replace('{escola}', (wb.escola || 'NOME DA ESCOLA').toUpperCase())
    .replace('{tc}', data.tc || 'Nº/ANO');

  const rotuloSei = data.tipo === 'ajuste' ? 'DO AJUSTE'
    : data.tipo === 'alteracao_projeto' ? 'DA ALTERAÇÃO DE PROJETO'
      : 'DO SALDO';

  const linhas: string[] = [
    `Nº PROCESSO SEI ${rotuloSei}: ${data.seiProcesso}`,
    `SRE: ${wb.sre}`,
    `MUNICÍPIO: ${wb.municipio}`,
    `NOME DA ESCOLA: ${wb.escola}`,
    `CODESC: ${wb.cod_escola}`,
    '',
    '1- ATENDIMENTO INICIAL:',
    `Referente a: ${REFERENTE_OPCOES.map(r => `${marca(data.referente === r)} ${r}`).join(' ')}`,
    `Nº TC: ${data.tc}`,
    `Valor TC: ${data.valorTC ? brl(data.valorTC) : ''}`,
    `Valor liberado: ${data.valorLiberado ? brl(data.valorLiberado) : ''}`,
    `Meta do termo de compromisso: ${data.meta}`,
    `Número do processo SEI referente ao atendimento inicial: ${data.seiInicial}`,
  ];

  if (data.tipo === 'ajuste') {
    linhas.push(
      '',
      '2- TIPO DE AJUSTE:',
      ...SUBTIPOS_AJUSTE.map(s => `${marca(data.subtipo === s.value)} ${s.label}`),
      '',
      `Ajuste Nº: ${data.numero}`,
      `Percentual de ajuste acumulado em relação a Planilha de contrato: ${pct(b.percentualAcumulado)}`,
      '',
      '3- EM CASO de alteração/acréscimo de meta:',
      `Descrever a Nova Meta Proposta: ${data.novaMeta}`,
    );
  } else if (data.tipo === 'saldo_complementar' || data.tipo === 'saldo_nova_cotacao') {
    const recurso = recursoTotal(data);
    linhas.push(
      '',
      '2- TIPO DE SALDO:',
      `( ) Nova Cotação – Obra Concluída`,
      `${marca(data.tipo === 'saldo_nova_cotacao')} Nova Cotação – Obra Distratada`,
      `${marca(data.tipo === 'saldo_complementar')} Serviços Complementares`,
      '',
      '3- RECURSO:',
      `${marca(data.recursoEmConta > 0)} Disponível já em conta - ${brl(data.recursoEmConta)}`,
      `${marca(data.recursoALiberar > 0)} Previsto no TC, mas ainda a ser liberado para a Caixa Escolar - ${brl(data.recursoALiberar)}`,
      `${marca(data.recursoAditivo > 0)} Não previsto ou previsto de forma insuficiente no TC - Necessidade de aditivo de valor ao TC - ${brl(data.recursoAditivo)}`,
      `Total: ${brl(recurso)} · Planilha: ${brl(t.acrescido.geral)}`,
      '',
      '4- META:',
      `${marca(!data.novaMeta)} Saldo sem alteração de meta (Deve ter a mesma descrição do TC original)`,
      `${marca(!!data.novaMeta)} Saldo com alteração/acréscimo de meta`,
      `Descrever Nova Meta Proposta: ${data.novaMeta}`,
    );
  }

  return { assunto, corpo: linhas.join('\n') };
}
