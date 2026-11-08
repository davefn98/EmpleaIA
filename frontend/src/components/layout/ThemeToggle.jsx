import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ theme, onToggleTheme }) {
  const label = theme === 'dark' ? 'Cambiar al tema Claro' : 'Cambiar al tema Grafito';

  return (
    <button
      type="button"
      onClick={onToggleTheme}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 shadow-sm transition-colors hover:bg-slate-105 dark:hover:bg-slate-805 hover:text-slate-900 dark:hover:text-white cursor-pointer"
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? <Sun aria-hidden="true" className="h-4.5 w-4.5 text-amber-500" /> : <Moon aria-hidden="true" className="h-4.5 w-4.5" />}
    </button>
  );
}
