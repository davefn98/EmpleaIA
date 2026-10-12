import test from 'node:test';
import assert from 'node:assert/strict';
import { createCvDocumentData, restoreCvDocument, restoreCvTheme, restoreLetterDocument, updateCvDocumentData, readStoredCvTheme } from '../src/utils/documentDrafts.js';

const generated = {
  headline: 'Backend Engineer | AWS', professional_summary: 'Resumen de la versión guardada',
  work_experience: [{ source_id: 'exp-1', company: 'Empresa original', role: 'Engineer', bullets: ['Responsabilidad uno', 'Responsabilidad dos'] }],
  academic_background: [], technical_skills: { backend: ['Node.js'], cloud: ['AWS'] },
  technical_skill_order: ['cloud', 'backend'], soft_skills: ['Comunicación'], certifications: ['Certificación guardada']
};
const personal = { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', phone: '123', career: 'Ingeniería', target_role: 'Backend Engineer' };

test('el borrador restaura datos personales y contenido propios aunque cambie el perfil', () => {
  const saved = createCvDocumentData(generated, personal, { target_job_description: 'Vacante original', cv_focus: 'técnico' });
  const restored = restoreCvDocument(saved);
  assert.equal(restored.first_name, 'Ada');
  assert.equal(restored.bio, generated.professional_summary);
  assert.equal(restored.target_job_description, 'Vacante original');
  assert.equal(restored.cv_focus, 'técnico');
  assert.equal(restored.work_experience[0].description, 'Responsabilidad uno\nResponsabilidad dos');
  assert.deepEqual(restored.technical_skills, ['Node.js', 'AWS']);
  assert.equal(restored.location, '');
});

test('guardar sin editar conserva redacción IA, bullets y categorías priorizadas', () => {
  const saved = createCvDocumentData(generated, personal);
  const updated = updateCvDocumentData(saved, restoreCvDocument(saved));
  assert.deepEqual(updated, saved);
});

test('editar responsabilidades y contacto modifica solo el documento', () => {
  const saved = createCvDocumentData(generated, personal);
  const editor = restoreCvDocument(saved);
  editor.phone = '456';
  editor.work_experience[0].description = 'Texto corregido\nSegunda responsabilidad';
  const updated = updateCvDocumentData(saved, editor);
  assert.equal(updated.personal_info.phone, '456');
  assert.deepEqual(updated.work_experience[0].bullets, ['Texto corregido', 'Segunda responsabilidad']);
  assert.equal(updated.work_experience[0].description, undefined);
  assert.equal(saved.personal_info.phone, '123');
  assert.deepEqual(saved.work_experience[0].bullets, generated.work_experience[0].bullets);
});

test('un borrador antiguo no inventa datos personales que no fueron guardados', () => {
  const restored = restoreCvDocument(generated);
  assert.equal(restored.first_name, '');
  assert.equal(restored.email, '');
  assert.equal(restored.target_role, generated.headline);
});

test('un diseño parcial no hereda secciones ocultas de otro documento', () => {
  const saved = restoreCvTheme({ template: 'tech', visibleSections: { phone: false }, sectionOrder: ['skills', 'summary'] });
  assert.equal(saved.visibleSections.phone, false);
  assert.equal(saved.visibleSections.email, true);
  assert.deepEqual(saved.sectionOrder, ['skills', 'summary']);
  assert.equal(restoreCvTheme(null).template, 'classic');
});

test('editar carta conserva el texto y la vacante completa aunque tenga varias líneas', () => {
  const restored = restoreLetterDocument({ id: 'letter-1', letter_content: 'Carta guardada', job_offer_text: 'Empresa: Acme\nPuesto Objetivo: Backend\nDescripción de la Vacante: APIs\nIntegraciones\nTono deseado: formal' });
  assert.equal(restored.content, 'Carta guardada');
  assert.equal(restored.company, 'Acme');
  assert.equal(restored.jobDescription, 'APIs\nIntegraciones');
  assert.equal(restored.tone, 'formal');
});

test('carta con oferta nula se puede abrir sin una excepción ni datos del perfil', () => {
  assert.equal(restoreLetterDocument({ letter_content: 'Carta', job_offer_text: null }).content, 'Carta');
  assert.equal(restoreLetterDocument({ company: '', job_offer_text: 'Empresa: antigua' }).company, '');
});

test('preferencias locales dañadas o nulas no dejan la página en blanco', () => {
  const theme = readStoredCvTheme({ getItem: (key) => key.endsWith('sectionOrder') ? 'null' : key.endsWith('visibleSections') ? '{json roto' : null });
  assert.deepEqual(theme.sectionOrder, ['summary', 'experience', 'education', 'projects', 'skills']);
  assert.equal(theme.visibleSections.email, true);
  assert.doesNotThrow(() => readStoredCvTheme({ getItem() { throw new Error('Storage unavailable'); } }));
});
