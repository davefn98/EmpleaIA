import React, { useEffect, useRef } from 'react';
import { Settings, LogOut } from 'lucide-react';

export default function UserMenu({ isOpen, onClose, user, profile, onNavigate, onSignOut }) {
  const menuRef = useRef(null);

  // Cerrar al hacer clic fuera del componente
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Cerrar al presionar la tecla Escape
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const username = user?.email?.split('@')[0] || 'Usuario';
  const userInitial = username.charAt(0).toUpperCase();

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-2.5 w-60 origin-top-right rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-xl ring-1 ring-black/5 z-50 animate-fade-in"
    >
      {/* Encabezado del Dropdown */}
      <div className="flex items-center gap-3 p-3 border-b border-slate-100 dark:border-slate-800 mb-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-xs font-black text-indigo-700 dark:text-indigo-400 shadow-sm">
          {userInitial}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-xs font-black text-slate-900 dark:text-slate-100 capitalize">{username}</p>
          <p className="truncate text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">{profile?.career || 'Estudiante'}</p>
          <p className="truncate text-[9px] font-medium text-indigo-600 dark:text-indigo-400 mt-0.5">{user?.email}</p>
        </div>
      </div>

      {/* Opciones */}
      <div className="space-y-0.5">
        <button
          onClick={() => {
            onNavigate('settings');
            onClose();
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-606 dark:hover:text-indigo-400 transition-colors cursor-pointer"
        >
          <Settings className="h-4 w-4 text-slate-400 dark:text-slate-505" />
          Configuración
        </button>

        <button
          onClick={async () => {
            onClose();
            await onSignOut();
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4 text-rose-500 dark:text-rose-450" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
