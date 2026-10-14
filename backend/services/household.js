// Shared budgets ("households"): a few people (a couple, a family, flatmates) who track budgets together.
// Rules in one place:
//  - one person belongs to at most one household
//  - members see each other's TOTALS per category, never single transactions
//  - shared budgets use the standard categories only (everyone has those, custom ones are private)
//  - the tables are created the first time they are needed, so no migration is required
const db = require('../config/db');

const MAX_MEMBERS = 6; // members + pending invites

let ready;
function ensureTables() {
  if (!ready) {
    ready = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS households (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(60) NOT NULL,
          owner_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
      await db.query(`
        CREATE TABLE IF NOT EXISTS household_members (
          id INT AUTO_INCREMENT PRIMARY KEY,
          household_id INT NOT NULL,
          user_id INT NOT NULL,
          role ENUM('owner','member') NOT NULL DEFAULT 'member',
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY one_household_per_user (user_id),
          FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
      await db.query(`
        CREATE TABLE IF NOT EXISTS household_invites (
          id INT AUTO_INCREMENT PRIMARY KEY,
          household_id INT NOT NULL,
          email VARCHAR(100) NOT NULL,
          token_hash CHAR(64) NOT NULL,
          invited_by INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL,
          accepted_at DATETIME NULL,
          revoked_at DATETIME NULL,
          INDEX idx_token (token_hash),
          INDEX idx_email (email),
          FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
          FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
        )`);
      await db.query(`
        CREATE TABLE IF NOT EXISTS household_budgets (
          id INT AUTO_INCREMENT PRIMARY KEY,
          household_id INT NOT NULL,
          category_id INT NOT NULL,
          monthly_limit DECIMAL(12,2) NOT NULL,
          month DATE NOT NULL,
          created_by INT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY one_per_category_month (household_id, category_id, month),
          FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )`);
    })().catch((e) => { ready = null; throw e; }); // try again next time if it failed
  }
  return ready;
}

// { household_id, name, role, owner_id } or null
async function membershipOf(userId, conn = db) {
  const [rows] = await conn.query(
    `SELECT m.household_id, m.role, h.name, h.owner_id
       FROM household_members m JOIN households h ON h.id = m.household_id
      WHERE m.user_id = ?`, [userId]);
  return rows[0] || null;
}

// Only from settings, never from the request (same rule as the password reset link).
function frontendUrl() {
  let u = String(process.env.FRONTEND_URL || 'http://localhost:5173').trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

// Takes a user out of their household. Used when they leave and when their account is deleted.
// The owner leaving hands the household to the person who joined first; the last person leaving closes it.
async function removeUserFromHousehold(userId, conn = db) {
  const mem = await membershipOf(userId, conn);
  if (!mem) return { left: false };
  const [others] = await conn.query(
    'SELECT user_id FROM household_members WHERE household_id = ? AND user_id <> ? ORDER BY joined_at, id', [mem.household_id, userId]);
  if (!others.length) {
    await conn.query('DELETE FROM households WHERE id = ?', [mem.household_id]); // members, invites, budgets go with it
    return { left: true, closed: true };
  }
  if (mem.role === 'owner') {
    const next = others[0].user_id;
    await conn.query("UPDATE household_members SET role = 'owner' WHERE household_id = ? AND user_id = ?", [mem.household_id, next]);
    await conn.query('UPDATE households SET owner_id = ? WHERE id = ?', [next, mem.household_id]);
  }
  await conn.query('DELETE FROM household_members WHERE user_id = ?', [userId]);
  return { left: true, closed: false };
}

const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const currentMonth = () => new Date().toISOString().slice(0, 7);

// "Shared" budget alerts: when everyone's spending together passes 80% or 100% of a shared budget,
// every member gets one alert per level per month (same dedupe idea as personal budgets).
async function checkHouseholdBudgets(userId) {
  await ensureTables();
  const mem = await membershipOf(userId);
  if (!mem) return [];
  const month = currentMonth();
  const [rows] = await db.query(
    `SELECT hb.category_id, hb.monthly_limit, c.name AS category_name,
            COALESCE(SUM(t.amount), 0) AS spent
       FROM household_budgets hb
       JOIN categories c ON c.id = hb.category_id
       LEFT JOIN transactions t
         ON t.category_id = hb.category_id AND t.type = 'expense'
        AND DATE_FORMAT(t.date, '%Y-%m-01') = hb.month
        AND t.user_id IN (SELECT user_id FROM household_members WHERE household_id = hb.household_id)
      WHERE hb.household_id = ? AND hb.month = ?
      GROUP BY hb.id, c.id`, [mem.household_id, month + '-01']);
  if (!rows.length) return [];
  const [members] = await db.query('SELECT user_id FROM household_members WHERE household_id = ?', [mem.household_id]);

  const created = [];
  for (const m of members) {
    const [existing] = await db.query(
      `SELECT metadata_json FROM alerts WHERE user_id = ? AND type IN ('budget_warning','budget_exceeded') AND triggered_at >= ?`,
      [m.user_id, month + '-01 00:00:00']);
    const seen = new Set();
    existing.forEach((e) => { try { const j = typeof e.metadata_json === 'string' ? JSON.parse(e.metadata_json) : e.metadata_json; if (j?.key) seen.add(j.key); } catch { /* ignore */ } });

    for (const r of rows) {
      const limit = Number(r.monthly_limit), spent = Number(r.spent);
      if (!(limit > 0)) continue;
      const pct = Math.round((spent / limit) * 100);
      const level = spent >= limit ? 'exceeded' : pct >= 80 ? 'warning' : null;
      if (!level) continue;
      const key = `h${mem.household_id}:${r.category_id}:${month}:${level}`;
      if (seen.has(key)) continue;
      if (level === 'exceeded') seen.add(`h${mem.household_id}:${r.category_id}:${month}:warning`);
      const message = level === 'exceeded'
        ? `🚨 Shared budget "${mem.name}": ${r.category_name} is over its limit, ${inr(spent)} spent of ${inr(limit)}.`
        : `⚠️ Shared budget "${mem.name}": ${pct}% of ${r.category_name} used (${inr(spent)} of ${inr(limit)}).`;
      await db.query('INSERT INTO alerts (user_id, type, message, metadata_json) VALUES (?,?,?,?)',
        [m.user_id, `budget_${level}`, message, JSON.stringify({ key, shared: true, category_id: r.category_id, category: r.category_name, spent, limit, percent: pct })]);
      seen.add(key);
      if (m.user_id === userId) created.push(message);
    }
  }
  return created;
}

module.exports = { MAX_MEMBERS, ensureTables, membershipOf, frontendUrl, removeUserFromHousehold, checkHouseholdBudgets };