const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { suggest, shiftMonth, WINDOW } = require('../services/budgetSuggest');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// Same convention as services/alerts.js (UTC month)
const currentMonth = () => new Date().toISOString().slice(0, 7);

// "2026-10" -> "2026-10-01". Returns null if the text is not a valid month.
function monthStart(input) {
  const m = input || currentMonth();
  return MONTH_RE.test(m) ? m + '-01' : null;
}

// GET /api/budgets?month=YYYY-MM — budgets for that month (default: this month) with actual spending
router.get('/', auth, async (req, res) => {
  const userId = req.user.id;
  const month = monthStart(req.query.month);
  if (!month) return res.status(400).json({ message: 'Invalid month. Use YYYY-MM.' });
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

// GET /api/budgets/unbudgeted?month=YYYY-MM — categories you spent in that month that have no budget
router.get('/unbudgeted', auth, async (req, res) => {
  const userId = req.user.id;
  const month = monthStart(req.query.month);
  if (!month) return res.status(400).json({ message: 'Invalid month. Use YYYY-MM.' });
  try {
    const [rows] = await db.query(`
      SELECT c.id AS category_id, c.name AS category_name, c.icon, c.color AS category_color,
             SUM(t.amount) AS spent
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ?
        AND t.type = 'expense'
        AND DATE_FORMAT(t.date, '%Y-%m-01') = ?
        AND t.category_id NOT IN (
          SELECT category_id FROM budgets WHERE user_id = ? AND month = ?
        )
      GROUP BY c.id, c.name, c.icon, c.color
      ORDER BY spent DESC
    `, [userId, month, userId, month]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reads the last 3 months of spending for the categories without a budget in `month` and works out a limit for each.
async function suggestionsFor(userId, month) {
  const ym = month.slice(0, 7);
  const first = shiftMonth(ym, -WINDOW) + '-01';
  const [[f]] = await db.query('SELECT DATE_FORMAT(MIN(date), \'%Y-%m\') AS m FROM transactions WHERE user_id = ?', [userId]);
  const [rows] = await db.query(`
    SELECT c.id AS category_id, c.name AS category_name, c.icon, c.color AS category_color,
           DATE_FORMAT(t.date, '%Y-%m') AS ym, SUM(t.amount) AS spent
      FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date < ?
     GROUP BY c.id, c.name, c.icon, c.color, ym`, [userId, first, month]);
  const [have] = await db.query('SELECT category_id FROM budgets WHERE user_id = ? AND month = ?', [userId, month]);
  return suggest({ month: ym, firstMonth: f && f.m, rows, budgeted: have.map((b) => b.category_id) });
}

// GET /api/budgets/suggestions?month=YYYY-MM — a limit for each category without a budget, from the last 3 months
router.get('/suggestions', auth, async (req, res) => {
  const month = monthStart(req.query.month);
  if (!month) return res.status(400).json({ message: 'Invalid month. Use YYYY-MM.' });
  try {
    res.json(await suggestionsFor(req.user.id, month));
  } catch (err) {
    console.error('BUDGET SUGGEST ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/budgets/suggestions/apply — create every suggested budget for the month. Body: { month }
// The amounts are worked out here again, so they cannot be set from outside. Existing budgets are kept.
router.post('/suggestions/apply', auth, async (req, res) => {
  const month = monthStart(req.body && req.body.month);
  if (!month) return res.status(400).json({ message: 'Invalid month. Use YYYY-MM.' });
  try {
    const { suggestions } = await suggestionsFor(req.user.id, month);
    let created = 0;
    for (const s of suggestions) {
      const [r] = await db.query('INSERT IGNORE INTO budgets (user_id, category_id, monthly_limit, month) VALUES (?, ?, ?, ?)', [req.user.id, s.category_id, s.suggested, month]);
      created += r.affectedRows;
    }
    res.json({ message: 'Budgets created', created });
  } catch (err) {
    console.error('BUDGET APPLY ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/budgets — create or update a budget. Body: { category_id, monthly_limit, month? }
router.post('/', auth, async (req, res) => {
  const userId = req.user.id;
  const { category_id, monthly_limit } = req.body;
  const month = monthStart(req.body.month);
  const limit = Number(monthly_limit);

  if (!month) return res.status(400).json({ message: 'Invalid month. Use YYYY-MM.' });
  if (!category_id) return res.status(400).json({ message: 'Choose a category.' });
  if (!(limit > 0) || limit > 99999999) {
    return res.status(400).json({ message: 'Budget limit must be greater than 0.' });
  }

  try {
    // Only allow default categories or the user's own
    const [cat] = await db.query(
      'SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
      [category_id, userId]
    );
    if (!cat.length) return res.status(400).json({ message: 'Category not found.' });

    await db.query(`
      INSERT INTO budgets (user_id, category_id, monthly_limit, month)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)
    `, [userId, category_id, limit, month]);
    res.json({ message: 'Budget saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/budgets/copy — copy budgets from one month to another. Body: { from: 'YYYY-MM', to: 'YYYY-MM' }
// Existing budgets in the target month are kept as they are.
router.post('/copy', auth, async (req, res) => {
  const userId = req.user.id;
  const from = monthStart(req.body.from);
  const to = monthStart(req.body.to);
  if (!req.body.from || !req.body.to || !from || !to) {
    return res.status(400).json({ message: 'Invalid month. Use YYYY-MM.' });
  }
  if (from === to) return res.status(400).json({ message: 'Choose two different months.' });

  try {
    // INSERT IGNORE skips categories that already have a budget in the target month
    const [result] = await db.query(`
      INSERT IGNORE INTO budgets (user_id, category_id, monthly_limit, month)
      SELECT user_id, category_id, monthly_limit, ?
      FROM budgets WHERE user_id = ? AND month = ?
    `, [to, userId, from]);
    res.json({ message: 'Budgets copied', copied: result.affectedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/budgets/:id — change the limit of one budget. Body: { monthly_limit }
router.put('/:id', auth, async (req, res) => {
  const userId = req.user.id;
  const limit = Number(req.body.monthly_limit);
  if (!(limit > 0) || limit > 99999999) {
    return res.status(400).json({ message: 'Budget limit must be greater than 0.' });
  }
  try {
    const [found] = await db.query('SELECT id FROM budgets WHERE id = ? AND user_id = ?', [req.params.id, userId]);
    if (!found.length) return res.status(404).json({ message: 'Budget not found' });
    await db.query('UPDATE budgets SET monthly_limit = ? WHERE id = ? AND user_id = ?', [limit, req.params.id, userId]);
    res.json({ message: 'Budget updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/budgets/:id
router.delete('/:id', auth, async (req, res) => {
  const userId = req.user.id;
  try {
    await db.query('DELETE FROM budgets WHERE id = ? AND user_id = ?', [req.params.id, userId]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;