import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInterviewAnalysis, parseInterviewAnalysis } from '../services/interviewAnalysisService.js';
import { classifyOpenAIError } from '../services/interviewService.js';

const validAnalysis = () => ({
  overall_score: 65,
  general_analysis: 'La respuesta describe la solución, pero no detalla cómo comprobarla.',
  strengths: ['Explica el propósito de la API.'],
  improvements: ['Detallar pruebas de integración.'],
  recommendations: Array.from({ length: 3 }, (_, i) => ({
    weakness: `Evidencia por desarrollar ${i + 1}`,
    suggested_resource: `Ejercicio ${i + 1}`,
    reason: `Aplicar el ejercicio ${i + 1} al ejemplo de la primera respuesta.`,
  })),
});
const request = {
  req: { db: {}, user: { id: 'synthetic-user' } },
  interview: { profile_summary: 'Perfil sintético backend', interview_type: 'technical' },
  pairs: [{ question: '¿Cómo pruebas una API?', answer: 'Compruebo sus respuestas HTTP.', evaluation: { score: 65 } }],
  logger: { warn() {} },
};

test('análisis válido conserva los datos generados y admite JSON con cerco Markdown', () => {
  const analysis = validAnalysis();
  assert.deepEqual(parseInterviewAnalysis(JSON.stringify(analysis)), analysis);
  assert.deepEqual(parseInterviewAnalysis('```json\n' + JSON.stringify(analysis) + '\n```'), analysis);
});

test('rechaza menos de tres actividades, campos vacíos y puntuaciones inválidas sin inventar datos', () => {
  for (const patch of [
    { recommendations: validAnalysis().recommendations.slice(0, 1) },
    { recommendations: ['Ejercicio 1', 'Ejercicio 2', 'Ejercicio 3'] },
    { general_analysis: '  ' },
    { overall_score: '65' }, { overall_score: -1 }, { overall_score: 101 },
  ]) assert.throws(() => parseInterviewAnalysis(JSON.stringify({ ...validAnalysis(), ...patch })), { code: 'invalid_ai_analysis' });
  assert.throws(() => parseInterviewAnalysis('{truncado'), { code: 'invalid_ai_analysis' });
});

test('reintenta una salida incompleta con el contexto original y contabiliza ambas llamadas', async () => {
  const calls = [];
  const analysis = validAnalysis();
  const result = await generateInterviewAnalysis({ ...request, generate: async params => {
    calls.push(params);
    return {
      content: JSON.stringify(calls.length === 1 ? { ...analysis, recommendations: analysis.recommendations.slice(0, 1) } : analysis),
      usage: { total_tokens: 42 }, provider: 'synthetic', model: 'test',
    };
  } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].responseSchema.properties.recommendations.minItems, 3);
  assert.deepEqual(calls[1].messages.slice(0, 2), calls[0].messages);
  assert.match(calls[1].messages[2].content, /recommendations/);
  assert.equal(result.tokens, 84);
  assert.equal(result.result.overall_score, 65);
  assert.equal(result.result.ai_provider, 'synthetic');
  assert.equal(result.result.recommendations.length, 3);
});

test('una salida válida no necesita reintento', async () => {
  let count = 0;
  await generateInterviewAnalysis({ ...request, generate: async () => {
    count += 1;
    return { content: JSON.stringify(validAnalysis()) };
  } });
  assert.equal(count, 1);
});

test('dos salidas inválidas terminan con error identificable y sin registrar contenido privado', async () => {
  let count = 0;
  const logs = [];
  await assert.rejects(generateInterviewAnalysis({ ...request,
    logger: { warn: (...args) => logs.push(args) },
    generate: async () => { count += 1; return { content: '{truncado' }; },
  }), { code: 'invalid_ai_analysis' });
  assert.equal(count, 2);
  assert.equal(logs.length, 2);
  assert.doesNotMatch(JSON.stringify(logs), /Perfil sintético|Compruebo|truncado/);
});

test('errores de cuota o conexión no provocan reintentos adicionales', async () => {
  let count = 0;
  const quota = Object.assign(new Error('quota'), { status: 429 });
  await assert.rejects(generateInterviewAnalysis({ ...request, generate: async () => {
    count += 1; throw quota;
  } }), error => error === quota);
  assert.equal(count, 1);
});

test('un análisis inválido se comunica sin el mensaje desconocido', () => {
  let error;
  try { parseInterviewAnalysis('{}'); } catch (caught) { error = caught; }
  const classified = classifyOpenAIError(error);
  assert.equal(classified.type, 'invalid_ai_analysis');
  assert.match(classified.userMsg, /respuestas siguen guardadas/);
  assert.doesNotMatch(classified.userMsg, /desconocido/);
});
