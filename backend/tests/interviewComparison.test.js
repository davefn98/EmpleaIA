import test from 'node:test';
import assert from 'node:assert/strict';
import { compareInterviewSessions, comparisonRequestSchema } from '../services/interviewComparisonService.js';
import { buildDifficultyInstruction, MAX_INTERVIEW_CONTEXT_CHARS } from '../services/interviewService.js';

const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
const sessions = ids.map((id, i) => ({ id, created_at: `2026-11-0${i + 1}`, interview_type: 'technical', difficulty_level: 'intermediate',
  interview_messages: [
    { sender: 'ai', message_content: `Pregunta ${i}`, created_at: '2026-11-01T00:00:00Z' },
    { sender: 'user', message_content: `Respuesta ${i}`, created_at: '2026-11-01T00:00:01Z', evaluation: { score: 60 + i * 20 } },
  ] }));
const validOutput = { analysis: 'Análisis del par elegido', recommendations: [1, 2, 3].map((n) => ({ finding: `Hallazgo ${n}`, action: `Acción ${n}`, reason: `Razón ${n}`, session_refs: ['Entrevista 1', 'Entrevista 2'] })) };

function database(data = sessions, error = null) {
  const filters = [];
  return { filters, from(table) {
    assert.equal(table, 'interviews');
    return { select() { return this; }, eq(...args) { filters.push(['eq', ...args]); return this; }, in(...args) { filters.push(['in', ...args]); return this; },
      then(resolve, reject) { return Promise.resolve({ data, error }).then(resolve, reject); } };
  } };
}

test('comparar exige IDs distintos y dos o tres sesiones', () => {
  assert.equal(comparisonRequestSchema.safeParse({ interviewIds: ids }).success, true);
  assert.equal(comparisonRequestSchema.safeParse({ interviewIds: [ids[0], ids[0]] }).success, false);
  assert.equal(comparisonRequestSchema.safeParse({ interviewIds: [ids[0]] }).success, false);
});

test('comparación usa ownership, sesiones elegidas y puntuaciones calculadas antes de llamar a IA', async () => {
  const db = database([...sessions].reverse());
  let prompt;
  const result = await compareInterviewSessions({ db, userId: 'owner-1', interviewIds: ids, generate: async (input) => { prompt = input.messages[1].content; return { content: JSON.stringify(validOutput) }; } });
  assert.deepEqual(db.filters[0], ['eq', 'profile_id', 'owner-1']);
  assert.deepEqual(db.filters[1], ['in', 'id', ids]);
  assert.equal(result.scoreDifference, 20);
  assert.equal(result.interviews[0].id, ids[0]);
  assert.match(prompt, /Respuesta 0/);
  assert.match(prompt, /Respuesta 1/);
  assert.equal(result.recommendations.length, 3);
  assert.deepEqual(result.recommendations[0].interview_ids, ids);
});

test('tres sesiones largas se comparan con extractos de todas sus preguntas y sin nombres ni IDs en el prompt', async () => {
  const thirdId = '00000000-0000-4000-8000-000000000003';
  const longText = 'Texto con "comillas" y \\ barras. '.repeat(500);
  const profiles = [
    'Candidato: David Ejemplo. Carrera: Sistemas. Puesto objetivo: Desarrollador .NET. Tech: C#',
    JSON.stringify({ candidate: { name: 'Ana Ejemplo', bio: 'Biografía privada' }, target_role: 'Atención al Cliente', target_job_description: longText }),
    JSON.stringify({ legacy_context: 'Candidato: María Ejemplo. Carrera: Sistemas. Puesto objetivo: Soporte. Tech: Git' }),
  ];
  const data = [...sessions, { ...sessions[0], id: thirdId, created_at: '2026-11-03' }].map((session, i) => ({
    ...session,
    profile_summary: profiles[i],
    interview_messages: Array.from({ length: 5 }, (_, j) => [
      { sender: 'ai', message_content: `Ana, pregunta ${j + 1}: ${longText}`, created_at: `2026-11-01T00:0${j}:00Z` },
      { sender: 'user', message_content: `David Ejemplo, María, ${session.id}: ${longText}`, created_at: `2026-11-01T00:0${j}:01Z`, evaluation: { score: 85 + i, general_comment: longText, improvements: [longText] } },
    ]).flat(),
  }));
  const result = await compareInterviewSessions({ db: database(data.reverse()), userId: 'owner-1', interviewIds: [thirdId, ...ids], generate: async ({ messages, responseSchema }) => {
    const context = messages[1].content.split('\n')[1];
    const payload = JSON.parse(context);
    assert.ok(context.length <= MAX_INTERVIEW_CONTEXT_CHARS);
    assert.doesNotMatch(context, /David|Ana|María|Biografía privada|00000000-0000/);
    assert.deepEqual(payload.map(({ ref, role, pairs }) => [ref, role, pairs.length]), [
      ['Entrevista 1', 'Desarrollador .NET', 5], ['Entrevista 2', 'Atención al Cliente', 5], ['Entrevista 3', 'Soporte', 5],
    ]);
    assert.ok(payload.every(({ pairs }) => pairs.every(({ answer, score }) => answer.endsWith('…') && score >= 85)));
    assert.deepEqual(responseSchema.properties.recommendations.items.properties.session_refs.items.enum, payload.map(({ ref }) => ref));
    return JSON.stringify({ ...validOutput, analysis: `Entrevista 1: David. Entrevista 2: ${ids[1]}.` });
  } });
  assert.equal(result.scoreDifference, 2);
  assert.doesNotMatch(result.analysis, /David|00000000-0000/);
});

test('si falta una entrevista propia o falla consultar, no se envía información a IA', async () => {
  for (const [db, code] of [[database([sessions[0]]), 'COMPARISON_NOT_AVAILABLE'], [database(null, { code: 'ERROR' }), 'COMPARISON_QUERY_FAILED']]) {
    let calls = 0;
    await assert.rejects(compareInterviewSessions({ db, userId: 'owner-1', interviewIds: ids, generate: async () => { calls += 1; } }), { code });
    assert.equal(calls, 0);
  }
});

test('la IA no puede vincular recomendaciones a una sesión ajena o inexistente', async () => {
  const output = { ...validOutput, recommendations: validOutput.recommendations.map((r) => ({ ...r, session_refs: ['Entrevista 3'] })) };
  await assert.rejects(compareInterviewSessions({ db: database(), userId: 'owner-1', interviewIds: ids, generate: async () => JSON.stringify(output) }), { code: 'COMPARISON_AI_INVALID' });
});

test('una salida incompleta de IA no se presenta como comparación exitosa', async () => {
  await assert.rejects(compareInterviewSessions({ db: database(), userId: 'owner-1', interviewIds: ids, generate: async () => '{}' }), { code: 'COMPARISON_AI_INVALID' });
});

test('la pauta de dificultad distingue fundamentos, aplicación y análisis sin imponer una carrera', () => {
  assert.match(buildDifficultyInstruction('basic'), /fundamentos/);
  assert.match(buildDifficultyInstruction('intermediate'), /resolución de problemas/);
  const advanced = buildDifficultyInstruction('advanced');
  assert.match(advanced, /cada pregunta principal, incluida la primera/);
  assert.match(advanced, /comparar al menos dos alternativas viables y justificar/);
  assert.match(advanced, /riesgos y las compensaciones/);
  assert.match(advanced, /ambas alternativas sean profesionalmente aceptables/);
  assert.match(advanced, /cada una tenga una ventaja y un costo/);
  assert.match(advanced, /procedimiento habitual, reescribe el escenario/);
  assert.match(advanced, /no impongas temas de programación/);
});
