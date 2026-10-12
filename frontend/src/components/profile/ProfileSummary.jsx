import { Save, CheckCircle, AlertCircle, ChevronLeft, User, Briefcase, GraduationCap, Wrench } from 'lucide-react';

export default function ProfileSummary({ data, experienceList = [], educationList = [], techSkills = [], softSkills = [], onSave, onPrev, saving }) {
  const hasPersonalInfo = data.first_name && data.last_name && data.phone && data.location;
  const hasExperience = experienceList.length > 0;
  const hasEducation = educationList.length > 0;
  const hasSkills = techSkills.length > 0 || softSkills.length > 0;

  const checklist = [
    {
      label: 'Información personal completada',
      status: hasPersonalInfo,
      desc: hasPersonalInfo ? `${data.first_name} ${data.last_name} • ${data.location}` : 'Faltan datos básicos obligatorios',
      icon: User,
    },
    {
      label: 'Experiencia laboral',
      status: hasExperience,
      desc: hasExperience ? `${experienceList.length} experiencias agregadas` : 'Ninguna experiencia agregada',
      icon: Briefcase,
    },
    {
      label: 'Educación académica',
      status: hasEducation,
      desc: hasEducation ? `${educationList.length} estudios agregados` : 'Ningún estudio académico agregado',
      icon: GraduationCap,
    },
    {
      label: 'Habilidades',
      status: hasSkills,
      desc: hasSkills ? `${techSkills.length} técnicas | ${softSkills.length} blandas` : 'Ninguna habilidad agregada',
      icon: Wrench,
    },
  ];

  return (
    <div className="space-y-6 text-left animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 mb-6">
          <CheckCircle className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">5. Resumen del Perfil</h3>
        </div>

        <p className="text-xs text-slate-550 mb-6 leading-relaxed">
          Revisa el resumen de tu información cargada antes de guardar. Estos datos serán utilizados por la IA para redactar y personalizar tus currículums, cartas de presentación y preparar simulaciones de entrevistas de trabajo a medida.
        </p>

        {/* Checklist */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {checklist.map((item, idx) => {
            const Icon = item.icon;
            
            return (
              <div
                key={idx}
                className={`flex gap-4 border rounded-xl p-4.5 items-start transition-all ${
                  item.status
                    ? 'bg-emerald-50/20 border-emerald-100 text-slate-800'
                    : 'bg-amber-50/15 border-amber-100 text-slate-800'
                }`}
              >
                <div
                  className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border ${
                    item.status
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                      : 'bg-amber-50 border-amber-200 text-amber-600'
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold truncate">{item.label}</h4>
                    {item.status ? (
                      <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                  </div>
                  <p className={`text-[10px] font-semibold mt-0.5 truncate ${item.status ? 'text-slate-500' : 'text-amber-600'}`}>
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Resumen de Datos de Texto */}
        <div className="border border-slate-200/80 rounded-xl p-4.5 bg-slate-50/40 mt-6 space-y-3">
          <h4 className="text-xs font-bold text-slate-850 uppercase tracking-wider">Detalles Generales</h4>
          
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div>
              <span className="text-slate-450 text-[10px] font-bold uppercase tracking-wide block">Contacto</span>
              <span className="font-semibold text-slate-800">{data.phone || 'No especificado'}</span>
            </div>
            <div>
              <span className="text-slate-450 text-[10px] font-bold uppercase tracking-wide block">Ubicación</span>
              <span className="font-semibold text-slate-800">{data.location || 'No especificada'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t border-slate-100">
        <button
          type="button"
          disabled={saving}
          onClick={onPrev}
          className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" />
          Atrás
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold px-8 py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-650/15 transition-all cursor-pointer disabled:opacity-50"
        >
          {saving ? (
            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <Save className="h-4.5 w-4.5" />
          )}
          {saving ? 'Guardando...' : 'Guardar Perfil'}
        </button>
      </div>
    </div>
  );
}
