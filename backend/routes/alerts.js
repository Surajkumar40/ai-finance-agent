const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const { checkBudgets, checkSpending, checkBills, userToday } = require('../services/alerts');

const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };

// "Clear" must NOT delete the rows. The budget checker uses them to remember which alerts it already
// sent this month; if they are deleted, the next refresh creates the same alert again.
// So cleared alerts are only hidden (dismissed flag inside metadata_json) and kept as a memory.
const NOT_DISMISSED = "(metadata_json IS NULL OR JSON_EXTRACT(metadata_json, '$.dismissed') IS NULL)";
const DISMISS = "metadata_json = JSON_SET(COALESCE(metadata_json, JSON_OBJECT()), '$.dismissed', TRUE), is_read = 1";

// GET /api/alerts?today=YYYY-MM-DD: latest alerts + unread count (also looks for new budget, spending and bill alerts)
router.get('/', auth, async (req, res) => {
  try {
    // Each check is separate: if one fails, the bell still works with the others.
    const today = userToday(req.query.today);
    for (const run of [() => checkBudgets(req.user.id), () => checkSpending(req.user.id, today), () => checkBills(req.user.id, today)]) {
      try { await run(); } catch (e) { console.error('ALERT CHECK FAILED:', e.message); }
    }
    const [rows] = await db.query(
      `SELECT id, type, message, metadata_json, is_read, triggered_at FROM alerts
        WHERE user_id = ? AND ${NOT_DISMISSED} ORDER BY id DESC LIMIT 30`,
      [req.user.id]
    );
    const [[{ unread }]] = await db.query(
      `SELECT COUNT(*) AS unread FROM alerts WHERE user_id = ? AND is_read = 0 AND ${NOT_DISMISSED}`, [req.user.id]);
    res.json({
      unread: Number(unread),
      alerts: rows.map((r) => ({ ...r, is_read: !!r.is_read, metadata: parse(r.metadata_json), metadata_json: undefined })),
    });
  } catch (err) {
    console.error('ALERTS ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/read-all', auth, async (req, res) => {
  try {
    await db.query('UPDATE alerts SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/:id/read', auth, async (req, res) => {
  try {
    await db.query('UPDATE alerts SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// "Clear" button
router.delete('/', auth, async (req, res) => {
  try {
    await db.query(`UPDATE alerts SET ${DISMISS} WHERE user_id = ?`, [req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query(`UPDATE alerts SET ${DISMISS} WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;