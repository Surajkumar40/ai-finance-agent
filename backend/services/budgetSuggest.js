// Suggests a monthly limit for categories that spend money but have no budget yet, from the last 3 months.
// Pure functions (no database), so they can be tested on their own. The route does the queries.
const WINDOW = 3; // months looked at before the chosen month
const MIN_MONTHS_WITH_SPENDING = 2; // a category must show up in at least 2 of them
const MAX_SUGGESTIONS = 20;

const pad = (n) => String(n).padStart(2, '0');
const shiftMonth = (ym, d) => { const [y, m] = ym.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + d, 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`; };
const round2 = (n) => Math.round(n * 100) / 100;

// Round UP to an easy number, so the limit is a bit above the average, not below it.
function niceCeil(n) {
  const step = n < 1000 ? 50 : n < 10000 ? 100 : n < 100000 ? 500 : 1000;
  return Math.ceil(n / step) * step;
}

// The months that count: the 3 before `month`, but not the ones before the person's first transaction
// (a new user with one month of history should be averaged over 1 month, not 3).
function windowMonths(month, firstMonth) {
  if (!firstMonth) return [];
  const out = [];
  for (let k = WINDOW; k >= 1; k--) { const m = shiftMonth(month, -k); if (m >= firstMonth) out.push(m); }
  return out;
}

//   month       'YYYY-MM' the budgets are for
//   firstMonth  'YYYY-MM' of the person's first transaction, or null
//   rows        [{ category_id, category_name, icon, category_color, ym: 'YYYY-MM', spent }]  expenses per category and month
//   budgeted    [category_id]  categories that already have a budget in `month`
function suggest({ month, firstMonth, rows, budgeted = [] }) {
  const months = windowMonths(month, firstMonth);
  if (!months.length) return { months: 0, suggestions: [] };
  const inWindow = new Set(months);
  const skip = new Set(budgeted.map(Number));
  const byCat = new Map();
  for (const r of rows) {
    const id = Number(r.category_id);
    const spent = Number(r.spent);
    if (!id || skip.has(id) || !inWindow.has(r.ym) || !(spent > 0)) continue;
    if (!byCat.has(id)) byCat.set(id, { info: r, perMonth: new Map() });
    const c = byCat.get(id);
    c.perMonth.set(r.ym, (c.perMonth.get(r.ym) || 0) + spent);
  }
  const out = [];
  for (const [id, c] of byCat) {
    if (c.perMonth.size < Math.min(MIN_MONTHS_WITH_SPENDING, months.length)) continue;
    const total = [...c.perMonth.values()].reduce((a, b) => a + b, 0);
    const average = total / months.length;
    if (average < 1) continue;
    out.push({
      category_id: id, category_name: c.info.category_name, icon: c.info.icon || null, category_color: c.info.category_color || null,
      average: round2(average), suggested: niceCeil(average), months_with_spending: c.perMonth.size,
    });
  }
  out.sort((a, b) => b.average - a.average || a.category_id - b.category_id);
  return { months: months.length, suggestions: out.slice(0, MAX_SUGGESTIONS) };
}

module.exports = { suggest, niceCeil, windowMonths, shiftMonth, WINDOW, MAX_SUGGESTIONS };