const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { computeHealth, saveAndCompare } = require('../services/health');

// GET /api/health-score
router.get('/', auth, async (req, res) => {
  try {
    const result = await computeHealth(req.user.id);
    if (!result.hasData) return res.json({ hasData: false });
    const extra = await saveAndCompare(req.user.id, result);
    res.json({ ...result, ...extra });
  } catch (err) {
    console.error('HEALTH SCORE ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
