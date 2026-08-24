import { Sparkles, RefreshCw, Calculator, FileSpreadsheet, X, ArrowRight } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function Base2026AnnouncementModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  const handleDismiss = () => {
    localStorage.setItem('seen_base_2026_announcement', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-emerald-100 dark:border-emerald-900/50 animate-in zoom-in-95 duration-200 relative my-auto">
        
        {/* Top Header Graphic / Banner */}
        <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-6 text-white relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
          <div className="absolute right-4 top-4">
            <button
              onClick={handleDismiss}
              className="text-white/70 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
              title="Fechar"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/30 border border-emerald-300/30 text-emerald-100 text-xs font-bold uppercase tracking-wider mb-3">
            <Sparkles size={13} className="text-amber-300 animate-pulse" /> Novidade no Sistema
          </div>
          
          <h2 className="text-2xl font-black tracking-tight leading-tight">
            Nova Base de Preços <span className="text-emerald-200">SEEMG 2026</span> Implementada!
          </h2>
          <p className="text-emerald-100/90 text-sm mt-1.5 leading-relaxed">
            A planilha oficial com os custos e valores atualizados (Revisão 00/2026) já está disponível na plataforma.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <div className="space-y-3">
            
            {/* Feature 1 */}
            <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                <FileSpreadsheet size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Tabela Oficial 2026 (Rev 00)
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Mais de 800 itens catalogados com preços unitários, composições e descrições técnicas atualizadas.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-sky-50/60 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40">
              <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0 mt-0.5">
                <Calculator size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Novos Orçamentos na Base 2026
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Ao criar uma nova planilha, a base 2026 já vem selecionada por padrão, com opção de manter 2025 se necessário.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40">
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                <RefreshCw size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Recálculo Automático em Planilhas Existentes
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Para atualizar planilhas antigas, basta abrir o orçamento, clicar em <em>"Editar Dados da Obra"</em> e mudar a base para 2026. Todos os preços são recalculados sem perder quantidades ou memórias.
                </p>
              </div>
            </div>

          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              onClick={handleDismiss}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 group"
            >
              <span>Entendido, vamos lá!</span>
              <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
