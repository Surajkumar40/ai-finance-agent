const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { nextDate } = require('../services/recurring');

// GET /api/forecast?days=30|60|90&today=YYYY-MM-DD&daily=<rupees per day>
// Projects your balance day by day: current balance, plus recurring salary/bills and anything already
// dated in the future, minus your usual day-to-day spending. `daily` lets the page try "what if I spend X a day".

const HORIZONS = [30, 60, 90];
const HISTORY_DAYS = 90;
const pad = (n) => String(n).padStart(2, '0');
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const toYMD = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return toYMD(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
const ymdOf = (v) => (v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : String(v).slice(0, 10));
const round2 = (n) => Math.round(n * 100) / 100;
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function validYMD(s) {
  if (typeof s !== 'string' || !YMD_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && toYMD(d) === s;
}
// The browser sends its own date so "today" is right for the visitor, not the server.
function userToday(q) {
  if (validYMD(q) && Math.abs(new Date(q + 'T00:00:00Z') - Date.now()) < 3 * 86400000) return q;
  return new Date().toLocaleDateString('en-CA');
}

// Pure function (no database), so it is easy to test.
//   balance     money you have today (all income minus all expenses up to today)
//   recurring   [{ title, amount, type, frequency, next_due, anchor_day }]
//   scheduled   [{ title, amount, type, date }]  transactions already dated after today
//   spending    { total, firstDate, count } of normal (non-recurring) expenses in the last 90 days
function buildForecast({ today, horizon, balance, recurring, scheduled, spending, dailyOverride }) {
  const end = addDays(today, horizon);
  const first = addDays(today, 1);

  // --- events inside the window ---
  const events = [];
  for (const r of recurring) {
    let due = ymdOf(r.next_due);
    let guard = 0;
    while (due <= end && guard < 400) {
      // an overdue item has not been added yet, so it lands on the first forecast day
      const date = due < first ? first : due;
      events.push({ date, title: r.title, amount: Number(r.amount), type: r.type === 'income' ? 'income' : 'expense', source: 'recurring' });
      due = nextDate(due, r.frequency, r.anchor_day);
      guard++;
    }
  }
  for (const s of scheduled) {
    const date = ymdOf(s.date);
    if (date >= first && date <= end) events.push({ date, title: s.title, amount: Number(s.amount), type: s.type, source: 'scheduled' });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.type === b.type ? 0 : a.type === 'income' ? -1 : 1));

  // --- usual daily spending ---
  let basisDays = 0;
  if (spending.count > 0 && spending.firstDate) basisDays = Math.min(HISTORY_DAYS, Math.max(1, daysBetween(spending.firstDate, today) + 1));
  const learned = basisDays >= 7 ? spending.total / basisDays : 0;
  const hasOverride = Number.isFinite(dailyOverride) && dailyOverride >= 0;
  const daily = round2(hasOverride ? dailyOverride : learned);
  const confidence = hasOverride ? 'custom' : basisDays === 0 || learned === 0 ? 'none' : basisDays < 30 ? 'low' : 'good';

  // --- walk the days ---
  const byDay = new Map();
  for (const e of events) { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); }

  const points = [{ date: today, balance: round2(balance) }];
  let bal = balance, low = { date: today, balance: round2(balance) }, firstNegative = null;
  let income = 0, bills = 0;
  for (let i = 1; i <= horizon; i++) {
    const date = addDays(today, i);
    for (const e of byDay.get(date) || []) {
      if (e.type === 'income') { bal += e.amount; income += e.amount; } else { bal -= e.amount; bills += e.amount; }
    }
    bal -= daily;
    const b = round2(bal);
    points.push({ date, balance: b });
    if (b < low.balance) low = { date, balance: b };
    if (b < 0 && !firstNegative) firstNegative = date;
  }

  const endBalance = points[points.length - 1].balance;
  // what you could spend per day and still finish the window at zero (never negative)
  const safeDaily = Math.max(0, Math.floor((balance + income - bills) / horizon));

  return {
    today, horizon,
    startBalance: round2(balance), endBalance,
    lowest: low, firstNegativeDate: firstNegative,
    dailySpend: daily, confidence, basisDays,
    upcomingIncome: round2(income), upcomingBills: round2(bills),
    safeDaily,
    points, events,
  };
}

router.get('/', auth, async (req, res) => {
  const userId = req.user.id;
  const horizon = Number(req.query.days) || 30;
  if (!HORIZONS.includes(horizon)) return res.status(400).json({ message: 'days must be 30, 60 or 90' });
  let dailyOverride = null;
  if (req.query.daily !== undefined && req.query.daily !== '') {
    dailyOverride = Number(req.query.daily);
    if (!Number.isFinite(dailyOverride) || dailyOverride < 0 || dailyOverride > 10000000) {
      return res.status(400).json({ message: 'daily must be a number of 0 or more' });
    }
  }
  const today = userToday(req.query.today);

  try {
    const [[bal]] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE -amount END), 0) AS balance
         FROM transactions WHERE user_id = ? AND date <= ?`, [userId, today]);
    const [recurring] = await db.query(
      `SELECT title, amount, type, frequency, next_due, anchor_day
         FROM recurring_transactions WHERE user_id = ? AND is_active = 1`, [userId]);
    const [scheduled] = await db.query(
      `SELECT title, amount, type, date FROM transactions WHERE user_id = ? AND date > ? AND date <= ?`,
      [userId, today, addDays(today, horizon)]);

    // Normal spending of the last 90 days. Recurring bills are left out (they are projected separately).
    const recurringTitles = new Set(recurring.map((r) => norm(r.title)));
    const [spent] = await db.query(
      `SELECT title, amount, date, is_recurring FROM transactions
        WHERE user_id = ? AND type = 'expense' AND date <= ? AND date > ?`,
      [userId, today, addDays(today, -HISTORY_DAYS)]);
    const normal = spent.filter((t) => !t.is_recurring && !recurringTitles.has(norm(t.title)));
    const [[firstTx]] = await db.query('SELECT MIN(date) AS first FROM transactions WHERE user_id = ? AND date <= ?', [userId, today]);
    const spending = {
      count: normal.length,
      total: normal.reduce((s, t) => s + Number(t.amount), 0),
      firstDate: firstTx.first ? ymdOf(firstTx.first) : null,
    };

    res.json(buildForecast({ today, horizon, balance: Number(bal.balance), recurring, scheduled, spending, dailyOverride }));
  } catch (err) {
    console.error('FORECAST ERROR:', err.message);
    res.status(500).json({ message: 'Could not build the forecast' });
  }
});

router.buildForecast = buildForecast;
module.exports = router;