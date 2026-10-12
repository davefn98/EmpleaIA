import test from 'node:test';
import assert from 'node:assert/strict';
import { isFinishInterviewVoiceCommand } from '../src/utils/interviewVoiceCommands.js';
test('una orden completa de voz cierra la sesión aunque incluya cortesía o puntuación', () => {
 for (const text of ['Termina la entrevista.', 'Por favor, finaliza esta entrevista ahora.', 'Quiero cerrar la entrevista por favor']) assert.equal(isFinishInterviewVoiceCommand(text), true, text);
});
test('una negativa, una cita o una respuesta extensa no se confunden con una orden de cierre', () => {
 for (const text of ['', 'No quiero terminar la entrevista', 'El candidato dijo termina la entrevista', 'Termina la entrevista y después pregunta sobre AWS', 'Puedo terminar la entrevista ahora']) assert.equal(isFinishInterviewVoiceCommand(text), false, text);
});
