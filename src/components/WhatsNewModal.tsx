import { useState, type ReactNode } from 'react';
import {
  Sparkles, X, ArrowRight, CheckCircle2, Zap, StickyNote, ListFilter, FoldVertical,
  Lock, MousePointerClick, Replace, Wrench, Database, Share2, Search, Copy, ChevronDown,
} from 'lucide-react';

/**
 * Bump this key whenever new entries are added to `CURRENT`: everyone sees the
 * modal once more, and the previous release moves down into "versões anteriores".
 */
export const WHATS_NEW_KEY = 'seen_updates_v2026_secoes_travamento_busca';

export const markWhatsNewSeen = () => {
  try { localStorage.setItem(WHATS_NEW_KEY, 'true'); } catch { /* janela anônima */ }
};

export const hasSeenWhatsNew = () => {
  try { return localStorage.getItem(WHATS_NEW_KEY) === 'true'; } catch { return false; }
};

type Tone = 'emerald' | 'sky' | 'teal' | 'violet' | 'amber' | 'indigo' | 'rose';

interface Entry {
  icon: ReactNode;
  tone: Tone;
  title: string;
  tag: 'Novo' | 'Aprimorado' | 'Corrigido';
  body: ReactNode;
}

const TONES: Record<Tone, { box: string; chip: string; tag: string }> = {
  emerald: {
    box: 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-100 dark:border-emerald-900/40',
    chip: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300',
    tag: 'bg-emerald-100 dark:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300',
  },
  sky: {
    box: 'bg-sky-50/70 dark:bg-sky-950/25 border-sky-100 dark:border-sky-900/40',
    chip: 'bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300',
    tag: 'bg-sky-100 dark:bg-sky-900/80 text-sky-700 dark:text-sky-300',
  },
  teal: {
    box: 'bg-teal-50/70 dark:bg-teal-950/25 border-teal-100 dark:border-teal-900/40',
    chip: 'bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300',
    tag: 'bg-teal-100 dark:bg-teal-900/80 text-teal-700 dark:text-teal-300',
  },
  violet: {
    box: 'bg-violet-50/70 dark:bg-violet-950/25 border-violet-100 dark:border-violet-900/40',
    chip: 'bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300',
    tag: 'bg-violet-100 dark:bg-violet-900/80 text-violet-700 dark:text-violet-300',
  },
  amber: {
    box: 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-100 dark:border-amber-900/40',
    chip: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
    tag: 'bg-amber-100 dark:bg-amber-900/80 text-amber-700 dark:text-amber-300',
  },
  indigo: {
    box: 'bg-indigo-50/70 dark:bg-indigo-950/25 border-indigo-100 dark:border-indigo-900/40',
    chip: 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300',
    tag: 'bg-indigo-100 dark:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300',
  },
  rose: {
    box: 'bg-rose-50/70 dark:bg-rose-950/25 border-rose-100 dark:border-rose-900/40',
    chip: 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300',
    tag: 'bg-rose-100 dark:bg-rose-900/80 text-rose-700 dark:text-rose-300',
  },
};

/** O que ainda não tinha sido anunciado em nenhum pop-up. */
const CURRENT: Entry[] = [
  {
    icon: <Zap size={20} />,
    tone: 'amber',
    title: 'Digitação sem travar',
    tag: 'Aprimorado',
    body: (
      <>
        Escrever na memória de cálculo, no quantitativo ou no local de intervenção ficou instantâneo,
        mesmo em orçamentos grandes. Antes cada tecla redesenhava a planilha inteira; agora só o campo
        em que você está digitando é recalculado.
      </>
    ),
  },
  {
    icon: <StickyNote size={20} />,
    tone: 'violet',
    title: 'Bloco de Notas do orçamento',
    tag: 'Novo',
    body: (
      <>
        Um bloco flutuante, que você pode arrastar e redimensionar, para anotar pendências e combinados
        da obra. Salva sozinho e fica junto do orçamento — não entra na planilha nem no PDF exportado.
      </>
    ),
  },
  {
    icon: <ListFilter size={20} />,
    tone: 'teal',
    title: 'Busca mais inteligente',
    tag: 'Aprimorado',
    body: (
      <>
        A busca do catálogo continua encontrando a palavra em qualquer posição — procurar <em>piso</em> ainda
        acha <em>contrapiso</em> — mas agora ordena por relevância: primeiro quem <strong>começa</strong> com a palavra,
        depois quem tem uma palavra começando por ela, por último quem a traz no meio de outra.
      </>
    ),
  },
  {
    icon: <Search size={20} />,
    tone: 'sky',
    title: 'Navegação na busca do orçamento',
    tag: 'Novo',
    body: (
      <>
        O campo de busca dos itens lançados mostra <strong>quantos resultados</strong> existem (3/17, por exemplo).
        Pressione <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-bold">Enter</kbd> para
        ir ao próximo e <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-bold">Shift+Enter</kbd> para
        voltar ao anterior. O item atual fica destacado.
      </>
    ),
  },
  {
    icon: <FoldVertical size={20} />,
    tone: 'emerald',
    title: 'Seções que abrem e fecham',
    tag: 'Novo',
    body: (
      <>
        Clique no título de uma seção ou subgrupo para recolhê-lo. Concluiu as demolições? Feche e trabalhe
        só no que falta. O total e a contagem de itens continuam à vista, cada orçamento lembra o que você
        deixou fechado, e a exportação sai sempre completa.
      </>
    ),
  },
  {
    icon: <Lock size={20} />,
    tone: 'indigo',
    title: 'Orçamento finalizado fica travado',
    tag: 'Novo',
    body: (
      <>
        Ao marcar o status como <strong>Finalizado</strong>, o orçamento passa a somente leitura, para que um valor
        já conferido não mude sem querer. Um aviso no topo traz o botão <strong>Reabrir para revisão</strong>, que
        devolve o status para <strong>Em revisão</strong> e destrava a edição.
      </>
    ),
  },
  {
    icon: <MousePointerClick size={20} />,
    tone: 'teal',
    title: 'Ir direto ao item já lançado',
    tag: 'Novo',
    body: (
      <>
        No catálogo, à esquerda, clicar em um item que já tem quantitativo rola o orçamento até ele e o
        destaca — abrindo a seção, se estiver fechada —, em vez de abrir o formulário de novo.
      </>
    ),
  },
  {
    icon: <Replace size={20} />,
    tone: 'violet',
    title: 'Trocar o serviço e colar o quantitativo',
    tag: 'Novo',
    body: (
      <>
        Dois botões novos em cada item do orçamento. O de <strong>substituir</strong> troca o serviço por outro,
        achado pela busca, mantendo a memória de cálculo e as quantidades. O de <strong>colar quantitativo</strong> leva
        essa mesma memória para um serviço que ainda não está no orçamento.
      </>
    ),
  },
  {
    icon: <Wrench size={20} />,
    tone: 'rose',
    title: 'Correções',
    tag: 'Corrigido',
    body: (
      <>
        Quantidades deixaram de aparecer como 13,770000000000001. Os totais do painel voltaram a bater com
        os do editor. As margens do PDF foram ajustadas para 6&nbsp;mm e o BDI passou a respeitar o ano-base
        de cada orçamento.
      </>
    ),
  },
];

/** Anunciadas antes; ficam aqui para quem quiser rever. */
const PREVIOUS: Entry[] = [
  {
    icon: <Database size={20} />,
    tone: 'emerald',
    title: 'Bases SETOP e SUDECAP',
    tag: 'Novo',
    body: (
      <>
        Além da base SEE, é possível usar a <strong>SETOP</strong> (SICOR-MG) e a <strong>SUDECAP</strong>, juntas ou
        separadas, pelo menu ao lado da busca do catálogo.
      </>
    ),
  },
  {
    icon: <Share2 size={20} />,
    tone: 'sky',
    title: 'Compartilhamento de orçamentos',
    tag: 'Novo',
    body: (
      <>
        Compartilhe pelo botão <strong>Compartilhar</strong>, informando o e-mail de outro usuário cadastrado.
        Quem recebe vê, exporta, mas não altera.
      </>
    ),
  },
  {
    icon: <Search size={20} />,
    tone: 'teal',
    title: 'Busca nos itens lançados',
    tag: 'Novo',
    body: (
      <>
        Um campo dedicado filtra os itens do orçamento por código, descrição, memória de cálculo ou local
        de intervenção.
      </>
    ),
  },
  {
    icon: <Copy size={20} />,
    tone: 'violet',
    title: 'Cópia de memória entre unidades',
    tag: 'Aprimorado',
    body: <>O botão <strong>Copiar Memória</strong> passou a funcionar entre itens de unidades diferentes.</>,
  },
  {
    icon: <Wrench size={20} />,
    tone: 'rose',
    title: 'Correções anteriores',
    tag: 'Corrigido',
    body: (
      <>
        Duplicar orçamento deixou de travar e de gerar cópias vazias; no XLSX, unidades "[object Object]",
        itens da seção Outros que sumiam, descrições cortadas e linhas baixas demais foram corrigidos.
      </>
    ),
  },
];

function EntryCard({ entry }: { entry: Entry }) {
  const tone = TONES[entry.tone];
  return (
    <div className={`flex items-start gap-3.5 p-3.5 rounded-2xl border ${tone.box}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${tone.chip}`}>
        {entry.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{entry.title}</h4>
          <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${tone.tag}`}>{entry.tag}</span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{entry.body}</p>
      </div>
    </div>
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function WhatsNewModal({ isOpen, onClose }: Props) {
  const [showPrevious, setShowPrevious] = useState(false);

  if (!isOpen) return null;

  const handleDismiss = () => {
    markWhatsNewSeen();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[80] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-emerald-500/20 dark:border-emerald-500/30 animate-in zoom-in-95 duration-200 relative my-auto">

        <div className="bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 p-6 text-white relative overflow-hidden">
          <div className="absolute -right-8 -bottom-8 w-36 h-36 bg-emerald-400/20 rounded-full blur-2xl pointer-events-none"></div>
          <div className="absolute left-1/2 -top-10 w-40 h-40 bg-teal-300/15 rounded-full blur-2xl pointer-events-none"></div>

          <div className="absolute right-4 top-4">
            <button
              onClick={handleDismiss}
              className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/15 transition-colors"
              title="Fechar"
              aria-label="Fechar novidades"
            >
              <X size={18} />
            </button>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/30 border border-emerald-300/30 text-emerald-100 text-xs font-bold uppercase tracking-wider mb-3 backdrop-blur-sm">
            <Sparkles size={13} className="text-amber-300 animate-pulse" /> Novidades &amp; Correções
          </div>

          <h2 className="text-2xl font-black tracking-tight leading-tight">
            Mais <span className="text-emerald-300">rápido</span>, mais <span className="text-teal-200">controle</span> do
            orçamento
          </h2>
          <p className="text-emerald-100/90 text-xs sm:text-sm mt-1.5 leading-relaxed">
            Digitação instantânea, bloco de notas, seções que fecham, travamento do orçamento finalizado,
            busca ordenada por relevância e troca de serviços preservando o quantitativo.
          </p>
        </div>

        <div className="p-6 space-y-3.5 max-h-[60vh] overflow-y-auto">
          {CURRENT.map(entry => <EntryCard key={entry.title} entry={entry} />)}

          <div className="pt-1">
            <button
              onClick={() => setShowPrevious(v => !v)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 py-2 transition-colors cursor-pointer"
              aria-expanded={showPrevious}
            >
              <ChevronDown size={14} className={`transition-transform ${showPrevious ? 'rotate-180' : ''}`} />
              {showPrevious ? 'Ocultar versões anteriores' : 'Ver novidades de versões anteriores'}
            </button>
          </div>

          {showPrevious && (
            <div className="space-y-3.5">
              {PREVIOUS.map(entry => <EntryCard key={entry.title} entry={entry} />)}
            </div>
          )}
        </div>

        <div className="p-6 pt-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            onClick={handleDismiss}
            className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold py-3.5 px-4 rounded-2xl transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 group cursor-pointer"
          >
            <CheckCircle2 size={18} className="text-emerald-200" />
            <span>Excelente, começar a usar!</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform ml-1" />
          </button>
        </div>

      </div>
    </div>
  );
}
