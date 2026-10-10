const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { checkBudgets } = require('../services/alerts');

// POST /api/demo  (no login needed)
// Creates a fresh temporary account filled with realistic sample data and returns a login token,
// so anyone can try the app without signing up. Demo accounts are deleted after 24 hours.

const DEMO_EMAIL_LIKE = 'demo-%@demo.local';
const DEMO_NAME = 'Alex Demo';
const DEMO_MAX_PER_HOUR = Number(process.env.DEMO_MAX_PER_HOUR) || 60; // stops anyone flooding the database
const DEMO_LIFETIME = '1 DAY';

// ───────────── small helpers ─────────────
const pad = (n) => String(n).padStart(2, '0');
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
function validYMD(s) {
  if (typeof s !== 'string' || !YMD_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
// The browser sends its own date so "this month" is right for the visitor, not the server.
function visitorToday(req) {
  const t = req.body?.today;
  if (validYMD(t) && Math.abs(new Date(t + 'T00:00:00Z') - Date.now()) < 3 * 86400000) return t;
  return new Date().toLocaleDateString('en-CA');
}
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
function shiftMonth(y, m, delta) {
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}
const ym = ({ y, m }) => `${y}-${pad(m)}`;

// Small seeded random generator: every demo looks a little different but is reproducible per user.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────── the sample data ─────────────
function buildData(rng, today) {
  const [ty, tm, td] = today.split('-').map(Number);
  const between = (lo, hi, step = 5) => Math.round((lo + rng() * (hi - lo)) / step) * step;
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const int = (n) => Math.floor(rng() * n);

  const rows = []; // [date, title, amount, type, categoryName]
  const add = (month, day, title, amount, type, cat) => {
    const d = Math.min(Math.max(1, day), daysInMonth(month.y, month.m));
    const date = `${month.y}-${pad(month.m)}-${pad(d)}`;
    if (date <= today) rows.push([date, title, amount, type, cat]); // never in the future
  };

  for (let ago = 3; ago >= 0; ago--) {
    const M = shiftMonth(ty, tm, -ago);

    // money in
    add(M, 1, 'Salary', 62000, 'income', 'Salary');
    if (ago === 1 || ago === 3 || (ago === 0 && rng() < 0.6)) {
      add(M, 10 + int(5), 'Freelance project', between(8000, 18000, 500), 'income', 'Freelance');
    }

    // bills
    add(M, 2, 'House rent', 14000, 'expense', 'Bills & Utilities');
    add(M, 12, 'Electricity bill', between(1400, 2300), 'expense', 'Bills & Utilities');
    add(M, 15, 'Internet bill', 999, 'expense', 'Bills & Utilities');
    add(M, 18, 'Mobile recharge', 299, 'expense', 'Bills & Utilities');

    // food
    for (let k = 0; k < 4; k++) {
      add(M, 3 + k * 7 + int(2), pick(['BigBasket groceries', 'Local vegetables', 'Reliance Fresh', 'Milk and essentials']),
        between(450, 2100), 'expense', 'Food & Dining');
    }
    const eatOut = 5 + int(3);
    for (let k = 0; k < eatOut; k++) {
      add(M, 1 + int(28), pick(['Swiggy order', 'Zomato order', 'Dinner with friends', 'Chai and snacks', 'Lunch at cafe']),
        between(160, 950), 'expense', 'Food & Dining');
    }

    // transport
    add(M, 5, 'Metro recharge', 500, 'expense', 'Transport');
    const rides = 3 + int(2);
    for (let k = 0; k < rides; k++) {
      add(M, 1 + int(28), pick(['Uber ride', 'Ola ride', 'Auto fare']), between(90, 420), 'expense', 'Transport');
    }
    add(M, 9 + int(4), 'Petrol', between(800, 1500), 'expense', 'Transport');
    add(M, 22 + int(4), 'Petrol', between(800, 1500), 'expense', 'Transport');

    // shopping
    const shops = 1 + int(2);
    for (let k = 0; k < shops; k++) {
      add(M, 4 + int(24), pick(['Amazon order', 'Myntra clothes', 'Flipkart order', 'Decathlon sports gear']),
        between(700, 3800), 'expense', 'Shopping');
    }

    // fun, health, learning, other
    add(M, 8, 'Spotify', 119, 'expense', 'Entertainment');
    add(M, 20, 'Netflix', 649, 'expense', 'Entertainment');
    add(M, 14 + int(12), pick(['Movie tickets', 'Concert tickets']), between(500, 1100), 'expense', 'Entertainment');
    add(M, 6 + int(20), 'Pharmacy', between(180, 750), 'expense', 'Healthcare');
    if (ago === 2) add(M, 16, 'Doctor consultation', 600, 'expense', 'Healthcare');
    if (ago === 2) add(M, 21, 'Udemy course', 499, 'expense', 'Education');
    if (ago === 0) add(M, 11, 'Programming books', 1350, 'expense', 'Education');
    add(M, 5 + int(22), 'Gift for a friend', between(500, 1500), 'expense', 'Other');

    // this month only: one big purchase so the demo shows a budget going over
    if (ago === 0) add(M, Math.min(8, td), 'Weekend trip shopping', 7200, 'expense', 'Shopping');
  }

  const budgetPlan = [
    ['Food & Dining', 9000], ['Transport', 4000], ['Shopping', 5000], ['Bills & Utilities', 18000],
    ['Entertainment', 2000], ['Healthcare', 1500], ['Education', 1000],
  ];
  const cur = { y: ty, m: tm }, prev = shiftMonth(ty, tm, -1);
  const budgets = [];
  for (const month of [cur, prev]) for (const [cat, limit] of budgetPlan) budgets.push([cat, limit, `${ym(month)}-01`]);

  const addMonths = (n) => { const x = shiftMonth(ty, tm, n); return `${ym(x)}-${pad(Math.min(td, daysInMonth(x.y, x.m)))}`; };
  const goals = [
    ['Emergency fund', '🛡️', 150000, 62000, addMonths(8)],
    ['Goa trip', '✈️', 35000, 21500, addMonths(3)],
    ['New laptop', '💻', 80000, 12000, null],
  ];

  // Next time each recurring item falls due: after today, never today (so nothing is added twice).
  const nextDue = (day) => {
    const M = tm + (td < day ? 0 : 1);
    const x = shiftMonth(ty, M, 0);
    return `${ym(x)}-${pad(day)}`;
  };
  const recurring = [
    ['Salary', 62000, 'income', 'Salary', 1],
    ['House rent', 14000, 'expense', 'Bills & Utilities', 2],
    ['Internet bill', 999, 'expense', 'Bills & Utilities', 15],
    ['Netflix', 649, 'expense', 'Entertainment', 20],
    ['Gym membership', 1200, 'expense', 'Healthcare', 5],
  ].map(([title, amount, type, cat, day]) => [title, amount, type, cat, 'monthly', nextDue(day), day]);

  return { rows, budgets, goals, recurring };
}

// ───────────── housekeeping ─────────────
async function removeExpiredDemoUsers() {
  try {
    const [old] = await db.query(
      `SELECT id FROM users WHERE email LIKE ? AND created_at < NOW() - INTERVAL ${DEMO_LIFETIME}`,
      [DEMO_EMAIL_LIKE]
    );
    if (!old.length) return;
    const ids = old.map((u) => u.id);
    // Most tables clean up by themselves (ON DELETE CASCADE); this also covers any that do not.
    for (const table of ['agent_chat_history', 'agent_conversations', 'alerts', 'financial_health_scores',
      'agent_memory', 'audit_logs', 'savings_goals', 'recurring_transactions', 'budgets', 'transactions']) {
      try { await db.query(`DELETE FROM ${table} WHERE user_id IN (?)`, [ids]); }
      catch (e) { if (e.code !== 'ER_NO_SUCH_TABLE') console.warn(`Demo cleanup (${table}):`, e.message); }
    }
    await db.query('DELETE FROM users WHERE id IN (?)', [ids]);
    console.log(`Demo cleanup: removed ${ids.length} expired demo account(s)`);
  } catch (e) {
    console.warn('Demo cleanup skipped:', e.message); // never block a new demo because of cleanup
  }
}

// ───────────── POST /api/demo ─────────────
router.post('/', async (req, res) => {
  let conn;
  try {
    await removeExpiredDemoUsers();

    const [recent] = await db.query(
      `SELECT COUNT(*) AS n FROM users WHERE email LIKE ? AND created_at > NOW() - INTERVAL 1 HOUR`,
      [DEMO_EMAIL_LIKE]
    );
    if (Number(recent[0].n) >= DEMO_MAX_PER_HOUR) {
      return res.status(429).json({ message: 'The demo is very busy right now. Please try again in a few minutes.' });
    }

    const today = visitorToday(req);
    const [cats] = await db.query('SELECT id, name FROM categories WHERE user_id IS NULL');
    const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]));

    const email = `demo-${crypto.randomBytes(6).toString('hex')}@demo.local`;
    // Nobody knows this password, so the account can only be opened through this demo button.
    const password = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 4);

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [u] = await conn.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [DEMO_NAME, email, password]);
    const userId = u.insertId;
    const data = buildData(mulberry32(userId * 2654435761), today);

    await conn.query(
      'INSERT INTO transactions (user_id, title, amount, type, category_id, date) VALUES ?',
      [data.rows.map(([date, title, amount, type, cat]) => [userId, title, amount, type, catId[cat] || null, date])]
    );
    await conn.query(
      'INSERT INTO budgets (user_id, category_id, monthly_limit, month) VALUES ?',
      [data.budgets.filter(([cat]) => catId[cat]).map(([cat, limit, month]) => [userId, catId[cat], limit, month])]
    );
    await conn.query(
      'INSERT INTO savings_goals (user_id, name, icon, target_amount, saved_amount, target_date) VALUES ?',
      [data.goals.map(([name, icon, target, saved, date]) => [userId, name, icon, target, saved, date])]
    );
    await conn.query(
      'INSERT INTO recurring_transactions (user_id, title, amount, type, category_id, frequency, next_due, anchor_day) VALUES ?',
      [data.recurring.map(([title, amount, type, cat, freq, due, day]) => [userId, title, amount, type, catId[cat] || null, freq, due, day])]
    );
    await conn.commit();

    // Creates the "budget exceeded" notifications a real account would have. Not essential.
    try { await checkBudgets(userId); } catch (e) { console.warn('Demo alert check skipped:', e.message); }

    const token = jwt.sign({ userId, email }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.status(201).json({ token, user: { id: userId, name: DEMO_NAME, email } });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch { /* ignore */ } }
    console.error('DEMO ERROR:', err.message);
    res.status(500).json({ message: 'Could not start the demo. Please try again.' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;