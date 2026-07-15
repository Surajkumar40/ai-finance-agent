const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// GET /api/budgets — current month budgets with actual spending
router.get('/', auth, async (req, res) => {
  const userId = req.user.userId;
  const month = new Date().toISOString().slice(0, 7) + '-01';
  try {
    const [rows] = await db.query(`
      SELECT 
        b.id, b.monthly_limit, b.month,
        c.id as category_id, c.name as category_name, c.color as category_color, c.icon,
        COALESCE(SUM(t.amount), 0) as spent
      FROM budgets b
      JOIN categories c ON c.id = b.category_id
      LEFT JOIN transactions t 
        ON t.category_id = b.category_id 
        AND t.user_id = b.user_id
        AND t.type = 'expense'
        AND DATE_FORMAT(t.date, '%Y-%m-01') = b.month
      WHERE b.user_id = ? AND b.month = ?
      GROUP BY b.id, c.id
      ORDER BY (COALESCE(SUM(t.amount),0) / b.monthly_limit) DESC
    `, [userId, month]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/budgets — create or update a budget
router.post('/', auth, async (req, res) => {
  const userId = req.user.userId;
  const { category_id, monthly_limit } = req.body;
  const month = new Date().toISOString().slice(0, 7) + '-01';
  try {
    await db.query(`
      INSERT INTO budgets (user_id, category_id, monthly_limit, month)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)
    `, [userId, category_id, monthly_limit, month]);
    res.json({ message: 'Budget saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/budgets/:id
router.delete('/:id', auth, async (req, res) => {
  const userId = req.user.userId;
  try {
    await db.query('DELETE FROM budgets WHERE id = ? AND user_id = ?', [req.params.id, userId]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;