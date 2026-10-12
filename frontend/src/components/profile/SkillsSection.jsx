import { useState } from 'react';
import { Wrench, ChevronLeft, ChevronRight } from 'lucide-react';

export default function SkillsSection({ techSkills = [], softSkills = [], onAddTech, onRemoveTech, onAddSoft, onRemoveSoft, onNext, onPrev }) {
  const [techInput, setTechInput] = useState('');
  const [softInput, setSoftInput] = useState('');

  const handleTechSubmit = (e) => {
    e.preventDefault();
    if (techInput.trim()) {
      onAddTech(techInput.trim());
      setTechInput('');
    }
  };

  const handleSoftSubmit = (e) => {
    e.preventDefault();
    if (softInput.trim()) {
      onAddSoft(softInput.trim());
      setSoftInput('');
    }
  };

  return (
    <div className="space-y-6 text-left animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 mb-6">
          <Wrench className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">4. Habilidades</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Habilidades Técnicas */}
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">Habilidades Técnicas</h4>
              <p className="text-[10px] text-slate-400">Lenguajes de programación, frameworks, librerías, bases de datos o herramientas de diseño.</p>
            </div>
            
            <form onSubmit={handleTechSubmit} className="flex gap-2">
              <input
                type="text"
                value={techInput}
                onChange={(e) => setTechInput(e.target.value)}
                placeholder="ej: React, Node.js, Python"
                className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:bg-white focus:border-indigo-500"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm shadow-indigo-600/10 transition-colors cursor-pointer"
              >
                Agregar
              </button>
            </form>

            <div className="flex flex-wrap gap-2 pt-2">
              {techSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 px-3 py-1 rounded-lg text-xs font-bold transition-all duration-200"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => onRemoveTech(skill)}
                    className="text-indigo-400 hover:text-rose-500 transition-colors shrink-0"
                  >
                    ×
                  </button>
                </span>
              ))}
              {techSkills.length === 0 && (
                <p className="text-[11px] text-slate-400 italic">No hay habilidades técnicas registradas.</p>
              )}
            </div>
          </div>

          {/* Habilidades Blandas */}
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">Habilidades Blandas</h4>
              <p className="text-[10px] text-slate-400">Competencias interpersonales, metodologías de trabajo o aptitudes organizacionales.</p>
            </div>

            <form onSubmit={handleSoftSubmit} className="flex gap-2">
              <input
                type="text"
                value={softInput}
                onChange={(e) => setSoftInput(e.target.value)}
                placeholder="ej: Liderazgo, Scrum, Comunicación"
                className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:bg-white focus:border-indigo-500"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm shadow-indigo-600/10 transition-colors cursor-pointer"
              >
                Agregar
              </button>
            </form>

            <div className="flex flex-wrap gap-2 pt-2">
              {softSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 px-3 py-1 rounded-lg text-xs font-bold transition-all duration-200"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => onRemoveSoft(skill)}
                    className="text-indigo-400 hover:text-rose-500 transition-colors shrink-0"
                  >
                    ×
                  </button>
                </span>
              ))}
              {softSkills.length === 0 && (
                <p className="text-[11px] text-slate-400 italic">No hay habilidades blandas registradas.</p>
              )}
            </div>
          </div>
        </div>
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
