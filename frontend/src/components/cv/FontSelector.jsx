import { CV_FONTS } from '../../config/cvThemes';

export default function FontSelector({ selected, onChange }) {
  const selectedFontObj = CV_FONTS.find(f => f.id === selected) || CV_FONTS[0];

  return (
    <div className="space-y-2 text-left animate-fade-in">
      <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">
        Tipografía
      </label>
      <div className="flex items-center gap-3">
        <select
          value={selected}
          onChange={(e) => onChange(e.target.value)}
          className="bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white transition-all flex-1"
        >
          {CV_FONTS.map(font => (
            <option key={font.id} value={font.id}>{font.name}</option>
          ))}
        </select>
        
        {/* Sample box */}
        <div
          style={{ fontFamily: selectedFontObj.css }}
          className="border border-slate-200/80 rounded-xl px-4 py-1.5 bg-slate-50/50 text-xs font-bold text-slate-700 shrink-0"
        >
          {selectedFontObj.name} <span className="text-[10px] text-slate-400 font-medium ml-1">Aa</span>
        </div>
      </div>
    </div>
  );
}
