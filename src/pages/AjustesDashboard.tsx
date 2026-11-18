import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet, LogOut, User as UserIcon, Search, ArrowRight, Trash2,
  Share2, Loader2, AlertTriangle, Calculator, ClipboardList, FolderOpen, Menu, Database,
} from 'lucide-react';
import { db, isAjusteWorkbook, isMissingColumnError } from '../services/db';
import type { Workbook } from '../services/db';
import { ThemeToggle } from '../components/ThemeToggle';
import { AccountSidebar } from '../components/AccountSidebar';
import { ConfirmModal } from '../components/ConfirmModal';
import { AjusteDadosModal } from '../components/ajuste/AjusteDadosModal';
import type { DadosResultado, DadosWorkbook } from '../components/ajuste/AjusteDadosModal';
import { MjolnirIcon } from '../components/ajuste/MjolnirIcon';
import { ICONES, CORES } from '../components/ajuste/tipoVisual';
import {
  AJUSTE_TIPOS, tipoInfo, novoAjusteData, parseAjusteData, calcTotais, calcBalanco, brl, pct,
} from '../lib/ajuste';
import type { AjusteTipo } from '../lib/ajuste';
import { normalizeSearchText } from '../lib/search';



const STATUS_CLS: Record<string, string> = {
  'Em andamento': 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  'Em revisão': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  'Finalizado': 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
};

export function AjustesDashboard() {
  const navigate = useNavigate();
  const [lista, setLista] = useState<Workbook[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<AjusteTipo | ''>('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [novoTipo, setNovoTipo] = useState<AjusteTipo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [semMigracao, setSemMigracao] = useState(false);
  const [excluir, setExcluir] = useState<Workbook | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [contaAberta, setContaAberta] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<{ nome: string; crea: string; sre: string }>({ nome: '', crea: '', sre: '' });
  const [donos, setDonos] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ msg: string; tipo: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, tipo: 'success' | 'error') => {
    setToast({ msg, tipo });
    window.setTimeout(() => setToast(null), 3500);
  };

  const carregar = async () => {
    try {
      const todos = await db.workbooks.list();
      const ajustes = todos.filter(isAjusteWorkbook);
      setLista(ajustes);
      // Antes de database/ajustes.sql a coluna modulo não existe e nada vem marcado.
      setSemMigracao(todos.length > 0 && todos.every(w => w.modulo === undefined));
      const uid = await db.auth.getUserId();
      setUserId(uid);
      const compartilhados = ajustes.filter(w => uid && w.user_id !== uid).map(w => w.id);
      setDonos(await db.sharing.ownerNames(compartilhados));
    } catch (err) {
      console.error(err);
      showToast('Não foi possível carregar os ajustes.', 'error');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    db.auth.getUser().then(u => { if (u) setPerfil({ nome: u.nome || '', crea: u.crea || '', sre: u.sre || '' }); });
  }, []);

  const resumo = useMemo(() => lista.map(wb => {
    const data = parseAjusteData(wb.ajuste, (wb.base_precos as '2025' | '2026') || '2026');
    const t = calcTotais(data);
    const b = calcBalanco(data, t);
    return { wb, data, t, b };
  }), [lista]);

  const filtrados = useMemo(() => {
    const termo = normalizeSearchText(busca.trim());
    return resumo.filter(({ wb, data }) =>
      (!filtroTipo || data.tipo === filtroTipo) &&
      (!filtroStatus || (wb.status || 'Em andamento') === filtroStatus) &&
      (!termo || normalizeSearchText(`${wb.escola} ${wb.cod_escola} ${wb.municipio} ${data.tc} ${wb.servicos}`).includes(termo)),
    );
  }, [resumo, busca, filtroTipo, filtroStatus]);

  const stats = useMemo(() => {
    const porTipo = Object.fromEntries(AJUSTE_TIPOS.map(t => [t.id, 0])) as Record<AjusteTipo, number>;
    let acrescido = 0, suprimido = 0, fechados = 0, abertos = 0;
    for (const r of resumo) {
      porTipo[r.data.tipo]++;
      acrescido += r.t.acrescido.geral;
      suprimido += r.t.suprimido.geral;
      if (r.b.fechado) fechados++;
      if ((r.wb.status || 'Em andamento') !== 'Finalizado') abertos++;
    }
    return { porTipo, acrescido, suprimido, fechados, abertos };
  }, [resumo]);

  const dadosIniciais = (tipo: AjusteTipo): { wb: DadosWorkbook; data: ReturnType<typeof novoAjusteData> } => ({
    wb: {
      escola: '', cod_escola: '', municipio: '', sre: perfil.sre && perfil.sre !== 'Órgão Central' ? perfil.sre : '',
      servicos: '', engenheiro: perfil.nome, crea: perfil.crea,
      data_elaboracao: new Date().toISOString().split('T')[0], base_precos: '2026', status: 'Em andamento',
    },
    data: novoAjusteData(tipo, '2026'),
  });

  const criar = async ({ workbook, data, itensContrato }: DadosResultado) => {
    setSalvando(true);
    try {
      const novo = await db.workbooks.create({
        user_id: userId || '',
        escola: workbook.escola,
        cod_escola: workbook.cod_escola || '',
        municipio: workbook.municipio || '',
        sre: workbook.sre || '',
        servicos: workbook.servicos || tipoInfo(data.tipo).titulo,
        iss: '',
        engenheiro: workbook.engenheiro,
        crea: workbook.crea,
        data_elaboracao: workbook.data_elaboracao,
        base_precos: workbook.base_precos,
        rev: '0',
        status: 'Em andamento',
        modulo: 'ajuste',
        ajuste: { ...data, items: itensContrato || [] },
      } as any);
      navigate(`/ajuste/${novo.id}`);
    } catch (err: any) {
      console.error(err);
      if (isMissingColumnError(err)) {
        setSemMigracao(true);
        showToast('O banco ainda não tem o módulo Ajustes. Execute database/ajustes.sql no Supabase.', 'error');
      } else {
        showToast(`Não foi possível criar: ${err?.message || 'tente novamente.'}`, 'error');
      }
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluir) return;
    setExcluindo(true);
    try {
      await db.workbooks.delete(excluir.id);
      setLista(l => l.filter(w => w.id !== excluir.id));
      showToast('Solicitação excluída.', 'success');
    } catch (err: any) {
      showToast(`Não foi possível excluir: ${err?.message || ''}`, 'error');
    } finally {
      setExcluindo(false);
      setExcluir(null);
    }
  };

  const sair = async () => { await db.auth.signOut(); navigate('/auth'); };
  const iniciais = novoTipo ? dadosIniciais(novoTipo) : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="bg-emerald-800 text-white shadow-md h-[64px] flex items-center sticky top-0 z-10 px-4">
        <div className="container mx-auto flex justify-between items-center w-full h-full">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={28} className="text-emerald-300 hidden sm:block" />
            <div className="flex flex-col justify-center">
              <h1 className="text-lg md:text-xl font-bold tracking-wide leading-tight">Portal de Orçamentos SEE-MG</h1>
              {perfil.nome && <span className="text-xs font-medium text-emerald-100">Engº. {perfil.nome}</span>}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-xl"><ThemeToggle /></div>
            <button onClick={() => setContaAberta(true)} className="flex items-center gap-2 text-emerald-200 hover:text-white text-sm font-medium">
              <UserIcon size={18} /> Minha Conta
            </button>
            <div className="w-px h-4 bg-emerald-700/50" />
            <button onClick={sair} className="flex items-center gap-2 text-emerald-200 hover:text-white text-sm font-medium">
              <LogOut size={18} /> Sair
            </button>
          </div>
          <button onClick={() => setContaAberta(true)} className="md:hidden p-2 -mr-2 text-emerald-100"><Menu size={24} /></button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Troca de módulo */}
        <div className="inline-flex p-1 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100">
            <Calculator size={16} /> Orçamentos
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white shadow-sm">
            <MjolnirIcon size={16} bolt={false} /> Ajustes e Saldos
          </button>
        </div>

        {semMigracao && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-100">
            <Database size={18} className="shrink-0 mt-0.5" />
            <div>
              <strong>Falta preparar o banco para o módulo Ajustes.</strong> No Supabase, abra SQL Editor &gt; New query, cole o conteúdo de <code className="px-1 rounded bg-amber-100 dark:bg-amber-900/60">database/ajustes.sql</code> e clique em Run. Até lá não é possível salvar ajustes.
            </div>
          </div>
        )}

        {/* Tela inicial: o tipo da solicitação */}
        <section>
          <div className="flex items-end justify-between gap-4 mb-3">
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Nova solicitação</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Escolha o tipo. Cada um segue o checklist da DORE ({'dore.ajuste@educacao.mg.gov.br'}).</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {AJUSTE_TIPOS.map(t => {
              const Icone = ICONES[t.id];
              const cor = CORES[t.id];
              return (
                <button
                  key={t.id}
                  onClick={() => setNovoTipo(t.id)}
                  className={`group text-left bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${cor.card}`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${cor.icon}`}><Icone size={22} /></div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">{t.titulo}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed min-h-[3.5rem]">{t.resumo}</p>
                  <div className="mt-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {t.alvo === 'equilibrio' ? 'Acréscimo = supressão' : 'Acréscimo = recurso disponível'}
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    Iniciar <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Indicadores */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Solicitações</div>
            <div className="text-2xl font-black text-slate-800 dark:text-slate-100">{lista.length}</div>
            <div className="text-xs text-slate-500 mt-1">{stats.abertos} em aberto</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Fechadas ao centavo</div>
            <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{stats.fechados}</div>
            <div className="text-xs text-slate-500 mt-1">de {lista.length}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="text-xs font-bold uppercase text-slate-500">Total acrescido</div>
            <div className="text-lg font-black text-slate-800 dark:text-slate-100 tabular-nums">{brl(stats.acrescido)}</div>
            <div className="text-xs text-slate-500 mt-1">suprimido {brl(stats.suprimido)}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="text-xs font-bold uppercase text-slate-500 mb-1">Por tipo</div>
            <div className="space-y-1">
              {AJUSTE_TIPOS.map(t => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300">{t.curto}</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{stats.porTipo[t.id]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Lista */}
        <section className="space-y-3">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Minhas solicitações</h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Escola, município, TC..." className="w-full sm:w-64 h-10 pl-9 pr-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as AjusteTipo | '')} className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                <option value="">Todos os tipos</option>
                {AJUSTE_TIPOS.map(t => <option key={t.id} value={t.id}>{t.titulo}</option>)}
              </select>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                <option value="">Todos os status</option>
                <option>Em andamento</option>
                <option>Em revisão</option>
                <option>Finalizado</option>
              </select>
            </div>
          </div>

          {carregando ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-emerald-600" size={28} /></div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
              <FolderOpen size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">{lista.length === 0 ? 'Nenhuma solicitação ainda. Escolha um tipo acima para começar.' : 'Nada encontrado com esses filtros.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtrados.map(({ wb, data, t, b }) => {
                const info = tipoInfo(data.tipo);
                const Icone = ICONES[data.tipo];
                const cor = CORES[data.tipo];
                const compartilhado = userId !== null && wb.user_id !== userId;
                const status = wb.status || 'Em andamento';
                return (
                  <div key={wb.id} className="group bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cor.icon}`}><Icone size={20} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${cor.badge}`}>
                            {info.curto}{data.tipo === 'ajuste' && data.numero ? ` nº ${data.numero}` : ''}
                          </span>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${STATUS_CLS[status] || STATUS_CLS['Em andamento']}`}>{status}</span>
                          {compartilhado && (
                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800">
                              <Share2 size={10} /> {donos[wb.id] ? `de ${donos[wb.id]}` : 'compartilhado'}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 leading-tight truncate" title={wb.escola}>{wb.escola}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{wb.municipio}{data.tc ? ` · TC ${data.tc}` : ''}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2">
                        <div className="text-emerald-700 dark:text-emerald-300 font-semibold">Acrescido</div>
                        <div className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{brl(t.acrescido.geral)}</div>
                      </div>
                      <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-2">
                        <div className="text-rose-700 dark:text-rose-300 font-semibold">{info.alvo === 'equilibrio' ? 'Suprimido' : 'Recurso'}</div>
                        <div className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{brl(b.meta)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 text-xs">
                      {b.fechado ? (
                        <span className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400"><ClipboardList size={13} /> Fechado ao centavo</span>
                      ) : data.items.length === 0 ? (
                        <span className="text-slate-400">Sem serviços ainda</span>
                      ) : (
                        <span className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400"><AlertTriangle size={13} /> Diferença {brl(b.gap)}</span>
                      )}
                      {data.tipo !== 'alteracao_projeto' && t.valorContratado > 0 && (
                        <span className={b.percentualAcumulado > b.limite ? 'text-rose-600 font-bold' : 'text-slate-500'}>{pct(b.percentualAcumulado)} de {pct(b.limite, 0)}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                      <button onClick={() => navigate(`/ajuste/${wb.id}`)} className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold">
                        Abrir <ArrowRight size={15} />
                      </button>
                      {!compartilhado && (
                        <button onClick={() => setExcluir(wb)} className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30" title="Excluir">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {iniciais && novoTipo && (
        <AjusteDadosModal
          open={!!novoTipo}
          mode="create"
          initialWorkbook={iniciais.wb}
          initialData={iniciais.data}
          userSre={perfil.sre}
          isSaving={salvando}
          onSubmit={criar}
          onClose={() => setNovoTipo(null)}
        />
      )}

      <ConfirmModal
        isOpen={!!excluir}
        title="Excluir solicitação"
        message="Esta solicitação e todo o seu histórico serão excluídos."
        itemHighlight={excluir?.escola}
        description="Não é possível desfazer."
        confirmText="Excluir"
        variant="danger"
        isLoading={excluindo}
        onConfirm={confirmarExclusao}
        onClose={() => setExcluir(null)}
      />

      <AccountSidebar isOpen={contaAberta} onClose={() => setContaAberta(false)} onLogout={sair} />

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[90] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.tipo === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
