const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const { checkBudgets } = require('../services/alerts');
const Anthropic = require('@anthropic-ai/sdk');
const Groq = require('groq-sdk');
const { groqComplete } = require('../config/groqModel');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const ANTHROPIC_MODEL = 'claude-sonnet-5-5';

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD (local)

// ── chat history table (created automatically) ──
let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = db.query(`
      CREATE TABLE IF NOT EXISTS agent_chat_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_id, id)
      )`).catch((e) => { tableReady = null; throw e; });
  }
  return tableReady;
}

// ── real data context ──
async function buildContext(userId) {
  const month = today().slice(0, 7);
  let ctx = `Today: ${today()}\n`;

  const [totals] = await db.query(
    `SELECT type, COALESCE(SUM(amount),0) AS total FROM transactions
      WHERE user_id=? AND DATE_FORMAT(date,'%Y-%m')=? GROUP BY type`, [userId, month]);
  const inc = Number(totals.find(r => r.type === 'income')?.total || 0);
  const exp = Number(totals.find(r => r.type === 'expense')?.total || 0);
  ctx += `This month: income ₹${inc}, expenses ₹${exp}, net ₹${inc - exp}\n`;

  const [byCat] = await db.query(
    `SELECT COALESCE(c.name,'Uncategorised') AS category, SUM(t.amount) AS total
       FROM transactions t LEFT JOIN categories c ON c.id=t.category_id
      WHERE t.user_id=? AND t.type='expense' AND DATE_FORMAT(t.date,'%Y-%m')=?
      GROUP BY category ORDER BY total DESC`, [userId, month]);
  if (byCat.length) ctx += 'Expenses by category this month:\n' +
    byCat.map(r => `- ${r.category}: ₹${r.total}`).join('\n') + '\n';

  const [recent] = await db.query(
    `SELECT t.title, t.amount, t.type, t.date, c.name AS category
       FROM transactions t LEFT JOIN categories c ON c.id=t.category_id
      WHERE t.user_id=? ORDER BY t.date DESC, t.id DESC LIMIT 30`, [userId]);
  ctx += recent.length
    ? 'Recent transactions:\n' + recent.map(r =>
        `- ${new Date(r.date).toLocaleDateString('en-CA')} | ${r.type} | ₹${r.amount} | ${r.title} | ${r.category || '-'}`).join('\n') + '\n'
    : 'The user has no transactions yet.\n';

  try {
    const [budgets] = await db.query(
      `SELECT c.name AS category, b.monthly_limit FROM budgets b
         JOIN categories c ON c.id=b.category_id
        WHERE b.user_id=? AND DATE_FORMAT(b.month,'%Y-%m')=?`, [userId, month]);
    if (budgets.length) ctx += 'Budgets this month:\n' +
      budgets.map(b => `- ${b.category}: limit ₹${b.monthly_limit}`).join('\n') + '\n';
  } catch (e) { console.warn('Budgets skipped:', e.message); }

  try {
    const [goals] = await db.query(
      'SELECT name, target_amount, saved_amount, target_date FROM savings_goals WHERE user_id=? ORDER BY id DESC LIMIT 10', [userId]);
    if (goals.length) ctx += 'Savings goals:\n' + goals.map(g =>
      `- ${g.name}: saved ₹${g.saved_amount} of ₹${g.target_amount}` +
      (g.target_date ? ` (target ${new Date(g.target_date).toLocaleDateString('en-CA')})` : '')).join('\n') + '\n';
  } catch (e) { console.warn('Goals skipped:', e.message); }

  const [cats] = await db.query(
    'SELECT name FROM categories WHERE user_id IS NULL OR user_id=?', [userId]);
  ctx += 'Available categories: ' + cats.map(c => c.name).join(', ') + '\n';
  return ctx;
}

async function findCategoryId(userId, name) {
  if (!name) return null;
  const [rows] = await db.query(
    `SELECT id FROM categories WHERE (user_id IS NULL OR user_id=?) AND LOWER(name)=LOWER(?) LIMIT 1`,
    [userId, name]);
  if (rows.length) return rows[0].id;
  const [like] = await db.query(
    `SELECT id FROM categories WHERE (user_id IS NULL OR user_id=?) AND LOWER(name) LIKE LOWER(?) LIMIT 1`,
    [userId, `%${name}%`]);
  return like.length ? like[0].id : null;
}

// ── tools the agent can use ──
const TOOLS = [
  {
    name: 'add_transaction',
    description: 'Add an income or expense transaction for the user.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        amount: { type: 'number', description: 'Positive amount in rupees' },
        type: { type: 'string', enum: ['income', 'expense'] },
        category: { type: 'string', description: 'Category name from the available list' },
        date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
        note: { type: 'string' },
      },
      required: ['title', 'amount', 'type'],
    },
  },
  {
    name: 'set_budget',
    description: "Create or update this month's budget limit for a category.",
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        monthly_limit: { type: 'number' },
      },
      required: ['category', 'monthly_limit'],
    },
  },
];

async function runTool(userId, name, input) {
  try {
    if (name === 'add_transaction') {
      const amount = Number(input.amount);
      if (!(amount > 0)) return 'Error: amount must be positive';
      const categoryId = await findCategoryId(userId, input.category);
      await db.query(
        `INSERT INTO transactions (user_id, title, amount, type, category_id, note, date)
         VALUES (?,?,?,?,?,?,?)`,
        [userId, String(input.title).slice(0, 150), amount, input.type,
         categoryId, input.note || null, input.date || today()]);
      try { await checkBudgets(userId); } catch (e) { console.error('Alert check failed:', e.message); }
      return `Added ${input.type} "${input.title}" ₹${amount}` +
        (categoryId ? ` in ${input.category}` : ' (no matching category, saved uncategorised)');
    }
    if (name === 'set_budget') {
      const categoryId = await findCategoryId(userId, input.category);
      if (!categoryId) return `Error: no category matching "${input.category}"`;
      const limit = Number(input.monthly_limit);
      if (!(limit > 0)) return 'Error: monthly_limit must be positive';
      const month = today().slice(0, 7) + '-01';
      await db.query(
        `INSERT INTO budgets (user_id, category_id, monthly_limit, month) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE monthly_limit=VALUES(monthly_limit)`,
        [userId, categoryId, limit, month]);
      return `Budget for ${input.category} set to ₹${limit} for this month`;
    }
    return 'Error: unknown tool';
  } catch (e) {
    console.error('TOOL ERROR:', name, e.message);
    return 'Error: ' + e.message;
  }
}

async function chatWithAnthropic(userId, system, history, message) {
  const messages = [...history, { role: 'user', content: message }];
  for (let i = 0; i < 5; i++) {
    const r = await anthropic.messages.create({
      model: ANTHROPIC_MODEL, max_tokens: 800, system, tools: TOOLS, messages,
    });
    if (r.stop_reason !== 'tool_use') {
      return r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    }
    messages.push({ role: 'assistant', content: r.content });
    const results = [];
    for (const b of r.content.filter(b => b.type === 'tool_use')) {
      results.push({ type: 'tool_result', tool_use_id: b.id, content: await runTool(userId, b.name, b.input) });
    }
    messages.push({ role: 'user', content: results });
  }
  return 'I ran into a loop while working on that. Please try again.';
}

async function chatWithGroq(system, history, message) {
  const r = await groqComplete(groq, {
    max_tokens: 800,
    messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: message }],
  });
  return r.choices?.[0]?.message?.content?.trim();
}

// ───────── GET /api/agent/history ─────────
router.get('/history', auth, async (req, res) => {
  try {
    await ensureTable();
    const [rows] = await db.query(
      `SELECT role, content FROM agent_chat_history WHERE user_id=? ORDER BY id DESC LIMIT 50`,
      [req.user.id]);
    // Return as an array of { role, text, content }, oldest first
    res.json(rows.reverse().map(r => ({ role: r.role, text: r.content, content: r.content })));
  } catch (err) {
    console.error('AGENT HISTORY ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ───────── DELETE /api/agent/history ─────────
router.delete('/history', auth, async (req, res) => {
  try {
    await ensureTable();
    await db.query('DELETE FROM agent_chat_history WHERE user_id=?', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────── POST /api/agent/chat ─────────
router.post('/chat', auth, async (req, res) => {
  try {
    const message = req.body.message?.trim();
    if (!message) return res.status(400).json({ error: 'Message is required' });
    const userId = req.user.id;

    await ensureTable();
    const [past] = await db.query(
      `SELECT role, content FROM agent_chat_history WHERE user_id=? ORDER BY id DESC LIMIT 10`, [userId]);
    const history = past.reverse().map(r => ({ role: r.role, content: r.content }));

    const system =
      'You are an AI finance agent inside a personal finance tracker. Use the user data below to answer. ' +
      'You can add transactions and set budgets using tools when the user asks; confirm what you did. ' +
      'Never invent numbers. Be concise, use ₹.\n\n--- USER DATA ---\n' + await buildContext(userId);

    const errors = [];
    let reply = null;

    if (anthropic) {
      try { reply = await chatWithAnthropic(userId, system, history, message); }
      catch (e) { console.error('Anthropic error:', e.message); errors.push('Anthropic: ' + e.message); }
    } else errors.push('Anthropic: ANTHROPIC_API_KEY missing');

    if (!reply && groq) {
      try {
        reply = await chatWithGroq(system, history, message);
        if (reply) reply += '\n\n(Note: answered by the backup AI — adding entries/budgets from chat is unavailable right now.)';
      } catch (e) { console.error('Groq error:', e.message); errors.push('Groq: ' + e.message); }
    } else if (!reply) errors.push('Groq: GROQ_API_KEY missing');

    if (!reply) return res.status(500).json({ error: errors.join(' | ') });

    await db.query(
      'INSERT INTO agent_chat_history (user_id, role, content) VALUES (?,?,?),(?,?,?)',
      [userId, 'user', message, userId, 'assistant', reply]);

    res.json({ reply, response: reply, message: reply, text: reply });
  } catch (err) {
    console.error('AGENT CHAT ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
