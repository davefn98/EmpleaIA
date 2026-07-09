import React from 'react';
import NavItem from './NavItem';
import { getActiveNavItem, navigationGroups } from './navigation';
import Logo from './Logo';


export default function Sidebar({ collapsed, pathname, onNavigate, onSignOut }) {
  const activeItem = getActiveNavItem(pathname);

  return (
    <aside className="hidden h-screen w-full shrink-0 flex-col overflow-x-visible overflow-y-hidden border-r border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm md:flex">
      <div className={`flex h-16 shrink-0 items-center border-b border-slate-200/80 dark:border-slate-800 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
        <Logo collapsed={collapsed} onClick={() => onNavigate('dashboard')} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <nav className={`sidebar-scrollbar min-h-0 flex-1 overflow-y-auto ${collapsed ? 'px-2 py-3' : 'px-3 py-4'} ${collapsed ? 'space-y-2.5' : 'space-y-4'}`}>
          {navigationGroups.filter(g => !g.hideInSidebar).map((group) => (
            <div key={group.title} className={collapsed ? 'space-y-1' : 'space-y-2'}>
              {!collapsed && (
                <p className="px-3 text-[10px] font-extrabold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                  {group.title}
                </p>
              )}

              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <NavItem
                    key={item.id}
                    icon={item.icon}
                    label={item.name}
                    collapsed={collapsed}
                    isActive={activeItem.id === item.id}
                    onClick={() => onNavigate(item.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
