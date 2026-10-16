const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('./config/env');
const sec = require('./middleware/security');

const app = express();

// Render (and most hosts) put a proxy in front of the app: trust it so req.ip is the visitor, not the proxy.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(sec.securityHeaders);
app.use(cors(sec.corsOptions()));
app.use(sec.hideServerErrors);

// Receipt photos arrive as base64, so that one route may be large. Everything else is small JSON.
app.use('/api/receipts', express.json({ limit: '10mb' }));
app.use(express.json({ limit: '1mb' }));

// ───────── rate limits ─────────
const MIN = 60 * 1000, HOUR = 60 * MIN;
const only = (method, limiter) => (req, res, next) => (req.method === method ? limiter(req, res, next) : next());
const emailOf = (req) => String(req.body?.email || '').trim().toLowerCase().slice(0, 100);

app.use('/api', sec.rateLimit({ name: 'all', windowMs: MIN, max: 300 }));

// wrong passwords: only failed attempts count
app.use('/api/auth/login', only('POST', sec.rateLimit({
  name: 'login-account', windowMs: 15 * MIN, max: 8, skipSuccess: true, key: (r) => `${r.ip}|${emailOf(r)}`,
  message: 'Too many sign-in attempts. Please wait 15 minutes, or use "Forgot password".',
})));
app.use('/api/auth/login', only('POST', sec.rateLimit({
  name: 'login-ip', windowMs: 15 * MIN, max: 40, skipSuccess: true, key: (r) => r.ip,
  message: 'Too many sign-in attempts from this network. Please wait 15 minutes.',
})));
app.use('/api/auth/register', only('POST', sec.rateLimit({
  name: 'register', windowMs: HOUR, max: 10, key: (r) => r.ip, message: 'Too many accounts created from this network. Please try again later.',
})));
app.use('/api/demo', only('POST', sec.rateLimit({
  name: 'demo', windowMs: HOUR, max: 12, key: (r) => r.ip, message: 'The demo was opened too many times from this network. Please try again later.',
})));
app.use('/api/account/forgot-password', only('POST', sec.rateLimit({
  name: 'forgot-ip', windowMs: HOUR, max: 20, key: (r) => r.ip, message: 'Too many reset requests from this network. Please try again later.',
})));
app.use('/api/account/reset-password', only('POST', sec.rateLimit({
  name: 'reset-ip', windowMs: HOUR, max: 20, key: (r) => r.ip, message: 'Too many attempts. Please try again later.',
})));
// changing the password or deleting the account asks for the current password: stop guessing
app.use('/api/account/password', only('PUT', sec.rateLimit({
  name: 'pw-change', windowMs: 15 * MIN, max: 8, skipSuccess: true, message: 'Too many wrong passwords. Please wait 15 minutes.',
})));
app.use('/api/account', (req, res, next) => (req.method === 'DELETE' && req.path === '/'
  ? sec.rateLimit({ name: 'acct-delete', windowMs: 15 * MIN, max: 8, skipSuccess: true, message: 'Too many wrong passwords. Please wait 15 minutes.' })(req, res, next)
  : next()));

// the daily job: a wrong key can only be tried a few times
app.use('/api/cron', sec.rateLimit({ name: 'cron-bad-key', windowMs: 15 * MIN, max: 10, skipSuccess: true, key: (r) => r.ip, message: 'Too many wrong keys. Please wait.' }));
app.use('/api/cron', sec.rateLimit({ name: 'cron-all', windowMs: HOUR, max: 60, key: (r) => r.ip }));
// a test reminder email goes to your own inbox: a few per hour is plenty
app.use('/api/account/reminders/test', only('POST', sec.rateLimit({ name: 'reminder-test', windowMs: HOUR, max: 5, message: 'You sent a few test emails already. Please try again in an hour.' })));

// AI calls cost money: limit them per person
const aiLimit = sec.rateLimit({ name: 'ai', windowMs: 10 * MIN, max: 40, message: 'You are asking the AI very quickly. Please wait a few minutes.' });
app.use('/api/ai', aiLimit);
app.use('/api/agent/chat', only('POST', aiLimit));
app.use('/api/import/categorise', only('POST', aiLimit));
app.use('/api/receipts', sec.rateLimit({ name: 'receipts', windowMs: 10 * MIN, max: 15, message: 'You are scanning receipts very quickly. Please wait a few minutes.' }));

// Auto-mount every file in /routes as /api/<filename>
// e.g. routes/auth.js -> /api/auth, routes/budgets.js -> /api/budgets
const routesDir = path.join(__dirname, 'routes');
fs.readdirSync(routesDir)
  .filter((f) => f.endsWith('.js'))
  .forEach((file) => {
    const name = file.replace('.js', '');
    try {
      app.use(`/api/${name}`, require(path.join(routesDir, file)));
      console.log(`✅ Loaded route /api/${name}`);
    } catch (err) {
      // One broken route will no longer stop the whole server
      console.error(`❌ Skipped route "${file}": ${err.message}`);
    }
  });

app.get('/', (req, res) => res.send('API running ✅'));

app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));
app.use(sec.errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  require('./services/recurring').startScheduler(); // adds due recurring transactions every hour
});