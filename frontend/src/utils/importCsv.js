// Helpers for importing a bank / card statement CSV. Pure functions, no React.

export const MAX_ROWS = 2000;

// ───────────────────────── CSV text -> rows of cells ─────────────────────────
function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 15);
  let best = ",", bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = lines.map(l => {
      let n = 0, inQ = false;
      for (const ch of l) { if (ch === '"') inQ = !inQ; else if (ch === d && !inQ) n++; }
      return n;
    });
    const nonZero = counts.filter(c => c > 0);
    if (!nonZero.length) continue;
    // prefer the delimiter that appears on most lines, then the one that appears most
    const score = nonZero.length * 1000 + Math.max(...nonZero);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

export function parseCSV(input) {
  const text = String(input).replace(/^\uFEFF/, "");
  const delim = detectDelimiter(text);
  const rows = [];
  let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows
    .map(r => r.map(c => c.trim()))
    .filter(r => r.some(c => c !== ""));
}

// ───────────────────────── Column detection ─────────────────────────
const H = {
  date: /^(txn\.?\s*|transaction\s*|value\s*|posting\s*|posted\s*|booking\s*)?date$|^date\b|\bdate$/i,
  desc: /descri|narrat|particular|detail|remark|payee|merchant|memo|title|reference|transaction\s*(remarks|details)/i,
  amount: /^(txn\.?\s*)?(amount|amt)\b|^amount|transaction\s*amount/i,
  debit: /debit|withdraw|paid\s*out|money\s*out|\bdr\b/i,
  credit: /credit|deposit|paid\s*in|money\s*in|\bcr\b/i,
  type: /^(txn\.?\s*)?type$|dr\s*\/\s*cr|cr\s*\/\s*dr|credit\/debit|debit\/credit/i,
  category: /^category$/i,
  balance: /balance/i,
};

// Bank files often start with a few lines of account info. Find the real header row.
export function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    const cells = rows[i];
    if (cells.filter(c => c).length < 3) continue;
    const hasDate = cells.some(c => H.date.test(c));
    const hasOther = cells.some(c => H.desc.test(c) || H.amount.test(c) || H.debit.test(c) || H.credit.test(c));
    if (hasDate && hasOther) return i;
  }
  return 0;
}

export function guessMapping(headers) {
  const m = { date: -1, desc: -1, amount: -1, debit: -1, credit: -1, type: -1, category: -1 };
  const used = new Set();
  const pick = (key, test, allowBalance = false) => {
    const i = headers.findIndex((h, idx) => !used.has(idx) && test.test(h) && (allowBalance || !H.balance.test(h)));
    if (i >= 0) { m[key] = i; used.add(i); }
  };
  pick("date", H.date);
  pick("type", H.type);
  pick("category", H.category);
  pick("debit", H.debit);
  pick("credit", H.credit);
  if (m.debit < 0 || m.credit < 0) {
    // only use a single amount column if there is no debit/credit pair
    pick("amount", H.amount);
    if (m.amount >= 0) { m.debit = -1; m.credit = -1; }
  }
  pick("desc", H.desc);
  return m;
}

// ───────────────────────── Value parsing ─────────────────────────
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, "0");

function validYMD(y, m, d) {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
const fullYear = y => (y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y);

// Returns "YYYY-MM-DD" or null. dayFirst decides 03/04/2026 (3 April vs March 4).
export function parseDate(raw, dayFirst = true) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?(\.\d+)?Z?$/i, "");
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return validYMD(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    const a = +m[1], b = +m[2], y = fullYear(+m[3]);
    if (a > 12) return validYMD(y, b, a);        // clearly day first
    if (b > 12) return validYMD(y, a, b);        // clearly month first
    return dayFirst ? validYMD(y, b, a) : validYMD(y, a, b);
  }
  if ((m = s.match(/^(\d{1,2})[\s\-/.]([A-Za-z]{3,9})[a-z]*[\s\-/.,]*(\d{2,4})$/))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return mo ? validYMD(fullYear(+m[3]), mo, +m[1]) : null;
  }
  if ((m = s.match(/^([A-Za-z]{3,9})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{2,4})$/))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return mo ? validYMD(fullYear(+m[3]), mo, +m[2]) : null;
  }
  return null;
}

// Returns a signed number or null. "(500)" and "-500" are negative, "500 Dr" negative, "500 Cr" positive.
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let sign = 1;
  if (/\bdr\b\.?$/i.test(s)) { sign = -1; s = s.replace(/\bdr\b\.?$/i, ""); }
  else if (/\bcr\b\.?$/i.test(s)) { s = s.replace(/\bcr\b\.?$/i, ""); }
  if (/^\(.*\)$/.test(s.trim())) { sign = -sign; s = s.trim().slice(1, -1); }
  s = s.replace(/(rs\.?|inr|usd|eur|gbp|[₹$€£])/gi, "").replace(/[\s,]/g, "");
  if (s.startsWith("-")) { sign = -sign; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) { sign = -sign; s = s.slice(0, -1); }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? sign * n : null;
}

const EXPENSE_WORDS = /\b(dr|debit|withdraw\w*|expense|out|purchase|sale|payment)\b/i;
const INCOME_WORDS = /\b(cr|credit|deposit\w*|income|in|refund|salary)\b/i;

export function normalizeTitle(s) {
  return String(s || "").toLowerCase().replace(/\d+/g, " ").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
}

// ───────────────────────── Rows -> transactions ─────────────────────────
// opts: { dayFirst: bool, positiveIsExpense: bool }
export function buildRows(dataRows, map, opts = {}) {
  const { dayFirst = true, positiveIsExpense = false } = opts;
  const get = (r, i) => (i >= 0 && i < r.length ? r[i] : "");
  const rows = [];
  const problems = [];

  dataRows.forEach((r, idx) => {
    const line = idx + 1;
    const date = parseDate(get(r, map.date), dayFirst);
    if (!date) { problems.push({ line, reason: "No valid date", cells: r }); return; }

    let amount = null, type = null;
    if (map.debit >= 0 || map.credit >= 0) {
      const d = parseAmount(get(r, map.debit));
      const c = parseAmount(get(r, map.credit));
      if (d && Math.abs(d) > 0) { amount = Math.abs(d); type = "expense"; }
      else if (c && Math.abs(c) > 0) { amount = Math.abs(c); type = "income"; }
    } else if (map.amount >= 0) {
      const a = parseAmount(get(r, map.amount));
      if (a !== null && a !== 0) {
        amount = Math.abs(a);
        const t = map.type >= 0 ? String(get(r, map.type)) : "";
        if (t && EXPENSE_WORDS.test(t) && !INCOME_WORDS.test(t)) type = "expense";
        else if (t && INCOME_WORDS.test(t) && !EXPENSE_WORDS.test(t)) type = "income";
        else if (positiveIsExpense) type = a > 0 ? "expense" : "income";
        else type = a < 0 ? "expense" : "income";
      }
    }
    if (!type || !(amount > 0)) { problems.push({ line, reason: "No amount", cells: r }); return; }

    let title = String(get(r, map.desc)).replace(/\s+/g, " ").trim();
    if (!title) title = type === "income" ? "Income" : "Expense";
    if (title.length > 150) title = title.slice(0, 150);

    rows.push({
      date,
      title,
      amount: Math.round(amount * 100) / 100,
      type,
      csv_category: map.category >= 0 ? String(get(r, map.category)).trim() : "",
      category_id: null,
    });
  });

  return { rows, problems };
}

// Fill category_id from (1) a category column in the file, (2) the user's own history of the same title
export function applyKnownCategories(rows, categories, transactions) {
  const byName = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));
  const counts = new Map(); // normalized title -> Map(category_id -> n)
  for (const t of transactions) {
    if (!t.category_id) continue;
    const key = normalizeTitle(t.title);
    if (!key) continue;
    if (!counts.has(key)) counts.set(key, new Map());
    const m = counts.get(key);
    m.set(t.category_id, (m.get(t.category_id) || 0) + 1);
  }
  const history = new Map();
  for (const [key, m] of counts) history.set(key, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);

  return rows.map(r => {
    let id = r.csv_category ? byName.get(r.csv_category.toLowerCase()) : undefined;
    if (!id) id = history.get(normalizeTitle(r.title));
    return { ...r, category_id: id || null };
  });
}