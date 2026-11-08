import test from 'node:test';
import assert from 'node:assert/strict';
import { applyManualCvEdits, createCvDocumentData, prepareCvGeneration, restoreCvDocument, restoreCvTheme, restoreLetterDocument, letterContextSnapshot, updateCvDocumentData, readStoredCvTheme } from '../src/utils/documentDrafts.js';

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

test('reabrir la copia conserva las habilidades agrupadas y los registros ocultos para editarlos de nuevo', () => {
  const original = createCvDocumentData(generated, personal);
  const copy = createCvDocumentData({
    ...original,
    technical_skills: [{ key: 'backend', label: 'Backend', skills: ['Node.js', 'API REST'] }],
    work_experience: original.work_experience.map((entry) => ({ ...entry, hidden_from_cv: true }))
  }, personal);
  const restored = restoreCvDocument(JSON.parse(JSON.stringify(copy)));
  assert.deepEqual(restored.technical_skills, ['Node.js', 'API REST']);
  assert.equal(restored.work_experience[0].hidden_from_cv, true);
  assert.equal(original.work_experience[0].hidden_from_cv, undefined);
  assert.deepEqual(original.technical_skills, generated.technical_skills);
});

test('regenerar envía los cambios del CV y conserva las secciones editadas, incluso tras reabrir el borrador', () => {
  const original = createCvDocumentData(generated, personal);
  const editor = restoreCvDocument(original);
  const edited = applyManualCvEdits(original, {
    professional_summary: 'Resumen editado',
    technical_skills: [{ key: 'backend', label: 'Backend', skills: ['API REST'] }],
    soft_skills: [],
    work_experience: [
      { id: 'nuevo', role: 'Soporte', bullets: ['Viñeta corregida'], source_evidence: ['Redacción anterior'] },
      { id: 'oculto', role: 'Experiencia oculta', hidden_from_cv: true }
    ],
    academic_background: [{ degree: 'Estudio agregado', start_date: '2025-03' }],
  });
  const reopened = JSON.parse(JSON.stringify(edited));
  const { candidate, preservedContent } = prepareCvGeneration(editor, reopened, {});
  assert.equal(candidate.personal_info.bio, 'Resumen editado');
  assert.deepEqual(candidate.skills, { technical: ['API REST'], soft: [] });
  assert.deepEqual(candidate.work_experience.map(({ role, achievements }) => [role, achievements]), [['Soporte', ['Viñeta corregida']]]);
  assert.equal(candidate.academic_background[0].degree, 'Estudio agregado');

  const regenerated = { ...generated, headline: 'Nuevo encabezado', ...preservedContent };
  assert.equal(regenerated.headline, 'Nuevo encabezado');
  assert.equal(regenerated.professional_summary, 'Resumen editado');
  assert.deepEqual(regenerated.work_experience, edited.work_experience);
  assert.deepEqual(regenerated.technical_skills, edited.technical_skills);
  assert.deepEqual(regenerated.soft_skills, []);
  assert.deepEqual(regenerated.academic_background, edited.academic_background);
  assert.equal(prepareCvGeneration(editor, regenerated, {}).candidate.personal_info.bio, 'Resumen editado');
});

test('regenerar excluye las secciones ocultas y conserva el contenido para volver a mostrarlo', () => {
  const original = createCvDocumentData(generated, personal);
  const editor = restoreCvDocument(original);
  const { candidate, preservedContent } = prepareCvGeneration(editor, original, { experience: false, skillsTech: false });
  assert.deepEqual(candidate.work_experience, []);
  assert.deepEqual(candidate.skills.technical, []);
  assert.deepEqual(candidate.certifications, []);
  assert.deepEqual(preservedContent.work_experience, original.work_experience);
  assert.deepEqual(preservedContent.technical_skills, original.technical_skills);
  assert.equal(Object.hasOwn(preservedContent, 'professional_summary'), false);
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

test('la carta requiere regenerar si cambia la vacante o el tono y admite editar solo su texto', () => {
  const restored = restoreLetterDocument({ id: 'letter-1', letter_content: 'Texto guardado', job_offer_text: 'Empresa: Acme\nPuesto Objetivo: Backend\nDescripción de la Vacante: APIs\nIntegraciones\nTono deseado: formal' });
  const generatedContext = letterContextSnapshot(restored);
  for (const field of ['company', 'targetRole', 'jobDescription', 'tone']) {
    assert.notEqual(letterContextSnapshot({ ...restored, [field]: 'Nuevo valor' }), generatedContext);
  }
  assert.equal(letterContextSnapshot({ ...restored, content: 'Texto editado manualmente' }), generatedContext);
  assert.equal(letterContextSnapshot({ ...restored, company: ' Acme ' }), generatedContext);
  assert.equal(letterContextSnapshot({ ...restored, targetRole: 'Backend' }), generatedContext);
});

test('usar la última carta como base conserva sus campos y desvincula el destino del borrador original', () => {
  const source = { id: 'letter-original', letter_content: 'Carta guardada', company: 'Acme', target_role: 'Soporte', job_description: 'Atención y seguimiento', tone: 'formal' };
  const editing = restoreLetterDocument(source);
  const copy = restoreLetterDocument(source, { asCopy: true });
  assert.equal(editing.id, source.id);
  assert.equal(copy.id, null);
  assert.deepEqual(copy, { ...editing, id: null });
  copy.content = 'Nueva carta editada';
  assert.equal(source.letter_content, 'Carta guardada');
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
