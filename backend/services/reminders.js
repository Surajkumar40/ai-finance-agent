// Email reminders for upcoming bills (recurring expenses).
//  - opt-in: nobody gets mail unless they switched it on in Profile (users.email_reminders)
//  - one email per person per run, listing every bill due within their chosen number of days
//  - each bill is mailed once per due date (reminder_log), however often the job runs
//  - demo accounts never get mail
// The job is started by the hourly timer (daytime only) and by POST /api/cron/reminders, which a free
// outside timer can call every day, because a sleeping Render server cannot run its own timer.
const crypto = require('crypto');
const db = require('../config/db');
const mailer = require('./mailer');

const TZ = process.env.REMINDER_TZ || 'Asia/Kolkata';
const MAX_ITEMS = 15;
const DAYTIME = [7, 21]; // the hourly timer only sends between 7:00 and 21:00 in TZ

let ready;
function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const [cols] = await db.query(
        `SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('email_reminders','reminder_days')`);
      const have = new Set(cols.map((r) => r.c));
      if (!have.has('email_reminders')) await db.query('ALTER TABLE users ADD COLUMN email_reminders TINYINT(1) NOT NULL DEFAULT 0');
      if (!have.has('reminder_days')) await db.query('ALTER TABLE users ADD COLUMN reminder_days TINYINT NOT NULL DEFAULT 2');
      await db.query(`
        CREATE TABLE IF NOT EXISTS reminder_log (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          item_key VARCHAR(80) NOT NULL,
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY one_mail_per_item (user_id, item_key),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

// date and hour "now" in the reminder time zone
function nowIn(tz = TZ, at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(at).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}
const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
const ymdOf = (v) => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : String(v).slice(0, 10));
const currency = require('./currency');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const whenText = (n, due) => {
  const label = new Date(due + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return n <= 0 ? `today (${label})` : n === 1 ? `tomorrow (${label})` : `in ${n} days (${label})`;
};

// ───────── unsubscribe links (signed, so they cannot be guessed) ─────────
const sign = (userId) => crypto.createHmac('sha256', process.env.JWT_SECRET).update('unsubscribe:' + userId).digest('hex').slice(0, 32);
const unsubToken = (userId) => `${userId}.${sign(userId)}`;
function readUnsubToken(token) {
  const m = /^(\d{1,12})\.([a-f0-9]{32})$/.exec(String(token || ''));
  if (!m) return null;
  const a = Buffer.from(sign(m[1])), b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? Number(m[1]) : null;
}
const backendUrl = () => String(process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
const frontendUrl = () => String(process.env.FRONTEND_URL || '').trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');

// ───────── the email ─────────
function composeMail(user, items, today, { test = false } = {}) {
  const inr = currency.formatter(user.currency, 2); // user.currency is optional: missing means rupees
  const first = String(user.name || '').trim().split(/\s+/)[0] || 'there';
  const rows = items.map((b) => ({ ...b, n: daysBetween(today, b.due) }));
  const subject = (test ? 'Test: ' : '') + (rows.length === 1
    ? `${rows[0].title} (${inr(rows[0].amount)}) is due ${whenText(rows[0].n, rows[0].due).split(' (')[0]}`
    : `${rows.length} bills due in the next ${Math.max(...rows.map((r) => r.n), 1)} days`);
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const profile = frontendUrl() ? `${frontendUrl()}/profile` : null;
  const unsub = backendUrl() ? `${backendUrl()}/api/account/unsubscribe?token=${unsubToken(user.id)}` : null;

  const lines = rows.map((r) => `• ${r.title}: ${inr(r.amount)}, due ${whenText(r.n, r.due)}`);
  const text = `Hi ${first},\n\n${test ? 'This is a test of your bill reminders. ' : ''}${rows.length === 1 ? 'A bill is coming up:' : 'These bills are coming up:'}\n\n${lines.join('\n')}\n${rows.length > 1 ? `\nTotal: ${inr(total)}\n` : ''}\n` +
    `You get these because bill reminders are on in your Finance AI profile.${profile ? ` Change or turn them off: ${profile}` : ''}${unsub ? `\nUnsubscribe in one click: ${unsub}` : ''}\n`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#1e293b">
    <h2 style="margin:0 0 12px">${rows.length === 1 ? 'A bill is coming up' : 'Bills coming up'}</h2>
    <p>Hi ${esc(first)},</p>${test ? '<p><b>This is a test of your bill reminders.</b></p>' : ''}
    <table style="width:100%;border-collapse:collapse">${rows.map((r) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0"><b>${esc(r.title)}</b><br><span style="color:#64748b;font-size:13px">Due ${esc(whenText(r.n, r.due))}</span></td><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap"><b>${esc(inr(r.amount))}</b></td></tr>`).join('')}</table>
    ${rows.length > 1 ? `<p style="text-align:right;margin:8px 0 0"><b>Total ${esc(inr(total))}</b></p>` : ''}
    <p style="font-size:12px;color:#64748b;margin-top:24px">You get these because bill reminders are on in your Finance AI profile.${profile ? ` <a href="${esc(profile)}" style="color:#6d5dfc">Change or turn them off</a>.` : ''}${unsub ? ` <a href="${esc(unsub)}" style="color:#6d5dfc">Unsubscribe in one click</a>.` : ''}</p></div>`;
  return { subject, text, html };
}

async function upcoming(userId, today, days) {
  const [rows] = await db.query(
    `SELECT id, title, amount, next_due FROM recurring_transactions
      WHERE user_id = ? AND is_active = 1 AND type = 'expense' AND next_due >= ? AND next_due <= ?
      ORDER BY next_due, id`, [userId, today, addDays(today, days)]);
  return rows.map((r) => ({ id: r.id, title: r.title, amount: Number(r.amount), due: ymdOf(r.next_due), key: `bill:${r.id}:${ymdOf(r.next_due)}` }));
}

// Sends the reminders that are due. Safe to call as often as you like.
// opts.today overrides "today" (tests); opts.userId limits the run to one person.
async function runReminders({ today, userId } = {}) {
  await ensureSchema();
  await currency.ensureColumn();
  const day = today || nowIn().date;
  const [users] = await db.query(
    `SELECT id, name, email, reminder_days, currency FROM users WHERE email_reminders = 1 AND email NOT LIKE '%@demo.local'${userId ? ' AND id = ?' : ''}`, userId ? [userId] : []);
  const out = { users: users.length, emails: 0, bills: 0, failed: 0 };
  for (const u of users) {
    try {
      const all = await upcoming(u.id, day, Math.min(7, Math.max(1, Number(u.reminder_days) || 2)));
      if (!all.length) continue;
      const [done] = await db.query('SELECT item_key FROM reminder_log WHERE user_id = ? AND item_key IN (?)', [u.id, all.map((b) => b.key)]);
      const seen = new Set(done.map((d) => d.item_key));
      const fresh = all.filter((b) => !seen.has(b.key)).slice(0, MAX_ITEMS);
      if (!fresh.length) continue;
      // claim first, so two runs at the same moment cannot both send; undo the claim if the mail fails
      const claimed = [];
      for (const b of fresh) {
        const [r] = await db.query('INSERT IGNORE INTO reminder_log (user_id, item_key) VALUES (?, ?)', [u.id, b.key]);
        if (r.affectedRows) claimed.push(b);
      }
      if (!claimed.length) continue;
      const mail = composeMail(u, claimed, day);
      let sent;
      try { sent = await mailer.sendMail({ to: u.email, ...mail }); } catch (e) { console.error('REMINDER MAIL ERROR:', e.message); sent = { sent: false }; }
      if (sent && sent.sent) { out.emails++; out.bills += claimed.length; }
      else { out.failed++; await db.query('DELETE FROM reminder_log WHERE user_id = ? AND item_key IN (?)', [u.id, claimed.map((b) => b.key)]); }
    } catch (e) { out.failed++; console.error('REMINDER ERROR for user', u.id, e.message); }
  }
  return out;
}

// the hourly timer: only in the daytime, so nobody is mailed at 3 a.m.
async function runIfDaytime() {
  const { hour } = nowIn();
  if (hour < DAYTIME[0] || hour >= DAYTIME[1]) return null;
  return runReminders();
}

module.exports = { ensureSchema, runReminders, runIfDaytime, composeMail, upcoming, nowIn, addDays, unsubToken, readUnsubToken, esc };