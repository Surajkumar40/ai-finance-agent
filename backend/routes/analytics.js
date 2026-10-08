const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');

const pad = (n) => String(n).padStart(2, '0');
const localMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const shift = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const range = (ym) => [`${ym}-01`, `${shift(ym, 1)}-01`]; // [start, nextStart)
const num = (v) => Number(v || 0);

// GET /api/analytics?month=YYYY-MM
router.get('/', auth, async (req, res) => {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || '') ? req.query.month : localMonth();
  const prev = shift(month, -1);
  const uid = req.user.id;
  const [start, end] = range(month);
  const [pStart, pEnd] = range(prev);

  try {
    const totals = async (s, e) => {
      const [rows] = await db.query(
        `SELECT type, COALESCE(SUM(amount),0) AS total, COUNT(*) AS n FROM transactions
          WHERE user_id = ? AND date >= ? AND date < ? GROUP BY type`, [uid, s, e]);
      const get = (t) => rows.find((r) => r.type === t);
      return { income: num(get('income')?.total), expense: num(get('expense')?.total), count: num(get('income')?.n) + num(get('expense')?.n) };
    };
    const cur = await totals(start, end);
    const old = await totals(pStart, pEnd);

    // by category (this month vs last month)
    const catQuery = `SELECT COALESCE(c.name,'Uncategorised') AS name, COALESCE(c.color,'#94a3b8') AS color, SUM(t.amount) AS total
        FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date < ? GROUP BY name, color`;
    const [catsNow] = await db.query(catQuery, [uid, start, end]);
    const [catsPrev] = await db.query(catQuery, [uid, pStart, pEnd]);
    const prevMap = Object.fromEntries(catsPrev.map((c) => [c.name, num(c.total)]));
    const byCategory = catsNow
      .map((c) => ({ name: c.name, color: c.color, total: num(c.total), previous: prevMap[c.name] || 0 }))
      .sort((a, b) => b.total - a.total);

    // daily spending, every day of the month filled in
    const [dayRows] = await db.query(
      `SELECT DAY(date) AS d, SUM(amount) AS total FROM transactions
        WHERE user_id = ? AND type = 'expense' AND date >= ? AND date < ? GROUP BY DAY(date)`, [uid, start, end]);
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const dayMap = Object.fromEntries(dayRows.map((r) => [r.d, num(r.total)]));
    let running = 0;
    const daily = Array.from({ length: daysInMonth }, (_, i) => {
      const amount = dayMap[i + 1] || 0;
      running += amount;
      return { day: i + 1, amount, cumulative: running };
    });

    // last 6 months income vs expense
    const first6 = shift(month, -5);
    const [monthRows] = await db.query(
      `SELECT DATE_FORMAT(date,'%Y-%m') AS ym, type, SUM(amount) AS total FROM transactions
        WHERE user_id = ? AND date >= ? AND date < ? GROUP BY ym, type`, [uid, `${first6}-01`, end]);
    const months = Array.from({ length: 6 }, (_, i) => {
      const ym = shift(first6, i);
      const find = (t) => num(monthRows.find((r) => r.ym === ym && r.type === t)?.total);
      return { month: ym, income: find('income'), expense: find('expense') };
    });

    const [top] = await db.query(
      `SELECT t.title, t.amount, t.date, c.name AS category FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date < ?
        ORDER BY t.amount DESC LIMIT 5`, [uid, start, end]);

    const isCurrent = month === localMonth();
    const elapsed = isCurrent ? new Date().getDate() : daysInMonth;
    const avgPerDay = elapsed ? cur.expense / elapsed : 0;
    const change = old.expense > 0 ? ((cur.expense - old.expense) / old.expense) * 100 : null;

    res.json({
      month, previousMonth: prev, isCurrent,
      totals: { ...cur, net: cur.income - cur.expense, savingsRate: cur.income > 0 ? ((cur.income - cur.expense) / cur.income) * 100 : 0 },
      previous: old,
      expenseChangePercent: change,
      avgPerDay,
      projectedExpense: isCurrent ? avgPerDay * daysInMonth : null,
      byCategory, daily, months,
      topExpenses: top.map((t) => ({ ...t, amount: num(t.amount) })),
    });
  } catch (err) {
    console.error('ANALYTICS ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
