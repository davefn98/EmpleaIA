
export default function NavItem({
  icon: Icon,
  label,
  isActive,
  collapsed = false,
  destructive = false,
  onClick,
  className = '',
}) {
  const baseClasses = destructive
    ? 'text-rose-600 dark:text-rose-450 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-350'
    : isActive
      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-200/80 dark:ring-indigo-900/60 shadow-sm'
      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100';
  const buttonSizeClasses = collapsed
    ? 'justify-center rounded-xl px-0 py-0 h-10 w-10 mx-auto'
    : 'gap-3 rounded-2xl px-3 py-3';
  const iconBoxClasses = collapsed
    ? `${destructive ? 'bg-rose-100/80 dark:bg-rose-950/50 text-rose-600 dark:text-rose-450' : isActive ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-white dark:group-hover:bg-slate-900'} h-10 w-10 rounded-xl`
    : `${destructive ? 'bg-rose-100/80 dark:bg-rose-950/50 text-rose-600 dark:text-rose-450' : isActive ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-white dark:group-hover:bg-slate-900'} h-10 w-10 rounded-xl`;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        className={`flex items-center text-left text-sm font-semibold transition-all duration-200 ${collapsed ? '' : 'w-full'} ${buttonSizeClasses} ${baseClasses} ${className}`}
      >
        <span className={`flex shrink-0 items-center justify-center transition-colors ${iconBoxClasses}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>

        {!collapsed && <span className="min-w-0 truncate">{label}</span>}

        {collapsed && (
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xl group-hover:block">
            {label}
          </span>
        )}
      </button>
    </div>
  );
}
