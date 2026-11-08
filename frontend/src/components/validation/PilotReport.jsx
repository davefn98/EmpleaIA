import { useState } from 'react';
import { formatPilotTarget, PILOT_INDICATORS, PREVIOUS_PREPARATION, QUALITY_CRITERIA, summarizePilot } from '../../utils/pi2Validation';
import PilotDocumentWorkflow from './PilotDocumentWorkflow';

const panel = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800';
const input = 'rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900';
const button = 'rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50';
const format = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const display = (value, unit) => value === null ? 'Sin datos' : `${format.format(value)}${unit}`;
const projectFormulas = {
  I1: 'Elementos elaborados / elementos planificados × 100',
  I2: 'Entregables completados / entregables planificados × 100',
  I7: 'Sprints completados según plan / sprints planificados × 100',
};
const artifactLabels = { cv: 'CV', letter: 'Carta', feedback: 'Retroalimentación de entrevista' };

const previousSurvey = {
  source: 'Formulario sin título.csv (exportación de Google Forms)',
  ...PREVIOUS_PREPARATION,
  responsePeriod: '27 de junio al 3 de noviembre de 2026',
  build: null,
  indicators: {
    I1: {
      status: 'Apoya el diagnóstico',
      result: '20 de 27 egresados (74,1 %) declararon que no tenían empleo formal.',
      detail: 'El cumplimiento se verifica con los entregables del diagnóstico en Evidencias del proyecto.',
    },
    I2: {
      status: 'Requiere evidencia documental',
      result: 'Se verifica con los entregables de diseño en Evidencias del proyecto.',
    },
    I3: {
      status: 'Evidencia parcial',
      result: `Según los rangos declarados, al menos ${PREVIOUS_PREPARATION.atLeastHalf.cv} de ${PREVIOUS_PREPARATION.responses} redujeron el tiempo del CV en 50 % o más y al menos ${PREVIOUS_PREPARATION.atLeastHalf.letter} de ${PREVIOUS_PREPARATION.responses} el de la carta.`,
      detail: 'Se comparó el mínimo del rango manual con el máximo del rango con EmpleaIA para cada persona. Faltan tiempos exactos y datos sobre preparación de entrevistas para calcular la reducción promedio del I3.',
    },
    I4: {
      status: 'Pendiente de medición en segundos',
      result: 'Los tiempos declarados están agrupados en minutos. La meta se comprueba con los tiempos de generación en segundos de Mediciones actuales del piloto.',
    },
    I5: {
      status: 'Supera la meta con conversión',
      result: 'Valoración general de 4,69/5, con 26 respuestas válidas. Equivale a 9,23/10 con la conversión lineal de 1–5 a 0–10.',
      detail: 'Para cerrar el I5 con esta evidencia, queda documentar la equivalencia de la pregunta y la escala con el indicador de la tesis.',
    },
    I6: {
      status: 'Evidencia relacionada',
      result: 'La confianza para postular pasó de 3,04 a 4,44/5. De 27 personas, 18 mejoraron, 8 se mantuvieron y 1 bajó.',
      detail: 'Para cerrar el I6, se requiere medir la confianza para afrontar una entrevista antes y después de la simulación. El formulario reúne ambas valoraciones en una sola respuesta.',
    },
    I7: {
      status: 'Requiere evidencia documental',
      result: 'Se verifica con las actas y los incrementos de los sprints en Evidencias del proyecto.',
    },
  },
  usability: { score: 75.58, completeResponses: 26, missingItem: 9 },
};

function PreviousSurvey() {
  const { source, population, responses, responsePeriod, indicators, usability } = previousSurvey;
  return <section className={`${panel} space-y-3`} aria-labelledby="previous-survey-heading">
    <h2 id="previous-survey-heading" className="text-lg font-bold">Encuesta previa</h2>
    <p className="text-sm">{responses} {population} · Respuestas del {responsePeriod}. El formulario carece de un campo de versión.</p>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr>
          <th scope="col" className="pr-4 pb-2">Indicador y meta</th>
          <th scope="col" className="pb-2">Resultado y estado con esta evidencia</th>
        </tr></thead>
        <tbody>{Object.entries(indicators).map(([id, row]) => {
          const definition = PILOT_INDICATORS[id];
          return <tr key={id} className="border-t border-slate-200 align-top dark:border-slate-700">
            <th scope="row" className="py-3 pr-4 font-semibold">
              {id} · {definition.title}
              <span className="mt-1 block whitespace-nowrap text-xs font-normal">{definition.objective} · Meta {formatPilotTarget(definition)}</span>
            </th>
            <td className="py-3">
              <p className="font-semibold">{row.status}</p>
              <p>{row.result}</p>
              {row.detail && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{row.detail}</p>}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><strong>Usabilidad SUS · {usability.score.toLocaleString('es')}/100</strong> con {usability.completeResponses} respuestas completas. Se excluyó una respuesta por omisión del ítem {usability.missingItem}. El SUS se informa por separado del I5.</p>
    <p className="text-xs text-slate-600 dark:text-slate-300">Fuente · {source}. El informe muestra resultados agregados.</p>
  </section>;
}

function Metric({ indicator, result, ready = true, sample, children }) {
  const definition = PILOT_INDICATORS[indicator];
  const { objective, title, unit, operator, target } = definition;
  const meets = operator === '≤' ? result.value <= target : result.value >= target;
  return <article className={panel}>
    <h3 className="font-bold">{indicator} · {title} ({objective})</h3>
    <p className="mt-1 text-xl font-black">{display(result.value, unit)}</p>
    <p className="text-sm">Meta {formatPilotTarget(definition)} · {sample}</p>
    <p className="my-2 text-xs font-semibold">{result.value === null || !ready ? 'Evidencia incompleta' : meets ? 'Alcanza la meta en la muestra registrada' : 'La muestra registrada queda fuera de la meta'}</p>
    {children}
  </article>;
}

function EvidenceForm({ indicator, item, busy, onSave }) {
  return <form className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 dark:border-slate-700" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({ ...(item && { id: item.id }), indicator, title: form.get('title').trim(), reference: form.get('reference').trim(), completed: form.has('completed') });
  }}>
    <input name="title" aria-label="Elemento planificado" placeholder="Elemento planificado" maxLength={200} required className={input} defaultValue={item?.title} />
    <input name="reference" aria-label="Referencia de evidencia" placeholder="Acta, sección, versión o enlace" maxLength={600} className={`${input} min-w-44 flex-1`} defaultValue={item?.reference} />
    <label className="flex gap-1 text-sm"><input type="checkbox" name="completed" defaultChecked={item?.completed} /> Verificado</label>
    <button type="submit" className={button} disabled={busy}>{item ? 'Actualizar' : 'Agregar'}</button>
  </form>;
}

function QualityForm({ participants, reviews, busy, onSave }) {
  const [artifact, setArtifact] = useState('cv');
  return <section className={`${panel} space-y-3`}>
    <h3 className="font-bold">OE4 · Revisión humana de calidad</h3>
    <p className="text-sm">Califica cada criterio de 1 a 5 y conserva la referencia a la evidencia revisada.</p>
    {participants.length > 0 && <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSave({ participant_code: form.get('participant'), artifact, reference: form.get('reference').trim(), scores: QUALITY_CRITERIA[artifact].map((_, index) => Number(form.get(`score-${index}`))), notes: form.get('notes').trim() });
    }}>
      <label className="grid gap-1 text-sm">Código del participante<select name="participant" className={input} required>
        <option value="">Selecciona un código</option>
        {participants.map(({ code }) => <option value={code} key={code}>{code}</option>)}
      </select></label>
      <label className="grid gap-1 text-sm">Tipo de evidencia<select className={input} value={artifact} onChange={(event) => setArtifact(event.target.value)}>
        {Object.entries(artifactLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="grid gap-1 text-sm sm:col-span-2">Referencia de evidencia<input name="reference" className={input} required maxLength={600} /></label>
      {QUALITY_CRITERIA[artifact].map((criterion, index) => <label className="grid gap-1 text-sm" key={`${artifact}-${criterion}`}>{criterion}
        <input name={`score-${index}`} className={`${input} w-24`} type="number" min="1" max="5" required />
      </label>)}
      <label className="grid gap-1 text-sm sm:col-span-2">Observaciones<textarea name="notes" rows="2" className={input} maxLength={1500} /></label>
      <div><button type="submit" disabled={busy} className={button}>Registrar revisión</button></div>
    </form>}
    <p className="text-sm">{reviews.length} revisiones registradas en la muestra seleccionada.</p>
    {reviews.map((review) => <details key={review.id} className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700">
      <summary className="cursor-pointer break-words">{artifactLabels[review.artifact]} · {review.reference}</summary>
      <ul className="mt-2 space-y-1">{QUALITY_CRITERIA[review.artifact].map((criterion, index) => <li key={criterion}>{criterion} · {review.scores[index]}/5</li>)}</ul>
      {review.notes && <p className="mt-2 whitespace-pre-wrap">{review.notes}</p>}
    </details>)}
  </section>;
}

export default function PilotReport({ data, busy, saveEvidence, saveQuality }) {
  const [selectedBuild, setSelectedBuild] = useState('');
  const builds = [...new Set(data.participants.map(({ build }) => build))];
  const build = builds.includes(selectedBuild) ? selectedBuild : builds[0];
  const participants = data.participants.filter((row) => row.build === build);
  const codes = new Set(participants.map((row) => row.code));
  const times = data.times.filter((row) => codes.has(row.participant_code));
  const attempts = data.generations.filter((row) => codes.has(row.participant_code) && row.build === build);
  const generations = attempts.filter(({ document_type }) => ['cv', 'letter', 'profile_import'].includes(document_type));
  const documentWorkflow = attempts.filter(({ document_type }) => document_type.endsWith('_preparation') || document_type.endsWith('_pdf'));
  const reviews = data.reviews.filter((row) => codes.has(row.participant_code));
  const metrics = summarizePilot(participants, times, generations, data.evidence);

  const exportReport = () => {
    const payload = { build, extracted_at: new Date().toISOString(), metrics, participants, times, generations, documentWorkflow, evidence: data.evidence, reviews, previousSurvey };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'evidencias-validacion-pi2.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="space-y-4">
    <PreviousSurvey />

    <section className="space-y-4" aria-labelledby="current-pilot-heading">
      <h2 id="current-pilot-heading" className="text-lg font-bold">Mediciones actuales del piloto</h2>
      <div className="flex flex-wrap items-center gap-3">
        {builds.length > 0 && <label className="flex items-center gap-2 text-sm">Versión del piloto
          <select value={build} onChange={(event) => setSelectedBuild(event.target.value)} className={input}>{builds.map((version) => <option key={version}>{version}</option>)}</select>
        </label>}
        <span className="text-sm">{participants.length} participantes inscritos en la muestra</span>
        <button type="button" className={button} onClick={exportReport}>Exportar evidencia</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Metric indicator="I3" result={metrics.preparationTotal} sample={`${metrics.preparationTotal.n} participantes con las tres tareas emparejadas`}>
          <div className="overflow-x-auto"><table className="w-full text-left text-xs">
            <thead><tr><th>Tarea</th><th>Pares</th><th>Manual</th><th>EmpleaIA</th><th>Reducción</th></tr></thead>
            <tbody>{metrics.preparation.map((item) => <tr key={item.task} className="border-t border-slate-200 dark:border-slate-700">
              <th scope="row" className="py-2 pr-2">{item.label}</th><td>{item.n}</td><td>{display(item.manual, ' s')}</td><td>{display(item.platform, ' s')}</td><td>{display(item.value, ' %')}</td>
            </tr>)}</tbody>
          </table></div>
          <p className="mt-2 text-xs">((promedio manual − promedio con EmpleaIA) / promedio manual) × 100. El total suma las tres tareas de cada participante con datos completos.</p>
        </Metric>
        <Metric indicator="I4" result={metrics.generation} ready={metrics.cv.n > 0 && metrics.letter.n > 0} sample={`${metrics.generation.n} con resultado · ${metrics.generation.failures} con error`}>
          <ul className="space-y-1 text-sm">
            {[['CV', metrics.cv], ['Carta', metrics.letter]].map(([label, result]) => <li key={label}>
              {label} · {display(result.value, ' s')} · {result.n} con resultado · {result.failures} con error
              {result.value !== null && <span> · {result.value <= PILOT_INDICATORS.I4.target ? 'Dentro de la meta' : 'Supera el tiempo meta'}</span>}
            </li>)}
          </ul>
          <p className="mt-2 text-xs">El promedio general reúne los intentos de CV y carta con vista previa disponible. Los errores se registran por separado.</p>
          <div className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-700">
            <h4 className="text-sm font-bold">Importación de CV en Mi perfil</h4>
            <p className="text-sm">{display(metrics.profileImport.value, ' s')} de promedio · {metrics.profileImport.n} con resultado · {metrics.profileImport.failures} con error</p>
            <p className="mt-1 text-xs">Medición complementaria desde «Extraer con IA» hasta la vista previa de los datos extraídos.</p>
          </div>
        </Metric>
        <Metric indicator="I5" result={metrics.satisfaction} sample={`${metrics.satisfaction.n} respuestas válidas · ${participants.length - metrics.satisfaction.n} faltantes`}>
          <p className="text-xs">Promedio de las calificaciones de 0 a 10 registradas después del uso.</p>
          {metrics.satisfaction.n > 0 && <ol aria-label="Distribución de satisfacción" className="mt-3 grid grid-cols-11 gap-1 text-center text-[10px]">
            {metrics.satisfaction.distribution.map((count, score) => <li key={score} aria-label={`${score}/10: ${count} respuestas`}>
              <div className="flex h-12 items-end justify-center" aria-hidden="true"><div className="w-3 rounded-t bg-indigo-500" style={{ height: `${count / metrics.satisfaction.n * 100}%` }} /></div>
              <span>{score}</span>
            </li>)}
          </ol>}
        </Metric>
        <Metric indicator="I6" result={metrics.confidence} sample={`${metrics.confidence.n} pares válidos · ${participants.length - metrics.confidence.n} faltantes`}>
          <p className="mb-1 text-sm">Antes: {display(metrics.confidence.before, '/10')} · Después: {display(metrics.confidence.after, '/10')}</p>
          <p className="text-xs">Promedio de las diferencias individuales entre las respuestas posteriores y previas a la entrevista, en escala 0–10.</p>
        </Metric>
      </div>

      <PilotDocumentWorkflow attempts={documentWorkflow} />
      <p className="text-sm">Los tiempos de creación registran visitas al módulo. Para calcular la reducción del I3, usa tiempos emparejados de tareas equivalentes, incluida la preparación inicial de entrevistas.</p>
      <QualityForm participants={participants} reviews={reviews} busy={busy} onSave={saveQuality} />
    </section>

    <section className="space-y-3">
      <h2 className="text-lg font-bold">Evidencias del proyecto</h2>
      <p className="text-sm">Registra primero la línea base completa. Marca un elemento verificado cuando tengas su evidencia de revisión. Los porcentajes reflejan los elementos registrados.</p>
      {Object.entries(projectFormulas).map(([indicator, formula]) => {
        const definition = PILOT_INDICATORS[indicator];
        const result = metrics.evidence[indicator];
        let status = 'Sin evidencias verificadas';
        if (result.n > 0) {
          status = result.value >= definition.target ? 'Meta alcanzada según las evidencias registradas' : 'Meta pendiente según las evidencias registradas';
        }
        return <article className={`${panel} space-y-3`} key={indicator}>
          <h3 className="font-bold">{indicator} · {definition.title} ({definition.objective})</h3>
          <p className="text-sm">{result.n}/{result.total} verificados · {display(result.value, definition.unit)} · Meta {formatPilotTarget(definition)}</p>
          <p className="text-xs font-semibold">{status}</p>
          <p className="text-xs">{formula}</p>
          {data.evidence.filter((item) => item.indicator === indicator).map((item) => <EvidenceForm key={item.id} item={item} indicator={indicator} busy={busy} onSave={saveEvidence} />)}
          <EvidenceForm key={`new-${result.total}`} indicator={indicator} busy={busy} onSave={saveEvidence} />
        </article>;
      })}
    </section>
  </div>;
}
