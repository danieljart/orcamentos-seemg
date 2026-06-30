import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Search, Plus, Trash2, Download, FileSpreadsheet, CheckCircle, Edit2, X, Calculator, Save, AlertTriangle, ChevronRight, Printer, Loader2, History } from 'lucide-react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { db } from '../services/db';
import type { Workbook } from '../services/db';
import { SchoolSearch } from '../components/SchoolSearch';
import { getIssForMunicipio, saveIssForMunicipio } from '../lib/iss';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ThemeToggle } from '../components/ThemeToggle';

interface CatalogItem {
  item: string;
  description: string;
  unit: string;
  price: number;
  isCategory: boolean;
  rows: number[];
}

export interface SelectedItemOccurrence {
  id: string;
  quantity: string;
  memory: string;
  location: string;
}

interface SelectedItem extends CatalogItem {
  occurrences: SelectedItemOccurrence[];
  customCode?: string;
  customTitle?: string;
  customDescription?: string;
  customUnit?: string;
  customPrice?: number;
}

interface TreeNode extends CatalogItem {
  children: TreeNode[];
}

const evaluateMath = (expr: any): string => {
  if (!expr && expr !== 0) return '';
  try {
    let sanitized = String(expr).replace(/,/g, '.').replace(/x/g, '*');
    if (!/^[0-9+\-*/().\s]+$/.test(sanitized)) {
      return '';
    }
    const result = new Function(`return ${sanitized}`)();
    return Number.isFinite(result) ? String(Number(result.toFixed(2))) : '';
  } catch (e) {
    return '';
  }
};

const getMathFormula = (expr: any): string | null => {
  if (!expr && expr !== 0) return null;
  let sanitized = String(expr).replace(/,/g, '.').replace(/x/g, '*');
  if (!/^[0-9+\-*/().\s]+$/.test(sanitized)) {
    return null;
  }
  // Check if it has any math operators, if it's just a number, no need for formula
  if (!/[+\-*/()]/.test(sanitized)) return null;
  
  try {
    const result = new Function(`return ${sanitized}`)();
    return Number.isFinite(result) ? sanitized : null;
  } catch (e) {
    return null;
  }
};

export const getItemTotalQuantity = (item: SelectedItem): number => {
  if (!item.occurrences) return 0;
  return item.occurrences.reduce((sum, occ) => sum + (Number(evaluateMath(occ.quantity)) || 0), 0);
};

function buildTree(items: CatalogItem[]): TreeNode[] {
  const root: TreeNode[] = [];
  const stack: { node: TreeNode, prefix: string }[] = [];

  for (const item of items) {
    // Skip 260002-260006 (old slots), only keep 260001 as the single "Add Custom" button
    if (['260002', '260003', '260004', '260005', '260006'].includes(item.item)) {
      continue;
    }
    const node: TreeNode = { ...item, children: [] };
    let isCat = item.isCategory;
    
    if (node.item === '260001') {
      node.description = '+ Adicionar Item Personalizado';
      node.isCategory = false;
      isCat = false;
    }
    
    if (isCat) {
      const prefix = item.item.replace(/(00)+$/, '');
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
  interface HistoryState {
    items: SelectedItem[];
    description: string;
    timestamp: Date;
  }

  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lastSavedItemsJson, setLastSavedItemsJson] = useState<string>('');

  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states for inline editing
  const [activeFormItem, setActiveFormItem] = useState<string | null>(null);
  const [formOccurrences, setFormOccurrences] = useState<SelectedItemOccurrence[]>([]);
  const [customItemFields, setCustomItemFields] = useState({ code: '', title: '', description: '', unit: '', price: 0 });

  // States for right-side inline editing
  const [activeRightEditItem, setActiveRightEditItem] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [editFormOccurrences, setEditFormOccurrences] = useState<SelectedItemOccurrence[]>([]);
  const [editCustomItemFields, setEditCustomItemFields] = useState({ code: '', title: '', description: '', unit: '', price: 0 });

  // States for Header Edit
  const [isHeaderEditModalOpen, setIsHeaderEditModalOpen] = useState(false);
  const [headerForm, setHeaderForm] = useState<Partial<Workbook>>({});

  // Toast Notification state
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importCandidateItems, setImportCandidateItems] = useState<SelectedItem[]>([]);
  const [importSearchTerm, setImportSearchTerm] = useState('');
  const [importLocationFilter, setImportLocationFilter] = useState('all');
  const [selectedImportItems, setSelectedImportItems] = useState<Set<string>>(new Set());

  const [userSre, setUserSre] = useState('');
  const [userName, setUserName] = useState('');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const updateItems = (newItems: SelectedItem[] | ((prev: SelectedItem[]) => SelectedItem[]), description: string = 'Alteração no orçamento') => {
    setSelectedItems(prev => {
      let next = typeof newItems === 'function' ? newItems(prev) : newItems;
      next = [...next].sort((a, b) => a.item.localeCompare(b.item));
      setHistory(h => {
        const newHistory = h.slice(0, historyIndex + 1);
        newHistory.push({ items: next, description, timestamp: new Date() });
        setHistoryIndex(newHistory.length - 1);
        return newHistory;
      });
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (historyIndex > 0) {
          setHistoryIndex(prev => {
            const nextIdx = prev - 1;
            setSelectedItems(history[nextIdx].items);
            return nextIdx;
          });
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (historyIndex < history.length - 1) {
          setHistoryIndex(prev => {
            const nextIdx = prev + 1;
            setSelectedItems(history[nextIdx].items);
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
      await db.items.saveAll(id, selectedItems.map(i => {
        const isCustom = i.item.startsWith('2600');
        const payload = isCustom 
          ? { occurrences: i.occurrences, custom: { code: i.customCode, title: i.customTitle, description: i.customDescription, unit: i.customUnit, price: i.customPrice } } 
          : { occurrences: i.occurrences };
        
        return {
          item_code: i.item,
          quantity: '',
          memory: JSON.stringify(payload),
          location: ''
        } as any;
      }));
    };
    const timer = setTimeout(saveDraft, 1000);
    return () => clearTimeout(timer);
  }, [selectedItems, id, historyIndex]);

  const fetchUserProfile = async () => {
    try {
      const u = await db.auth.getUser();
      if (u) {
        setUserSre(u.sre || '');
        if (u.nome) setUserName(u.nome);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  };

  useEffect(() => {
    fetchUserProfile();
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
          const itemsJson = version.items_json;
          loadedItems = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
          setLastSavedItemsJson(typeof itemsJson === 'string' ? itemsJson : JSON.stringify(itemsJson));
        } else {
          showToast("Versão não encontrada.", "error");
        }
      } else {
        loadedItems = await db.items.list(id);
        const versions = await db.versions.list(id);
        if (versions.length > 0) {
          const itemsJson = versions[0].items_json;
          setLastSavedItemsJson(typeof itemsJson === 'string' ? itemsJson : JSON.stringify(itemsJson));
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
            restoredItems = loadedItems.map((loaded): SelectedItem | null => {
              const itemCode = loaded.item_code || loaded.item;
              // Support dynamic custom item IDs like 260001_abc1234
              const isCustomDynamic = typeof itemCode === 'string' && itemCode.startsWith('260001_');
              const lookupCode = isCustomDynamic ? '260001' : itemCode;
              const catItem = data.find(c => c.item === lookupCode);
              if (!catItem) return null;
              
              let parsedOccurrences = loaded.occurrences;
              let customData = null;

              if (!parsedOccurrences && loaded.memory && typeof loaded.memory === 'string') {
                if (loaded.memory.startsWith('{')) {
                  try {
                    const parsed = JSON.parse(loaded.memory);
                    if (parsed.occurrences) {
                      parsedOccurrences = parsed.occurrences;
                      customData = parsed.custom;
                    }
                  } catch (e) {}
                } else if (loaded.memory.startsWith('[')) {
                  try {
                    parsedOccurrences = JSON.parse(loaded.memory);
                  } catch (e) {}
                }
              }

              // Fallback for cloud version loading (items_json contains everything)
              if (loaded.customCode || loaded.customDescription || loaded.customTitle) {
                 customData = { code: loaded.customCode, title: loaded.customTitle, description: loaded.customDescription, unit: loaded.customUnit, price: loaded.customPrice };
              }

              return {
                ...(catItem as CatalogItem),
                item: itemCode, // preserve the dynamic ID
                customCode: customData?.code,
                customTitle: customData?.title,
                customDescription: customData?.description,
                customUnit: customData?.unit,
                customPrice: customData?.price,
                occurrences: parsedOccurrences || [{
                  id: loaded.id || Math.random().toString(36).substring(2, 11),
                  quantity: loaded.quantity || '',
                  memory: loaded.memory || '',
                  location: loaded.location || ''
                }]
              };
            }).filter((item): item is SelectedItem => item !== null);
          }
          
          restoredItems.sort((a, b) => a.item.localeCompare(b.item));
          setSelectedItems(restoredItems);
          setHistory([{ items: restoredItems, description: 'Estado Inicial', timestamp: new Date() }]);
          setHistoryIndex(0);

          if (searchParams.get('showImportModal') === 'true') {
            const pendingStr = sessionStorage.getItem('pendingImportItems');
            if (pendingStr) {
              try {
                const pendingItems = JSON.parse(pendingStr);
                const itemMap = new Map<string, SelectedItem>();
                pendingItems.forEach((loaded: any) => {
                  const itemCode = loaded.item_code || loaded.item;
                  const isCustom = itemCode.startsWith('2600');
                  const lookupCode = isCustom ? '260001' : itemCode;
                  const catItem = data.find(c => c.item === lookupCode);
                  if (catItem) {
                    let customData = null;
                    if (isCustom && loaded.memory) {
                       try {
                          const memData = JSON.parse(loaded.memory);
                          if (memData.custom) customData = memData.custom;
                       } catch(e) {}
                    }
                    const occ = {
                      id: Math.random().toString(36).substring(2, 11),
                      quantity: loaded.quantity || '',
                      memory: loaded.memory || '',
                      location: loaded.location || ''
                    };
                    if (itemMap.has(itemCode)) {
                      itemMap.get(itemCode)!.occurrences.push(occ);
                    } else {
                      itemMap.set(itemCode, {
                        ...catItem,
                        item: itemCode,
                        occurrences: [occ],
                        ...(customData && {
                          customCode: customData.code,
                          customTitle: customData.title,
                          customDescription: customData.title,
                          customUnit: customData.unit,
                          customPrice: customData.price
                        })
                      });
                    }
                  }
                });
                
                const parsedItems = Array.from(itemMap.values());
                if (parsedItems.length > 0) {
                  setImportCandidateItems(parsedItems);
                  setSelectedImportItems(new Set());
                  setImportSearchTerm('');
                  setIsImportModalOpen(true);
                  sessionStorage.removeItem('pendingImportItems');
                  // Remove parameter from URL quietly
                  const newParams = new URLSearchParams(searchParams);
                  newParams.delete('showImportModal');
                  navigate(`?${newParams.toString()}`, { replace: true });
                }
              } catch (e) {
                console.error(e);
              }
            }
          }
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

  const updateOccurrence = (state: SelectedItemOccurrence[], setState: React.Dispatch<React.SetStateAction<SelectedItemOccurrence[]>>, id: string, field: keyof SelectedItemOccurrence, value: string) => {
    setState(state.map(occ => occ.id === id ? { ...occ, [field]: value } : occ));
  };

  const handleOccurrenceMathChange = (state: SelectedItemOccurrence[], setState: React.Dispatch<React.SetStateAction<SelectedItemOccurrence[]>>, id: string, value: string) => {
    const result = evaluateMath(value);
    setState(state.map(occ => occ.id === id ? { ...occ, memory: value, quantity: result ? String(result) : occ.quantity } : occ));
  };

  const addOccurrence = (setState: React.Dispatch<React.SetStateAction<SelectedItemOccurrence[]>>) => {
    setState(prev => [...prev, { id: Math.random().toString(36).substring(2, 11), memory: '', quantity: '', location: '' }]);
  };

  const removeOccurrence = (setState: React.Dispatch<React.SetStateAction<SelectedItemOccurrence[]>>, id: string) => {
    setState(prev => prev.filter(occ => occ.id !== id));
  };


  const openForm = (item: CatalogItem) => {
    let targetItem = item;
    if (item.item === '260001') {
      setCustomItemFields({ code: '', title: '', description: '', unit: '', price: 0 });
    } else if (item.item.startsWith('2600')) {
      setCustomItemFields({ code: item.item, title: '', description: item.description, unit: item.unit, price: item.price });
    }

    const existing = item.item === '260001' ? undefined : selectedItems.find(i => i.item === targetItem.item);
    if (existing) {
      setFormOccurrences(existing.occurrences.length > 0 ? existing.occurrences : [{ id: Math.random().toString(36).substring(2, 11), memory: '', quantity: '', location: '' }]);
      if (existing.item.startsWith('2600')) {
        setCustomItemFields({ 
          code: existing.customCode || existing.item, 
          title: existing.customTitle || '',
          description: existing.customDescription || existing.description, 
          unit: existing.customUnit || existing.unit, 
          price: existing.customPrice !== undefined ? existing.customPrice : existing.price 
        });
      }
    } else {
      setFormOccurrences([{ id: Math.random().toString(36).substring(2, 11), memory: '', quantity: '', location: '' }]);
    }
    setActiveFormItem(targetItem.item);
  };

  const saveForm = () => {
    if (!activeFormItem) return;
    const catItem = catalog.find(c => c.item === activeFormItem || activeFormItem.startsWith(c.item));
    const baseCatItem = catalog.find(c => c.item === '260001');
    if (!catItem && !baseCatItem) return;

    const isCustom = activeFormItem === '260001' || activeFormItem.startsWith('2600');
    const isNewCustom = activeFormItem === '260001';

    const uniqueId = isNewCustom ? `260001_${Math.random().toString(36).substring(2, 9)}` : activeFormItem;

    const sourceItem = isNewCustom ? baseCatItem! : (catItem || baseCatItem!);

    const newItem: SelectedItem = {
      ...sourceItem,
      item: uniqueId,
      occurrences: formOccurrences,
      ...(isCustom && {
        customCode: customItemFields.code,
        customTitle: customItemFields.title,
        customDescription: customItemFields.description,
        customUnit: customItemFields.unit,
        customPrice: Number(customItemFields.price)
      })
    };
    const isEditing = !isNewCustom && selectedItems.some(i => i.item === activeFormItem);
    updateItems(prev => {
      if (isNewCustom) {
        // Always append new custom item
        return [...prev, newItem];
      }
      const exists = prev.find(i => i.item === activeFormItem);
      if (exists) return prev.map(i => i.item === activeFormItem ? newItem : i);
      return [...prev, newItem];
    }, isEditing ? `Item ${sourceItem.item} editado` : `Item ${sourceItem.item} adicionado ao orçamento`);
    setActiveFormItem(null);
  };

  const openEditForm = (item: SelectedItem) => {
    setEditFormOccurrences(item.occurrences.length > 0 ? item.occurrences : [{ id: Math.random().toString(36).substring(2, 11), memory: '', quantity: '', location: '' }]);
    if (item.item.startsWith('2600')) {
      setEditCustomItemFields({
        code: item.customCode || item.item,
        title: item.customTitle || '',
        description: item.customDescription || item.description,
        unit: item.customUnit || item.unit,
        price: item.customPrice !== undefined ? item.customPrice : item.price
      });
    }
    setActiveRightEditItem(item.item);
  };

  const saveEditForm = (itemCode: string) => {
    const isCustom = itemCode.startsWith('2600');
    updateItems(prev => prev.map(i => {
      if (i.item === itemCode) {
        return {
          ...i,
          occurrences: editFormOccurrences,
          ...(isCustom && {
            customCode: editCustomItemFields.code,
            customTitle: editCustomItemFields.title,
            customDescription: editCustomItemFields.description,
            customUnit: editCustomItemFields.unit,
            customPrice: Number(editCustomItemFields.price)
          })
        };
      }
      return i;
    }), `Ocorrências/valores de ${itemCode} alterados`);
    setActiveRightEditItem(null);
  };

  const handleRemoveItem = (itemCode: string) => {
    updateItems(prev => prev.filter(i => i.item !== itemCode), `Item ${itemCode} removido`);
  };

  const handleImportExcelCandidate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(arrayBuffer);
      const ws = wb.getWorksheet("Plan1");

      if (!ws) {
        showToast("Aba 'Plan1' não encontrada no arquivo.", "error");
        return;
      }

      const itemMap = new Map<string, SelectedItem>();

      ws.eachRow((row) => {
        const itemCodeCell = row.getCell(1).value;
        if (itemCodeCell) {
          const itemCode = itemCodeCell.toString().trim();
          let qty = row.getCell(4).value;
          if (qty && typeof qty === 'object' && 'result' in qty) {
             qty = (qty as any).result;
          }
          if (qty !== null && qty !== undefined && qty !== '') {
            const memory = row.getCell(7).value?.toString() || '';
            const location = row.getCell(8).value?.toString() || '';
            
            const isCustom = itemCode.startsWith('2600');
            const lookupCode = isCustom ? '260001' : itemCode;
            const catItem = catalog.find(c => c.item === lookupCode);
            
            if (catItem) {
               let customData = null;
               if (isCustom) {
                 const customTitle = row.getCell(2).value;
                 let titleStr = '';
                 if (customTitle && typeof customTitle === 'object' && 'richText' in customTitle) {
                   titleStr = (customTitle as any).richText.map((rt: any) => rt.text).join('');
                 } else if (customTitle) {
                   titleStr = customTitle.toString();
                 }
                 const customUnit = row.getCell(3).value?.toString() || '';
                 const customPrice = parseFloat(row.getCell(5).value?.toString() || '0');
                 customData = { code: itemCode, title: titleStr, unit: customUnit, price: customPrice };
               }
               
               const occ = {
                 id: Math.random().toString(36).substring(2, 11),
                 quantity: qty.toString(),
                 memory,
                 location
               };

               if (itemMap.has(itemCode)) {
                 itemMap.get(itemCode)!.occurrences.push(occ);
               } else {
                 itemMap.set(itemCode, {
                   ...catItem,
                   item: itemCode,
                   occurrences: [occ],
                   ...(isCustom && customData && {
                     customCode: customData.code,
                     customTitle: customData.title,
                     customDescription: customData.title,
                     customUnit: customData.unit,
                     customPrice: customData.price
                   })
                 });
               }
            }
          }
        }
      });
      
      const parsedItems = Array.from(itemMap.values());
      if (parsedItems.length === 0) {
        showToast("Nenhum item válido encontrado para importação.", "error");
        return;
      }
      
      setImportCandidateItems(parsedItems);
      setSelectedImportItems(new Set());
      setImportSearchTerm('');
      setIsImportModalOpen(true);
    } catch (error) {
      console.error(error);
      showToast("Erro ao ler o arquivo XLSX.", "error");
    } finally {
      event.target.value = '';
    }
  };

  const handleConfirmImport = () => {
    const itemsToMerge = importCandidateItems.filter(i => selectedImportItems.has(i.item));
    if (itemsToMerge.length === 0) {
      setIsImportModalOpen(false);
      return;
    }
    
    updateItems(prev => {
      const next = [...prev];
      itemsToMerge.forEach(importItem => {
        const existingIdx = next.findIndex(i => i.item === importItem.item);
        if (existingIdx >= 0) {
          next[existingIdx] = {
            ...next[existingIdx],
            occurrences: [...next[existingIdx].occurrences, ...importItem.occurrences]
          };
        } else {
          next.push(importItem);
        }
      });
      return next;
    }, `${itemsToMerge.length} itens importados via XLSX`);
    
    setIsImportModalOpen(false);
    showToast(`${itemsToMerge.length} itens importados com sucesso.`, 'success');
  };

  // ---- EXPORT LOGIC ----
  const handleExportExcel = async () => {
    if (!workbook) return;
    try {
      setIsExporting(true);

      const response = await fetch('/template_copia.xlsx');
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

      worksheet.getCell('A2034').value = `Técnico responsável pela elaboração da planilha: ${workbook.engenheiro ? workbook.engenheiro.toUpperCase() : ''}`;
      worksheet.getCell('E2034').value = `CREA: ${workbook.crea ? workbook.crea : ''}`;
      
      const monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
      const d = workbook.data_elaboracao ? new Date(`${workbook.data_elaboracao}T00:00:00`) : new Date();
      
      const monthStr = monthNames[d.getMonth()];
      const yearStr = String(d.getFullYear()).slice(-2);
      
      const cell = worksheet.getCell('I2033');
      cell.value = `REV ${String(workbook.rev || '1').padStart(2, '0')}\n${monthStr}/${yearStr}`;
      cell.alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' };
      
      if (workbook.data_elaboracao) {
        worksheet.getCell('I2034').value = d.toLocaleDateString('pt-BR');
      } else {
        worksheet.getCell('I2034').value = '';
      }

      selectedItems.forEach(item => {
        const totalQty = getItemTotalQuantity(item);
        const validRows: number[] = [];

        if (item.item.startsWith('2600') && item.rows.length > 0) {
          const mainRow = worksheet.getRow(item.rows[0]);
          if (item.customCode) mainRow.getCell(1).value = item.customCode;
          
          let richText = [];
          if (item.customTitle) {
            richText.push({ font: { bold: true }, text: item.customTitle + (item.customDescription ? '\r\n' : '') });
          }
          if (item.customDescription) {
            richText.push({ font: { bold: false }, text: item.customDescription });
          }
          if (richText.length > 0) {
            mainRow.getCell(2).value = { richText };
          } else if (item.customDescription) {
            mainRow.getCell(2).value = item.customDescription;
          }

          if (item.customUnit) mainRow.getCell(3).value = item.customUnit;
          if (item.customPrice !== undefined) mainRow.getCell(5).value = item.customPrice;
          mainRow.commit();
        }

        item.occurrences?.forEach((occ, idx) => {
          if (idx < item.rows.length) {
            const row = worksheet.getRow(item.rows[idx]);
            const occQtd = Number(evaluateMath(occ.quantity)) || 0;
            if (occ.memory) row.getCell(7).value = occ.memory;
            if (occQtd > 0) {
              const formulaStr = getMathFormula(occ.memory);
              if (formulaStr) {
                row.getCell(8).value = { formula: `ROUND(${formulaStr}, 2)`, result: occQtd };
              } else {
                row.getCell(8).value = occQtd;
              }
              validRows.push(item.rows[idx]);
            }
            if (occ.location) row.getCell(9).value = occ.location;
            row.commit();
          }
        });

        if (totalQty > 0) {
          if (validRows.length > 1) {
            const firstRow = validRows[0];
            const lastRow = validRows[validRows.length - 1];
            worksheet.getRow(item.rows[0]).getCell(4).value = { formula: `ROUND(SUM(H${firstRow}:H${lastRow}), 2)`, result: totalQty };
          } else if (validRows.length === 1) {
            worksheet.getRow(item.rows[0]).getCell(4).value = { formula: `ROUND(SUM(H${validRows[0]}), 2)`, result: totalQty };
          } else {
            worksheet.getRow(item.rows[0]).getCell(4).value = totalQty;
          }
        }
      });

      const selectedItemCodes = new Set(selectedItems.map(i => i.item));
      const activeCategories = new Set<string>();

      selectedItems.forEach(item => {
        catalog.forEach(cat => {
          if (cat.isCategory) {
            const prefix = cat.item.replace(/(00)+$/, '');
            if (item.item.startsWith(prefix)) {
              activeCategories.add(cat.item);
            }
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
            if (row.getCell(3).text && row.getCell(3).text.includes('SUB-TOT')) return;
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
        }
      });

      // Fix SUB-TOT visibility and formulas
      let currentCategoryStart = 6;
      for (let r = 6; r < 3000; r++) {
         const row = worksheet.getRow(r);
         const col1 = row.getCell(1).text;
         if (col1 && col1.endsWith('0000')) {
             currentCategoryStart = r;
         }
         
         const col3 = row.getCell(3).text;
         if (col3 && col3.includes('SUB-TOT')) {
             const catCode = worksheet.getRow(currentCategoryStart).getCell(1).text;
             if (activeCategories.has(catCode)) {
                 row.hidden = false;
                 const startRow = currentCategoryStart + 1;
                 const endRow = r - 1;
                 row.getCell(6).value = { formula: `ROUND(SUM(F${startRow}:F${endRow}), 2)` };
                 row.commit();
             } else {
                 row.hidden = true;
                 row.commit();
             }
         }
         
         if (col1 === '080000' && col3 && col3.includes('SUB-TOT')) {
             // stop checking after the last category if needed, but going to 3000 is fine
         }
      }
      // Final pass to safely mark hidden rows with 'oculta' in column 1
      for (let r = 6; r < 3000; r++) {
         const row = worksheet.getRow(r);
         if (row.hidden) {
             row.getCell(1).value = 'oculta';
             row.commit();
         }
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

      const escolaName = (workbook.escola || '').trim().toUpperCase();
      const servicosName = (workbook.servicos || '').trim().toUpperCase();
      const fileName = `PLANILHA DE SERVIÇOS - ${escolaName} - ${servicosName}.xlsx`;

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

    const serializeForCompare = (items: any[]) => JSON.stringify(items.map(i => ({
      item: i.item_code || i.item, // handle both formats
      occurrences: i.occurrences,
      customCode: i.customCode,
      customTitle: i.customTitle,
      customDescription: i.customDescription,
      customUnit: i.customUnit,
      customPrice: i.customPrice
    })));

    try {
      const lastSavedParsed = JSON.parse(lastSavedItemsJson);
      if (serializeForCompare(lastSavedParsed) === serializeForCompare(selectedItems)) {
        showToast("O rascunho atual já está salvo na nuvem.", "success");
        return;
      }
    } catch (e) {
      // If parsing fails, just proceed to save
    }

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

  const { totalObra, totalProj, totalBudget } = selectedItems.reduce((acc, item) => {
    const cost = getItemTotalQuantity(item) * (item.customPrice !== undefined ? item.customPrice : item.price);
    acc.totalBudget += cost;
    if (item.item.startsWith('24')) {
      acc.totalProj += cost;
    } else {
      acc.totalObra += cost;
    }
    return acc;
  }, { totalObra: 0, totalProj: 0, totalBudget: 0 });

  const renderTree = (nodes: TreeNode[], term: string): ReactNode => {
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const normalizedTerm = normalize(term);
    
    const filterNode = (node: TreeNode): boolean => {
      if (!term) return true;
      if (normalize(node.description).includes(normalizedTerm)) return true;
      if (node.item.includes(term)) return true;
      if (node.children.some(filterNode)) return true;
      return false;
    };

    return nodes.filter(filterNode).map(node => {
      if (node.isCategory) {
        return (
          <details key={node.item} className="group mb-1" open={!!term}>
            <summary className="flex items-center gap-2 p-2 bg-slate-200 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700/80 rounded-md cursor-pointer list-none select-none border border-transparent dark:border-slate-700 transition-colors">
              <ChevronRight size={16} className="text-slate-500 dark:text-slate-400 group-open:rotate-90 transition-transform shrink-0" />
              <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-transparent dark:border-slate-700">{node.item}</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide truncate">{node.description}</span>
            </summary>
            <div className="pl-4 mt-1 border-l-2 border-slate-100 dark:border-slate-700 ml-3 flex flex-col gap-1">
              {renderTree(node.children, term)}
            </div>
          </details>
        );
      } else {
        const isCustomNode = node.item === '260001';
        const isAdded = isCustomNode 
          ? false
          : selectedItems.some(i => i.item === node.item);
        
        const isFormActive = isCustomNode
          ? activeFormItem?.startsWith('2600')
          : activeFormItem === node.item;

        return (
          <div key={node.item} className={`flex flex-col border rounded-lg transition-colors overflow-hidden ${isAdded ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-200'}`}>
            <div 
              className="flex justify-between items-start gap-4 p-3 cursor-pointer"
              onClick={() => !isAdded && (isFormActive ? setActiveFormItem(null) : openForm(node))}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded">{node.item}</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{node.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / {node.unit}</span>
                  {isAdded && <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full"><CheckCircle size={12}/> Adicionado</span>}
                </div>
                <p className={`text-sm text-slate-600 dark:text-slate-400 ${isFormActive ? '' : 'line-clamp-2'}`}>{node.description}</p>
              </div>
            </div>

            {isFormActive && (
              <div className="p-3 bg-emerald-50/50 dark:bg-emerald-900/20 border-t border-emerald-100 dark:border-emerald-800 flex flex-col gap-3">
                {activeFormItem?.startsWith('2600') && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2 p-3 bg-white dark:bg-slate-800 rounded border border-emerald-200">
                    <div className="sm:col-span-1">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Código</label>
                      <input type="text" value={customItemFields.code} onChange={e => setCustomItemFields({...customItemFields, code: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Título</label>
                      <input type="text" value={customItemFields.title} onChange={e => setCustomItemFields({...customItemFields, title: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" placeholder="Ex: Piso Cerâmico" />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Descrição</label>
                      <input type="text" value={customItemFields.description} onChange={e => setCustomItemFields({...customItemFields, description: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" placeholder="Detalhes opcionais..." />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Unidade</label>
                      <input type="text" value={customItemFields.unit} onChange={e => setCustomItemFields({...customItemFields, unit: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Preço</label>
                      <input type="number" step="0.01" value={customItemFields.price} onChange={e => setCustomItemFields({...customItemFields, price: Number(e.target.value)})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" />
                    </div>
                  </div>
                )}
                {formOccurrences.map((occ, idx) => (
                  <div key={occ.id} className="relative bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700">
                    <div className="absolute top-2 right-2 flex gap-1">
                      {formOccurrences.length > 1 && (
                        <button onClick={() => removeOccurrence(setFormOccurrences, occ.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14}/></button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                      <div>
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          <Calculator size={12} className="text-emerald-600"/> Memória de Cálculo {idx + 1}
                        </label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          placeholder="Ex: 2*5 + 10"
                          value={occ.memory}
                          onChange={e => handleOccurrenceMathChange(formOccurrences, setFormOccurrences, occ.id, e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Qtd. ({node.unit})</label>
                        <input
                          type="number"
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-800"
                          placeholder="Qtd final"
                          value={occ.quantity}
                          onChange={e => updateOccurrence(formOccurrences, setFormOccurrences, occ.id, 'quantity', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Local de Intervenção {idx + 1}</label>
                        <input
                          type="text"
                          list="locations-list"
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          placeholder="Ex: Bloco A, Sala 3"
                          value={occ.location}
                          onChange={e => updateOccurrence(formOccurrences, setFormOccurrences, occ.id, 'location', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center mt-1">
                  <button onClick={() => addOccurrence(setFormOccurrences)} className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                    <Plus size={16}/> Adicionar Local
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => setActiveFormItem(null)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-700 rounded-md">Cancelar</button>
                    <button onClick={() => saveForm()} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md flex items-center gap-2">
                      <CheckCircle size={16}/> {isAdded ? 'Salvar Alterações' : 'Adicionar ao Orçamento'}
                    </button>
                  </div>
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
      i.occurrences.forEach(o => {
        if (o.location && o.location.trim() !== '') {
          locs.add(o.location.trim());
        }
      });
    });
    return Array.from(locs).sort();
  }, [selectedItems]);

  if (!workbook) return null;

  const getBdiRate = (iss: string) => {
    switch (iss) {
      case '2': return 0.2246;
      case '2.5': return 0.2279;
      case '3': return 0.2312;
      case '4': return 0.2377;
      case '5': return 0.2443;
      default: return 0.2443;
    }
  };
  const bdiRate = getBdiRate(workbook.iss);
  const bdiProjRate = 0.2926;
  const bdiObraAmount = totalObra * bdiRate;
  const bdiProjAmount = totalProj * bdiProjRate;
  
  const bdiAmount = bdiObraAmount + bdiProjAmount;
  const grandTotal = totalBudget + bdiAmount;

  const isCloudSaveDisabled = isSaving || JSON.stringify(selectedItems) === lastSavedItemsJson;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-800/50 flex flex-col">
      <datalist id="locations-list">
        {uniqueLocations.map(loc => (
          <option key={loc} value={loc} />
        ))}
      </datalist>

      {/* MODAL DE CONFIRMAÇÃO DE SAÍDA */}
      {showCloseConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3 text-amber-600 mb-4">
                <AlertTriangle size={24} />
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Alterações não salvas</h3>
              </div>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Você tem alterações que não foram salvas na nuvem. Deseja salvar antes de sair?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCloseConfirm(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800/50 rounded-lg font-medium transition-colors"
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
            <FileSpreadsheet size={28} className="text-emerald-300 hidden sm:block" />
            <div className="flex flex-col">
              <h1 className="text-lg md:text-xl font-bold tracking-wide leading-tight">Portal de Orçamentos SEE-MG</h1>
              {userName && <span className="text-xs font-medium text-emerald-100">Engº. {userName}</span>}
            </div>
          </div>
          <div className="hidden md:flex gap-3 items-center">
            <button
              onClick={() => setIsHistoryModalOpen(true)}
              className="flex items-center gap-2 text-emerald-200 hover:text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors mr-2 border border-emerald-700 hover:border-emerald-500"
              title="Histórico de Alterações (Ctrl+Z / Ctrl+Y)"
            >
              <History size={18} />
              <span className="hidden sm:inline">Histórico</span>
            </button>

            <div className="flex gap-2 mr-2 border-r border-emerald-700/50 pr-5">
              <label className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 border border-slate-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95 cursor-pointer">
                <FileSpreadsheet size={18} />
                <span className="hidden sm:inline">Importar</span>
                <input type="file" accept=".xlsx" className="hidden" onChange={handleImportExcelCandidate} />
              </label>
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
            
            <div className="flex gap-2">
              <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-lg">
                <ThemeToggle />
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
        </div>
      </header>

      <main className="container mx-auto h-full flex flex-col gap-4 p-4 pb-20 md:pb-4 print:block print:p-0 flex-1">
        
        {/* Dados da Obra Info (FULL WIDTH) */}
        <div className="bg-emerald-50 dark:bg-emerald-900/40 border border-emerald-100 dark:border-emerald-800/50 rounded-lg p-3 shadow-sm flex flex-col gap-2 relative group print:hidden">
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => setIsHeaderEditModalOpen(true)}
              className="bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 p-1.5 rounded-md shadow-sm border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
              title="Editar Dados da Obra"
            >
              <Edit2 size={16} />
            </button>
          </div>
          <div className="flex flex-wrap md:flex-nowrap items-start justify-between gap-x-4 gap-y-2 pr-12 w-full">
            <div className="overflow-hidden flex-shrink min-w-[100px] max-w-[250px]">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Escola</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block" title={workbook.escola}>{workbook.escola}</span>
            </div>
            <div className="overflow-hidden shrink-0">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Código</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block">{workbook.cod_escola || '-'}</span>
            </div>
            <div className="overflow-hidden shrink-0">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Município</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block">{workbook.municipio || '-'}</span>
            </div>
            <div className="overflow-hidden shrink-0 max-w-[200px]">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">SRE</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block" title={workbook.sre}>{workbook.sre || '-'}</span>
            </div>
            <div className="overflow-hidden flex-shrink max-w-[250px]">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Serviços</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block" title={workbook.servicos}>{workbook.servicos || '-'}</span>
            </div>
            <div className="overflow-hidden shrink-0">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">ISS</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block">{workbook.iss || 0}%</span>
            </div>
            <div className="overflow-hidden shrink-0">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Status</span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full inline-block truncate ${
                workbook.status === 'Finalizado' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' :
                workbook.status === 'Em revisão' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
              }`}>
                {workbook.status || 'Em andamento'}
              </span>
            </div>
            <div className="overflow-hidden shrink-0 flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">Rev</span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block">{workbook.rev || '1'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
          {/* Lado Esquerdo: Busca e Catálogo */}
          <div className="flex flex-col h-[50vh] lg:h-full lg:w-1/3 gap-3 print:hidden min-h-0">
            <h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-100 px-1">Pesquisa de Itens</h2>
            <section className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 flex flex-col flex-1 min-h-0">
            
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-t-xl space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow outline-none text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 shadow-sm"
                  placeholder="Buscar por nome ou código do serviço no catálogo..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-slate-50 dark:bg-slate-900/30">
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
            <h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-100 px-1 print:hidden">Orçamento ({selectedItems.length})</h2>
            <section className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 flex flex-col flex-1 print:border-none print:shadow-none min-h-0">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-emerald-50/50 dark:bg-emerald-900/20 rounded-t-xl flex flex-col gap-4 print:bg-white dark:bg-slate-800 print:border-none print:p-0 print:mb-6">
            
            {/* Cabeçalho Impressão */}
            <div className="hidden print:block mb-6 border-b-2 border-emerald-800 pb-4">
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-black text-emerald-900">
                  Relatório de Orçamento{workbook.servicos ? ` - ${workbook.servicos}` : ''}
                </h1>
                <p className="text-lg font-bold text-slate-700 dark:text-slate-300">Data: {new Date(workbook.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-slate-700 dark:text-slate-300">
                <p><strong>Escola:</strong> {workbook.escola}</p>
                <p><strong>Município:</strong> {workbook.municipio}</p>
                <p><strong>Código:</strong> {workbook.cod_escola}</p>
                <p><strong>SRE:</strong> {workbook.sre}</p>
                {workbook.engenheiro && <p><strong>Engenheiro:</strong> {workbook.engenheiro}</p>}
                {workbook.crea && <p><strong>CREA:</strong> {workbook.crea}</p>}
              </div>
            </div>

            {/* Linha 2: Totais */}
            <div className={`grid gap-3 print:hidden ${totalProj > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded-lg px-3 py-2.5 flex flex-col justify-center shadow-sm">
                <span className="text-[10px] uppercase font-bold text-sky-700 dark:text-sky-400">Custo Direto</span>
                <span className="text-sm font-bold text-sky-900 dark:text-sky-200">{(totalObra + totalProj).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5 flex flex-col justify-center shadow-sm">
                <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400">
                  BDI OBRA ({(bdiRate * 100).toFixed(2)}%)
                </span>
                <span className="text-sm font-bold text-amber-900 dark:text-amber-200">{bdiObraAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
              {totalProj > 0 && (
                <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-2.5 flex flex-col justify-center shadow-sm">
                  <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-400">
                    BDI PROJ (29.26%)
                  </span>
                  <span className="text-sm font-bold text-indigo-900 dark:text-indigo-200">{bdiProjAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
              )}
              <div className="bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700 rounded-lg px-3 py-2.5 flex flex-col justify-center shadow-sm">
                <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400">Total Geral</span>
                <span className="text-sm font-bold text-emerald-950 dark:text-emerald-200">{grandTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
            </div>

          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 print:overflow-visible print:p-0">
            {selectedItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 print:hidden">
                <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-full">
                  <FileSpreadsheet size={48} className="text-slate-300" />
                </div>
                <p>Nenhum serviço adicionado ainda.<br/>Selecione um item no catálogo ao lado.</p>
              </div>
            ) : (
              Object.entries(groupedSelected).map(([catName, items]) => {
                const groupTotal = items.reduce((acc, item) => acc + (getItemTotalQuantity(item) * (item.customPrice !== undefined ? item.customPrice : item.price)), 0);
                return (
                <div key={catName}>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 border-b dark:border-slate-700 pb-1 flex justify-between items-center">
                    <span>{catName}</span>
                    <span className="text-emerald-600/70 dark:text-emerald-400 font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(groupTotal)}</span>
                  </h3>
                  <div className="space-y-2">
                    {items.map(item => {
                      const isEditing = activeRightEditItem === item.item;
                      return (
                      <div key={item.item} className={`flex flex-col border rounded-lg transition-colors overflow-hidden ${isEditing ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/20' : 'border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-200 dark:hover:border-emerald-700'}`}>
                        <div className="p-3 hover:shadow-md transition-shadow group flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="print:hidden">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">{item.customCode || item.item}</span>
                                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.customPrice !== undefined ? item.customPrice : item.price)}
                                </span>
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{getItemTotalQuantity(item)} {item.customUnit || item.unit}</span>
                              </div>
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex flex-col">
                                  <p className="text-sm text-slate-800 dark:text-slate-200 font-medium line-clamp-3 leading-snug" title={item.customTitle || item.customDescription || item.description}>{item.customTitle || item.customDescription || item.description}</p>
                                  {item.customTitle && item.customDescription && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">{item.customDescription}</p>
                                  )}
                                </div>
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-200 whitespace-nowrap bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 mt-0.5">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(getItemTotalQuantity(item) * (item.customPrice !== undefined ? item.customPrice : item.price))}
                                </span>
                              </div>
                              {(item.occurrences && item.occurrences.length > 1) ? (
                                <div className="mt-3 text-[11px] border-t border-dashed border-emerald-200 dark:border-slate-700 pt-2 flex flex-col gap-1 w-full">
                                  {item.occurrences.map((occ) => {
                                    const price = item.customPrice !== undefined ? item.customPrice : item.price;
                                    const subtotal = (Number(evaluateMath(occ.quantity)) || 0) * price;
                                    return (
                                      <div key={occ.id} className="flex flex-wrap justify-between items-center text-slate-600 dark:text-slate-300 bg-emerald-50/30 dark:bg-emerald-900/10 p-1.5 rounded gap-2">
                                        <span className="flex-1 min-w-[120px] truncate" title={occ.location}><b>Local:</b> {occ.location || '-'}</span>
                                        <span className="flex-1 min-w-[100px] truncate" title={occ.memory}><b>Memória:</b> {occ.memory || '-'}</span>
                                        <span className="w-[80px]"><b>Qtd:</b> {occ.quantity} {item.customUnit || item.unit}</span>
                                        <span className="w-[120px] text-right font-medium text-emerald-700 dark:text-emerald-400"><b>Subtotal:</b> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">Local(is): {item.occurrences?.map(o => o.location).filter(Boolean).join(' | ') || '-'}</p>
                              )}
                            </div>
                            
                            {/* Layout Específico para Impressão */}
                            <div className="hidden print:block">
                              <div className="flex justify-between items-start mb-1 border-b pb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400">{item.customCode || item.item}</span>
                                  <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 line-clamp-2">{item.customTitle || item.customDescription || item.description}</span>
                                    {item.customTitle && item.customDescription && (
                                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400 line-clamp-1">{item.customDescription}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs text-slate-700 dark:text-slate-300 mt-2 space-y-1">
                                {item.occurrences?.map((occ) => (
                                  <div key={occ.id} className="grid grid-cols-5 gap-2 border-b border-dashed border-slate-200 dark:border-slate-700 pb-1">
                                    <p className="truncate col-span-2"><strong>Local:</strong> {occ.location || '-'}</p>
                                    <p className="truncate" title={occ.memory}><strong>Memória:</strong> {occ.memory || '-'}</p>
                                    <p><strong>Qtd:</strong> {occ.quantity} {item.unit}</p>
                                    <p><strong>Subtotal:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(evaluateMath(occ.quantity)) || 0) * (item.customPrice !== undefined ? item.customPrice : item.price))}</p>
                                  </div>
                                ))}
                                <div className="flex justify-end gap-6 pt-1 font-bold text-slate-800 dark:text-slate-200">
                                  <p>Qtd Total: {getItemTotalQuantity(item)} {item.customUnit || item.unit}</p>
                                  <p>Unitário: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.customPrice !== undefined ? item.customPrice : item.price)}</p>
                                  <p>Preço Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(getItemTotalQuantity(item) * (item.customPrice !== undefined ? item.customPrice : item.price))}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                          {!isEditing && (
                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                              <button onClick={() => openEditForm(item)} className="p-1.5 text-slate-400 hover:bg-slate-100 dark:bg-slate-800/50 hover:text-emerald-600 rounded">
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
                          <div className="p-3 bg-emerald-50/50 dark:bg-emerald-900/20 border-t border-emerald-100 dark:border-emerald-800 flex flex-col gap-3">
                            {item.item.startsWith('2600') && (
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2 p-3 bg-white dark:bg-slate-800 rounded border border-emerald-200">
                                <div className="sm:col-span-1">
                                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Código</label>
                                  <input type="text" value={editCustomItemFields.code} onChange={e => setEditCustomItemFields({...editCustomItemFields, code: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" />
                                </div>
                                <div className="sm:col-span-3">
                                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Título</label>
                                  <input type="text" value={editCustomItemFields.title} onChange={e => setEditCustomItemFields({...editCustomItemFields, title: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" placeholder="Ex: Piso Cerâmico" />
                                </div>
                                <div className="sm:col-span-4">
                                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Descrição</label>
                                  <input type="text" value={editCustomItemFields.description} onChange={e => setEditCustomItemFields({...editCustomItemFields, description: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" placeholder="Detalhes opcionais..." />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Unidade</label>
                                  <input type="text" value={editCustomItemFields.unit} onChange={e => setEditCustomItemFields({...editCustomItemFields, unit: e.target.value})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">Preço</label>
                                  <input type="number" step="0.01" value={editCustomItemFields.price} onChange={e => setEditCustomItemFields({...editCustomItemFields, price: Number(e.target.value)})} className="w-full px-2 py-1.5 rounded border text-sm outline-none focus:border-emerald-500" />
                                </div>
                              </div>
                            )}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                              {editFormOccurrences.map((occ, idx) => (
                                <div key={occ.id} className="relative bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700">
                                  <div className="absolute top-2 right-2 flex gap-1 z-10">
                                    {editFormOccurrences.length > 1 && (
                                      <button onClick={() => removeOccurrence(setEditFormOccurrences, occ.id)} className="text-red-400 hover:text-red-600 p-1 bg-white dark:bg-slate-800 rounded"><Trash2 size={14}/></button>
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-3">
                                    <div className="grid grid-cols-2 gap-3 pr-6">
                                      <div>
                                        <label className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                                          <Calculator size={12} className="text-emerald-600"/> Memória {idx + 1}
                                        </label>
                                        <input
                                          type="text"
                                          className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                          placeholder="Ex: 2*5 + 10"
                                          value={occ.memory}
                                          onChange={e => handleOccurrenceMathChange(editFormOccurrences, setEditFormOccurrences, occ.id, e.target.value)}
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Qtd. ({item.customUnit || item.unit})</label>
                                        <input
                                          type="number"
                                          className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-800"
                                          placeholder="Qtd final"
                                          value={occ.quantity}
                                          onChange={e => updateOccurrence(editFormOccurrences, setEditFormOccurrences, occ.id, 'quantity', e.target.value)}
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Local de Intervenção {idx + 1}</label>
                                      <input
                                        type="text"
                                        list="locations-list"
                                        className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                        placeholder="Ex: Bloco A, Sala 3"
                                        value={occ.location}
                                        onChange={e => updateOccurrence(editFormOccurrences, setEditFormOccurrences, occ.id, 'location', e.target.value)}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-between items-center mt-1">
                              <button onClick={() => addOccurrence(setEditFormOccurrences)} className="text-sm font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                                <Plus size={16}/> Adicionar Local
                              </button>
                              <div className="flex gap-2">
                                <button onClick={() => setActiveRightEditItem(null)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-700 rounded-md">Cancelar</button>
                                <button onClick={() => saveEditForm(item.item)} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md flex items-center gap-2">
                                  <CheckCircle size={16}/> Salvar Alterações
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                </div>
                );
              })
            )}
          </div>
        </section>
        </div>
        </div>
      </main>

      {/* MOBILE DOCK */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-emerald-800 p-2 flex justify-between items-center gap-2 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.2)] print:hidden pb-safe">
        <button
          onClick={handlePrint}
          disabled={selectedItems.length === 0}
          className="flex-1 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white h-12 rounded-lg transition-all active:scale-95 shadow-sm"
          title="Imprimir ou Salvar PDF"
        >
          <Printer size={22} />
        </button>
        <button
          onClick={handleExportExcel}
          disabled={selectedItems.length === 0 || isExporting}
          className="flex-1 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white h-12 rounded-lg transition-all active:scale-95 shadow-sm"
          title="Exportar XLSX"
        >
          {isExporting ? <Loader2 className="animate-spin" size={22} /> : <Download size={22} />}
        </button>
        <button 
          onClick={saveToCloud}
          disabled={isCloudSaveDisabled}
          className={`flex-1 flex items-center justify-center h-12 rounded-lg shadow-sm transition-colors ${isCloudSaveDisabled ? 'bg-emerald-900/40 text-emerald-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
        >
          <Save size={22} />
        </button>
        <button onClick={handleClose} className="flex-1 flex items-center justify-center h-12 bg-emerald-900/50 hover:bg-red-600 text-emerald-100 hover:text-white rounded-lg transition-colors border border-emerald-700 hover:border-red-600" title="Fechar Editor">
          <X size={24} />
        </button>
      </div>

      {/* HEADER EDIT MODAL */}
      {isHeaderEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Edit2 className="text-emerald-600" /> Editar Dados da Obra
              </h2>
              <button onClick={() => setIsHeaderEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const updated = await db.workbooks.update(workbook.id, headerForm);
              if (updated) {
                setWorkbook(updated);
                saveIssForMunicipio(updated.municipio, updated.iss);
              }
              setIsHeaderEditModalOpen(false);
              showToast("Dados atualizados com sucesso!", "success");
            }} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Escola Estadual</label>
                  <SchoolSearch 
                    value={headerForm.escola || ''} 
                    onChange={val => setHeaderForm({...headerForm, escola: val})} 
                    userSre={userSre}
                    onSelect={(escola) => {
                      setHeaderForm({
                        ...headerForm,
                        escola: escola.nome,
                        cod_escola: escola.codigo,
                        municipio: escola.municipio,
                        iss: getIssForMunicipio(escola.municipio)
                      });
                    }} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cód. Escola</label>
                  <input type="text" value={headerForm.cod_escola || ''} readOnly className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 cursor-not-allowed outline-none" />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Município</label>
                  <input type="text" value={headerForm.municipio || ''} readOnly className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 cursor-not-allowed outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">S.R.E.</label>
                  <input type="text" value={headerForm.sre || ''} readOnly className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 cursor-not-allowed outline-none" />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Serviços da Planilha</label>
                  <input type="text" value={headerForm.servicos || ''} onChange={e => setHeaderForm({...headerForm, servicos: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Taxa ISS (%)</label>
                  <input type="number" step="0.01" value={headerForm.iss || ''} onChange={e => setHeaderForm({...headerForm, iss: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>
                
                <div className="col-span-full border-t border-slate-100 dark:border-slate-700 mt-2 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Informações Opcionais Adicionais</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-4">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Engenheiro(a)</label>
                      <input type="text" value={headerForm.engenheiro || ''} onChange={e => setHeaderForm({...headerForm, engenheiro: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Nome" />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CREA</label>
                      <input type="text" value={headerForm.crea || ''} onChange={e => setHeaderForm({...headerForm, crea: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Número" />
                    </div>
                    <div className="lg:col-span-3">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Elaboração</label>
                      <input type="date" value={headerForm.data_elaboracao || ''} onChange={e => setHeaderForm({...headerForm, data_elaboracao: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                    <div className="lg:col-span-1">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">REV</label>
                      <input type="number" min="0" value={headerForm.rev || '1'} onChange={e => setHeaderForm({...headerForm, rev: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                      <select value={headerForm.status || 'Em andamento'} onChange={e => setHeaderForm({...headerForm, status: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-slate-800">
                        <option value="Em andamento">Em andamento</option>
                        <option value="Em revisão">Em revisão</option>
                        <option value="Finalizado">Finalizado</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-700 mt-6 sticky bottom-0 bg-white dark:bg-slate-800">
                <button type="button" onClick={() => setIsHeaderEditModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800/50 rounded-lg transition-colors">
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

      {/* HISTÓRICO MODAL */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <History className="text-emerald-600" size={20} /> Histórico de Alterações
              </h2>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 p-1 rounded-md hover:bg-slate-200 dark:bg-slate-700">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-2">
              {history.map((h, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setHistoryIndex(idx);
                    setSelectedItems(history[idx].items);
                  }}
                  className={`w-full text-left p-3 rounded-xl border flex flex-col gap-1 transition-all ${idx === historyIndex ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/40 shadow-sm' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className={`font-semibold text-sm ${idx === historyIndex ? 'text-emerald-800 dark:text-emerald-100' : 'text-slate-700 dark:text-slate-300'}`}>
                      {h.description}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {h.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  {idx === historyIndex && (
                    <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">Estado Atual</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* IMPORT XLSX MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <FileSpreadsheet className="text-emerald-600" size={20} /> Importar Itens da Planilha
              </h2>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 p-1 rounded-md hover:bg-slate-200 dark:bg-slate-700">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow outline-none text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 shadow-sm h-[42px]"
                  placeholder="Buscar item para importar..."
                  value={importSearchTerm}
                  onChange={e => setImportSearchTerm(e.target.value)}
                />
              </div>
              <div className="w-full md:w-64">
                <Select value={importLocationFilter} onValueChange={setImportLocationFilter}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 focus:ring-emerald-500 rounded-lg shadow-sm !h-[42px]">
                    <SelectValue placeholder="Local de Intervenção (Todos)" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4}>
                    <SelectItem value="all">Local de Intervenção (Todos)</SelectItem>
                    {Array.from(new Set(importCandidateItems.flatMap(i => i.occurrences.map(o => o.location.trim())).filter(Boolean))).sort().map(loc => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-900/50">
              <div className="space-y-2">
                {importCandidateItems
                  .filter(i => {
                    if (importLocationFilter !== 'all' && !i.occurrences.some((o: any) => o.location.trim() === importLocationFilter)) return false;
                    if (!importSearchTerm) return true;
                    const normalize = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                    const term = normalize(importSearchTerm);
                    const matchText = normalize(i.customTitle || i.customDescription || i.description).includes(term);
                    const matchCode = normalize(i.item).includes(term);
                    const matchLocation = i.occurrences && i.occurrences.some((o: any) => normalize(o.location).includes(term));
                    return matchText || matchCode || matchLocation;
                  })
                  .map(item => (
                    <div key={item.item} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl flex gap-3 items-start hover:border-emerald-300 transition-colors cursor-pointer" onClick={() => {
                      const newSet = new Set(selectedImportItems);
                      if (newSet.has(item.item)) newSet.delete(item.item);
                      else newSet.add(item.item);
                      setSelectedImportItems(newSet);
                    }}>
                      <div className="pt-1">
                        <input type="checkbox" checked={selectedImportItems.has(item.item)} onChange={() => {}} className="w-4 h-4 text-emerald-600 rounded border-slate-300 dark:border-slate-600 focus:ring-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">{item.customCode || item.item}</span>
                          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{getItemTotalQuantity(item)} {item.customUnit || item.unit}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{item.customTitle || item.customDescription || item.description}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
              <button 
                onClick={() => {
                  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                  const term = normalize(importSearchTerm);
                  const filtered = importCandidateItems.filter(i => {
                    if (importLocationFilter !== 'all' && !i.occurrences.some((o: any) => o.location.trim() === importLocationFilter)) return false;
                    if (!importSearchTerm) return true;
                    return normalize(i.customTitle || i.customDescription || i.description).includes(term) || i.item.includes(term);
                  });
                  
                  const allFilteredSelected = filtered.every(i => selectedImportItems.has(i.item));
                  
                  const newSet = new Set(selectedImportItems);
                  if (allFilteredSelected) {
                    filtered.forEach(i => newSet.delete(i.item));
                  } else {
                    filtered.forEach(i => newSet.add(i.item));
                  }
                  setSelectedImportItems(newSet);
                }}
                className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-700"
              >
                Selecionar/Desmarcar Visíveis
              </button>
              <div className="flex gap-3">
                <button onClick={() => setIsImportModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800/50 rounded-lg">Cancelar</button>
                <button onClick={handleConfirmImport} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
                  Importar ({selectedImportItems.size}) Itens
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
