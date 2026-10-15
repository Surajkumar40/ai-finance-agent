// Security helpers with no extra packages: rate limiting, security headers, CORS allow-list,
// and a shield that stops database error text from reaching the browser.
const jwt = require('jsonwebtoken');

// ───────── rate limiting (in memory: fine for a single server, resets when it restarts) ─────────
const buckets = new Map();
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
}, 60 * 1000);
sweep.unref();

const OFF = process.env.NODE_ENV === 'test'; // the automated tests turn limits off except where they test them

// who is asking: the logged-in user when there is a valid token, otherwise the network address
function whoIs(req) {
  const h = req.headers.authorization;
  const t = h && h.split(' ')[1];
  if (t) {
    try { const d = jwt.verify(t, process.env.JWT_SECRET, { algorithms: ['HS256'] }); return 'u' + (d.userId ?? d.id); } catch { /* fall through */ }
  }
  return 'ip' + req.ip;
}

// rateLimit({ name, windowMs, max, key?, skipSuccess?, message? })
// skipSuccess: only failed requests (status 400 and up) count, e.g. wrong passwords.
function rateLimit({ name, windowMs, max, key, skipSuccess = false, message, force = false }) {
  return (req, res, next) => {
    if (OFF && !force) return next();
    const id = `${name}:${key ? key(req) : whoIs(req)}`;
    const now = Date.now();
    let b = buckets.get(id);
    if (!b || b.reset <= now) { b = { count: 0, reset: now + windowMs }; buckets.set(id, b); }
    if (b.count >= max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((b.reset - now) / 1000))));
      return res.status(429).json({ message: message || 'Too many requests. Please wait a little and try again.' });
    }
    if (skipSuccess) {
      res.on('finish', () => { if (res.statusCode < 400) b.count = Math.max(0, b.count - 1); });
    }
    b.count += 1;
    next();
  };
}

// ───────── security headers ─────────
// The API only returns JSON, so the policy can be very strict.
function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'cross-origin', // the app on another domain must be able to read answers
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Cache-Control': 'no-store', // private money data must not sit in shared caches
  });
  res.removeHeader('X-Powered-By');
  next();
}

// ───────── CORS allow-list ─────────
// Allowed: FRONTEND_URL, anything in CORS_ORIGINS (comma separated), and localhost while developing.
// If neither is set the server stays open (and says so in the log) so a missing setting cannot break the app.
const clean = (u) => String(u || '').trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
function corsOptions() {
  const extra = String(process.env.CORS_ORIGINS || '').split(',').map(clean).filter(Boolean);
  const front = clean(process.env.FRONTEND_URL);
  const list = [...extra, ...(front ? [front] : [])];
  if (extra.includes('*') || !list.length) {
    console.warn('⚠️  CORS is open to every website. Set FRONTEND_URL on the server to your app address to restrict it.');
    return { origin: true };
  }
  const dev = process.env.NODE_ENV === 'production' ? [] : [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
  console.log('🔒 CORS allows:', list.join(', '));
  return {
    origin(origin, cb) {
      if (!origin) return cb(null, true); // not a browser (health checks, curl)
      if (list.includes(clean(origin)) || dev.some((r) => r.test(origin))) return cb(null, true);
      cb(null, false); // answered without CORS headers: the browser blocks it
    },
    maxAge: 600,
  };
}

// ───────── never show internals ─────────
// Many routes answer 500 with the raw error text (which can contain table and column names).
// Whatever they send, a 500 now reaches the browser as a plain message; the real error stays in the log.
function hideServerErrors(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 500 && body && typeof body === 'object') {
      const real = body.message || body.error;
      if (real) console.error(`500 on ${req.method} ${req.originalUrl.split('?')[0]}:`, String(real).slice(0, 300));
      const safe = { message: 'Server error' };
      if ('error' in body) safe.error = 'Server error'; // some routes use "error" instead of "message"
      return json(safe);
    }
    return json(body);
  };
  next();
}

// last stop for anything thrown and not caught, and for bad JSON bodies
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) return res.status(400).json({ message: 'The request body is not valid JSON.' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ message: 'That is too large to send.' });
  console.error(`UNHANDLED on ${req.method} ${req.originalUrl.split('?')[0]}:`, err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err);
  if (res.headersSent) return undefined;
  return res.status(500).json({ message: 'Server error' });
}

module.exports = { rateLimit, securityHeaders, corsOptions, hideServerErrors, errorHandler };