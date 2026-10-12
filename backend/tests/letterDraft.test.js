import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
const { letterUpdateSchema } = await import('../validators/letterValidator.js');
const { updateUserLetter } = await import('../services/letterService.js');

test('guardar una carta conserva contenido, vacante completa y tono con ownership', async () => {
  const fields = { status: 'draft', letter_content: 'Texto editado', job_offer_text: 'Oferta guardada', company: 'Acme', target_role: 'Backend', job_description: 'APIs\nIntegraciones', tone: 'formal' };
  const parsed = letterUpdateSchema.parse(fields);
  assert.deepEqual(parsed, fields);
  let saved;
  const filters = [];
  const db = { from(table) {
    assert.equal(table, 'cover_letters');
    return { update(value) { saved = value; return this; }, eq(...args) { filters.push(args); return this; }, select() { return this; }, async single() { return { data: { id: 'letter-1', ...saved }, error: null }; } };
  } };
  await updateUserLetter({ db, id: 'letter-1', userId: 'user-1', fields: parsed });
  assert.equal(saved.job_description, 'APIs\nIntegraciones');
  assert.equal(saved.letter_content, 'Texto editado');
  assert.equal(saved.tone, 'formal');
  assert.deepEqual(filters, [['id', 'letter-1'], ['profile_id', 'user-1']]);
});
