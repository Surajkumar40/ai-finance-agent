const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const session = require('../services/session');
const auth = require('../middleware/auth');
const mailer = require('../services/mailer');
const household = require('../services/household');
const reminders = require('../services/reminders');

// /api/account/...
//   GET    /me                      who am I
//   PUT    /profile                 change name / email
//   PUT    /password                change password (needs the current one)
//   GET    /export?format=json|csv  download all my data
//   DELETE /                        delete my account and everything in it (needs the password)
//   POST   /forgot-password         email a reset link            (no login needed)
//   GET    /reset-password/check    is this reset link still good (no login needed)
//   POST   /reset-password          set a new password with a link (no login needed)
//   GET    /reminders               my bill-reminder email settings
//   PUT    /reminders               { enabled, days }  turn bill reminders on or off, how many days ahead (1-7)
//   POST   /reminders/test          send myself a sample reminder email
//   GET/POST /unsubscribe?token=    one-click unsubscribe from the email (no login needed)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isDemo = (email) => String(email || '').endsWith('@demo.local');
const RESET_HOURS = 1;
const RESET_MAX_PER_HOUR = 6;
const DEMO_MSG = 'This is a demo account, so this is turned off. Create your own account to use it.';

const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 100;
const clean = (s) => (typeof s === 'string' ? s.trim() : '');

async function getUser(id) {
  const [rows] = await db.query('SELECT id, name, email, password, created_at FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

// The table for reset links is created the first time it is needed, so you do not have to run a migration.
let tableReady;
function ensureResetTable() {
  if (!tableReady) {
    tableReady = db.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token_hash),
        INDEX idx_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`).catch((e) => { tableReady = null; throw e; });
  }
  return tableReady;
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ───────── profile ─────────
router.get('/me', auth, async (req, res) => {
  try {
    const u = await getUser(req.user.id);
    if (!u) return res.status(404).json({ message: 'Account not found' });
    res.json({ ...publicUser(u), created_at: u.created_at, isDemo: isDemo(u.email) });
  } catch (err) { console.error('ACCOUNT ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const u = await getUser(req.user.id);
    if (!u) return res.status(404).json({ message: 'Account not found' });
    if (isDemo(u.email)) return res.status(403).json({ message: DEMO_MSG });

    const name = req.body.name === undefined ? u.name : clean(req.body.name);
    const email = req.body.email === undefined ? u.email : clean(req.body.email);
    if (!name) return res.status(400).json({ message: 'Name is required' });
    if (name.length > 100) return res.status(400).json({ message: 'Name is too long' });
    if (!EMAIL_RE.test(email) || email.length > 100) return res.status(400).json({ message: 'Enter a valid email address' });
    if (isDemo(email)) return res.status(400).json({ message: 'Enter a valid email address' });

    if (email.toLowerCase() !== u.email.toLowerCase()) {
      const [taken] = await db.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, u.id]);
      if (taken.length) return res.status(409).json({ message: 'That email is already used by another account' });
    }
    await db.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, u.id]);
    res.json({ user: { id: u.id, name, email } });
  } catch (err) { console.error('ACCOUNT ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

router.put('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const u = await getUser(req.user.id);
    if (!u) return res.status(404).json({ message: 'Account not found' });
    if (isDemo(u.email)) return res.status(403).json({ message: DEMO_MSG });
    if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, u.password))) {
      return res.status(400).json({ message: 'Your current password is not correct' });
    }
    if (!validPassword(newPassword)) return res.status(400).json({ message: 'New password must be 8 to 100 characters' });
    if (newPassword === currentPassword) return res.status(400).json({ message: 'Choose a password different from your current one' });
    await db.query('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(newPassword, 10), u.id]);
    await session.signOutEverywhere(u.id); // every other phone and browser has to sign in again
    res.json({ message: 'Password changed', token: await session.signToken(u.id, u.email) }); // this device stays signed in
  } catch (err) { console.error('ACCOUNT ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

// ───────── export ─────────
const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // stops spreadsheet formulas in text
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const ymd = (v) => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : v);

router.get('/export', auth, async (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const uid = req.user.id;
  try {
    const u = await getUser(uid);
    if (!u) return res.status(404).json({ message: 'Account not found' });
    const [tx] = await db.query(
      `SELECT t.date, t.title, t.amount, t.type, c.name AS category, t.note, t.is_recurring
         FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.user_id = ? ORDER BY t.date, t.id`, [uid]);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const head = 'date,title,amount,type,category,note\n';
      const body = tx.map((t) => [ymd(t.date), t.title, t.amount, t.type, t.category, t.note].map(csvCell).join(',')).join('\n');
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="finance-transactions-${stamp}.csv"` });
      return res.send('﻿' + head + body + (body ? '\n' : ''));
    }

    const [budgets] = await db.query(
      `SELECT c.name AS category, b.monthly_limit, b.month FROM budgets b JOIN categories c ON c.id = b.category_id WHERE b.user_id = ? ORDER BY b.month, c.name`, [uid]);
    const [goals] = await db.query(
      'SELECT name, icon, target_amount, saved_amount, target_date, completed_at FROM savings_goals WHERE user_id = ? ORDER BY id', [uid]);
    const [recurring] = await db.query(
      `SELECT r.title, r.amount, r.type, c.name AS category, r.frequency, r.next_due, r.is_active
         FROM recurring_transactions r LEFT JOIN categories c ON c.id = r.category_id WHERE r.user_id = ? ORDER BY r.id`, [uid]);
    const [categories] = await db.query('SELECT name, icon, color FROM categories WHERE user_id = ? ORDER BY name', [uid]);
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="finance-data-${stamp}.json"` });
    res.send(JSON.stringify({
      exportedAt: new Date().toISOString(),
      account: { name: u.name, email: u.email, created_at: u.created_at },
      transactions: tx.map((t) => ({ ...t, date: ymd(t.date), amount: Number(t.amount), is_recurring: !!t.is_recurring })),
      budgets: budgets.map((b) => ({ ...b, monthly_limit: Number(b.monthly_limit), month: String(ymd(b.month)).slice(0, 7) })),
      goals: goals.map((g) => ({ ...g, target_amount: Number(g.target_amount), saved_amount: Number(g.saved_amount), target_date: g.target_date ? ymd(g.target_date) : null })),
      recurring: recurring.map((r) => ({ ...r, amount: Number(r.amount), next_due: ymd(r.next_due), is_active: !!r.is_active })),
      customCategories: categories,
    }, null, 2));
  } catch (err) { console.error('EXPORT ERROR:', err.message); res.status(500).json({ message: 'Could not prepare your data' }); }
});

// ───────── delete account ─────────
router.delete('/', auth, async (req, res) => {
  const uid = req.user.id;
  let conn;
  try {
    const u = await getUser(uid);
    if (!u) return res.status(404).json({ message: 'Account not found' });
    if (isDemo(u.email)) return res.status(403).json({ message: DEMO_MSG });
    const { password } = req.body || {};
    if (typeof password !== 'string' || !(await bcrypt.compare(password, u.password))) {
      return res.status(400).json({ message: 'Your password is not correct' });
    }
    conn = await db.getConnection();
    await conn.beginTransaction();
    // Most tables clean up by themselves (ON DELETE CASCADE). These do not, so they are removed here.
    for (const table of ['agent_chat_history', 'audit_logs']) {
      try { await conn.query(`DELETE FROM ${table} WHERE user_id = ?`, [uid]); }
      catch (e) { if (e.code !== 'ER_NO_SUCH_TABLE') throw e; }
    }
    await household.ensureTables();
    await household.removeUserFromHousehold(uid, conn); // hands the household on, or closes it if you were the last one
    await conn.query('DELETE FROM users WHERE id = ?', [uid]);
    await conn.commit();
    res.json({ message: 'Account deleted' });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch { /* ignore */ } }
    console.error('DELETE ACCOUNT ERROR:', err.message);
    res.status(500).json({ message: 'Could not delete the account' });
  } finally { if (conn) conn.release(); }
});

// ───────── forgot / reset password ─────────
const GENERIC = { message: 'If that email belongs to an account, a reset link is on its way. It works for 1 hour.' };

function frontendUrl() {
  // Only from settings. Never from the request, or someone could make the email point to their own site.
  let u = String(process.env.FRONTEND_URL || 'http://localhost:5173').trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u; // forgot the https:// ? add it, or the link would not open
  return u;
}
if (!process.env.FRONTEND_URL) {
  console.warn('⚠️  FRONTEND_URL is not set. Reset links in emails will point to http://localhost:5173 and will NOT work for users. Set FRONTEND_URL=https://<your-vercel-site> on Render.');
} else {
  console.log(`🔗 Reset links will open: ${frontendUrl()}/reset-password?token=...`);
}

router.post('/forgot-password', async (req, res) => {
  const email = clean(req.body?.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
  // Same answer whether or not the email exists, so this cannot be used to find out who has an account.
  res.json(GENERIC);

  try {
    await ensureResetTable();
    const [rows] = await db.query('SELECT id, name, email FROM users WHERE email = ?', [email]);
    const u = rows[0];
    if (!u || isDemo(u.email)) return;
    const [[{ n }]] = await db.query(
      'SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > NOW() - INTERVAL 1 HOUR', [u.id]);
    if (Number(n) >= RESET_MAX_PER_HOUR) { console.warn(`FORGOT PASSWORD: limit of ${RESET_MAX_PER_HOUR} mails per hour reached for user ${u.id}, no mail sent. Try again in an hour.`); return; } // stops anyone filling an inbox

    const token = crypto.randomBytes(32).toString('hex');
    // older links stay valid until they are used or expire, so opening an earlier mail still works
    await db.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, NOW() + INTERVAL ${RESET_HOURS} HOUR)`,
      [u.id, sha256(token)]);

    const link = `${frontendUrl()}/reset-password?token=${token}`;
    const first = String(u.name || '').trim().split(/\s+/)[0] || 'there';
    const sent = await mailer.sendMail({
      to: u.email,
      subject: 'Reset your Finance AI password',
      text: `Hi ${first},\n\nSomeone asked to reset the password for your Finance AI account. To choose a new password, open this link (it works for ${RESET_HOURS} hour):\n\n${link}\n\nIf this was not you, you can ignore this email. Your password will stay the same.\n`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#1e293b">
        <h2 style="margin:0 0 12px">Reset your password</h2>
        <p>Hi ${first.replace(/[<>&"]/g, '')},</p>
        <p>Someone asked to reset the password for your Finance AI account. Click the button to choose a new one. The link works for ${RESET_HOURS} hour.</p>
        <p style="margin:24px 0"><a href="${link}" style="background:#6d5dfc;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Choose a new password</a></p>
        <p style="font-size:13px;color:#64748b">Or copy this link into your browser:<br>${link}</p>
        <p style="font-size:13px;color:#64748b">If this was not you, ignore this email. Your password will stay the same.</p></div>`,
    });
    console.log(`📧 Reset mail handed to the email service for ${u.email.replace(/^(.).*(@.*)$/, '$1***$2')}${sent?.messageId ? ' (id ' + sent.messageId + ')' : ''}`);
  } catch (err) {
    console.error('FORGOT PASSWORD ERROR:', err.message);
  }
});

// Open https://<your-render-url>/api/account/email-status in a browser to see if email is set up. Shows no secrets.
router.get('/email-status', (req, res) => {
  const p = mailer.provider();
  const url = frontendUrl();
  const problems = [];
  if (!p) problems.push(mailer.setupProblem());
  if (!process.env.FRONTEND_URL) problems.push('FRONTEND_URL is not set, so links in the email point to localhost.');
  else if (/localhost|127\.0\.0\.1/.test(url)) problems.push('FRONTEND_URL points to localhost. Set it to your Vercel site.');
  res.json({ email: p ? `ON (${p})` : 'OFF', sender: p ? String(process.env.MAIL_FROM_EMAIL || process.env.MAIL_FROM || '').replace(/^(.{2}).*(@.*)$/, '$1***$2') : null,
    links_open: `${url}/reset-password?token=...`, ok: problems.length === 0, problems });
});

// Sends a real test mail and then asks the email service what happened to it.
// Off unless EMAIL_TEST_KEY is set on the server. Open in a browser:
//   https://<your-render-url>/api/account/email-test?key=<EMAIL_TEST_KEY>&to=<an email you can open>
// Remove EMAIL_TEST_KEY again once email works.
let lastTest = 0;
router.get('/email-test', async (req, res) => {
  const secret = String(process.env.EMAIL_TEST_KEY || '');
  if (!secret) return res.status(404).json({ message: 'Not found' });
  const given = Buffer.from(String(req.query.key || ''));
  const want = Buffer.from(secret);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(403).json({ message: 'Wrong key' });
  const to = clean(req.query.to);
  if (!EMAIL_RE.test(to)) return res.status(400).json({ message: 'Add &to=<an email address> to the link' });
  if (!mailer.provider()) return res.status(400).json({ ok: false, problem: mailer.setupProblem() });
  const waitMs = Number(process.env.EMAIL_TEST_MAX_MS) || 9000, pollMs = Number(process.env.EMAIL_TEST_POLL_MS) || 2000;
  if (Date.now() - lastTest < Math.min(15000, waitMs + 1000)) return res.status(429).json({ message: 'One test at a time. Wait a few seconds and try again.' });
  lastTest = Date.now();

  const from = process.env.MAIL_FROM_EMAIL || process.env.MAIL_FROM || '';
  const out = { to, from, provider: mailer.provider(), frontend_url: frontendUrl() };
  try {
    const sent = await mailer.sendMail({
      to, subject: 'Finance AI test email',
      text: 'This is a test email from your Finance AI server. If you can read this, email sending works.',
      html: '<p>This is a test email from your <b>Finance AI</b> server. If you can read this, email sending works.</p>',
    });
    out.accepted_by_provider = true; out.messageId = sent.messageId || null;
  } catch (err) {
    out.accepted_by_provider = false; out.error = err.message;
    out.verdict = { status: 'problem', text: 'The email service refused the request itself, so no mail was sent. The message in "error" says why (see its HINT).' };
    return res.json(out);
  }
  if (out.provider !== 'brevo') { out.verdict = { status: 'pending', text: 'Accepted by the email service. Delivery lookup is only available for Brevo, so check your inbox and the service dashboard.' }; return res.json(out); }

  // Brevo needs a few seconds to record what happened, so ask a few times.
  const started = Date.now(); let events = [];
  try {
    while (Date.now() - started < waitMs) {
      await new Promise((r) => setTimeout(r, pollMs));
      const all = await mailer.brevoEvents(to);
      events = all.filter((e) => out.messageId && e.messageId === out.messageId);
      // if the ids are written differently by the service, fall back to whatever happened in the last few minutes
      if (!events.length) events = all.filter((e) => Date.now() - Date.parse(e.date) < 5 * 60 * 1000);
      if (events.some((e) => e.event !== 'requests')) break;
    }
  } catch (err) { out.lookup_error = err.message; }
  out.events = events.map((e) => ({ event: e.event, reason: e.reason || undefined, at: e.date }));
  out.verdict = mailer.verdict(events, from);
  res.json(out);
});

async function findValidReset(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  await ensureResetTable();
  const [rows] = await db.query(
    'SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()', [sha256(token)]);
  return rows[0] || null;
}

router.get('/reset-password/check', async (req, res) => {
  try { res.json({ valid: !!(await findValidReset(req.query.token)) }); }
  catch (err) { console.error('RESET CHECK ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!validPassword(password)) return res.status(400).json({ message: 'Password must be 8 to 100 characters' });
    const r = await findValidReset(token);
    if (!r) return res.status(400).json({ message: 'This reset link is invalid or has expired. Please ask for a new one.' });
    await db.query('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(password, 10), r.user_id]);
    await db.query('UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [r.user_id]);
    await session.signOutEverywhere(r.user_id); // someone who had access with the old password is signed out too
    res.json({ message: 'Password changed. You can sign in now.' });
  } catch (err) { console.error('RESET ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

// ───────── bill reminder emails ─────────
const reminderState = async (userId) => {
  await reminders.ensureSchema();
  const [[r]] = await db.query('SELECT email_reminders, reminder_days FROM users WHERE id = ?', [userId]);
  return { enabled: !!r.email_reminders, days: Number(r.reminder_days) || 2 };
};

router.get('/reminders', auth, async (req, res) => {
  try {
    const u = await getUser(req.user.id);
    if (!u) return res.status(404).json({ message: 'Account not found' });
    res.json({ ...(await reminderState(u.id)), email_ready: !mailer.setupProblem(), demo: isDemo(u.email) });
  } catch (err) { console.error('REMINDERS ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

router.put('/reminders', auth, async (req, res) => {
  try {
    const u = await getUser(req.user.id);
    if (!u) return res.status(404).json({ message: 'Account not found' });
    if (isDemo(u.email)) return res.status(403).json({ message: DEMO_MSG });
    const { enabled, days } = req.body || {};
    if (typeof enabled !== 'boolean') return res.status(400).json({ message: 'Choose on or off.' });
    const d = days === undefined ? null : Number(days);
    if (d !== null && (!Number.isInteger(d) || d < 1 || d > 7)) return res.status(400).json({ message: 'Choose 1 to 7 days.' });
    await reminders.ensureSchema();
    await db.query('UPDATE users SET email_reminders = ?, reminder_days = COALESCE(?, reminder_days) WHERE id = ?', [enabled ? 1 : 0, d, u.id]);
    res.json({ ...(await reminderState(u.id)), message: enabled ? 'Bill reminders are on' : 'Bill reminders are off' });
  } catch (err) { console.error('REMINDERS ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

router.post('/reminders/test', auth, async (req, res) => {
  try {
    const u = await getUser(req.user.id);
    if (!u) return res.status(404).json({ message: 'Account not found' });
    if (isDemo(u.email)) return res.status(403).json({ message: DEMO_MSG });
    const problem = mailer.setupProblem();
    if (problem) return res.status(503).json({ message: 'Email is not set up on the server yet, so no mail can be sent.' });
    await reminders.ensureSchema();
    const st = await reminderState(u.id);
    const today = reminders.nowIn().date;
    let items = await reminders.upcoming(u.id, today, st.days);
    let sample = false;
    if (!items.length) { sample = true; items = [{ id: 0, title: 'Example bill (rent, phone, subscription…)', amount: 999, due: reminders.addDays(today, 1), key: 'sample' }]; }
    const mail = reminders.composeMail(u, items.slice(0, 15), today, { test: true });
    const sent = await mailer.sendMail({ to: u.email, ...mail });
    if (!sent || !sent.sent) return res.status(502).json({ message: 'The email service did not accept the message. Please try again later.' });
    res.json({ message: `A test email was sent to ${u.email}.${sample ? ' You have no bills due soon, so it shows an example.' : ''} If you do not see it, check your spam folder.` });
  } catch (err) { console.error('REMINDER TEST ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

// The link in every reminder email. Opening it only shows a button (mail scanners open links on their own);
// pressing the button turns the reminders off.
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;
router.get('/unsubscribe', (req, res) => {
  const t = typeof req.query.token === 'string' ? req.query.token : '';
  res.type('html');
  if (reminders.readUnsubToken(t) === null) return res.status(400).send(page('This link is not valid', '<p>It may be incomplete. You can turn bill reminders off in Profile inside the app.</p>'));
  res.send(page('Turn off bill reminders?', `<form method="post" action="/api/account/unsubscribe?token=${encodeURIComponent(t)}"><p>You will stop getting emails about upcoming bills.</p><button type="submit">Turn off bill reminders</button></form>`));
});
router.post('/unsubscribe', async (req, res) => {
  const t = typeof req.query.token === 'string' ? req.query.token : '';
  res.type('html');
  try {
    const id = reminders.readUnsubToken(t);
    if (id === null) return res.status(400).send(page('This link is not valid', '<p>You can turn bill reminders off in Profile inside the app.</p>'));
    await reminders.ensureSchema();
    await db.query('UPDATE users SET email_reminders = 0 WHERE id = ?', [id]);
    res.send(page('Bill reminders are off', '<p>You will not get these emails any more. You can turn them on again in Profile inside the app.</p>'));
  } catch (err) { console.error('UNSUBSCRIBE ERROR:', err.message); res.status(500).send(page('Something went wrong', '<p>Please try again, or turn reminders off in Profile inside the app.</p>')); }
});


module.exports = router;