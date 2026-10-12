import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
const { parseCvRaw, parseCv } = await import('../services/cvService.js');
const { cvImportTokenBudget, parseImportedCv, importedCvToProfile } = await import('../services/cvImportData.js');
const { extractCvText } = await import('../lib/fileTextExtractor.js');
const { fullProfileUpdateSchema } = await import('../validators/profileValidator.js');

const responsibilities = [
  'Gestion de pases a produccion y trazabilidad de cambios en GitHub.',
  'Automatizacion de integracion continua con GitHub Actions.',
  'Despliegue de servicios backend utilizando AWS y contenedores.',
  'Revision tecnica de cambios antes de integrar a produccion.',
  'Resolucion de incidentes y seguimiento de servicios productivos.',
  'Promocion de buenas practicas de calidad dentro del equipo.',
  'Implementacion de pruebas automatizadas de APIs con Karate.',
];
const cvText = ['Ana Prueba Perez', 'Backend Developer', 'Empresa Prueba', ...responsibilities.map((line) => `• ${line}`)].join('\n');
const fixture = () => ({
  first_name: 'Ana', last_name: 'Prueba Perez', email: '', phone: '',
  location: '', linkedin: '', career: 'Ingenieria', target_role: '', target_job_description: '', bio: '',
  technical_skills: ['AWS', 'GitHub Actions', 'Karate'], soft_skills: [],
  work_experience: [{ company: 'Empresa Prueba', role: 'Backend Developer',
    start_date: '2025-03', end_date: null, description: responsibilities.join('\n'), achievements: [] }],
  academic_background: [],
});

test('Importar conserva las siete responsabilidades en una sola experiencia', async () => {
  const result = await parseCvRaw({ db: {}, userId: 'offline', cvText, generate: async () => JSON.stringify(fixture()) });
  for (const responsibility of responsibilities) assert.ok(result.parsedData.work_experience[0].description.includes(responsibility));
  assert.equal(result.parsedData.work_experience[0].description.split('\n').length, 7);
});

test('Importar une logros separados a la descripción visible sin duplicarlos', () => {
  const parsed = fixture();
  parsed.work_experience[0].description = responsibilities[0];
  parsed.work_experience[0].achievements = responsibilities;
  const result = parseImportedCv(parsed, cvText);
  assert.equal(result.work_experience[0].description.split('\n').length, 7);
});

test('Respuesta IA con solo primera responsabilidad se rechaza como importación parcial', () => {
  const parsed = fixture();
  parsed.work_experience[0].description = responsibilities[0];
  assert.throws(() => parseImportedCv(parsed, cvText), (error) => error.code === 'CV_IMPORT_INCOMPLETE' && error.status === 422);
});

test('JSON truncado se rechaza y no produce un perfil regex aparentemente correcto', async () => {
  await assert.rejects(() => parseCvRaw({ db: {}, userId: 'offline', cvText, generate: async () => '{"work_experience":[' }), { code: 'CV_IMPORT_INVALID_RESPONSE' });
});

test('Arreglo o campo de experiencia inválido se rechaza', () => {
  const parsed = fixture();
  parsed.work_experience[0].achievements = 'solo una linea';
  assert.throws(() => parseImportedCv(parsed), { code: 'CV_IMPORT_INVALID_RESPONSE' });
});

test('Fallo de proveedor preserva el formulario devolviendo error controlado', async () => {
  await assert.rejects(() => parseCvRaw({ db: {}, userId: 'offline', cvText, generate: async () => { throw new Error('offline'); } }), { code: 'CV_IMPORT_AI_UNAVAILABLE', status: 502 });
});

test('Importación usa contrato estructurado y presupuesto suficiente sin tocar Supabase', async () => {
  let request;
  const db = { from() { throw new Error('La importación no debe guardar datos'); } };
  await parseCvRaw({ db, userId: 'offline', cvText, generate: async (params) => { request = params; return JSON.stringify(fixture()); } });
  assert.ok(request.maxTokens >= 6500);
  assert.equal(request.responseSchema.additionalProperties, false);
  assert.ok(request.messages[0].content.includes('No resumas'));
  assert.equal(JSON.parse(request.messages[1].content).cv_document, cvText);
});

test('Documento largo no se recorta silenciosamente ni invoca el proveedor', async () => {
  let called = false;
  await assert.rejects(() => parseCvRaw({ cvText: 'A'.repeat(40001), generate: async () => { called = true; return ''; } }), { code: 'CV_IMPORT_TOO_LONG' });
  assert.equal(called, false);
  assert.ok(cvImportTokenBudget('A'.repeat(30000)) > 6500);
});

test('Adaptación a Mi perfil conserva responsabilidades, nombres y fecha con precisión original', () => {
  const parsed = parseImportedCv(fixture(), cvText);
  const result = importedCvToProfile(parsed);
  assert.equal(result.first_name, 'Ana');
  assert.equal(result.last_name, 'Prueba Perez');
  assert.equal(result.experience[0].start_date, '2025-03');
  assert.equal(result.experience[0].end_date, null);
  assert.equal(result.experience[0].description, responsibilities.join('\n'));
  assert.equal(result.target_position, '');
});

test('Perfil importado pasa validación de guardado sin perder responsabilidades', () => {
  const parsed = parseImportedCv(fixture(), cvText);
  const request = {
    profile: { first_name: parsed.first_name, last_name: parsed.last_name, career: parsed.career,
      target_role: 'Backend AWS', target_job_description: 'Integracion de APIs en AWS.' },
    academic_background: [], work_experience: parsed.work_experience,
  };
  const result = fullProfileUpdateSchema.parse(request);
  assert.equal(result.work_experience[0].description.split('\n').length, 7);
  assert.equal(result.profile.target_job_description, request.profile.target_job_description);
});

test('Extracción TXT conserva saltos de línea y las siete viñetas', async () => {
  const result = await extractCvText({ buffer: Buffer.from(cvText), mimetype: 'text/plain', originalname: 'cv-prueba.txt' });
  for (const line of responsibilities) assert.ok(result.includes(line));
  assert.equal(result.split('\n').length, cvText.split('\n').length);
});

test('Extracción PDF de dos páginas conserva la responsabilidad final', async () => {
  const path = new URL('./fixtures/cv-import-synthetic.pdf', import.meta.url);
  const result = await extractCvText({ buffer: await readFile(path), mimetype: 'application/pdf', originalname: 'cv-sintetico.pdf' });
  for (const line of responsibilities) assert.ok(result.includes(line), line);
});

test('Extracción DOCX conserva las siete responsabilidades', async () => {
  const path = new URL('./fixtures/cv-import-synthetic.docx', import.meta.url);
  const result = await extractCvText({ buffer: await readFile(path), mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', originalname: 'cv-sintetico.docx' });
  for (const line of responsibilities) assert.ok(result.includes(line), line);
});

const fakeImportDb = (rpcError = null) => {
  const requests = [];
  const db = {
    from(table) {
      const builder = {
        select() { return builder; }, eq() { return builder; },
        single() { return { data: { target_role: 'Puesto elegido', target_job_description: 'Vacante elegida' }, error: null }; },
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
      return builder;
    },
    async rpc(name, payload) { requests.push({ name, payload }); return { data: {}, error: rpcError }; },
  };
  return { db, requests };
};

test('Guardado legacy usa una operación atómica y conserva el objetivo existente', async () => {
  const { db, requests } = fakeImportDb();
  const parsed = fixture();
  parsed.target_role = 'Cargo del archivo';
  parsed.target_job_description = 'Otra vacante';
  await parseCv({ db, userId: 'offline', profileId: 'offline', cvText, generate: async () => JSON.stringify(parsed) });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].name, 'replace_current_user_profile_data');
  assert.equal(requests[0].payload.p_profile.target_role, undefined);
  assert.equal(requests[0].payload.p_profile.target_job_description, undefined);
  assert.equal(requests[0].payload.p_work[0].description.split('\n').length, 7);
});

test('Fallo del guardado atómico no responde como importación exitosa', async () => {
  const { db, requests } = fakeImportDb({ message: 'Prueba offline de rollback' });
  await assert.rejects(() => parseCv({ db, userId: 'offline', profileId: 'offline', cvText, generate: async () => JSON.stringify(fixture()) }), { code: 'CV_IMPORT_SAVE_FAILED' });
  assert.equal(requests.length, 1);
});
