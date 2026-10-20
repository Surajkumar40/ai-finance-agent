// Categories: the standard ones everybody has, plus the person's own.   /api/categories
//
//   GET    /          standard + own categories (what the pickers use)
//   GET    /mine      own categories with how much each is used
//   POST   /          add one         { name, icon?, color? }
//   PUT    /:id       change one of your own
//   DELETE /:id       remove one of your own (transactions stay, they become "no category"; its budgets go with it)
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../config/db");

const MAX_OWN = 30;
const MAX_NAME = 30;
const DEFAULT_ICON = "🏷️";
const DEFAULT_COLOR = "#6366f1";
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const posInt = (v) => { const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v; return Number.isInteger(n) && n > 0 ? n : null; };

// Returns { error } or { data }. With `partial`, fields that are missing are left out.
function check(b, partial = false) {
  const d = {};
  if (!partial || b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ") : "";
    if (!name) return { error: "Give the category a name." };
    if ([...name].length > MAX_NAME) return { error: `The name can have up to ${MAX_NAME} characters.` };
    d.name = name;
  }
  if (!partial || b.icon !== undefined) {
    const icon = typeof b.icon === "string" ? b.icon.trim() : "";
    if (b.icon !== undefined && b.icon !== null && typeof b.icon !== "string") return { error: "Choose an emoji for the icon." };
    if ([...icon].length > 6 || icon.length > 10) return { error: "Use a single emoji for the icon." };
    d.icon = icon || DEFAULT_ICON;
  }
  if (!partial || b.color !== undefined) {
    if (b.color !== undefined && b.color !== null && b.color !== "" && (typeof b.color !== "string" || !COLOR_RE.test(b.color))) return { error: "Choose a colour from the list." };
    d.color = (b.color || DEFAULT_COLOR).toLowerCase();
  }
  return { data: d };
}

// A name may not repeat a standard category or one of your own (the receipt scanner and voice entry pick categories by name).
async function nameTaken(name, userId, exceptId = 0) {
  const [rows] = await db.query(
    "SELECT id FROM categories WHERE name = ? AND (user_id IS NULL OR user_id = ?) AND id <> ? LIMIT 1", [name, userId, exceptId]);
  return rows.length > 0;
}

const charError = (err) => err && (err.code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD" || err.code === "ER_INCORRECT_STRING_VALUE");

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

router.get("/mine", auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.id, c.name, c.icon, c.color,
              (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id AND t.user_id = c.user_id) AS transactions,
              (SELECT COUNT(*) FROM budgets b WHERE b.category_id = c.id AND b.user_id = c.user_id) AS budgets,
              (SELECT COUNT(*) FROM recurring_transactions r WHERE r.category_id = c.id AND r.user_id = c.user_id) AS recurring
         FROM categories c WHERE c.user_id = ? ORDER BY c.name ASC`, [req.user.id]);
    res.json({ categories: rows.map((r) => ({ ...r, transactions: Number(r.transactions), budgets: Number(r.budgets), recurring: Number(r.recurring) })), max: MAX_OWN });
  } catch (err) {
    console.error("CATEGORIES MINE ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", auth, async (req, res) => {
  try {
    const v = check(req.body || {});
    if (v.error) return res.status(400).json({ message: v.error });
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM categories WHERE user_id = ?", [req.user.id]);
    if (Number(n) >= MAX_OWN) return res.status(400).json({ message: `You can have up to ${MAX_OWN} categories of your own. Remove one first.` });
    if (await nameTaken(v.data.name, req.user.id)) return res.status(409).json({ message: "A category with that name already exists." });
    const [r] = await db.query("INSERT INTO categories (name, icon, color, user_id) VALUES (?,?,?,?)", [v.data.name, v.data.icon, v.data.color, req.user.id]);
    res.status(201).json({ id: r.insertId, message: "Category added" });
  } catch (err) {
    if (charError(err)) return res.status(400).json({ message: "That name or icon has a character that cannot be saved." });
    console.error("CATEGORY ADD ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const id = posInt(req.params.id);
    if (!id) return res.status(404).json({ message: "Category not found." });
    const v = check(req.body || {}, true);
    if (v.error) return res.status(400).json({ message: v.error });
    const keys = Object.keys(v.data);
    if (!keys.length) return res.status(400).json({ message: "Nothing to change." });
    // only your own: the standard ones (user_id NULL) and other people's never match
    const [own] = await db.query("SELECT id FROM categories WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (!own.length) return res.status(404).json({ message: "Category not found." });
    if (v.data.name !== undefined && (await nameTaken(v.data.name, req.user.id, id))) return res.status(409).json({ message: "A category with that name already exists." });
    await db.query(`UPDATE categories SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ? AND user_id = ?`, [...keys.map((k) => v.data[k]), id, req.user.id]);
    res.json({ message: "Saved" });
  } catch (err) {
    if (charError(err)) return res.status(400).json({ message: "That name or icon has a character that cannot be saved." });
    console.error("CATEGORY UPDATE ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const id = posInt(req.params.id);
    if (!id) return res.status(404).json({ message: "Category not found." });
    const [r] = await db.query("DELETE FROM categories WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ message: "Category not found." });
    res.json({ message: "Removed" });
  } catch (err) {
    console.error("CATEGORY DELETE ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;