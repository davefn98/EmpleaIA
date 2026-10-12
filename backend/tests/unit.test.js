/**
 * unit.test.js — Pruebas unitarias del backend (framework nativo node:test).
/**
 * unit.test.js — Pruebas unitarias del backend (framework nativo node:test).
 * Ejecutar con:  npm test   (desde la carpeta backend)
 *
 * Cubren funciones puras y aisladas que no dependen de red ni de base de datos:
 * cifrado de API keys, registro de proveedores y validez de los prompts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureUserProfile } from '../services/profileService.js';

// Clave de cifrado de prueba (32 bytes en hex) ANTES de importar el módulo.
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const { encryptApiKey, decryptApiKey, maskApiKey } = await import('../lib/encryption.js');
const { isValidProvider, listProviders } = await import('../lib/aiProviders/providerRegistry.js');
const prompts = await import('../lib/prompts.js');
const { profileUpdateSchema, fullProfileUpdateSchema } = await import('../validators/profileValidator.js');

test('encryption: cifra y descifra ida y vuelta', () => {
  const secret = 'sk-test-1234567890abcdef';
  const enc = encryptApiKey(secret);
  assert.notEqual(enc, secret, 'el texto cifrado no debe igualar al plano');
  assert.equal(decryptApiKey(enc), secret, 'el descifrado debe recuperar el original');
});

test('encryption: cada cifrado usa un IV distinto (no determinista)', () => {
  const a = encryptApiKey('misma-key');
  const b = encryptApiKey('misma-key');
  assert.notEqual(a, b, 'dos cifrados del mismo texto no deben coincidir');
});

test('encryption: un payload manipulado falla la autenticación (GCM)', () => {
  const enc = encryptApiKey('sk-test-abcdef');
  const tampered = enc.slice(0, -6) + 'AAAAAA';
  assert.throws(() => decryptApiKey(tampered));
});

test('maskApiKey oculta el centro y conserva prefijo/sufijo', () => {
  const masked = maskApiKey('sk-proj-ABCDEFGHIJKL');
  assert.match(masked, /•/, 'debe contener caracteres de máscara');
  assert.ok(masked.startsWith('sk-proj'), 'debe conservar el prefijo');
  assert.ok(masked.endsWith('IJKL'), 'debe conservar los últimos 4 caracteres');
  assert.ok(!masked.includes('CDEFGH'), 'no debe exponer el centro de la key');
});

test('providerRegistry reconoce openai y rechaza desconocidos', () => {
  assert.equal(isValidProvider('openai'), true);
  assert.equal(isValidProvider('proveedor-inexistente'), false);
  assert.ok(Array.isArray(listProviders()), 'listProviders debe devolver un array');
});

test('prompts definidos y no vacíos', () => {
  const keys = [
    'SYSTEM_PROMPT_CV',
    'SYSTEM_PROMPT_LETTER',
    'SYSTEM_PROMPT_INTERVIEW_START',
    'SYSTEM_PROMPT_INTERVIEW_EVAL',
    'SYSTEM_PROMPT_INTERVIEW_FINAL',
    'SYSTEM_PROMPT_CV_PARSE',
    'SYSTEM_PROMPT_CV_IMPORT',
    'SYSTEM_PROMPT_INTERVIEW_RESOURCES',
  ];
  for (const key of keys) {
    assert.equal(typeof prompts[key], 'string', `${key} debe ser string`);
    assert.ok(prompts[key].length > 20, `${key} no debe estar vacío`);
  }
});


test('profileUpdateSchema rechaza campos no permitidos', () => {
  const result = profileUpdateSchema.safeParse({ first_name: 'Ada', is_admin: true });
  assert.equal(result.success, false);
});

test('profileUpdateSchema acepta una actualizaci?n parcial v?lida', () => {
  const result = profileUpdateSchema.safeParse({ first_name: 'Ada', technical_skills: ['Node.js'] });
  assert.equal(result.success, true);
});

test('profileUpdateSchema conserva la descripcion objetivo sin transformar', () => {
  const description = '  Funciones:\n- Liderar el equipo\n\nRequisitos:\n- React y Node.js  ';
  const result = profileUpdateSchema.safeParse({ target_job_description: description });

  assert.equal(result.success, true);
  assert.equal(result.data.target_job_description, description);
});

test('profileUpdateSchema acepta descripcion objetivo nula o vacia', () => {
  assert.equal(profileUpdateSchema.safeParse({ target_job_description: null }).success, true);
  const emptyResult = profileUpdateSchema.safeParse({ target_job_description: '' });
  assert.equal(emptyResult.success, true);
  assert.equal(emptyResult.data.target_job_description, '');
});

test('profileUpdateSchema no impone un limite artificial a la descripcion objetivo', () => {
  const description = 'x'.repeat(20_000);
  const result = profileUpdateSchema.safeParse({ target_job_description: description });

  assert.equal(result.success, true);
  assert.equal(result.data.target_job_description.length, description.length);
});

test('profileUpdateSchema rechaza caracteres que PostgreSQL TEXT no admite', () => {
  const result = profileUpdateSchema.safeParse({ target_job_description: 'Texto\0invalido' });

  assert.equal(result.success, false);
});

test('fullProfileUpdateSchema valida el reemplazo profesional completo', () => {
  const result = fullProfileUpdateSchema.safeParse({ profile: { first_name: 'Ada' }, academic_background: [], work_experience: [] });
  assert.equal(result.success, true);
});

test('fullProfileUpdateSchema rechaza colecciones con estructura inv?lida', () => {
  const result = fullProfileUpdateSchema.safeParse({ profile: {}, academic_background: [{ institution: '' }], work_experience: [] });
  assert.equal(result.success, false);
});

test('fullProfileUpdateSchema acepta y normaliza fechas flexibles como Mayo 2021 y Presente', () => {
  const result = fullProfileUpdateSchema.safeParse({
    profile: { first_name: 'Ada' },
    academic_background: [
      {
        institution: 'Universidad Tecnológica',
        degree: 'Bachiller en Sistemas',
        start_date: 'Mayo 2021',
        end_date: 'Presente'
      }
    ],
    work_experience: [
      {
        company: 'Empresa ABC',
        role: 'Desarrollador Backend',
        start_date: '2020-03',
        end_date: 'Actual'
      }
    ]
  });
  assert.equal(result.success, true);
  assert.equal(result.data.academic_background[0].start_date, '2021-05-01');
  assert.equal(result.data.academic_background[0].end_date, null);
  assert.equal(result.data.work_experience[0].start_date, '2020-03-01');
  assert.equal(result.data.work_experience[0].end_date, null);
});

test('ensureUserProfile: retorna perfil existente directamente sin lazy load', async () => {
  const fakeDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { id: 'u1', first_name: 'Existing' }, error: null })
        })
      })
    })
  };
  const req = { db: fakeDb };
  const res = await ensureUserProfile('u1', req);
  assert.equal(res.success, true);
  assert.equal(res.profile.first_name, 'Existing');
  assert.equal(res.source, 'db');
});

test('ensureUserProfile: realiza lazy load seguro si no hay perfil en base de datos', async () => {
  const fakeDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null })
        })
      })
    })
  };
  const mockAdmin = {
    auth: {
      admin: {
        getUserById: (id) => Promise.resolve({
          data: { user: { id, email: 'ada@lovelace.org', user_metadata: { first_name: 'Ada', last_name: 'Lovelace', career: 'Sistemas', target_role: 'Developer' } } },
          error: null
        })
      }
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'u1', first_name: 'Ada', email: 'ada@lovelace.org' }, error: null })
        })
      })
    })
  };
  const req = { db: fakeDb, supabaseAdminOverride: mockAdmin };
  const res = await ensureUserProfile('u1', req);
  assert.equal(res.success, true);
  assert.equal(res.profile.first_name, 'Ada');
  assert.equal(res.source, 'lazy_created');
});

test('ensureUserProfile: maneja concurrencia Postgres 23505 (unique violation)', async () => {
  const fakeDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { id: 'u1', first_name: 'Winner' }, error: null })
        })
      })
    })
  };
  const mockAdmin = {
    auth: {
      admin: {
        getUserById: (id) => Promise.resolve({
          data: { user: { id, email: 'ada@lovelace.org', user_metadata: { first_name: 'Ada' } } },
          error: null
        })
      }
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } })
        })
      })
    })
  };
  const req = { db: fakeDb, supabaseAdminOverride: mockAdmin };
  const res = await ensureUserProfile('u1', req);
  assert.equal(res.success, true);
  assert.equal(res.profile.first_name, 'Winner');
  assert.equal(res.source, 'db');
});
