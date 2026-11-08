import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQAPairs, classifyOpenAIError, formatAdvancedNextQuestion, getCloseInterviewTargetStatus } from '../services/interviewService.js';

test('buildQAPairs reconstruye pregunta y respuesta', () => {
  const pairs = buildQAPairs([{ sender: 'ai', message_content: 'Pregunta' }, { sender: 'user', message_content: 'Respuesta', id: 'm1' }]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].question, 'Pregunta');
  assert.equal(pairs[0].answer, 'Respuesta');
});

test('la siguiente pregunta avanzada requiere un escenario y dos acciones distintas', () => {
  const scenario = 'Un cliente necesita una solución urgente, pero el diagnóstico completo demora';
  assert.equal(formatAdvancedNextQuestion({ scenario, options: ['ofrecer una solución temporal', 'escalar el caso para investigar la causa'] }),
    `${scenario}. Puedes ofrecer una solución temporal o escalar el caso para investigar la causa. ¿Cuál elegirías y por qué, considerando las ventajas y los riesgos de ambas opciones?`);
  assert.equal(formatAdvancedNextQuestion('¿Cómo atenderías a un cliente insatisfecho?'), null);
  assert.equal(formatAdvancedNextQuestion({ scenario, options: ['escalar el caso'] }), null);
  assert.equal(formatAdvancedNextQuestion({ scenario, options: ['escalar el caso', ' ESCALAR EL CASO. '] }), null);
  assert.equal(formatAdvancedNextQuestion({ scenario: ' ', options: ['orientar al cliente', 'escalar el caso'] }), null);
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
