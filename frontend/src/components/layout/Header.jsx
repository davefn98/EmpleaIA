import React, { useState } from 'react';
import { Menu, Sun, Moon } from 'lucide-react';
import UserMenu from './UserMenu';

export default function Header({ isMobile, isSidebarCollapsed, title, subtitle, user, profile, onNavigate, onSignOut, onMenuClick, theme, onToggleTheme }) {
  const ariaLabel = isMobile
    ? 'Abrir menú de navegación'
    : isSidebarCollapsed
      ? 'Expandir barra lateral'
      : 'Colapsar barra lateral';
  const username = user?.email?.split('@')[0] || 'Usuario';
  const userInitial = username.charAt(0).toUpperCase();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label={ariaLabel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 shadow-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>

          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-indigo-650 dark:text-indigo-400">{subtitle}</p>
            <h2 className="truncate text-lg font-black tracking-tight text-slate-950 dark:text-white">{title}</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Botón de cambio de tema */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 shadow-sm transition-colors hover:bg-slate-105 dark:hover:bg-slate-805 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            aria-label="Cambiar tema"
          >
            {theme === 'dark' ? <Sun className="h-4.5 w-4.5 text-amber-500" /> : <Moon className="h-4.5 w-4.5" />}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Abrir menú de usuario"
              className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 sm:px-3 sm:py-1.5 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors text-left"
            >
              {/* Información del usuario (visible en sm en adelante) */}
              <div className="hidden flex-col min-w-0 sm:flex">
                <p className="truncate text-xs font-black text-slate-900 dark:text-slate-100 leading-tight capitalize">{username}</p>
                <p className="truncate text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">{profile?.career || 'Estudiante'}</p>
              </div>

              {/* Avatar circular */}
              <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-xs font-black text-indigo-700 dark:text-indigo-400 shadow-sm">
                {userInitial}
              </div>

              {/* Chevron indicador (visible en sm en adelante) */}
              <svg
                className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 hidden sm:block ${isMenuOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="3"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <UserMenu
              isOpen={isMenuOpen}
              onClose={() => setIsMenuOpen(false)}
              user={user}
              profile={profile}
              onNavigate={onNavigate}
              onSignOut={onSignOut}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
