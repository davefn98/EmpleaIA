import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, X, HelpCircle } from 'lucide-react';

const NotificationContext = createContext(null);

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification debe ser utilizado dentro de un NotificationProvider');
  }
  return context;
}

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
  });

  // --- LÓGICA DE TOASTS ---
  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    setTimeout(() => {
      removeToast(id);
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
  const showConfirm = useCallback(({ title, message, onConfirm, onCancel }) => {
    setConfirmModal({
      isOpen: true,
      title: title || '¿Estás seguro?',
      message: message || 'Esta acción no se puede deshacer.',
      onConfirm: () => {
        if (onConfirm) onConfirm();
        closeConfirm();
      },
      onCancel: () => {
        if (onCancel) onCancel();
        closeConfirm();
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
        <ConfirmModalItem modal={confirmModal} onClose={closeConfirm} />
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

// --- COMPONENTE INTERNO: MODAL DE CONFIRMACIÓN ---
function ConfirmModalItem({ modal, onClose }) {
  const { title, message, onConfirm, onCancel } = modal;

  // Cerrar presionando escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Fondo Oscuro con Blur */}
      <div 
        onClick={onCancel}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300 animate-fade-in"
      />

      {/* Contenedor del Modal */}
      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 text-center space-y-5 animate-scale-up z-10 overflow-hidden">
        
        {/* Adorno de fondo */}
        <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />

        {/* Icono de Confirmación */}
        <div className="mx-auto bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 p-3 rounded-2xl inline-flex items-center justify-center shadow-inner">
          <HelpCircle className="h-8 w-8" />
        </div>

        {/* Textos */}
        <div className="space-y-1.5">
          <h3 className="text-sm font-black text-slate-900 dark:text-white leading-none">
            {title}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed px-2">
            {message}
          </p>
        </div>

        {/* Botones */}
        <div className="flex gap-2.5 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold py-2.5 rounded-xl transition-all cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2.5 rounded-xl shadow-md shadow-rose-600/10 hover:shadow-rose-700/20 transition-all cursor-pointer"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
