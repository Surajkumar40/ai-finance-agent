const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../config/db");
const { checkTransactionForAnomaly } = require("../services/anomalyDetection");

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
  const { title, amount, type, category_id, date, note } = req.body;
  if (!title || !amount || !type || !date)
    return res.status(400).json({ message: "Missing required fields" });
  try {
    const [result] = await db.query(
      `INSERT INTO transactions (user_id, title, amount, type, category_id, date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, title, amount, type, category_id || null, date, note || null]
    );
    res.status(201).json({ id: result.insertId, message: "Transaction created" });

    // Fire-and-forget: check for spending anomalies without delaying the response.
    checkTransactionForAnomaly({
      id: result.insertId, user_id: req.user.id, category_id, amount, type, date,
    }).catch(err => console.error("Anomaly check failed:", err.message));
  } catch (err) {
    console.error("Transaction error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// PUT update transaction
router.put("/:id", auth, async (req, res) => {
  const { title, amount, type, category_id, date, note } = req.body;
  try {
    const [check] = await db.query(
      "SELECT id FROM transactions WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    if (!check.length) return res.status(404).json({ message: "Not found" });

    await db.query(
      `UPDATE transactions SET title=?, amount=?, type=?, category_id=?, date=?, note=?
       WHERE id = ? AND user_id = ?`,
      [title, amount, type, category_id || null, date, note || null, req.params.id, req.user.id]
    );
    res.json({ message: "Transaction updated" });
  } catch (err) {
    console.error("Transaction error:", err.message);
    res.status(500).json({ message: err.message });
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

    await db.query("DELETE FROM transactions WHERE id = ?", [req.params.id]);
    res.json({ message: "Transaction deleted" });
  } catch (err) {
    console.error("Transaction error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;