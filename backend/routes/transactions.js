const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../config/db");
const { checkBudgets } = require("../services/alerts");

// Checks the fields of a transaction. Returns { error } or { data }.
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
async function checkFields(b, userId) {
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return { error: "Title is required" };
  if (title.length > 150) return { error: "Title is too long (150 characters at most)" };
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be a number above 0" };
  if (amount > 99999999) return { error: "Amount is too large" };
  if (!["income", "expense"].includes(b.type)) return { error: "Type must be income or expense" };
  if (!isDate(b.date)) return { error: "Date must look like 2026-10-31" };
  const note = b.note === undefined || b.note === null || b.note === "" ? null : String(b.note).slice(0, 500);
  let categoryId = null;
  if (b.category_id !== undefined && b.category_id !== null && b.category_id !== "") {
    categoryId = Number(b.category_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) return { error: "Choose a valid category" };
    // only the standard categories or this person's own ones
    const [ok] = await db.query("SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)", [categoryId, userId]);
    if (!ok.length) return { error: "Choose a valid category" };
  }
  return { data: { title, amount: Math.round(amount * 100) / 100, type: b.type, category_id: categoryId, date: b.date, note } };
}

// GET all transactions for logged-in user
router.get("/", auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.*, c.name as category_name, c.color as category_color
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ?
       ORDER BY t.date DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Transaction error:", err.message);  // ← add this
    res.status(500).json({ message: err.message });    // ← show real error
  }
});

// GET single transaction
router.get("/:id", auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM transactions WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Transaction error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST create transaction
router.post("/", auth, async (req, res) => {
  try {
    const v = await checkFields(req.body || {}, req.user.id);
    if (v.error) return res.status(400).json({ message: v.error });
    const d = v.data;
    const [result] = await db.query(
      `INSERT INTO transactions (user_id, title, amount, type, category_id, date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, d.title, d.amount, d.type, d.category_id, d.date, d.note]
    );
    try { await checkBudgets(req.user.id); } catch (e) { console.error("Alert check failed:", e.message); }
    res.status(201).json({ id: result.insertId, message: "Transaction created" });
  } catch (err) {
    console.error("Transaction error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT update transaction
router.put("/:id", auth, async (req, res) => {
  try {
    const [check] = await db.query(
      "SELECT id FROM transactions WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    if (!check.length) return res.status(404).json({ message: "Not found" });

    const v = await checkFields(req.body || {}, req.user.id);
    if (v.error) return res.status(400).json({ message: v.error });
    const d = v.data;
    await db.query(
      `UPDATE transactions SET title=?, amount=?, type=?, category_id=?, date=?, note=?
       WHERE id = ? AND user_id = ?`,
      [d.title, d.amount, d.type, d.category_id, d.date, d.note, req.params.id, req.user.id]
    );
    try { await checkBudgets(req.user.id); } catch (e) { console.error("Alert check failed:", e.message); }
    res.json({ message: "Transaction updated" });
  } catch (err) {
    console.error("Transaction error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE transaction
router.delete("/:id", auth, async (req, res) => {
  try {
    const [check] = await db.query(
      "SELECT id FROM transactions WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    if (!check.length) return res.status(404).json({ message: "Not found" });

    await db.query("DELETE FROM transactions WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    res.json({ message: "Transaction deleted" });
  } catch (err) {
    console.error("Transaction error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ---- Bulk actions: change or remove many transactions at once ----
const MAX_BULK = 500;
// Returns the clean list of ids, or null when the list is missing, empty, too long or has something that is not an id.
function cleanIds(v) {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_BULK) return null;
  const out = new Set();
  for (const x of v) {
    const n = typeof x === "string" && /^\d{1,10}$/.test(x) ? Number(x) : x;
    if (!Number.isInteger(n) || n <= 0) return null;
    out.add(n);
  }
  return [...out];
}

// POST /api/transactions/bulk/delete   { ids: [1, 2, 3] }
router.post("/bulk/delete", auth, async (req, res) => {
  try {
    const ids = cleanIds(req.body && req.body.ids);
    if (!ids) return res.status(400).json({ message: `Choose between 1 and ${MAX_BULK} transactions.` });
    const [r] = await db.query("DELETE FROM transactions WHERE user_id = ? AND id IN (?)", [req.user.id, ids]);
    res.json({ deleted: r.affectedRows, message: "Transactions deleted" });
  } catch (err) {
    console.error("Transaction bulk delete error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/transactions/bulk/category   { ids: [1, 2, 3], category_id: 4 | null }
router.post("/bulk/category", auth, async (req, res) => {
  try {
    const b = req.body || {};
    const ids = cleanIds(b.ids);
    if (!ids) return res.status(400).json({ message: `Choose between 1 and ${MAX_BULK} transactions.` });
    let categoryId = null;
    if (b.category_id !== undefined && b.category_id !== null && b.category_id !== "") {
      categoryId = Number(b.category_id);
      if (!Number.isInteger(categoryId) || categoryId <= 0) return res.status(400).json({ message: "Choose a valid category" });
      // only the standard categories or this person's own ones
      const [ok] = await db.query("SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)", [categoryId, req.user.id]);
      if (!ok.length) return res.status(400).json({ message: "Choose a valid category" });
    }
    const [r] = await db.query("UPDATE transactions SET category_id = ? WHERE user_id = ? AND id IN (?)", [categoryId, req.user.id, ids]);
    try { await checkBudgets(req.user.id); } catch (e) { console.error("Alert check failed:", e.message); }
    res.json({ updated: r.affectedRows, message: "Category changed" });
  } catch (err) {
    console.error("Transaction bulk category error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;