import { useMemo } from 'react';
import type { Workbook } from '../services/db';

interface SelectedItemOccurrence {
  id: string;
  quantity: string;
  memory: string;
  location: string;
}

interface SelectedItem {
  item: string;
  description: string;
  unit: string;
  price: number;
  occurrences: SelectedItemOccurrence[];
  customCode?: string;
  customTitle?: string;
  customDescription?: string;
  customUnit?: string;
  customPrice?: number;
}

interface CatalogItem {
  item: string;
  description: string;
  unit: string;
  price: number;
  isCategory: boolean;
  rows: number[];
}

interface Props {
  workbook: Workbook;
  selectedItems: SelectedItem[];
  catalog: CatalogItem[];
}

const evaluateMath = (expr: any): string => {
  if (!expr && expr !== 0) return '';
  try {
    let sanitized = String(expr).replace(/,/g, '.').replace(/x/g, '*');
    if (!/^[0-9+\-*/().\s]+$/.test(sanitized)) return '';
    const result = new Function(`return ${sanitized}`)();
    return Number.isFinite(result) ? String(Number(result.toFixed(2))) : '';
  } catch (e) {
    return '';
  }
};

const getItemTotalQuantity = (item: SelectedItem) => {
  if (!item.occurrences) return 0;
  return item.occurrences.reduce((sum, occ) => sum + (Number(evaluateMath(occ.quantity)) || 0), 0);
};

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

const formatNumber = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
};

export function PrintableSpreadsheet({ workbook, selectedItems, catalog }: Props) {
  const getBdiRate = (iss?: string) => {
    switch (iss) {
      case '2': return 0.2246;
      case '2.5': return 0.2279;
      case '3': return 0.2312;
      case '4': return 0.2377;
      case '5': return 0.2443;
      default: return 0.2443;
    }
  };

  const { totalObra, totalProj, totalBudget } = useMemo(() => {
    return selectedItems.reduce((acc, item) => {
      const cost = getItemTotalQuantity(item) * (item.customPrice !== undefined ? item.customPrice : item.price);
      acc.totalBudget += cost;
      if (item.item.startsWith('24')) {
        acc.totalProj += cost;
      } else {
        acc.totalObra += cost;
      }
      return acc;
    }, { totalObra: 0, totalProj: 0, totalBudget: 0 });
  }, [selectedItems]);

  const bdiRate = getBdiRate(workbook.iss);
  const bdiProjRate = 0.2926;
  const bdiObraAmount = totalObra * bdiRate;
  const bdiProjAmount = totalProj * bdiProjRate;
  const bdiAmount = bdiObraAmount + bdiProjAmount;
  const grandTotal = totalBudget + bdiAmount;

  // Hierarchical Grouping
  const groupedSelected = useMemo(() => {
    const groups: Record<string, Record<string, SelectedItem[]>> = {};
    selectedItems.forEach(item => {
      const catPrefix = item.item.substring(0, 2) + "0000";
      const cat = catalog.find(c => c.item === catPrefix);
      const mainGroupName = cat ? cat.description : "Outros";

      const subCatPrefix = item.item.substring(0, 4) + "00";
      const subCat = catalog.find(c => c.item === subCatPrefix);
      
      let subGroupName = "";
      if (subCat && subCat.item !== catPrefix && subCat.description && subCat.description.trim() !== '') {
        subGroupName = subCat.description;
      }

      if (!groups[mainGroupName]) groups[mainGroupName] = {};
      if (!groups[mainGroupName][subGroupName]) groups[mainGroupName][subGroupName] = [];
      
      groups[mainGroupName][subGroupName].push(item);
    });
    return groups;
  }, [selectedItems, catalog]);

  const formattedDate = useMemo(() => {
    if (workbook.data_elaboracao) {
      const [year, month, day] = workbook.data_elaboracao.split('-');
      return `${day}/${month}/${year}`;
    }
    return new Date(workbook.created_at).toLocaleDateString('pt-BR');
  }, [workbook.data_elaboracao, workbook.created_at]);

  const revDate = useMemo(() => {
    const d = workbook.data_elaboracao ? new Date(workbook.data_elaboracao) : new Date(workbook.created_at);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    return `${m}/${y}`;
  }, [workbook.data_elaboracao, workbook.created_at]);

  return (
    <div className="hidden print:block w-full bg-white text-black font-sans text-[10px] leading-tight p-1">
      
      {/* CABEÇALHO OFICIAL SEEMG */}
      <table className="w-full border-collapse border-2 border-black mb-1 table-fixed">
        <tbody>
          {/* Linha 1: Brasão + Título Governamental */}
          <tr className="border-b border-black">
            <td className="w-[12%] p-1 text-center align-middle border-r border-black" rowSpan={3}>
              <img 
                src="/brasao_mg.png" 
                alt="Brasão Minas Gerais" 
                className="max-h-16 mx-auto object-contain"
              />
            </td>
            <td className="w-[88%] p-1 text-center align-middle" colSpan={3}>
              <div className="font-bold text-[12px] tracking-wide uppercase">Governo do Estado de Minas Gerais</div>
              <div className="font-bold text-[11px] uppercase">Secretaria de Estado de Educação</div>
              <div className="text-[9px] uppercase">Subsecretaria de Administração • Superintendência de Infraestrutura Escolar</div>
              <div className="text-[8px] uppercase text-slate-700">Diretoria de Gestão da Rede Física</div>
            </td>
          </tr>

          {/* Linha 2: Escola Estadual */}
          <tr className="border-b border-black text-[10px]">
            <td className="p-1 border-r border-black font-bold uppercase bg-slate-50" colSpan={2}>
              <span className="text-slate-600 font-semibold text-[9px] block">ESCOLA ESTADUAL:</span>
              <span className="text-[11px]">{workbook.escola || 'NÃO INFORMADA'}</span>
            </td>
            <td className="p-1 font-bold uppercase bg-slate-50 w-[20%]">
              <span className="text-slate-600 font-semibold text-[9px] block">CÓDIGO DA ESCOLA:</span>
              <span className="text-[11px]">{workbook.cod_escola || 'S/ CÓDIGO'}</span>
            </td>
          </tr>

          {/* Linha 3: Município + SRE */}
          <tr className="border-b border-black text-[10px]">
            <td className="p-1 border-r border-black font-bold uppercase w-[45%]">
              <span className="text-slate-600 font-semibold text-[9px] block">MUNICÍPIO:</span>
              {workbook.municipio || '-'}
            </td>
            <td className="p-1 border-r border-black font-bold uppercase" colSpan={2}>
              <span className="text-slate-600 font-semibold text-[9px] block">SUPERINTENDÊNCIA REGIONAL DE ENSINO (S.R.E.):</span>
              {workbook.sre || '-'}
            </td>
          </tr>

          {/* Linha 4: Serviços */}
          <tr className="border-b border-black text-[10px]">
            <td className="p-1 border-r border-black font-bold uppercase" colSpan={3}>
              <span className="text-slate-600 font-semibold text-[9px] block">SERVIÇOS DA PLANILHA:</span>
              {workbook.servicos || 'Reforma e Manutenção Predial Escolar'}
            </td>
            <td className="p-1 text-center font-bold bg-slate-100">
              <span className="text-slate-600 font-semibold text-[9px] block">BASE DE PREÇOS:</span>
              <span className="text-[11px] text-emerald-900 font-black">SEEMG {workbook.base_precos || '2026'}</span>
            </td>
          </tr>

          {/* Linha 5: Responsável Técnico + CREA + Data + REV */}
          <tr className="text-[9px] bg-slate-50 font-medium">
            <td className="p-1 border-r border-black" colSpan={2}>
              <span className="text-slate-600 font-semibold block text-[8px]">TÉCNICO RESPONSÁVEL PELA ELABORAÇÃO:</span>
              <span className="font-bold text-[10px] uppercase">{workbook.engenheiro || '-'}</span>
            </td>
            <td className="p-1 border-r border-black">
              <span className="text-slate-600 font-semibold block text-[8px]">CREA / CAU / CFT:</span>
              <span className="font-bold text-[10px]">{workbook.crea || '-'}</span>
            </td>
            <td className="p-1 text-center">
              <span className="text-slate-600 font-semibold block text-[8px]">DATA / REVISÃO:</span>
              <span className="font-bold text-[10px]">{formattedDate} • REV {String(workbook.rev || '00').padStart(2, '0')} ({revDate})</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* TABELA OFICIAL DE ORÇAMENTO (9 COLUNAS) */}
      <table className="w-full border-collapse border-2 border-black table-fixed text-[9px]">
        {/* LARGURAS DAS COLUNAS (A ATÉ I) */}
        <colgroup>
          <col style={{ width: '7%' }} />
          <col style={{ width: '34%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '9%' }} />
        </colgroup>

        {/* CABEÇALHO DAS COLUNAS - REPETE EM TODAS AS PÁGINAS */}
        <thead style={{ display: 'table-header-group' }}>
          <tr className="bg-[#15803d] text-white font-bold text-center border-b-2 border-black">
            <th className="border border-black p-1 text-center">ITEM</th>
            <th className="border border-black p-1 text-left">ESPECIFICAÇÃO DOS SERVIÇOS</th>
            <th className="border border-black p-1 text-center">UN</th>
            <th className="border border-black p-1 text-right">QUANTIDADE</th>
            <th className="border border-black p-1 text-right">VALOR UNIT. (R$)</th>
            <th className="border border-black p-1 text-right">VALOR TOTAL (R$)</th>
            <th className="border border-black p-1 text-left">MEMÓRIA DE CÁLCULO</th>
            <th className="border border-black p-1 text-right">QTD.</th>
            <th className="border border-black p-1 text-left">LOCAL DE INTERVENÇÃO</th>
          </tr>
        </thead>

        <tbody>
          {Object.entries(groupedSelected).map(([mainGroupName, subGroups]) => {
            const mainGroupCat = catalog.find(c => c.description === mainGroupName);
            const mainGroupCode = mainGroupCat ? mainGroupCat.item : '';

            let mainGroupTotal = 0;
            Object.values(subGroups).forEach(items => {
              mainGroupTotal += items.reduce((acc, item) => {
                const price = item.customPrice !== undefined ? item.customPrice : item.price;
                return acc + (getItemTotalQuantity(item) * price);
              }, 0);
            });

            return (
              <tbody key={mainGroupName} className="border-b border-black">
                {/* LINHA DO GRUPO PRINCIPAL (VERDE) */}
                <tr className="bg-[#15803d] text-white font-bold text-[9.5px]">
                  <td className="border border-black p-1 text-center font-mono">{mainGroupCode}</td>
                  <td className="border border-black p-1 uppercase" colSpan={4}>
                    {mainGroupName}
                  </td>
                  <td className="border border-black p-1 text-right whitespace-nowrap">
                    {formatCurrency(mainGroupTotal)}
                  </td>
                  <td className="border border-black p-1" colSpan={3}></td>
                </tr>

                {/* SUBGRUPOS E ITENS */}
                {Object.entries(subGroups).map(([subGroupName, items]) => {
                  const subGroupCat = catalog.find(c => c.description === subGroupName);
                  const subGroupCode = subGroupCat ? subGroupCat.item : '';
                  const subGroupTotal = items.reduce((acc, item) => {
                    const price = item.customPrice !== undefined ? item.customPrice : item.price;
                    return acc + (getItemTotalQuantity(item) * price);
                  }, 0);

                  return (
                    <tbody key={subGroupName || 'default'}>
                      {/* LINHA DO SUBGRUPO (CINZA) */}
                      {subGroupName && (
                        <tr className="bg-[#e2e8f0] text-slate-900 font-bold text-[9px]">
                          <td className="border border-black p-1 text-center font-mono">{subGroupCode}</td>
                          <td className="border border-black p-1 uppercase" colSpan={4}>
                            {subGroupName}
                          </td>
                          <td className="border border-black p-1 text-right whitespace-nowrap">
                            {formatCurrency(subGroupTotal)}
                          </td>
                          <td className="border border-black p-1" colSpan={3}></td>
                        </tr>
                      )}

                      {/* ITENS DE SERVIÇO */}
                      {items.map(item => {
                        const totalQty = getItemTotalQuantity(item);
                        const unitPrice = item.customPrice !== undefined ? item.customPrice : item.price;
                        const totalPrice = totalQty * unitPrice;
                        const occs = item.occurrences || [];
                        const firstOcc = occs[0] || { memory: '', quantity: '', location: '' };
                        const extraOccs = occs.slice(1);

                        return (
                          <tbody key={item.item}>
                            {/* LINHA PRINCIPAL DO ITEM */}
                            <tr className="hover:bg-slate-50 text-[8.5px] border-b border-slate-300">
                              <td className="border border-black p-1 text-center font-mono font-bold align-top">
                                {item.customCode || item.item}
                              </td>
                              <td className="border border-black p-1 align-top leading-snug">
                                <span className="font-semibold text-slate-900">
                                  {item.customTitle || item.customDescription || item.description}
                                </span>
                              </td>
                              <td className="border border-black p-1 text-center uppercase align-top font-bold">
                                {item.customUnit || item.unit}
                              </td>
                              <td className="border border-black p-1 text-right font-bold align-top whitespace-nowrap">
                                {formatNumber(totalQty)}
                              </td>
                              <td className="border border-black p-1 text-right align-top whitespace-nowrap">
                                {formatCurrency(unitPrice)}
                              </td>
                              <td className="border border-black p-1 text-right font-bold align-top whitespace-nowrap bg-slate-50/50">
                                {formatCurrency(totalPrice)}
                              </td>
                              <td className="border border-black p-1 font-mono text-[8px] align-top truncate max-w-0" title={firstOcc.memory}>
                                {firstOcc.memory || '-'}
                              </td>
                              <td className="border border-black p-1 text-right align-top whitespace-nowrap">
                                {firstOcc.quantity ? formatNumber(Number(evaluateMath(firstOcc.quantity)) || 0) : '-'}
                              </td>
                              <td className="border border-black p-1 align-top text-slate-700 truncate max-w-0" title={firstOcc.location}>
                                {firstOcc.location || '-'}
                              </td>
                            </tr>

                            {/* OCORRÊNCIAS ADICIONAIS DO MESMO ITEM */}
                            {extraOccs.map(occ => (
                              <tr key={occ.id} className="text-[8.5px] bg-slate-50/30 border-b border-slate-200">
                                <td className="border-r border-black p-0.5"></td>
                                <td className="border-r border-black p-0.5"></td>
                                <td className="border-r border-black p-0.5"></td>
                                <td className="border-r border-black p-0.5"></td>
                                <td className="border-r border-black p-0.5"></td>
                                <td className="border-r border-black p-0.5"></td>
                                <td className="border-r border-black p-1 font-mono text-[8px] align-top truncate max-w-0" title={occ.memory}>
                                  {occ.memory || '-'}
                                </td>
                                <td className="border border-black p-1 text-right align-top whitespace-nowrap">
                                  {occ.quantity ? formatNumber(Number(evaluateMath(occ.quantity)) || 0) : '-'}
                                </td>
                                <td className="border border-black p-1 align-top text-slate-700 truncate max-w-0" title={occ.location}>
                                  {occ.location || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        );
                      })}
                    </tbody>
                  );
                })}
              </tbody>
            );
          })}
        </tbody>

        {/* RODAPÉ DE TOTAIS DA PLANILHA */}
        <tfoot>
          <tr className="bg-slate-100 font-bold text-[9.5px] border-t-2 border-black">
            <td className="border border-black p-1.5 text-right uppercase" colSpan={5}>
              TOTAL CUSTO DIRETO =
            </td>
            <td className="border border-black p-1.5 text-right whitespace-nowrap font-black">
              {formatCurrency(totalBudget)}
            </td>
            <td className="border border-black p-1.5" colSpan={3}></td>
          </tr>

          <tr className="bg-slate-50 font-bold text-[9px]">
            <td className="border border-black p-1 text-right uppercase" colSpan={5}>
              BDI OBRA ({(bdiRate * 100).toFixed(2)}%) =
            </td>
            <td className="border border-black p-1 text-right whitespace-nowrap text-slate-800">
              {formatCurrency(bdiObraAmount)}
            </td>
            <td className="border border-black p-1 text-slate-500 text-[8px]" colSpan={3}>
              ISS adotado: {workbook.iss || '5'}%
            </td>
          </tr>

          {totalProj > 0 && (
            <tr className="bg-slate-50 font-bold text-[9px]">
              <td className="border border-black p-1 text-right uppercase" colSpan={5}>
                BDI PROJETOS (29,26%) =
              </td>
              <td className="border border-black p-1 text-right whitespace-nowrap text-slate-800">
                {formatCurrency(bdiProjAmount)}
              </td>
              <td className="border border-black p-1" colSpan={3}></td>
            </tr>
          )}

          <tr className="bg-[#15803d] text-white font-black text-[11px] border-y-2 border-black">
            <td className="border border-black p-2 text-right uppercase" colSpan={5}>
              TOTAL GERAL =
            </td>
            <td className="border border-black p-2 text-right whitespace-nowrap font-black">
              {formatCurrency(grandTotal)}
            </td>
            <td className="border border-black p-2" colSpan={3}></td>
          </tr>
        </tfoot>
      </table>

      {/* QUADRO DE VALIDAÇÃO E ASSINATURAS (ESTILO PLANILHA GOVERNAMENTAL) */}
      <div className="mt-3 grid grid-cols-12 gap-3" style={{ breakInside: 'avoid' }}>
        {/* Tabela de Validação de Custos */}
        <div className="col-span-6 border-2 border-black text-[8.5px]">
          <div className="bg-slate-200 font-bold text-center p-1 border-b border-black text-[9px] uppercase">
            Quadro de Validação e Fechamento Orçamentário
          </div>
          <table className="w-full border-collapse">
            <tbody>
              <tr className="border-b border-slate-300">
                <td className="p-1 font-semibold border-r border-slate-300">CUSTO DIRETO DA OBRA:</td>
                <td className="p-1 text-right font-mono font-bold">{formatCurrency(totalObra)}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="p-1 font-semibold border-r border-slate-300">BDI APLICADO À OBRA ({(bdiRate * 100).toFixed(2)}%):</td>
                <td className="p-1 text-right font-mono font-bold">{formatCurrency(bdiObraAmount)}</td>
              </tr>
              <tr className="border-b border-slate-300 bg-slate-50">
                <td className="p-1 font-bold border-r border-slate-300">TOTAL DA OBRA (CUSTO + BDI):</td>
                <td className="p-1 text-right font-mono font-bold text-emerald-900">{formatCurrency(totalObra + bdiObraAmount)}</td>
              </tr>
              {totalProj > 0 && (
                <>
                  <tr className="border-b border-slate-300">
                    <td className="p-1 font-semibold border-r border-slate-300">CUSTO DIRETO DE PROJETOS:</td>
                    <td className="p-1 text-right font-mono font-bold">{formatCurrency(totalProj)}</td>
                  </tr>
                  <tr className="border-b border-slate-300">
                    <td className="p-1 font-semibold border-r border-slate-300">BDI APLICADO A PROJETOS (29,26%):</td>
                    <td className="p-1 text-right font-mono font-bold">{formatCurrency(bdiProjAmount)}</td>
                  </tr>
                  <tr className="border-b border-slate-300 bg-slate-50">
                    <td className="p-1 font-bold border-r border-slate-300">TOTAL DE PROJETOS (CUSTO + BDI):</td>
                    <td className="p-1 text-right font-mono font-bold text-emerald-900">{formatCurrency(totalProj + bdiProjAmount)}</td>
                  </tr>
                </>
              )}
              <tr className="bg-[#15803d] text-white font-bold text-[9px]">
                <td className="p-1 border-r border-black uppercase">VALOR TOTAL CONSOLIDADO:</td>
                <td className="p-1 text-right font-mono font-black">{formatCurrency(grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Campo de Assinatura Formal */}
        <div className="col-span-6 border-2 border-black p-3 flex flex-col justify-between text-center text-[9px]">
          <div className="text-left font-bold text-[8.5px] uppercase text-slate-700">
            Declaração de Elaboração Técnica:
          </div>
          <div className="text-[8px] text-slate-600 text-left leading-relaxed mt-1">
            Declaramos que os preços e quantitativos constantes nesta planilha orçamentária foram elaborados em estrita observância às normas técnicas vigentes e à tabela de custos oficial da Secretaria de Estado de Educação de Minas Gerais (SEEMG).
          </div>
          <div className="pt-8 border-t border-black mt-4">
            <div className="font-bold text-[10px] uppercase">{workbook.engenheiro || 'RESPONSÁVEL TÉCNICO'}</div>
            <div className="text-[9px] text-slate-700">{workbook.crea ? `CREA / CAU / CFT: ${workbook.crea}` : 'CREA / CAU / CFT: _____________________'}</div>
            <div className="text-[8px] text-slate-500 mt-0.5">Elaborado em: {formattedDate}</div>
          </div>
        </div>
      </div>

    </div>
  );
}
