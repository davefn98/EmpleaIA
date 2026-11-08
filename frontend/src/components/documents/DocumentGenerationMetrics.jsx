import { GENERATION_TARGET_SECONDS, summarizeGenerationAttempts } from '../../utils/documentGenerationMetrics';

const documentLabels = { cv: 'CV', letter: 'Carta de presentación' };
const secondsFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' });
const formatSeconds = (seconds) => `${secondsFormat.format(seconds)} s`;

export default function DocumentGenerationMetrics({ attempts }) {
  const summaries = Object.entries(documentLabels).map(([type, label]) => ({
    type, label, ...summarizeGenerationAttempts(attempts, type),
  }));
  const maxSeconds = Math.max(GENERATION_TARGET_SECONDS * 1.2, ...summaries.map(({ averageSeconds }) => averageSeconds ?? 0));

  return (
    <section className="space-y-4 py-4" aria-labelledby="generation-metrics-title">
      <div>
        <h5 id="generation-metrics-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">Tiempo de generación</h5>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Desde que pulsas Generar o Regenerar hasta que aparece el resultado. Meta I4 de EmpleaIA: promedio de 30 s o menos.</p>
      </div>
      <div className="space-y-3">
        {summaries.map(({ type, label, averageSeconds, successes, failures }) => (
          <div key={type} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
              <span className="font-bold">{label}</span>
              <span>{averageSeconds === null ? 'Sin tiempos medidos' : `${formatSeconds(averageSeconds)} de promedio`}</span>
            </div>
            {averageSeconds !== null && (
              <div className="relative mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
                <div className={`h-full rounded-full ${averageSeconds <= GENERATION_TARGET_SECONDS ? 'bg-indigo-600' : 'bg-amber-500'}`} style={{ width: `${averageSeconds / maxSeconds * 100}%` }} />
                <div className="absolute -top-0.5 h-3 w-0.5 bg-slate-700 dark:bg-slate-200" style={{ left: `${GENERATION_TARGET_SECONDS / maxSeconds * 100}%` }} />
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">{successes} con resultado · {failures} con error</p>
          </div>
        ))}
      </div>
      {attempts.length > 0 && (
        <div>
          <h6 className="text-xs font-bold">Últimos intentos</h6>
          <ul className="mt-1 divide-y divide-slate-200 dark:divide-slate-700">
            {attempts.slice(0, 5).map((attempt, index) => (
              <li key={`${attempt.date}-${index}`} className="flex flex-wrap justify-between gap-x-2 py-2 text-xs">
                <span>{documentLabels[attempt.type]} · {attempt.regeneration ? 'Regeneración' : 'Generación'}</span>
                <span>{formatSeconds(attempt.durationMs / 1000)} · {attempt.success ? 'Resultado listo' : 'Error'} · {dateFormat.format(new Date(attempt.date))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-slate-600 dark:text-slate-300">Mediciones de esta cuenta en este navegador. Se conservan hasta 100 intentos y el promedio usa los que mostraron un resultado.</p>
    </section>
  );
}
