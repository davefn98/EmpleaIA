import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQAPairs, classifyOpenAIError, getCloseInterviewTargetStatus } from '../services/interviewService.js';

test('buildQAPairs reconstruye pregunta y respuesta', () => {
  const pairs = buildQAPairs([{ sender: 'ai', message_content: 'Pregunta' }, { sender: 'user', message_content: 'Respuesta', id: 'm1' }]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].question, 'Pregunta');
  assert.equal(pairs[0].answer, 'Respuesta');
});

test('classifyOpenAIError no expone detalles para cuota', () => {
  const result = classifyOpenAIError({ status: 429, message: 'quota exceeded' });
  assert.equal(result.errorCode, 'quota');
  assert.equal(result.type, 'rate_limit');
});

test('getCloseInterviewTargetStatus diferencia terminar y abandonar', () => {
  assert.equal(getCloseInterviewTargetStatus({ action: 'finish', hasAnswers: true }), 'completed_early');
  assert.equal(getCloseInterviewTargetStatus({ action: 'finish', hasAnswers: false }), 'failed_to_start');
  assert.equal(getCloseInterviewTargetStatus({ action: 'abandon', hasAnswers: true }), 'abandoned');
  assert.equal(getCloseInterviewTargetStatus({ action: 'abandon', hasAnswers: false }), 'abandoned');
});
