const db = require("../config/db");

// ============================================================
// TOOL DEFINITIONS — these are given to Claude so it knows
// what functions it's allowed to call, and with what inputs.
// ============================================================
const TOOLS = [
  {
    name: "get_transactions",
    description:
      "Fetch the user's transactions, optionally filtered by category, type, or date range. Use this to answer questions about spending history.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category name, e.g. 'Food & Dining'. Omit for all categories." },
        type: { type: "string", enum: ["income", "expense"], description: "Omit for both." },
        start_date: { type: "string", description: "YYYY-MM-DD. Omit for no lower bound." },
        end_date: { type: "string", description: "YYYY-MM-DD. Omit for no upper bound." },
        limit: { type: "integer", description: "Max rows to return. Default 50." },
      },
    },
  },
  {
    name: "get_budget_status",
    description:
      "Get the user's budgets for the current month alongside how much they've actually spent in each category so far.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_financial_health",
    description:
      "Compute a simple financial health snapshot: total income, total expenses, and savings rate over the last 30 days.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_spending_trends",
    description:
      "Get total spending per category, per month, for the last N months. Useful for month-over-month comparisons.",
    input_schema: {
      type: "object",
      properties: {
        months: { type: "integer", description: "How many months back to look. Default 3." },
      },
    },
  },
  {
    name: "get_categories",
    description: "List all available transaction categories and their IDs. Use this before add_transaction or update_budget if you need to map a category name to an ID.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_transaction",
    description:
      "Add a new transaction on the user's behalf. Only do this when the user clearly asks you to log/add/record a transaction.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        amount: { type: "number" },
        type: { type: "string", enum: ["income", "expense"] },
        category: { type: "string", description: "Category name. Must match an existing category from get_categories." },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today if omitted." },
        note: { type: "string" },
      },
      required: ["title", "amount", "type"],
    },
  },
  {
    name: "update_budget",
    description:
      "Set or update the user's monthly budget limit for a category. Only do this when the user clearly asks you to set/change a budget.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category name. Must match an existing category from get_categories." },
        monthly_limit: { type: "number" },
      },
      required: ["category", "monthly_limit"],
    },
  },
];

// ============================================================
// DISPATCHER — maps a tool name to the real DB logic.
// Every function is scoped to the logged-in user (userId).
// ============================================================
async function executeTool(toolName, input, userId) {
  switch (toolName) {
    case "get_transactions":
      return getTransactions(input, userId);
    case "get_budget_status":
      return getBudgetStatus(userId);
    case "get_financial_health":
      return getFinancialHealth(userId);
    case "get_spending_trends":
      return getSpendingTrends(input, userId);
    case "get_categories":
      return getCategories();
    case "add_transaction":
      return addTransaction(input, userId);
    case "update_budget":
      return updateBudget(input, userId);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

async function getTransactions({ category, type, start_date, end_date, limit }, userId) {
  let sql = `
    SELECT t.id, t.title, t.amount, t.type, t.date, t.note, c.name as category
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ?`;
  const params = [userId];

  if (category) { sql += " AND c.name = ?"; params.push(category); }
  if (type) { sql += " AND t.type = ?"; params.push(type); }
  if (start_date) { sql += " AND t.date >= ?"; params.push(start_date); }
  if (end_date) { sql += " AND t.date <= ?"; params.push(end_date); }

  sql += " ORDER BY t.date DESC LIMIT ?";
  params.push(Math.min(limit || 50, 200));

  const [rows] = await db.query(sql, params);
  return { count: rows.length, transactions: rows };
}

async function getBudgetStatus(userId) {
  const month = new Date().toISOString().slice(0, 7) + "-01";
  const [rows] = await db.query(
    `SELECT c.name as category, b.monthly_limit, COALESCE(SUM(t.amount), 0) as spent
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     LEFT JOIN transactions t
       ON t.category_id = b.category_id AND t.user_id = b.user_id
       AND t.type = 'expense' AND DATE_FORMAT(t.date, '%Y-%m-01') = b.month
     WHERE b.user_id = ? AND b.month = ?
     GROUP BY b.id, c.id`,
    [userId, month]
  );
  return { month, budgets: rows };
}

async function getFinancialHealth(userId) {
  const [rows] = await db.query(
    `SELECT type, COALESCE(SUM(amount), 0) as total
     FROM transactions
     WHERE user_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
     GROUP BY type`,
    [userId]
  );
  const income = Number(rows.find(r => r.type === "income")?.total || 0);
  const expenses = Number(rows.find(r => r.type === "expense")?.total || 0);
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : null;

  return {
    period: "last_30_days",
    income,
    expenses,
    net: income - expenses,
    savings_rate_percent: savingsRate,
  };
}

async function getSpendingTrends({ months }, userId) {
  const n = Math.min(months || 3, 12);
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(t.date, '%Y-%m') as month, c.name as category, SUM(t.amount) as total
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.user_id = ? AND t.type = 'expense'
       AND t.date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
     GROUP BY month, c.name
     ORDER BY month DESC`,
    [userId, n]
  );
  return { months: n, trends: rows };
}

async function getCategories() {
  const [rows] = await db.query("SELECT id, name, icon FROM categories ORDER BY name");
  return { categories: rows };
}

async function addTransaction({ title, amount, type, category, date, note }, userId) {
  let categoryId = null;
  if (category) {
    const [cat] = await db.query("SELECT id FROM categories WHERE name = ?", [category]);
    if (!cat.length) return { error: `Category "${category}" not found. Call get_categories to see valid options.` };
    categoryId = cat[0].id;
  }
  const txnDate = date || new Date().toISOString().slice(0, 10);
  const [result] = await db.query(
    `INSERT INTO transactions (user_id, title, amount, type, category_id, date, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, title, amount, type, categoryId, txnDate, note || null]
  );
  return { success: true, id: result.insertId, title, amount, type, category, date: txnDate };
}

async function updateBudget({ category, monthly_limit }, userId) {
  const [cat] = await db.query("SELECT id FROM categories WHERE name = ?", [category]);
  if (!cat.length) return { error: `Category "${category}" not found. Call get_categories to see valid options.` };

  const month = new Date().toISOString().slice(0, 7) + "-01";
  await db.query(
    `INSERT INTO budgets (user_id, category_id, monthly_limit, month)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)`,
    [userId, cat[0].id, monthly_limit, month]
  );
  return { success: true, category, monthly_limit, month };
}

module.exports = { TOOLS, executeTool };
