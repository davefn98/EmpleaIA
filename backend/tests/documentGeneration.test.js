import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
const { generateLetter } = await import('../services/letterService.js');
const { fullProfileUpdateSchema } = await import('../validators/profileValidator.js');

function database({ readError = false, saveError = false } = {}) {
  const saved = [];
  return { saved, from(table) {
    let payload;
    const value = () => ({ data: table === 'academic_background'
      ? [{ degree: 'Técnico', institution: 'Instituto de prueba', description: 'Proyecto académico de APIs', start_date: '2020-01-01' }]
      : [{ company: 'Empresa de prueba', role: 'Backend', description: 'Primera responsabilidad\nSegunda responsabilidad\nSéptima responsabilidad', achievements: ['Logro declarado'] }], error: readError ? { code: 'XX000' } : null });
    return { select() { return this; }, eq() { return this; }, insert(data) { payload = data; saved.push(data); return this; },
      then(resolve, reject) { return Promise.resolve(value()).then(resolve, reject); },
      async single() { return table === 'profiles' ? { data: { first_name: 'Ada', last_name: 'Lovelace', career: 'Sistemas', technical_skills: ['Node.js'], certifications: ['Certificación declarada'] }, error: null }
        : { data: saveError ? null : { id: 'letter-1', ...payload }, error: saveError ? { code: 'XX000' } : null }; },
    };
  } };
}
const request = { userId: 'user-1', profileId: 'user-1', targetRole: 'Backend', jobDescription: 'APIs con Node.js' };

test('la carta recibe responsabilidades completas, formación y certificaciones de la fuente', async () => {
  const db = database();
  let input;
  const result = await generateLetter({ ...request, db, aiGenerate: async (params) => { input = params; return 'Carta real de la respuesta de prueba'; } });
  assert.match(input.messages[1].content, /Séptima responsabilidad/);
  assert.match(input.messages[1].content, /Proyecto académico de APIs/);
  assert.match(input.messages[1].content, /Certificación declarada/);
  assert.equal(result.letterContent, db.saved[0].letter_content);
});

test('un fallo o respuesta vacía de IA no crea ni guarda una carta por plantilla', async () => {
  for (const aiGenerate of [async () => { throw new Error('provider unavailable'); }, async () => '  ']) {
    const db = database();
    await assert.rejects(generateLetter({ ...request, db, aiGenerate }), { code: 'DOCUMENT_AI_UNAVAILABLE' });
    assert.equal(db.saved.length, 0);
  }
});

test('una consulta de experiencia fallida no se interpreta como ausencia de experiencia', async () => {
  const db = database({ readError: true });
  let calls = 0;
  await assert.rejects(generateLetter({ ...request, db, aiGenerate: async () => { calls += 1; return 'Carta'; } }), { code: 'PROFILE_CONTEXT_UNAVAILABLE' });
  assert.equal(calls, 0);
  assert.equal(db.saved.length, 0);
});

test('si falla guardar una carta ya generada se conserva su texto con aviso y sin ID ficticio', async () => {
  const result = await generateLetter({ ...request, db: database({ saveError: true }), aiGenerate: async () => 'Carta generada que debe conservarse' });
  assert.equal(result.letterId, null);
  assert.equal(result.letterContent, 'Carta generada que debe conservarse');
  assert.ok(result.warning);
});

test('el contrato atómico admite los campos de perfil que antes se perdían', () => {
  const input = { profile: { first_name: 'Ada', last_name: 'Lovelace', career: 'Sistemas', linkedin: 'https://example.com/perfil', portfolio: 'https://example.com', certifications: ['Certificado'] }, academic_background: [], work_experience: [] };
  assert.deepEqual(fullProfileUpdateSchema.parse(input), input);
});
