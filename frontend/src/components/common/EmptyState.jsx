import { Plus } from 'lucide-react';

export default function EmptyState({ icon: Icon, title, description, actionText, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl animate-fade-in">
      {Icon && (
        <div className="bg-indigo-50 border border-indigo-100/40 text-indigo-600 h-12 w-12 rounded-full flex items-center justify-center mb-3.5 shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <h4 className="text-sm font-bold text-slate-800">{title}</h4>
      <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4 leading-normal">{description}</p>
      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="bg-indigo-55/65 hover:bg-indigo-650 hover:text-white text-indigo-600 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition-all duration-200 cursor-pointer shadow-sm"
        >
          <Plus className="h-4 w-4" />
          {actionText}
        </button>
      )}
    </div>
  );
}
