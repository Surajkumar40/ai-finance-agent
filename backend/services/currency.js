// Display currency. Amounts are stored as plain numbers; this only decides the symbol and digit grouping.
// There is NO conversion: changing the currency relabels your numbers, it does not recalculate them.
const db = require('../config/db');

const CURRENCIES = {
  INR: { name: 'Indian rupee', locale: 'en-IN' },
  USD: { name: 'US dollar', locale: 'en-US' },
  EUR: { name: 'Euro', locale: 'en-IE' },
  GBP: { name: 'British pound', locale: 'en-GB' },
  AED: { name: 'UAE dirham', locale: 'en-AE' },
  SGD: { name: 'Singapore dollar', locale: 'en-SG' },
  AUD: { name: 'Australian dollar', locale: 'en-AU' },
  CAD: { name: 'Canadian dollar', locale: 'en-CA' },
  JPY: { name: 'Japanese yen', locale: 'en-US' },
};
const DEFAULT = 'INR';
const isValid = (c) => typeof c === 'string' && Object.prototype.hasOwnProperty.call(CURRENCIES, c);

const cache = new Map();
// formatter(code, decimals) -> (n) => "₹1,200"; decimals: max fraction digits (default 0; JPY is always 0)
function formatter(code, decimals = 0) {
  const c = isValid(code) ? code : DEFAULT;
  const d = c === 'JPY' ? 0 : decimals;
  const key = `${c}:${d}`;
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat(CURRENCIES[c].locale, { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: d }));
  const f = cache.get(key);
  return (n) => f.format(Number(n) || 0);
}

let ready;
function ensureColumn() {
  if (!ready) {
    ready = (async () => {
      const [c] = await db.query(
        `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'currency'`);
      if (!c.length) await db.query(`ALTER TABLE users ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT '${DEFAULT}'`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

async function codeOf(userId, conn = db) {
  try {
    await ensureColumn();
    const [rows] = await conn.query('SELECT currency FROM users WHERE id = ?', [userId]);
    return rows[0] && isValid(rows[0].currency) ? rows[0].currency : DEFAULT;
  } catch { return DEFAULT; } // never let a formatting detail break an email or an alert
}

// the formatter for one user
async function forUser(userId, decimals = 0, conn = db) { return formatter(await codeOf(userId, conn), decimals); }

const list = () => Object.entries(CURRENCIES).map(([code, v]) => ({ code, name: v.name, sample: formatter(code, 0)(1234) }));

module.exports = { CURRENCIES, DEFAULT, isValid, formatter, ensureColumn, codeOf, forUser, list };