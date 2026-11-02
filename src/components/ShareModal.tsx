import { useEffect, useState } from 'react';
import { Share2, X, Trash2, Loader2, UserPlus, Eye } from 'lucide-react';
import { db, SharingError } from '../services/db';
import type { WorkbookMember } from '../services/db';

interface ShareModalProps {
  workbookId: string;
  workbookName: string;
  onClose: () => void;
}

export function ShareModal({ workbookId, workbookName, onClose }: ShareModalProps) {
  const [members, setMembers] = useState<WorkbookMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  // Set when database/sharing.sql has not been run: nothing in this modal can
  // work then, so the form is replaced by an explanation.
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    db.sharing.list(workbookId)
      .then(list => { if (!cancelled) setMembers(list); })
      .catch(err => {
        if (cancelled) return;
        if (err instanceof SharingError && err.kind === 'unavailable') setUnavailable(true);
        else setError(err instanceof Error ? err.message : 'Não foi possível carregar os acessos.');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [workbookId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Digite um e-mail válido.');
      return;
    }

    setError('');
    setIsSharing(true);
    try {
      const member = await db.sharing.share(workbookId, value);
      // Sharing again with someone who already has access only refreshes the
      // entry, so the list is replaced rather than appended to.
      setMembers(prev => [...prev.filter(m => m.user_id !== member.user_id), member]);
      setEmail('');
    } catch (err) {
      if (err instanceof SharingError && err.kind === 'unavailable') setUnavailable(true);
      else setError(err instanceof Error ? err.message : 'Não foi possível compartilhar.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleRemove = async (member: WorkbookMember) => {
    setError('');
    setRemovingId(member.user_id);
    try {
      await db.sharing.remove(workbookId, member.user_id);
      setMembers(prev => prev.filter(m => m.user_id !== member.user_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover o acesso.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-start gap-4 bg-slate-50 dark:bg-slate-900/50">
          <div className="min-w-0">
            <h2 id="share-modal-title" className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Share2 className="text-emerald-600 shrink-0" size={20} /> Compartilhar orçamento
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate" title={workbookName}>{workbookName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0" title="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {unavailable ? (
            <div role="alert" className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200 space-y-2">
              <p className="font-semibold">O compartilhamento ainda não foi habilitado no banco de dados.</p>
              <p>
                Execute o arquivo <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/50 px-1 rounded">database/sharing.sql</code> no
                SQL Editor do Supabase e abra este painel de novo.
              </p>
            </div>
          ) : (
            <>
              <form onSubmit={handleShare} className="space-y-2">
                <label htmlFor="share-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  E-mail do usuário
                </label>
                <div className="flex gap-2">
                  <input
                    id="share-email"
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); if (error) setError(''); }}
                    placeholder="nome@educacao.mg.gov.br"
                    autoFocus
                    autoComplete="off"
                    className="flex-1 min-w-0 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                  />
                  <button
                    type="submit"
                    disabled={isSharing || !email.trim()}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shrink-0"
                  >
                    {isSharing ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
                    Compartilhar
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
                  <Eye size={14} className="shrink-0 mt-px" />
                  A pessoa poderá visualizar o orçamento e o histórico e exportar XLSX ou PDF, sem poder alterar nada.
                </p>
              </form>

              {error && (
                <div role="alert" className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Pessoas com acesso
                </h3>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
                    <Loader2 className="animate-spin" size={16} /> Carregando...
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-3 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                    Este orçamento ainda não foi compartilhado.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    {members.map(member => (
                      <li key={member.user_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{member.nome}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{member.email}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                            {member.role === 'editor' ? 'Editor' : 'Leitor'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemove(member)}
                            disabled={removingId === member.user_id}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded disabled:opacity-50"
                            title="Remover acesso"
                          >
                            {removingId === member.user_id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
