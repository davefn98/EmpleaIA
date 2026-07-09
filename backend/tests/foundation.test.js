/**
 * foundation.test.js — Pruebas de los cimientos de la arquitectura por capas:
 * asyncHandler (manejo de errores) y apiResponse (respuestas estándar).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ok, created, fail } from '../lib/apiResponse.js';

// Fake res mínimo que captura status y json.
const fakeRes = () => {
  const r = { statusCode: null, body: null };
  r.status = (code) => { r.statusCode = code; return r; };
  r.json = (payload) => { r.body = payload; return r; };
  return r;
};

test('asyncHandler: en éxito NO llama a next', async () => {
  let nextCalled = false;
  const handler = asyncHandler(async (req, res) => { res.ran = true; });
  const res = {};
  await handler({}, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false, 'next no debe llamarse en éxito');
  assert.equal(res.ran, true, 'el handler debe ejecutarse');
});

test('asyncHandler: en error reenvía el error a next', async () => {
  const boom = new Error('boom');
  let received = null;
  const handler = asyncHandler(async () => { throw boom; });
  await handler({}, {}, (err) => { received = err; });
  assert.equal(received, boom, 'el error debe llegar a next');
});

test('apiResponse.ok: success:true y status 200 por defecto', () => {
  const res = fakeRes();
  ok(res, { data: 42 });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, data: 42 });
});

test('apiResponse.created: status 201', () => {
  const res = fakeRes();
  created(res, { id: 'x' });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.id, 'x');
});

test('apiResponse.fail: success:false, mensaje y código', () => {
  const res = fakeRes();
  fail(res, 'Datos inválidos', 400, 'VALIDATION_ERROR');
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'Datos inválidos');
  assert.equal(res.body.code, 'VALIDATION_ERROR');
});

test('apiResponse.fail: sin código no incluye la clave code', () => {
  const res = fakeRes();
  fail(res, 'Error interno', 500);
  assert.equal(res.statusCode, 500);
  assert.equal('code' in res.body, false, 'no debe existir code si no se pasa');
});
