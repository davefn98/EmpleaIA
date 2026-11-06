import { Briefcase, User, Wrench } from 'lucide-react';

const sections = [
  { id: 'personal', name: 'Datos y resumen', icon: User },
  { id: 'trajectory', name: 'Trayectoria', icon: Briefcase },
  { id: 'skills', name: 'Habilidades', icon: Wrench },
];

export default function ProfileSectionTabs({ activeSection, onChange, invalidSections = [] }) {
  return (
    <div role="group" aria-label="Secciones del perfil" className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-slate-450 dark:text-slate-400">
      {sections.map(({ id, name, icon: Icon }) => {
        const isInvalid = invalidSections.includes(id);
        const isActive = activeSection === id;
        let style = 'border-transparent hover:text-slate-750 dark:hover:text-slate-200';
        if (isInvalid) {
          style = `text-rose-700 dark:text-rose-400 ${isActive ? 'border-rose-500' : 'border-transparent'}`;
        } else if (isActive) {
          style = 'border-indigo-650 text-indigo-650 dark:text-indigo-400 dark:border-indigo-400';
        }
        return (
          <button
            key={id}
            type="button"
            aria-pressed={isActive}
            aria-label={isInvalid ? `${name}, revisa los campos de esta sección` : undefined}
            onClick={() => onChange(id)}
            className={`pb-2 border-b-2 flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap ${style}`}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {name}
          </button>
        );
      })}
    </div>
  );
}
