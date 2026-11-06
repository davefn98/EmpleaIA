import { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import { apiRequest } from '../utils/api';
import { interviewScoreChange } from '../utils/interviewComparison';
import { Loader2, TrendingUp, ChevronLeft, CheckCircle2, MessageSquare, Award, AlertCircle } from 'lucide-react';

const TYPE_LABEL = { general: 'General', technical: 'Técnica', behavioral: 'Por competencias' };
const DIFF_LABEL = { basic: 'Básico', intermediate: 'Intermedio', advanced: 'Avanzado' };

export default function CompareInterviews({ setActiveView }) {
  const [loading, setLoading] = useState(true);
  const [interviews, setInterviews] = useState([]);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState(null);
  const [generating, setGenerating] = useState(false);
  const requestVersion = useRef(0);
  useEffect(() => () => { requestVersion.current += 1; }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const data = await apiRequest(`/interview/list/${session.user.id}`, 'GET');
        if (data.success) setInterviews(data.interviews || []);
      } catch (err) {
        setError(err.message || 'No se pudo cargar el historial de entrevistas.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggle = (id) => {
    if (generating) return;
    requestVersion.current += 1;
    setComparison(null);
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev; // máximo 3 a la vez
      return [...prev, id];
    });
  };

  const chosen = interviews.filter(i => selected.includes(i.id));
  const scoreChange = interviewScoreChange(chosen);
  const generateComparison = async () => {
    if (generating || chosen.length < 2 || scoreChange === null) return;
    const version = ++requestVersion.current;
    setGenerating(true);
    setError('');
    try {
      const data = await apiRequest('/interview/compare', 'POST', { interviewIds: chosen.map((item) => item.id) });
      if (version === requestVersion.current) setComparison(data.comparison);
    } catch (err) {
      if (version === requestVersion.current) setError(err.message || 'No se pudo generar la comparación. Puedes reintentar.');
    } finally {
      if (version === requestVersion.current) setGenerating(false);
    }
  };
  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const bestScore = chosen.length ? Math.max(...chosen.map(c => c.avg_score ?? -1)) : null;

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-7 w-7 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1200px] space-y-6">
        <button
          onClick={() => setActiveView?.('interviews')}
          className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" /> Volver a entrevistas
        </button>

        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-black text-slate-900">Comparar entrevistas</h2>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {interviews.length < 2 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
            Necesitas al menos <strong>2 entrevistas completadas</strong> para poder compararlas.
            Realiza algunas simulaciones y vuelve aquí.
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500">Selecciona entre 2 y 3 entrevistas para comparar sus métricas.</p>

            {/* Selector de entrevistas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {interviews.map(iv => {
                const isSel = selected.includes(iv.id);
                return (
                  <button
                    key={iv.id}
                    disabled={generating}
                    onClick={() => toggle(iv.id)}
                    className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                      isSel ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-800">{TYPE_LABEL[iv.interview_type] || iv.interview_type}</span>
                      {isSel && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {DIFF_LABEL[iv.difficulty_level] || iv.difficulty_level} · {fmtDate(iv.completed_at || iv.created_at)}
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1 font-semibold">
                      Puntaje: {iv.avg_score ?? '—'}{iv.avg_score != null ? '/100' : ''}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Tabla comparativa */}
            {chosen.length >= 2 ? (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Métrica</th>
                        {chosen.map((c, idx) => (
                          <th key={c.id} className="text-left px-4 py-3 text-[11px] font-bold text-slate-700">
                            Entrevista {idx + 1}
                            <span className="block text-[9px] text-slate-400 font-medium">{TYPE_LABEL[c.interview_type] || c.interview_type}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Award className="h-3.5 w-3.5 text-amber-500" /> Puntaje promedio</td>
                        {chosen.map(c => (
                          <td key={c.id} className={`px-4 py-3 text-sm font-black ${c.avg_score != null && c.avg_score === bestScore ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {c.avg_score ?? '—'}{c.avg_score != null ? '/100' : ''}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500 flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5 text-indigo-500" /> Fluidez promedio</td>
                        {chosen.map(c => (
                          <td key={c.id} className="px-4 py-3 text-sm font-bold text-slate-800">{c.avg_fluency ?? '—'}{c.avg_fluency != null ? '/100' : ''}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500">Dificultad</td>
                        {chosen.map(c => (
                          <td key={c.id} className="px-4 py-3 text-xs text-slate-700">{DIFF_LABEL[c.difficulty_level] || c.difficulty_level}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500">Preguntas respondidas</td>
                        {chosen.map(c => (
                          <td key={c.id} className="px-4 py-3 text-xs text-slate-700">{c.answers_count} de {c.total_questions}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500">Fecha</td>
                        {chosen.map(c => (
                          <td key={c.id} className="px-4 py-3 text-xs text-slate-700">{fmtDate(c.completed_at || c.created_at)}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center text-xs text-slate-400 py-6">Selecciona al menos 2 entrevistas para ver la comparación.</div>
            )}
            {chosen.length >= 2 && (
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <p className="text-sm font-bold text-slate-800">Diferencia de puntuación: {scoreChange === null ? 'No disponible' : `${scoreChange > 0 ? '+' : ''}${scoreChange} puntos`}</p>
                <p className="text-xs text-slate-500">Más reciente menos más antigua. Diferencias de puesto, tipo o dificultad pueden limitar la comparación; esta variación no demuestra una mejora de empleabilidad.</p>
                <button type="button" onClick={generateComparison} disabled={generating || scoreChange === null} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 cursor-pointer">
                  {generating ? 'Analizando entrevistas…' : 'Generar recomendaciones con IA'}
                </button>
                {comparison && <div className="space-y-3">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{comparison.analysis}</p>
                  {comparison.recommendations.map((item, index) => <article key={index} className="border-t border-slate-100 pt-3 text-sm text-slate-700">
                    <p className="font-bold">{item.finding}</p><p>{item.action}</p><p className="text-xs text-slate-500 mt-1">{item.reason}</p>
                  </article>)}
                </div>}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
