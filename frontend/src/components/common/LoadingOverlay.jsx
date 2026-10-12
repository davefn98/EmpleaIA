import { Loader2 } from 'lucide-react';

export default function LoadingOverlay({ message = 'Cargando...', submessage }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in select-none">
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
        <div className="flex items-center justify-center">
          <div className="bg-indigo-50 border border-indigo-100 text-indigo-600 h-14 w-14 rounded-full flex items-center justify-center animate-spin-slow">
            <Loader2 className="h-7 w-7 text-indigo-600 animate-spin" />
          </div>
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-900">{message}</h3>
          {submessage && (
            <p className="text-[11px] text-slate-400 leading-relaxed max-w-[250px] mx-auto">
              {submessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
