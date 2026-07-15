const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../config/db");
const { computeHealthScoreForUser } = require("../services/healthScore");

// GET /api/health/score — recompute and return the current score + breakdown
router.get("/score", auth, async (req, res) => {
  try {
    const result = await computeHealthScoreForUser(req.user.id);
    res.json(result);
  } catch (err) {
    console.error("Health score error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/health/history — last 12 saved snapshots, oldest first (for trend charts)
router.get("/history", auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT score, calculated_at FROM financial_health_scores
       WHERE user_id = ? ORDER BY calculated_at DESC LIMIT 12`,
      [req.user.id]
    );
    res.json(rows.reverse());
  } catch (err) {
    console.error("Health history error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
