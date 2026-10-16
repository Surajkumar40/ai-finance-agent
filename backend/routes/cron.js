// POST or GET /api/cron/reminders  -> adds due recurring transactions, then sends bill reminder emails.
// Meant to be called once or twice a day by a free outside timer (for example cron-job.org), because a free
// Render server goes to sleep and cannot run its own timer. It also wakes the server up.
// Protected by CRON_KEY (set it on Render, 20 or more characters). Without it this endpoint stays off.
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { processDue } = require('../services/recurring');
const reminders = require('../services/reminders');

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

function keyFrom(req) {
  const h = req.headers['x-cron-key'];
  if (typeof h === 'string' && h) return h;
  const a = req.headers.authorization;
  if (typeof a === 'string' && /^Bearer\s+/i.test(a)) return a.replace(/^Bearer\s+/i, '');
  return typeof req.query.key === 'string' ? req.query.key : '';
}

router.all('/reminders', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ message: 'Use GET or POST' });
  const expected = process.env.CRON_KEY;
  if (!expected || expected.length < 20) return res.status(503).json({ message: 'The daily job is switched off. Set CRON_KEY (20+ characters) on the server to turn it on.' });
  if (!crypto.timingSafeEqual(digest(keyFrom(req)), digest(expected))) return res.status(401).json({ message: 'Wrong key.' });
  try {
    const recurring = await processDue();
    const mail = await reminders.runReminders();
    console.log(`⏰ Daily job: ${recurring.created} recurring transaction(s), ${mail.emails} reminder email(s) for ${mail.bills} bill(s)`);
    res.json({ ok: true, recurring_created: recurring.created, reminder_emails: mail.emails, bills_mentioned: mail.bills, failed: mail.failed });
  } catch (err) {
    console.error('DAILY JOB ERROR:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;