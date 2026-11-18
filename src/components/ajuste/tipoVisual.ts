import { Scale, PenTool, PiggyBank, RefreshCcw } from 'lucide-react';
import type { AjusteTipo } from '../../lib/ajuste';

/** Ícone e cores de cada tipo de solicitação, iguais no painel e no editor. */
export const ICONES: Record<AjusteTipo, typeof Scale> = {
  ajuste: Scale,
  alteracao_projeto: PenTool,
  saldo_complementar: PiggyBank,
  saldo_nova_cotacao: RefreshCcw,
};

export const CORES: Record<AjusteTipo, { card: string; icon: string; badge: string }> = {
  ajuste: {
    card: 'hover:border-emerald-400 dark:hover:border-emerald-600',
    icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  },
  alteracao_projeto: {
    card: 'hover:border-sky-400 dark:hover:border-sky-600',
    icon: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
    badge: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-800',
  },
  saldo_complementar: {
    card: 'hover:border-amber-400 dark:hover:border-amber-600',
    icon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    badge: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  },
  saldo_nova_cotacao: {
    card: 'hover:border-violet-400 dark:hover:border-violet-600',
    icon: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
    badge: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800',
  },
};
