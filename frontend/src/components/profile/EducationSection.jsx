import { GraduationCap, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import EmptyState from '../common/EmptyState';

export default function EducationSection({ list = [], onAdd, onRemove, onChange, onNext, onPrev }) {
  const handleItemChange = (index, field, value) => {
    onChange(index, field, value);
  };

  return (
    <div className="space-y-6 text-left">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 mb-6">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">3. Formación Académica</h3>
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-650 text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Agregar educación
          </button>
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="Aún no registras educación académica"
            description="Agrega tus estudios secundarios, universitarios, técnicos o especializaciones para potenciar tu CV."
            actionText="Agregar Educación"
            onAction={onAdd}
          />
        ) : (
          <div className="space-y-6 max-h-[400px] overflow-y-auto pr-1">
            {list.map((edu, idx) => {
              const isOngoing = edu.end_date === null || edu.end_date === 'En curso' || edu.end_date === '';

              return (
                <div key={idx} className="bg-slate-50 border border-slate-200/50 rounded-xl p-5 relative space-y-4 animate-fade-in">
                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-8">
                    {/* Institución */}
                    <div>
                      <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                        Institución Educativa
                      </label>
                      <input
                        type="text"
                        value={edu.institution || ''}
                        onChange={(e) => handleItemChange(idx, 'institution', e.target.value)}
                        placeholder="ej: SENATI, UTEC"
                        className="w-full bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Carrera */}
                    <div>
                      <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                        Grado Académico / Carrera
                      </label>
                      <input
                        type="text"
                        value={edu.degree || ''}
                        onChange={(e) => handleItemChange(idx, 'degree', e.target.value)}
                        placeholder="ej: Técnico en Computación e Informática"
                        className="w-full bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Fecha Inicio */}
                    <div>
                      <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                        Fecha Inicio
                      </label>
                      <input
                        type="date"
                        value={edu.start_date ? edu.start_date.split('T')[0] : ''}
                        onChange={(e) => handleItemChange(idx, 'start_date', e.target.value)}
                        className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Fecha Fin */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                          Fecha Fin
                        </label>
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-550 select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isOngoing}
                            onChange={(e) => handleItemChange(idx, 'end_date', e.target.checked ? 'En curso' : '')}
                            className="rounded border-slate-300 text-indigo-650 focus:ring-indigo-650/10 cursor-pointer"
                          />
                          En curso
                        </label>
                      </div>
                      <input
                        type="date"
                        disabled={isOngoing}
                        value={(!isOngoing && edu.end_date) ? edu.end_date.split('T')[0] : ''}
                        onChange={(e) => handleItemChange(idx, 'end_date', e.target.value)}
                        className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onPrev}
          className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Atrás
        </button>

        <button
          type="button"
          onClick={onNext}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/15 transition-all cursor-pointer"
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
