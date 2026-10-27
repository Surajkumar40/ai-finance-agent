// Spending by day of the week, for the "which days do I spend most" chart.
// The weekday of a YYYY-MM-DD is worked out in UTC so the visitor's time zone cannot shift it.

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// 0 = Monday ... 6 = Sunday
export function weekdayIndex(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

// days: [{ date, amount, future? }]. Days that have not happened yet are left out, otherwise they would pull averages down.
// Returns one row per weekday: total spent, how many such days there were, and the average per day.
export function weekdaySpend(days) {
  const rows = WEEKDAYS.map((label) => ({ label, total: 0, count: 0, avg: 0 }));
  for (const d of days || []) {
    if (d.future) continue;
    const r = rows[weekdayIndex(d.date)];
    r.count += 1;
    r.total += Number(d.amount) || 0;
  }
  for (const r of rows) {
    r.total = Math.round(r.total * 100) / 100;
    r.avg = r.count ? Math.round((r.total / r.count) * 100) / 100 : 0;
  }
  return rows;
}

// The weekday with the highest average, or null when nothing was spent.
export function busiestWeekday(rows) {
  let best = null;
  for (const r of rows) if (r.avg > 0 && (!best || r.avg > best.avg)) best = r;
  return best;
}