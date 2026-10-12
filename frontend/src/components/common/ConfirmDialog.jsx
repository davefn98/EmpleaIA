import { useEffect } from 'react';
import { AlertTriangle, HelpCircle, Info, Loader2, PauseCircle, XCircle } from 'lucide-react';

const variantConfig = {
  info: {
    bar: 'bg-indigo-500',
    iconWrap: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-300',
    confirm: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/10 hover:shadow-indigo-700/20',
    icon: Info
  },
  safe: {
    bar: 'bg-emerald-500',
    iconWrap: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-300',
    confirm: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10 hover:shadow-emerald-700/20',
    icon: PauseCircle
  },
  warning: {
    bar: 'bg-amber-500',
    iconWrap: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-300',
    confirm: 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/10 hover:shadow-amber-700/20',
    icon: AlertTriangle
  },
  danger: {
    bar: 'bg-rose-600',
    iconWrap: 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-300',
    confirm: 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/10 hover:shadow-rose-700/20',
    icon: XCircle
  }
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'warning',
  icon,
  loading = false,
  onConfirm,
  onCancel
}) {
  useEffect(() => {
    if (!open || loading) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, onCancel, open]);

  if (!open) return null;

  const config = variantConfig[variant] || variantConfig.warning;
  const Icon = icon || config.icon || HelpCircle;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Cancelar confirmación"
        onClick={loading ? undefined : onCancel}
        className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm transition-opacity duration-300 animate-fade-in cursor-default"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-2xl animate-scale-up dark:border-slate-800 dark:bg-slate-900"
      >
        <div className={`absolute left-0 top-0 h-1 w-full ${config.bar}`} />

        <div className={`mx-auto mb-5 inline-flex items-center justify-center rounded-2xl p-3 shadow-inner ${config.iconWrap}`}>
          <Icon className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h3 id="confirm-dialog-title" className="text-base font-black leading-tight text-slate-950 dark:text-white">
            {title || 'Confirma esta acción'}
          </h3>
          <p id="confirm-dialog-message" className="px-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
            {message || 'Esta acción requiere confirmación.'}
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 transition-all hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-60 ${config.confirm}`}
          >
            <span className="inline-flex items-center justify-center gap-2">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {confirmLabel}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
