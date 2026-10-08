const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const { checkBudgets } = require('../services/alerts');

const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };

// GET /api/alerts — latest alerts + unread count (also re-checks budgets)
router.get('/', auth, async (req, res) => {
  try {
    await checkBudgets(req.user.id);
    const [rows] = await db.query(
      'SELECT id, type, message, metadata_json, is_read, triggered_at FROM alerts WHERE user_id = ? ORDER BY id DESC LIMIT 30',
      [req.user.id]
    );
    const [[{ unread }]] = await db.query(
      'SELECT COUNT(*) AS unread FROM alerts WHERE user_id = ? AND is_read = 0', [req.user.id]);
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

router.delete('/', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM alerts WHERE user_id = ?', [req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM alerts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
