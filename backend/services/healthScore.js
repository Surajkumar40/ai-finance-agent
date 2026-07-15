const db = require("../config/db");

/**
 * ── Financial Health Score ──────────────────────────────────────────
 * A 0–100 score built from four weighted components. Any component
 * without enough data to be meaningful is *excluded* rather than
 * scored as zero — the remaining components are re-weighted so a
 * new user isn't punished for not having set up budgets yet, etc.
 *
 *   Savings rate             — up to 30 pts  (income saved this month)
 *   Budget adherence         — up to 30 pts  (% of budgets kept)
 *   Spending consistency     — up to 20 pts  (variance vs 3-mo baseline)
 *   Recurring obligations    — up to 20 pts  (bills kept current)
 *
 * calculateHealthScore() is a pure function (no DB, no I/O) so it can
 * be unit-tested directly — see tests/healthScore.test.js.
 * ─────────────────────────────────────────────────────────────────────
 */

const WEIGHTS = {
  savingsRate: 30,
  budgetAdherence: 30,
  spendingConsistency: 20,
  recurringCoverage: 20,
};

// Target savings rate that earns full marks on that component.
const TARGET_SAVINGS_RATE = 0.20;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {Object} inputs
 * @param {number|null} inputs.income            - this month's income (null/0 => component skipped)
 * @param {number|null} inputs.expenses           - this month's expenses
 * @param {Array<{spent:number, monthly_limit:number}>|null} inputs.budgets - this month's budgets w/ spend
 * @param {Array<number>|null} inputs.monthlyExpenseHistory - expense totals for the last few prior months (oldest→newest, current month excluded)
 * @param {Array<{next_due:string, is_active:boolean}>|null} inputs.recurring - active recurring transactions
 * @param {Date} [inputs.now] - injectable clock for tests
 * @returns {{score: number|null, breakdown: Object}}
 */
function calculateHealthScore({ income, expenses, budgets, monthlyExpenseHistory, recurring, now = new Date() }) {
  const breakdown = {};
  let earnedTotal = 0;
  let possibleTotal = 0;

  // ── 1. Savings rate ──────────────────────────────────────────────
  if (income && income > 0) {
    const rate = (income - expenses) / income;
    const points = clamp(rate / TARGET_SAVINGS_RATE, 0, 1) * WEIGHTS.savingsRate;
    breakdown.savingsRate = {
      points: round1(points),
      maxPoints: WEIGHTS.savingsRate,
      rate: round1(rate * 100),
      label: rate >= TARGET_SAVINGS_RATE
        ? "Great savings rate this month"
        : rate >= 0
          ? "Saving, but below the 20% target"
          : "Spending more than you earned this month",
    };
    earnedTotal += points;
    possibleTotal += WEIGHTS.savingsRate;
  } else {
    breakdown.savingsRate = { skipped: true, reason: "No income recorded this month" };
  }

  // ── 2. Budget adherence ──────────────────────────────────────────
  if (budgets && budgets.length > 0) {
    const withinLimit = budgets.filter(b => Number(b.spent) <= Number(b.monthly_limit)).length;
    const ratio = withinLimit / budgets.length;
    const points = ratio * WEIGHTS.budgetAdherence;
    breakdown.budgetAdherence = {
      points: round1(points),
      maxPoints: WEIGHTS.budgetAdherence,
      withinLimit,
      totalBudgets: budgets.length,
      label: `${withinLimit}/${budgets.length} categories within their monthly limit`,
    };
    earnedTotal += points;
    possibleTotal += WEIGHTS.budgetAdherence;
  } else {
    breakdown.budgetAdherence = { skipped: true, reason: "No budgets set yet" };
  }

  // ── 3. Spending consistency ───────────────────────────────────────
  if (monthlyExpenseHistory && monthlyExpenseHistory.length >= 1 && expenses != null) {
    const avg = monthlyExpenseHistory.reduce((a, b) => a + b, 0) / monthlyExpenseHistory.length;
    if (avg > 0) {
      const variance = Math.abs(expenses - avg) / avg;
      const points = clamp(1 - variance, 0, 1) * WEIGHTS.spendingConsistency;
      breakdown.spendingConsistency = {
        points: round1(points),
        maxPoints: WEIGHTS.spendingConsistency,
        variancePct: round1(variance * 100),
        label: variance <= 0.15
          ? "Spending is steady month to month"
          : "Spending swung notably compared to recent months",
      };
      earnedTotal += points;
      possibleTotal += WEIGHTS.spendingConsistency;
    } else {
      breakdown.spendingConsistency = { skipped: true, reason: "Not enough prior spending to compare" };
    }
  } else {
    breakdown.spendingConsistency = { skipped: true, reason: "Need at least one prior month of data" };
  }

  // ── 4. Recurring obligations coverage ─────────────────────────────
  const activeRecurring = (recurring || []).filter(r => r.is_active);
  if (activeRecurring.length > 0) {
    const overdue = activeRecurring.filter(r => new Date(r.next_due) < now).length;
    const current = activeRecurring.length - overdue;
    const ratio = current / activeRecurring.length;
    const points = ratio * WEIGHTS.recurringCoverage;
    breakdown.recurringCoverage = {
      points: round1(points),
      maxPoints: WEIGHTS.recurringCoverage,
      current,
      overdue,
      total: activeRecurring.length,
      label: overdue === 0
        ? "All recurring bills are up to date"
        : `${overdue} recurring bill(s) past due`,
    };
    earnedTotal += points;
    possibleTotal += WEIGHTS.recurringCoverage;
  } else {
    breakdown.recurringCoverage = { skipped: true, reason: "No recurring transactions set up" };
  }

  const score = possibleTotal > 0 ? Math.round((earnedTotal / possibleTotal) * 100) : null;
  return { score, breakdown, possiblePoints: possibleTotal };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ── DB-backed wrapper: gathers inputs for a real user, then delegates ──
async function computeHealthScoreForUser(userId) {
  const now = new Date();
  const monthStart = `${now.toISOString().slice(0, 7)}-01`;

  const [[incomeRow]] = await db.query(
    `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
     WHERE user_id = ? AND type = 'income' AND DATE_FORMAT(date,'%Y-%m-01') = ?`,
    [userId, monthStart]
  );
  const [[expenseRow]] = await db.query(
    `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
     WHERE user_id = ? AND type = 'expense' AND DATE_FORMAT(date,'%Y-%m-01') = ?`,
    [userId, monthStart]
  );

  const [budgets] = await db.query(
    `SELECT b.monthly_limit, COALESCE(SUM(t.amount),0) AS spent
     FROM budgets b
     LEFT JOIN transactions t
       ON t.category_id = b.category_id AND t.user_id = b.user_id
       AND t.type = 'expense' AND DATE_FORMAT(t.date,'%Y-%m-01') = b.month
     WHERE b.user_id = ? AND b.month = ?
     GROUP BY b.id`,
    [userId, monthStart]
  );

  const [historyRows] = await db.query(
    `SELECT DATE_FORMAT(date,'%Y-%m') AS ym, SUM(amount) AS total
     FROM transactions
     WHERE user_id = ? AND type = 'expense'
       AND date >= DATE_SUB(?, INTERVAL 4 MONTH) AND date < ?
     GROUP BY ym ORDER BY ym ASC`,
    [userId, monthStart, monthStart]
  );

  const [recurring] = await db.query(
    `SELECT next_due, is_active FROM recurring_transactions WHERE user_id = ?`,
    [userId]
  );

  const result = calculateHealthScore({
    income: Number(incomeRow.total),
    expenses: Number(expenseRow.total),
    budgets,
    monthlyExpenseHistory: historyRows.map(r => Number(r.total)),
    recurring,
    now,
  });

  // Persist a snapshot so history/trends can be built later.
  await db.query(
    `INSERT INTO financial_health_scores (user_id, score, breakdown_json) VALUES (?, ?, ?)`,
    [userId, result.score, JSON.stringify(result.breakdown)]
  );

  return result;
}

module.exports = { calculateHealthScore, computeHealthScoreForUser, WEIGHTS, TARGET_SAVINGS_RATE };
