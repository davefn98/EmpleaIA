import { Check } from 'lucide-react';
import { CV_COLORS } from '../../config/cvThemes';

export default function ColorSelector({ selected, onChange }) {
  return (
    <div className="space-y-2 text-left animate-fade-in">
      <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">
        Color principal
      </label>
      <div className="flex flex-wrap gap-2">
        {CV_COLORS.map((color) => {
          const isActive = selected === color.id;
          
          return (
            <button
              key={color.id}
              type="button"
              onClick={() => onChange(color.id)}
              className={`h-7 w-7 rounded-full flex items-center justify-center cursor-pointer transition-all border shadow-sm ${
                isActive ? 'ring-2 ring-indigo-650/35 border-white scale-110' : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: color.value }}
              title={color.name}
            >
              {isActive && <Check className="h-3.5 w-3.5 text-white mix-blend-difference" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
