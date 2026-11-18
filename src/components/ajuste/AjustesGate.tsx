import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Construction, ArrowLeft, Loader2 } from 'lucide-react';
import { db } from '../../services/db';
import { MjolnirIcon } from './MjolnirIcon';

/**
 * Enquanto o módulo Ajustes está em desenvolvimento, só estas pessoas entram.
 * A comparação é pelo nome do cadastro (ou pelo e-mail nome.sobrenome),
 * sem acento e sem diferenciar maiúsculas: basta conter as duas palavras.
 */
const LIBERADOS: string[][] = [
  ['breno', 'drumond'],
  ['felipe', 'leal'],
  ['daniel', 'jardim'],
];

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const podeAcessarAjustes = (nome: string, email: string): boolean => {
  const palavrasNome = normalizar(nome).split(/[^a-z]+/).filter(Boolean);
  const palavrasEmail = normalizar(email.split('@')[0] || '').split(/[^a-z]+/).filter(Boolean);
  return LIBERADOS.some(chave =>
    chave.every(p => palavrasNome.includes(p)) || chave.every(p => palavrasEmail.includes(p)),
  );
};

/**
 * Barreira de tela, não de segurança: os dados de cada ajuste continuam
 * protegidos pelas políticas do Supabase (só o dono e quem ele compartilhou).
 */
export function AjustesGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<'carregando' | 'liberado' | 'bloqueado'>('carregando');

  useEffect(() => {
    let cancelado = false;
    db.auth.getUser()
      .then(u => { if (!cancelado) setEstado(u && podeAcessarAjustes(u.nome || '', u.email || '') ? 'liberado' : 'bloqueado'); })
      .catch(() => { if (!cancelado) setEstado('bloqueado'); });
    return () => { cancelado = true; };
  }, []);

  if (estado === 'carregando') {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900"><Loader2 className="animate-spin text-emerald-600" size={32} /></div>;
  }
  if (estado === 'liberado') return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-950/70 flex items-center justify-center p-4">
      <div role="alertdialog" aria-labelledby="ajustes-dev-titulo" className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-indigo-500/30">
        <div className="bg-gradient-to-br from-indigo-700 via-slate-800 to-slate-950 text-white p-6 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-3">
            <MjolnirIcon size={34} />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-xs font-bold uppercase tracking-wider mb-2">
            <Construction size={13} /> Em desenvolvimento
          </div>
          <h2 id="ajustes-dev-titulo" className="text-2xl font-black tracking-tight">Módulo Ajustes e Saldos</h2>
        </div>
        <div className="p-6 space-y-4 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Este módulo ainda está sendo construído e testado, e por enquanto está disponível apenas para a equipe de desenvolvimento.
            Em breve ele será liberado para todos.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-2xl"
          >
            <ArrowLeft size={18} /> Voltar aos orçamentos
          </button>
        </div>
      </div>
    </div>
  );
}
