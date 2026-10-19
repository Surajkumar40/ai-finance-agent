// Finds payments that already repeat in a person's history (rent, Netflix, a SIP, salary), so they can be
// turned into Recurring items with one tap.
//
// Pure functions only (no database), so they can be tested on their own. The route does the queries.
const { nextDate, ymd } = require('./recurring');

const DAY = 86400000;
const MAX_ROWS = 5000;
const MAX_SUGGESTIONS = 10;
const LOOKBACK_DAYS = 800; // a little over two years, enough to see a yearly bill twice
const AMOUNT_TOLERANCE = 0.1; // amounts must stay within 10% of the usual amount
const PER_MONTH = { weekly: 4.345, monthly: 1, yearly: 1 / 12 };

// What each frequency looks like in the data.
//   gap       days between two payments that still count as "on time"
//   min       payments needed before we call it a pattern
//   fresh     the last payment must be newer than this many days, otherwise it probably stopped
const RULES = {
  weekly: { gap: [6, 8], min: 4, fresh: 11 },
  monthly: { gap: [26, 35], min: 3, fresh: 46 },
  yearly: { gap: [355, 375], min: 2, fresh: 400 },
};

const round2 = (n) => Math.round(n * 100) / 100;
const dayNo = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

// "Netflix ", "NETFLIX" and "netflix." are the same payment.
function normTitle(t) {
  return String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const keyOf = (type, title) => `${type}|${normTitle(title)}`;

// Does one group of payments (oldest first, one per day) follow a frequency? Returns the frequency or null.
function frequencyOf(days) {
  for (const [name, rule] of Object.entries(RULES)) {
    if (days.length < rule.min) continue;
    const gaps = days.slice(1).map((d, i) => d - days[i]);
    const onTime = gaps.filter((g) => g >= rule.gap[0] && g <= rule.gap[1]).length;
    // yearly needs every gap to fit (there are only one or two); the others allow an odd gap now and then
    if (name === 'yearly' ? onTime === gaps.length : onTime / gaps.length >= 0.75) return name;
  }
  return null;
}

// Pure function.
//   transactions  [{ title, amount, type, category_id, category_name, date: 'YYYY-MM-DD' | Date, is_recurring }]
//   existing      [{ title, type }]   recurring items the person already has (active or paused)
//   dismissed     ['expense|netflix']  keys the person said "not this one" to
//   today         'YYYY-MM-DD'
function detect({ transactions, existing = [], dismissed = [], today }) {
  const skip = new Set([...dismissed, ...existing.map((e) => keyOf(e.type || 'expense', e.title))]);
  const todayNo = dayNo(today);
  const groups = new Map();

  for (const t of transactions.slice(0, MAX_ROWS)) {
    if (t.is_recurring) continue; // already made by a recurring item
    if (t.type !== 'expense' && t.type !== 'income') continue;
    const amount = Number(t.amount);
    const name = normTitle(t.title);
    if (!name || !(amount > 0)) continue;
    const date = ymd(t.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || todayNo - dayNo(date) > LOOKBACK_DAYS) continue;
    const key = keyOf(t.type, t.title);
    if (skip.has(key)) continue;
    if (!groups.has(key)) groups.set(key, { type: t.type, byDate: new Map() });
    groups.get(key).byDate.set(date, { amount, title: String(t.title).trim(), category_id: t.category_id || null, category_name: t.category_name || null });
  }

  const out = [];
  for (const [key, g] of groups) {
    const dates = [...g.byDate.keys()].sort();
    const rows = dates.map((d) => ({ date: d, ...g.byDate.get(d) }));
    // Try the whole history first, then only the most recent payments, so an old gap does not hide a current pattern.
    for (const n of [rows.length, 12, 6, 4]) {
      if (n > rows.length) continue;
      const part = rows.slice(-n);
      const freq = frequencyOf(part.map((r) => dayNo(r.date)));
      if (!freq) continue;
      const rule = RULES[freq];
      const last = part[part.length - 1];
      if (todayNo - dayNo(last.date) > rule.fresh) break;
      const usual = median(part.map((r) => r.amount));
      const close = part.filter((r) => Math.abs(r.amount - usual) <= usual * AMOUNT_TOLERANCE).length;
      if (close / part.length < 0.8) continue; // the amount changes too much to be a fixed bill (a shorter, recent run may still fit)
      // First date after today. Starting in the past would add the payments again.
      // The day of the month is the latest one seen, so a bill on the 31st that fell on the 30th in some months stays on the 31st.
      const anchor = Math.max(...part.map((r) => Number(r.date.slice(8, 10))));
      let next = nextDate(last.date, freq, anchor);
      for (let guard = 0; next <= today && guard < 400; guard++) next = nextDate(next, freq, anchor);
      const cats = new Map();
      for (const r of part) if (r.category_id) cats.set(r.category_id, [(cats.get(r.category_id)?.[0] || 0) + 1, r.category_name]);
      const [catId, catInfo] = [...cats.entries()].sort((a, b) => b[1][0] - a[1][0])[0] || [null, [0, null]];
      out.push({
        key, title: last.title, type: g.type, amount: round2(last.amount), frequency: freq, next_due: next,
        category_id: catId, category_name: catInfo[1], occurrences: part.length, last_date: last.date,
        monthly_cost: round2(last.amount * PER_MONTH[freq]),
      });
      break;
    }
  }
  // Biggest monthly impact first; expenses before income.
  out.sort((a, b) => (a.type === b.type ? 0 : a.type === 'expense' ? -1 : 1) || b.monthly_cost - a.monthly_cost || (a.key < b.key ? -1 : 1));
  return out.slice(0, MAX_SUGGESTIONS);
}

module.exports = { detect, normTitle, keyOf, frequencyOf, LOOKBACK_DAYS, MAX_SUGGESTIONS };