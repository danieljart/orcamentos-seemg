import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { saveAs } from 'file-saver';
import {
  FileSpreadsheet, X, Download, Share2, StickyNote, ListChecks, Edit2, Plus, Search, Lock, LockOpen, Trash2,
  ChevronDown, Loader2, CheckCircle2, AlertTriangle, AlertCircle, Upload, Undo2, Redo2, Cloud, CloudOff, PenLine,
} from 'lucide-react';
import { db, isMissingColumnError } from '../services/db';
import type { Workbook } from '../services/db';
import { ThemeToggle } from '../components/ThemeToggle';
import { ShareModal } from '../components/ShareModal';
import { NotesPanel } from '../components/NotesPanel';
import { ConfirmModal } from '../components/ConfirmModal';
import { ItemPickerModal } from '../components/ItemPickerModal';
import type { PickableItem } from '../components/ItemPickerModal';
import { AjusteDadosModal } from '../components/ajuste/AjusteDadosModal';
import type { DadosResultado, DadosWorkbook } from '../components/ajuste/AjusteDadosModal';
import { MarretadaModal } from '../components/ajuste/MarretadaModal';
import { ChecklistPanel } from '../components/ajuste/ChecklistPanel';
import { MjolnirIcon } from '../components/ajuste/MjolnirIcon';
import { ICONES, CORES } from '../components/ajuste/tipoVisual';
import { loadCatalog, loadExternalCatalog } from '../lib/catalog';
import type { CatalogItem } from '../lib/catalog';
import { normalizeSearchText } from '../lib/search';
import {
  parseAjusteData, calcTotais, calcBalanco, verificar, tipoInfo, qtyOf, unitPrice, isNovo, newId, round2,
  brl, pct, num, parseMoney, recursoTotal,
} from '../lib/ajuste';
import type { AjusteData, AjusteItem } from '../lib/ajuste';
import { buildAjusteXlsx, nomeArquivoAjuste } from '../lib/ajusteExport';
import { lerPlanilhaContrato } from '../lib/ajusteImport';
import type { ContratoLido } from '../lib/ajusteImport';

type Filtro = 'todos' | 'alterados' | 'novos' | 'suprimidos';
type SaveState = 'salvo' | 'pendente' | 'salvando' | 'erro';

const GRID = 'lg:grid lg:items-center lg:gap-2 lg:grid-cols-[64px_minmax(200px,1fr)_38px_96px_104px_104px_72px_100px_58px] xl:gap-3 xl:grid-cols-[76px_minmax(0,1fr)_44px_110px_122px_122px_84px_114px_70px]';

/** Campo de quantidade que aceita expressões ("3,5 x 2") e mostra o resultado. */
function QtyInput({ id, value, onChange, disabled, tone, max }: {
  id: string; value: string; onChange: (v: string) => void; disabled: boolean; tone: 'add' | 'sup'; max?: number;
}) {
  const n = qtyOf(value);
  const expr = value.trim() !== '' && String(n).replace('.', ',') !== value.trim() && num(n, 2) !== value.trim();
  const passou = max !== undefined && n > max + 1e-9;
  const ring = tone === 'add' ? 'focus:ring-emerald-500 focus:border-emerald-500' : 'focus:ring-rose-500 focus:border-rose-500';
  const ativo = n > 0 ? (tone === 'add' ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-800' : 'border-rose-300 bg-rose-50/60 dark:bg-rose-950/30 dark:border-rose-800') : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900';
  return (
    <div>
      <input
        id={id}
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        placeholder="0"
        inputMode="decimal"
        className={`w-full h-8 px-2 rounded-md border text-sm text-right tabular-nums outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed text-slate-800 dark:text-slate-100 ${ativo} ${ring} ${passou ? '!border-rose-500 !ring-rose-500' : ''}`}
      />
      {expr && <div className="text-[10px] text-right text-slate-400 mt-0.5 tabular-nums">= {num(n, 2)}</div>}
    </div>
  );
}

export function AjusteEditor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [data, setData] = useState<AjusteData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userSre, setUserSre] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('salvo');
  const [saveErro, setSaveErro] = useState('');

  const [catalogo, setCatalogo] = useState<CatalogItem[]>([]);
  const [externos, setExternos] = useState<CatalogItem[]>([]);

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [foco, setFoco] = useState<string | null>(null);

  const [dadosAberto, setDadosAberto] = useState(false);
  const [salvandoDados, setSalvandoDados] = useState(false);
  const [marretadaAberta, setMarretadaAberta] = useState(false);
  const [pickerAberto, setPickerAberto] = useState(false);
  const [shareAberto, setShareAberto] = useState(false);
  const [checklistAberto, setChecklistAberto] = useState(false);
  const [conferenciasAbertas, setConferenciasAbertas] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [importado, setImportado] = useState<ContratoLido | null>(null);
  const [remover, setRemover] = useState<AjusteItem | null>(null);
  const [golpeVisual, setGolpeVisual] = useState(false);

  const [notasAbertas, setNotasAbertas] = useState(false);
  const [notas, setNotas] = useState('');
  const [salvandoNotas, setSalvandoNotas] = useState(false);
  const [notasIndisponivel, setNotasIndisponivel] = useState(false);

  const [toast, setToast] = useState<{ msg: string; tipo: 'success' | 'error' } | null>(null);
  const showToast = useCallback((msg: string, tipo: 'success' | 'error') => {
    setToast({ msg, tipo });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  // ---------------------------------------------------------------------
  // Carga
  // ---------------------------------------------------------------------
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        if (!id) return;
        const [wb, uid, user] = await Promise.all([db.workbooks.get(id), db.auth.getUserId(), db.auth.getUser()]);
        if (cancelado) return;
        if (!wb) { navigate('/ajustes'); return; }
        if (wb.modulo !== 'ajuste') { navigate(`/editor/${wb.id}`, { replace: true }); return; }
        setWorkbook(wb);
        setUserId(uid);
        setUserSre(user?.sre || '');
        setNotas(wb.observacoes || '');
        const base = (wb.base_precos as '2025' | '2026') || '2026';
        setData(parseAjusteData(wb.ajuste, base));
      } catch (err) {
        console.error(err);
        showToast('Não foi possível abrir a solicitação.', 'error');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [id, navigate, showToast]);

  const base = ((workbook?.base_precos as '2025' | '2026') || '2026');
  useEffect(() => {
    if (!workbook) return;
    loadCatalog(base).then(setCatalogo).catch(() => setCatalogo([]));
    Promise.all([loadExternalCatalog('SETOP').catch(() => []), loadExternalCatalog('SUDECAP').catch(() => [])])
      .then(([a, b]) => setExternos([...a, ...b]));
  }, [workbook, base]);

  // ---------------------------------------------------------------------
  // Permissões
  // ---------------------------------------------------------------------
  const isOwner = !!workbook && userId !== null && workbook.user_id === userId;
  const isShared = !!workbook && userId !== null && workbook.user_id !== userId;
  const isFinalizado = workbook?.status === 'Finalizado';
  const isReadOnly = isShared || isFinalizado;

  // ---------------------------------------------------------------------
  // Edição com desfazer
  // ---------------------------------------------------------------------
  const undoRef = useRef<AjusteItem[][]>([]);
  const redoRef = useRef<AjusteItem[][]>([]);
  const ultimoPush = useRef(0);
  const [, forcar] = useState(0);
  const sujo = useRef(false);

  const mudarItens = useCallback((fn: (items: AjusteItem[]) => AjusteItem[], agrupar = true) => {
    setData(d => {
      if (!d) return d;
      const agora = Date.now();
      // Digitação seguida no mesmo campo vira um passo só de desfazer.
      if (!agrupar || agora - ultimoPush.current > 900) {
        undoRef.current = [...undoRef.current.slice(-49), d.items];
        redoRef.current = [];
        forcar(x => x + 1);
      }
      ultimoPush.current = agora;
      sujo.current = true;
      return { ...d, items: fn(d.items) };
    });
  }, []);

  const mudarItem = useCallback((itemId: string, patch: Partial<AjusteItem>) => {
    mudarItens(items => items.map(it => (it.id === itemId ? { ...it, ...patch } : it)));
  }, [mudarItens]);

  const desfazer = useCallback(() => {
    setData(d => {
      if (!d || undoRef.current.length === 0) return d;
      const anterior = undoRef.current[undoRef.current.length - 1];
      undoRef.current = undoRef.current.slice(0, -1);
      redoRef.current = [...redoRef.current, d.items];
      sujo.current = true;
      forcar(x => x + 1);
      return { ...d, items: anterior };
    });
  }, []);
  const refazer = useCallback(() => {
    setData(d => {
      if (!d || redoRef.current.length === 0) return d;
      const prox = redoRef.current[redoRef.current.length - 1];
      redoRef.current = redoRef.current.slice(0, -1);
      undoRef.current = [...undoRef.current, d.items];
      sujo.current = true;
      forcar(x => x + 1);
      return { ...d, items: prox };
    });
  }, []);

  useEffect(() => {
    if (isReadOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); desfazer(); }
      else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); refazer(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isReadOnly, desfazer, refazer]);

  // ---------------------------------------------------------------------
  // Contas
  // ---------------------------------------------------------------------
  const totais = useMemo(() => (data ? calcTotais(data) : null), [data]);
  const balanco = useMemo(() => (data && totais ? calcBalanco(data, totais) : null), [data, totais]);
  const conferencias = useMemo(() => (data && totais && balanco ? verificar(data, totais, balanco) : []), [data, totais, balanco]);

  // ---------------------------------------------------------------------
  // Salvamento automático
  // ---------------------------------------------------------------------
  const salvar = useCallback(async (d: AjusteData) => {
    if (!id) return;
    setSaveState('salvando');
    try {
      const t = calcTotais(d);
      const updated = await db.workbooks.update(id, { ajuste: d, valor_total: round2(t.real.geral) } as any);
      if (updated) setWorkbook(w => (w ? { ...w, updated_at: updated.updated_at } : w));
      setSaveState('salvo');
      setSaveErro('');
    } catch (err: any) {
      console.error(err);
      setSaveState('erro');
      setSaveErro(isMissingColumnError(err) ? 'Execute database/ajustes.sql no Supabase.' : (err?.message || 'Falha ao salvar.'));
    }
  }, [id]);

  useEffect(() => {
    if (!data || !sujo.current || isReadOnly) return;
    setSaveState('pendente');
    const timer = window.setTimeout(() => { sujo.current = false; salvar(data); }, 1200);
    return () => window.clearTimeout(timer);
  }, [data, isReadOnly, salvar]);

  // Não deixa fechar a aba com alteração ainda não gravada.
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (saveState === 'pendente' || saveState === 'salvando') { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [saveState]);

  const mudarData = (patch: Partial<AjusteData>) => {
    sujo.current = true;
    setData(d => (d ? { ...d, ...patch } : d));
  };

  // Notas (mesma coluna observacoes do orçamento)
  const notasTimer = useRef<number | undefined>(undefined);
  const mudarNotas = (v: string) => {
    setNotas(v);
    if (!id || isReadOnly) return;
    window.clearTimeout(notasTimer.current);
    notasTimer.current = window.setTimeout(async () => {
      setSalvandoNotas(true);
      try { await db.workbooks.update(id, { observacoes: v }); setNotasIndisponivel(false); }
      catch (err) { if (isMissingColumnError(err)) setNotasIndisponivel(true); }
      finally { setSalvandoNotas(false); }
    }, 1000);
  };

  // ---------------------------------------------------------------------
  // Catálogo para adicionar serviços
  // ---------------------------------------------------------------------
  const catPorCodigo = useMemo(() => {
    const m = new Map<string, CatalogItem>();
    for (const c of catalogo) if (!m.has(c.item)) m.set(c.item, c);
    return m;
  }, [catalogo]);

  const pickable = useMemo<PickableItem[]>(() => {
    const out: PickableItem[] = [];
    for (const c of catalogo) if (!c.isCategory && !c.item.startsWith('2600') && c.price > 0) out.push({ ...c, source: 'SEE' });
    for (const c of externos) if (!c.isCategory && c.price > 0) out.push({ ...c, source: c.source });
    return out;
  }, [catalogo, externos]);

  const bloqueados = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of data?.items || []) m.set(it.code, it.contractQty > 0 ? 'no contrato' : 'já na planilha');
    return m;
  }, [data?.items]);

  const adicionar = (p: PickableItem) => {
    setPickerAberto(false);
    const novo: AjusteItem = {
      id: newId(),
      code: p.item,
      description: p.description,
      unit: p.unit,
      source: (p.source as AjusteItem['source']) || 'SEE',
      contractQty: 0,
      contractPrice: 0,
      refPrice: p.price,
      addQty: '',
      supQty: '',
      memory: '',
      location: '',
    };
    mudarItens(items => [...items, novo], false);
    setFiltro('todos');
    setBusca('');
    setFoco(novo.id);
  };

  const adicionarAvulso = () => {
    const usados = new Set((data?.items || []).filter(i => i.code.startsWith('2600')).map(i => i.code));
    let n = 1;
    while (usados.has(`2600${String(n).padStart(2, '0')}`)) n++;
    const novo: AjusteItem = {
      id: newId(), code: `2600${String(n).padStart(2, '0')}`, description: '', unit: 'UN', source: 'MANUAL',
      contractQty: 0, contractPrice: 0, refPrice: 0, priceOverride: 0, addQty: '', supQty: '', memory: '', location: '',
    };
    mudarItens(items => [...items, novo], false);
    setAbertos(prev => new Set(prev).add(novo.id));
    setFiltro('todos');
    setFoco(novo.id);
  };

  useEffect(() => {
    if (!foco) return;
    const t = window.setTimeout(() => {
      const row = document.getElementById(`aj-row-${foco}`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (document.getElementById(`aj-add-${foco}`) as HTMLInputElement | null)?.focus();
    }, 80);
    const limpa = window.setTimeout(() => setFoco(null), 2200);
    return () => { window.clearTimeout(t); window.clearTimeout(limpa); };
  }, [foco]);

  // ---------------------------------------------------------------------
  // Importar planilha de contrato
  // ---------------------------------------------------------------------
  const lerArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const lido = await lerPlanilhaContrato(file);
      setImportado(lido);
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível ler a planilha.', 'error');
    }
  };

  const confirmarImportacao = (usarReal: boolean) => {
    if (!importado || !data) return;
    const itens = usarReal && importado.itensReal ? importado.itensReal : importado.itens;
    // Os serviços novos (fora do contrato) que já foram lançados ficam.
    const novos = data.items.filter(i => i.contractQty === 0);
    mudarItens(() => [...itens, ...novos], false);
    mudarData({
      bdiObra: importado.bdiObra || data.bdiObra,
      bdiProjeto: importado.bdiProjeto || data.bdiProjeto,
      tc: data.tc || importado.tc || '',
      valorTC: data.valorTC || importado.valorTC || 0,
      valorContratado: data.valorContratado || importado.valorContratado || importado.totalGeral || 0,
    });
    showToast(`${itens.length} serviços do contrato importados.`, 'success');
    setImportado(null);
  };

  // ---------------------------------------------------------------------
  // Exportar
  // ---------------------------------------------------------------------
  const exportar = async () => {
    if (!workbook || !data) return;
    setExportando(true);
    try {
      const blob = await buildAjusteXlsx({ workbook, data, base });
      saveAs(blob, nomeArquivoAjuste(workbook, data));
    } catch (err: any) {
      console.error(err);
      showToast(`Erro ao gerar a planilha: ${err?.message || ''}`, 'error');
    } finally {
      setExportando(false);
    }
  };

  // ---------------------------------------------------------------------
  // Dados da solicitação
  // ---------------------------------------------------------------------
  const salvarDados = async ({ workbook: w, data: d }: DadosResultado) => {
    if (!workbook || !data || !id) return;
    setSalvandoDados(true);
    try {
      const novo: AjusteData = { ...data, ...d, items: data.items, checklist: data.checklist };
      const updated = await db.workbooks.update(id, {
        escola: w.escola, cod_escola: w.cod_escola, municipio: w.municipio, sre: w.sre, servicos: w.servicos,
        engenheiro: w.engenheiro, crea: w.crea, data_elaboracao: w.data_elaboracao, base_precos: w.base_precos,
        status: w.status, ajuste: novo, valor_total: round2(calcTotais(novo).real.geral),
      } as any);
      if (updated) setWorkbook(updated);
      setData(novo);
      setDadosAberto(false);
      showToast('Dados atualizados.', 'success');
    } catch (err: any) {
      showToast(`Não foi possível salvar: ${err?.message || ''}`, 'error');
    } finally {
      setSalvandoDados(false);
    }
  };

  const reabrir = async () => {
    if (!workbook) return;
    try {
      const updated = await db.workbooks.update(workbook.id, { status: 'Em revisão' });
      if (updated) setWorkbook(updated);
      showToast('Solicitação reaberta para revisão.', 'success');
    } catch (err: any) {
      showToast(`Não foi possível reabrir: ${err?.message || ''}`, 'error');
    }
  };

  // ---------------------------------------------------------------------
  // Linhas visíveis, agrupadas por categoria da planilha
  // ---------------------------------------------------------------------
  const grupos = useMemo(() => {
    if (!data || !totais) return [];
    const termo = normalizeSearchText(busca.trim());
    const visiveis = data.items.filter(it => {
      const add = qtyOf(it.addQty), sup = qtyOf(it.supQty);
      if (filtro === 'alterados' && !(add > 0 || sup > 0)) return false;
      if (filtro === 'novos' && !isNovo(it)) return false;
      if (filtro === 'suprimidos' && !(sup > 0)) return false;
      if (termo && !normalizeSearchText(`${it.code} ${it.description} ${it.memory} ${it.location}`).includes(termo)) return false;
      return true;
    });
    const mapa = new Map<string, { code: string; nome: string; itens: AjusteItem[] }>();
    for (const it of visiveis) {
      const emOutros = it.source !== 'SEE' || it.code.startsWith('2600');
      const code = emOutros ? '260000' : it.code.slice(0, 2) + '0000';
      if (!mapa.has(code)) {
        const nome = emOutros ? 'OUTROS' : catPorCodigo.get(code)?.description || `GRUPO ${code.slice(0, 2)}`;
        mapa.set(code, { code, nome, itens: [] });
      }
      mapa.get(code)!.itens.push(it);
    }
    const lista = [...mapa.values()].sort((a, b) => a.code.localeCompare(b.code));
    for (const g of lista) if (g.code !== '260000') g.itens.sort((a, b) => a.code.localeCompare(b.code));
    return lista;
  }, [data, totais, busca, filtro, catPorCodigo]);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  if (carregando) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900"><Loader2 className="animate-spin text-emerald-600" size={32} /></div>;
  }
  if (!workbook || !data || !totais || !balanco) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
        <AlertTriangle size={32} className="text-amber-500" />
        Solicitação não encontrada.
        <button onClick={() => navigate('/ajustes')} className="text-emerald-700 font-bold hover:underline">Voltar aos ajustes</button>
      </div>
    );
  }

  const info = tipoInfo(data.tipo);
  const Icone = ICONES[data.tipo];
  const cor = CORES[data.tipo];
  const fator = totais.fator.valor;
  const erros = conferencias.filter(c => c.nivel === 'erro').length;
  const avisos = conferencias.filter(c => c.nivel === 'aviso').length;
  const limitePct = balanco.limite > 0 ? Math.min(100, (balanco.percentualAcumulado / balanco.limite) * 100) : 0;

  const dadosWb: DadosWorkbook = {
    escola: workbook.escola, cod_escola: workbook.cod_escola, municipio: workbook.municipio, sre: workbook.sre,
    servicos: workbook.servicos, engenheiro: workbook.engenheiro || '', crea: workbook.crea || '',
    data_elaboracao: workbook.data_elaboracao || new Date().toISOString().split('T')[0],
    base_precos: base, status: workbook.status || 'Em andamento',
  };

  const abrirMarretada = () => {
    setGolpeVisual(true);
    window.setTimeout(() => setGolpeVisual(false), 650);
    setMarretadaAberta(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Cabeçalho */}
      <header className="bg-emerald-800 text-white shadow-md h-[64px] flex items-center sticky top-0 z-20 px-4">
        <div className="container mx-auto flex justify-between items-center w-full h-full gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <FileSpreadsheet size={28} className="text-emerald-300 hidden sm:block shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base md:text-lg font-bold leading-tight truncate">Módulo Ajustes</h1>
              <span className="text-xs text-emerald-100 flex items-center gap-1.5">
                {saveState === 'salvando' && <><Loader2 size={11} className="animate-spin" /> Salvando...</>}
                {saveState === 'pendente' && <><Cloud size={11} /> Alterações a salvar</>}
                {saveState === 'salvo' && <><CheckCircle2 size={11} /> Salvo na nuvem</>}
                {saveState === 'erro' && <span className="flex items-center gap-1 text-amber-200" title={saveErro}><CloudOff size={11} /> Não salvo: {saveErro}</span>}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isReadOnly && (
              <div className="hidden md:flex items-center">
                <button onClick={desfazer} disabled={undoRef.current.length === 0} className="p-2 rounded-lg text-emerald-200 hover:text-white disabled:opacity-40" title="Desfazer (Ctrl+Z)"><Undo2 size={18} /></button>
                <button onClick={refazer} disabled={redoRef.current.length === 0} className="p-2 rounded-lg text-emerald-200 hover:text-white disabled:opacity-40" title="Refazer (Ctrl+Y)"><Redo2 size={18} /></button>
              </div>
            )}
            <button onClick={() => setChecklistAberto(true)} className="flex items-center gap-2 text-emerald-200 hover:text-white px-3 py-2 rounded-lg text-sm font-bold border border-emerald-700 hover:border-emerald-500" title="Checklist da DORE e e-mail padrão">
              <ListChecks size={18} /> <span className="hidden xl:inline">Checklist</span>
            </button>
            <button onClick={() => setNotasAbertas(v => !v)} className={`hidden md:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border ${notasAbertas ? 'bg-emerald-700 text-white border-emerald-500' : 'text-emerald-200 hover:text-white border-emerald-700 hover:border-emerald-500'}`} title="Notas">
              <StickyNote size={18} /> <span className="hidden xl:inline">Notas</span>
            </button>
            {isOwner && (
              <button onClick={() => setShareAberto(true)} className="hidden md:flex items-center gap-2 text-emerald-200 hover:text-white px-3 py-2 rounded-lg text-sm font-bold border border-emerald-700 hover:border-emerald-500" title="Compartilhar">
                <Share2 size={18} /> <span className="hidden xl:inline">Compartilhar</span>
              </button>
            )}
            {!isReadOnly && (
              <label className="hidden md:flex items-center gap-2 bg-slate-600 hover:bg-slate-500 border border-slate-500 text-white px-3 py-2 rounded-lg text-sm font-bold cursor-pointer" title="Importar a planilha de contrato ou de ajuste anterior">
                <Upload size={18} /> <span className="hidden xl:inline">Importar</span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={lerArquivo} />
              </label>
            )}
            <button onClick={exportar} disabled={exportando || data.items.length === 0} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-bold" title="Exportar na planilha de ajuste padrão SEE">
              {exportando ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} <span className="hidden sm:inline">XLSX</span>
            </button>
            <div className="hidden md:block bg-emerald-900/40 border border-emerald-700/50 rounded-lg"><ThemeToggle /></div>
            <button onClick={() => navigate('/ajustes')} className="p-2 bg-emerald-900/50 hover:bg-red-600 rounded-lg border border-emerald-700 hover:border-red-600" title="Fechar">
              <X size={20} className="text-emerald-100" />
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-3 md:p-4 space-y-3 pb-24">
        {isShared && (
          <div role="status" className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 rounded-lg px-3 py-2 text-sm">
            <Lock size={16} /> Solicitação compartilhada com você: pode ver e exportar, mas não alterar.
          </div>
        )}
        {isFinalizado && !isShared && (
          <div role="status" className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 text-indigo-800 dark:text-indigo-200 rounded-lg px-3 py-2 text-sm">
            <Lock size={16} className="shrink-0" />
            <span className="flex-1">Solicitação <strong>finalizada</strong> e travada para edição.</span>
            <button onClick={reabrir} className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-md text-sm font-bold">
              <LockOpen size={15} /> Reabrir para revisão
            </button>
          </div>
        )}

        {/* Identificação */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cor.icon}`}><Icone size={20} /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${cor.badge}`}>
                {info.titulo}{(data.tipo === 'ajuste' || data.tipo === 'saldo_complementar') && data.numero ? ` nº ${data.numero}` : ''}
              </span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700">{data.objeto}</span>
              {data.tc && <span className="text-xs text-slate-500 dark:text-slate-400">TC {data.tc}</span>}
            </div>
            <div className="font-bold text-slate-800 dark:text-slate-100 truncate">{workbook.escola}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{workbook.municipio} · {workbook.sre} · {workbook.servicos}</div>
          </div>
          {!isShared && (
            <button onClick={() => setDadosAberto(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 shrink-0">
              <Edit2 size={16} /> <span className="hidden sm:inline">Dados</span>
            </button>
          )}
        </div>

        {/* Balanço */}
        <div className="lg:sticky lg:top-[64px] z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur pt-1 pb-2 -mx-1 px-1">
          <div className="grid grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.35fr)] gap-2">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
              <div className="text-[11px] font-bold uppercase text-slate-500">Contratado</div>
              <div className="font-black text-slate-800 dark:text-slate-100 tabular-nums">{brl(totais.contratado.geral)}</div>
              <div className="text-[11px] text-slate-400">custo {brl(totais.contratado.custo)}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3">
              <div className="text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Acrescido</div>
              <div className="font-black text-slate-800 dark:text-slate-100 tabular-nums">{brl(totais.acrescido.geral)}</div>
              <div className="text-[11px] text-slate-400">{pct(balanco.percentualAtual)} do contrato</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900 rounded-xl p-3">
              <div className="text-[11px] font-bold uppercase text-rose-700 dark:text-rose-400">{info.alvo === 'equilibrio' ? 'Suprimido' : 'Recurso disponível'}</div>
              <div className="font-black text-slate-800 dark:text-slate-100 tabular-nums">{brl(info.alvo === 'equilibrio' ? totais.suprimido.geral : recursoTotal(data))}</div>
              <div className="text-[11px] text-slate-400">{info.alvo === 'equilibrio' ? `${pct(totais.valorContratado > 0 ? totais.suprimido.geral / totais.valorContratado : 0)} do contrato` : `suprimido ${brl(totais.suprimido.geral)}`}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
              <div className="text-[11px] font-bold uppercase text-slate-500">Real a executar</div>
              <div className="font-black text-slate-800 dark:text-slate-100 tabular-nums">{brl(totais.real.geral)}</div>
              <div className="text-[11px] text-slate-400">fator {totais.fator.definido ? num(fator, 4) : '—'}</div>
            </div>
            <div className={`col-span-2 lg:col-span-1 rounded-xl p-3 border flex items-center gap-3 ${balanco.fechado ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800'}`}>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold uppercase text-slate-500">{info.alvo === 'equilibrio' ? 'Acréscimo − supressão' : 'Falta para o recurso'}</div>
                <div className={`text-base 2xl:text-lg font-black tabular-nums whitespace-nowrap ${balanco.fechado ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                  {balanco.fechado ? 'R$ 0,00' : brl(info.alvo === 'equilibrio' ? -balanco.gap : balanco.gap)}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  {balanco.fechado ? <><CheckCircle2 size={11} className="text-emerald-600" /> Fechado ao centavo</> : 'Ajuste fino com a marretada'}
                </div>
              </div>
              <button
                onClick={abrirMarretada}
                disabled={isReadOnly || data.items.length === 0}
                className="group relative flex flex-col items-center justify-center gap-0.5 w-[92px] h-[64px] rounded-xl bg-gradient-to-br from-indigo-600 to-slate-900 hover:from-indigo-500 text-white shadow-lg shadow-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                title="Marretada: arremate fino ao centavo"
              >
                <span className={golpeVisual ? 'animate-[marreta_0.6s_ease-in]' : 'transition-transform group-hover:-rotate-12'}><MjolnirIcon size={26} /></span>
                <span className="text-[11px] font-black uppercase tracking-wide">Marretada</span>
              </button>
            </div>
          </div>

          {data.tipo !== 'alteracao_projeto' && (
            <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="shrink-0">Acréscimo acumulado {pct(balanco.percentualAcumulado)} de {pct(balanco.limite, 0)}</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full rounded-full ${balanco.percentualAcumulado > balanco.limite ? 'bg-rose-500' : limitePct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${limitePct}%` }} />
              </div>
              <span className="hidden sm:inline shrink-0">BDI obra {pct(data.bdiObra)} · projeto {pct(data.bdiProjeto)}</span>
            </div>
          )}
        </div>

        {/* Conferências */}
        {conferencias.length > 0 && (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
            <button onClick={() => setConferenciasAbertas(v => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              <ChevronDown size={16} className={`transition-transform ${conferenciasAbertas ? '' : '-rotate-90'}`} />
              Conferências
              {erros > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">{erros} a corrigir</span>}
              {avisos > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">{avisos} aviso{avisos > 1 ? 's' : ''}</span>}
              {erros === 0 && avisos === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">tudo certo</span>}
            </button>
            {conferenciasAbertas && (
              <ul className="px-3 pb-3 space-y-1">
                {conferencias.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {c.nivel === 'ok' && <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />}
                    {c.nivel === 'aviso' && <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />}
                    {c.nivel === 'erro' && <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />}
                    <span className="text-slate-600 dark:text-slate-300">{c.texto}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Barra de ferramentas */}
        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nos serviços da planilha..." className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex gap-1 p-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-x-auto">
            {([['todos', 'Todos'], ['alterados', 'Alterados'], ['novos', 'Novos'], ['suprimidos', 'Suprimidos']] as [Filtro, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setFiltro(v)} className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap ${filtro === v ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-100'}`}>{l}</button>
            ))}
          </div>
          {!isReadOnly && (
            <div className="flex gap-2">
              <button onClick={() => setPickerAberto(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">
                <Plus size={16} /> Serviço da base
              </button>
              <button onClick={adicionarAvulso} className="flex items-center justify-center gap-2 h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 text-sm font-bold" title="Serviço sem código nas bases (OUTROS, 2600xx)">
                <PenLine size={16} /> Avulso
              </button>
            </div>
          )}
        </div>

        {/* Planilha */}
        {data.items.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            <FileSpreadsheet size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="font-semibold text-slate-700 dark:text-slate-200">Comece pela planilha de contrato homologada</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Ela traz o CONTRATADO de cada serviço. Depois é só lançar o que acresce e o que suprime.</p>
            {!isReadOnly && (
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold cursor-pointer">
                <Upload size={16} /> Importar planilha (.xlsx)
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={lerArquivo} />
              </label>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className={`hidden ${GRID} px-3 py-2 bg-slate-100 dark:bg-slate-900/60 text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700`}>
              <span>Código</span><span>Serviço</span><span>Un.</span><span className="text-right">Contratado</span>
              <span className="text-right text-emerald-700 dark:text-emerald-400">Acrescido</span>
              <span className="text-right text-rose-700 dark:text-rose-400">Suprimido</span>
              <span className="text-right">Real</span><span className="text-right">Total real</span><span />
            </div>
            {grupos.length === 0 && <p className="text-center text-sm text-slate-400 py-10">Nenhum serviço com esse filtro.</p>}
            {grupos.map(g => {
              let gA = 0, gS = 0;
              for (const it of g.itens) { const p = unitPrice(it, fator); gA += qtyOf(it.addQty) * p; gS += qtyOf(it.supQty) * p; }
              return (
                <div key={g.code}>
                  <div className="flex items-center gap-3 px-3 py-2 bg-emerald-50/70 dark:bg-emerald-950/20 border-y border-emerald-100 dark:border-emerald-900/40">
                    <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400">{g.code}</span>
                    <span className="flex-1 text-xs font-bold uppercase text-emerald-900 dark:text-emerald-200 truncate">{g.nome}</span>
                    {gA > 0 && <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">+{brl(gA)}</span>}
                    {gS > 0 && <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 tabular-nums">−{brl(gS)}</span>}
                  </div>
                  {g.itens.map(it => {
                    const preco = unitPrice(it, fator);
                    const add = qtyOf(it.addQty), sup = qtyOf(it.supQty);
                    const real = it.contractQty + add - sup;
                    const novo = isNovo(it);
                    const aberto = abertos.has(it.id);
                    const destaque = foco === it.id;
                    const borda = add > 0 ? 'border-l-emerald-500' : sup > 0 ? 'border-l-rose-500' : 'border-l-transparent';
                    return (
                      <div key={it.id} id={`aj-row-${it.id}`} className={`border-b border-slate-100 dark:border-slate-700/60 border-l-4 ${borda} ${destaque ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                        <div className={`px-3 py-2 grid grid-cols-2 gap-2 ${GRID}`}>
                          <div className="col-span-2 lg:col-span-1 flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{it.code}</span>
                            {it.source !== 'SEE' && it.source !== 'MANUAL' && <span className="text-[9px] font-bold uppercase px-1 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">{it.source}</span>}
                          </div>
                          <div className="col-span-2 lg:col-span-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {novo && <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-600 text-white shrink-0">Novo</span>}
                              {it.locked && <span title="Fora da marretada"><Lock size={11} className="text-slate-400 shrink-0" /></span>}
                              <span className="text-sm text-slate-700 dark:text-slate-200 line-clamp-2" title={it.description}>{it.description || <em className="text-slate-400">sem descrição</em>}</span>
                            </div>
                            {(it.location || it.memory) && !aberto && (
                              <div className="text-[11px] text-slate-400 truncate">{[it.location, it.memory].filter(Boolean).join(' · ')}</div>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 lg:text-center"><span className="lg:hidden font-bold">Unidade: </span>{it.unit}</div>
                          <div className="text-right">
                            <div className="lg:hidden text-[10px] font-bold uppercase text-slate-400">Contratado</div>
                            <div className="text-sm tabular-nums text-slate-700 dark:text-slate-200">{it.contractQty > 0 ? num(it.contractQty) : '—'}</div>
                            <div className="text-[10px] text-slate-400 tabular-nums" title={novo ? `Preço de referência ${brl(it.refPrice)} × fator ${num(fator, 4)}` : 'Preço do contrato'}>
                              {brl(preco)}{novo && it.priceOverride == null ? ' (×fator)' : ''}
                            </div>
                          </div>
                          <div>
                            <div className="lg:hidden text-[10px] font-bold uppercase text-emerald-600">Acrescido</div>
                            <QtyInput id={`aj-add-${it.id}`} value={it.addQty} tone="add" disabled={isReadOnly} onChange={v => mudarItem(it.id, { addQty: v })} />
                          </div>
                          <div>
                            <div className="lg:hidden text-[10px] font-bold uppercase text-rose-600">Suprimido</div>
                            <div className="flex items-start gap-1">
                              <div className="flex-1"><QtyInput id={`aj-sup-${it.id}`} value={it.supQty} tone="sup" max={it.contractQty} disabled={isReadOnly || !info.permiteSupressao || it.contractQty === 0} onChange={v => mudarItem(it.id, { supQty: v })} /></div>
                              {!isReadOnly && info.permiteSupressao && it.contractQty > 0 && sup < it.contractQty && (
                                <button onClick={() => mudarItem(it.id, { supQty: num(it.contractQty, 2).replace(/\./g, '') })} className="h-8 px-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded" title="Suprimir todo o contratado">tudo</button>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="lg:hidden text-[10px] font-bold uppercase text-slate-400">Real</div>
                            <div className={`text-sm tabular-nums font-semibold ${real < 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'}`}>{num(real)}</div>
                          </div>
                          <div className="text-right">
                            <div className="lg:hidden text-[10px] font-bold uppercase text-slate-400">Total real</div>
                            <div className="text-sm tabular-nums text-slate-800 dark:text-slate-100">{brl(real * preco)}</div>
                          </div>
                          <div className="col-span-2 lg:col-span-1 flex items-center justify-end gap-0.5">
                            {!isReadOnly && (
                              <button onClick={() => mudarItem(it.id, { locked: !it.locked })} className={`p-1.5 rounded ${it.locked ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`} title={it.locked ? 'Liberar para a marretada' : 'Proteger da marretada'}>
                                {it.locked ? <Lock size={14} /> : <LockOpen size={14} />}
                              </button>
                            )}
                            <button onClick={() => setAbertos(prev => { const n = new Set(prev); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })} className="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" title="Memória de cálculo e local">
                              <ChevronDown size={15} className={`transition-transform ${aberto ? 'rotate-180' : ''}`} />
                            </button>
                            {!isReadOnly && it.contractQty === 0 && (
                              <button onClick={() => setRemover(it)} className="p-1.5 rounded text-slate-300 hover:text-rose-600" title="Remover serviço novo"><Trash2 size={14} /></button>
                            )}
                          </div>
                        </div>
                        {aberto && (
                          <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-2 bg-slate-50/70 dark:bg-slate-900/30">
                            {it.source === 'MANUAL' && (
                              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-[1fr_90px_140px] gap-2 pt-2">
                                <input value={it.description} disabled={isReadOnly} onChange={e => mudarItem(it.id, { description: e.target.value })} placeholder="Descrição do serviço (com a referência da composição)" className="h-9 px-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200" />
                                <input value={it.unit} disabled={isReadOnly} onChange={e => mudarItem(it.id, { unit: e.target.value.toUpperCase() })} placeholder="Unid." className="h-9 px-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200" />
                                <input defaultValue={it.priceOverride ? num(it.priceOverride) : ''} disabled={isReadOnly} onBlur={e => mudarItem(it.id, { priceOverride: parseMoney(e.target.value) })} placeholder="Preço unitário" className="h-9 px-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-right text-slate-700 dark:text-slate-200" />
                              </div>
                            )}
                            <input value={it.location} disabled={isReadOnly} onChange={e => mudarItem(it.id, { location: e.target.value })} placeholder="Local de intervenção" className="h-9 px-2 mt-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200" />
                            <input value={it.memory} disabled={isReadOnly} onChange={e => mudarItem(it.id, { memory: e.target.value })} placeholder="Memória de cálculo do acréscimo ou da supressão" className="h-9 px-2 md:mt-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modais */}
      <AjusteDadosModal
        open={dadosAberto}
        mode="edit"
        initialWorkbook={dadosWb}
        initialData={data}
        userSre={userSre}
        isSaving={salvandoDados}
        onSubmit={salvarDados}
        onClose={() => setDadosAberto(false)}
      />

      <MarretadaModal
        open={marretadaAberta}
        data={data}
        onApply={items => { mudarItens(() => items, false); showToast('Marretada aplicada: fechado ao centavo.', 'success'); }}
        onClose={() => setMarretadaAberta(false)}
      />

      <ItemPickerModal
        open={pickerAberto && !isReadOnly}
        title="Adicionar serviço"
        hint={`Serviço novo: entra no ACRESCIDO com o preço da base × fator de desconto (${totais.fator.definido ? num(fator, 4) : 'informe o valor do TC'}).`}
        items={pickable}
        blocked={bloqueados}
        onPick={adicionar}
        onClose={() => setPickerAberto(false)}
      />

      <ChecklistPanel
        open={checklistAberto}
        data={data}
        totais={totais}
        balanco={balanco}
        escola={{ escola: workbook.escola, cod_escola: workbook.cod_escola, municipio: workbook.municipio, sre: workbook.sre }}
        isReadOnly={isReadOnly}
        onToggle={key => mudarData({ checklist: { ...(data.checklist || {}), [key]: !(data.checklist || {})[key] } })}
        onClose={() => setChecklistAberto(false)}
      />

      {shareAberto && workbook && (
        <ShareModal workbookId={workbook.id} workbookName={workbook.escola} onClose={() => setShareAberto(false)} />
      )}

      {notasAbertas && (
        <NotesPanel value={notas} onChange={mudarNotas} onClose={() => setNotasAbertas(false)} isSaving={salvandoNotas} isReadOnly={isReadOnly} unavailable={notasIndisponivel} />
      )}

      {importado && (
        <div className="fixed inset-0 bg-slate-950/60 z-[75] flex items-center justify-center p-4" onClick={() => setImportado(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 flex items-center justify-center"><FileSpreadsheet size={20} /></div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Importar contrato</h3>
                <p className="text-xs text-slate-500">{importado.formato === 'ajuste' ? 'Planilha de ajuste' : 'Planilha de serviços'} · {importado.itens.length} serviços{importado.bdiObra ? ` · BDI obra ${pct(importado.bdiObra)}` : ''}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              As linhas do contrato atual serão substituídas. Os serviços novos já lançados (fora do contrato) continuam.
            </p>
            <div className="flex flex-col gap-2">
              {importado.formato === 'ajuste' && importado.itensReal && (
                <button onClick={() => confirmarImportacao(true)} className="h-10 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">
                  Usar o REAL A EXECUTAR como contratado ({importado.itensReal.length})
                </button>
              )}
              <button onClick={() => confirmarImportacao(false)} className={`h-10 rounded-lg text-sm font-bold ${importado.formato === 'ajuste' ? 'border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
                {importado.formato === 'ajuste' ? 'Usar a coluna CONTRATADO' : 'Importar'}
              </button>
              <button onClick={() => setImportado(null)} className="h-9 text-sm text-slate-500 hover:text-slate-700">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!remover}
        title="Remover serviço"
        message="O serviço novo sai da planilha de ajuste."
        itemHighlight={remover ? `${remover.code} · ${remover.description}` : ''}
        confirmText="Remover"
        variant="danger"
        onConfirm={() => { if (remover) mudarItens(items => items.filter(i => i.id !== remover.id), false); setRemover(null); }}
        onClose={() => setRemover(null)}
      />

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[90] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.tipo === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
