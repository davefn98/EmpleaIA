import test from 'node:test';
import assert from 'node:assert/strict';
import { compareInterviewSessions, comparisonRequestSchema } from '../services/interviewComparisonService.js';
import { buildDifficultyInstruction } from '../services/interviewService.js';

const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
const sessions = ids.map((id, i) => ({ id, created_at: `2026-11-0${i + 1}`, interview_type: 'technical', difficulty_level: 'intermediate',
  interview_messages: [
    { sender: 'ai', message_content: `Pregunta ${i}`, created_at: '2026-11-01T00:00:00Z' },
    { sender: 'user', message_content: `Respuesta ${i}`, created_at: '2026-11-01T00:00:01Z', evaluation: { score: 60 + i * 20 } },
  ] }));
const validOutput = { analysis: 'Análisis del par elegido', recommendations: [1, 2, 3].map((n) => ({ finding: `Hallazgo ${n}`, action: `Acción ${n}`, reason: `Razón ${n}`, interview_ids: ids })) };

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
});

test('si falta una entrevista propia o falla consultar, no se envía información a IA', async () => {
  for (const [db, code] of [[database([sessions[0]]), 'COMPARISON_NOT_AVAILABLE'], [database(null, { code: 'ERROR' }), 'COMPARISON_QUERY_FAILED']]) {
    let calls = 0;
    await assert.rejects(compareInterviewSessions({ db, userId: 'owner-1', interviewIds: ids, generate: async () => { calls += 1; } }), { code });
    assert.equal(calls, 0);
  }
});

test('la IA no puede vincular recomendaciones a una sesión ajena o inexistente', async () => {
  const output = { ...validOutput, recommendations: validOutput.recommendations.map((r) => ({ ...r, interview_ids: ['00000000-0000-4000-8000-000000000099'] })) };
  await assert.rejects(compareInterviewSessions({ db: database(), userId: 'owner-1', interviewIds: ids, generate: async () => JSON.stringify(output) }), { code: 'COMPARISON_AI_INVALID' });
});

test('una salida incompleta de IA no se presenta como comparación exitosa', async () => {
  await assert.rejects(compareInterviewSessions({ db: database(), userId: 'owner-1', interviewIds: ids, generate: async () => '{}' }), { code: 'COMPARISON_AI_INVALID' });
});

test('la pauta de dificultad distingue fundamentos, aplicación y análisis sin imponer una carrera', () => {
  assert.match(buildDifficultyInstruction('basic'), /fundamentos/);
  assert.match(buildDifficultyInstruction('intermediate'), /resolución de problemas/);
  assert.match(buildDifficultyInstruction('advanced'), /compensaciones/);
  assert.match(buildDifficultyInstruction('advanced'), /no impongas temas de programación/);
});
