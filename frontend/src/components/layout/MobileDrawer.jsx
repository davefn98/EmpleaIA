import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import NavItem from './NavItem';
import { getActiveNavItem, navigationGroups } from './navigation';
import Logo from './Logo';

export default function MobileDrawer({ open, pathname, onClose, onNavigate }) {
  const closeButtonRef = useRef(null);
  const activeItem = getActiveNavItem(pathname);
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    closeButtonRef.current?.focus();
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      {open && <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />}

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className={`fixed left-0 top-0 z-50 flex h-full w-[min(18rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-r-3xl bg-white dark:bg-slate-900 shadow-2xl transition-transform duration-300 ease-in-out md:hidden ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-20 items-center justify-between border-b border-slate-200/80 dark:border-slate-800 px-5">
          <Logo collapsed={false} onClick={() => { onNavigate('dashboard'); onClose(); }} />

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú de navegación"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 shadow-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
            {navigationGroups.filter(g => !g.hideInSidebar).map((group) => (
              <div key={group.title} className="space-y-2">
                <p className="px-3 text-[10px] font-extrabold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                  {group.title}
                </p>

                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <NavItem
                      key={item.id}
                      icon={item.icon}
                      label={item.name}
                      isActive={activeItem.id === item.id}
                      onClick={() => {
                        onNavigate(item.id);
                        onClose();
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>

        </div>
      </aside>
    </>
  );
}
