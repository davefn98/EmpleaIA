import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
const { letterSaveSchema, letterUpdateSchema } = await import('../validators/letterValidator.js');
const { saveLetterManually, updateUserLetter } = await import('../services/letterService.js');

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

test('guardar una edición manual como copia conserva el texto y los datos del borrador original', async () => {
  const original = Object.freeze({
    id: 'letter-original', profile_id: 'user-1', letter_content: 'Estimado equipo:',
    document_title: 'Carta para Backend en Acme', status: 'draft',
    company: 'Acme', target_role: 'Backend', job_description: 'APIs\nIntegraciones', tone: 'formal',
    job_offer_text: 'Empresa: Acme\nPuesto Objetivo: Backend\nDescripción de la Vacante: APIs\nIntegraciones\nTono deseado: formal',
  });
  const letters = new Map([[original.id, original]]);
  const db = { from(table) {
    assert.equal(table, 'cover_letters');
    return {
      insert(payload) {
        const copy = { id: 'letter-copy', ...payload };
        letters.set(copy.id, copy);
        return { select: () => ({ single: async () => ({ data: copy, error: null }) }) };
      },
    };
  } };
  const input = letterSaveSchema.parse({
    profileId: 'user-1', letterContent: 'Estimado equipo:\n\nGracias por considerar mi postulación.',
    documentTitle: 'Carta para Backend en Acme · Copia', status: 'draft', company: original.company,
    targetRole: original.target_role, jobDescription: original.job_description, tone: original.tone, jobOfferText: original.job_offer_text,
  });

  const { letterId } = await saveLetterManually({ db, ...input });
  assert.notEqual(letterId, original.id);
  assert.equal(letters.size, 2);
  assert.deepEqual(letters.get(original.id), original);
  assert.deepEqual(letters.get(letterId), {
    ...original, id: letterId, letter_content: input.letterContent, document_title: input.documentTitle,
  });
});
