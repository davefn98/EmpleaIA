/**
 * unit.test.js — Pruebas unitarias del backend (framework nativo node:test).
 * Ejecutar con:  npm test   (desde la carpeta backend)
 *
 * Cubren funciones puras y aisladas que no dependen de red ni de base de datos:
 * cifrado de API keys, registro de proveedores y validez de los prompts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Clave de cifrado de prueba (32 bytes en hex) ANTES de importar el módulo.
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const { encryptApiKey, decryptApiKey, maskApiKey } = await import('../lib/encryption.js');
const { isValidProvider, listProviders } = await import('../lib/aiProviders/providerRegistry.js');
const prompts = await import('../lib/prompts.js');

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
