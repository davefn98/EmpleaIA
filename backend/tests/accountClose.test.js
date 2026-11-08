import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

const user = { id: '80c160c7-14ae-4bd1-b845-ff577b355f69', email: 'cuenta-desechable@example.test' };
const otherId = '36bcaf53-122d-4e83-90e9-33b7dba70230';
const calls = { verify: [], delete: [], logout: [] };
let failDelete = false;
let deleted = false;
let project;
let api;

const listen = async (server) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
};

before(async () => {
  project = http.createServer(async (req, res) => {
    const respond = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' });
      res.end(JSON.stringify(body));
    };
    let rawBody = '';
    for await (const chunk of req) rawBody += chunk;
    const body = rawBody ? JSON.parse(rawBody) : {};

    if (req.url === '/auth/v1/user') {
      return deleted ? respond(403, { code: 'user_not_found', msg: 'User not found' }) : respond(200, user);
    }
    if (req.url === '/auth/v1/token?grant_type=password') {
      calls.verify.push({ email: body.email });
      if (body.password === 'incorrecta') return respond(400, { code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return respond(200, {
        access_token: 'temporary-access-token', refresh_token: 'temporary-refresh-token', expires_in: 3600,
        user: body.password === 'otra-cuenta' ? { ...user, id: otherId } : user,
      });
    }
    if (req.url === '/auth/v1/admin/users/' + user.id && req.method === 'DELETE') {
      calls.delete.push({ authorization: req.headers.authorization, soft: body.should_soft_delete });
      if (failDelete) return respond(500, { code: 'unexpected_failure', msg: 'Database error deleting user' });
      deleted = true;
      return respond(200, user);
    }
    if (req.url === '/auth/v1/logout?scope=local') {
      calls.logout.push(req.headers.authorization);
      res.writeHead(204);
      return res.end();
    }
    return respond(404, { msg: 'Unexpected request' });
  });

  process.env.NEXT_PUBLIC_SUPABASE_URL = await listen(project);
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const { default: router } = await import('../routes/account.js');
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  api = http.createServer(app);
  await listen(api);
});

after(() => {
  api?.close();
  project?.close();
});

const request = (path, method = 'DELETE', body) => fetch(`http://127.0.0.1:${api.address().port}/api${path}`, {
  method,
  headers: { Authorization: 'Bearer original-access-token', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('el cierre exige titularidad y contraseña, y elimina Auth solo después de verificar ambos', async () => {
  const path = `/account/${user.id}/close`;
  assert.equal((await request(`/account/${user.id}`)).status, 404);
  assert.equal((await request(`/account/${otherId}/close`, 'DELETE', { password: 'correcta' })).status, 403);
  assert.equal((await request(path, 'DELETE', {})).status, 400);
  assert.deepEqual(calls.verify, []);

  assert.equal((await request(path, 'DELETE', { password: 'incorrecta' })).status, 403);
  assert.equal((await request(path, 'DELETE', { password: 'otra-cuenta' })).status, 403);
  assert.deepEqual(calls.delete, []);

  failDelete = true;
  const failed = await request(path, 'DELETE', { password: 'correcta' });
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).error, 'No pudimos confirmar la eliminación de tu cuenta. Vuelve a intentarlo.');
  assert.equal(deleted, false);

  failDelete = false;
  const success = await request(path, 'DELETE', { password: 'correcta' });
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), { success: true });
  assert.deepEqual(calls.verify, Array(4).fill({ email: user.email }));
  assert.deepEqual(calls.delete, Array(2).fill({ authorization: 'Bearer test-service-key', soft: false }));
  assert.deepEqual(calls.logout, Array(2).fill('Bearer temporary-access-token'));
  assert.equal((await request(`/account/export/${user.id}`, 'GET')).status, 401);
});
