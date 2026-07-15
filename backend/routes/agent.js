const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Anthropic = require("@anthropic-ai/sdk");
const db = require("../config/db");
const { TOOLS, executeTool } = require("../services/agentTools");
const { getMemorySummary, saveMemory } = require("../services/agentMemory");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 6; // safety cap so a stuck loop can't run forever

// ───────────────── GET /api/agent/history ─────────────────
// Load recent conversation so the chat UI can restore state on refresh.
router.get("/history", auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT role, content, tool_calls, created_at
       FROM agent_conversations
       WHERE user_id = ?
       ORDER BY created_at ASC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ history: rows });
  } catch (err) {
    console.error("AGENT HISTORY ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ───────────────── POST /api/agent/chat ─────────────────
router.post("/chat", auth, async (req, res) => {
  const userId = req.user.id;
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Message is required" });

  try {
    const memorySummary = await getMemorySummary(userId);

    const systemPrompt = `You are an AI finance agent for a personal finance tracker app.
You have direct access to the user's real transaction data through tools — use them
instead of guessing or asking the user to look things up themselves.

What you know about this user so far:
${memorySummary}

Guidelines:
- Use ₹ (INR) for all currency figures unless the user's data says otherwise.
- Call get_categories before add_transaction or update_budget if you're unsure of exact category names.
- Only call add_transaction or update_budget when the user clearly asked for that action — never invent transactions.
- Keep answers concise and concrete. Use real numbers from the tools, not estimates.
- If you learn something durable about the user (a goal, a preference, their income), mention it plainly in your reply — the app will remember it separately.`;

    // Load recent turns for short-term context (final text only, not tool internals)
    const [historyRows] = await db.query(
      `SELECT role, content FROM agent_conversations
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );
    const priorMessages = historyRows.reverse().map(r => ({ role: r.role, content: r.content }));

    const messages = [...priorMessages, { role: "user", content: message }];
    const toolCallLog = [];

    let response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    let rounds = 0;
    while (response.stop_reason === "tool_use" && rounds < MAX_TOOL_ROUNDS) {
      rounds++;
      messages.push({ role: "assistant", content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        let result;
        try {
          result = await executeTool(block.name, block.input, userId);
        } catch (err) {
          result = { error: err.message };
        }
        toolCallLog.push({ tool: block.name, input: block.input });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });

      response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });
    }

    const replyText = response.content.find(b => b.type === "text")?.text
      || "I wasn't able to generate a response — please try rephrasing.";

    // Persist this turn (user message + final assistant reply + which tools ran)
    await db.query(
      `INSERT INTO agent_conversations (user_id, role, content, tool_calls) VALUES (?, 'user', ?, NULL)`,
      [userId, message]
    );
    await db.query(
      `INSERT INTO agent_conversations (user_id, role, content, tool_calls) VALUES (?, 'assistant', ?, ?)`,
      [userId, replyText, JSON.stringify(toolCallLog)]
    );

    res.json({ reply: replyText, toolCalls: toolCallLog });
  } catch (err) {
    console.error("AGENT CHAT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ───────────────── POST /api/agent/memory ─────────────────
// Lets the frontend (or future features) explicitly save a fact.
router.post("/memory", auth, async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) return res.status(400).json({ error: "key and value are required" });
  try {
    await saveMemory(req.user.id, key, value);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
