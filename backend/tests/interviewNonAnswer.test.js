import test from 'node:test';
import assert from 'node:assert/strict';
import { isExplicitInterviewNonAnswer } from '../services/interviewService.js';
test('el rechazo completo impide pedir otra aclaración', () => {
 for (const answer of ['No sé.', 'No sé qué responder', 'Lo siento, no tengo idea', 'Prefiero no responder ahora']) assert.equal(isExplicitInterviewNonAnswer(answer), true, answer);
});
test('una limitación dentro de una respuesta técnica no anula el contenido aportado', () => {
 for (const answer of ['No sé la cifra exacta, pero mediría latencia p95 y errores.', 'No conozco esa herramienta; usaría pruebas de contrato.', 'No puedo aportar métricas verificadas: propongo pruebas de integración.']) assert.equal(isExplicitInterviewNonAnswer(answer), false, answer);
});
