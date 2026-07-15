const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../config/db");

// GET /api/alerts — recent alerts for the logged-in user (newest first)
router.get("/", auth, async (req, res) => {
  try {
    const onlyUnread = req.query.unread === "true";
    const [rows] = await db.query(
      `SELECT id, type, message, metadata_json, is_read, triggered_at
       FROM alerts
       WHERE user_id = ? ${onlyUnread ? "AND is_read = FALSE" : ""}
       ORDER BY triggered_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Alerts error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/alerts/unread-count
router.get("/unread-count", auth, async (req, res) => {
  try {
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS count FROM alerts WHERE user_id = ? AND is_read = FALSE`,
      [req.user.id]
    );
    res.json({ count: Number(row.count) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/alerts/:id/read — mark a single alert as read
router.patch("/:id/read", auth, async (req, res) => {
  try {
    await db.query(
      `UPDATE alerts SET is_read = TRUE WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );
    res.json({ message: "Alert marked as read" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/alerts/read-all
router.patch("/read-all", auth, async (req, res) => {
  try {
    await db.query(`UPDATE alerts SET is_read = TRUE WHERE user_id = ?`, [req.user.id]);
    res.json({ message: "All alerts marked as read" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
