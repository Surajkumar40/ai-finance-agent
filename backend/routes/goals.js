const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');

const num = (v) => Number(v || 0);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s));
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const pad = (n) => String(n).padStart(2, '0');
const ymd = (v) => {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  return String(v).slice(0, 10);
};

function shape(g) {
  const target = num(g.target_amount), saved = num(g.saved_amount);
  const out = {
    id: g.id, name: g.name, icon: g.icon || '🎯',
    target_amount: target, saved_amount: saved,
    percent: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0,
    remaining: Math.max(0, target - saved),
    target_date: ymd(g.target_date),
    completed: !!g.completed_at,
    days_left: null, monthly_needed: null,
  };
  if (out.target_date && !out.completed) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const [y, m, d] = out.target_date.split('-').map(Number);
    const days = Math.round((new Date(y, m - 1, d) - t) / 86400000);
    out.days_left = days;
    if (days > 0) out.monthly_needed = Math.ceil(out.remaining / Math.max(1, days / 30.44));
  }
  return out;
}

function validate(b, partial) {
  const d = {};
  if (!partial || b.name !== undefined) {
    if (!b.name || !String(b.name).trim()) return { error: 'Goal name is required' };
    d.name = String(b.name).trim().slice(0, 100);
  }
  if (!partial || b.target_amount !== undefined) {
    if (!(Number(b.target_amount) > 0)) return { error: 'Target amount must be greater than 0' };
    d.target_amount = Number(b.target_amount);
  }
  if (b.target_date !== undefined) {
    if (b.target_date && !isDate(b.target_date)) return { error: 'Target date must look like YYYY-MM-DD' };
    d.target_date = b.target_date || null;
  }
  if (b.icon !== undefined) d.icon = String(b.icon || '🎯').slice(0, 8);
  if (b.saved_amount !== undefined) {
    if (!(Number(b.saved_amount) >= 0)) return { error: 'Saved amount cannot be negative' };
    d.saved_amount = Number(b.saved_amount);
  }
  return { data: d };
}

// Sets / clears completed_at and sends a bell notification the first time a goal is reached
async function syncCompletion(uid, id) {
  const [rows] = await db.query('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [id, uid]);
  const g = rows[0];
  if (!g) return;
  const done = num(g.saved_amount) >= num(g.target_amount);
  if (done && !g.completed_at) {
    await db.query('UPDATE savings_goals SET completed_at = NOW() WHERE id = ?', [id]);
    await db.query('INSERT INTO alerts (user_id, type, message, metadata_json) VALUES (?,?,?,?)',
      [uid, 'goal_completed', `🎉 Goal reached: ${g.name} (${inr(g.target_amount)})! Time to celebrate.`, JSON.stringify({ goal_id: id })]);
  } else if (!done && g.completed_at) {
    await db.query('UPDATE savings_goals SET completed_at = NULL WHERE id = ?', [id]);
  }
}

// GET /api/goals
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM savings_goals WHERE user_id = ? ORDER BY (completed_at IS NOT NULL), target_date IS NULL, target_date, id DESC',
      [req.user.id]);
    res.json(rows.map(shape));
  } catch (err) {
    console.error('GOALS LIST ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/goals
router.post('/', auth, async (req, res) => {
  const v = validate(req.body, false);
  if (v.error) return res.status(400).json({ message: v.error });
  const d = v.data;
  try {
    const [r] = await db.query(
      'INSERT INTO savings_goals (user_id, name, icon, target_amount, saved_amount, target_date) VALUES (?,?,?,?,?,?)',
      [req.user.id, d.name, d.icon || '🎯', d.target_amount, d.saved_amount || 0, d.target_date || null]);
    await syncCompletion(req.user.id, r.insertId);
    res.status(201).json({ id: r.insertId, message: 'Goal created' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/goals/:id
router.put('/:id', auth, async (req, res) => {
  const v = validate(req.body, true);
  if (v.error) return res.status(400).json({ message: v.error });
  const keys = Object.keys(v.data);
  if (!keys.length) return res.status(400).json({ message: 'Nothing to update' });
  try {
    const [r] = await db.query(
      `UPDATE savings_goals SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND user_id = ?`,
      [...keys.map((k) => v.data[k]), req.params.id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Not found' });
    await syncCompletion(req.user.id, req.params.id);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/goals/:id/contribute  { amount }  (negative amount = withdraw)
router.post('/:id/contribute', auth, async (req, res) => {
  const amount = Number(req.body.amount);
  if (!amount || !isFinite(amount)) return res.status(400).json({ message: 'Enter an amount (not zero)' });
  try {
    const [r] = await db.query(
      'UPDATE savings_goals SET saved_amount = GREATEST(0, saved_amount + ?) WHERE id = ? AND user_id = ?',
      [amount, req.params.id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Not found' });
    await syncCompletion(req.user.id, req.params.id);
    const [rows] = await db.query('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json(shape(rows[0]));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/goals/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const [r] = await db.query('DELETE FROM savings_goals WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
