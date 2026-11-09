export const PILOT_BUILD = import.meta.env?.VITE_PI2_BUILD || 'local-sin-etiqueta';

export const PREVIOUS_PREPARATION = {
  responses: 27,
  population: 'egresados de CIBERTEC',
  manualRanges: [
    { label: 'Menos de 30 min', cv: 5, letter: 5 },
    { label: 'De 30 min a 1 h', cv: 9, letter: 13 },
    { label: 'De 1 a 2 h', cv: 9, letter: 7 },
    { label: 'Más de 2 h', cv: 4, letter: 2 },
  ],
  platformRanges: [
    { label: 'Menos de 5 min', cv: 19, letter: 19 },
    { label: 'De 10 a 20 min', cv: 3, letter: 3 },
    { label: 'De 20 a 30 min', cv: 3, letter: 2 },
    { label: 'Más de 30 min', cv: 2, letter: 3 },
  ],
  atLeastHalf: { cv: 18, letter: 16 },
};

export const PILOT_INDICATORS = {
  I1: { objective: 'OE1', title: 'Diagnóstico de la situación actual', target: 100, unit: ' %', operator: '=' },
  I2: { objective: 'OE2', title: 'Arquitectura funcional y técnica', target: 100, unit: ' %', operator: '=' },
  I3: { objective: 'OE4', title: 'Reducción del tiempo de preparación', target: 50, unit: ' %', operator: '≥' },
  I4: { objective: 'OE4', title: 'Tiempo promedio de generación de CV y carta', target: 30, unit: ' s', operator: '≤' },
  I5: { objective: 'OE4', title: 'Satisfacción con EmpleaIA', target: 7.5, unit: '/10', operator: '≥' },
  I6: { objective: 'OE4', title: 'Cambio de autoconfianza para la entrevista', target: 2, unit: ' puntos', operator: '≥' },
};

export function formatPilotTarget({ operator, target, unit }) {
  return `${operator} ${target.toLocaleString('es-PE')}${unit}`;
}

export const TASKS = {
  cv: 'Preparar un CV',
  letter: 'Preparar una carta',
  interview: 'Preparar una entrevista',
};

export const QUALITY_CRITERIA = {
  cv: ['Fidelidad al perfil', 'Pertinencia a la vacante', 'Claridad', 'Estructura', 'Ausencia de datos inventados'],
  letter: ['Fidelidad al perfil', 'Pertinencia a la vacante', 'Claridad', 'Estructura', 'Ausencia de datos inventados'],
  feedback: ['Relación con la respuesta', 'Justificación', 'Recomendaciones accionables'],
};

const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const valuePresent = (value) => value !== null && value !== undefined;

export function summarizeOperationTimes(attempts) {
  const successes = attempts.filter((item) => item.success);
  return {
    value: average(successes.map((item) => item.duration_ms / 1000)),
    n: successes.length,
    failures: attempts.length - successes.length,
  };
}

export function getPilotSatisfactionProgress(participant, attempts, previousTimes) {
  const hasPreviousTasks = Object.keys(TASKS).every((task) => previousTimes.some((row) => row.task === task && row.method === 'platform'));
  const hasGeneration = (type) => hasPreviousTasks || attempts.some((attempt) => attempt.document_type === type && attempt.success);
  return {
    cv: hasGeneration('cv'),
    letter: hasGeneration('letter'),
    confidenceAfter: valuePresent(participant.confidence_after),
  };
}

export function summarizePilot(participants, times, generations, evidence) {
  const pairs = new Map();
  for (const item of times) {
    const key = `${item.participant_code}:${item.task}`;
    const pair = pairs.get(key) || { task: item.task, code: item.participant_code };
    pair[item.method] = Number(item.seconds);
    pairs.set(key, pair);
  }
  const completePairs = [...pairs.values()].filter(({ manual, platform }) => manual > 0 && platform > 0);
  const participantTotals = new Map();
  for (const pair of completePairs) {
    const totals = participantTotals.get(pair.code) || { tasks: 0, manual: 0, platform: 0 };
    totals.tasks++;
    totals.manual += pair.manual;
    totals.platform += pair.platform;
    participantTotals.set(pair.code, totals);
  }
  const completeParticipants = [...participantTotals.values()].filter((row) => row.tasks === Object.keys(TASKS).length);
  const manualTotal = average(completeParticipants.map((row) => row.manual));
  const platformTotal = average(completeParticipants.map((row) => row.platform));
  const preparation = Object.entries(TASKS).map(([task, label]) => {
    const group = completePairs.filter((pair) => pair.task === task);
    const manual = average(group.map((pair) => pair.manual));
    const platform = average(group.map((pair) => pair.platform));
    return { task, label, n: group.length, manual, platform, value: manual === null ? null : (manual - platform) / manual * 100 };
  });

  const satisfaction = participants.filter((row) => valuePresent(row.satisfaction));
  const confidence = participants.filter((row) => valuePresent(row.confidence_before) && valuePresent(row.confidence_after) && row.interview_id);
  return {
    preparation,
    preparationTotal: { n: completeParticipants.length, value: manualTotal === null ? null : (manualTotal - platformTotal) / manualTotal * 100 },
    generation: summarizeOperationTimes(generations.filter((item) => ['cv', 'letter'].includes(item.document_type))),
    cv: summarizeOperationTimes(generations.filter((item) => item.document_type === 'cv')),
    letter: summarizeOperationTimes(generations.filter((item) => item.document_type === 'letter')),
    profileImport: summarizeOperationTimes(generations.filter((item) => item.document_type === 'profile_import')),
    satisfaction: {
      value: average(satisfaction.map((row) => row.satisfaction)), n: satisfaction.length,
      distribution: Array.from({ length: 11 }, (_, score) => satisfaction.filter((row) => row.satisfaction === score).length),
    },
    confidence: {
      value: average(confidence.map((row) => row.confidence_after - row.confidence_before)), n: confidence.length,
      before: average(confidence.map((row) => row.confidence_before)), after: average(confidence.map((row) => row.confidence_after)),
    },
    evidence: Object.fromEntries(['I1', 'I2'].map((indicator) => {
      const group = evidence.filter((item) => item.indicator === indicator);
      const n = group.filter((item) => item.completed && item.reference.trim()).length;
      return [indicator, { n, total: group.length, value: group.length ? n / group.length * 100 : null }];
    })),
  };
}
