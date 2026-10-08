const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../config/db");

// GET default categories + the logged-in user's own
router.get("/", auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY name ASC",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Categories error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
