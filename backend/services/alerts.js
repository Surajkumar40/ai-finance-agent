const db = require('../config/db');

const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const currentMonth = () => new Date().toISOString().slice(0, 7); // same convention as routes/budgets.js

// Creates "budget_warning" (>=80%) and "budget_exceeded" (>=100%) alerts.
// Each level is created only ONCE per category per month.
async function checkBudgets(userId) {
  const month = currentMonth();
  const [rows] = await db.query(
    `SELECT b.category_id, b.monthly_limit, c.name AS category_name,
            COALESCE(SUM(t.amount), 0) AS spent
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       LEFT JOIN transactions t
         ON t.category_id = b.category_id AND t.user_id = b.user_id
        AND t.type = 'expense' AND DATE_FORMAT(t.date, '%Y-%m-01') = b.month
      WHERE b.user_id = ? AND b.month = ?
      GROUP BY b.id, c.id`,
    [userId, month + '-01']
  );
  if (!rows.length) return [];

  const [existing] = await db.query(
    `SELECT metadata_json FROM alerts
      WHERE user_id = ? AND type IN ('budget_warning','budget_exceeded') AND triggered_at >= ?`,
    [userId, month + '-01 00:00:00']
  );
  const seen = new Set();
  existing.forEach((e) => {
    try {
      const m = typeof e.metadata_json === 'string' ? JSON.parse(e.metadata_json) : e.metadata_json;
      if (m?.key) seen.add(m.key);
    } catch { /* ignore */ }
  });

  const created = [];
  for (const r of rows) {
    const limit = Number(r.monthly_limit);
    const spent = Number(r.spent);
    if (!(limit > 0)) continue;
    const pct = Math.round((spent / limit) * 100);

    let level = null;
    if (spent >= limit) level = 'exceeded';
    else if (pct >= 80) level = 'warning';
    if (!level) continue;

    const key = `${r.category_id}:${month}:${level}`;
    if (seen.has(key)) continue;
    // if it already crossed 100%, a separate 80% warning is pointless
    if (level === 'exceeded') seen.add(`${r.category_id}:${month}:warning`);

    const message = level === 'exceeded'
      ? `🚨 You've exceeded your ${r.category_name} budget: ${inr(spent)} spent of ${inr(limit)}.`
      : `⚠️ You've used ${pct}% of your ${r.category_name} budget (${inr(spent)} of ${inr(limit)}).`;

    await db.query(
      'INSERT INTO alerts (user_id, type, message, metadata_json) VALUES (?,?,?,?)',
      [userId, `budget_${level}`, message,
       JSON.stringify({ key, category_id: r.category_id, category: r.category_name, spent, limit, percent: pct })]
    );
    seen.add(key);
    created.push(message);
  }
  return created;
}

module.exports = { checkBudgets };
