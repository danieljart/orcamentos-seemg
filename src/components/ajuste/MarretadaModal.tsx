import { useEffect, useMemo, useState } from 'react';
import { X, ArrowRight, CheckCircle2, AlertTriangle, Search, Zap } from 'lucide-react';
import { MjolnirIcon } from './MjolnirIcon';
import {
  calcTotais, calcBalanco, calcMarretada, aplicarMarretada, qtyOf, unitPrice, tipoInfo, brl, num, unidadeInteira,
} from '../../lib/ajuste';
import type { AjusteData, AjusteItem } from '../../lib/ajuste';
import { normalizeSearchText } from '../../lib/search';

interface Props {
  open: boolean;
  data: AjusteData;
  onApply: (items: AjusteItem[]) => void;
  onClose: () => void;
}

/**
 * Marretada: o arremate fino que leva o total acrescido exatamente ao alvo
 * (o total suprimido, num ajuste; o recurso disponível, num saldo), ao
 * centavo, mexendo o mínimo possível em uma ou duas quantidades.
 */
export function MarretadaModal({ open, data, onApply, onClose }: Props) {
  const [escolher, setEscolher] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [batendo, setBatendo] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEscolher(false);
    setBusca('');
    setBatendo(false);
    // Ponto de partida da escolha manual: as linhas que já foram mexidas.
    setSelecionados(new Set(data.items.filter(i => !i.locked && (qtyOf(i.addQty) > 0 || qtyOf(i.supQty) > 0)).map(i => i.id)));
    // Só ao abrir: a escolha não deve ser desfeita a cada recálculo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const totais = useMemo(() => calcTotais(data), [data]);
  const balanco = useMemo(() => calcBalanco(data, totais), [data, totais]);
  const proposta = useMemo(
    () => (open ? calcMarretada(data, escolher ? selecionados : undefined) : null),
    [open, data, escolher, selecionados],
  );
  const depois = useMemo(() => {
    if (!proposta) return null;
    const novo = { ...data, items: aplicarMarretada(data.items, proposta) };
    const t = calcTotais(novo);
    return { totais: t, balanco: calcBalanco(novo, t) };
  }, [proposta, data]);

  const linhasEscolha = useMemo(() => {
    const term = normalizeSearchText(busca.trim());
    return data.items.filter(i => !i.locked && (!term || normalizeSearchText(`${i.code} ${i.description}`).includes(term)));
  }, [data.items, busca]);

  if (!open) return null;

  const info = tipoInfo(data.tipo);
  const alvoTexto = info.alvo === 'equilibrio' ? 'total suprimido' : 'recurso disponível';
  const jaFechado = balanco.fechado;

  const aplicar = () => {
    if (!proposta || proposta.golpes.length === 0) return;
    setBatendo(true);
    window.setTimeout(() => {
      onApply(aplicarMarretada(data.items, proposta));
      onClose();
    }, 650);
  };

  const toggle = (id: string) => setSelecionados(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[80] flex items-start justify-center p-4 pt-[6vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-indigo-500/30" onClick={e => e.stopPropagation()}>
        <div className="relative bg-gradient-to-br from-indigo-700 via-slate-800 to-slate-950 text-white p-5 overflow-hidden">
          <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-sky-400/20 blur-2xl pointer-events-none" />
          <button onClick={onClose} className="absolute right-4 top-4 text-white/70 hover:text-white p-1 rounded-full hover:bg-white/10" aria-label="Fechar">
            <X size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center ${batendo ? 'animate-[marreta_0.6s_ease-in]' : ''}`}>
              <MjolnirIcon size={28} />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight">Marretada</h3>
              <p className="text-sm text-indigo-100/90">Arremate fino: fecha o acréscimo no {alvoTexto}, ao centavo.</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <div className="text-[11px] uppercase font-bold text-slate-500">Acrescido</div>
              <div className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{brl(totais.acrescido.geral)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <div className="text-[11px] uppercase font-bold text-slate-500">{info.alvo === 'equilibrio' ? 'Suprimido' : 'Recurso'}</div>
              <div className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{brl(balanco.meta)}</div>
            </div>
            <div className={`rounded-xl border p-3 ${jaFechado ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800' : 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800'}`}>
              <div className="text-[11px] uppercase font-bold text-slate-500">Diferença</div>
              <div className={`font-bold tabular-nums ${jaFechado ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>{brl(balanco.gap)}</div>
            </div>
          </div>

          {jaFechado ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-sm text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 size={18} /> Já está fechado ao centavo. Nada para martelar.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  {escolher ? 'Marque os serviços que podem receber o golpe.' : 'Usando os serviços que já têm acréscimo ou supressão.'}
                </div>
                <button
                  onClick={() => setEscolher(v => !v)}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:underline"
                >
                  {escolher ? 'Voltar ao automático' : 'Escolher os serviços'}
                </button>
              </div>

              {escolher && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="relative border-b border-slate-200 dark:border-slate-700">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={busca}
                      onChange={e => setBusca(e.target.value)}
                      placeholder="Filtrar serviços..."
                      className="w-full pl-9 pr-3 py-2 text-sm bg-transparent outline-none text-slate-700 dark:text-slate-200"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {linhasEscolha.map(it => (
                      <label key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <input type="checkbox" checked={selecionados.has(it.id)} onChange={() => toggle(it.id)} className="accent-indigo-600" />
                        <span className="font-mono text-xs text-slate-500 w-20 shrink-0">{it.code}</span>
                        <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{it.description}</span>
                        <span className="text-xs text-slate-400 shrink-0">{brl(unitPrice(it, totais.fator.valor))}/{it.unit}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {!proposta || proposta.golpes.length === 0 ? (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                  Nenhum serviço disponível para o golpe. Lance algum acréscimo ou supressão, ou escolha os serviços manualmente.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Golpes propostos</div>
                  {proposta.golpes.map(g => (
                    <div key={g.itemId + g.lado} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                      <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${g.lado === 'acrescido' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300'}`}>
                        {g.lado}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{g.code} · {g.description}</div>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-sm tabular-nums shrink-0">
                        <span className="text-slate-400 line-through">{num(g.de)}</span>
                        <ArrowRight size={14} className="text-slate-400" />
                        <span className="font-bold text-indigo-700 dark:text-indigo-300">{num(g.para)}</span>
                      </div>
                    </div>
                  ))}
                  {depois && (
                    <div className={`flex items-center gap-2 rounded-xl p-3 text-sm border ${depois.balanco.fechado ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200' : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'}`}>
                      {depois.balanco.fechado ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                      {depois.balanco.fechado
                        ? <>Depois do golpe: acrescido {brl(depois.totais.acrescido.geral)} = {info.alvo === 'equilibrio' ? 'suprimido' : 'recurso'} {brl(depois.balanco.meta)}.</>
                        : <>Melhor aproximação: sobra {brl(depois.balanco.gap)}. Inclua outros serviços para fechar ao centavo.</>}
                    </div>
                  )}
                  {proposta.golpes.some(g => {
                    const it = data.items.find(i => i.id === g.itemId);
                    return it && !unidadeInteira(it.unit) && Math.abs(g.para - g.de) > Math.max(1, g.de * 0.1);
                  }) && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      A diferença é grande para um arremate: confira se não falta lançar algum serviço antes de martelar.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={aplicar}
            disabled={jaFechado || !proposta || proposta.golpes.length === 0 || batendo}
            className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-lg shadow-indigo-600/25"
          >
            <Zap size={16} className="text-amber-300" /> Martelar
          </button>
        </div>
      </div>
    </div>
  );
}
