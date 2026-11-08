import test from 'node:test';
import assert from 'node:assert/strict';
import { cvEditorSnapshot } from '../src/utils/documentDrafts.js';
import { cvDraftPath, letterDraftPath, readDocumentDraftPath } from '../src/utils/documentDraftRoute.js';
import { canNavigate, protectUnsavedChanges } from '../src/utils/unsavedChanges.js';
import { interviewScoreChange, orderInterviewsByDate } from '../src/utils/interviewComparison.js';
import { missingProfileSaveFields, profileSaveIssues } from '../src/utils/profileSaveIssues.js';

test('la comparación del editor ignora metadatos de la base pero detecta contacto y certificaciones editados', () => {
  const source = { id: 'user-1', updated_at: 'ayer', first_name: 'Ada', linkedin: 'original', certifications: ['Uno'] };
  const editor = cvEditorSnapshot(source);
  assert.deepEqual(editor, cvEditorSnapshot({ ...source, id: 'otro', updated_at: 'hoy' }));
  assert.notDeepEqual(editor, cvEditorSnapshot({ ...source, linkedin: 'cambiado' }));
  assert.notDeepEqual(editor, cvEditorSnapshot({ ...source, certifications: ['Dos'] }));
});

test('cancelar la salida impide navegar y retirar el aviso permite navegar tras guardar', () => {
  const target = new EventTarget();
  const dispose = protectUnsavedChanges(target, () => false);
  assert.equal(canNavigate(target, '/drafts'), false);
  const reload = new Event('beforeunload', { cancelable: true });
  target.dispatchEvent(reload);
  assert.equal(reload.defaultPrevented, true);
  dispose();
  assert.equal(canNavigate(target, '/drafts'), true);
  const savedReload = new Event('beforeunload', { cancelable: true });
  target.dispatchEvent(savedReload);
  assert.equal(savedReload.defaultPrevented, false);
  const discard = protectUnsavedChanges(target, () => true);
  assert.equal(canNavigate(target, '/drafts'), true);
  discard();
});

test('recargar la ruta distingue una carta guardada, un CV y una copia de un documento nuevo', () => {
  assert.deepEqual(readDocumentDraftPath(cvDraftPath('cv-original')), { type: 'cv', id: 'cv-original', asCopy: false });
  assert.deepEqual(readDocumentDraftPath(cvDraftPath('cv-original', true)), { type: 'cv', id: 'cv-original', asCopy: true });
  assert.deepEqual(readDocumentDraftPath(letterDraftPath('carta-guardada')), { type: 'cover-letter', id: 'carta-guardada', asCopy: false });
  assert.deepEqual(readDocumentDraftPath(letterDraftPath('carta-guardada', true)), { type: 'cover-letter', id: 'carta-guardada', asCopy: true });
  assert.equal(readDocumentDraftPath('/documents/cv'), null);
  assert.equal(readDocumentDraftPath('/documents/cv/customize'), null);
  assert.equal(readDocumentDraftPath('/documents/cover-letter'), null);
});

test('la evolución usa orden temporal sin alterar la selección y distingue aumento, igualdad y descenso', () => {
  const old = { avg_score: 60, created_at: '2026-11-01' };
  const recent = { avg_score: 80, created_at: '2026-11-04' };
  const selection = [recent, old];
  assert.equal(interviewScoreChange(selection), 20);
  assert.equal(selection[0], recent);
  assert.equal(interviewScoreChange([old, { ...recent, avg_score: 60 }]), 0);
  assert.equal(interviewScoreChange([old, { ...recent, avg_score: 40 }]), -20);
  assert.equal(interviewScoreChange([old, { ...recent, avg_score: null }]), null);
});

test('las columnas comparadas se ordenan por hora de finalización y usan la creación en registros antiguos', () => {
  const intermediate = { id: 'intermedia', avg_score: 85, created_at: '2026-11-07T21:55:00Z' };
  const advanced = { id: 'avanzada', avg_score: 88, created_at: '2026-11-07T21:54:00Z', completed_at: '2026-11-07T21:57:00Z' };
  const selection = [advanced, intermediate];
  assert.deepEqual(orderInterviewsByDate(selection), [intermediate, advanced]);
  assert.equal(selection[0], advanced);
  assert.equal(interviewScoreChange(selection), 3);
});
test('El error de guardado identifica el campo y la sección del formulario', () => {
  const issues = profileSaveIssues([
    { code: 'too_small', minimum: 1, path: ['profile', 'first_name'] },
    { code: 'invalid_string', path: ['profile', 'contact_email'] },
    { code: 'invalid_string', path: ['work_experience', 0, 'start_date'] },
    { code: 'too_small', minimum: 1, path: ['academic_background', 1, 'degree'] },
    { code: 'unrecognized_keys', path: ['profile'], keys: ['contact_email'] },
  ]);
  assert.deepEqual(issues, [
    { tab: 'personal', text: 'Escribe tus nombres.' },
    { tab: 'personal', text: 'Revisa que tu correo de contacto esté bien escrito.' },
    { tab: 'trajectory', text: 'Experiencia 1. Revisa la fecha de inicio. Puedes escribir, por ejemplo, marzo de 2025.' },
    { tab: 'trajectory', text: 'Estudio 2. Escribe la carrera o el programa de estudios.' },
  ]);
});

test('El guardado enumera los campos obligatorios vacíos de cada registro agregado', () => {
  const profile = {
    firstName: 'Ana', lastName: 'Pérez', phone: '999000000', contactEmail: 'ana@example.test',
    work: [], academic: [],
  };
  assert.deepEqual(missingProfileSaveFields(profile), []);
  assert.deepEqual(
    missingProfileSaveFields({ ...profile, phone: '', contactEmail: ' ' }).map(({ text }) => text),
    ['Escribe tu teléfono.', 'Escribe tu correo de contacto.'],
  );
  const missing = missingProfileSaveFields({
    ...profile, lastName: ' ',
    work: [{ company: '', role: '', start_date: '2025-03' }],
    academic: [{ institution: '', degree: '', start_date: '' }],
  });
  assert.deepEqual(missing.map(({ text }) => text), [
    'Escribe tus apellidos.',
    'Experiencia 1. Escribe el nombre de la empresa.',
    'Experiencia 1. Escribe el cargo que tuviste.',
    'Estudio 1. Escribe el nombre de la institución.',
    'Estudio 1. Escribe la carrera o el programa de estudios.',
    'Estudio 1. Escribe la fecha de inicio. Por ejemplo, marzo de 2025.',
  ]);
});
