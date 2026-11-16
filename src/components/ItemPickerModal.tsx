import { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { Search, X, Ban } from 'lucide-react';
import { normalizeSearchText, rankEntry, RANK_NO_MATCH } from '../lib/search';

export interface PickableItem {
  item: string;
  description: string;
  unit: string;
  price: number;
  source?: string;
  extendedDescription?: string;
}

interface ItemPickerModalProps {
  open: boolean;
  /** Headline of the dialog, e.g. "Substituir serviço". */
  title: string;
  /** One line saying what will happen to the item that was picked. */
  hint: string;
  items: PickableItem[];
  /** Codes that cannot be picked, mapped to the reason shown on the row. */
  blocked: Map<string, string>;
  onPick: (item: PickableItem) => void;
  onClose: () => void;
}

// A one- or two-letter search matches most of the catalogue; the list only has
// to be long enough to find something in, and the footer says when it was cut.
const MAX_RESULTS = 200;

export function ItemPickerModal({ open, title, hint, items, blocked, onPick, onClose }: ItemPickerModalProps) {
  const [term, setTerm] = useState('');
  const deferredTerm = useDeferredValue(term);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTerm('');
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const trimmed = deferredTerm.trim();
    if (!trimmed) return [] as PickableItem[];
    const normalizedTerm = normalizeSearchText(trimmed);
    return items
      .map((entry, order) => ({
        entry,
        order,
        rank: rankEntry(normalizeSearchText(entry.description), entry.item, trimmed, normalizedTerm),
      }))
      .filter(r => r.rank !== RANK_NO_MATCH)
      .sort((a, b) => a.rank - b.rank || a.order - b.order)
      .slice(0, MAX_RESULTS)
      .map(r => r.entry);
  }, [items, deferredTerm]);

  if (!open) return null;

  const trimmed = deferredTerm.trim();

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-start justify-center p-4 pt-[8vh]" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[75vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0" title="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              ref={inputRef}
              type="text"
              value={term}
              onChange={e => setTerm(e.target.value)}
              placeholder="Buscar por nome ou código do serviço..."
              className="w-full pl-10 pr-4 h-[46px] border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 flex flex-col gap-1.5">
          {!trimmed && (
            <p className="text-center text-sm text-slate-400 py-10">Escreva para buscar um serviço.</p>
          )}
          {trimmed && results.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-10">Nenhum serviço encontrado.</p>
          )}
          {results.map(entry => {
            const reason = blocked.get(entry.item);
            return (
              <button
                key={entry.item}
                type="button"
                disabled={!!reason}
                onClick={() => onPick(entry)}
                className={`text-left border rounded-lg p-3 transition-colors ${
                  reason
                    ? 'border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 opacity-60 cursor-not-allowed'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-mono bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">{entry.item}</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    {entry.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / {entry.unit}
                  </span>
                  {entry.source && entry.source !== 'SEE' && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 px-1.5 py-0.5 rounded">{entry.source}</span>
                  )}
                  {reason && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <Ban size={12} /> {reason}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 whitespace-pre-wrap">{entry.description}</p>
              </button>
            );
          })}
          {results.length === MAX_RESULTS && (
            <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 py-2">
              Mostrando os primeiros {MAX_RESULTS} serviços. Escreva mais para afinar a busca.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
