// Maths for the what-if simulator. No React in here, so it can be tested on its own.
// Everything is an estimate built from the user's own recent history: monthly average income and spending by category.

const DAY = 86400000;
const MONTH_DAYS = 30.44;
const WINDOW_DAYS = 90;

const ymd = (v) => String(v || '').split('T')[0];
const toUTC = (s) => { const [y, m, d] = ymd(s).split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Average month, from the last 90 days (or from the first transaction if the history is shorter).
export function buildBaseline(transactions, today) {
  const list = (Array.isArray(transactions) ? transactions : []).filter((t) => t && /^\d{4}-\d{2}-\d{2}/.test(ymd(t.date)) && num(t.amount) > 0);
  const end = toUTC(today);
  const winStart = end - (WINDOW_DAYS - 1) * DAY;
  const inWin = list.filter((t) => { const d = toUTC(t.date); return d >= winStart && d <= end; });
  if (!inWin.length) return { months: 0, income: 0, expense: 0, categories: [], count: 0, enough: false, spanDays: 0 };

  const first = Math.min(...inWin.map((t) => toUTC(t.date)));
  const spanDays = Math.max(1, Math.round((end - first) / DAY) + 1);
  const months = Math.max(1, spanDays) / MONTH_DAYS;
  const scaleMonths = Math.max(months, 1); // never inflate a short history: less than one month counts as one month

  let income = 0, expense = 0; const cats = new Map();
  for (const t of inWin) {
    const a = num(t.amount);
    if (t.type === 'income') { income += a; continue; }
    expense += a;
    const key = t.category_id ? String(t.category_id) : 'none';
    const cur = cats.get(key) || { id: key, name: t.category_name || 'Uncategorised', total: 0 };
    cur.total += a; cats.set(key, cur);
  }
  const categories = [...cats.values()]
    .map((c) => ({ id: c.id, name: c.name, monthly: c.total / scaleMonths }))
    .sort((a, b) => b.monthly - a.monthly);
  const expenseM = expense / scaleMonths;
  categories.forEach((c) => { c.share = expenseM > 0 ? c.monthly / expenseM : 0; });
  return {
    months: scaleMonths, income: income / scaleMonths, expense: expenseM, categories,
    count: inWin.length, spanDays, enough: inWin.length >= 5 && spanDays >= 14,
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// cuts: { [categoryId]: percentChange }  (-100 = remove it, +20 = spend 20% more)
export function simulate(baseline, { cuts = {}, extraIncome = 0, horizon = 12 } = {}, goals = []) {
  const months = clamp(Math.round(num(horizon)) || 12, 1, 60);
  const extra = Math.max(0, num(extraIncome));

  let scenExpense = 0; const perCategory = [];
  for (const c of baseline.categories) {
    const pct = clamp(num(cuts[c.id]), -100, 100);
    const after = c.monthly * (1 + pct / 100);
    scenExpense += after;
    perCategory.push({ id: c.id, name: c.name, before: c.monthly, after, change: after - c.monthly, pct });
  }
  const baseSavings = baseline.income - baseline.expense;
  const scenIncome = baseline.income + extra;
  const scenSavings = scenIncome - scenExpense;
  const rate = (inc, sav) => (inc > 0 ? sav / inc : null);

  const series = [];
  for (let m = 0; m <= months; m++) series.push({ month: m, now: baseSavings * m, scenario: scenSavings * m });

  const goalImpact = (Array.isArray(goals) ? goals : [])
    .filter((g) => g && !g.completed && num(g.remaining) > 0)
    .map((g) => {
      const remaining = num(g.remaining);
      const mNow = baseSavings > 0 ? remaining / baseSavings : null;
      const mScen = scenSavings > 0 ? remaining / scenSavings : null;
      const needed = g.monthly_needed == null ? null : num(g.monthly_needed);
      return {
        id: g.id, name: g.name, icon: g.icon, remaining, monthsNow: mNow, monthsScenario: mScen,
        monthsSooner: mNow != null && mScen != null ? mNow - mScen : null,
        newlyReachable: mNow == null && mScen != null,
        needed, onTrackNow: needed == null ? null : baseSavings >= needed, onTrackScenario: needed == null ? null : scenSavings >= needed,
      };
    });

  return {
    months, perCategory,
    expenseBefore: baseline.expense, expenseAfter: scenExpense,
    savingsBefore: baseSavings, savingsAfter: scenSavings, monthlyGain: scenSavings - baseSavings,
    rateBefore: rate(baseline.income, baseSavings), rateAfter: rate(scenIncome, scenSavings),
    totalGain: (scenSavings - baseSavings) * months,
    series, goalImpact,
  };
}

// Quick presets. Return a new cuts object.
export function presetTrimAll(baseline, pct) {
  const cuts = {};
  for (const c of baseline.categories) cuts[c.id] = -Math.abs(pct);
  return cuts;
}