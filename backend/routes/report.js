const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// GET /api/report?month=YYYY-MM&today=YYYY-MM-DD
// Everything the monthly report page needs, in one call. Month defaults to the current month.

const pad = (n) => String(n).padStart(2, '0');
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const toYMD = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const ymdOf = (v) => (v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : String(v).slice(0, 10));
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
const shiftMonth = (month, delta) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const currency = require('../services/currency');
const round2 = (n) => Math.round(n * 100) / 100;
const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const dayLabel = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// The browser sends its own date so "this month" is right for the visitor, not the server.
function userToday(q) {
  if (typeof q === 'string' && YMD_RE.test(q) && toYMD(new Date(q + 'T00:00:00Z')) === q
      && Math.abs(new Date(q + 'T00:00:00Z') - Date.now()) < 3 * 86400000) return q;
  return new Date().toLocaleDateString('en-CA');
}

// Pure function (no database), so it is easy to test.
//   cur / prev  transactions of the month and of the month before: [{ id, title, amount, type, date, category_id, category_name, icon, color }]
//   budgets     [{ category_id, category_name, icon, color, monthly_limit }]
//   goals       [{ name, icon, target_amount, saved_amount, completed_at }]
function buildReport({ month, today, cur, prev, budgets, goals, currencyCode }) {
  const fmt = currency.formatter(currencyCode);
  const inr = (n) => fmt(Math.round(Number(n)));
  const [y, m] = month.split('-').map(Number);
  const dim = daysInMonth(y, m);
  const todayMonth = today.slice(0, 7);
  const isCurrent = month === todayMonth;
  const isFuture = month > todayMonth;
  const elapsed = isFuture ? 0 : isCurrent ? Number(today.slice(8, 10)) : dim;

  const sum = (rows, type) => rows.filter((t) => t.type === type).reduce((s, t) => s + Number(t.amount), 0);
  const income = sum(cur, 'income'), expenses = sum(cur, 'expense');
  const pIncome = sum(prev, 'income'), pExpenses = sum(prev, 'expense');
  const net = income - expenses;
  const totals = {
    income: round2(income), expenses: round2(expenses), net: round2(net),
    savingsRate: income > 0 ? Math.round((net / income) * 100) : null,
    txCount: cur.length,
  };
  const previous = { income: round2(pIncome), expenses: round2(pExpenses), net: round2(pIncome - pExpenses) };
  const change = { incomePct: pct(income, pIncome), expensesPct: pct(expenses, pExpenses) };

  // spending by category (this month vs last month)
  const keyOf = (t) => t.category_id ?? 0;
  const cat = new Map();
  for (const t of cur) {
    if (t.type !== 'expense') continue;
    const k = keyOf(t);
    if (!cat.has(k)) cat.set(k, { category_id: t.category_id ?? null, name: t.category_name || 'Uncategorized', icon: t.icon || '📦', color: t.color || '#94a3b8', amount: 0, previous: 0 });
    cat.get(k).amount += Number(t.amount);
  }
  for (const t of prev) {
    if (t.type !== 'expense') continue;
    const e = cat.get(keyOf(t));
    if (e) e.previous += Number(t.amount);
  }
  const categories = [...cat.values()].sort((a, b) => b.amount - a.amount).map((c) => ({
    ...c, amount: round2(c.amount), previous: round2(c.previous),
    share: expenses > 0 ? Math.round((c.amount / expenses) * 100) : 0,
    changePct: pct(c.amount, c.previous),
  }));

  // budgets of this month vs what was actually spent
  const spentBy = new Map(categories.map((c) => [c.category_id, c.amount]));
  const budgetRows = budgets.map((b) => {
    const limit = Number(b.monthly_limit), spent = spentBy.get(b.category_id) || 0;
    const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    return { category_id: b.category_id, name: b.category_name, icon: b.icon, color: b.color, limit: round2(limit), spent: round2(spent),
      percent, status: spent >= limit ? 'over' : percent >= 80 ? 'warning' : 'ok' };
  }).sort((a, b) => b.percent - a.percent);

  // day by day spending
  const byDay = new Map();
  for (const t of cur) if (t.type === 'expense') byDay.set(ymdOf(t.date), (byDay.get(ymdOf(t.date)) || 0) + Number(t.amount));
  const daily = [];
  for (let d = 1; d <= dim; d++) {
    const date = `${month}-${pad(d)}`;
    daily.push({ date, amount: round2(byDay.get(date) || 0), future: d > elapsed });
  }
  const noSpendDays = daily.filter((d) => !d.future && d.amount === 0).length;
  const avgDailySpend = elapsed > 0 ? round2(expenses / elapsed) : 0;

  const topExpenses = cur.filter((t) => t.type === 'expense')
    .sort((a, b) => Number(b.amount) - Number(a.amount) || a.id - b.id).slice(0, 5)
    .map((t) => ({ id: t.id, title: t.title, amount: Number(t.amount), date: ymdOf(t.date), category: t.category_name || 'Uncategorized', icon: t.icon || '📦' }));

  const goalRows = goals.map((g) => {
    const target = Number(g.target_amount), saved = Number(g.saved_amount);
    return { name: g.name, icon: g.icon || '🎯', target: round2(target), saved: round2(saved),
      percent: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0, completed: !!g.completed_at || saved >= target };
  });

  // plain-language summary
  const highlights = [];
  if (!cur.length) {
    highlights.push('No transactions were recorded this month.');
  } else {
    if (expenses > 0) {
      highlights.push(change.expensesPct === null
        ? `You spent ${inr(expenses)} this month.`
        : `You spent ${inr(expenses)}, ${change.expensesPct === 0 ? 'the same as' : `${Math.abs(change.expensesPct)}% ${change.expensesPct > 0 ? 'more than' : 'less than'}`} last month (${inr(pExpenses)}).`);
    }
    if (income > 0) {
      highlights.push(net >= 0
        ? `You saved ${totals.savingsRate}% of your income (${inr(net)}).`
        : `You spent ${inr(-net)} more than you earned.`);
    }
    if (categories.length) highlights.push(`Biggest category: ${categories[0].name} at ${inr(categories[0].amount)} (${categories[0].share}% of spending).`);
    if (topExpenses.length) highlights.push(`Largest single expense: ${topExpenses[0].title}, ${inr(topExpenses[0].amount)} on ${dayLabel(topExpenses[0].date)}.`);
    const over = budgetRows.filter((b) => b.status === 'over');
    if (over.length) highlights.push(`Over budget: ${over.map((b) => `${b.name} (${inr(b.spent)} of ${inr(b.limit)})`).join(', ')}.`);
    else if (budgetRows.length) highlights.push(`All ${budgetRows.length} budget${budgetRows.length === 1 ? ' is' : 's are'} on track.`);
    const rose = categories.filter((c) => c.previous > 0 && c.amount - c.previous >= 500 && c.changePct >= 30)
      .sort((a, b) => (b.amount - b.previous) - (a.amount - a.previous))[0];
    if (rose) highlights.push(`Spending on ${rose.name} rose ${rose.changePct}% (${inr(rose.amount - rose.previous)} more than last month).`);
    if (elapsed >= 7 && noSpendDays > 0) highlights.push(`You had ${noSpendDays} no-spend day${noSpendDays === 1 ? '' : 's'}.`);
  }

  return { month, isCurrentMonth: isCurrent, isFuture, daysInMonth: dim, daysElapsed: elapsed,
    totals, previous, change, categories, budgets: budgetRows, daily, noSpendDays, avgDailySpend, topExpenses, goals: goalRows, highlights };
}

router.get('/', auth, async (req, res) => {
  const userId = req.user.id;
  const today = userToday(req.query.today);
  const month = req.query.month === undefined || req.query.month === '' ? today.slice(0, 7) : req.query.month;
  if (!MONTH_RE.test(month)) return res.status(400).json({ message: 'Invalid month. Use YYYY-MM.' });
  const year = Number(month.slice(0, 4));
  if (year < 1990 || year > 2100) return res.status(400).json({ message: 'Invalid month.' });

  const first = `${month}-01`, next = `${shiftMonth(month, 1)}-01`, prevFirst = `${shiftMonth(month, -1)}-01`;
  const sql = `SELECT t.id, t.title, t.amount, t.type, t.date, t.category_id, c.name AS category_name, c.icon, c.color
                 FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
                WHERE t.user_id = ? AND t.date >= ? AND t.date < ?`;
  try {
    const [cur] = await db.query(sql, [userId, first, next]);
    const [prev] = await db.query(sql, [userId, prevFirst, first]);
    const [budgets] = await db.query(
      `SELECT b.category_id, b.monthly_limit, c.name AS category_name, c.icon, c.color
         FROM budgets b JOIN categories c ON c.id = b.category_id WHERE b.user_id = ? AND b.month = ?`, [userId, first]);
    const [goals] = await db.query(
      'SELECT name, icon, target_amount, saved_amount, completed_at FROM savings_goals WHERE user_id = ? ORDER BY id', [userId]);
    res.json(buildReport({ month, today, cur, prev, budgets, goals, currencyCode: await currency.codeOf(userId) }));
  } catch (err) {
    console.error('REPORT ERROR:', err.message);
    res.status(500).json({ message: 'Could not build the report' });
  }
});

router.buildReport = buildReport;
module.exports = router;