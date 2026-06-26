import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Search, Plus, LogOut, Upload, Clock, Zap, User as UserIcon, Trash2, Copy, Fingerprint, Menu, Edit2, Check } from 'lucide-react';
import { db } from '../services/db';
import type { Workbook, WorkbookVersion } from '../services/db';
import * as ExcelJS from 'exceljs';
import { QuickEstimateModal } from '../components/QuickEstimateModal';
import type { CartItem } from '../components/QuickEstimateModal';
import { CityStatisticsCard } from '../components/analytics/CityStatisticsCard';
import { SchoolSearch } from '../components/SchoolSearch';
import { getIssForMunicipio } from '../lib/iss';
import { AccountSidebar } from '../components/AccountSidebar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

export function Dashboard() {
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sreFilter, setSreFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVersionsModalOpen, setIsVersionsModalOpen] = useState(false);
  const [isQuickEstimateOpen, setIsQuickEstimateOpen] = useState(false);
  const [pendingQuickItems, setPendingQuickItems] = useState<CartItem[] | null>(null);
  const [showPasskeyPrompt, setShowPasskeyPrompt] = useState(false);
  const [isAccountSidebarOpen, setIsAccountSidebarOpen] = useState(false);
  const [selectedWorkbook, setSelectedWorkbook] = useState<Workbook | null>(null);
  const [workbookVersions, setWorkbookVersions] = useState<WorkbookVersion[]>([]);
  const [currentDraftItems, setCurrentDraftItems] = useState<any[]>([]);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingVersionName, setEditingVersionName] = useState<string>('');
  const [cityData, setCityData] = useState<any[]>([]);
  const [catalogMap, setCatalogMap] = useState<Map<string, number>>(new Map());
  const [catalogDescMap, setCatalogDescMap] = useState<Map<string, string>>(new Map());

  const [analyticsData, setAnalyticsData] = useState<{ id: string, total: number, city: string, date: Date }[]>([]);
  const [userName, setUserName] = useState('');
  const [periodFilter, setPeriodFilter] = useState('15d');

  const [totalBalance, setTotalBalance] = useState(0);

  const navigate = useNavigate();

  // Header form states
  const [formEscola, setFormEscola] = useState('');
  const [formCodEscola, setFormCodEscola] = useState('');
  const [formSRE, setFormSRE] = useState('');
  const [formMunicipio, setFormMunicipio] = useState('');
  const [formISS, setFormISS] = useState('5');
  const [formServicos, setFormServicos] = useState('');
  const [formEngenheiro, setFormEngenheiro] = useState('');
  const [formCrea, setFormCrea] = useState('');
  const [formDataElaboracao, setFormDataElaboracao] = useState(new Date().toISOString().split('T')[0]);
  const [formRev, setFormRev] = useState('1');

  const [userSre, setUserSre] = useState('');

  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchUserProfile();
    loadData();
    checkPasskeyPrompt();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const u = await db.auth.getUser();
      if (u) {
        setUserSre(u.sre || '');
        setFormSRE(u.sre || '');
        setFormEngenheiro(u.nome || '');
        if (u.nome) setUserName(u.nome);
        setFormCrea(u.crea || '');
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  };

  const checkPasskeyPrompt = async () => {
    try {
      const skipped = localStorage.getItem('skip_passkey_prompt');
      if (skipped) return;
      const passkeys = await db.auth.listPasskeys();
      if (passkeys.length === 0) {
        setShowPasskeyPrompt(true);
      }
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    if (!analyticsData.length) return;

    let filtered = analyticsData;
    const now = new Date();
    if (periodFilter === '15d') {
      const past = new Date(); past.setDate(now.getDate() - 15);
      filtered = analyticsData.filter(d => d.date >= past);
    } else if (periodFilter === '30d') {
      const past = new Date(); past.setDate(now.getDate() - 30);
      filtered = analyticsData.filter(d => d.date >= past);
    } else if (periodFilter === '3m') {
      const past = new Date(); past.setMonth(now.getMonth() - 3);
      filtered = analyticsData.filter(d => d.date >= past);
    } else if (periodFilter === '6m') {
      const past = new Date(); past.setMonth(now.getMonth() - 6);
      filtered = analyticsData.filter(d => d.date >= past);
    } else if (periodFilter === '1y') {
      const past = new Date(); past.setFullYear(now.getFullYear() - 1);
      filtered = analyticsData.filter(d => d.date >= past);
    }

    let grandTotal = 0;
    const cityTotals: Record<string, number> = {};

    filtered.forEach(d => {
      grandTotal += d.total;
      cityTotals[d.city] = (cityTotals[d.city] || 0) + d.total;
    });

    setTotalBalance(grandTotal);

    const processedCities = Object.entries(cityTotals)
      .map(([name, value]) => ({
        name,
        value,
        percentage: grandTotal > 0 ? (value / grandTotal) * 100 : 0,
        color: ''
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    setCityData(processedCities);
  }, [analyticsData, periodFilter]);

  const loadData = async () => {
    const list = await db.workbooks.list();
    setWorkbooks(list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    
    const user = await db.auth.getUser();
    if (user) {
      if (user.nome) { setFormEngenheiro(user.nome); setUserName(user.nome); }
      if (user.crea) setFormCrea(user.crea);
      if (user.sre) setFormSRE(user.sre);
    }

    try {
      const res = await fetch('/catalogo.json');
      const catalog = await res.json();
      const newCatalogMap = new Map();
      const newCatalogDescMap = new Map();
      catalog.forEach((item: any) => {
        newCatalogMap.set(item.item, item.price);
        newCatalogDescMap.set(item.item, item.description);
      });
      setCatalogMap(newCatalogMap);
      setCatalogDescMap(newCatalogDescMap);

      let grandTotal = 0;
      const cityTotals: Record<string, number> = {};
      const newAnalyticsData: { id: string, total: number, city: string, date: Date }[] = [];

      for (const wb of list) {
        let items: any[] = [];
        const versions = await db.versions.list(wb.id);
        if (versions.length > 0) {
          const itemsJson = versions[0].items_json;
          items = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
        } else {
          items = await db.items.list(wb.id);
        }

        let wbTotal = 0;
        for (const i of items) {
          const code = i.item_code || i.item;
          let parsedOccurrences = i.occurrences;
          let customPrice: number | undefined = undefined;

          if (!parsedOccurrences && i.memory && typeof i.memory === 'string') {
            if (i.memory.startsWith('{')) {
              try {
                const parsed = JSON.parse(i.memory);
                if (parsed.occurrences) parsedOccurrences = parsed.occurrences;
                if (parsed.custom && parsed.custom.price !== undefined) customPrice = parsed.custom.price;
              } catch (e) {}
            } else if (i.memory.startsWith('[')) {
              try {
                parsedOccurrences = JSON.parse(i.memory);
              } catch (e) {}
            }
          }

          // Fallback if cloud items_json has it flat:
          if (i.customPrice !== undefined) {
             customPrice = i.customPrice;
          }

          const price = customPrice !== undefined ? customPrice : (newCatalogMap.get(code) || 0);
          
          let qty = 0;
          if (parsedOccurrences && Array.isArray(parsedOccurrences)) {
            qty = parsedOccurrences.reduce((sum, occ) => sum + (Number(evaluateMath(occ.quantity)) || 0), 0);
          } else {
            qty = Number(evaluateMath(i.quantity || '0')) || 0;
          }

          wbTotal += qty * price;
        }


        let bdiRate = 0.2443;
        if (wb.iss === '2') bdiRate = 0.2246;
        else if (wb.iss === '2.5') bdiRate = 0.2279;
        else if (wb.iss === '3') bdiRate = 0.2312;
        else if (wb.iss === '4') bdiRate = 0.2377;
        else if (wb.iss === '5') bdiRate = 0.2443;
        const totalComBdi = wbTotal * (1 + bdiRate);
        grandTotal += totalComBdi;
        const city = wb.municipio || 'Sem Município';
        cityTotals[city] = (cityTotals[city] || 0) + totalComBdi;

        newAnalyticsData.push({
          id: wb.id,
          total: totalComBdi,
          city: city,
          date: new Date(wb.created_at)
        });
      }

      setAnalyticsData(newAnalyticsData);
      setTotalBalance(grandTotal);

      const processedCities = Object.entries(cityTotals)
        .map(([name, value]) => ({
          name,
          value,
          percentage: grandTotal > 0 ? (value / grandTotal) * 100 : 0,
          color: ''
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      setCityData(processedCities);



    } catch (e) {
      console.error("Erro ao processar analytics:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await db.auth.signOut();
    navigate('/login');
  };

  const handleOpenVersions = async (wb: Workbook) => {
    setSelectedWorkbook(wb);
    const versions = await db.versions.list(wb.id);
    setWorkbookVersions(versions);
    const items = await db.items.list(wb.id);
    setCurrentDraftItems(items);
    setIsVersionsModalOpen(true);
  };
  
  const calculateItemsTotal = (items: any[], iss: string) => {
    let wbTotal = 0;
    for (const i of items) {
      const code = i.item_code || i.item;
      let parsedOccurrences = i.occurrences;
      let customPrice: number | undefined = undefined;

      if (!parsedOccurrences && i.memory && typeof i.memory === 'string') {
        if (i.memory.startsWith('{')) {
          try {
            const parsed = JSON.parse(i.memory);
            if (parsed.occurrences) parsedOccurrences = parsed.occurrences;
            if (parsed.custom && parsed.custom.price !== undefined) customPrice = parsed.custom.price;
          } catch (e) {}
        } else if (i.memory.startsWith('[')) {
          try {
            parsedOccurrences = JSON.parse(i.memory);
          } catch (e) {}
        }
      }

      if (i.customPrice !== undefined) customPrice = i.customPrice;

      const price = customPrice !== undefined ? customPrice : (catalogMap.get(code) || 0);
      
      let qty = 0;
      if (parsedOccurrences && Array.isArray(parsedOccurrences)) {
        qty = parsedOccurrences.reduce((sum: number, occ: any) => sum + (Number(evaluateMath(occ.quantity)) || 0), 0);
      } else {
        qty = Number(evaluateMath(i.quantity || '0')) || 0;
      }

      wbTotal += qty * price;
    }

    let bRate = 0.2443;
    if (iss === '2') bRate = 0.2246;
    else if (iss === '2.5') bRate = 0.2279;
    else if (iss === '3') bRate = 0.2312;
    else if (iss === '4') bRate = 0.2377;
    else if (iss === '5') bRate = 0.2443;
    
    return wbTotal * (1 + bRate);
  };

  const getVersionDiff = (vItemsJson: string) => {
    try {
      const vItems = typeof vItemsJson === 'string' ? JSON.parse(vItemsJson) : vItemsJson;
      const vMap = new Map<string, any>(vItems.map((i: any) => [i.item_code || i.item, i]));
      const currMap = new Map<string, any>(currentDraftItems.map(i => [i.item_code || i.item, i]));
      
      let added = 0;
      let removed = 0;
      let changed = 0;
      
      const changesDetails: { type: 'added' | 'removed' | 'changed', title: string, oldVal: number, newVal: number }[] = [];

      const getItemTotal = (item: any) => {
        let qty = 0;
        let parsedOccurrences = item.occurrences;
        let customPrice: number | undefined = undefined;
        
        if (item.customPrice !== undefined) customPrice = item.customPrice;
        
        if (!parsedOccurrences && item.memory && typeof item.memory === 'string') {
          if (item.memory.startsWith('{')) {
            try {
              const parsed = JSON.parse(item.memory);
              if (parsed.occurrences) parsedOccurrences = parsed.occurrences;
              if (parsed.custom && parsed.custom.price !== undefined) customPrice = parsed.custom.price;
            } catch (e) {}
          } else if (item.memory.startsWith('[')) {
            try {
              parsedOccurrences = JSON.parse(item.memory);
            } catch (e) {}
          }
        }

        if (parsedOccurrences && typeof parsedOccurrences !== 'string') {
          qty = parsedOccurrences.reduce((sum: number, occ: any) => sum + (Number(evaluateMath(occ.quantity)) || 0), 0);
        } else if (typeof parsedOccurrences === 'string') {
          try {
            qty = JSON.parse(parsedOccurrences).reduce((sum: number, occ: any) => sum + (Number(evaluateMath(occ.quantity)) || 0), 0);
          } catch (e) {
             qty = Number(evaluateMath(item.quantity || '0')) || 0;
          }
        } else {
          qty = Number(evaluateMath(item.quantity || '0')) || 0;
        }
        
        const code = item.item_code || item.item;
        const price = customPrice !== undefined ? customPrice : (catalogMap.get(code) || 0);
        
        return qty * price;
      };

      currMap.forEach((curr, code) => {
        if (!vMap.has(code)) {
          added++;
          changesDetails.push({ type: 'added', title: curr.customTitle || curr.description || curr.item || catalogDescMap.get(code) || code, oldVal: 0, newVal: getItemTotal(curr) });
        } else {
          const v = vMap.get(code);
          if (JSON.stringify(curr.occurrences) !== JSON.stringify(v.occurrences)) {
            const oldVal = getItemTotal(v);
            const newVal = getItemTotal(curr);
            if (Math.abs(oldVal - newVal) > 0.01) {
              changed++;
              changesDetails.push({ type: 'changed', title: curr.customTitle || curr.description || curr.item || catalogDescMap.get(code) || code, oldVal, newVal });
            }
          }
        }
      });

      vMap.forEach((v, code) => {
        if (!currMap.has(code)) {
          removed++;
          changesDetails.push({ type: 'removed', title: v.customTitle || v.description || v.item || catalogDescMap.get(code) || code, oldVal: getItemTotal(v), newVal: 0 });
        }
      });

      const vTotal = calculateItemsTotal(vItems, selectedWorkbook?.iss || '5');
      const currTotal = calculateItemsTotal(currentDraftItems, selectedWorkbook?.iss || '5');

      return { added, removed, changed, changesDetails, vTotal, currTotal };
    } catch (e) {
      return { added: 0, removed: 0, changed: 0, changesDetails: [], vTotal: 0, currTotal: 0 };
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = await db.auth.getUser();
    if (!user) return;

    const newWb = await db.workbooks.create({
      user_id: user.id,
      escola: formEscola,
      cod_escola: formCodEscola,
      municipio: formMunicipio,
      sre: formSRE,
      servicos: formServicos,
      iss: formISS,
      engenheiro: formEngenheiro,
      crea: formCrea,
      data_elaboracao: formDataElaboracao,
      rev: formRev
    });

    if (pendingQuickItems && pendingQuickItems.length > 0) {
      const itemsToSave = pendingQuickItems.map(item => ({
        item_code: item.item,
        quantity: item.quantity,
        memory: '',
        location: ''
      }));
      await db.items.saveAll(newWb.id, itemsToSave);
      setPendingQuickItems(null);
    }
    
    navigate(`/editor/${newWb.id}`);
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const user = await db.auth.getUser();
      if (!user) return;

      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const ws = workbook.getWorksheet("Plan1");

      if (!ws) {
        showToast("Aba 'Plan1' não encontrada no arquivo.", "error");
        return;
      }

      // Lê o cabeçalho
      const escolaRaw = ws.getCell('B2').value?.toString() || 'Importada';
      const escola = escolaRaw.replace(/^escola\s+estadual:\s*/i, '').replace(/^escola:\s*/i, '').trim();
      
      const codEscolaRaw = ws.getCell('D2').value?.toString() || '';
      const codEscola = codEscolaRaw.replace(/^cod\s+escola:\s*/i, '').replace(/^c[oó]digo:\s*/i, '').trim();
      
      const sreRaw = ws.getCell('G2').value?.toString() || '';
      const sre = sreRaw.replace(/^sre:\s*/i, '').trim();
      
      const municipioRaw = ws.getCell('B3').value?.toString() || '';
      const municipio = municipioRaw.replace(/^munic[ií]pio:\s*/i, '').trim();
      
      let iss = ws.getCell('D3').value;
      iss = iss !== null && iss !== undefined ? (parseFloat(iss.toString()) * 100).toString() : '5';
      const servicos = ws.getCell('F3').value?.toString() || '';

      const newWb = await db.workbooks.create({
        user_id: user.id,
        escola,
        cod_escola: codEscola,
        municipio,
        sre,
        iss,
        servicos
      });

      const importedItems: any[] = [];
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
            importedItems.push({
              item_code: itemCode,
              quantity: qty.toString(),
              memory,
              location
            });
          }
        }
      });

      if (importedItems.length > 0) {
        sessionStorage.setItem('pendingImportItems', JSON.stringify(importedItems));
      }

      showToast(`Planilha importada! Selecione os itens...`, "success");
      setTimeout(() => navigate(`/editor/${newWb.id}?showImportModal=true`), 1000);

    } catch (error) {
      console.error(error);
      showToast("Erro ao ler o arquivo XLSX.", "error");
    } finally {
      event.target.value = '';
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Tem certeza que deseja excluir este orçamento?")) {
      await db.workbooks.delete(id);
      loadData();
    }
  };

  const handleClone = async (wb: Workbook, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Deseja criar uma cópia do orçamento "${wb.escola}"?`)) {
      try {
        // Criar o novo workbook
        const newWb = await db.workbooks.create({
          user_id: wb.user_id,
          escola: wb.escola + " - Cópia",
          municipio: wb.municipio,
          sre: wb.sre,
          cod_escola: wb.cod_escola,
          iss: wb.iss,
          servicos: wb.servicos
        });

        // Copiar os itens da última versão do workbook original
        const originalVersions = await db.versions.list(wb.id);
        if (originalVersions.length > 0) {
          const latestVersion = originalVersions[0]; // array sorted by created_at DESC
          const itemsToCopy = JSON.parse(latestVersion.items_json);
          
          if (itemsToCopy && itemsToCopy.length > 0) {
            // A própria create cria uma versão V1
            await db.versions.create(newWb.id, itemsToCopy);
            
            // Mas precisamos garantir que os itens também são salvos no draft atual (se a app carregar isso)
            // No caso do nosso app, a `Editor.tsx` carrega o workbook, e se não tem state local, puxa as versões.
            // Apenas criar a version já deve bastar para o Editor carregar.
            // Para ser robusto, não tem draft, o draft está na versão.
          }
        }
        
        showToast("Orçamento clonado com sucesso!", "success");
        loadData();
      } catch (error) {
        console.error(error);
        showToast("Erro ao clonar o orçamento.", "error");
      }
    }
  };

  const handleEditVersion = (e: React.MouseEvent, v: WorkbookVersion) => {
    e.stopPropagation();
    setEditingVersionId(v.id);
    setEditingVersionName(v.name || 'Versão Salva');
  };

  const handleSaveVersionName = async (e: React.SyntheticEvent, id: string) => {
    e.stopPropagation();
    try {
      await db.versions.update(id, { name: editingVersionName });
      setWorkbookVersions(prev => prev.map(v => v.id === id ? { ...v, name: editingVersionName } : v));
      setEditingVersionId(null);
      showToast("Nome da versão atualizado!", "success");
    } catch (err) {
      showToast("Erro ao renomear versão", "error");
    }
  };

  const handleDeleteVersion = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Tem certeza que deseja excluir esta versão permanentemente?")) {
      try {
        await db.versions.delete(id);
        setWorkbookVersions(prev => prev.filter(v => v.id !== id));
        showToast("Versão excluída", "success");
      } catch (err) {
        showToast("Erro ao excluir versão", "error");
      }
    }
  };

  const availableSREs = Array.from(new Set(workbooks.map(w => w.sre).filter(Boolean))).sort();

  const filteredWorkbooks = workbooks.filter(w => {
    const normalize = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const term = normalize(searchTerm);
    const matchSearch = normalize(w.escola).includes(term) ||
                        normalize(w.municipio).includes(term) ||
                        normalize(w.cod_escola).includes(term);
    const matchStatus = statusFilter && statusFilter !== 'all' ? (w.status || 'Em andamento').toLowerCase() === statusFilter.toLowerCase() : true;
    const matchSRE = sreFilter && sreFilter !== 'all' ? w.sre === sreFilter : true;
    return matchSearch && matchStatus && matchSRE;
  });

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* PASSKEY PROMPT MODAL */}
      {showPasskeyPrompt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-slate-100 text-slate-800 rounded-full flex items-center justify-center shadow-inner mx-auto mb-4">
              <Fingerprint size={32} />
            </div>
            <h3 className="text-xl font-bold text-center text-slate-800 mb-2">Login mais rápido e seguro?</h3>
            <p className="text-slate-500 text-center text-sm mb-6">
              Notamos que você ainda não configurou o login por biometria (Passkey). Com ele você entra na plataforma usando apenas a sua digital ou Face ID, sem precisar digitar senhas.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={async () => {
                  try {
                    await db.auth.registerPasskey();
                    showToast("Passkey registrado com sucesso!", "success");
                    setShowPasskeyPrompt(false);
                  } catch (err: any) {
                    showToast(err.message || "Erro ao registrar Passkey", "error");
                  }
                }}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Fingerprint size={20} />
                Ativar agora
              </button>
              <button
                onClick={() => {
                  localStorage.setItem('skip_passkey_prompt', 'true');
                  setShowPasskeyPrompt(false);
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-3 px-4 rounded-xl transition-colors"
              >
                Mais tarde
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      <header className="bg-emerald-800 text-white shadow-md p-4 sticky top-0 z-10">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={28} className="text-emerald-300 hidden sm:block" />
            <div className="flex flex-col">
              <h1 className="text-lg md:text-xl font-bold tracking-wide leading-tight">Portal de Orçamentos SEE-MG</h1>
              {userName && <span className="text-xs font-medium text-emerald-100">Engº. {userName}</span>}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <button 
              onClick={() => setIsAccountSidebarOpen(true)}
              className="flex items-center gap-2 text-emerald-200 hover:text-white transition-colors text-sm font-medium"
            >
              <UserIcon size={18} /> Minha Conta
            </button>
            <div className="w-px h-4 bg-emerald-700/50"></div>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 text-emerald-200 hover:text-white transition-colors text-sm font-medium"
            >
              <LogOut size={18} /> Sair
            </button>
          </div>
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsAccountSidebarOpen(true)}
              className="p-2 -mr-2 text-emerald-100 hover:text-white transition-colors"
            >
              <Menu size={24} />
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto flex-1 p-3 md:py-6">
        {/* ANALYTICS SECTION */}
        <div className="mb-3">
          <CityStatisticsCard 
            totalBalance={totalBalance} 
            cities={cityData} 
            periodFilter={periodFilter}
            setPeriodFilter={setPeriodFilter}
          />
        </div>

        <div className="flex flex-col md:flex-row gap-3 mb-3 w-full items-start">
          <div className="w-full md:w-[calc(50%-0.375rem)] lg:w-[calc(33.333333%-0.5rem)] shrink-0 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Buscar por escola, município ou código..." 
              className="w-full bg-white pl-10 pr-4 py-2 rounded-lg border border-slate-200 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all h-[42px]"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex-1 w-full flex flex-wrap xl:flex-nowrap gap-3">
             <div className="flex-1 min-w-[140px]">
               <Select value={statusFilter || 'all'} onValueChange={val => setStatusFilter(val === 'all' ? '' : val)}>
                 <SelectTrigger className="w-full !bg-white border-slate-200 focus:ring-emerald-500 !h-[42px] rounded-lg shadow-sm font-medium text-slate-700">
                   <SelectValue placeholder="Status (Todos)" />
                 </SelectTrigger>
                 <SelectContent position="popper" sideOffset={4}>
                   <SelectItem value="all">Status (Todos)</SelectItem>
                   <SelectItem value="Em andamento">Em andamento</SelectItem>
                   <SelectItem value="Em revisão">Em revisão</SelectItem>
                   <SelectItem value="Finalizado">Finalizado</SelectItem>
                 </SelectContent>
               </Select>
             </div>

             <div className="flex-1 min-w-[140px]">
               <Select value={sreFilter || 'all'} onValueChange={val => setSreFilter(val === 'all' ? '' : val)}>
                 <SelectTrigger className="w-full !bg-white border-slate-200 focus:ring-emerald-500 !h-[42px] rounded-lg shadow-sm font-medium text-slate-700">
                   <SelectValue placeholder="SRE (Todas)" />
                 </SelectTrigger>
                 <SelectContent position="popper" sideOffset={4}>
                   <SelectItem value="all">SRE (Todas)</SelectItem>
                   {availableSREs.map(sre => (
                     <SelectItem key={sre} value={sre}>{sre}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>

            <button 
              onClick={() => setIsQuickEstimateOpen(true)}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 h-[42px] rounded-lg hover:bg-indigo-100 transition-colors shadow-sm font-medium whitespace-nowrap text-sm"
            >
              <Zap size={16} /> Rápido
            </button>
            <label className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 bg-white border border-slate-300 text-slate-700 px-2 h-[42px] rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium cursor-pointer whitespace-nowrap text-sm">
              <Upload size={16} /> Importar
              <input type="file" accept=".xlsx" className="hidden" onChange={handleImportExcel} />
            </label>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 bg-emerald-600 text-white px-2 h-[42px] rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-medium whitespace-nowrap text-sm"
            >
              <Plus size={16} /> Novo
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col gap-3 animate-pulse">
                <div className="flex justify-between items-start">
                  <div className="h-5 bg-slate-200 rounded w-16"></div>
                  <div className="h-5 bg-slate-200 rounded w-20"></div>
                </div>
                <div className="h-6 bg-slate-200 rounded w-3/4"></div>
                <div className="h-8 bg-emerald-100 rounded w-1/3"></div>
                <div className="flex justify-between items-center mt-2">
                  <div className="h-4 bg-slate-200 rounded w-24"></div>
                  <div className="h-4 bg-slate-200 rounded w-12"></div>
                </div>
              </div>
            ))
          ) : filteredWorkbooks.map(wb => {
            const wbAnalytics = analyticsData.find(a => a.id === wb.id);
            const totalValue = wbAnalytics ? wbAnalytics.total : 0;
            return (
            <div 
              key={wb.id} 
              onClick={() => handleOpenVersions(wb)}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow cursor-pointer hover:border-emerald-300 group flex flex-col gap-3 relative"
            >
              <div className="flex justify-between items-start">
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">
                  {wb.cod_escola || 'S/ COD'}
                </span>
                <div className="flex gap-2 items-center">
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                    wb.status === 'Finalizado' ? 'bg-indigo-100 text-indigo-700' :
                    wb.status === 'Em revisão' ? 'bg-amber-100 text-amber-700' :
                    'bg-sky-100 text-sky-700'
                  }`}>
                    {wb.status || 'Em andamento'}
                  </span>
                  <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded hidden sm:inline-block">
                    {new Date(wb.created_at).toLocaleDateString('pt-BR')}
                  </span>
                  
                  <div className="flex gap-0.5 ml-1">
                    <button 
                      onClick={(e) => handleClone(wb, e)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                      title="Clonar Planilha"
                    >
                      <Copy size={16} />
                    </button>
                    <button 
                      onClick={(e) => handleDelete(wb.id, e)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Excluir Planilha"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-slate-800 line-clamp-2 group-hover:text-emerald-700 transition-colors">
                {wb.escola || 'Escola sem nome'}
              </h3>
              
              <div className="flex items-center justify-between mt-auto w-full gap-1">
                <div className="text-base sm:text-lg font-bold text-emerald-600 flex-1 truncate text-left">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
                </div>
                
                <div className="w-px h-4 sm:h-5 bg-slate-200 hidden sm:block"></div>
                
                <div className="text-xs sm:text-[13px] font-medium uppercase text-slate-500 truncate flex-1 text-center">
                  {wb.municipio}
                </div>
                
                <div className="w-px h-4 sm:h-5 bg-slate-200 hidden sm:block"></div>
                
                <div className="flex-1 flex justify-end shrink-0 min-w-0">
                  <span className="text-[10px] sm:text-xs bg-slate-50 border border-slate-100 px-2 py-0.5 rounded text-slate-500 truncate max-w-full">
                    {wb.sre}
                  </span>
                </div>
              </div>
            </div>
            );
          })}
          {filteredWorkbooks.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500">
              Nenhum orçamento encontrado.
            </div>
          )}
        </div>
      </main>

      <AccountSidebar 
        isOpen={isAccountSidebarOpen} 
        onClose={() => setIsAccountSidebarOpen(false)} 
        onLogout={handleLogout} 
      />

      {/* MODAL NOVO ORÇAMENTO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Plus className="text-emerald-600" /> Criar Novo Orçamento
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <LogOut size={20} className="rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Escola Estadual</label>
                  <SchoolSearch 
                    value={formEscola} 
                    onChange={setFormEscola} 
                    userSre={userSre}
                    onSelect={(escola) => {
                      setFormEscola(escola.nome);
                      setFormCodEscola(escola.codigo);
                      setFormMunicipio(escola.municipio);
                      setFormISS(getIssForMunicipio(escola.municipio));
                      setFormSRE(escola.sre);
                    }} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cód. Escola</label>
                  <input type="text" value={formCodEscola} readOnly className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-100 text-slate-500 cursor-not-allowed outline-none" placeholder="Ex: 12345" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Município</label>
                  <input type="text" value={formMunicipio} readOnly className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-100 text-slate-500 cursor-not-allowed outline-none" placeholder="Ex: Belo Horizonte" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">S.R.E.</label>
                  <input type="text" value={formSRE} readOnly className="w-full px-3 py-2 border border-slate-300 rounded-md bg-slate-100 text-slate-500 cursor-not-allowed outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Serviços da Planilha</label>
                  <input type="text" value={formServicos} onChange={e => setFormServicos(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ex: Reforma do Telhado" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Taxa ISS (%)</label>
                  <input type="number" step="0.01" value={formISS} onChange={e => setFormISS(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                </div>

                <div className="col-span-full border-t border-slate-100 mt-2 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Informações Opcionais Adicionais</h3>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-5">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Engenheiro(a)</label>
                      <input type="text" value={formEngenheiro} onChange={e => setFormEngenheiro(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Nome" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">CREA</label>
                      <input type="text" value={formCrea} onChange={e => setFormCrea(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Número" />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Data Elaboração</label>
                      <input type="date" value={formDataElaboracao} onChange={e => setFormDataElaboracao(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">REV</label>
                      <input type="number" min="0" value={formRev} onChange={e => setFormRev(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-6 flex justify-end gap-3 border-t border-slate-100 mt-6 sticky bottom-0 bg-white">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm">
                  Salvar e Abrir Planilha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE VERSÕES */}
      {isVersionsModalOpen && selectedWorkbook && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Clock className="text-emerald-600" /> Versões do Orçamento
              </h2>
              <div className="flex gap-2">
                <button 
                  onClick={(e) => {
                    setIsVersionsModalOpen(false);
                    if(selectedWorkbook) handleDelete(selectedWorkbook.id, e);
                  }} 
                  className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
                >
                  <Trash2 size={18} />
                  Excluir Planilha
                </button>
                <button onClick={() => setIsVersionsModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  <LogOut size={20} className="rotate-45" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div 
                onClick={() => navigate(`/editor/${selectedWorkbook.id}`)}
                className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors flex justify-between items-center"
              >
                <div>
                  <h3 className="font-bold text-emerald-800">Rascunho Atual (Trabalhando)</h3>
                  <p className="text-xs text-emerald-600 mt-1">Sua sessão atual com as últimas modificações.</p>
                </div>
                <div className="bg-emerald-600 text-white p-2 rounded-full">
                  <Plus size={16} />
                </div>
              </div>

              {workbookVersions.length > 0 ? (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wider">Histórico na Nuvem</h3>
                  <div className="space-y-3">
                    {workbookVersions.map(v => {
                      const diff = getVersionDiff(v.items_json);
                      const hasChanges = diff.added > 0 || diff.removed > 0 || diff.changed > 0 || Math.abs(diff.vTotal - diff.currTotal) > 0.01;
                      
                      const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
                      
                      return (
                        <div 
                          key={v.id}
                          onClick={() => navigate(`/editor/${selectedWorkbook.id}?version=${v.id}`)}
                          className="bg-white border border-slate-200 p-3 rounded-xl cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-2 group"
                        >
                          <div className="flex-1 w-full">
                            <div className="flex items-center gap-2">
                              {editingVersionId === v.id ? (
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="text" 
                                    value={editingVersionName} 
                                    onChange={e => setEditingVersionName(e.target.value)} 
                                    className="border border-slate-300 rounded px-2 py-1 text-sm font-medium text-slate-700 w-48 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    autoFocus
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleSaveVersionName(e, v.id);
                                    }}
                                  />
                                  <button onClick={(e) => handleSaveVersionName(e, v.id)} className="text-emerald-600 hover:text-emerald-700 p-1">
                                    <Check size={16} />
                                  </button>
                                </div>
                              ) : (
                                <h4 className="font-medium text-slate-700">{v.name || 'Versão Salva'}</h4>
                              )}
                              {!hasChanges && (
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold inline-block">Igual ao Rascunho Atual</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">{new Date(v.created_at).toLocaleString('pt-BR')}</p>
                            
                            {hasChanges && (
                              <div className="flex flex-col gap-1.5 mt-2 border-t border-slate-100 pt-2">
                                {diff.changesDetails.map((c, i) => (
                                  <div key={i} className="text-[11px] flex flex-col p-2 bg-slate-50 rounded border border-slate-100">
                                    <span className="font-medium text-slate-700 break-words whitespace-pre-wrap leading-relaxed" title={c.title}>
                                      {c.type === 'added' && <span className="text-emerald-600 font-bold mr-1">[NOVO]</span>}
                                      {c.type === 'removed' && <span className="text-red-500 font-bold mr-1">[REMOVIDO]</span>}
                                      {c.type === 'changed' && <span className="text-amber-600 font-bold mr-1">[ALTERADO]</span>}
                                      {c.title}
                                    </span>
                                    <div className="mt-1">
                                      {c.type === 'changed' && (
                                        <span className="text-[10px] text-slate-500">
                                          <>De <span className="line-through">{formatter.format(c.oldVal)}</span> para <span className="font-bold text-slate-700">{formatter.format(c.newVal)}</span></>
                                        </span>
                                      )}
                                      {c.type === 'added' && (
                                        <span className="text-[10px] text-emerald-600 font-medium">
                                          {formatter.format(c.newVal)}
                                        </span>
                                      )}
                                      {c.type === 'removed' && (
                                        <span className="text-[10px] text-red-500 font-medium">
                                          {formatter.format(c.oldVal)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col md:items-end justify-center gap-2">
                             <div className="flex items-center justify-end gap-2 w-full">
                               <button 
                                 onClick={(e) => handleEditVersion(e, v)}
                                 className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                                 title="Renomear versão"
                               >
                                 <Edit2 size={16} />
                               </button>
                               <button 
                                 onClick={(e) => handleDeleteVersion(e, v.id)}
                                 className="text-slate-400 hover:text-red-600 transition-colors p-1"
                                 title="Excluir versão"
                               >
                                 <Trash2 size={16} />
                               </button>
                               <div className="text-slate-300 group-hover:text-emerald-600 transition-colors hidden md:block ml-1">
                                 <LogOut className="rotate-180" size={18} />
                               </div>
                             </div>
                             <div className="flex flex-col items-end gap-1">
                               <div className="text-sm font-bold text-slate-800">{formatter.format(diff.vTotal)}</div>
                               {hasChanges && (
                                 <div className="text-[10px] font-medium text-slate-500 line-through decoration-slate-400 opacity-70">
                                   Rascunho: {formatter.format(diff.currTotal)}
                                 </div>
                               )}
                             </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="mt-6 text-center py-6 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                  <p className="text-slate-500 text-sm">Nenhuma versão salva na nuvem ainda.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QUICK ESTIMATE MODAL */}
      {isQuickEstimateOpen && (
        <QuickEstimateModal onClose={(items?: CartItem[]) => {
          setIsQuickEstimateOpen(false);
          if (items && items.length > 0) {
            setPendingQuickItems(items);
            setIsModalOpen(true);
            showToast("Itens do orçamento rápido aguardando efetivação. Preencha os dados da escola.", "success");
          }
        }} />
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] pointer-events-none">
          <div className={`px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
