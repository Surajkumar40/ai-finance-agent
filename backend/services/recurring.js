const db = require('../config/db');
const { checkBudgets } = require('./alerts');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (v) => {
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  return String(v).slice(0, 10);
};
const todayYMD = () => ymd(new Date());
const daysIn = (y, m) => new Date(y, m, 0).getDate(); // m = 1..12

// Next due date. Monthly/yearly keep the ORIGINAL day (31st -> 28th in Feb -> back to 31st)
function nextDate(dateStr, frequency, anchorDay) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (frequency === 'daily') return ymd(new Date(y, m - 1, d + 1));
  if (frequency === 'weekly') return ymd(new Date(y, m - 1, d + 7));
  const anchor = anchorDay || d;
  if (frequency === 'yearly') {
    return `${y + 1}-${pad(m)}-${pad(Math.min(anchor, daysIn(y + 1, m)))}`;
  }
  // monthly
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(anchor, daysIn(ny, nm)))}`;
}

// Creates a real transaction for every due recurring item (also catches up missed days)
async function processDue(userId = null) {
  const today = todayYMD();
  const params = [today];
  let sql = 'SELECT * FROM recurring_transactions WHERE is_active = 1 AND next_due <= ?';
  if (userId) { sql += ' AND user_id = ?'; params.push(userId); }
  const [items] = await db.query(sql, params);

  let created = 0;
  const users = new Set();
  for (const r of items) {
    let due = ymd(r.next_due);
    let guard = 0;
    while (due <= today && guard < 366) {
      await db.query(
        `INSERT INTO transactions (user_id, title, amount, type, category_id, date, note, is_recurring)
         VALUES (?,?,?,?,?,?,?,1)`,
        [r.user_id, r.title, r.amount, r.type || 'expense', r.category_id, due, 'Recurring (' + r.frequency + ')']
      );
      created++;
      users.add(r.user_id);
      due = nextDate(due, r.frequency, r.anchor_day);
      guard++;
    }
    await db.query('UPDATE recurring_transactions SET next_due = ? WHERE id = ?', [due, r.id]);
  }
  for (const u of users) {
    try { await checkBudgets(u); } catch (e) { console.error('Alert check failed:', e.message); }
  }
  return { created };
}

function startScheduler() {
  const run = () => processDue().then(
    (r) => r.created && console.log(`🔁 Recurring: created ${r.created} transaction(s)`),
    (e) => console.error('Recurring job failed:', e.message)
  );
  run();
  setInterval(run, 60 * 60 * 1000); // every hour
}

module.exports = { processDue, startScheduler, nextDate, ymd, todayYMD };
