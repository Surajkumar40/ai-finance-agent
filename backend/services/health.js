const db = require('../config/db');

const pad = (n) => String(n).padStart(2, '0');
const monthOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const shift = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number);
  return monthOf(new Date(y, m - 1 + delta, 1));
};
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const r1 = (n) => Math.round(n * 10) / 10;
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const num = (v) => Number(v || 0);

const grade = (s) => (s >= 80 ? 'Excellent' : s >= 60 ? 'Good' : s >= 40 ? 'Fair' : 'Needs work');

async function sums(uid, ym) {
  const [rows] = await db.query(
    `SELECT type, COALESCE(SUM(amount),0) AS total, COUNT(*) AS n FROM transactions
      WHERE user_id = ? AND date >= ? AND date < ? GROUP BY type`,
    [uid, `${ym}-01`, `${shift(ym, 1)}-01`]);
  const g = (t) => rows.find((r) => r.type === t);
  return { income: num(g('income')?.total), expense: num(g('expense')?.total), count: num(g('income')?.n) + num(g('expense')?.n) };
}

// Score out of 100 from 5 parts: savings rate 30, budgets 25, spending trend 20, safety net 15, tracking habit 10
async function computeHealth(uid) {
  const now = new Date();
  const month = monthOf(now);
  const cur = await sums(uid, month);
  const prev = await sums(uid, shift(month, -1));

  const [[recent]] = await db.query(
    `SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)`, [uid]);
  if (!num(recent.n)) return { hasData: false };

  const parts = [];

  // 1) Savings rate (target 20% of income)
  {
    const max = 30;
    let score = 0, detail, tip = 'Aim to save at least 20% of what you earn each month.';
    if (cur.income > 0) {
      const rate = (cur.income - cur.expense) / cur.income;
      score = clamp(rate / 0.2) * max;
      detail = `You kept ${Math.round(rate * 100)}% of this month's income (target 20%)`;
      if (rate >= 0.2) tip = 'Great saving rate — keep it up.';
    } else {
      detail = 'No income recorded this month';
      tip = 'Add your income so your savings rate can be measured.';
    }
    parts.push({ key: 'savings', label: 'Savings rate', score: r1(score), max, detail, tip });
  }

  // 2) Budgets on track
  {
    const max = 25;
    const [b] = await db.query(
      `SELECT b.monthly_limit, COALESCE(SUM(t.amount),0) AS spent
         FROM budgets b LEFT JOIN transactions t
           ON t.category_id = b.category_id AND t.user_id = b.user_id AND t.type = 'expense'
          AND DATE_FORMAT(t.date,'%Y-%m-01') = b.month
        WHERE b.user_id = ? AND b.month = ? GROUP BY b.id`, [uid, `${month}-01`]);
    let score, detail, tip;
    if (!b.length) {
      score = max / 2; detail = 'No budgets set for this month';
      tip = 'Set a budget for your biggest spending categories.';
    } else {
      const ok = b.filter((x) => num(x.spent) <= num(x.monthly_limit)).length;
      score = (ok / b.length) * max;
      detail = `${ok} of ${b.length} budgets are on track`;
      tip = ok === b.length ? 'All budgets on track — nice discipline.' : 'Review the budgets you have gone over, or adjust them to realistic limits.';
    }
    parts.push({ key: 'budgets', label: 'Budgets on track', score: r1(score), max, detail, tip });
  }

  // 3) Spending trend (projected this month vs last month)
  {
    const max = 20;
    const day = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let score, detail, tip = 'Keep this month\'s spending at or below last month\'s.';
    if (prev.expense <= 0) { score = max * 0.7; detail = 'No last-month spending to compare with'; }
    else if (day < 5) { score = max * 0.7; detail = 'Too early in the month to judge the trend'; }
    else {
      const projected = (cur.expense / day) * daysInMonth;
      const change = projected / prev.expense - 1;
      score = clamp(1 - change / 0.5) * max; // flat or lower = full marks, +50% = zero
      detail = change <= 0
        ? `On pace to spend ${Math.round(-change * 100)}% less than last month (${inr(prev.expense)})`
        : `On pace to spend ${Math.round(change * 100)}% more than last month (${inr(prev.expense)})`;
      if (change > 0.1) tip = 'Spending is running above last month — check your top categories.';
    }
    parts.push({ key: 'trend', label: 'Spending trend', score: r1(score), max, detail, tip });
  }

  // 4) Safety net: how many months of spending the balance covers (target 3)
  {
    const max = 15;
    const [[all]] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE -amount END),0) AS balance
         FROM transactions WHERE user_id = ?`, [uid]);
    const balance = num(all.balance);
    const m1 = await sums(uid, shift(month, -1)), m2 = await sums(uid, shift(month, -2)), m3 = await sums(uid, shift(month, -3));
    const past = [m1, m2, m3].map((m) => m.expense).filter((e) => e > 0);
    const avg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : cur.expense;
    let score, detail, tip = 'Build a cushion that covers about 3 months of spending.';
    if (avg <= 0) { score = balance > 0 ? max : 0; detail = balance > 0 ? `Balance ${inr(balance)}` : 'No balance yet'; }
    else {
      const months = balance / avg;
      score = clamp(months / 3) * max;
      detail = balance <= 0 ? 'Your balance is not positive yet' : `Your balance covers ${months.toFixed(1)} months of spending (target 3)`;
      if (months >= 3) tip = 'Strong safety net.';
    }
    parts.push({ key: 'safety', label: 'Safety net', score: r1(score), max, detail, tip });
  }

  // 5) Tracking habit: days with at least one entry in the last 30
  {
    const max = 10;
    const [[d]] = await db.query(
      `SELECT COUNT(DISTINCT date) AS days FROM transactions WHERE user_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`, [uid]);
    const days = num(d.days);
    parts.push({
      key: 'habit', label: 'Tracking habit', score: r1(clamp(days / 10) * max), max,
      detail: `You logged entries on ${days} of the last 30 days`,
      tip: days >= 10 ? 'Great tracking habit.' : 'Log expenses as they happen — 10+ active days a month is ideal.',
    });
  }

  const score = r1(parts.reduce((s, p) => s + p.score, 0));
  const focus = [...parts].sort((a, b) => a.score / a.max - b.score / b.max)[0];
  return { hasData: true, score, grade: grade(score), parts, focus: { key: focus.key, label: focus.label, tip: focus.tip } };
}

// Saves one row per day and returns the change versus the last day we scored
async function saveAndCompare(uid, result) {
  const [prevRows] = await db.query(
    `SELECT score FROM financial_health_scores WHERE user_id = ? AND DATE(calculated_at) < CURDATE() ORDER BY id DESC LIMIT 1`, [uid]);
  const [today] = await db.query(
    `SELECT id FROM financial_health_scores WHERE user_id = ? AND DATE(calculated_at) = CURDATE() ORDER BY id DESC LIMIT 1`, [uid]);
  const json = JSON.stringify(result.parts);
  if (today.length) await db.query('UPDATE financial_health_scores SET score = ?, breakdown_json = ?, calculated_at = NOW() WHERE id = ?', [result.score, json, today[0].id]);
  else await db.query('INSERT INTO financial_health_scores (user_id, score, breakdown_json) VALUES (?,?,?)', [uid, result.score, json]);
  const [hist] = await db.query(
    `SELECT score, calculated_at FROM financial_health_scores WHERE user_id = ? ORDER BY id DESC LIMIT 8`, [uid]);
  return {
    change: prevRows[0] ? r1(result.score - num(prevRows[0].score)) : null,
    history: hist.reverse().map((h) => ({ score: num(h.score), date: h.calculated_at })),
  };
}

module.exports = { computeHealth, saveAndCompare };
