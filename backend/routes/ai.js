const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ───────────────── CHAT ─────────────────
router.post("/chat", auth, async (req, res) => {
  try {
    const { message, transactions = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Message is required" });

    const context = transactions.length > 0
      ? `User's transactions:\n${JSON.stringify(transactions.slice(0, 40), null, 2)}\n\n`
      : "";

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: "You are a helpful personal finance assistant. Give concise advice. Use ₹ for currency.",
      messages: [{ role: "user", content: context + message }],
    });

    const reply = response.content?.[0]?.text;
    if (!reply) return res.status(500).json({ error: "No response from AI" });

    res.json({ reply });
  } catch (err) {
    console.error("AI CHAT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ───────────────── CATEGORISE ─────────────────
router.post("/categorise", auth, async (req, res) => {
  try {
    const { description, categories = [] } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: "Description is required" });

    const catList = categories.map(c => typeof c === "object" ? c.name : c).join(", ");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 30,
      system: "You are a transaction categoriser. Reply ONLY with the best matching category name from the list. No explanation.",
      messages: [{ role: "user", content: `Categories: ${catList}\nTransaction: "${description}"\nBest category:` }],
    });

    const category = response.content?.[0]?.text?.trim();
    if (!category) return res.status(500).json({ error: "No category returned" });

    res.json({ category });
  } catch (err) {
    console.error("CATEGORISE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;