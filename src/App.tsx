import { useState, useEffect, useMemo, ReactNode } from 'react';
import { Search, Plus, Trash2, Download, FileSpreadsheet, ChevronRight, ChevronDown, CheckCircle, Edit2, X, Calculator } from 'lucide-react';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface CatalogItem {
  item: string;
  description: string;
  unit: string;
  price: number;
  isCategory: boolean;
  rows: number[];
}

interface SelectedItem extends CatalogItem {
  quantity: string;
  memory: string;
  location: string;
}

interface TreeNode extends CatalogItem {
  children: TreeNode[];
}

const evaluateMath = (expr: string): string => {
  try {
    let sanitized = expr.replace(/,/g, '.').replace(/x/g, '*');
    if (!/^[0-9+\-*/().\s]+$/.test(sanitized)) {
      return '';
    }
    const result = new Function(`return ${sanitized}`)();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return Number(result.toFixed(2)).toString();
    }
    return '';
  } catch {
    return '';
  }
};

function buildTree(items: CatalogItem[]): TreeNode[] {
  const root: TreeNode[] = [];
  const stack: { node: TreeNode, prefix: string }[] = [];

  for (const item of items) {
    const node: TreeNode = { ...item, children: [] };
    
    if (item.isCategory) {
      const prefix = item.item.replace(/0+$/, '');
      while (stack.length > 0 && !prefix.startsWith(stack[stack.length - 1].prefix)) {
        stack.pop();
      }
      if (stack.length === 0) {
        root.push(node);
      } else {
        stack[stack.length - 1].node.children.push(node);
      }
      stack.push({ node, prefix });
    } else {
      if (stack.length === 0) {
        root.push(node);
      } else {
        stack[stack.length - 1].node.children.push(node);
      }
    }
  }
  return root;
}

function App() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Form states for inline editing
  const [activeFormItem, setActiveFormItem] = useState<string | null>(null);
  const [formMemory, setFormMemory] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formLocation, setFormLocation] = useState('');

  // Header Info states
  const [headerInfo, setHeaderInfo] = useState({
    escola: '',
    codEscola: '',
    sre: 'METROPOLITANA B',
    municipio: '',
    iss: '5',
    servicos: ''
  });

  // States for right-side inline editing
  const [activeRightEditItem, setActiveRightEditItem] = useState<string | null>(null);
  const [editFormMemory, setEditFormMemory] = useState('');
  const [editFormQuantity, setEditFormQuantity] = useState('');
  const [editFormLocation, setEditFormLocation] = useState('');

  // Toast Notification state
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetch('/catalogo.json')
      .then(res => res.json())
      .then(data => setCatalog(data))
      .catch(err => console.error("Erro ao carregar catálogo", err));
  }, []);

  const tree = useMemo(() => buildTree(catalog), [catalog]);

  const handleMathChange = (val: string, setMem: (v:string)=>void, setQtd: (v:string)=>void) => {
    setMem(val);
    const result = evaluateMath(val);
    if (result) {
      setQtd(result);
    }
  };

  const openForm = (item: CatalogItem) => {
    const existing = selectedItems.find(i => i.item === item.item);
    if (existing) {
      setFormMemory(existing.memory);
      setFormQuantity(existing.quantity);
      setFormLocation(existing.location);
    } else {
      setFormMemory('');
      setFormQuantity('');
      setFormLocation('');
    }
    setActiveFormItem(item.item);
  };

  const saveForm = (item: CatalogItem) => {
    const newItem = {
      ...item,
      memory: formMemory,
      quantity: formQuantity,
      location: formLocation
    };
    setSelectedItems(prev => {
      const exists = prev.find(i => i.item === item.item);
      if (exists) return prev.map(i => i.item === item.item ? newItem : i);
      return [...prev, newItem];
    });
    setActiveFormItem(null);
  };

  const openEditForm = (item: SelectedItem) => {
    setEditFormMemory(item.memory);
    setEditFormQuantity(item.quantity);
    setEditFormLocation(item.location);
    setActiveRightEditItem(item.item);
  };

  const saveEditForm = (itemCode: string) => {
    setSelectedItems(prev => prev.map(i => i.item === itemCode ? { ...i, memory: editFormMemory, quantity: editFormQuantity, location: editFormLocation } : i));
    setActiveRightEditItem(null);
  };

  const handleRemoveItem = (itemCode: string) => {
    setSelectedItems(selectedItems.filter(i => i.item !== itemCode));
  };

  // ---- EXPORT LOGIC ----
  const exportExcel = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/template.xlsx');
      const arrayBuffer = await response.arrayBuffer();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.getWorksheet("Plan1");

      if (!worksheet) throw new Error("Aba 'Plan1' não encontrada no template.");

      // Fill Header Info
      if (headerInfo.escola) worksheet.getCell('B2').value = headerInfo.escola;
      if (headerInfo.codEscola) worksheet.getCell('D2').value = headerInfo.codEscola;
      if (headerInfo.sre) worksheet.getCell('G2').value = headerInfo.sre;
      if (headerInfo.municipio) worksheet.getCell('B3').value = headerInfo.municipio;
      if (headerInfo.iss) worksheet.getCell('D3').value = parseFloat(headerInfo.iss) / 100; // As percentage
      if (headerInfo.servicos) worksheet.getCell('F3').value = headerInfo.servicos;

      selectedItems.forEach(item => {
        const firstRowIdx = item.rows[0];
        const row = worksheet.getRow(firstRowIdx);
        if (item.quantity) row.getCell(4).value = parseFloat(item.quantity);
        if (item.memory) row.getCell(7).value = item.memory;
        if (item.location) row.getCell(8).value = item.location;
        row.commit();
      });

      const selectedItemCodes = new Set(selectedItems.map(i => i.item));
      const activeCategories = new Set<string>();

      selectedItems.forEach(item => {
        catalog.filter(c => c.isCategory).forEach(cat => {
          const catPrefix = cat.item.replace(/0+$/, '');
          if (item.item.startsWith(catPrefix)) {
            activeCategories.add(cat.item);
          }
        });
      });

      const rowsToDelete: number[] = [];

      catalog.forEach(catItem => {
        const isSelected = selectedItemCodes.has(catItem.item);
        const isCategory = catItem.isCategory;
        const isActiveCategory = activeCategories.has(catItem.item);

        if ((!isCategory && !isSelected) || (isCategory && !isActiveCategory)) {
          catItem.rows.forEach(r => {
            rowsToDelete.push(r);
          });
        }
      });

      // Sort ascending for formula shifter
      rowsToDelete.sort((a, b) => a - b);

      // Adjust formulas before deleting rows
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.type === ExcelJS.ValueType.Formula) {
            let f = cell.formula;
            if (f) {
              let newF = f.replace(/([A-Z]+)(\d+)/g, (match, col, rowStr) => {
                let r = parseInt(rowStr, 10);
                let shift = 0;
                for (let d of rowsToDelete) {
                  if (d < r) shift++;
                  else if (d === r) shift++; // if the referenced row itself is deleted
                }
                // Avoid dropping below row 1
                const newRow = Math.max(1, r - shift);
                return col + newRow;
              });
              
              if (typeof cell.value === 'object' && cell.value !== null) {
                cell.value = { ...cell.value, formula: newF };
              }
            }
          }
        });
      });

      // Delete rows from bottom to top
      const sortedDesc = [...rowsToDelete].sort((a, b) => b - a);
      for (let r of sortedDesc) {
        worksheet.spliceRows(r, 1);
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, "Orcamento_SEEMG_Preenchido.xlsx");

    } catch (error) {
      console.error(error);
      showToast("Erro ao exportar a planilha. Verifique o console.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const ws = workbook.getWorksheet("Plan1");

      if (!ws) {
        showToast("Aba 'Plan1' não encontrada no arquivo.", "error");
        return;
      }

      // Lê o cabeçalho
      const escola = ws.getCell('B2').value?.toString() || '';
      const codEscola = ws.getCell('D2').value?.toString() || '';
      const sre = ws.getCell('G2').value?.toString() || '';
      const municipio = ws.getCell('B3').value?.toString() || '';
      let iss = ws.getCell('D3').value;
      iss = iss !== null && iss !== undefined ? (parseFloat(iss.toString()) * 100).toString() : '5';
      const servicos = ws.getCell('F3').value?.toString() || '';

      setHeaderInfo({ escola, codEscola, sre, municipio, iss, servicos });

      const importedItems: SelectedItem[] = [];

      ws.eachRow((row) => {
        const itemCodeCell = row.getCell(1).value;
        if (itemCodeCell) {
          const itemCode = itemCodeCell.toString().trim();
          const catalogItem = catalog.find(c => c.item === itemCode);
          
          if (catalogItem && !catalogItem.isCategory) {
            let qty = row.getCell(4).value;
            if (qty && typeof qty === 'object' && 'result' in qty) {
               qty = (qty as any).result;
            }
            
            if (qty !== null && qty !== undefined && qty !== '') {
              const memory = row.getCell(7).value?.toString() || '';
              const location = row.getCell(8).value?.toString() || '';
              
              importedItems.push({
                ...catalogItem,
                quantity: qty.toString(),
                memory: memory,
                location: location
              });
            }
          }
        }
      });

      setSelectedItems(importedItems);
      showToast(`Planilha importada com sucesso! ${importedItems.length} serviços encontrados.`, "success");

    } catch (error) {
      console.error(error);
      showToast("Erro ao ler o arquivo XLSX.", "error");
    } finally {
      // reseta o input para permitir importar o mesmo arquivo novamente se precisar
      event.target.value = '';
    }
  };

  const totalBudget = selectedItems.reduce((acc, item) => {
    const q = parseFloat(item.quantity) || 0;
    return acc + (q * item.price);
  }, 0);

  // ---- TREE RENDERER ----
  const renderTree = (nodes: TreeNode[], term: string): ReactNode => {
    const lowerTerm = term.toLowerCase();
    
    // Filter logic: if a node matches, or has any matching children, we show it.
    const filterNode = (node: TreeNode): boolean => {
      if (!term) return true;
      if (!node.isCategory && node.description.toLowerCase().includes(lowerTerm)) return true;
      if (!node.isCategory && node.item.includes(term)) return true;
      if (node.children.some(filterNode)) return true;
      return false;
    };

    return nodes.filter(filterNode).map(node => {
      if (node.isCategory) {
        return (
          <details key={node.item} className="group mb-1" open={!!term}>
            <summary className="flex items-center gap-2 p-2 bg-slate-200/50 hover:bg-slate-200 rounded-md cursor-pointer list-none select-none">
              <ChevronRight size={16} className="text-slate-500 group-open:rotate-90 transition-transform" />
              <span className="font-mono text-xs font-semibold text-slate-600 bg-white px-1.5 py-0.5 rounded">{node.item}</span>
              <span className="text-sm font-bold text-slate-800 uppercase tracking-wide truncate">{node.description}</span>
            </summary>
            <div className="pl-4 mt-1 border-l-2 border-slate-100 ml-3 flex flex-col gap-1">
              {renderTree(node.children, term)}
            </div>
          </details>
        );
      } else {
        const isAdded = selectedItems.some(i => i.item === node.item);
        const isFormActive = activeFormItem === node.item;

        return (
          <div key={node.item} className={`flex flex-col border rounded-lg transition-colors overflow-hidden ${isAdded ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 bg-white hover:border-emerald-200'}`}>
            <div 
              className="flex justify-between items-start gap-4 p-3 cursor-pointer"
              onClick={() => !isAdded && (isFormActive ? setActiveFormItem(null) : openForm(node))}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{node.item}</span>
                  <span className="text-sm font-bold text-slate-700">{node.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / {node.unit}</span>
                  {isAdded && <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle size={12}/> Adicionado</span>}
                </div>
                <p className={`text-sm text-slate-600 ${isFormActive ? '' : 'line-clamp-2'}`}>{node.description}</p>
              </div>
            </div>

            {/* INLINE FORM */}
            {isFormActive && !isAdded && (
              <div className="p-3 bg-emerald-50/50 border-t border-emerald-100 flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
                      <Calculator size={12} className="text-emerald-600"/> Memória de Cálculo
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="Ex: 2*5 + 10"
                      value={formMemory}
                      onChange={e => handleMathChange(e.target.value, setFormMemory, setFormQuantity)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Qtd. ({node.unit})</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                      placeholder="Qtd final"
                      value={formQuantity}
                      onChange={e => setFormQuantity(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Local de Intervenção</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="Ex: Bloco A, Sala 3"
                      value={formLocation}
                      onChange={e => setFormLocation(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-1">
                  <button onClick={() => setActiveFormItem(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md">Cancelar</button>
                  <button onClick={() => saveForm(node)} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md flex items-center gap-2">
                    <Plus size={16}/> Adicionar ao Orçamento
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      }
    });
  };

  // Group selected items by Level 1 category for right panel
  const groupedSelected = useMemo(() => {
    const groups: Record<string, SelectedItem[]> = {};
    selectedItems.forEach(item => {
      const catPrefix = item.item.substring(0, 2) + "0000";
      const cat = catalog.find(c => c.item === catPrefix);
      const catName = cat ? cat.description : "Outros";
      if (!groups[catName]) groups[catName] = [];
      groups[catName].push(item);
    });
    return groups;
  }, [selectedItems, catalog]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-emerald-800 text-white shadow-md p-4 sticky top-0 z-10">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={28} className="text-emerald-300" />
            <h1 className="text-xl font-bold tracking-wide">Orçamentos SEEMG</h1>
          </div>
          <div className="text-sm font-bold bg-emerald-900/50 px-4 py-2 rounded-lg shadow-inner border border-emerald-700">
            Total: {totalBudget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        </div>
      </header>

      <main className="container mx-auto flex-1 p-4 grid grid-cols-1 lg:grid-cols-5 gap-6 h-full">
        
        {/* Lado Esquerdo: Busca e Catálogo */}
        <section className="bg-white rounded-xl shadow-md border border-slate-200 flex flex-col h-[calc(100vh-100px)] lg:col-span-3">
          
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 rounded-t-xl space-y-4">
            
            {/* Dados da Obra Form */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Dados da Obra (Cabeçalho)</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Escola Estadual</label>
                  <input type="text" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-emerald-500 outline-none" value={headerInfo.escola} onChange={e => setHeaderInfo({...headerInfo, escola: e.target.value})} placeholder="Ex: EE Afonso Pena" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Cód. Escola</label>
                  <input type="text" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-emerald-500 outline-none" value={headerInfo.codEscola} onChange={e => setHeaderInfo({...headerInfo, codEscola: e.target.value})} placeholder="123456" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Município</label>
                  <input type="text" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-emerald-500 outline-none" value={headerInfo.municipio} onChange={e => setHeaderInfo({...headerInfo, municipio: e.target.value})} placeholder="Belo Horizonte" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">S.R.E.</label>
                  <input type="text" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-emerald-500 outline-none" value={headerInfo.sre} onChange={e => setHeaderInfo({...headerInfo, sre: e.target.value})} placeholder="METROPOLITANA B" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Serviços</label>
                  <input type="text" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-emerald-500 outline-none" value={headerInfo.servicos} onChange={e => setHeaderInfo({...headerInfo, servicos: e.target.value})} placeholder="Reforma" />
                </div>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow outline-none text-slate-700 bg-white shadow-sm"
                placeholder="Buscar por nome ou código do serviço no catálogo..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-slate-50/30">
            {catalog.length === 0 ? (
               <div className="text-center p-8 text-slate-400">Carregando catálogo...</div>
            ) : (
               renderTree(tree, searchTerm)
            )}
          </div>
        </section>

        {/* Lado Direito: Itens Selecionados */}
        <section className="bg-white rounded-xl shadow-md border border-slate-200 flex flex-col h-[calc(100vh-100px)] lg:col-span-2">
          <div className="p-4 border-b border-slate-100 bg-emerald-50/50 rounded-t-xl flex justify-between items-center">
            <h2 className="text-lg font-bold text-emerald-900">Resumo ({selectedItems.length})</h2>
            <div className="flex gap-2">
              <label className="flex items-center gap-2 bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50 cursor-pointer px-4 py-2 rounded-lg font-medium shadow-sm transition-all active:scale-95">
                Importar
                <input type="file" accept=".xlsx" className="hidden" onChange={handleImportExcel} />
              </label>
              <button
                onClick={exportExcel}
                disabled={selectedItems.length === 0 || isExporting}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all active:scale-95"
              >
                <Download size={18} />
                {isExporting ? "Gerando..." : "Gerar XLSX"}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {selectedItems.length === 0 ? (
              <div className="text-center p-12 text-slate-400 flex flex-col items-center gap-4 mt-10">
                <div className="bg-slate-100 p-4 rounded-full">
                  <FileSpreadsheet size={48} className="text-slate-300" />
                </div>
                <p>Nenhum serviço adicionado ainda.<br/>Selecione um item no catálogo ao lado.</p>
              </div>
            ) : (
              Object.entries(groupedSelected).map(([catName, items]) => (
                <div key={catName}>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 border-b pb-1">{catName}</h3>
                  <div className="space-y-2">
                    {items.map(item => {
                      const isEditing = activeRightEditItem === item.item;
                      return (
                      <div key={item.item} className={`flex flex-col border rounded-lg transition-colors overflow-hidden ${isEditing ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 bg-white hover:border-emerald-200'}`}>
                        <div className="p-3 hover:shadow-md transition-shadow group flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{item.item}</span>
                              <span className="text-xs font-bold text-emerald-700">{item.quantity} {item.unit}</span>
                            </div>
                            <p className="text-sm text-slate-800 font-medium truncate" title={item.description}>{item.description}</p>
                            <p className="text-xs text-slate-500 truncate mt-1">Local: {item.location || '-'}</p>
                          </div>
                          {!isEditing && (
                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEditForm(item)} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600 rounded">
                                <Edit2 size={14}/>
                              </button>
                              <button onClick={() => handleRemoveItem(item.item)} className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded">
                                <Trash2 size={14}/>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* RIGHT INLINE FORM */}
                        {isEditing && (
                          <div className="p-3 bg-emerald-50/50 border-t border-emerald-100 flex flex-col gap-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
                                  <Calculator size={12} className="text-emerald-600"/> Memória de Cálculo
                                </label>
                                <input
                                  type="text"
                                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                  placeholder="Ex: 2*5 + 10"
                                  value={editFormMemory}
                                  onChange={e => handleMathChange(e.target.value, setEditFormMemory, setEditFormQuantity)}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Qtd. ({item.unit})</label>
                                <input
                                  type="number"
                                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                  placeholder="Qtd final"
                                  value={editFormQuantity}
                                  onChange={e => setEditFormQuantity(e.target.value)}
                                />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-slate-600 mb-1">Local de Intervenção</label>
                                <input
                                  type="text"
                                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                  placeholder="Ex: Bloco A, Sala 3"
                                  value={editFormLocation}
                                  onChange={e => setEditFormLocation(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-1">
                              <button onClick={() => setActiveRightEditItem(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md">Cancelar</button>
                              <button onClick={() => saveEditForm(item.item)} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md flex items-center gap-2">
                                <CheckCircle size={16}/> Salvar Alterações
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
          <div className={`px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            {toast.type === 'success' ? <CheckCircle size={24}/> : <X size={24} />}
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
