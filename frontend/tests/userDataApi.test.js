import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUserSnapshot, normalizeProfile } from '../src/utils/userData.js';

test('normalizeUserSnapshot completa colecciones ausentes', () => {
  const result = normalizeUserSnapshot({ profile: { id: 'u1' } });
  assert.deepEqual(result.academic, []);
  assert.deepEqual(result.work, []);
  assert.deepEqual(result.cvs, []);
  assert.deepEqual(result.letters, []);
  assert.deepEqual(result.interviews, []);
});

test('normalizeUserSnapshot conserva colecciones válidas', () => {
  const result = normalizeUserSnapshot({ cvs: [{ id: 'cv1' }], letters: [{ id: 'l1' }] });
  assert.equal(result.cvs[0].id, 'cv1');
  assert.equal(result.letters[0].id, 'l1');
});

test('normalizeUserSnapshot expone profile null cuando no hay perfil (señal de perfil inexistente)', () => {
  const result = normalizeUserSnapshot({});
  assert.equal(result.profile, null);
});

test('normalizeProfile: expone campos virtuales de presentación y mantiene datos crudos intactos', () => {
  const profile = { first_name: '', last_name: '', career: '', target_role: '', email: 'test@example.com' };
  const normalized = normalizeProfile(profile);

  // Propiedades calculadas de presentación
  assert.equal(normalized.display_name, 'Estudiante');
  assert.equal(normalized.display_career, 'Estudiante');
  assert.equal(normalized.display_target_role, 'Estudiante');

  // Propiedades reales originales no se modifican (se mantienen vacías para no ensuciar inputs del CV)
  assert.equal(normalized.first_name, '');
  assert.equal(normalized.career, '');
  assert.equal(normalized.target_role, '');
});

test('normalizeProfile: si hay nombre real, display_name usa nombre completo', () => {
  const profile = { first_name: 'Jose', last_name: 'Fernandez', career: 'Sistemas', target_role: 'Developer' };
  const normalized = normalizeProfile(profile);

  assert.equal(normalized.display_name, 'Jose Fernandez');
  assert.equal(normalized.display_career, 'Sistemas');
  assert.equal(normalized.display_target_role, 'Developer');
});

test('normalizeProfile conserva la descripcion objetivo y sus saltos de linea', () => {
  const description = 'Funciones:\n- Desarrollar APIs\n\nRequisitos:\n- Node.js';
  const normalized = normalizeProfile({ target_job_description: description });

  assert.equal(normalized.target_job_description, description);
});
