import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeImportedExperience, mergeImportedPersonal } from '../src/utils/cvImport.js';

test('La importación conserva el puesto, vacante y email autenticado existentes', () => {
  const previous = { target_role: 'Backend AWS', target_job_description: 'Integracion de APIs y AWS.', email: 'login@example.test', first_name: 'Anterior' };
  const imported = { first_name: 'Ana', target_role: 'Histórico', target_job_description: '', email: 'cv@example.test' };
  const result = mergeImportedPersonal(previous, imported);
  assert.equal(result.first_name, 'Ana');
  assert.equal(result.target_role, previous.target_role);
  assert.equal(result.target_job_description, previous.target_job_description);
  assert.equal(result.email, previous.email);
  assert.deepEqual(previous, { target_role: 'Backend AWS', target_job_description: 'Integracion de APIs y AWS.', email: 'login@example.test', first_name: 'Anterior' });
});

test('Campos ausentes no borran datos y vacante explícita llena un destino vacío', () => {
  const result = mergeImportedPersonal({ phone: '555', career: 'Ingenieria', target_role: '', target_job_description: '' }, { phone: '', career: '', target_role: 'Backend', target_job_description: 'Vacante explicita' });
  assert.equal(result.phone, '555');
  assert.equal(result.career, 'Ingenieria');
  assert.equal(result.target_role, 'Backend');
  assert.equal(result.target_job_description, 'Vacante explicita');
});

test('El editor muestra todas las responsabilidades aunque lleguen como achievements', () => {
  const descriptions = Array.from({ length: 7 }, (_, index) => `Responsabilidad de prueba numero ${index + 1}`);
  const result = completeImportedExperience({ description: descriptions[0], achievements: descriptions });
  assert.equal(result.description.split('\n').length, 7);
  for (const line of descriptions) assert.ok(result.description.includes(line));
});
