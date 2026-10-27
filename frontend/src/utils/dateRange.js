// Date ranges for filtering, kept as plain YYYY-MM-DD text.
// Never build a day with new Date("YYYY-MM-DD"): that is midnight UTC, which is the day before for anyone west of UTC.
// A range is { start, end } meaning start <= day < end.

export const ymdLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const dayOf = (v) => String(v).slice(0, 10);

const VALID = /^\d{4}-\d{2}-\d{2}$/;

// The day after a YYYY-MM-DD, worked out in UTC so the visitor's time zone cannot move it.
export function nextDay(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

// True for a real calendar day such as 2024-02-29, false for 2025-02-30 or text.
export function isRealDay(ymd) {
  if (!VALID.test(ymd || "")) return false;
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// Both ends are optional, so "from 1 Apr" with no end means "1 Apr onwards". Both ends are included.
// Returns null when nothing is picked, and { error } when the ends are the wrong way round.
export function customRange(from, to) {
  const a = isRealDay(from) ? from : "";
  const b = isRealDay(to) ? to : "";
  if (!a && !b) return null;
  if (a && b && a > b) return { error: "The start date is after the end date." };
  return { start: a || "0000-01-01", end: b ? nextDay(b) : "9999-12-31" };
}

// [start, end) for a named period, in the visitor's own calendar. `now` is a parameter so tests can fix the date.
export function rangeFor(id, now = new Date(), custom = {}) {
  const y = now.getFullYear(), m = now.getMonth(), n = now.getDate();
  if (id === "month") return { start: ymdLocal(new Date(y, m, 1)), end: ymdLocal(new Date(y, m + 1, 1)) };
  if (id === "last") return { start: ymdLocal(new Date(y, m - 1, 1)), end: ymdLocal(new Date(y, m, 1)) };
  if (id === "90") return { start: ymdLocal(new Date(y, m, n - 90)), end: ymdLocal(new Date(y, m, n + 1)) };
  if (id === "year") return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
  if (id === "custom") return customRange(custom.from, custom.to);
  return null;
}

export const inRange = (date, range) => !range || Boolean(range.error) || (dayOf(date) >= range.start && dayOf(date) < range.end);