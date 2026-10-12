import {
  FileText,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Settings,
  User,
  Clock,
} from 'lucide-react';

export const navigationGroups = [
  {
    title: 'Inicio',
    items: [
      {
        id: 'dashboard',
        name: 'Inicio',
        icon: LayoutDashboard,
        path: '/dashboard',
        match: (pathname) => pathname === '/dashboard' || pathname === '/inicio',
      },
    ],
  },
  {
    title: 'Perfil',
    items: [
      {
        id: 'profile',
        name: 'Mi perfil',
        icon: User,
        path: '/profile/view',
        match: (pathname) => pathname === '/profile/view',
      },
    ],
  },
  {
    title: 'Generar documentos',
    items: [
      {
        id: 'documents-cv',
        name: 'Curriculum Vitae',
        icon: FileText,
        path: '/documents/cv',
        match: (pathname) => pathname === '/documents/cv' || pathname.startsWith('/documents/cv/') || pathname === '/generar-documentos/cv',
      },
      {
        id: 'documents-cover-letter',
        name: 'Carta de presentación',
        icon: Mail,
        path: '/documents/cover-letter',
        match: (pathname) => pathname === '/documents/cover-letter' || pathname.startsWith('/documents/cover-letter/') || pathname === '/generar-documentos/carta',
      },
      {
        id: 'drafts',
        name: 'Mis borradores',
        icon: Clock,
        path: '/drafts',
        match: (pathname) => pathname === '/drafts' || pathname === '/borradores',
      },
    ],
  },
  {
    title: 'Gestión',
    items: [
      {
        id: 'interviews',
        name: 'Entrevistas',
        icon: MessageSquare,
        path: '/interviews',
        match: (pathname) => pathname === '/interviews' || pathname.startsWith('/interviews/') || pathname === '/entrevistas',
      },
      {
        id: 'history',
        name: 'Historial',
        icon: Clock,
        path: '/historial',
        match: (pathname) => pathname === '/historial' || pathname === '/history',
      },
    ],
  },

  {
    title: 'Configuración',
    hideInSidebar: true,
    items: [
      {
        id: 'settings',
        name: 'Configuración',
        icon: Settings,
        path: '/settings',
        match: (pathname) => pathname === '/settings' || pathname.startsWith('/settings/'),
      },
    ],
  },
];

export function getActiveNavItem(pathname) {
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (item.match(pathname)) {
        return { ...item, group: group.title };
      }
    }
  }

  return navigationGroups[0].items[0];
}
