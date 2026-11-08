import { useState } from 'react';
import { canSubmitPilotSatisfaction, formatPilotTarget, PILOT_INDICATORS, PREVIOUS_PREPARATION, summarizeOperationTimes, summarizePilot } from '../../utils/pi2Validation';
import PilotDocumentWorkflow from './PilotDocumentWorkflow';

const button = 'rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50';
const field = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900';
const card = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800';
const confidenceQuestion = '¿Qué tan seguro te sientes para afrontar una entrevista laboral?';
const numberFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const secondsLabel = (seconds) => `${numberFormat.format(seconds)} s`;
const operationLabels = { cv: 'Generar CV', letter: 'Generar carta', profile_import: 'Importar CV en Mi perfil' };

function IndicatorOverview({ participant, times, generations }) {
  const metrics = summarizePilot(participant ? [participant] : [], times, generations, []);
  const evidence = {
    I1: 'Se acredita con el diagnóstico del proyecto',
    I2: 'Se acredita con los entregables de diseño',
    I3: metrics.preparationTotal.n ? `${numberFormat.format(metrics.preparationTotal.value)} % de reducción registrada` : 'Encuesta previa sobre CV y carta',
    I4: metrics.generation.n ? `${metrics.cv.n} CV · ${metrics.letter.n} cartas con tiempo registrado` : 'Sin tiempos de generación registrados',
    I5: metrics.satisfaction.n ? `${numberFormat.format(metrics.satisfaction.value)}/10 en la encuesta` : 'Encuesta posterior pendiente',
    I6: metrics.confidence.n ? `Cambio de ${numberFormat.format(metrics.confidence.value)} puntos en tus respuestas`
      : participant?.confidence_before != null ? 'Falta la respuesta posterior a la entrevista' : 'Faltan las respuestas antes y después',
    I7: 'Se acredita con las actas y los incrementos de cada sprint',
  };
  return <section className={card} aria-labelledby="pilot-indicators-heading">
    <h2 id="pilot-indicators-heading" className="text-lg font-bold">Indicadores de la tesis</h2>
    <p className="mt-1 text-sm">Consulta tus registros del piloto y las evidencias del proyecto. El Informe del equipo compara los resultados con las metas.</p>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr><th scope="col" className="pr-3 pb-2">Indicador</th><th scope="col" className="pr-3 pb-2">Meta</th><th scope="col" className="pb-2">Registro de evidencia</th></tr></thead>
        <tbody>{Object.entries(PILOT_INDICATORS).map(([id, definition]) => (
          <tr key={id} className="border-t border-slate-200 dark:border-slate-700">
            <th scope="row" className="py-2 pr-3 font-medium"><strong>{id}</strong> · {definition.title} <span className="text-xs text-slate-600 dark:text-slate-300">({definition.objective})</span></th>
            <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{formatPilotTarget(definition)}</td>
            <td className="py-2">{evidence[id]}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </section>;
}

function PreparationRanges({ title, ranges }) {
  return <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <table className="w-full text-left text-sm">
      <caption className="pb-2 text-left font-bold">{title}</caption>
      <thead><tr>
        <th scope="col" className="pr-3 pb-2">Tiempo declarado</th>
        <th scope="col" className="pr-3 pb-2">CV</th>
        <th scope="col" className="pb-2">Carta</th>
      </tr></thead>
      <tbody>{ranges.map(({ label, cv, letter }) => <tr key={label} className="border-t border-slate-200 dark:border-slate-700">
        <th scope="row" className="py-2 pr-3 font-medium">{label}</th>
        <td className="py-2 pr-3 tabular-nums">{cv}</td>
        <td className="py-2 tabular-nums">{letter}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function PreparationComparison() {
  const { responses, manualRanges, platformRanges, atLeastHalf } = PREVIOUS_PREPARATION;
  return <section className={`${card} space-y-3`} aria-labelledby="preparation-comparison-heading">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="preparation-comparison-heading" className="text-lg font-bold">I3 · Reducción del tiempo de preparación</h2>
      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">Encuesta previa · {responses} egresados</span>
    </div>
    <p className="text-sm">Tiempos declarados por egresados de CIBERTEC para preparar un CV y una carta.</p>
    <div className="grid gap-3 md:grid-cols-2">
      <PreparationRanges title="Manual" ranges={manualRanges} />
      <PreparationRanges title="Con EmpleaIA" ranges={platformRanges} />
    </div>
    <p className="text-sm">Al comparar los rangos de cada persona, <strong>al menos {atLeastHalf.cv} de {responses}</strong> redujeron el tiempo del CV en 50 % o más y <strong>al menos {atLeastHalf.letter} de {responses}</strong> el de la carta.</p>
  </section>;
}

function OperationDashboard({ attempts, enrolled }) {
  const metrics = Object.entries(operationLabels).map(([type, label]) => {
    const group = attempts.filter((attempt) => attempt.document_type === type);
    return { type, label, latest: group[0], ...summarizeOperationTimes(group) };
  });
  const maxAverage = Math.max(1, ...metrics.map(({ value }) => value ?? 0));
  return <section className={card} aria-labelledby="pilot-times-heading">
    <h2 id="pilot-times-heading" className="text-lg font-bold">I4 · Tiempo de generación</h2>
    <p className="mt-1 text-sm">CV y carta se miden automáticamente desde el clic hasta la vista previa. Meta {formatPilotTarget(PILOT_INDICATORS.I4)}. La importación se muestra como medición complementaria.</p>
    {enrolled ? <ul className="mt-3 grid gap-3 sm:grid-cols-3">
      {metrics.map(({ type, label, value, n, failures, latest }) => (
        <li key={type} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-sm font-semibold">{label}</p>
          {value === null ? <p className="my-2 text-sm">Sin tiempos medidos</p> : <>
            <p className="my-1 text-2xl font-black tabular-nums">{secondsLabel(value)} <span className="text-xs font-normal">de promedio</span></p>
            <div className="mb-2 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${value / maxAverage * 100}%` }} /></div>
            {type !== 'profile_import' && <p className="mb-1 text-xs font-medium">{value <= PILOT_INDICATORS.I4.target ? 'Tu promedio está dentro de la meta' : 'Tu promedio supera el tiempo meta'}</p>}
          </>}
          {latest && <p className="text-xs">Último intento: {secondsLabel(latest.duration_ms / 1000)} · {latest.success ? 'Resultado listo' : 'Error'}</p>}
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{n} con resultado · {failures} con error</p>
        </li>
      ))}
    </ul> : <p className="mt-3 text-sm">Inscríbete en el piloto para registrar tus tiempos de generación.</p>}
  </section>;
}

function ScoreForm({ title, question, kind, value, help, busy, onSave, interviews = [] }) {
  const requiresInterview = kind === 'after';
  return (
    <section className={card}>
      <h3 className="font-bold">{title}</h3>
      <p className="my-2 text-sm">{question}</p>
      {value !== null ? <p className="text-sm font-semibold">Respuesta registrada: {value}/10</p> : (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onSave(kind, Number(data.get('score')), data.get('interview') || null);
        }}>
          {requiresInterview && (
            <label className="grid gap-1 text-sm">Entrevista realizada
              <select name="interview" required className={field}>
                <option value="">Selecciona una sesión</option>
                {interviews.map(({ id, interview_type, created_at }) => (
                  <option key={id} value={id}>{({ general: 'General', technical: 'Técnica', behavioral: 'Por competencias' })[interview_type]} · {new Date(created_at).toLocaleString('es-PE')}</option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-sm">Puntaje de 0 a 10
            <input name="score" className={`${field} w-32`} type="number" required min="0" max="10" step="1" />
          </label>
          <button type="submit" className={button} disabled={busy || (requiresInterview && !interviews.length)}>Registrar respuesta</button>
          <p className="w-full text-xs text-slate-600 dark:text-slate-300">{help}</p>
        </form>
      )}
    </section>
  );
}

export default function PilotParticipant({ participant, times, generations, interviews, busy, enroll, saveSurvey }) {
  const [consent, setConsent] = useState(false);
  const indicatorOverview = <IndicatorOverview participant={participant} times={times} generations={generations} />;
  if (!participant) return <div className="space-y-4">
    <section className={`${card} max-w-2xl space-y-3`}>
      <h2 className="font-bold">Participar en el piloto</h2>
      <p className="text-sm">La participación es voluntaria. EmpleaIA guardará los tiempos, las respuestas de las encuestas y la referencia a la entrevista elegida. El equipo autorizado revisará las mediciones usando un código de participante.</p>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Acepto que se registren mis mediciones para la validación de PI2.</label>
      <button type="button" className={button} disabled={!consent || busy} onClick={enroll}>Inscribirme en el piloto</button>
    </section>
    <PreparationComparison />
    <OperationDashboard attempts={generations} enrolled={false} />
    {indicatorOverview}
  </div>;

  const readyForSatisfaction = participant.satisfaction !== null || canSubmitPilotSatisfaction(participant, generations, times);
  return (
    <div className="space-y-4">
      <p className="break-all text-sm">Tu código de participante: <strong>{participant.code}</strong></p>
      <PreparationComparison />
      <OperationDashboard attempts={generations} enrolled />
      <PilotDocumentWorkflow attempts={generations} />
      {indicatorOverview}

      <div className="grid gap-4 md:grid-cols-2">
        <ScoreForm title="I6 · Antes de la entrevista" question={confidenceQuestion} kind="before" value={participant.confidence_before} busy={busy} onSave={saveSurvey} help="0 = ninguna confianza. 10 = máxima confianza. Responde antes de iniciar la simulación del piloto." />
        {participant.confidence_before !== null && <ScoreForm title="I6 · Después de la entrevista" question={confidenceQuestion} kind="after" value={participant.confidence_after} busy={busy} onSave={saveSurvey} interviews={interviews} help="0 = ninguna confianza. 10 = máxima confianza. Responde al finalizar la simulación." />}
      </div>
      {readyForSatisfaction ? (
        <ScoreForm title="I5 · Satisfacción después del uso" question="¿Qué tan satisfecho estás con EmpleaIA después de completar las tareas del piloto?" kind="satisfaction" value={participant.satisfaction} busy={busy} onSave={saveSurvey} help="0 = nada satisfecho. 10 = totalmente satisfecho." />
      ) : <section className={card}>
        <h3 className="font-bold">I5 · Satisfacción después del uso</h3>
        <p className="mt-2 text-sm">La encuesta se habilita al generar un CV y una carta y registrar tu respuesta posterior a la entrevista.</p>
      </section>}
    </div>
  );
}
