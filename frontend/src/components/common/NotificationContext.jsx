import { useState, useCallback, useEffect } from 'react';
import { NotificationContext } from './notificationContext';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';


export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmar',
    cancelLabel: 'Cancelar',
    variant: 'danger',
    icon: null,
    loading: false,
    onConfirm: null,
    onCancel: null,
  });

  // --- LÓGICA DE TOASTS ---
  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Helpers de atajo para toasts
  const toast = {
    success: useCallback((msg, dur) => showToast(msg, 'success', dur), [showToast]),
    error: useCallback((msg, dur) => showToast(msg, 'error', dur), [showToast]),
    warning: useCallback((msg, dur) => showToast(msg, 'warning', dur), [showToast]),
    info: useCallback((msg, dur) => showToast(msg, 'info', dur), [showToast]),
  };

  // --- LÓGICA DE CONFIRMACIÓN ---
  const showConfirm = useCallback(({ title, message, confirmLabel, cancelLabel, variant, icon, loading, onConfirm, onCancel }) => {
    setConfirmModal({
      isOpen: true,
      title: title || '¿Estás seguro?',
      message: message || 'Esta acción no se puede deshacer.',
      confirmLabel: confirmLabel || 'Confirmar',
      cancelLabel: cancelLabel || 'Cancelar',
      variant: variant || 'danger',
      icon: icon || null,
      loading: Boolean(loading),
      onConfirm: () => {
        if (onConfirm) onConfirm();
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
      onCancel: () => {
        if (onCancel) onCancel();
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <NotificationContext.Provider value={{ showToast, toast, showConfirm }}>
      {children}

      {/* --- RENDERIZADOR DE TOASTS --- */}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>

      {/* --- RENDERIZADOR DE MODAL DE CONFIRMACIÓN --- */}
      {confirmModal.isOpen && (
        <ConfirmDialog
          open={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          cancelLabel={confirmModal.cancelLabel}
          variant={confirmModal.variant}
          icon={confirmModal.icon}
          loading={confirmModal.loading}
          onConfirm={confirmModal.onConfirm}
          onCancel={confirmModal.onCancel || closeConfirm}
        />
      )}
    </NotificationContext.Provider>
  );
}

// --- COMPONENTE INTERNO: ITEM DE TOAST ---
function ToastItem({ toast, onClose }) {
  const { message, type, duration } = toast;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const step = 100 / (duration / 20); // 20ms intervalo
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - step;
      });
    }, 20);

    return () => clearInterval(timer);
  }, [duration]);

  // Estilos y elementos según tipo
  const configs = {
    success: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900',
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
      text: 'text-emerald-800 dark:text-emerald-250',
      bar: 'bg-emerald-500',
    },
    error: {
      bg: 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900',
      icon: <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />,
      text: 'text-rose-800 dark:text-rose-250',
      bar: 'bg-rose-500',
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900',
      icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />,
      text: 'text-amber-800 dark:text-amber-250',
      bar: 'bg-amber-500',
    },
    info: {
      bg: 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900',
      icon: <Info className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />,
      text: 'text-indigo-800 dark:text-indigo-250',
      bar: 'bg-indigo-500',
    },
  };

  const config = configs[type] || configs.info;

  return (
    <div className={`pointer-events-auto flex flex-col w-full bg-white dark:bg-slate-900 border ${config.bg} rounded-2xl shadow-xl overflow-hidden animate-slide-in`}>
      <div className="flex items-center gap-3 p-4">
        {config.icon}
        <div className={`flex-1 text-[11px] font-bold leading-relaxed ${config.text}`}>
          {message}
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      
      {/* Barra de progreso de autocierre */}
      <div className="h-0.5 w-full bg-slate-100 dark:bg-slate-850">
        <div 
          className={`h-full ${config.bar} transition-all duration-75`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

