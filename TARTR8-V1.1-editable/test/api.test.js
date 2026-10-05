const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../server/db');
const { createApp } = require('../server/app');

let server, base;

// TEST_DRIVER picks the database: sqlite (default), libsql (Turso driver) or postgres (in-memory PGlite).
const DRIVERS = { sqlite: { file: ':memory:' }, nodesqlite: { file: ':memory:' }, libsql: { tursoUrl: ':memory:' }, postgres: { pglite: true } };
if (process.env.TEST_DRIVER === 'nodesqlite') process.env.SQLITE_DRIVER = 'node';
before(async () => {
  const db = await openDatabase(DRIVERS[process.env.TEST_DRIVER || 'sqlite']);
  const app = createApp(db, { rateLimits: false });
  await new Promise(resolve => { server = app.listen(0, resolve); });
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

// A tiny browser stand-in that keeps its session cookie between requests.
function client() {
  let cookie = '';
  async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
      body: body && JSON.stringify(body)
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null), setCookie: set };
  }
  return { get: p => call('GET', p), post: (p, b) => call('POST', p, b) };
}

async function signedUp(username, email) {
  const c = client();
  const r = await c.post('/api/auth/register', { username, email });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return c;
}

test('health check', async () => {
  const r = await client().get('/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true });
});

test('register sets an HttpOnly session cookie and /me returns the user', async () => {
  const c = client();
  const r = await c.post('/api/auth/register', { username: 'Ada_1', email: 'Ada@Example.com' });
  assert.equal(r.status, 201);
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /SameSite=Lax/);
  const me = await c.get('/api/auth/me');
  assert.equal(me.body.user.username, 'Ada_1');
  assert.equal(me.body.user.email, undefined, 'email is not exposed');
});

test('usernames and emails are unique, case-insensitively', async () => {
  await signedUp('unique_guy', 'unique@example.com');
  const c = client();
  const sameName = await c.post('/api/auth/register', { username: 'UNIQUE_GUY', email: 'other@example.com' });
  assert.equal(sameName.status, 409);
  assert.equal(sameName.body.field, 'username');
  const sameEmail = await c.post('/api/auth/register', { username: 'someone_else', email: 'UNIQUE@example.com' });
  assert.equal(sameEmail.status, 409);
  assert.equal(sameEmail.body.field, 'email');
});

test('register validates username and email', async () => {
  const c = client();
  for (const body of [
    { username: 'ab', email: 'a@b.co' },
    { username: 'has space', email: 'a@b.co' },
    { username: 'x'.repeat(21), email: 'a@b.co' },
    { username: 'valid_name', email: 'not-an-email' }
  ]) {
    assert.equal((await c.post('/api/auth/register', body)).status, 400, JSON.stringify(body));
  }
});

test('login needs the matching username and email; logout ends the session', async () => {
  await signedUp('bobby', 'bobby@example.com');
  const c = client();
  assert.equal((await c.post('/api/auth/login', { username: 'bobby', email: 'wrong@example.com' })).status, 401);
  assert.equal((await c.post('/api/auth/login', { username: 'nobody', email: 'bobby@example.com' })).status, 401);
  const ok = await c.post('/api/auth/login', { username: 'BOBBY', email: 'Bobby@Example.com' });
  assert.equal(ok.status, 200);
  assert.equal((await c.get('/api/auth/me')).body.user.username, 'bobby');
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/auth/me')).body.user, null);
});

test('posting a score requires sign-in', async () => {
  const r = await client().post('/api/scores', { game: 'number', score: 100 });
  assert.equal(r.status, 401);
});

test('leaderboard shows each user once with their best score; champion first', async () => {
  const ada = await signedUp('ada', 'ada.lovelace@example.com');
  const bo = await signedUp('bo_x', 'bo@example.com');
  await ada.post('/api/scores', { game: 'catch', score: 120 });
  await ada.post('/api/scores', { game: 'catch', score: 300 });
  await ada.post('/api/scores', { game: 'catch', score: 50 });
  const r = await bo.post('/api/scores', { game: 'catch', score: 200 });
  assert.equal(r.status, 201);
  assert.equal(r.body.rank, 2);

  const board = (await bo.get('/api/scores/catch')).body;
  assert.deepEqual(board.scores.map(s => [s.rank, s.username, s.score, s.plays]), [[1, 'ada', 300, 3], [2, 'bo_x', 200, 1]]);
  assert.equal(board.players, 2);
  assert.deepEqual(board.me, { username: 'bo_x', score: 200, rank: 2 });

  const me = (await ada.get('/api/auth/me')).body;
  assert.deepEqual(me.bests.catch, { score: 300, rank: 1 });
});

test('newBest is only true when the personal best improves', async () => {
  const c = await signedUp('streaky', 'streaky@example.com');
  assert.equal((await c.post('/api/scores', { game: 'memory', score: 5 })).body.newBest, true);
  assert.equal((await c.post('/api/scores', { game: 'memory', score: 3 })).body.newBest, false);
  assert.equal((await c.post('/api/scores', { game: 'memory', score: 8 })).body.newBest, true);
});

test('reaction leaderboard is lower-is-better', async () => {
  const slow = await signedUp('slowpoke', 'slow@example.com');
  const quick = await signedUp('quickdraw', 'quick@example.com');
  await slow.post('/api/scores', { game: 'reaction', score: 420 });
  const r = await quick.post('/api/scores', { game: 'reaction', score: 190 });
  assert.equal(r.body.rank, 1);
  const board = (await quick.get('/api/scores/reaction')).body;
  assert.equal(board.scores[0].username, 'quickdraw');
});

test('rejects invalid scores', async () => {
  const c = await signedUp('validator', 'validator@example.com');
  for (const body of [
    { game: 'nope', score: 10 },
    { game: 'number', score: 1.5 },
    { game: 'number', score: '10' },
    { game: 'reaction', score: 5 },
    { game: 'memory', score: 99999 }
  ]) {
    assert.equal((await c.post('/api/scores', body)).status, 400, JSON.stringify(body));
  }
});

test('unknown leaderboard is 404', async () => {
  assert.equal((await client().get('/api/scores/nope')).status, 404);
});

test('contact form validates and saves', async () => {
  const c = client();
  assert.equal((await c.post('/api/contact', { name: 'Ada', email: 'bad', message: 'Hello there TARTR8' })).status, 400);
  assert.equal((await c.post('/api/contact', { name: 'Ada', email: 'ada@example.com', message: 'short' })).status, 400);
  assert.equal((await c.post('/api/contact', { name: 'Ada', email: 'ada@example.com', message: 'Hello there TARTR8' })).status, 201);
  const web = await c.post('/api/contact', { name: 'Ada', email: 'ada@example.com', message: 'I need a new website.', topic: 'web' });
  assert.equal(web.status, 201);
  assert.equal(web.body.subject, 'Web Development enquiry');
  const unknown = await c.post('/api/contact', { name: 'Ada', email: 'ada@example.com', message: 'Unknown topic falls back', topic: 'hacking' });
  assert.equal(unknown.body.subject, 'Other enquiry');
});

test('malformed JSON returns 400', async () => {
  const res = await fetch(base + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(res.status, 400);
});

test('serves the site but not server files', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/css/base.css')).status, 200);
  for (const path of ['/server/app.js', '/package.json', '/server/data/tartr8.db']) {
    const res = await fetch(base + path);
    assert.ok(!(await res.text()).includes('require('), path + ' leaked');
  }
});
