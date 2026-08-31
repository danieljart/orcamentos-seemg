import { useEffect } from 'react';
import { AlertTriangle, Trash2, Copy, CheckCircle2, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  itemHighlight?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  showCancel?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  itemHighlight,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
  showCancel = true,
  isLoading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      iconBg: 'bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/20',
      iconColor: 'text-rose-600 dark:text-rose-400',
      Icon: Trash2,
      confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/25 focus:ring-rose-500',
    },
    warning: {
      iconBg: 'bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
      Icon: AlertTriangle,
      confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/25 focus:ring-amber-500',
    },
    info: {
      iconBg: 'bg-sky-500/10 dark:bg-sky-500/20 border border-sky-500/20',
      iconColor: 'text-sky-600 dark:text-sky-400',
      Icon: Copy,
      confirmBtn: 'bg-sky-600 hover:bg-sky-700 text-white shadow-lg shadow-sky-600/25 focus:ring-sky-500',
    },
    success: {
      iconBg: 'bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      Icon: CheckCircle2,
      confirmBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25 focus:ring-emerald-500',
    },
  };

  const style = variantStyles[variant] || variantStyles.danger;
  const IconComponent = style.Icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div 
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon + Title */}
        <div className="flex items-start gap-4 mb-4">
          <div className={`p-3 rounded-xl shrink-0 ${style.iconBg} ${style.iconColor}`}>
            <IconComponent className="w-6 h-6" />
          </div>
          <div className="pt-0.5 pr-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
            {itemHighlight && (
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate max-w-[280px]">
                {itemHighlight}
              </p>
            )}
          </div>
        </div>

        {/* Message & Description */}
        <div className="mb-6 space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {message}
          </p>
          {description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
              {description}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {showCancel && (
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-50 flex items-center gap-2 ${style.confirmBtn}`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Processando...</span>
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
