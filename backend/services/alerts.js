const db = require('../config/db');

const cur = require('./currency'); // amounts in alert texts use each person's own display currency
const currentMonth = () => new Date().toISOString().slice(0, 7); // same convention as routes/budgets.js

// Creates "budget_warning" (>=80%) and "budget_exceeded" (>=100%) alerts.
// Each level is created only ONCE per category per month.
async function checkPersonalBudgets(userId) {
  const inr = await cur.forUser(userId);
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


// ───────────────────────── Unusual spending, duplicate charges, bill reminders ─────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const toYMD = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return toYMD(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
const ymdOf = (v) => (v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : String(v).slice(0, 10));
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y), m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// The browser sends its own date so "today" is right for the visitor, not the server.
function userToday(q) {
  if (typeof q === 'string' && YMD_RE.test(q) && toYMD(new Date(q + 'T00:00:00Z')) === q
      && Math.abs(new Date(q + 'T00:00:00Z') - Date.now()) < 3 * 86400000) return q;
  return new Date().toLocaleDateString('en-CA');
}

const ANOMALY_WINDOW_DAYS = 7;   // only look at spending from the last week
const BASELINE_DAYS = 90;        // "normal" is the 90 days before the purchase
const MIN_HISTORY = 5;           // need at least 5 earlier purchases in the category
const MIN_MULTIPLE = 3;          // flag purchases 3 times the usual (median) or more
const MIN_AMOUNT = 1000;         // and never flag small amounts
const MAX_NEW_PER_CHECK = 3;     // stops a flood after a big import

// Pure: expenses = [{ id, title, amount, date, category_id, is_recurring }]
function findAnomalies(expenses, today, recurringTitles = new Set()) {
  const out = [];
  const from = addDays(today, -ANOMALY_WINDOW_DAYS);
  for (const t of expenses) {
    const date = ymdOf(t.date);
    if (date < from || date > today || t.is_recurring || recurringTitles.has(norm(t.title))) continue;
    const amount = Number(t.amount);
    if (!(amount >= MIN_AMOUNT)) continue;
    const base = addDays(date, -BASELINE_DAYS);
    const history = expenses.filter((o) => o.id !== t.id && (o.category_id ?? null) === (t.category_id ?? null)
      && !o.is_recurring && !recurringTitles.has(norm(o.title)) && ymdOf(o.date) >= base && ymdOf(o.date) <= date);
    if (history.length < MIN_HISTORY) continue;
    const usual = median(history.map((o) => Number(o.amount)));
    if (usual > 0 && amount >= usual * MIN_MULTIPLE) out.push({ transaction: t, amount, usual, date });
  }
  return out.sort((a, b) => b.amount / b.usual - a.amount / a.usual);
}

// Pure: the same shop and amount twice within a day, e.g. a double charge
function findDuplicates(expenses, today) {
  const from = addDays(today, -ANOMALY_WINDOW_DAYS);
  const recent = expenses.filter((t) => !t.is_recurring && ymdOf(t.date) >= from && ymdOf(t.date) <= today && Number(t.amount) >= 100);
  const out = [];
  const used = new Set();
  for (let i = 0; i < recent.length; i++) {
    for (let j = i + 1; j < recent.length; j++) {
      const a = recent[i], b = recent[j];
      if (used.has(a.id) || used.has(b.id)) continue;
      if (norm(a.title) && norm(a.title) === norm(b.title) && Number(a.amount) === Number(b.amount)
          && Math.abs(daysBetween(ymdOf(a.date), ymdOf(b.date))) <= 1) {
        used.add(a.id); used.add(b.id);
        out.push({ first: a.id < b.id ? a : b, second: a.id < b.id ? b : a });
      }
    }
  }
  return out;
}

const SEEN_TYPES = ['anomaly', 'duplicate_charge', 'bill_due'];
// Personal budgets, then the shared household budgets (a failure in one never blocks the other).
async function checkBudgets(userId) {
  const created = await checkPersonalBudgets(userId);
  try {
    const shared = await require('./household').checkHouseholdBudgets(userId);
    return created.concat(shared);
  } catch (e) {
    console.error('Shared budget check failed:', e.message);
    return created;
  }
}

async function seenKeys(userId) {
  const [rows] = await db.query(
    `SELECT metadata_json FROM alerts WHERE user_id = ? AND type IN (${SEEN_TYPES.map(() => '?').join(',')})
        AND triggered_at >= NOW() - INTERVAL 180 DAY`, [userId, ...SEEN_TYPES]);
  const seen = new Set();
  for (const r of rows) {
    try { const m = typeof r.metadata_json === 'string' ? JSON.parse(r.metadata_json) : r.metadata_json; if (m?.key) seen.add(m.key); }
    catch { /* ignore */ }
  }
  return seen;
}
const insertAlert = (userId, type, message, meta) =>
  db.query('INSERT INTO alerts (user_id, type, message, metadata_json) VALUES (?,?,?,?)', [userId, type, message, JSON.stringify(meta)]);

// Creates "anomaly" and "duplicate_charge" alerts, each only once per transaction.
async function checkSpending(userId, today) {
  const inr = await cur.forUser(userId);
  const [expenses] = await db.query(
    `SELECT t.id, t.title, t.amount, t.date, t.category_id, t.is_recurring, c.name AS category_name
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ? AND t.type = 'expense' AND t.date <= ? AND t.date >= ?`,
    [userId, today, addDays(today, -(ANOMALY_WINDOW_DAYS + BASELINE_DAYS))]);
  if (!expenses.length) return [];
  const [rec] = await db.query('SELECT title FROM recurring_transactions WHERE user_id = ?', [userId]);
  const recurringTitles = new Set(rec.map((r) => norm(r.title)));
  const seen = await seenKeys(userId);
  const created = [];

  for (const a of findAnomalies(expenses, today, recurringTitles)) {
    if (created.length >= MAX_NEW_PER_CHECK) break;
    const key = `anomaly:${a.transaction.id}`;
    if (seen.has(key)) continue;
    const cat = a.transaction.category_name || 'this category';
    const message = `🔍 Unusual spend: ${inr(a.amount)} on "${a.transaction.title}". Your usual ${cat} purchase is about ${inr(a.usual)}.`;
    await insertAlert(userId, 'anomaly', message, { key, transaction_id: a.transaction.id, amount: a.amount, usual: a.usual });
    seen.add(key); created.push(message);
  }
  for (const d of findDuplicates(expenses, today)) {
    if (created.length >= MAX_NEW_PER_CHECK) break;
    const key = `duplicate:${d.first.id}:${d.second.id}`;
    if (seen.has(key)) continue;
    const message = `👯 Possible double charge: ${inr(d.first.amount)} on "${d.first.title}" appears twice within a day.`;
    await insertAlert(userId, 'duplicate_charge', message, { key, transaction_ids: [d.first.id, d.second.id] });
    seen.add(key); created.push(message);
  }
  return created;
}

const BILL_REMINDER_DAYS = 3;
// "bill_due" alert when a recurring expense is due within 3 days. Once per bill per due date.
async function checkBills(userId, today) {
  const inr = await cur.forUser(userId);
  const [bills] = await db.query(
    `SELECT id, title, amount, next_due FROM recurring_transactions
      WHERE user_id = ? AND is_active = 1 AND type = 'expense' AND next_due >= ? AND next_due <= ?`,
    [userId, today, addDays(today, BILL_REMINDER_DAYS)]);
  if (!bills.length) return [];
  const seen = await seenKeys(userId);
  const created = [];
  for (const b of bills) {
    const due = ymdOf(b.next_due);
    const key = `bill:${b.id}:${due}`;
    if (seen.has(key)) continue;
    const n = daysBetween(today, due);
    const when = n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
    const label = new Date(due + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const message = `📅 ${b.title} (${inr(b.amount)}) is due ${when}, ${label}.`;
    await insertAlert(userId, 'bill_due', message, { key, recurring_id: b.id, due, amount: Number(b.amount) });
    seen.add(key); created.push(message);
  }
  return created;
}

module.exports = { checkBudgets, checkSpending, checkBills, findAnomalies, findDuplicates, userToday };