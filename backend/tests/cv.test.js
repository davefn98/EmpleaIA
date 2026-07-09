/**
 * cv.test.js — Pruebas unitarias del módulo de CVs (framework nativo node:test).
 * Ejecutar con:  npm test   (desde la carpeta backend)
 *
 * Se centran en las funciones puras que no dependen de red ni de base de datos:
 * en particular `buildFallbackParsedData`, que debe ser 100% honesta — nunca
 * devolver valores inventados cuando el texto del CV no contiene la información.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Dependencia transitiva de AIProviderService (encryption.js) necesita esta clave.
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const { buildFallbackParsedData } = await import('../services/cvService.js');

// ---------------------------------------------------------------------------
// Honestidad: texto vacío / sin datos relevantes
// ---------------------------------------------------------------------------

test('buildFallbackParsedData: texto vacío → career y target_role son strings vacíos', () => {
  const result = buildFallbackParsedData('');
  assert.equal(result.career,      '', 'career debe ser "" cuando no coincide ningún keyword');
  assert.equal(result.target_role, '', 'target_role debe ser "" cuando no coincide ningún keyword');
});

test('buildFallbackParsedData: texto vacío → technical_skills y soft_skills son arrays vacíos', () => {
  const result = buildFallbackParsedData('');
  assert.deepEqual(result.technical_skills, [], 'technical_skills debe ser [] cuando el texto no menciona skills');
  assert.deepEqual(result.soft_skills,      [], 'soft_skills debe ser [] cuando el texto no menciona skills');
});

test('buildFallbackParsedData: texto sin keywords → bio vacío (no se fabrica una bio genérica)', () => {
  const result = buildFallbackParsedData('Sin información relevante aquí');
  assert.equal(result.bio, '', 'bio debe ser "" cuando no hay career ni target_role extraídos');
});

test('buildFallbackParsedData: texto irrelevante → nunca devuelve "Computación e Informática"', () => {
  const result = buildFallbackParsedData('Texto sin ninguna mención a carreras o tecnologías');
  assert.notEqual(result.career, 'Computación e Informática', 'el default de carrera inventado no debe aparecer');
});

test('buildFallbackParsedData: texto irrelevante → nunca devuelve "Junior Developer"', () => {
  const result = buildFallbackParsedData('Texto sin ninguna mención a roles o puestos');
  assert.notEqual(result.target_role, 'Junior Developer', 'el default de role inventado no debe aparecer');
});

test('buildFallbackParsedData: sin skills reales → no rellena con ["HTML","CSS","JavaScript","Git"]', () => {
  const result = buildFallbackParsedData('Texto sin menciones a tecnologías');
  assert.equal(result.technical_skills.includes('HTML'),       false, 'HTML no debe aparecer si no está en el texto');
  assert.equal(result.technical_skills.includes('JavaScript'), false, 'JavaScript no debe aparecer si no está en el texto');
});

test('buildFallbackParsedData: sin skills blandas → no rellena con valores genéricos', () => {
  const result = buildFallbackParsedData('Texto sin habilidades mencionadas');
  assert.deepEqual(result.soft_skills, [], 'soft_skills debe ser [] sin keywords en el texto');
});

// ---------------------------------------------------------------------------
// Extracción real desde texto
// ---------------------------------------------------------------------------

test('buildFallbackParsedData: keyword "redes" en texto → career extraído correctamente', () => {
  const result = buildFallbackParsedData('Experiencia en redes y telecomunicaciones');
  assert.equal(result.career, 'Redes y Seguridad de TI');
});

test('buildFallbackParsedData: keyword "frontend" en texto → target_role extraído correctamente', () => {
  const result = buildFallbackParsedData('Desarrollador frontend con React');
  assert.equal(result.target_role, 'Junior Frontend Developer');
});

test('buildFallbackParsedData: keyword "react" en texto → aparece en technical_skills', () => {
  const result = buildFallbackParsedData('Trabajo con React y Git');
  assert.ok(result.technical_skills.includes('React'), 'React debe detectarse en el texto');
  assert.ok(result.technical_skills.includes('Git'),   'Git debe detectarse en el texto');
});

test('buildFallbackParsedData: keyword "scrum" en texto → aparece en soft_skills', () => {
  const result = buildFallbackParsedData('Experiencia trabajando con scrum y liderazgo de equipos');
  assert.ok(result.soft_skills.includes('Scrum'),     'Scrum debe detectarse en el texto');
  assert.ok(result.soft_skills.includes('Liderazgo'), 'Liderazgo debe detectarse en el texto');
});

test('buildFallbackParsedData: bio se construye con datos extraídos — nunca inventa texto', () => {
  const result = buildFallbackParsedData('backend developer con experiencia');
  // "backend" → target_role = "Junior Backend Developer"; career sigue vacío
  assert.ok(result.bio.includes('Junior Backend Developer'), 'bio debe incluir el role extraído');
  assert.ok(!result.bio.includes('Computación'), 'bio no debe incluir valores inventados');
});

test('buildFallbackParsedData: email y teléfono se extraen del texto cuando existen', () => {
  const result = buildFallbackParsedData('Contacto: juan@example.com | 987654321');
  assert.equal(result.email, 'juan@example.com');
  assert.ok(result.phone.length > 0, 'phone debe detectarse');
});

// ---------------------------------------------------------------------------
// Forma de la respuesta
// ---------------------------------------------------------------------------

test('buildFallbackParsedData: siempre devuelve work_experience y academic_background como arrays vacíos', () => {
  const result = buildFallbackParsedData('Texto con mucha experiencia laboral y estudios universitarios');
  assert.deepEqual(result.work_experience,     [], 'el regex fallback no puede extraer experiencia laboral estructurada');
  assert.deepEqual(result.academic_background, [], 'el regex fallback no puede extraer educación estructurada');
});
