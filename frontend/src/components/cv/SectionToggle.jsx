
export default function SectionToggle({ sections = {}, onChange }) {
  const contactItems = [
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'location', label: 'Ubicación' },
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'portfolio', label: 'Portafolio' }
  ];

  const contentItems = [
    { key: 'professionalSummary', label: 'Perfil profesional' },
    { key: 'experience', label: 'Experiencia laboral' },
    { key: 'education', label: 'Educación' },
    { key: 'skillsTech', label: 'Habilidades técnicas' },
    { key: 'skillsSoft', label: 'Habilidades blandas' },
    { key: 'projects', label: 'Proyectos destacados' }
  ];

  const renderToggle = (item) => {
    const isChecked = sections[item.key] !== false; // defaults to true
    
    return (
      <div key={item.key} className="flex items-center justify-between text-xs py-1">
        <span className="font-semibold text-slate-700 dark:text-slate-300">{item.label}</span>
        <button
          type="button"
          onClick={() => onChange(item.key, !isChecked)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            isChecked ? 'bg-indigo-650 dark:bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out mt-0.5 ${
              isChecked ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4 text-left animate-fade-in">
      <div className="space-y-2">
        <span className="block text-slate-400 dark:text-slate-500 text-[8.5px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-0.5">
          Datos de Contacto
        </span>
        <div className="space-y-0.5">
          {contactItems.map(renderToggle)}
        </div>
      </div>

      <div className="space-y-2">
        <span className="block text-slate-400 dark:text-slate-500 text-[8.5px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-0.5">
          Secciones Principales
        </span>
        <div className="space-y-0.5">
          {contentItems.map(renderToggle)}
        </div>
      </div>
    </div>
  );
}
