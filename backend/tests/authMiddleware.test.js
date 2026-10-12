/**
 * authMiddleware.test.js — Pruebas de requireAuth (framework nativo node:test).
 * Ejecutar con:  npm test   (desde la carpeta backend)
 *
 * Un mini servidor HTTP local simula el endpoint /auth/v1/user de Supabase
 * (GoTrue), lo que permite cubrir sin red externa: 401 por token ausente o
 * inválido, 403 por userId ajeno (guard de ownership) y el caso feliz.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { requireAuth } from '../lib/authMiddleware.js';

const FAKE_USER = { id: 'user-1', aud: 'authenticated', role: 'authenticated', email: 'test@test.dev' };
let server;
let authMode = 'valid'; // 'valid' | 'invalid'

before(async () => {
  server = http.createServer((req, res) => {
    if (authMode === 'valid') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(FAKE_USER));
    } else {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token', error_description: 'JWT inválido o expirado' }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
});

after(() => server.close());

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function run(req) {
  const res = fakeRes();
  let nextCalled = false;
  req.body = req.body || {};
  req.params = req.params || {};
  await requireAuth(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test('sin header Authorization responde 401', async () => {
  const { res, nextCalled } = await run({ headers: {} });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('header sin esquema Bearer responde 401', async () => {
  const { res, nextCalled } = await run({ headers: { authorization: 'Basic abc123' } });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('token inválido o expirado responde 401 AUTH_REQUIRED', async () => {
  authMode = 'invalid';
  const { res, nextCalled } = await run({ headers: { authorization: 'Bearer token-caducado' } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'AUTH_REQUIRED');
  assert.equal(nextCalled, false);
});

test('token válido con userId ajeno en la ruta responde 403 (ownership)', async () => {
  authMode = 'valid';
  const { res, nextCalled } = await run({
    headers: { authorization: 'Bearer token-valido' },
    params: { userId: 'otro-usuario' },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('token válido con profileId ajeno en el body responde 403 (ownership)', async () => {
  authMode = 'valid';
  const { res, nextCalled } = await run({
    headers: { authorization: 'Bearer token-valido' },
    body: { profileId: 'otro-usuario' },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('token válido con userId propio pasa y expone req.user y req.db', async () => {
  authMode = 'valid';
  const req = {
    headers: { authorization: 'Bearer token-valido' },
    params: { userId: FAKE_USER.id },
  };
  const { res, nextCalled } = await run(req);
  assert.equal(nextCalled, true, `no debió responder ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(req.user.id, FAKE_USER.id);
  assert.ok(req.db, 'req.db debe quedar disponible para los handlers');
});
