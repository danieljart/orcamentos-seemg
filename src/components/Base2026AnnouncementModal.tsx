import { Sparkles, Calculator, FileSpreadsheet, X, ArrowRight, CheckCircle2, Percent } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function Base2026AnnouncementModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  const handleDismiss = () => {
    localStorage.setItem('seen_updates_v2026_math', 'true');
    localStorage.setItem('seen_updates_v2026_recalc', 'true');
    localStorage.setItem('seen_updates_v2026', 'true');
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
            <Sparkles size={13} className="text-amber-300 animate-pulse" /> Novidades & Cálculos
          </div>
          
          <h2 className="text-2xl font-black tracking-tight leading-tight">
            Potência (<span className="text-emerald-300">^</span>) e Raiz (<span className="text-teal-200">raiz</span>) na Memória!
          </h2>
          <p className="text-emerald-100/90 text-xs sm:text-sm mt-1.5 leading-relaxed">
            A Memória de Cálculo agora aceita potências, raízes quadradas e fórmulas compostas em tempo real.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-3.5 max-h-[60vh] overflow-y-auto">
          
          {/* Feature 1 - Potência e Raiz Quadrada */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-100 dark:border-emerald-900/40">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5 font-black text-sm">
              xʸ √
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Potência (^) e Raiz Quadrada (raiz)
                </h4>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300">
                  Novo
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Escreva expressões diretamente na memória: <strong>3^2</strong> (= 9), <strong>(2+3)^2</strong> (= 25), <strong>raiz(16)</strong> ou <strong>raiz 16</strong> (= 4), e fórmulas combinadas como <strong>raiz(3^2 + 4^2)</strong> (= 5). A quantidade é calculada instantaneamente!
              </p>
            </div>
          </div>

          {/* Feature 2 - Flexibilidade de Entrada */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/25 border border-teal-100 dark:border-teal-900/40">
            <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0 mt-0.5">
              <Calculator size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Operações Flexíveis & Decimais
                </h4>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/80 text-teal-700 dark:text-teal-300">
                  Aprimorado
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Suporte automático a vírgula ou ponto para casas decimais (ex.: <strong>2,5 * 4</strong>), multiplicação implícita (ex.: <strong>2raiz(9)</strong> = 6) e fórmulas com ou sem o sinal de igual <strong>=</strong> inicial.
              </p>
            </div>
          </div>

          {/* Feature 3 - Memória de cálculo completa no Excel */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-100 dark:border-sky-900/40">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0 mt-0.5">
              <FileSpreadsheet size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Exportação Fiel no Excel & PDF
                </h4>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/80 text-sky-700 dark:text-sky-300">
                  Integrado
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                As novas fórmulas da memória são exportadas na íntegra para a coluna de Memória de Cálculo e as quantidades calculadas são refletidas na coluna de Quantidade e nos Subtotais da planilha.
              </p>
            </div>
          </div>

          {/* Feature 4 - Alinhamento BDI Obra e Projeto */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-violet-50/70 dark:bg-violet-950/25 border border-violet-100 dark:border-violet-900/40">
            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0 mt-0.5">
              <Percent size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  BDI de Obra & Projeto SEEMG
                </h4>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/80 text-violet-700 dark:text-violet-300">
                  Precisão Fiscal
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                O BDI de Obra varia conforme o ISS municipal e o BDI de Projeto aplica a taxa fixada oficial (29,58% na 2026 e 29,26% na 2025).
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
