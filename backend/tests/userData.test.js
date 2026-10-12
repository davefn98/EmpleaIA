import { test } from 'node:test';
import assert from 'node:assert/strict';
import userDataRouter from '../routes/userData.js';
import { classifyProfileState } from '../validators/profileValidator.js';
import { ensureUserProfile } from '../services/profileService.js';

const routes = userDataRouter.stack.filter(l => l.route).map(l => l.route);
const getRoute = (path) => routes.find(r => r.path === path);
const getHandler = (path) => getRoute(path).stack.at(-1).handle;

function fakeDb(resultsByTable = {}) {
  const db = {
    _profilesResult: resultsByTable.profiles !== undefined
      ? (resultsByTable.profiles.error
        ? { success: false, code: 'DB_ERROR', error: resultsByTable.profiles.error.message }
        : { success: true, profile: resultsByTable.profiles.data })
      : { success: true, profile: null },
    from(table) {
      const result = resultsByTable[table] ?? { data: [], error: null };
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: () => Promise.resolve(result),
        single: () => Promise.resolve(result),
        then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
      };
      return builder;
    },
  };
  return db;
}

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function runHandler(path, db, userId = 'user-1', fakeProfileResult = null) {
  const res = fakeRes();
  const req = {
    user: { id: userId },
    db,
    params: { userId },
    fakeProfileResult: fakeProfileResult ?? db._profilesResult
  };
  await getHandler(path)(req, res, (err) => { if (err) throw err; });
  return res;
}

test('las rutas consumidas por el frontend están registradas con GET', () => {
  const expected = [
    '/user-snapshot/:userId',
    '/activity/:userId',
    '/dashboard/:userId',
    '/documents/cvs/:userId',
    '/interview-summary/:interviewId',
  ];
  for (const path of expected) {
    const route = getRoute(path);
    assert.ok(route, `falta la ruta ${path}`);
    assert.ok(route.methods.get, `${path} debe aceptar GET`);
  }
});

test('user-snapshot: usuario sin fila de perfil recibe 200 con profile null', async () => {
  const db = fakeDb({ profiles: { data: null, error: null } });
  const res = await runHandler('/user-snapshot/:userId', db);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.profile, null);
});

test('user-snapshot: error de consulta responde 400 USER_SNAPSHOT_FAILED o 500 DB_ERROR', async () => {
  const db = fakeDb({ profiles: { data: null, error: { message: 'db failure' } } });
  const res = await runHandler('/user-snapshot/:userId', db);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, 'DB_ERROR');
});

test('activity: sin datos responde 200 con arrays vacíos (vacío ≠ error)', async () => {
  const res = await runHandler('/activity/:userId', fakeDb());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.cvs, []);
});

test('activity: error de consulta responde 400 ACTIVITY_QUERY_FAILED', async () => {
  const db = fakeDb({ interviews: { data: null, error: { message: 'boom' } } });
  const res = await runHandler('/activity/:userId', db);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'ACTIVITY_QUERY_FAILED');
});

test('dashboard: usuario sin perfil no rompe el resumen', async () => {
  const db = fakeDb({
    profiles: { data: null, error: null },
    generated_cvs: { count: 2, error: null },
    cover_letters: { count: 0, error: null },
    interviews: { data: [], error: null },
  });
  const res = await runHandler('/dashboard/:userId', db);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.profile, null);
  assert.equal(res.body.cvCount, 2);
});

test('seguridad/ownership: dashboard e id ajena devuelve 403 FORBIDDEN', async () => {
  const res = fakeRes();
  const req = { user: { id: 'usuario-a' }, params: { userId: 'usuario-b' } };
  await getHandler('/dashboard/:userId')(req, res, (err) => { if (err) throw err; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'FORBIDDEN');
});

test('classifyProfileState: categoriza correctamente los estados del perfil', () => {
  assert.equal(classifyProfileState(null), 'inexistent');

  const basicProf = { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@lovelace.org', career: '', target_role: '' };
  assert.equal(classifyProfileState(basicProf), 'basic');

  const incompleteProf = { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@lovelace.org', career: 'Sistemas', target_role: 'Developer', bio: '' };
  assert.equal(classifyProfileState(incompleteProf), 'incomplete');

  const completeProf = {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@lovelace.org',
    career: 'Sistemas',
    target_role: 'Developer',
    bio: 'Genius',
    technical_skills: ['Algoritmia'],
    soft_skills: ['Resolución']
  };
  assert.equal(classifyProfileState(completeProf), 'complete');
});
