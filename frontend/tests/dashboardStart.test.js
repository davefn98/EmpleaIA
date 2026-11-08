import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardStart, latestCvDraft } from '../src/utils/dashboardStart.js';

const emptyStats = { totalCvs: 0, totalLetters: 0, totalInterviews: 0 };
const completeProfile = { first_name: 'Ana', last_name: 'Prueba', phone: '555123456', email: 'ana@example.test' };

test('Inicio orienta una cuenta vacía según los datos básicos del perfil', () => {
  const incomplete = dashboardStart({ ...completeProfile, phone: '', contact_email: '' }, emptyStats, null);
  assert.equal(incomplete.stage, 'profile');
  assert.deepEqual(incomplete.missing.map(({ text }) => text), ['Escribe tu teléfono.', 'Escribe tu correo de contacto.']);
  assert.equal(dashboardStart(completeProfile, emptyStats, null).stage, 'first-cv');
  assert.equal(dashboardStart(null, emptyStats, null).stage, 'profile');
});

test('el primer documento o entrevista activa el dashboard aunque aún no haya puntuaciones', () => {
  for (const counter of ['totalCvs', 'totalLetters', 'totalInterviews']) {
    const stats = { ...emptyStats, [counter]: 1, avgScore: null };
    assert.deepEqual(dashboardStart(completeProfile, stats, null), { stage: 'active', action: 'Crear un CV' });
  }
  assert.equal(dashboardStart(completeProfile, { ...emptyStats, totalCvs: 1 }, 'draft').action, 'Continuar mi CV');
});

test('Continuar mi CV selecciona el borrador modificado más recientemente', () => {
  const cvs = [
    { id: 'download', status: 'downloaded', created_at: '2026-11-05' },
    { id: 'newer', status: 'draft', created_at: '2026-11-04' },
    { id: 'edited', status: 'draft', created_at: '2026-10-28', updated_at: '2026-11-05' },
  ];
  assert.equal(latestCvDraft(cvs).id, 'edited');
  assert.equal(latestCvDraft([cvs[0]]), null);
});
