// Works out when a savings goal will be reached if the person keeps saving at the pace of the last 3 months.
// Pure function (no database), so it can be tested on its own. The route does the queries.
const DAY = 86400000;
const WINDOW_DAYS = 90; // the pace is the net saved over the last 90 days
const MIN_OBSERVED_DAYS = 14; // need at least 2 weeks of history before guessing
const MIN_CONTRIBUTIONS = 2;
const MAX_DAYS_AHEAD = 3650; // beyond 10 years we say "a long way off", not a date

const round2 = (n) => Math.round(n * 100) / 100;
const dayNo = (s) => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
const ymdOf = (n) => new Date(n * DAY).toISOString().slice(0, 10);

//   contributions  [{ amount (positive = added, negative = withdrawn), on: 'YYYY-MM-DD' }]  for this goal
//   firstOn        'YYYY-MM-DD' date of the very first contribution ever (may be older than the window)
//   remaining      how much is still missing (> 0)
//   today          'YYYY-MM-DD'
//   targetDate     'YYYY-MM-DD' | null
// Returns null when there is not enough history, otherwise
//   { per_month, status: 'stalled' | 'on_track' | 'behind' | 'no_deadline' | 'far_off', finish_date, days_late }
function projectGoal({ contributions, firstOn, remaining, today, targetDate = null }) {
  if (!(remaining > 0) || !firstOn) return null;
  const t = dayNo(today);
  const inWindow = contributions.filter((c) => { const d = dayNo(c.on); return d > t - WINDOW_DAYS && d <= t; });
  const observed = Math.min(WINDOW_DAYS, t - dayNo(firstOn) + 1);
  if (inWindow.length < MIN_CONTRIBUTIONS || observed < MIN_OBSERVED_DAYS) return null;
  const net = inWindow.reduce((s, c) => s + Number(c.amount), 0);
  if (!(net > 0)) return { per_month: 0, status: 'stalled', finish_date: null, days_late: null };
  const perDay = net / observed;
  const perMonth = round2(perDay * 30.44);
  const daysNeeded = Math.ceil(remaining / perDay);
  if (daysNeeded > MAX_DAYS_AHEAD) return { per_month: perMonth, status: 'far_off', finish_date: null, days_late: null };
  const finish = ymdOf(t + daysNeeded);
  if (!targetDate) return { per_month: perMonth, status: 'no_deadline', finish_date: finish, days_late: null };
  const late = dayNo(finish) - dayNo(targetDate);
  return { per_month: perMonth, status: late <= 0 ? 'on_track' : 'behind', finish_date: finish, days_late: late > 0 ? late : null };
}

module.exports = { projectGoal, WINDOW_DAYS, MIN_OBSERVED_DAYS };