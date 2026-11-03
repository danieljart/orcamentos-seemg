import { Sparkles, Database, Share2, Search, Copy, Wrench, X, ArrowRight, CheckCircle2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function Base2026AnnouncementModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  const handleDismiss = () => {
    localStorage.setItem('seen_updates_v2026_bases_sharing', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[70] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-emerald-500/20 dark:border-emerald-500/30 animate-in zoom-in-95 duration-200 relative my-auto">

        {/* Top Header Graphic / Banner */}
        <div className="bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 p-6 text-white relative overflow-hidden">
          <div className="absolute -right-8 -bottom-8 w-36 h-36 bg-emerald-400/20 rounded-full blur-2xl pointer-events-none"></div>
          <div className="absolute left-1/2 -top-10 w-40 h-40 bg-teal-300/15 rounded-full blur-2xl pointer-events-none"></div>

          <div className="absolute right-4 top-4">
            <button
              onClick={handleDismiss}
              className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/15 transition-colors"
              title="Fechar"
              aria-label="Fechar modal"
            >
              <X size={18} />
            </button>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/30 border border-emerald-300/30 text-emerald-100 text-xs font-bold uppercase tracking-wider mb-3 backdrop-blur-sm">
            <Sparkles size={13} className="text-amber-300 animate-pulse" /> Novidades & Correções
          </div>

          <h2 className="text-2xl font-black tracking-tight leading-tight">
            Bases <span className="text-emerald-300">SETOP</span> e <span className="text-teal-200">SUDECAP</span>, compartilhamento e mais!
          </h2>
          <p className="text-emerald-100/90 text-xs sm:text-sm mt-1.5 leading-relaxed">
            Novas bases de preços, compartilhamento de orçamentos por e-mail, busca na lista de itens e correções importantes.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-3.5 max-h-[60vh] overflow-y-auto">

          {/* Feature 1 - Bases SETOP e SUDECAP */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-100 dark:border-emerald-900/40">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
              <Database size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Bases SETOP e SUDECAP
                </h4>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300">
                  Novo
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Além da base SEE, agora é possível usar a <strong>SETOP</strong> (SICOR-MG) e a <strong>SUDECAP</strong>, juntas ou separadas, com um menu de seleção ao lado da busca do catálogo. Ao pesquisar, itens de bases não marcadas aparecem como sugestão, em marca-d'água, para não passar despercebidos.
              </p>
            </div>
          </div>

          {/* Feature 2 - Compartilhamento por e-mail */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-100 dark:border-sky-900/40">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0 mt-0.5">
              <Share2 size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Compartilhamento de Orçamentos
                </h4>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/80 text-sky-700 dark:text-sky-300">
                  Novo
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Compartilhe um orçamento pelo botão <strong>Compartilhar</strong>, informando o e-mail de outro usuário cadastrado. Quem recebe acessa em modo leitor: pode ver itens, histórico e exportar XLSX ou PDF, sem poder alterar nada.
              </p>
            </div>
          </div>

          {/* Feature 3 - Busca nos itens do orçamento */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/25 border border-teal-100 dark:border-teal-900/40">
            <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0 mt-0.5">
              <Search size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Busca nos Itens Lançados
                </h4>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/80 text-teal-700 dark:text-teal-300">
                  Novo
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Um campo de busca dedicado filtra os itens já adicionados ao orçamento, por código, descrição, memória de cálculo ou local de intervenção. A lista também ganhou uma barra de rolagem visível, para arrastar com o mouse.
              </p>
            </div>
          </div>

          {/* Feature 4 - Cópia de memória entre unidades */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-violet-50/70 dark:bg-violet-950/25 border border-violet-100 dark:border-violet-900/40">
            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0 mt-0.5">
              <Copy size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Cópia de Memória entre Unidades
                </h4>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/80 text-violet-700 dark:text-violet-300">
                  Aprimorado
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                O botão <strong>Copiar Memória</strong> agora funciona entre itens de unidades diferentes, não só entre itens da mesma unidade como antes.
              </p>
            </div>
          </div>

          {/* Feature 5 - Correções */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/25 border border-rose-100 dark:border-rose-900/40">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0 mt-0.5">
              <Wrench size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Correções de Erros
                </h4>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/80 text-rose-700 dark:text-rose-300">
                  Corrigido
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                <strong>Duplicar orçamento</strong> deixou de travar e de gerar cópias vazias. Na exportação em XLSX: unidades que apareciam como "[object Object]", itens da seção "Outros" que sumiam quando havia mais de um, descrições cortadas e linhas baixas demais para o conteúdo — tudo corrigido.
              </p>
            </div>
          </div>

        </div>

        {/* Action Button Footer */}
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
