import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import Header from './Header';
import MobileDrawer from './MobileDrawer';
import Sidebar from './Sidebar';
import { getActiveNavItem } from './navigation';

function getViewportMode() {
  if (typeof window === 'undefined') {
    return 'desktop';
  }

  if (window.innerWidth < 768) {
    return 'mobile';
  }

  if (window.innerWidth < 1024) {
    return 'tablet';
  }

  return 'desktop';
}

export default function AppLayout({ user, profile, pathname, onNavigate, theme, onToggleTheme, children }) {
  const [viewportMode, setViewportMode] = useState(getViewportMode);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => getViewportMode() === 'tablet');
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const isMobile = viewportMode === 'mobile';
  const activeItem = getActiveNavItem(pathname);
  const sidebarWidth = isMobile ? '0px' : isSidebarCollapsed ? '68px' : '248px';

  useEffect(() => {
    const handleResize = () => {
      const nextMode = getViewportMode();

      setViewportMode((previousMode) => {
        if (previousMode === nextMode) {
          return previousMode;
        }

        setIsSidebarCollapsed(nextMode === 'tablet');
        if (nextMode !== 'mobile') {
          setIsMobileDrawerOpen(false);
        }

        return nextMode;
      });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setIsMobileDrawerOpen(false);
    }
  }, [isMobile]);

  const handleMenuClick = () => {
    if (isMobile) {
      setIsMobileDrawerOpen(true);
      return;
    }

    setIsSidebarCollapsed((currentValue) => !currentValue);
  };

  const handleSignOut = async () => {
    setIsMobileDrawerOpen(false);
    await supabase.auth.signOut();
  };

  return (
    <div className={`auth-theme-container ${theme === 'dark' ? 'dark' : ''} h-full w-full`}>
      <div
        className="grid h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-950 transition-[grid-template-columns] duration-300 ease-in-out"
        style={{ gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : `${sidebarWidth} minmax(0, 1fr)` }}
      >
        {!isMobile && (
          <Sidebar
            collapsed={isSidebarCollapsed}
            pathname={pathname}
            onNavigate={onNavigate}
            onSignOut={handleSignOut}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header
            isMobile={isMobile}
            isSidebarCollapsed={isSidebarCollapsed}
            title={activeItem.name}
            subtitle={activeItem.group || 'Inicio'}
            user={user}
            profile={profile}
            onNavigate={onNavigate}
            onSignOut={handleSignOut}
            onMenuClick={handleMenuClick}
            theme={theme}
            onToggleTheme={onToggleTheme}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden overflow-x-hidden">
            {children}
          </div>
        </div>

        <MobileDrawer
          open={isMobileDrawerOpen}
          pathname={pathname}
          user={user}
          profile={profile}
          onClose={() => setIsMobileDrawerOpen(false)}
          onNavigate={onNavigate}
          onSignOut={handleSignOut}
        />
      </div>
    </div>
  );
}
