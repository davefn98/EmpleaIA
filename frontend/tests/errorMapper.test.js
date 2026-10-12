/**
 * errorMapper.test.js — Pruebas de mapError (framework nativo node:test).
 * Ejecutar con:  npm test   (desde la carpeta frontend)
 *
 * Garantizan que los estados que las vistas distinguen (sesión expirada,
 * fallo de red, error interno del servidor) produzcan mensajes correctos y
 * NUNCA se confundan con "perfil incompleto".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mapError } from '../src/utils/errorMapper.js';

test('sesión expirada (throw de api.js ante 401) → mensaje de re-login', () => {
  const err = new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  err.code = 'SESSION_EXPIRED';
  assert.match(mapError(err), /sesión ha expirado/i);
});

test('código AUTH_REQUIRED del backend → mensaje de re-login', () => {
  const err = new Error('Debes iniciar sesión');
  err.code = 'AUTH_REQUIRED';
  assert.match(mapError(err), /sesión ha expirado/i);
});

test('fallo de red (fetch) → mensaje de conexión', () => {
  assert.match(mapError(new Error('Failed to fetch')), /conexión/i);
});

test('error interno 500 del backend → mensaje de fallo temporal', () => {
  const msg = mapError(new Error('Ocurrió un error interno no controlado en el servidor'));
  assert.match(msg, /fallo interno/i);
});

test('ningún error de carga se traduce a "perfil incompleto"', () => {
  const cases = [
    mapError(new Error('Failed to fetch')),
    mapError(new Error('Ocurrió un error interno no controlado en el servidor')),
    mapError(new Error('Ruta de API no encontrada: /api/user-snapshot/x')),
  ];
  for (const msg of cases) {
    assert.doesNotMatch(msg, /completa tu perfil/i);
    assert.doesNotMatch(msg, /perfil incompleto/i);
  }
});
