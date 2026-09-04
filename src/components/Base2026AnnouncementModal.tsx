import { Sparkles, Calculator, FileSpreadsheet, X, ArrowRight, CheckCircle2, Percent, Layers } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function Base2026AnnouncementModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  const handleDismiss = () => {
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
            <Sparkles size={13} className="text-amber-300 animate-pulse" /> Novidades & Correções
          </div>
          
          <h2 className="text-2xl font-black tracking-tight leading-tight">
            Memória de Cálculo, <span className="text-emerald-300">Totais no Excel</span> & BDI
          </h2>
          <p className="text-emerald-100/90 text-xs sm:text-sm mt-1.5 leading-relaxed">
            Acabamos de implementar melhorias importantes na exportação XLSX e nos cálculos fiscais.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-3.5 max-h-[60vh] overflow-y-auto">
          
          {/* Feature 1 - Memória de cálculo completa */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-100 dark:border-emerald-900/40">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
              <Calculator size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Memória de Cálculo Completa no Excel
                </h4>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300">
                  Corrigido
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Todas as linhas e locais da memória de cálculo agora são exportados integralmente. Se o item tiver 3, 4 ou mais locais, novas linhas são geradas na planilha sem cortar nenhuma ocorrência.
              </p>
            </div>
          </div>

          {/* Feature 2 - Subtotais e Totais no Excel */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-100 dark:border-sky-900/40">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0 mt-0.5">
              <FileSpreadsheet size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Subtotais e Totais 100% Calculados
                </h4>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/80 text-sky-700 dark:text-sky-300">
                  Aprimorado
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                O arquivo XLSX exportado agora abre no Microsoft Excel com os valores de Subtotal, Total Custo e Total Geral calculados de imediato, com recálculo automático ativo em qualquer alteração.
              </p>
            </div>
          </div>

          {/* Feature 3 - Alinhamento BDI Obra e Projeto */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-violet-50/70 dark:bg-violet-950/25 border border-violet-100 dark:border-violet-900/40">
            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0 mt-0.5">
              <Percent size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  BDI de Obra & Projeto Alinhados
                </h4>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/80 text-violet-700 dark:text-violet-300">
                  Precisão Fiscal
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                O BDI de Obra varia fielmente conforme a alíquota de ISS do município (22,78% a 24,74% na base 2026), e o BDI de Projeto aplica a taxa oficial fixada (29,58% na 2026 e 29,26% na 2025).
              </p>
            </div>
          </div>

          {/* Feature 4 - Catálogo 2026 com Mapeamento Completo */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-100 dark:border-amber-900/40">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
              <Layers size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Catálogo SEEMG 2026 Consolidado
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Revisão completa das linhas e descrições dos serviços da nova tabela oficial da SEE-MG, garantindo total compatibilidade entre a plataforma e os arquivos exportados.
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
            <span>Entendido, vamos lá!</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform ml-1" />
          </button>
        </div>

      </div>
    </div>
  );
}
