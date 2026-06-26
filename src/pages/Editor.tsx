import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Search, Plus, Trash2, Download, FileSpreadsheet, CheckCircle, Edit2, X, Calculator, Save, AlertTriangle, ChevronRight, Printer } from 'lucide-react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { db } from '../services/db';
import type { Workbook } from '../services/db';

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

export function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const versionId = searchParams.get('version');

  const [workbook, setWorkbook] = useState<Workbook | null>(null);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [history, setHistory] = useState<SelectedItem[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lastSavedItemsJson, setLastSavedItemsJson] = useState<string>('');

  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states for inline editing
  const [activeFormItem, setActiveFormItem] = useState<string | null>(null);
  const [formMemory, setFormMemory] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formLocation, setFormLocation] = useState('');

  // States for right-side inline editing
  const [activeRightEditItem, setActiveRightEditItem] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [editFormMemory, setEditFormMemory] = useState('');
  const [editFormQuantity, setEditFormQuantity] = useState('');
  const [editFormLocation, setEditFormLocation] = useState('');

  // States for Header Edit
  const [isHeaderEditModalOpen, setIsHeaderEditModalOpen] = useState(false);
  const [headerForm, setHeaderForm] = useState<Partial<Workbook>>({});

  // Toast Notification state
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const updateItems = (newItems: SelectedItem[] | ((prev: SelectedItem[]) => SelectedItem[])) => {
    setSelectedItems(prev => {
      const next = typeof newItems === 'function' ? newItems(prev) : newItems;
      setHistory(h => {
        const newHistory = h.slice(0, historyIndex + 1);
        newHistory.push(next);
        setHistoryIndex(newHistory.length - 1);
        return newHistory;
      });
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (historyIndex > 0) {
          setHistoryIndex(prev => {
            const nextIdx = prev - 1;
            setSelectedItems(history[nextIdx]);
            return nextIdx;
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, historyIndex]);

  // Draft Auto-save
  useEffect(() => {
    if (!id || historyIndex === -1) return;
    const saveDraft = async () => {
      await db.items.saveAll(id, selectedItems.map(i => ({
        item_code: i.item,
        quantity: i.quantity,
        memory: i.memory,
        location: i.location
      })));
    };
    const timer = setTimeout(saveDraft, 1000);
    return () => clearTimeout(timer);
  }, [selectedItems, id, historyIndex]);

  useEffect(() => {
    if (!id) return;
    
    const loadData = async () => {
      const wb = await db.workbooks.get(id);
      if (!wb) {
        navigate('/dashboard');
        return;
      }
      setWorkbook(wb);
      setHeaderForm(wb);

      let loadedItems: any[] = [];
      
      if (versionId) {
        const versions = await db.versions.list(id);
        const version = versions.find(v => v.id === versionId);
        if (version) {
          loadedItems = JSON.parse(version.items_json);
          setLastSavedItemsJson(version.items_json);
        } else {
          showToast("Versão não encontrada.", "error");
        }
      } else {
        loadedItems = await db.items.list(id);
        const versions = await db.versions.list(id);
        if (versions.length > 0) {
          setLastSavedItemsJson(versions[0].items_json);
        } else {
          setLastSavedItemsJson(JSON.stringify(loadedItems));
        }
      }
      
      fetch('/catalogo.json')
        .then(res => res.json())
        .then((data: CatalogItem[]) => {
          setCatalog(data);

          let restoredItems: SelectedItem[] = [];
          if (loadedItems.length > 0) {
            restoredItems = loadedItems.map(loaded => {
              const itemCode = loaded.item_code || loaded.item;
              const catItem = data.find(c => c.item === itemCode);
              if (!catItem) return null;
              return {
                ...(catItem as CatalogItem),
                quantity: loaded.quantity,
                memory: loaded.memory,
                location: loaded.location
              };
            }).filter((item): item is SelectedItem => item !== null);
          }
          
          setSelectedItems(restoredItems);
          setHistory([restoredItems]);
          setHistoryIndex(0);
        })
        .catch(console.error);
    };

    loadData();
  }, [id, navigate, versionId]);

  const tree = useMemo(() => buildTree(catalog), [catalog]);

  const handleClose = () => {
    const isSaved = JSON.stringify(selectedItems) === lastSavedItemsJson;
    if (!isSaved) {
      setShowCloseConfirm(true);
    } else {
      navigate('/dashboard');
    }
  };

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
    updateItems(prev => {
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
    updateItems(prev => prev.map(i => i.item === itemCode ? { ...i, memory: editFormMemory, quantity: editFormQuantity, location: editFormLocation } : i));
    setActiveRightEditItem(null);
  };

  const handleRemoveItem = (itemCode: string) => {
    updateItems(prev => prev.filter(i => i.item !== itemCode));
  };

  // ---- EXPORT LOGIC ----
  const handleExportExcel = async () => {
    if (!workbook) return;
    try {
      setIsExporting(true);

      const response = await fetch('/template.xlsx');
      const arrayBuffer = await response.arrayBuffer();

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(arrayBuffer);
      
      const worksheet = wb.getWorksheet("Plan1");
      if (!worksheet) {
        throw new Error("Aba 'Plan1' não encontrada no template.");
      }

      worksheet.getCell('A2').value = `ESCOLA ESTADUAL: ${workbook.escola || ''}`;
      worksheet.getCell('C2').value = `COD ESCOLA: ${workbook.cod_escola || ''}`;
      worksheet.getCell('G2').value = workbook.sre;
      worksheet.getCell('A3').value = `MUNICÍPIO: ${workbook.municipio || ''}`;
      worksheet.getCell('D3').value = workbook.iss ? parseFloat(workbook.iss) / 100 : 0.05;
      worksheet.getCell('F3').value = workbook.servicos;

      worksheet.getCell('A2034').value = `Nome do técnico responsável pela elaboração da planilha: ${workbook.engenheiro ? workbook.engenheiro.toUpperCase() : ''}`;
      worksheet.getCell('E2034').value = `CREA-MG: ${workbook.crea ? workbook.crea : ''}`;
      if (workbook.data_elaboracao) {
        const d = new Date(workbook.data_elaboracao);
        worksheet.getCell('I2034').value = `Data da elaboração: ${d.toLocaleDateString('pt-BR', {timeZone: 'UTC'})}`;
      } else {
        worksheet.getCell('I2034').value = `Data da elaboração: `;
      }

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

      catalog.forEach(catItem => {
        const isSelected = selectedItemCodes.has(catItem.item);
        const isCategory = catItem.isCategory;
        const isActiveCategory = activeCategories.has(catItem.item);

        if ((!isCategory && !isSelected) || (isCategory && !isActiveCategory)) {
          let lastRowIdx = 0;
          catItem.rows.forEach(r => {
            const row = worksheet.getRow(r);
            row.hidden = true;
            if (!isCategory) {
              row.getCell(4).value = null;
            }
            row.commit();
            lastRowIdx = r;
          });

          if (!isCategory && lastRowIdx > 0) {
            const nextRow = worksheet.getRow(lastRowIdx + 1);
            const col1 = nextRow.getCell(1).text;
            const col2 = nextRow.getCell(2).text;
            const col3 = nextRow.getCell(3).text;
            
            if (!col1 && !col2 && (!col3 || !col3.includes('SUB-TOT'))) {
               nextRow.hidden = true;
               nextRow.commit();
            }
          }

          if (isCategory && !isActiveCategory && lastRowIdx > 0) {
            let r = lastRowIdx + 1;
            while (r < 3000) {
              const row = worksheet.getRow(r);
              const col3 = row.getCell(3).text;
              if (col3 && col3.includes('SUB-TOT')) {
                 row.hidden = true;
                 row.commit();
                 break;
              }
              const col1 = row.getCell(1).text;
              if (col1 && col1.endsWith('0000')) {
                 break;
              }
              r++;
            }
          }
        }
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

      const exportHistoryKey = `export_history_${workbook.id}`;
      const exportHistoryJson = localStorage.getItem(exportHistoryKey);
      let exportHistory: string[] = exportHistoryJson ? JSON.parse(exportHistoryJson) : [];
      
      const currentJson = JSON.stringify(selectedItems);
      if (exportHistory.length === 0 || exportHistory[exportHistory.length - 1] !== currentJson) {
         exportHistory.push(currentJson);
         localStorage.setItem(exportHistoryKey, JSON.stringify(exportHistory));
      }

      let major = 1;
      let minor = 0;
      let prevCodes = new Set<string>();
      let prevJson = "";

      for (const vJson of exportHistory) {
        const items = JSON.parse(vJson);
        const codes = new Set<string>(items.map((i: any) => i.item));
        
        let codesChanged = false;
        if (codes.size !== prevCodes.size) {
          codesChanged = true;
        } else {
          for (const code of codes) {
            if (!prevCodes.has(code)) codesChanged = true;
          }
        }
        
        if (codesChanged && prevCodes.size > 0) {
          major++;
          minor = 0;
        } else if (!codesChanged && prevCodes.size > 0) {
          if (vJson !== prevJson) {
            minor++;
          }
        }
        
        prevCodes = codes;
        prevJson = vJson;
      }

      const versionString = minor === 0 ? `V${major}` : `V${major}.${minor}`;
      const escolaName = workbook.escola.replace(/\s+/g, '');
      const dataFormatada = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
      const fileName = `${escolaName}_${dataFormatada}_${versionString}.xlsx`;

      saveAs(blob, fileName);

    } catch (error) {
      console.error(error);
      showToast("Erro ao exportar a planilha. Verifique o console.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const saveToCloud = async () => {
    if (!workbook) return;
    setIsSaving(true);
    try {
      await db.versions.create(workbook.id, selectedItems);
      setLastSavedItemsJson(JSON.stringify(selectedItems));
      showToast("Versão salva na nuvem com sucesso!", "success");
    } catch (e) {
      console.error(e);
      showToast("Erro ao salvar versão na nuvem.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const totalBudget = selectedItems.reduce((acc, item) => {
    const q = parseFloat(item.quantity) || 0;
    return acc + (q * item.price);
  }, 0);

  const renderTree = (nodes: TreeNode[], term: string): ReactNode => {
    const lowerTerm = term.toLowerCase();
    
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
                      list="locations-list"
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

  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>();
    selectedItems.forEach(i => {
      if (i.location && i.location.trim() !== '') {
        locs.add(i.location.trim());
      }
    });
    return Array.from(locs).sort();
  }, [selectedItems]);

  if (!workbook) return null;

  const bdiRate = 0.2443; // BDI Obra padrão: 24.43%
  const bdiAmount = totalBudget * bdiRate;
  const grandTotal = totalBudget + bdiAmount;

  const isCloudSaveDisabled = isSaving || JSON.stringify(selectedItems) === lastSavedItemsJson;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <datalist id="locations-list">
        {uniqueLocations.map(loc => (
          <option key={loc} value={loc} />
        ))}
      </datalist>

      {/* MODAL DE CONFIRMAÇÃO DE SAÍDA */}
      {showCloseConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3 text-amber-600 mb-4">
                <AlertTriangle size={24} />
                <h3 className="text-lg font-bold text-slate-800">Alterações não salvas</h3>
              </div>
              <p className="text-slate-600 mb-6">
                Você tem alterações que não foram salvas na nuvem. Deseja salvar antes de sair?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCloseConfirm(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg font-medium transition-colors"
                >
                  Sair sem Salvar
                </button>
                <button
                  onClick={async () => {
                    await saveToCloud();
                    navigate('/dashboard');
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                >
                  Salvar e Sair
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER PRINCIPAL */}
      <header className="bg-emerald-800 text-white shadow-md p-4 sticky top-0 z-10 print:hidden">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={28} className="text-emerald-300" />
            <h1 className="text-xl font-bold tracking-wide">Editor de Orçamento</h1>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex gap-2 mr-2 border-r border-emerald-700/50 pr-5">
              <button
                onClick={handlePrint}
                disabled={selectedItems.length === 0}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95"
                title="Imprimir ou Salvar PDF"
              >
                <Printer size={18} />
                <span className="hidden sm:inline">PDF</span>
              </button>
              <button
                onClick={handleExportExcel}
                disabled={selectedItems.length === 0 || isExporting}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95"
              >
                <Download size={18} />
                <span className="hidden sm:inline">{isExporting ? "Gerando..." : "XLSX"}</span>
              </button>
            </div>
            
            <button 
              onClick={saveToCloud}
              disabled={isCloudSaveDisabled}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors ${isCloudSaveDisabled ? 'bg-emerald-900/40 text-emerald-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
            >
              <Save size={18} /> {isSaving ? 'Salvando...' : 'Salvar Nuvem'}
            </button>
            <button onClick={handleClose} className="p-2 bg-emerald-900/50 hover:bg-red-600 rounded-lg transition-colors border border-emerald-700 hover:border-red-600" title="Fechar Editor">
              <X size={20} className="text-emerald-100" />
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto h-full flex flex-col gap-4 p-4 print:block print:p-0 flex-1">
        
        {/* Dados da Obra Info (FULL WIDTH) */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 shadow-sm flex flex-col gap-2 relative group print:hidden">
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => setIsHeaderEditModalOpen(true)}
              className="bg-white text-emerald-700 p-1.5 rounded-md shadow-sm border border-emerald-200 hover:bg-emerald-100"
              title="Editar Dados da Obra"
            >
              <Edit2 size={16} />
            </button>
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 pr-10 w-full">
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-600 block">Escola</span>
              <span className="text-sm font-medium text-slate-800">{workbook.escola}</span>
            </div>
            {workbook.cod_escola && (
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-600 block">Código</span>
                <span className="text-sm font-medium text-slate-800">{workbook.cod_escola}</span>
              </div>
            )}
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-600 block">Município</span>
              <span className="text-sm font-medium text-slate-800">{workbook.municipio || '-'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-600 block">SRE</span>
              <span className="text-sm font-medium text-slate-800">{workbook.sre || '-'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-600 block">Serviços</span>
              <span className="text-sm font-medium text-slate-800">{workbook.servicos || '-'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-600 block">ISS</span>
              <span className="text-sm font-medium text-slate-800">{workbook.iss}%</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
          {/* Lado Esquerdo: Busca e Catálogo */}
          <div className="flex flex-col h-full lg:w-1/3 print:hidden gap-3">
            <h2 className="text-lg font-bold text-emerald-900 px-1">Pesquisa de Itens</h2>
            <section className="bg-white rounded-xl shadow-md border border-slate-200 flex flex-col flex-1 min-h-0">
            
            <div className="p-4 border-b border-slate-200 bg-slate-50/80 rounded-t-xl space-y-4">
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
          </div>

          {/* Lado Direito: Itens Selecionados */}
          <div className="flex flex-col h-full lg:w-2/3 print:border-none print:shadow-none print:h-auto print:block print:w-full gap-3">
            <h2 className="text-lg font-bold text-emerald-900 px-1 print:hidden">Orçamento ({selectedItems.length})</h2>
            <section className="bg-white rounded-xl shadow-md border border-slate-200 flex flex-col flex-1 print:border-none print:shadow-none min-h-0">
          <div className="p-4 border-b border-slate-100 bg-emerald-50/50 rounded-t-xl flex flex-col gap-4 print:bg-white print:border-none print:p-0 print:mb-6">
            
            {/* Cabeçalho Impressão */}
            <div className="hidden print:block mb-6 border-b-2 border-emerald-800 pb-4">
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-black text-emerald-900">Relatório de Orçamento</h1>
                <p className="text-lg font-bold text-slate-700">Data: {new Date(workbook.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-slate-700">
                <p><strong>Escola:</strong> {workbook.escola}</p>
                <p><strong>Município:</strong> {workbook.municipio}</p>
                <p><strong>Código:</strong> {workbook.cod_escola}</p>
                <p><strong>SRE:</strong> {workbook.sre}</p>
              </div>
            </div>



            {/* Linha 2: Totais */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 print:grid-cols-3 print:gap-4 print:mb-8">
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex items-center justify-between shadow-sm">
                <span className="text-[10px] uppercase font-bold text-slate-500">Custo Direto</span>
                <span className="text-sm font-bold text-slate-800">{totalBudget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex items-center justify-between shadow-sm">
                <span className="text-[10px] uppercase font-bold text-slate-500">BDI (24.43%)</span>
                <span className="text-sm font-bold text-slate-800">{bdiAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
              <div className="bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2.5 flex items-center justify-between shadow-sm">
                <span className="text-[10px] uppercase font-bold text-emerald-700">Total Geral</span>
                <span className="text-sm font-black text-emerald-900">{grandTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
            </div>

          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 print:overflow-visible print:p-0">
            {selectedItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 print:hidden">
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
                            <div className="print:hidden">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{item.item}</span>
                                <span className="text-xs font-bold text-emerald-700">{item.quantity} {item.unit}</span>
                              </div>
                              <div className="flex justify-between items-start gap-2">
                                <p className="text-sm text-slate-800 font-medium line-clamp-3 leading-snug" title={item.description}>{item.description}</p>
                                <span className="text-xs font-bold text-slate-600 whitespace-nowrap bg-slate-100 px-2 py-0.5 rounded border border-slate-200 mt-0.5">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(evaluateMath(item.quantity) || 0) * item.price)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate mt-1">Local: {item.location || '-'}</p>
                            </div>
                            
                            {/* Layout Específico para Impressão */}
                            <div className="hidden print:block">
                              <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-slate-600">{item.item}</span>
                                  <h3 className="text-sm font-bold text-slate-900">{item.description}</h3>
                                </div>
                              </div>
                              <div className="grid grid-cols-4 gap-2 text-xs text-slate-700 mt-2">
                                <p><strong>Local:</strong> {item.location || '-'}</p>
                                <p><strong>Qtd:</strong> {item.quantity} {item.unit}</p>
                                <p><strong>Unitário:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}</p>
                                <p className="text-right"><strong>Total:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(evaluateMath(item.quantity) || 0) * item.price)}</p>
                              </div>
                            </div>
                          </div>
                          {!isEditing && (
                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
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
                                  list="locations-list"
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
        </div>
        </div>
      </main>

      {/* HEADER EDIT MODAL */}
      {isHeaderEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Edit2 className="text-emerald-600" /> Editar Dados da Obra
              </h2>
              <button onClick={() => setIsHeaderEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const updated = await db.workbooks.update(workbook.id, headerForm);
              if (updated) setWorkbook(updated);
              setIsHeaderEditModalOpen(false);
              showToast("Dados atualizados com sucesso!", "success");
            }} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Escola Estadual</label>
                  <input type="text" value={headerForm.escola || ''} onChange={e => setHeaderForm({...headerForm, escola: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cód. Escola</label>
                  <input type="text" value={headerForm.cod_escola || ''} onChange={e => setHeaderForm({...headerForm, cod_escola: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Município</label>
                  <input type="text" value={headerForm.municipio || ''} onChange={e => setHeaderForm({...headerForm, municipio: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">S.R.E.</label>
                  <input type="text" value={headerForm.sre || ''} onChange={e => setHeaderForm({...headerForm, sre: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Serviços da Planilha</label>
                  <input type="text" value={headerForm.servicos || ''} onChange={e => setHeaderForm({...headerForm, servicos: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Taxa ISS (%)</label>
                  <input type="number" step="0.01" value={headerForm.iss || ''} onChange={e => setHeaderForm({...headerForm, iss: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                
                <div className="col-span-full border-t border-slate-100 mt-2 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Informações Opcionais Adicionais</h3>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Engenheiro(a)</label>
                  <input type="text" value={headerForm.engenheiro || ''} onChange={e => setHeaderForm({...headerForm, engenheiro: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">CREA</label>
                  <input type="text" value={headerForm.crea || ''} onChange={e => setHeaderForm({...headerForm, crea: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data Elaboração</label>
                  <input type="date" value={headerForm.data_elaboracao || ''} onChange={e => setHeaderForm({...headerForm, data_elaboracao: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
              </div>
              
              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 mt-6 sticky bottom-0 bg-white">
                <button type="button" onClick={() => setIsHeaderEditModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm">
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
          <div className={`px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
