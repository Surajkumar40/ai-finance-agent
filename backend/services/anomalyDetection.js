const db = require("../config/db");

// A category needs at least this many prior transactions before we trust
// its baseline enough to flag anomalies — avoids false positives on the
// very first purchase in a brand-new category.
const MIN_BASELINE_SAMPLES = 3;

// A transaction is flagged if it exceeds the baseline average by this factor.
const ANOMALY_MULTIPLIER = 2;

/**
 * Pure comparison helper — kept separate from the DB call so the
 * threshold logic itself is unit-testable without a database.
 */
function isAnomalous(amount, baselineAvg, sampleCount) {
  if (sampleCount < MIN_BASELINE_SAMPLES) return false;
  if (baselineAvg <= 0) return false;
  return amount > baselineAvg * ANOMALY_MULTIPLIER;
}

/**
 * Checks one newly-created expense transaction against the user's
 * 3-month baseline for that category, and writes an alert row if it
 * looks like a spike. Designed to be called fire-and-forget right
 * after a transaction insert — it never throws (errors are logged only)
 * so it can't fail the user's request.
 */
async function checkTransactionForAnomaly(transaction) {
  const { id, user_id, category_id, amount, type, date } = transaction;
  if (type !== "expense" || !category_id) return null;

  try {
    const [[baseline]] = await db.query(
      `SELECT COUNT(*) AS cnt, COALESCE(AVG(amount),0) AS avg_amount
       FROM transactions
       WHERE user_id = ? AND category_id = ? AND type = 'expense'
         AND id != ? AND date >= DATE_SUB(?, INTERVAL 3 MONTH) AND date < ?`,
      [user_id, category_id, id, date, date]
    );

    const sampleCount = Number(baseline.cnt);
    const baselineAvg = Number(baseline.avg_amount);

    if (!isAnomalous(Number(amount), baselineAvg, sampleCount)) return null;

    const [[category]] = await db.query(`SELECT name FROM categories WHERE id = ?`, [category_id]);
    const categoryName = category?.name ?? "this category";
    const message = `This ${categoryName} expense of ₹${Number(amount).toLocaleString("en-IN")} is more than double your usual ₹${Math.round(baselineAvg).toLocaleString("en-IN")} average.`;

    await db.query(
      `INSERT INTO alerts (user_id, type, message, metadata_json) VALUES (?, 'anomaly', ?, ?)`,
      [user_id, message, JSON.stringify({ transaction_id: id, category_id, amount, baselineAvg, sampleCount })]
    );

    return { flagged: true, message };
  } catch (err) {
    console.error("Anomaly detection error:", err.message);
    return null;
  }
}

module.exports = { checkTransactionForAnomaly, isAnomalous, MIN_BASELINE_SAMPLES, ANOMALY_MULTIPLIER };
