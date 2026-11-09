import { useState } from 'react';
import { formatPilotTarget, getPilotSatisfactionProgress, PILOT_INDICATORS, PREVIOUS_PREPARATION, summarizeOperationTimes, summarizePilot } from '../../utils/pi2Validation';
import PilotDocumentWorkflow from './PilotDocumentWorkflow';
import PilotPreparationTiming from './PilotPreparationTiming';

const button = 'rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50';
const field = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900';
const card = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800';
const confidenceQuestion = '¿Qué tan seguro te sientes para afrontar una entrevista laboral?';
const numberFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const secondsLabel = (seconds) => `${numberFormat.format(seconds)} s`;
const indicatorSections = { I3: 'preparation-comparison-heading', I4: 'pilot-times-heading', I5: 'pilot-satisfaction-heading', I6: 'pilot-confidence-heading' };
const overviewIndicators = Object.entries(PILOT_INDICATORS);

function IndicatorOverview({ participant, times, generations }) {
  const metrics = summarizePilot(participant ? [participant] : [], times, generations, []);
  const evidence = {
    I1: 'Se acredita con el diagnóstico del proyecto',
    I2: 'Se acredita con los entregables de diseño',
    I3: metrics.preparationTotal.n ? `${numberFormat.format(metrics.preparationTotal.value)} % de reducción registrada` : 'Evidencia parcial · encuesta previa de CV y carta',
    I4: metrics.generation.n ? `${metrics.cv.n} CV · ${metrics.letter.n} cartas con tiempo registrado` : 'Sin tiempos de generación registrados',
    I5: metrics.satisfaction.n ? `${numberFormat.format(metrics.satisfaction.value)}/10 en la encuesta` : 'Encuesta posterior pendiente',
    I6: metrics.confidence.n ? `Cambio de ${numberFormat.format(metrics.confidence.value)} puntos en tus respuestas`
      : participant?.confidence_before != null ? 'Falta la respuesta posterior a la entrevista' : 'Faltan las respuestas antes y después',
  };
  return <section className={card} aria-labelledby="pilot-indicators-heading">
    <h2 id="pilot-indicators-heading" className="text-lg font-bold">Indicadores de la tesis</h2>
    <p className="mt-1 text-sm">Consulta tus registros del piloto y las evidencias del proyecto. El Informe del equipo compara los resultados con las metas.</p>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full table-fixed text-left text-sm">
        <thead><tr><th scope="col" className="w-[45%] pr-2 pb-2">Indicador</th><th scope="col" className="w-[21%] pr-2 pb-2 sm:w-[17%]">Meta</th><th scope="col" className="pb-2">Evidencia</th></tr></thead>
        <tbody>{overviewIndicators.map(([id, definition]) => (
          <tr key={id} className="border-t border-slate-200 align-top dark:border-slate-700">
            <th scope="row" className="py-2.5 pr-2 font-medium sm:pr-4">
              <span className="mb-1 flex items-center gap-2 text-xs">
                <strong className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">{id}</strong>
                <span className="text-slate-600 dark:text-slate-300">{definition.objective}</span>
              </span>
              {indicatorSections[id] && (participant || id === 'I3' || id === 'I4')
                ? <a className="underline decoration-slate-400 underline-offset-2 hover:decoration-current focus-visible:outline-2" href={`#${indicatorSections[id]}`}>{definition.title}</a>
                : definition.title}
            </th>
            <td className="py-2.5 pr-2 tabular-nums">{formatPilotTarget(definition)}</td>
            <td className="py-2.5">{evidence[id]}</td>
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

function PreparationComparison({ children }) {
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
    {children}
  </section>;
}

function OperationTiming({ attempts, type, label, target }) {
  const group = attempts.filter((attempt) => attempt.document_type === type);
  const { value, n, failures } = summarizeOperationTimes(group);
  const latest = group[0];
  return <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <p className="text-sm font-semibold">{label}</p>
    {value === null ? <p className="my-2 text-sm">Sin tiempos medidos</p> : <>
      <p className="my-1 text-2xl font-black tabular-nums">{secondsLabel(value)} <span className="text-xs font-normal">de promedio</span></p>
      {target && <p className="mb-1 text-xs font-medium">{value <= target ? 'Tu promedio está dentro de la meta' : 'Tu promedio supera el tiempo meta'}</p>}
    </>}
    {latest && <p className="text-xs">Último intento: {secondsLabel(latest.duration_ms / 1000)} · {latest.success ? 'Resultado listo' : 'Error'}</p>}
    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{n} con resultado · {failures} con error</p>
  </div>;
}

function OperationDashboard({ attempts, enrolled }) {
  const target = PILOT_INDICATORS.I4.target;
  return <section className={card} aria-labelledby="pilot-times-heading">
    <h2 id="pilot-times-heading" className="text-lg font-bold">I4 · Tiempo de generación</h2>
    <p className="mt-1 text-sm">CV y carta se miden automáticamente desde el clic hasta la vista previa. Meta {formatPilotTarget(PILOT_INDICATORS.I4)}.</p>
    {enrolled ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <OperationTiming attempts={attempts} type="cv" label="Generar CV" target={target} />
      <OperationTiming attempts={attempts} type="letter" label="Generar carta" target={target} />
    </div> : <p className="mt-3 text-sm">Inscríbete en el piloto para registrar tus tiempos de generación.</p>}
  </section>;
}

function ScoreForm({ title, question, kind, value, help, busy, onSave, interviews = [], onOpenInterviews }) {
  const requiresInterview = kind === 'after';
  const isSatisfaction = kind === 'satisfaction';
  const Heading = isSatisfaction ? 'h2' : 'h3';
  return (
    <section className={card}>
      <Heading id={isSatisfaction ? 'pilot-satisfaction-heading' : undefined} className={isSatisfaction ? 'text-lg font-bold' : 'font-bold'}>{title}</Heading>
      <p className="my-2 text-sm">{question}</p>
      {value !== null ? <p className="text-sm font-semibold">Respuesta registrada: {value}/10</p> : requiresInterview && !interviews.length ? (
        <div className="space-y-3 text-sm">
          <p className="font-semibold">Aún no hay una entrevista que puedas seleccionar.</p>
          <p>Finaliza una entrevista que hayas iniciado después de registrar tu respuesta en «Antes de la entrevista». Si quedó pendiente de análisis, genera su feedback en Entrevistas. Luego vuelve aquí y pulsa «Actualizar».</p>
          <button type="button" className={button} onClick={onOpenInterviews}>Ir a Entrevistas</button>
        </div>
      ) : (
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
          <button type="submit" className={button} disabled={busy}>Registrar respuesta</button>
          <p className="w-full text-xs text-slate-600 dark:text-slate-300">{help}</p>
        </form>
      )}
    </section>
  );
}

export default function PilotParticipant({ userId, participant, times, generations, interviews, busy, enroll, saveSurvey, saveTimedTask, onOpenInterviews }) {
  const [consent, setConsent] = useState(false);
  const indicatorOverview = <IndicatorOverview participant={participant} times={times} generations={generations} />;
  if (!participant) return <div className="space-y-4">
    <section className={`${card} max-w-2xl space-y-3`}>
      <h2 className="font-bold">Participar en el piloto</h2>
      <p className="text-sm">La participación es voluntaria. EmpleaIA guardará los tiempos, las respuestas de las encuestas y la referencia a la entrevista elegida. El equipo autorizado revisará las mediciones usando un código de participante.</p>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Acepto que se registren mis mediciones para la validación de PI2.</label>
      <button type="button" className={button} disabled={!consent || busy} onClick={enroll}>Inscribirme en el piloto</button>
    </section>
    {indicatorOverview}
    <PreparationComparison />
    <OperationDashboard attempts={generations} enrolled={false} />
  </div>;

  const progress = getPilotSatisfactionProgress(participant, generations, times);
  const requirements = [
    { label: 'CV generado', done: progress.cv },
    { label: 'Carta generada', done: progress.letter },
    { label: 'Respuesta de I6 después de la entrevista', done: progress.confidenceAfter },
  ];
  const readyForSatisfaction = participant.satisfaction !== null || requirements.every(({ done }) => done);
  return (
    <div className="space-y-4">
      <p className="break-all text-sm">Tu código de participante: <strong>{participant.code}</strong></p>
      {indicatorOverview}
      <PreparationComparison>
        <PilotPreparationTiming userId={userId} participant={participant} times={times} busy={busy} onSave={saveTimedTask} />
      </PreparationComparison>
      <OperationDashboard attempts={generations} enrolled />

      {readyForSatisfaction ? (
        <ScoreForm title="I5 · Satisfacción después del uso" question="¿Qué tan satisfecho estás con EmpleaIA después de completar las tareas del piloto?" kind="satisfaction" value={participant.satisfaction} busy={busy} onSave={saveSurvey} help="0 = nada satisfecho. 10 = totalmente satisfecho." />
      ) : <section className={card}>
        <h2 id="pilot-satisfaction-heading" className="text-lg font-bold">I5 · Satisfacción después del uso</h2>
        <p className="mt-2 text-sm">Completa los pasos pendientes para responder la encuesta.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {requirements.map(({ label, done }) => <li key={label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <span>{label}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${done ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>
              {done ? 'Registrado' : 'Pendiente'}
            </span>
          </li>)}
        </ul>
      </section>}

      <section className="space-y-3" aria-labelledby="pilot-confidence-heading">
        <h2 id="pilot-confidence-heading" className="text-lg font-bold">I6 · Cambio de autoconfianza para la entrevista</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ScoreForm title="Antes de la entrevista" question={confidenceQuestion} kind="before" value={participant.confidence_before} busy={busy} onSave={saveSurvey} help="0 = ninguna confianza. 10 = máxima confianza. Responde antes de iniciar la simulación del piloto." />
          {participant.confidence_before !== null && <ScoreForm title="Después de la entrevista" question={confidenceQuestion} kind="after" value={participant.confidence_after} busy={busy} onSave={saveSurvey} interviews={interviews} onOpenInterviews={onOpenInterviews} help="0 = ninguna confianza. 10 = máxima confianza. Responde al finalizar la simulación." />}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="pilot-complementary-heading">
        <h2 id="pilot-complementary-heading" className="text-lg font-bold">Mediciones complementarias</h2>
        <OperationTiming attempts={generations} type="profile_import" label="Importar CV en Mi perfil" />
        <PilotDocumentWorkflow attempts={generations} />
      </section>
    </div>
  );
}
