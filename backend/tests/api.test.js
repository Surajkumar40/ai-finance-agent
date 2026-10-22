// End-to-end tests: starts the real API against a real MySQL database and calls it over HTTP.
// Needs a database that has had schema.sql and database/migrate.js applied, and backend/.env pointing to it.
// Run with:  npm run test:api        (CI does this on every push)
process.env.NODE_ENV = 'test'; // switches the rate limits off so the tests can make many requests
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = process.env.TEST_PORT || '5059';
const API = `http://127.0.0.1:${PORT}/api`;
let server;

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const today = ymd(new Date());
const month = today.slice(0, 7);
const future = '2031-01-05';

async function call(method, url, body, token) {
  const res = await fetch(API + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* some answers have no body */ }
  return { status: res.status, data };
}

async function newUser(tag) {
  const email = `ci-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.com`;
  const reg = await call('POST', '/auth/register', { name: `User ${tag}`, email, password: 'secret123' });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const login = await call('POST', '/auth/login', { email, password: 'secret123' });
  assert.equal(login.status, 200);
  return { email, token: login.data.token };
}

const tx = (over = {}) => ({ title: 'Coffee', amount: 120, type: 'expense', date: today, ...over });

test.before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test', PORT },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) return; } catch { /* not up yet */ }
    if (server.exitCode !== null) throw new Error('The API stopped while starting:\n' + log);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('The API did not start in 30 seconds:\n' + log);
});

test.after(() => { if (server) server.kill(); });

// ───────────────────────── sign-in and security basics ─────────────────────────
test('auth: sign up, sign in, and the usual mistakes are refused', async () => {
  const { email } = await newUser('auth');
  assert.equal((await call('POST', '/auth/register', { name: 'Again', email, password: 'secret123' })).status, 409); // email taken
  assert.equal((await call('POST', '/auth/register', { name: 'Weak', email: 'weak@test.com', password: '1' })).status, 400); // too short
  assert.equal((await call('POST', '/auth/login', { email, password: 'not-the-password' })).status, 401);
});

test('auth: private routes need a valid token (none is 401, a bad or expired one is 403)', async () => {
  for (const url of ['/transactions', '/budgets?month=' + month, '/goals', '/recurring', '/account/export']) {
    assert.equal((await call('GET', url)).status, 401, url);
  }
  assert.equal((await call('GET', '/transactions', undefined, 'not.a.token')).status, 403);
});

test('security: responses carry the protective headers and do not reveal the framework', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-powered-by'), null);
});

// ───────────────────────── transactions ─────────────────────────
test('transactions: create, list, edit and delete', async () => {
  const { token } = await newUser('tx');
  const made = await call('POST', '/transactions', tx({ note: 'morning' }), token);
  assert.equal(made.status, 201);
  const list = await call('GET', '/transactions', undefined, token);
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].date, today, 'dates travel as plain YYYY-MM-DD text');
  assert.equal(list.data[0].note, 'morning');

  assert.equal((await call('PUT', `/transactions/${made.data.id}`, tx({ title: 'Tea', amount: 80 }), token)).status, 200);
  const after = (await call('GET', `/transactions/${made.data.id}`, undefined, token)).data;
  assert.deepEqual([after.title, Number(after.amount)], ['Tea', 80]);

  assert.equal((await call('DELETE', `/transactions/${made.data.id}`, undefined, token)).status, 200);
  assert.equal((await call('GET', '/transactions', undefined, token)).data.length, 0);
});

test('transactions: bad input is refused with a clear message', async () => {
  const { token } = await newUser('txbad');
  for (const bad of [{ amount: -5 }, { amount: 0 }, { amount: 'abc' }, { title: '' }, { type: 'gift' }, { date: '2026-13-45' }, { date: '01/02/2026' }]) {
    const r = await call('POST', '/transactions', tx(bad), token);
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.ok(r.data.message, JSON.stringify(bad));
  }
});

test('transactions: bulk delete can be undone with restore, keeping every field', async () => {
  const { token } = await newUser('bulk');
  const cat = (await call('GET', '/categories', undefined, token)).data[0].id;
  await call('POST', '/transactions', tx({ title: 'One', category_id: cat, note: 'n1' }), token);
  await call('POST', '/transactions', tx({ title: 'Two', amount: 55.5 }), token);
  const rows = (await call('GET', '/transactions', undefined, token)).data;
  const del = await call('POST', '/transactions/bulk/delete', { ids: rows.map((r) => r.id) }, token);
  assert.equal(del.data.deleted, 2);
  assert.equal((await call('GET', '/transactions', undefined, token)).data.length, 0);

  const back = await call('POST', '/transactions/bulk/restore', {
    rows: rows.map((r) => ({ title: r.title, amount: Number(r.amount), type: r.type, category_id: r.category_id, date: r.date, note: r.note, is_recurring: !!r.is_recurring })),
  }, token);
  assert.equal(back.data.restored, 2);
  const again = (await call('GET', '/transactions', undefined, token)).data.sort((a, b) => a.title.localeCompare(b.title));
  assert.deepEqual(again.map((r) => [r.title, Number(r.amount), r.category_id, r.note, r.date]), [['One', 120, cat, 'n1', today], ['Two', 55.5, null, null, today]]);
});

test('transactions: nobody can see or change another person\'s data', async () => {
  const alice = await newUser('alice');
  const bob = await newUser('bob');
  const mine = (await call('POST', '/transactions', tx({ title: 'Private' }), alice.token)).data.id;

  assert.equal((await call('GET', `/transactions/${mine}`, undefined, bob.token)).status, 404);
  assert.equal((await call('PUT', `/transactions/${mine}`, tx({ title: 'Hacked' }), bob.token)).status, 404);
  assert.equal((await call('DELETE', `/transactions/${mine}`, undefined, bob.token)).status, 404);
  assert.equal((await call('POST', '/transactions/bulk/delete', { ids: [mine] }, bob.token)).data.deleted, 0);
  assert.equal((await call('GET', '/transactions', undefined, bob.token)).data.length, 0);

  const still = (await call('GET', `/transactions/${mine}`, undefined, alice.token)).data;
  assert.equal(still.title, 'Private');

  const exported = await call('GET', '/account/export?format=json', undefined, bob.token);
  assert.equal(exported.data.transactions.length, 0, 'the export only holds the caller\'s own data');
});

// ───────────────────────── budgets, goals, recurring ─────────────────────────
test('budgets: spending is counted against the limit for that month', async () => {
  const { token } = await newUser('budget');
  const cat = (await call('GET', '/categories', undefined, token)).data[0].id;
  assert.equal((await call('POST', '/budgets', { category_id: cat, monthly_limit: 5000, month }, token)).status, 200);
  await call('POST', '/transactions', tx({ amount: 1200, category_id: cat }), token);
  await call('POST', '/transactions', tx({ amount: 300, category_id: cat }), token);
  await call('POST', '/transactions', tx({ amount: 9999, type: 'income', category_id: cat }), token); // income is not spending
  const rows = (await call('GET', `/budgets?month=${month}`, undefined, token)).data;
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].monthly_limit), 5000);
  assert.equal(Number(rows[0].spent), 1500);
});

test('goals: a goal can be created and listed', async () => {
  const { token } = await newUser('goal');
  const made = await call('POST', '/goals', { name: 'Trip', target_amount: 10000, saved_amount: 2500, target_date: '2031-01-01' }, token);
  assert.equal(made.status, 201);
  const goals = (await call('GET', '/goals', undefined, token)).data;
  assert.equal(goals.length, 1);
  assert.equal(goals[0].name, 'Trip');
  assert.equal((await call('POST', '/goals', { name: '', target_amount: 10 }, token)).status, 400);
});

test('recurring: an item can be created, and moving its date into the past is refused', async () => {
  const { token } = await newUser('rec');
  const made = await call('POST', '/recurring', { title: 'Rent', amount: 15000, type: 'expense', frequency: 'monthly', next_due: future }, token);
  assert.equal(made.status, 201);
  const past = await call('PUT', `/recurring/${made.data.id}`, { next_due: '2020-01-01', today }, token);
  assert.equal(past.status, 400);
  assert.match(past.data.message, /past/i);
  assert.equal((await call('PUT', `/recurring/${made.data.id}`, { next_due: '2031-06-01', today }, token)).status, 200);
  const list = (await call('GET', '/recurring', undefined, token)).data;
  assert.equal(list[0].next_due, '2031-06-01');
});

test('recurring: repeating payments in the history are spotted and can be dismissed', async () => {
  const { token } = await newUser('detect');
  const last = 3; // days ago; the other two are about a month apart before that
  for (const ago of [last, last + 30, last + 61]) await call('POST', '/transactions', tx({ title: 'Netflix', amount: 649, date: daysAgo(ago) }), token);
  const found = (await call('GET', `/recurring/suggestions?today=${today}`, undefined, token)).data.suggestions;
  assert.equal(found.length, 1);
  assert.deepEqual([found[0].title, found[0].frequency, found[0].amount], ['Netflix', 'monthly', 649]);
  assert.ok(found[0].next_due > today, 'the next due date is in the future');
});

// ───────────────────────── demo and export ─────────────────────────
test('demo: one call creates a ready-to-use account full of realistic data', async () => {
  const demo = await call('POST', '/demo', { today });
  assert.equal(demo.status, 201);
  assert.ok(demo.data.token);
  const txs = (await call('GET', '/transactions', undefined, demo.data.token)).data;
  assert.ok(txs.length > 50, `expected a rich history, got ${txs.length}`);
  assert.ok((await call('GET', '/goals', undefined, demo.data.token)).data.length >= 1);
  assert.ok((await call('GET', '/recurring', undefined, demo.data.token)).data.length >= 1);
});

test('export: the CSV download is spreadsheet-safe and the JSON holds everything', async () => {
  const { token } = await newUser('export');
  await call('POST', '/transactions', tx({ title: '=HYPERLINK("http://evil")' }), token);
  const res = await fetch(`${API}/account/export?format=csv`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  const csv = await res.text();
  assert.ok(csv.includes("'=HYPERLINK"), 'text that starts like a formula is neutralised');
  const json = (await call('GET', '/account/export?format=json', undefined, token)).data;
  assert.deepEqual(Object.keys(json).sort(), ['account', 'budgets', 'customCategories', 'exportedAt', 'goals', 'netWorth', 'recurring', 'transactions']);
});