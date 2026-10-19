// Net worth: list what you own (assets) and what you owe (debts), keep the balances up to date,
// and see the total over time.   /api/networth
//
//   GET    /                      items, totals, and a 12 month trend
//   POST   /                      add an item   { name, kind: 'asset'|'debt', category, balance }
//   PUT    /:id                   change name, category or balance (a new balance is remembered for the trend)
//   DELETE /:id                   remove an item (its history goes with it)
//
// Balances are stored as positive numbers for both kinds: a debt of 50,000 is stored as 50000 and subtracted.
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const currency = require('../services/currency');

const MAX_ITEMS = 50;
const MAX_BALANCE = 9999999999; // fits DECIMAL(14,2) with room to spare
const CATEGORIES = {
  asset: ['cash', 'bank', 'savings', 'investment', 'property', 'vehicle', 'other'],
  debt: ['loan', 'credit_card', 'mortgage', 'other'],
};
const pad = (n) => String(n).padStart(2, '0');
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round(n * 100) / 100;
const ymdOf = (v) => (v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : String(v).slice(0, 10));

// The browser sends its own date so "today" is right for the visitor, not the server. Only dates near now are trusted.
function userToday(q) {
  if (typeof q === 'string' && YMD_RE.test(q)) {
    const t = new Date(q + 'T00:00:00Z');
    if (!isNaN(t) && t.toISOString().slice(0, 10) === q && Math.abs(t - Date.now()) < 3 * 86400000) return q;
  }
  return new Date().toLocaleDateString('en-CA');
}

let tablesReady;
function ensureTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS net_worth_items (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          name VARCHAR(60) NOT NULL,
          kind ENUM('asset','debt') NOT NULL,
          category VARCHAR(20) NOT NULL,
          balance DECIMAL(14,2) NOT NULL DEFAULT 0,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATE NULL,
          INDEX idx_nw_user (user_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4`);
      await db.query(`
        CREATE TABLE IF NOT EXISTS net_worth_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          item_id INT NOT NULL,
          user_id INT NOT NULL,
          balance DECIMAL(14,2) NOT NULL,
          recorded_on DATE NOT NULL,
          UNIQUE KEY one_per_day (item_id, recorded_on),
          INDEX idx_nwh_user (user_id),
          FOREIGN KEY (item_id) REFERENCES net_worth_items(id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4`);
    })().catch((e) => { tablesReady = null; throw e; });
  }
  return tablesReady;
}

const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };
const shiftMonth = (ym, d) => { const [y, m] = ym.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + d, 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`; };

// Pure function (no database).
//   items    [{ id, kind, balance }]
//   history  [{ item_id, balance, recorded_on: 'YYYY-MM-DD' }]
// For each of the last `count` months the balance of an item is its latest entry on or before the end of that month
// (for the current month: on or before today). An item with no entry yet by then did not exist, so it adds nothing.
function buildTrend({ items, history, today, count = 12 }) {
  const kindOf = new Map(items.map((i) => [i.id, i.kind]));
  const byItem = new Map();
  for (const h of history) {
    if (!kindOf.has(h.item_id)) continue;
    if (!byItem.has(h.item_id)) byItem.set(h.item_id, []);
    byItem.get(h.item_id).push({ on: ymdOf(h.recorded_on), balance: Number(h.balance) });
  }
  for (const list of byItem.values()) list.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  const thisMonth = today.slice(0, 7);
  const out = [];
  for (let k = count - 1; k >= 0; k--) {
    const month = shiftMonth(thisMonth, -k);
    const end = month === thisMonth ? today : lastDay(month);
    let assets = 0, debts = 0;
    for (const [id, list] of byItem) {
      let bal = null;
      for (const e of list) { if (e.on <= end) bal = e.balance; else break; }
      if (bal === null) continue;
      if (kindOf.get(id) === 'asset') assets += bal; else debts += bal;
    }
    out.push({ month, assets: round2(assets), debts: round2(debts), net: round2(assets - debts) });
  }
  return out;
}

const shape = (r) => ({ id: r.id, name: r.name, kind: r.kind, category: r.category, balance: Number(r.balance), updated_at: r.updated_at ? ymdOf(r.updated_at) : null });

function parseBalance(v) {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (typeof v === 'string' && !/^\d+(\.\d{1,2})?$/.test(v.trim())) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_BALANCE) return null;
  return Math.round(n * 100) / 100;
}
const cleanName = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '');
const posInt = (v) => { const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v; return Number.isInteger(n) && n > 0 ? n : null; };

router.get('/', auth, async (req, res) => {
  try {
    await ensureTables();
    const today = userToday(req.query.today);
    const [rows] = await db.query('SELECT id, name, kind, category, balance, updated_at FROM net_worth_items WHERE user_id = ? ORDER BY kind, balance DESC, id', [req.user.id]);
    const [history] = rows.length
      ? await db.query('SELECT item_id, balance, recorded_on FROM net_worth_history WHERE user_id = ? ORDER BY recorded_on', [req.user.id])
      : [[]];
    const items = rows.map(shape);
    const assets = round2(items.filter((i) => i.kind === 'asset').reduce((t, i) => t + i.balance, 0));
    const debts = round2(items.filter((i) => i.kind === 'debt').reduce((t, i) => t + i.balance, 0));
    const trend = buildTrend({ items, history, today });
    const before = trend[trend.length - 2];
    const net = round2(assets - debts);
    res.json({
      items, totals: { assets, debts, net },
      trend,
      change: before && trend.some((t, i) => i < trend.length - 1 && (t.assets || t.debts)) ? { amount: round2(net - before.net), since: before.month } : null,
      categories: CATEGORIES, max_items: MAX_ITEMS, currency: await currency.codeOf(req.user.id),
    });
  } catch (err) {
    console.error('NETWORTH LIST ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, async (req, res) => {
  let conn;
  try {
    await ensureTables();
    const b = req.body || {};
    const name = cleanName(b.name);
    if (!name || name.length > 60) return res.status(400).json({ message: 'Give it a name of up to 60 characters.' });
    if (b.kind !== 'asset' && b.kind !== 'debt') return res.status(400).json({ message: 'Choose whether it is something you own or something you owe.' });
    if (typeof b.category !== 'string' || !CATEGORIES[b.kind].includes(b.category)) return res.status(400).json({ message: 'Choose one of the listed types.' });
    const balance = parseBalance(b.balance);
    if (balance === null) return res.status(400).json({ message: 'Enter a balance of 0 or more, with at most 2 decimals.' });
    const today = userToday(b.today);

    conn = await db.getConnection(); await conn.beginTransaction();
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM net_worth_items WHERE user_id = ? FOR UPDATE', [req.user.id]);
    if (Number(n) >= MAX_ITEMS) { await conn.rollback(); return res.status(400).json({ message: `You can track up to ${MAX_ITEMS} items. Remove one first.` }); }
    const [r] = await conn.query('INSERT INTO net_worth_items (user_id, name, kind, category, balance, updated_at) VALUES (?,?,?,?,?,?)', [req.user.id, name, b.kind, b.category, balance, today]);
    await conn.query('INSERT INTO net_worth_history (item_id, user_id, balance, recorded_on) VALUES (?,?,?,?)', [r.insertId, req.user.id, balance, today]);
    await conn.commit();
    res.status(201).json({ id: r.insertId, message: 'Added' });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch { /* ignore */ } }
    console.error('NETWORTH ADD ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally { if (conn) conn.release(); }
});

router.put('/:id', auth, async (req, res) => {
  let conn;
  try {
    await ensureTables();
    const id = posInt(req.params.id);
    if (!id) return res.status(404).json({ message: 'Not found.' });
    const [rows] = await db.query('SELECT id, name, kind, category, balance, updated_at FROM net_worth_items WHERE id = ? AND user_id = ?', [id, req.user.id]);
    const cur = rows[0];
    if (!cur) return res.status(404).json({ message: 'Not found.' });
    const b = req.body || {};
    const name = b.name === undefined ? cur.name : cleanName(b.name);
    if (!name || name.length > 60) return res.status(400).json({ message: 'Give it a name of up to 60 characters.' });
    const category = b.category === undefined ? cur.category : b.category;
    if (typeof category !== 'string' || !CATEGORIES[cur.kind].includes(category)) return res.status(400).json({ message: 'Choose one of the listed types.' });
    let balance = Number(cur.balance);
    if (b.balance !== undefined) {
      const p = parseBalance(b.balance);
      if (p === null) return res.status(400).json({ message: 'Enter a balance of 0 or more, with at most 2 decimals.' });
      balance = p;
    }
    const today = userToday(b.today);
    const changed = round2(balance) !== round2(Number(cur.balance));

    conn = await db.getConnection(); await conn.beginTransaction();
    await conn.query('UPDATE net_worth_items SET name = ?, category = ?, balance = ?, updated_at = ? WHERE id = ? AND user_id = ?', [name, category, balance, changed ? today : (cur.updated_at ? ymdOf(cur.updated_at) : today), id, req.user.id]);
    if (changed) {
      await conn.query(
        'INSERT INTO net_worth_history (item_id, user_id, balance, recorded_on) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE balance = VALUES(balance)',
        [id, req.user.id, balance, today]);
    }
    await conn.commit();
    res.json({ message: 'Saved' });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch { /* ignore */ } }
    console.error('NETWORTH UPDATE ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally { if (conn) conn.release(); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await ensureTables();
    const id = posInt(req.params.id);
    if (!id) return res.status(404).json({ message: 'Not found.' });
    const [r] = await db.query('DELETE FROM net_worth_items WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Not found.' });
    res.json({ message: 'Removed' });
  } catch (err) {
    console.error('NETWORTH DELETE ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

router.buildTrend = buildTrend;
router.ensureTables = ensureTables;
module.exports = router;