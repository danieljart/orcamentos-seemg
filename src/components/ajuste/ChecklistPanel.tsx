import { useState } from 'react';
import { X, Mail, Copy, Check, FolderCheck, ListChecks, ExternalLink } from 'lucide-react';
import { tipoInfo, EMAIL_DORE, UNIDADE_SEI } from '../../lib/ajuste';
import type { AjusteData, AjusteTotais, Balanco } from '../../lib/ajuste';
import { montarEmail } from '../../lib/ajusteEmail';

interface Props {
  open: boolean;
  data: AjusteData;
  totais: AjusteTotais;
  balanco: Balanco;
  escola: { escola: string; cod_escola: string; municipio: string; sre: string };
  isReadOnly: boolean;
  onToggle: (key: string) => void;
  onClose: () => void;
}

/** Gaveta lateral com o checklist da DORE para o tipo e o e-mail padrão pronto. */
export function ChecklistPanel({ open, data, totais, balanco, escola, isReadOnly, onToggle, onClose }: Props) {
  const [copiado, setCopiado] = useState<'' | 'assunto' | 'corpo'>('');
  if (!open) return null;

  const info = tipoInfo(data.tipo);
  const marcado = data.checklist || {};
  const email = montarEmail(escola, data, totais, balanco);
  const mailto = `mailto:${EMAIL_DORE}?subject=${encodeURIComponent(email.assunto)}&body=${encodeURIComponent(email.corpo)}`;

  const copiar = async (qual: 'assunto' | 'corpo') => {
    try {
      await navigator.clipboard.writeText(qual === 'assunto' ? email.assunto : email.corpo);
      setCopiado(qual);
      window.setTimeout(() => setCopiado(''), 1800);
    } catch { /* sem permissão de área de transferência: o texto continua visível para copiar à mão */ }
  };

  const Lista = ({ titulo, itens, grupo, icone }: { titulo: string; itens: string[]; grupo: string; icone: React.ReactNode }) => (
    <div>
      <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">{icone}{titulo}</h4>
      <div className="space-y-1.5">
        {itens.map((txt, i) => {
          const key = `${data.tipo}:${grupo}:${i}`;
          return (
            <label key={key} className={`flex items-start gap-2.5 text-sm rounded-lg p-2 ${isReadOnly ? '' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              <input type="checkbox" checked={!!marcado[key]} disabled={isReadOnly} onChange={() => onToggle(key)} className="mt-0.5 accent-emerald-600" />
              <span className={marcado[key] ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}>{txt}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[65] flex justify-end bg-slate-950/40" onClick={onClose}>
      <aside className="w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Checklist DORE</div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{info.titulo}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <Lista titulo={`E-mail para ${EMAIL_DORE}`} itens={info.email} grupo="email" icone={<Mail size={13} />} />
          <Lista titulo={`Processo SEI para ${UNIDADE_SEI}`} itens={info.sei} grupo="sei" icone={<FolderCheck size={13} />} />

          <div>
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2"><ListChecks size={13} />Regras</h4>
            <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300 list-disc pl-5">
              {info.regras.map(r => <li key={r}>{r}</li>)}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <span className="text-xs font-bold uppercase text-slate-500">E-mail padrão</span>
              <a href={mailto} className="flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline">
                Abrir no e-mail <ExternalLink size={12} />
              </a>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{email.assunto}</p>
                <button onClick={() => copiar('assunto')} className="text-slate-400 hover:text-emerald-600 shrink-0" title="Copiar assunto">
                  {copiado === 'assunto' ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <div className="relative">
                <pre className="text-xs whitespace-pre-wrap font-sans text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 max-h-72 overflow-y-auto">{email.corpo}</pre>
                <button onClick={() => copiar('corpo')} className="absolute top-2 right-2 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:text-emerald-600">
                  {copiado === 'corpo' ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">Anexe a planilha exportada (XLSX) ao e-mail{data.tipo === 'alteracao_projeto' ? ' e os projetos em DWG' : ''}.</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
