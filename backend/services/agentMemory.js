const db = require("../config/db");

// Fetch all remembered facts about a user, formatted as plain text
// so it can be dropped straight into the system prompt.
async function getMemorySummary(userId) {
  const [rows] = await db.query(
    "SELECT memory_key, memory_value FROM agent_memory WHERE user_id = ?",
    [userId]
  );
  if (!rows.length) return "No prior memory saved for this user yet.";
  return rows.map(r => `- ${r.memory_key}: ${r.memory_value}`).join("\n");
}

// Save or overwrite a single fact.
async function saveMemory(userId, key, value) {
  await db.query(
    `INSERT INTO agent_memory (user_id, memory_key, memory_value)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE memory_value = VALUES(memory_value)`,
    [userId, key, String(value)]
  );
}

module.exports = { getMemorySummary, saveMemory };
