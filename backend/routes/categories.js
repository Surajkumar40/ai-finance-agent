const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../config/db");

// GET all categories
router.get("/", auth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM categories ORDER BY name ASC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;