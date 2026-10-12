import { Check } from 'lucide-react';
import { CV_TEMPLATES } from '../../config/cvThemes';

export default function TemplateSelector({ selected, onChange }) {
  // Mini representation boxes for UI thumbnails
  const renderTemplateThumbnail = (id) => {
    switch (id) {
      case 'modern-sidebar':
        return (
          <div className="w-full h-full flex overflow-hidden">
            <div className="w-1/3 bg-slate-800 h-full flex flex-col justify-start p-1 gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 mx-auto" />
              <div className="h-0.5 w-full bg-slate-600 rounded" />
              <div className="h-0.5 w-full bg-slate-600 rounded" />
            </div>
            <div className="w-2/3 bg-white h-full p-1.5 space-y-1 text-left">
              <div className="h-1 bg-slate-400 w-2/3 rounded-full" />
              <div className="h-1 bg-slate-200 w-full rounded-full" />
              <div className="h-1 bg-slate-200 w-full rounded-full" />
              <div className="h-1.5 bg-slate-300 w-1/3 rounded-full mt-2" />
              <div className="h-1 bg-slate-200 w-full rounded-full" />
            </div>
          </div>
        );

      case 'minimal':
        return (
          <div className="w-full h-full flex flex-col p-1.5 space-y-1.5 text-left bg-white">
            <div className="h-1 bg-slate-800 w-1/3 rounded-full" />
            <div className="h-0.5 bg-slate-200 w-full rounded-full" />
            <div className="h-1 bg-slate-400 w-1/2 rounded-full mt-1" />
            <div className="h-1 bg-slate-200 w-full rounded-full" />
            <div className="h-1 bg-slate-200 w-3/4 rounded-full" />
          </div>
        );

      case 'executive':
        return (
          <div className="w-full h-full flex flex-col overflow-hidden bg-white">
            <div className="h-1/4 bg-slate-900 w-full p-1 flex justify-between items-center">
              <div className="h-1.5 w-1/3 bg-white rounded-full" />
              <div className="h-1 w-1/4 bg-slate-400 rounded-full" />
            </div>
            <div className="h-3/4 p-1.5 space-y-1.5 text-left">
              <div className="h-1 bg-slate-700 w-1/2 rounded-full" />
              <div className="h-1.5 bg-slate-200 w-full rounded-full" />
              <div className="h-1 bg-slate-200 w-full rounded-full" />
            </div>
          </div>
        );

      case 'tech':
        return (
          <div className="w-full h-full flex flex-col p-1.5 space-y-1.5 text-left bg-white">
            <div className="flex justify-between items-center">
              <div className="h-1 w-1/2 bg-slate-900 rounded-full" />
              <div className="h-1 w-3 bg-emerald-400 rounded-full" />
            </div>
            <div className="h-0.5 bg-slate-100 w-full rounded-full" />
            <div className="h-1 bg-slate-400 w-1/3 rounded-full mt-1" />
            <div className="flex gap-1">
              <span className="h-1.5 w-3 bg-slate-200 rounded-sm" />
              <span className="h-1.5 w-4 bg-slate-200 rounded-sm" />
              <span className="h-1.5 w-3 bg-slate-200 rounded-sm" />
            </div>
            <div className="h-1.5 bg-slate-200 w-full rounded-full" />
          </div>
        );

      case 'creative-simple':
        return (
          <div className="w-full h-full flex flex-col p-1.5 space-y-1 text-left bg-white">
            <div className="flex justify-between items-center border-b pb-1">
              <div className="h-1.5 w-1/3 bg-slate-800 rounded-full" />
              <div className="h-1 w-1/4 bg-slate-400 rounded-full" />
            </div>
            <div className="grid grid-cols-3 gap-1 pt-1">
              <div className="col-span-1 border-r pr-0.5 space-y-1 text-right">
                <div className="h-1 bg-indigo-500 w-full rounded-full" />
                <div className="h-1 bg-indigo-500 w-3/4 rounded-full ml-auto" />
              </div>
              <div className="col-span-2 space-y-1 pl-0.5">
                <div className="h-1 bg-slate-300 w-full rounded-full" />
                <div className="h-1 bg-slate-250 w-full rounded-full" />
                <div className="h-1 bg-slate-200 w-full rounded-full" />
              </div>
            </div>
          </div>
        );

      case 'classic':
      default:
        return (
          <div className="w-full h-full flex flex-col p-1.5 space-y-1.5 text-center bg-white justify-between">
            <div className="space-y-1 border-b pb-1">
              <div className="h-1.5 w-1/3 bg-slate-800 rounded-full mx-auto" />
              <div className="h-0.5 w-2/3 bg-slate-350 rounded-full mx-auto" />
            </div>
            <div className="space-y-1 text-left">
              <div className="h-1 bg-slate-400 w-1/2 rounded-full" />
              <div className="h-1 bg-slate-200 w-full rounded-full" />
              <div className="h-1 bg-slate-200 w-full rounded-full" />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-3 text-left animate-fade-in">
      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">1. Elige una plantilla</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CV_TEMPLATES.map((tpl) => {
          const isActive = selected === tpl.id;
          
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onChange(tpl.id)}
              className={`flex flex-col items-center bg-white border rounded-xl p-2.5 transition-all cursor-pointer text-center relative hover:shadow-sm ${
                isActive ? 'border-indigo-600 ring-2 ring-indigo-600/10' : 'border-slate-200'
              }`}
            >
              {/* Mini visual preview of the template structure */}
              <div className="w-full aspect-[4/5] bg-slate-100 rounded-lg mb-2 flex overflow-hidden border border-slate-200 p-0.5">
                {renderTemplateThumbnail(tpl.id)}
              </div>
              <span className={`text-[10px] font-bold ${isActive ? 'text-indigo-650' : 'text-slate-650'} truncate w-full`}>
                {tpl.name}
              </span>
              {tpl.atsLevel === 'friendly' && (
                <span className="mt-1 rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-700">
                  ATS-friendly
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-2.5 right-2.5 bg-indigo-600 text-white h-4.5 w-4.5 rounded-full flex items-center justify-center border border-white shadow-sm">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
