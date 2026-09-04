import { useMemo, Fragment } from 'react';
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
  extendedDescription?: string;
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
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
};

const formatNumber = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
};

const BORDER_STYLE = { border: '1px solid #000000' };

export function PrintableSpreadsheet({ workbook, selectedItems, catalog }: Props) {
  const is2026 = (workbook.base_precos || '2026') === '2026';

  const getBdiRate = (iss?: string) => {
    switch (iss) {
      case '2': return is2026 ? 0.2278 : 0.2246;
      case '2.5': return is2026 ? 0.2310 : 0.2279;
      case '3': return is2026 ? 0.2342 : 0.2312;
      case '4': return is2026 ? 0.2408 : 0.2377;
      case '5': return is2026 ? 0.2474 : 0.2443;
      default: return is2026 ? 0.2474 : 0.2443;
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
  const bdiProjRate = is2026 ? 0.2958 : 0.2926;
  const bdiObraAmount = totalObra * bdiRate;
  const bdiProjAmount = totalProj * bdiProjRate;
  const grandTotal = totalBudget + bdiObraAmount + bdiProjAmount;

  // Group items hierarchically exactly like the spreadsheet
  const groupedSelected = useMemo(() => {
    const groups: Record<string, Record<string, SelectedItem[]>> = {};
    selectedItems.forEach(item => {
      const catPrefix = item.item.substring(0, 2) + "0000";
      const cat = catalog.find(c => c.item === catPrefix);
      const mainGroupName = cat ? cat.description : "OUTROS";

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

  const monthYearStr = useMemo(() => {
    const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const d = workbook.data_elaboracao ? new Date(workbook.data_elaboracao) : new Date(workbook.created_at);
    const m = months[d.getMonth()];
    const y = String(d.getFullYear()).slice(-2);
    return `${m}/${y}`;
  }, [workbook.data_elaboracao, workbook.created_at]);

  return (
    <div 
      style={{
        width: '100%',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: 'Calibri, Arial, sans-serif',
        fontSize: '8pt',
        lineHeight: 1.2,
        boxSizing: 'border-box'
      }}
    >
      <table 
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #000000',
          tableLayout: 'fixed',
          fontSize: '8pt',
          color: '#000000',
          backgroundColor: '#ffffff'
        }}
      >
        <colgroup><col style={{ width: '6%' }} /><col style={{ width: '38%' }} /><col style={{ width: '4%' }} /><col style={{ width: '6%' }} /><col style={{ width: '7%' }} /><col style={{ width: '8%' }} /><col style={{ width: '16%' }} /><col style={{ width: '5%' }} /><col style={{ width: '10%' }} /></colgroup>

        <tbody>
          {/* LINHA 1: BRASÃO (A1) + TEXTO INSTITUCIONAL (B1:I1) */}
          <tr>
            <td style={{ ...BORDER_STYLE, textAlign: 'center', verticalAlign: 'middle', padding: '2px' }} rowSpan={3}>
              <img 
                src="/brasao_mg.png" 
                alt="Brasão" 
                style={{ maxHeight: '38px', margin: '0 auto', display: 'block', objectFit: 'contain' }}
              />
            </td>
            <td style={{ ...BORDER_STYLE, fontWeight: 'bold', fontSize: '8.5pt', textAlign: 'center', padding: '4px', textTransform: 'uppercase' }} colSpan={8}>
              SECRETARIA DE ESTADO DE EDUCAÇÃO - SUPERINTENDÊNCIA DE INFRAESTRUTURA E LOGÍSTICA - DIRETORIA DE OBRAS DA REDE ESTADUAL - PLANILHA DE SERVIÇOS - SEM DESONERAÇÃO
            </td>
          </tr>

          {/* LINHA 2: ESCOLA ESTADUAL | COD ESCOLA | S.R.E. */}
          <tr style={{ fontWeight: 'bold', fontSize: '8pt' }}>
            <td style={{ ...BORDER_STYLE, padding: '2px 4px', textAlign: 'left' }} colSpan={2}>
              ESCOLA ESTADUAL: <span style={{ fontWeight: 'normal' }}>{workbook.escola || ''}</span>
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px 4px', textAlign: 'left' }} colSpan={2}>
              COD ESCOLA: <span style={{ fontWeight: 'normal' }}>{workbook.cod_escola || ''}</span>
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px 4px', textAlign: 'left' }} colSpan={4}>
              S.R.E.: <span style={{ fontWeight: 'normal' }}>{workbook.sre || ''}</span>
            </td>
          </tr>

          {/* LINHA 3: MUNICÍPIO | ISS | SERVIÇOS */}
          <tr style={{ fontWeight: 'bold', fontSize: '8pt' }}>
            <td style={{ ...BORDER_STYLE, padding: '2px 4px', textAlign: 'left' }} colSpan={2}>
              MUNICÍPIO: <span style={{ fontWeight: 'normal' }}>{workbook.municipio || ''}</span>
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px', textAlign: 'center' }}>
              ISS
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px', textAlign: 'center', fontWeight: 'normal' }}>
              {workbook.iss ? Number(workbook.iss).toFixed(2) : '5.00'}%
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px 4px', textAlign: 'left' }} colSpan={4}>
              SERVIÇOS: <span style={{ fontWeight: 'normal' }}>{workbook.servicos || ''}</span>
            </td>
          </tr>

          {/* LINHAS 4 & 5: CABEÇALHO OFICIAL (2 NÍVEIS COM F4 = TOTAL GERAL) */}
          <tr style={{ fontWeight: 'bold', textAlign: 'center', fontSize: '8pt', backgroundColor: '#ffffff' }}>
            <td style={{ ...BORDER_STYLE, padding: '4px', verticalAlign: 'middle' }} rowSpan={2}>ITEM</td>
            <td style={{ ...BORDER_STYLE, padding: '4px', verticalAlign: 'middle', textAlign: 'center' }} rowSpan={2}>DESCRIÇÃO</td>
            <td style={{ ...BORDER_STYLE, padding: '4px', verticalAlign: 'middle' }} rowSpan={2}>UNID.</td>
            <td style={{ ...BORDER_STYLE, padding: '2px', verticalAlign: 'middle' }} colSpan={2}>ANALISADO</td>
            <td style={{ ...BORDER_STYLE, padding: '4px', verticalAlign: 'middle', textAlign: 'right', fontWeight: 'bold' }} rowSpan={1}>
              {formatCurrency(grandTotal)}
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px', verticalAlign: 'middle' }} colSpan={3}>LOCAL DE INTERVENÇÃO</td>
          </tr>
          <tr style={{ fontWeight: 'bold', textAlign: 'center', fontSize: '7.5pt', backgroundColor: '#ffffff' }}>
            <td style={{ ...BORDER_STYLE, padding: '2px', textAlign: 'center' }}>QUANT.</td>
            <td style={{ ...BORDER_STYLE, padding: '2px', textAlign: 'center' }}>PREÇO UNITÁRIO</td>
            <td style={{ ...BORDER_STYLE, padding: '2px', textAlign: 'center' }}>TOTAL</td>
            <td style={{ ...BORDER_STYLE, padding: '2px', textAlign: 'center' }} colSpan={2}>MEMÓRIA DE CALCULO</td>
            <td style={{ ...BORDER_STYLE, padding: '2px', textAlign: 'center' }}>LOCAL DE INTERVENÇÃO</td>
          </tr>

          {/* CORPO DA PLANILHA - CATEGORIAS, ITENS E MEMÓRIAS */}
          {Object.entries(groupedSelected).map(([mainGroupName, subGroups]) => {
            const mainGroupCat = catalog.find(c => c.description === mainGroupName);
            const mainGroupCode = mainGroupCat ? mainGroupCat.item : '';

            return (
              <Fragment key={mainGroupName}>
                {/* LINHA DA CATEGORIA PRINCIPAL (020000, 100000...) SEM VALOR NA LINHA */}
                <tr style={{ fontWeight: 'bold', backgroundColor: '#ffffff', fontSize: '8pt' }}>
                  <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'center', fontFamily: 'monospace' }}>{mainGroupCode}</td>
                  <td style={{ ...BORDER_STYLE, padding: '3px', textTransform: 'uppercase', textAlign: 'left' }}>{mainGroupName}</td>
                  <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                  <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                  <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                  <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                  <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                  <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                  <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
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
                    <Fragment key={subGroupName || 'default'}>
                      {/* LINHA DO SUBGRUPO SE HOUVER (ex: 100400) */}
                      {subGroupName && (
                        <tr style={{ fontWeight: 'bold', backgroundColor: '#ffffff', fontSize: '8pt' }}>
                          <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'center', fontFamily: 'monospace' }}>{subGroupCode}</td>
                          <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'left', textDecoration: 'underline' }}>{subGroupName}</td>
                          <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                          <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                          <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                          <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                          <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                          <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                          <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                        </tr>
                      )}

                      {/* ITENS INDIVIDUAIS */}
                      {items.map(item => {
                        const totalQty = getItemTotalQuantity(item);
                        const unitPrice = item.customPrice !== undefined ? item.customPrice : item.price;
                        const totalPrice = totalQty * unitPrice;
                        const occs = item.occurrences || [];
                        const firstOcc = occs[0] || { memory: '', quantity: '', location: '' };
                        const extraOccs = occs.slice(1);

                        // Extended technical specification from catalog
                        const catalogItem = catalog.find(c => c.item === item.item);
                        const extDesc = catalogItem?.extendedDescription || item.customDescription || '';

                        return (
                          <Fragment key={item.item}>
                            {/* LINHA 1 DO ITEM */}
                            <tr style={{ fontSize: '7.5pt' }}>
                              <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'center', fontFamily: 'monospace', verticalAlign: 'top' }}>
                                {item.customCode || item.item}
                              </td>
                              <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'left', verticalAlign: 'top', fontWeight: 'bold' }}>
                                {item.customTitle || item.description}
                              </td>
                              <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'center', textTransform: 'uppercase', verticalAlign: 'top' }}>
                                {item.customUnit || item.unit}
                              </td>
                              <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                                {formatNumber(totalQty)}
                              </td>
                              <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                                {formatCurrency(unitPrice)}
                              </td>
                              <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                                {formatCurrency(totalPrice)}
                              </td>
                              <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'center', verticalAlign: 'top', fontFamily: 'monospace', fontSize: '7pt' }}>
                                {firstOcc.memory || ''}
                              </td>
                              <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '7pt' }}>
                                {firstOcc.quantity ? formatNumber(Number(evaluateMath(firstOcc.quantity)) || 0) : ''}
                              </td>
                              <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'left', verticalAlign: 'top', fontSize: '7.5pt' }}>
                                {firstOcc.location || ''}
                              </td>
                            </tr>

                            {/* LINHA 2+: ESPECIFICAÇÃO TÉCNICA E/OU OCORRÊNCIA #2 */}
                            {(extDesc || extraOccs.length > 0) && (
                              <tr style={{ fontSize: '7.5pt' }}>
                                <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                                <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'left', verticalAlign: 'top', fontSize: '6.5pt', color: '#1e293b', lineHeight: 1.25, whiteSpace: 'pre-wrap', fontWeight: 'normal' }}>
                                  {extDesc}
                                </td>
                                <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                                <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                                <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                                <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                                <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'center', verticalAlign: 'top', fontFamily: 'monospace', fontSize: '7pt' }}>
                                  {extraOccs[0]?.memory || ''}
                                </td>
                                <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '7pt' }}>
                                  {extraOccs[0]?.quantity ? formatNumber(Number(evaluateMath(extraOccs[0].quantity)) || 0) : ''}
                                </td>
                                <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'left', verticalAlign: 'top', fontSize: '7.5pt' }}>
                                  {extraOccs[0]?.location || ''}
                                </td>
                              </tr>
                            )}

                            {/* OCORRÊNCIAS EXTRAS #3 EM DIANTE */}
                            {extraOccs.slice(1).map(occ => (
                              <tr key={occ.id} style={{ fontSize: '7.5pt' }}>
                                <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                                <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                                <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                                <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                                <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                                <td style={{ ...BORDER_STYLE, padding: '2px' }}></td>
                                <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'center', verticalAlign: 'top', fontFamily: 'monospace', fontSize: '7pt' }}>
                                  {occ.memory || ''}
                                </td>
                                <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '7pt' }}>
                                  {occ.quantity ? formatNumber(Number(evaluateMath(occ.quantity)) || 0) : ''}
                                </td>
                                <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'left', verticalAlign: 'top', fontSize: '7.5pt' }}>
                                  {occ.location || ''}
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}

                      {/* SUB-TOTAL DA CATEGORIA */}
                      <tr style={{ fontWeight: 'bold', backgroundColor: '#ffffff', fontSize: '8pt' }}>
                        <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', textTransform: 'uppercase' }} colSpan={5}>
                          SUB TOTAL =
                        </td>
                        <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {formatCurrency(subGroupTotal)}
                        </td>
                        <td style={{ ...BORDER_STYLE, padding: '2px' }} colSpan={3}></td>
                      </tr>
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}

          {/* TOTAL CUSTO DIRETO */}
          <tr style={{ fontWeight: 'bold', backgroundColor: '#ffffff', fontSize: '8pt' }}>
            <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', textTransform: 'uppercase' }} colSpan={5}>
              TOTAL CUSTO =
            </td>
            <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', whiteSpace: 'nowrap' }}>
              {formatCurrency(totalBudget)}
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px' }} colSpan={3}></td>
          </tr>

          {/* BDI PROJETO */}
          <tr style={{ fontWeight: 'bold', backgroundColor: '#ffffff', fontSize: '8pt' }}>
            <td style={{ ...BORDER_STYLE, padding: '2px' }} colSpan={3}></td>
            <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'center' }}>{(bdiProjRate * 100).toFixed(2)}%</td>
            <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', textTransform: 'uppercase' }}>BDI PROJETO =</td>
            <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', whiteSpace: 'nowrap' }}>
              {totalProj > 0 ? formatCurrency(bdiProjAmount) : '-'}
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px' }} colSpan={3}></td>
          </tr>

          {/* BDI OBRA */}
          <tr style={{ fontWeight: 'bold', backgroundColor: '#ffffff', fontSize: '8pt' }}>
            <td style={{ ...BORDER_STYLE, padding: '2px' }} colSpan={3}></td>
            <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'center' }}>{(bdiRate * 100).toFixed(2)}%</td>
            <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', textTransform: 'uppercase' }}>BDI OBRA =</td>
            <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', whiteSpace: 'nowrap' }}>
              {formatCurrency(bdiObraAmount)}
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px' }} colSpan={3}></td>
          </tr>

          {/* TOTAL GERAL */}
          <tr style={{ fontWeight: 'bold', backgroundColor: '#ffffff', fontSize: '8.5pt' }}>
            <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', textTransform: 'uppercase' }} colSpan={5}>
              TOTAL GERAL =
            </td>
            <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'right', whiteSpace: 'nowrap' }}>
              {formatCurrency(grandTotal)}
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px' }} colSpan={3}></td>
          </tr>

          {/* ROW 21: AVISO CADERNO ESPECIFICAÇÕES EM VERMELHO + BASE + REV */}
          <tr style={{ fontSize: '7pt' }}>
            <td style={{ ...BORDER_STYLE, padding: '3px', textAlign: 'center', fontWeight: 'bold', color: '#dc2626', textTransform: 'uppercase' }} colSpan={6}>
              QUANDO DA CELEBRAÇÃO DO CONTRATO ASSEGURAR QUE A EMPRESA TENHA EM SEU PODER CÓPIA DO CADERNO DE ESPECIFICAÇÕES
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px', textAlign: 'center' }} colSpan={2}>
              <div style={{ fontSize: '5.5pt', color: '#64748b', fontWeight: 'bold' }}>BASE</div>
              <div style={{ fontSize: '6.5pt', fontWeight: '600', color: '#000000' }}>
                {is2026 ? 'PINI, ORSE, SICOR, SINAPI, SUDECAP JAN/26' : 'PINI, ORSE, SICOR, SINAPI, SUDECAP JAN/25'}
              </div>
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px', textAlign: 'center', fontWeight: 'bold', color: '#000000' }}>
              <div style={{ fontSize: '7pt' }}>REV {String(workbook.rev || '00').padStart(2, '0')}</div>
              <div style={{ fontSize: '6.5pt' }}>{monthYearStr}</div>
            </td>
          </tr>

          {/* ROW 22: TÉCNICO RESPONSÁVEL + CREA + DATA */}
          <tr style={{ fontSize: '7.5pt', fontWeight: 'bold' }}>
            <td style={{ ...BORDER_STYLE, padding: '3px 4px', textAlign: 'left' }} colSpan={5}>
              Técnico responsável pela elaboração da planilha: <span style={{ fontWeight: 'normal', textTransform: 'uppercase' }}>{workbook.engenheiro || ''}</span>
            </td>
            <td style={{ ...BORDER_STYLE, padding: '3px 4px', textAlign: 'left' }} colSpan={2}>
              CREA: <span style={{ fontWeight: 'normal' }}>{workbook.crea || ''}</span>
            </td>
            <td style={{ ...BORDER_STYLE, padding: '3px 4px', textAlign: 'left' }} colSpan={2}>
              Data da elaboração: <span style={{ fontWeight: 'normal' }}>{formattedDate}</span>
            </td>
          </tr>

          {/* ROWS 23 A 28: QUADRO OFICIAL DE VALIDAÇÃO */}
          <tr style={{ fontSize: '7pt' }}>
            <td 
              style={{ ...BORDER_STYLE, fontWeight: 'bold', fontSize: '15pt', textAlign: 'center', verticalAlign: 'middle', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px' }} 
              colSpan={2}
              rowSpan={6}
            >
              VALIDAÇÃO
            </td>
            <td style={{ ...BORDER_STYLE, padding: '2px 4px', fontWeight: 'bold' }} colSpan={3}>
              SIM: &nbsp;&nbsp;&nbsp;&nbsp; Validado em: _____/_____/_________ &nbsp;&nbsp;&nbsp;&nbsp; por: ___________________
            </td>
            <td style={{ ...BORDER_STYLE, padding: '4px', fontSize: '6.5pt', lineHeight: 1.3, verticalAlign: 'top', color: '#000000' }} colSpan={4} rowSpan={6}>
              OBS.: Todo processo de atendimento encaminhado para análise/validação é de inteira responsabilidade técnica de quem elabora os mesmos (que esteve em campo e conhece a real necessidade da escola), demonstrando a veracidade dos documentos produzidos.
              <br /><br />
              A validação do processo pelo órgão central serve apenas para conferir a regularidade do procedimento e coerência dos documentos técnicos produzidos.
            </td>
          </tr>
          <tr style={{ fontSize: '7pt' }}>
            <td style={{ ...BORDER_STYLE, padding: '2px 4px', color: '#334155', fontStyle: 'italic' }} colSpan={3}>
              de acordo com dados constantes nesta planilha
            </td>
          </tr>
          <tr style={{ fontSize: '7pt' }}>
            <td style={{ ...BORDER_STYLE, padding: '2px 4px', height: '12px' }} colSpan={3}></td>
          </tr>
          <tr style={{ fontSize: '7pt' }}>
            <td style={{ ...BORDER_STYLE, padding: '2px 4px', fontWeight: 'bold' }} colSpan={3}>
              Não: &nbsp;&nbsp;&nbsp;&nbsp; em: _____/_____/_________ &nbsp;&nbsp;&nbsp;&nbsp; por: ___________________
            </td>
          </tr>
          <tr style={{ fontSize: '7pt' }}>
            <td style={{ ...BORDER_STYLE, padding: '2px 4px', color: '#1e293b' }} colSpan={3}>
              Descrever motivo:
            </td>
          </tr>
          <tr style={{ fontSize: '7pt' }}>
            <td style={{ ...BORDER_STYLE, padding: '2px 4px', color: '#475569', fontStyle: 'italic', height: '16px' }} colSpan={3}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
