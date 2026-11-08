import assert from 'node:assert/strict';
import test from 'node:test';
import { canSubmitPilotSatisfaction, summarizePilot } from '../src/utils/pi2Validation.js';
import { flushFinishedLegacyTimer } from '../src/utils/pi2TaskTimer.js';
import { completeDocumentVisit, markDocumentGenerated, startDocumentVisit } from '../src/utils/documentPreparationTiming.js';

test('I3 empareja métodos por participante y requiere las tres tareas para el total', () => {
  const timings = ['cv', 'letter', 'interview'].flatMap((task) => [
    { participant_code: 'A', task, method: 'manual', seconds: '120' },
    { participant_code: 'A', task, method: 'platform', seconds: '48' },
  ]);
  timings.push(
    { participant_code: 'B', task: 'cv', method: 'manual', seconds: 60 },
    { participant_code: 'B', task: 'cv', method: 'platform', seconds: 60 },
    { participant_code: 'C', task: 'letter', method: 'manual', seconds: 99 },
    { participant_code: 'D', task: 'letter', method: 'platform', seconds: 12 },
  );

  const metrics = summarizePilot([], timings, [], []);
  assert.deepEqual(metrics.preparationTotal, { n: 1, value: 60 });
  assert.equal(metrics.preparation.find(({ task }) => task === 'cv').value, 40);
  assert.equal(metrics.preparation.find(({ task }) => task === 'letter').n, 1);
});

test('I4 pondera cada intento con resultado y conserva los errores por separado', () => {
  const result = summarizePilot([], [], [
    { document_type: 'cv', duration_ms: 12000, success: true },
    { document_type: 'cv', duration_ms: 18000, success: true },
    { document_type: 'letter', duration_ms: 33000, success: true },
    { document_type: 'letter', duration_ms: 60000, success: false },
    { document_type: 'profile_import', duration_ms: 55000, success: true },
    { document_type: 'cv_preparation', duration_ms: 120000, success: true },
    { document_type: 'letter_pdf', duration_ms: 3000, success: false },
  ], []);
  assert.deepEqual(result.generation, { value: 21, n: 3, failures: 1 });
  assert.deepEqual(result.cv, { value: 15, n: 2, failures: 0 });
  assert.deepEqual(result.letter, { value: 33, n: 1, failures: 1 });
  assert.deepEqual(result.profileImport, { value: 55, n: 1, failures: 0 });
});

test('un recorrido requiere una generación y se cierra una sola vez desde la entrada', () => {
  const cv = startDocumentVisit('A', 'cv', 1000);
  const letter = startDocumentVisit('A', 'letter', 5000);
  assert.equal(completeDocumentVisit(cv), null);
  markDocumentGenerated(cv, false);
  markDocumentGenerated(cv, true);
  assert.equal(completeDocumentVisit(cv).startedAt, 1000);
  assert.equal(cv.regeneration, false);
  assert.equal(completeDocumentVisit(cv), null);
  assert.equal(completeDocumentVisit(letter), null);
});

test('solo sincroniza mediciones anteriores terminadas y conserva el final al reintentar', async (context) => {
  const timer = { task: 'cv', method: 'platform', build: 'pilot', startedAt: 1000, finishedAt: 45000 };
  const keyA = 'empleaia_pi2_timer_A';
  const keyB = 'empleaia_pi2_timer_B';
  const values = new Map([
    [keyA, JSON.stringify(timer)],
    [keyB, JSON.stringify({ ...timer, finishedAt: null })],
  ]);
  const existing = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key) => values.get(key), removeItem: (key) => values.delete(key),
  } });
  context.after(() => {
    if (existing) Object.defineProperty(globalThis, 'sessionStorage', existing);
    else delete globalThis.sessionStorage;
  });

  await flushFinishedLegacyTimer({ rpc: () => assert.fail('La medición sigue abierta') }, 'B');
  await assert.rejects(flushFinishedLegacyTimer({ rpc: async () => ({ error: new Error('Red') }) }, 'A'), /Red/);
  assert.equal(values.get(keyA), JSON.stringify(timer));
  await flushFinishedLegacyTimer({ rpc: async (name, data) => {
    assert.equal(name, 'pi2_save_timed_task');
    assert.equal(data.p_started_at, new Date(timer.startedAt).toISOString());
    assert.equal(data.p_finished_at, new Date(timer.finishedAt).toISOString());
    return { error: null };
  } }, 'A');
  assert.equal(values.has(keyA), false);
  assert.equal(values.has(keyB), true);
});

test('I5 se habilita con dos documentos generados y la respuesta posterior', () => {
  const participant = { confidence_after: 0 };
  const attempts = [
    { document_type: 'cv', success: true },
    { document_type: 'profile_import', success: true },
    { document_type: 'letter', success: false },
  ];
  assert.equal(canSubmitPilotSatisfaction(participant, attempts, []), false);
  attempts.push({ document_type: 'letter', success: true });
  assert.equal(canSubmitPilotSatisfaction(participant, attempts, []), true);
  assert.equal(canSubmitPilotSatisfaction({ confidence_after: null }, attempts, []), false);
  const historicalTimes = ['cv', 'letter', 'interview'].map((task) => ({ task, method: 'platform' }));
  assert.equal(canSubmitPilotSatisfaction(participant, [], historicalTimes), true);
});

test('I5 e I6 conservan respuestas cero y excluyen faltantes; los indicadores de proyecto exigen respaldo', () => {
  const result = summarizePilot([
    { satisfaction: 0, confidence_before: 0, confidence_after: 4, interview_id: 'session-a' },
    { satisfaction: 10, confidence_before: 6, confidence_after: 0, interview_id: 'session-b' },
    { satisfaction: null, confidence_before: 7, confidence_after: null },
    { confidence_before: 1, confidence_after: 10, interview_id: null },
  ], [], [], [
    { indicator: 'I1', completed: true, reference: 'Diagnóstico' },
    { indicator: 'I1', completed: true, reference: ' ' },
  ]);

  assert.equal(result.satisfaction.value, 5);
  assert.equal(result.satisfaction.n, 2);
  assert.equal(result.satisfaction.distribution[0], 1);
  assert.deepEqual(result.confidence, { value: -1, n: 2, before: 3, after: 2 });
  assert.deepEqual(result.evidence.I1, { n: 1, total: 2, value: 50 });
  assert.equal(result.evidence.I7.value, null);
});
