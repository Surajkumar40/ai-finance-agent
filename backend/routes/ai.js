const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');

// ── AI providers: Anthropic first, Groq (free tier) as automatic fallback ──
const Anthropic = require('@anthropic-ai/sdk');
const Groq = require('groq-sdk');
const { groqComplete } = require('../config/groqModel');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const ANTHROPIC_MODEL = 'claude-sonnet-5-5';

async function askAI(system, userText, maxTokens = 600) {
  const errors = [];

  if (anthropic) {
    try {
      const r = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userText }],
      });
      const text = r.content?.[0]?.text;
      if (text) return text;
      errors.push('Anthropic: empty response');
    } catch (e) {
      console.error('Anthropic error:', e.message);
      errors.push('Anthropic: ' + e.message);
    }
  } else {
    errors.push('Anthropic: ANTHROPIC_API_KEY missing in .env');
  }

  if (groq) {
    try {
      const r = await groqComplete(groq, {
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText },
        ],
      });
      const text = r.choices?.[0]?.message?.content;
      if (text) return text;
      errors.push('Groq: empty response');
    } catch (e) {
      console.error('Groq error:', e.message);
      errors.push('Groq: ' + e.message);
    }
  } else {
    errors.push('Groq: GROQ_API_KEY missing in .env');
  }

  throw new Error(errors.join(' | '));
}

// Build the user's real financial context from the database
async function buildContext(userId) {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  let ctx = `Today: ${new Date().toISOString().slice(0, 10)}\n`;

  const [monthTotals] = await db.query(
    `SELECT type, COALESCE(SUM(amount),0) AS total
       FROM transactions
      WHERE user_id = ? AND DATE_FORMAT(date,'%Y-%m') = ?
      GROUP BY type`,
    [userId, month]
  );
  const income = Number(monthTotals.find(r => r.type === 'income')?.total || 0);
  const expense = Number(monthTotals.find(r => r.type === 'expense')?.total || 0);
  ctx += `This month (${month}): income ₹${income}, expenses ₹${expense}, net ₹${income - expense}\n`;

  const [byCat] = await db.query(
    `SELECT COALESCE(c.name,'Uncategorised') AS category, SUM(t.amount) AS total
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ? AND t.type='expense' AND DATE_FORMAT(t.date,'%Y-%m') = ?
      GROUP BY category ORDER BY total DESC`,
    [userId, month]
  );
  if (byCat.length) {
    ctx += 'Expenses by category this month:\n' +
      byCat.map(r => `- ${r.category}: ₹${r.total}`).join('\n') + '\n';
  }

  const [recent] = await db.query(
    `SELECT t.title, t.amount, t.type, t.date, c.name AS category
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = ? ORDER BY t.date DESC, t.id DESC LIMIT 30`,
    [userId]
  );
  if (recent.length) {
    ctx += 'Recent transactions:\n' + recent.map(r =>
      `- ${new Date(r.date).toISOString().slice(0,10)} | ${r.type} | ₹${r.amount} | ${r.title} | ${r.category || '-'}`
    ).join('\n') + '\n';
  } else {
    ctx += 'The user has no transactions yet.\n';
  }

  // Budgets are optional: skip quietly if the table has not been migrated yet
  try {
    const [budgets] = await db.query(
      `SELECT c.name AS category, b.monthly_limit
         FROM budgets b JOIN categories c ON c.id = b.category_id
        WHERE b.user_id = ? AND DATE_FORMAT(b.month,'%Y-%m') = ?`,
      [userId, month]
    );
    if (budgets.length) {
      ctx += 'Budgets this month:\n' +
        budgets.map(b => `- ${b.category}: limit ₹${b.monthly_limit}`).join('\n') + '\n';
    }
  } catch (e) {
    console.warn('Budgets skipped:', e.message);
  }

  return ctx;
}

// ───────────────── CHAT ─────────────────
router.post('/chat', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

    const context = await buildContext(req.user.id);
    const system =
      'You are a helpful personal finance assistant inside a finance tracker app. ' +
      'Use ONLY the data provided below to answer questions about the user\'s money. ' +
      'Be concise and practical. Use ₹ for currency. If data is missing, say so.\n\n' +
      '--- USER DATA ---\n' + context;

    const reply = await askAI(system, message, 600);
    res.json({ reply });
  } catch (err) {
    console.error('AI CHAT ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ───────────────── CATEGORISE ─────────────────
router.post('/categorise', auth, async (req, res) => {
  try {
    const { description, categories = [] } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: 'Description is required' });

    const catList = categories.map(c => (typeof c === 'object' ? c.name : c)).join(', ');
    const category = (await askAI(
      'You are a transaction categoriser. Reply ONLY with the best matching category name from the list. No explanation.',
      `Categories: ${catList}\nTransaction: "${description}"\nBest category:`,
      30
    )).trim();

    res.json({ category });
  } catch (err) {
    console.error('CATEGORISE ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
