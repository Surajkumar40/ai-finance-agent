// Shared budgets. Mounted automatically as /api/household.
//   GET    /                       my household (members, pending invites) + invites waiting for me
//   POST   /                       create a household            { name }
//   PATCH  /                       rename it (owner)             { name }
//   DELETE /                       close it for everyone (owner)
//   POST   /leave                  leave (the owner role passes on; the last one out closes it)
//   DELETE /members/:userId        remove someone (owner)
//   POST   /invites                invite by email               { email }  -> also returns a link to copy
//   DELETE /invites/:id            cancel a pending invite
//   POST   /invites/:id/accept     accept an invite sent to my email
//   POST   /invites/:id/decline    decline it
//   GET    /invite-info?token=     who invited me (for the link page)
//   POST   /join                   accept through the link        { token }
//   GET    /budgets?month=YYYY-MM  shared budgets with spending, and each member's share (totals only)
//   POST   /budgets                set a shared limit            { category_id, monthly_limit, month? }
//   POST   /budgets/copy           copy limits to another month  { from, to }
//   DELETE /budgets/:id            remove a shared budget
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const mailer = require('../services/mailer');
const hh = require('../services/household');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const INVITE_DAYS = 7;
const INVITES_PER_HOUR = 10;
const DEMO_MSG = 'Demo accounts cannot use shared budgets. Create your own account to try it.';

const clean = (s) => (typeof s === 'string' ? s.trim() : '');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const esc = (s) => String(s).replace(/[<>&"']/g, '');
const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthStart = (m) => { const x = m || currentMonth(); return MONTH_RE.test(x) ? x + '-01' : null; };
const PENDING = 'accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()';

router.use(auth, async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT id, name, email FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]) return res.status(401).json({ message: 'Invalid or expired token.' });
    if (String(rows[0].email).endsWith('@demo.local')) return res.status(403).json({ message: DEMO_MSG });
    req.me = rows[0];
    await hh.ensureTables();
    next();
  } catch (err) { console.error('HOUSEHOLD SETUP ERROR:', err.message); res.status(500).json({ message: 'Server error' }); }
});

const fail = (res, err, what) => { console.error(`HOUSEHOLD ${what} ERROR:`, err.message); res.status(500).json({ message: 'Server error' }); };

// loads my household or answers 404
async function needMember(req, res) {
  const mem = await hh.membershipOf(req.me.id);
  if (!mem) { res.status(404).json({ message: 'Create or join a household first.' }); return null; }
  return mem;
}

// ───────── overview ─────────
router.get('/', async (req, res) => {
  try {
    const mem = await hh.membershipOf(req.me.id);
    const [mine] = await db.query(
      `SELECT i.id, h.name AS household_name, u.name AS invited_by_name, i.expires_at
         FROM household_invites i JOIN households h ON h.id = i.household_id JOIN users u ON u.id = i.invited_by
        WHERE LOWER(i.email) = LOWER(?) AND i.${PENDING} ORDER BY i.id DESC`, [req.me.email]);
    if (!mem) return res.json({ household: null, my_invites: mine, max_members: hh.MAX_MEMBERS });
    const [members] = await db.query(
      `SELECT u.id AS user_id, u.name, u.email, m.role, m.joined_at
         FROM household_members m JOIN users u ON u.id = m.user_id
        WHERE m.household_id = ? ORDER BY m.joined_at, m.id`, [mem.household_id]);
    const [invites] = await db.query(
      `SELECT id, email, created_at, expires_at FROM household_invites WHERE household_id = ? AND ${PENDING} ORDER BY id DESC`, [mem.household_id]);
    res.json({
      household: { id: mem.household_id, name: mem.name, role: mem.role, members: members.map((m) => ({ ...m, is_me: m.user_id === req.me.id })), invites },
      my_invites: mine, max_members: hh.MAX_MEMBERS,
    });
  } catch (err) { fail(res, err, 'OVERVIEW'); }
});

router.post('/', async (req, res) => {
  const name = clean(req.body?.name);
  if (name.length < 2 || name.length > 60) return res.status(400).json({ message: 'Give the household a name of 2 to 60 characters.' });
  let conn;
  try {
    conn = await db.getConnection(); await conn.beginTransaction();
    if (await hh.membershipOf(req.me.id, conn)) { await conn.rollback(); return res.status(409).json({ message: 'You are already in a household. Leave it first.' }); }
    const [r] = await conn.query('INSERT INTO households (name, owner_id) VALUES (?, ?)', [name, req.me.id]);
    await conn.query("INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, 'owner')", [r.insertId, req.me.id]);
    await conn.commit();
    res.status(201).json({ id: r.insertId, message: 'Household created' });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch { /* ignore */ } }
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'You are already in a household. Leave it first.' });
    fail(res, err, 'CREATE');
  } finally { if (conn) conn.release(); }
});

router.patch('/', async (req, res) => {
  try {
    const mem = await needMember(req, res); if (!mem) return;
    if (mem.role !== 'owner') return res.status(403).json({ message: 'Only the owner can rename the household.' });
    const name = clean(req.body?.name);
    if (name.length < 2 || name.length > 60) return res.status(400).json({ message: 'Give the household a name of 2 to 60 characters.' });
    await db.query('UPDATE households SET name = ? WHERE id = ?', [name, mem.household_id]);
    res.json({ message: 'Renamed' });
  } catch (err) { fail(res, err, 'RENAME'); }
});

router.delete('/', async (req, res) => {
  try {
    const mem = await needMember(req, res); if (!mem) return;
    if (mem.role !== 'owner') return res.status(403).json({ message: 'Only the owner can close the household. You can leave it instead.' });
    await db.query('DELETE FROM households WHERE id = ?', [mem.household_id]);
    res.json({ message: 'Household closed' });
  } catch (err) { fail(res, err, 'CLOSE'); }
});

router.post('/leave', async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection(); await conn.beginTransaction();
    const r = await hh.removeUserFromHousehold(req.me.id, conn);
    if (!r.left) { await conn.rollback(); return res.status(404).json({ message: 'You are not in a household.' }); }
    await conn.commit();
    res.json({ message: r.closed ? 'You were the last person, so the household was closed.' : 'You left the household.' });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch { /* ignore */ } }
    fail(res, err, 'LEAVE');
  } finally { if (conn) conn.release(); }
});

router.delete('/members/:userId', async (req, res) => {
  try {
    const mem = await needMember(req, res); if (!mem) return;
    if (mem.role !== 'owner') return res.status(403).json({ message: 'Only the owner can remove people.' });
    const target = Number(req.params.userId);
    if (!Number.isInteger(target) || target <= 0) return res.status(404).json({ message: 'That person is not in your household.' });
    if (target === req.me.id) return res.status(400).json({ message: 'Use "Leave" to leave the household yourself.' });
    const [r] = await db.query('DELETE FROM household_members WHERE household_id = ? AND user_id = ?', [mem.household_id, target]);
    if (!r.affectedRows) return res.status(404).json({ message: 'That person is not in your household.' });
    res.json({ message: 'Removed' });
  } catch (err) { fail(res, err, 'REMOVE'); }
});

// ───────── invites ─────────
router.post('/invites', async (req, res) => {
  try {
    const mem = await needMember(req, res); if (!mem) return;
    const email = clean(req.body?.email).toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 100) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (email === String(req.me.email).toLowerCase()) return res.status(400).json({ message: 'That is your own email address.' });
    const [already] = await db.query(
      `SELECT 1 FROM household_members m JOIN users u ON u.id = m.user_id WHERE m.household_id = ? AND LOWER(u.email) = ?`, [mem.household_id, email]);
    if (already.length) return res.status(409).json({ message: 'That person is already in your household.' });
    const [[{ recent }]] = await db.query(
      'SELECT COUNT(*) AS recent FROM household_invites WHERE household_id = ? AND created_at > NOW() - INTERVAL 1 HOUR', [mem.household_id]);
    if (Number(recent) >= INVITES_PER_HOUR) return res.status(429).json({ message: 'Too many invites in the last hour. Try again later.' });

    // sending again to the same address replaces the older link
    await db.query(`UPDATE household_invites SET revoked_at = NOW() WHERE household_id = ? AND LOWER(email) = ? AND ${PENDING}`, [mem.household_id, email]);
    const [[{ members }]] = await db.query('SELECT COUNT(*) AS members FROM household_members WHERE household_id = ?', [mem.household_id]);
    const [[{ pending }]] = await db.query(`SELECT COUNT(*) AS pending FROM household_invites WHERE household_id = ? AND ${PENDING}`, [mem.household_id]);
    if (Number(members) + Number(pending) >= hh.MAX_MEMBERS) return res.status(400).json({ message: `A household can have up to ${hh.MAX_MEMBERS} people, counting pending invites.` });

    const token = crypto.randomBytes(32).toString('hex');
    const [r] = await db.query(
      `INSERT INTO household_invites (household_id, email, token_hash, invited_by, expires_at) VALUES (?, ?, ?, ?, NOW() + INTERVAL ${INVITE_DAYS} DAY)`,
      [mem.household_id, email, sha256(token), req.me.id]);
    const link = `${hh.frontendUrl()}/join?token=${token}`;

    let emailed = false;
    try {
      const sent = await mailer.sendMail({
        to: email,
        subject: `${req.me.name} invited you to share budgets on Finance AI`,
        text: `Hi,\n\n${req.me.name} invited you to join "${mem.name}" on Finance AI, to track budgets together. You will only see each other's totals per category, never single transactions.\n\nOpen this link (it works for ${INVITE_DAYS} days). You need an account with this email address (${email}); you can create one on the same page:\n\n${link}\n\nIf you do not know ${req.me.name}, ignore this email.\n`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#1e293b">
          <h2 style="margin:0 0 12px">You're invited</h2>
          <p><b>${esc(req.me.name)}</b> invited you to join <b>${esc(mem.name)}</b> on Finance AI, to track budgets together.</p>
          <p style="font-size:13px;color:#64748b">You will only see each other's totals per category, never single transactions.</p>
          <p style="margin:24px 0"><a href="${link}" style="background:#6d5dfc;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Join the household</a></p>
          <p style="font-size:13px;color:#64748b">The link works for ${INVITE_DAYS} days and needs an account with <b>${esc(email)}</b>. Or copy it into your browser:<br>${link}</p>
          <p style="font-size:13px;color:#64748b">If you do not know ${esc(req.me.name)}, ignore this email.</p></div>`,
      });
      emailed = !!sent.sent;
    } catch (e) { console.error('HOUSEHOLD INVITE MAIL ERROR:', e.message); }

    res.status(201).json({ invite: { id: r.insertId, email }, link, emailed, message: emailed ? 'Invite sent' : 'Invite created. The email could not be sent, so share the link yourself.' });
  } catch (err) { fail(res, err, 'INVITE'); }
});

router.delete('/invites/:id', async (req, res) => {
  try {
    const mem = await needMember(req, res); if (!mem) return;
    const [r] = await db.query(`UPDATE household_invites SET revoked_at = NOW() WHERE id = ? AND household_id = ? AND ${PENDING}`, [Number(req.params.id) || 0, mem.household_id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Invite not found.' });
    res.json({ message: 'Invite cancelled' });
  } catch (err) { fail(res, err, 'CANCEL'); }
});

// Accepts one invite for the signed-in user. Everything is checked inside one transaction.
async function acceptInvite(req, res, inviteWhere, params) {
  let conn;
  try {
    conn = await db.getConnection(); await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT i.id, i.household_id, i.email, i.accepted_at, i.revoked_at, i.expires_at < NOW() AS expired
         FROM household_invites i WHERE ${inviteWhere} FOR UPDATE`, params);
    const inv = rows[0];
    const stop = async (code, message) => { await conn.rollback(); return res.status(code).json({ message }); };
    if (!inv) return await stop(404, 'This invite was not found.');
    if (inv.accepted_at) return await stop(410, 'This invite was already used.');
    if (inv.revoked_at) return await stop(410, 'This invite was cancelled.');
    if (inv.expired) return await stop(410, 'This invite has expired. Ask for a new one.');
    if (String(inv.email).toLowerCase() !== String(req.me.email).toLowerCase()) return await stop(403, `This invite was sent to ${inv.email}. You are signed in as ${req.me.email}.`);
    if (await hh.membershipOf(req.me.id, conn)) return await stop(409, 'You are already in a household. Leave it first.');
    await conn.query('SELECT id FROM households WHERE id = ? FOR UPDATE', [inv.household_id]);
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM household_members WHERE household_id = ?', [inv.household_id]);
    if (Number(n) >= hh.MAX_MEMBERS) return await stop(400, 'This household is full.');
    await conn.query("INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, 'member')", [inv.household_id, req.me.id]);
    await conn.query('UPDATE household_invites SET accepted_at = NOW() WHERE id = ?', [inv.id]);
    await conn.commit();
    res.json({ message: 'You joined the household.' });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch { /* ignore */ } }
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'You are already in a household. Leave it first.' });
    fail(res, err, 'ACCEPT');
  } finally { if (conn) conn.release(); }
}

router.post('/invites/:id/accept', (req, res) => acceptInvite(req, res, 'i.id = ?', [Number(req.params.id) || 0]));

router.post('/invites/:id/decline', async (req, res) => {
  try {
    const [r] = await db.query(`UPDATE household_invites SET revoked_at = NOW() WHERE id = ? AND LOWER(email) = LOWER(?) AND ${PENDING}`, [Number(req.params.id) || 0, req.me.email]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Invite not found.' });
    res.json({ message: 'Invite declined' });
  } catch (err) { fail(res, err, 'DECLINE'); }
});

const validToken = (t) => typeof t === 'string' && /^[a-f0-9]{64}$/.test(t);

router.get('/invite-info', async (req, res) => {
  try {
    const token = req.query.token;
    if (!validToken(token)) return res.json({ state: 'not_found' });
    const [rows] = await db.query(
      `SELECT i.email, h.name AS household_name, u.name AS invited_by_name, i.accepted_at, i.revoked_at, i.expires_at < NOW() AS expired
         FROM household_invites i JOIN households h ON h.id = i.household_id JOIN users u ON u.id = i.invited_by WHERE i.token_hash = ?`, [sha256(token)]);
    const i = rows[0];
    if (!i) return res.json({ state: 'not_found' });
    const state = i.accepted_at ? 'used' : i.revoked_at ? 'cancelled' : i.expired ? 'expired' : 'valid';
    const mem = await hh.membershipOf(req.me.id);
    res.json({
      state, household_name: i.household_name, invited_by_name: i.invited_by_name, invite_email: i.email,
      email_matches: String(i.email).toLowerCase() === String(req.me.email).toLowerCase(), already_in_household: !!mem, my_email: req.me.email,
    });
  } catch (err) { fail(res, err, 'INFO'); }
});

router.post('/join', (req, res) => {
  const token = req.body?.token;
  if (!validToken(token)) return res.status(404).json({ message: 'This invite was not found.' });
  return acceptInvite(req, res, 'i.token_hash = ?', [sha256(token)]);
});

// ───────── shared budgets ─────────
router.get('/budgets', async (req, res) => {
  try {
    const mem = await needMember(req, res); if (!mem) return;
    const month = monthStart(req.query.month);
    if (!month) return res.status(400).json({ message: 'Invalid month. Use YYYY-MM.' });
    const [budgets] = await db.query(
      `SELECT hb.id, hb.category_id, hb.monthly_limit, c.name AS category_name, c.icon, c.color AS category_color
         FROM household_budgets hb JOIN categories c ON c.id = hb.category_id WHERE hb.household_id = ? AND hb.month = ?`, [mem.household_id, month]);
    const [members] = await db.query('SELECT u.id AS user_id, u.name FROM household_members m JOIN users u ON u.id = m.user_id WHERE m.household_id = ?', [mem.household_id]);
    let spendRows = [];
    if (budgets.length) {
      [spendRows] = await db.query(
        `SELECT t.category_id, t.user_id, SUM(t.amount) AS spent FROM transactions t
          WHERE t.type = 'expense' AND DATE_FORMAT(t.date, '%Y-%m-01') = ?
            AND t.user_id IN (SELECT user_id FROM household_members WHERE household_id = ?)
            AND t.category_id IN (${budgets.map(() => '?').join(',')})
          GROUP BY t.category_id, t.user_id`, [month, mem.household_id, ...budgets.map((b) => b.category_id)]);
    }
    const nameOf = new Map(members.map((m) => [m.user_id, m.name]));
    const out = budgets.map((b) => {
      const mine = spendRows.filter((r) => r.category_id === b.category_id);
      const spent = mine.reduce((s, r) => s + Number(r.spent), 0);
      const limit = Number(b.monthly_limit);
      return {
        id: b.id, category_id: b.category_id, category_name: b.category_name, icon: b.icon, category_color: b.category_color,
        monthly_limit: limit, spent, percent: limit > 0 ? Math.round((spent / limit) * 100) : 0,
        by_member: mine.map((r) => ({ user_id: r.user_id, name: nameOf.get(r.user_id) || 'Member', spent: Number(r.spent), is_me: r.user_id === req.me.id })).sort((a, z) => z.spent - a.spent),
      };
    }).sort((a, z) => z.percent - a.percent);
    res.json({ month: month.slice(0, 7), budgets: out, total_limit: out.reduce((s, b) => s + b.monthly_limit, 0), total_spent: out.reduce((s, b) => s + b.spent, 0) });
  } catch (err) { fail(res, err, 'BUDGETS'); }
});

router.post('/budgets', async (req, res) => {
  try {
    const mem = await needMember(req, res); if (!mem) return;
    const month = monthStart(req.body?.month);
    const limit = Number(req.body?.monthly_limit);
    if (!month) return res.status(400).json({ message: 'Invalid month. Use YYYY-MM.' });
    const categoryId = Number(req.body?.category_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) return res.status(400).json({ message: 'Choose a category.' });
    if (!(limit > 0) || limit > 99999999) return res.status(400).json({ message: 'Budget limit must be greater than 0.' });
    const [cat] = await db.query('SELECT id FROM categories WHERE id = ? AND user_id IS NULL', [categoryId]);
    if (!cat.length) return res.status(400).json({ message: 'Shared budgets can only use the standard categories, because custom categories are private.' });
    await db.query(
      `INSERT INTO household_budgets (household_id, category_id, monthly_limit, month, created_by) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)`, [mem.household_id, cat[0].id, limit, month, req.me.id]);
    try { await hh.checkHouseholdBudgets(req.me.id); } catch (e) { console.error('Shared alert check failed:', e.message); }
    res.json({ message: 'Shared budget saved' });
  } catch (err) { fail(res, err, 'SAVE BUDGET'); }
});

router.post('/budgets/copy', async (req, res) => {
  try {
    const mem = await needMember(req, res); if (!mem) return;
    const from = req.body?.from && monthStart(req.body.from), to = req.body?.to && monthStart(req.body.to);
    if (!from || !to) return res.status(400).json({ message: 'Invalid month. Use YYYY-MM.' });
    if (from === to) return res.status(400).json({ message: 'Choose two different months.' });
    const [r] = await db.query(
      `INSERT IGNORE INTO household_budgets (household_id, category_id, monthly_limit, month, created_by)
       SELECT household_id, category_id, monthly_limit, ?, ? FROM household_budgets WHERE household_id = ? AND month = ?`, [to, req.me.id, mem.household_id, from]);
    res.json({ copied: r.affectedRows, message: r.affectedRows ? `Copied ${r.affectedRows} shared budget${r.affectedRows === 1 ? '' : 's'}` : 'Nothing new to copy' });
  } catch (err) { fail(res, err, 'COPY'); }
});

router.delete('/budgets/:id', async (req, res) => {
  try {
    const mem = await needMember(req, res); if (!mem) return;
    const [r] = await db.query('DELETE FROM household_budgets WHERE id = ? AND household_id = ?', [Number(req.params.id) || 0, mem.household_id]);
    if (!r.affectedRows) return res.status(404).json({ message: 'Shared budget not found.' });
    res.json({ message: 'Shared budget removed' });
  } catch (err) { fail(res, err, 'DELETE BUDGET'); }
});

module.exports = router;