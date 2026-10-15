const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const { processDue, ymd } = require('../services/recurring');

const FREQ = ['daily', 'weekly', 'monthly', 'yearly'];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s));

function validate(b, partial = false) {
  const out = {};
  if (!partial || b.title !== undefined) {
    if (!b.title || !String(b.title).trim()) return { error: 'Title is required' };
    out.title = String(b.title).trim().slice(0, 200);
  }
  if (!partial || b.amount !== undefined) {
    const a = Number(b.amount);
    if (!(a > 0)) return { error: 'Amount must be greater than 0' };
    out.amount = a;
  }
  if (!partial || b.type !== undefined) {
    if (!['income', 'expense'].includes(b.type)) return { error: 'Type must be income or expense' };
    out.type = b.type;
  }
  if (!partial || b.frequency !== undefined) {
    if (!FREQ.includes(b.frequency)) return { error: 'Frequency must be daily, weekly, monthly or yearly' };
    out.frequency = b.frequency;
  }
  if (!partial || b.next_due !== undefined) {
    if (!isDate(b.next_due)) return { error: 'A valid start date (YYYY-MM-DD) is required' };
    out.next_due = b.next_due;
    out.anchor_day = Number(b.next_due.slice(8, 10));
  }
  if (b.category_id !== undefined) out.category_id = b.category_id || null;
  if (b.notes !== undefined) out.notes = b.notes || null;
  if (b.is_active !== undefined) out.is_active = b.is_active ? 1 : 0;
  return { data: out };
}

// the category must be a standard one or one of this person's own
async function categoryAllowed(categoryId, userId) {
  if (categoryId === null || categoryId === undefined) return true;
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const [ok] = await db.query('SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)', [id, userId]);
  return ok.length > 0;
}

// GET /api/recurring
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
         FROM recurring_transactions r LEFT JOIN categories c ON c.id = r.category_id
        WHERE r.user_id = ? ORDER BY r.is_active DESC, r.next_due ASC`, [req.user.id]);
    res.json(rows.map((r) => ({ ...r, next_due: ymd(r.next_due), is_active: !!r.is_active })));
  } catch (err) {
    console.error('RECURRING LIST ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/recurring
router.post('/', auth, async (req, res) => {
  const v = validate(req.body);
  if (v.error) return res.status(400).json({ message: v.error });
  const d = v.data;
  try {
    if (!(await categoryAllowed(d.category_id, req.user.id))) return res.status(400).json({ message: 'Choose a valid category' });
    const [r] = await db.query(
      `INSERT INTO recurring_transactions (user_id, title, amount, type, category_id, frequency, next_due, anchor_day, notes)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.id, d.title, d.amount, d.type, d.category_id || null, d.frequency, d.next_due, d.anchor_day, d.notes || null]);
    const { created } = await processDue(req.user.id); // starts today / in the past -> created right away
    res.status(201).json({ id: r.insertId, created_now: created, message: 'Recurring transaction saved' });
  } catch (err) {
    console.error('RECURRING CREATE ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/recurring/:id  (edit fields, or pause/resume with { is_active })
router.put('/:id', auth, async (req, res) => {
  const v = validate(req.body, true);
  if (v.error) return res.status(400).json({ message: v.error });
  const keys = Object.keys(v.data);
  if (!keys.length) return res.status(400).json({ message: 'Nothing to update' });
  try {
    if ('category_id' in v.data && !(await categoryAllowed(v.data.category_id, req.user.id))) return res.status(400).json({ message: 'Choose a valid category' });
    const [r] = await db.query(
      `UPDATE recurring_transactions SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND user_id = ?`,
      [...keys.map((k) => v.data[k]), req.params.id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/recurring/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const [r] = await db.query('DELETE FROM recurring_transactions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/recurring/run — process everything that is due right now
router.post('/run', auth, async (req, res) => {
  try {
    res.json(await processDue(req.user.id));
  } catch (err) {
    console.error('RECURRING RUN ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;