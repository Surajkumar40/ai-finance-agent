// Sign-in tokens. Every user has a "token_version". It goes into the token when it is made and is checked on
// every request. Changing or resetting a password raises the number, so tokens made before that stop working
// (other phones and browsers are signed out). The column is added automatically the first time it is needed.
const jwt = require('jsonwebtoken');
const db = require('../config/db');

let ready;
function ensureColumn() {
  if (!ready) {
    ready = (async () => {
      const [c] = await db.query(
        `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'token_version'`);
      if (!c.length) await db.query('ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0');
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

async function versionOf(userId) {
  await ensureColumn();
  const [rows] = await db.query('SELECT token_version FROM users WHERE id = ?', [userId]);
  return rows[0] ? Number(rows[0].token_version) : null; // null = no such user
}

async function signToken(userId, email, expiresIn = '7d') {
  const tv = await versionOf(userId);
  return jwt.sign({ userId, email, tv: tv ?? 0 }, process.env.JWT_SECRET, { expiresIn, algorithm: 'HS256' });
}

// signs out everywhere except the device that is told the new token
async function signOutEverywhere(userId, conn = db) {
  await ensureColumn();
  await conn.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [userId]);
}

module.exports = { ensureColumn, versionOf, signToken, signOutEverywhere };