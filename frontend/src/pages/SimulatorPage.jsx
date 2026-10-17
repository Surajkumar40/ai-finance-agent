import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Layout from "../components/Layout";
import api from "../api/axios";
import { buildBaseline, simulate, presetTrimAll } from "../utils/whatif";
import { localToday } from "../utils/voiceParse";
import { fmt as money, useCurrency, symbol, compact } from "../utils/currency";

const inr = (n) => money(Math.round(Number(n) || 0), 0);
const short = (n) => compact(n);
const pctText = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const monthsText = (m) => {
  if (m == null) return "never";
  if (m < 1) return "under a month";
  const r = Math.round(m);
  if (r < 24) return `${r} month${r === 1 ? "" : "s"}`;
  const y = (r / 12).toFixed(1).replace(/\.0$/, "");
  return `${y} years`;
};

// "within a month" / "in about 3 months" / "in about 1.5 years"
const etaText = (m) => (m < 1 ? "within a month" : `in about ${monthsText(m)}`);

const HORIZONS = [3, 6, 12, 24];
const card = "bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/5 rounded-2xl";
const chip = "px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all";

function Tile({ label, now, next, good }) {
  const changed = now !== next;
  return (
    <div className={`${card} p-4`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-xl font-bold mt-1 ${changed ? (good ? "text-emerald-500" : "text-rose-500") : "text-slate-900 dark:text-white"}`}>{next}</p>
      {changed && <p className="text-xs text-slate-400 mt-0.5">now {now}</p>}
    </div>
  );
}

export default function SimulatorPage() {
  useCurrency();
  const [data, setData] = useState({ status: "loading" });
  const [cuts, setCuts] = useState({});
  const [extra, setExtra] = useState("");
  const [horizon, setHorizon] = useState(12);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let off = false;
    Promise.all([api.get("/transactions"), api.get("/goals").catch(() => ({ data: [] }))])
      .then(([t, g]) => { if (!off) setData({ status: "ready", tx: t.data, goals: g.data }); })
      .catch((e) => { if (!off) setData({ status: "error", message: e.response?.data?.message || "Could not load your data. Please try again." }); });
    return () => { off = true; };
  }, []);

  const baseline = useMemo(() => buildBaseline(data.tx, localToday()), [data.tx]);
  const result = useMemo(
    () => simulate(baseline, { cuts, extraIncome: extra === "" ? 0 : Number(extra), horizon }, data.goals),
    [baseline, cuts, extra, horizon, data.goals]
  );

  const touched = Object.values(cuts).some((v) => v !== 0) || Number(extra) > 0;
  const reset = () => { setCuts({}); setExtra(""); };
  const setCut = (id, v) => setCuts((c) => ({ ...c, [id]: v }));
  const top = baseline.categories[0];
  const visible = showAll ? baseline.categories : baseline.categories.slice(0, 6);

  const headline = !touched
    ? "Move a slider to see what it would change."
    : result.monthlyGain > 0.5
      ? `You would keep ${inr(result.monthlyGain)} more every month, which is ${inr(result.totalGain)} more over ${result.months} months.`
      : result.monthlyGain < -0.5
        ? `This would cost you ${inr(-result.monthlyGain)} more every month, or ${inr(-result.totalGain)} over ${result.months} months.`
        : "These changes cancel each other out.";

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">What-if simulator</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Try a change on paper first. Nothing here is saved or changes your real data.</p>
        </div>

        {data.status === "loading" && <div className={`${card} p-6 text-sm text-slate-400`}>Loading your numbers…</div>}
        {data.status === "error" && <div role="alert" className="rounded-2xl px-4 py-3 text-sm bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30">{data.message}</div>}

        {data.status === "ready" && !baseline.categories.length && (
          <div className={`${card} p-6 text-center`}>
            <p className="font-semibold text-slate-800 dark:text-white">Nothing to simulate yet</p>
            <p className="text-sm text-slate-400 mt-1">Add some expenses from the last few weeks, then come back.</p>
            <Link to="/transactions" className="btn-primary inline-block mt-4">Go to transactions</Link>
          </div>
        )}

        {data.status === "ready" && baseline.categories.length > 0 && (
          <>
            {!baseline.enough && (
              <div className="rounded-2xl px-4 py-3 text-sm bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/30">
                You only have {baseline.count} transactions over {baseline.spanDays} days so far, so these numbers are rough. They get better with a few weeks of data.
              </div>
            )}

            <div className={`${card} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <h2 className="font-semibold text-slate-900 dark:text-white">What would you change?</h2>
                <div className="flex flex-wrap gap-2">
                  <button className={chip} onClick={() => setCuts(presetTrimAll(baseline, 10))}>Trim everything 10%</button>
                  {top && <button className={chip} onClick={() => setCuts({ [top.id]: -25 })}>Cut {top.name} 25%</button>}
                  <button className={chip} onClick={reset} disabled={!touched}>Reset</button>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4">Based on your average month over the last {Math.min(90, baseline.spanDays)} days. Drag left to spend less, right to spend more.</p>

              <div className="space-y-4">
                {visible.map((c) => {
                  const row = result.perCategory.find((p) => p.id === c.id);
                  const v = cuts[c.id] || 0;
                  const saves = -row.change;
                  return (
                    <div key={c.id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <label htmlFor={`cut-${c.id}`} className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {c.name} <span className="text-xs font-normal text-slate-400">{inr(c.monthly)}/mo</span>
                        </label>
                        <span className={`text-xs font-semibold whitespace-nowrap ${v < 0 ? "text-emerald-500" : v > 0 ? "text-rose-500" : "text-slate-400"}`}>
                          {v === 0 ? "No change" : `${v > 0 ? "+" : ""}${v}%`}
                          {v !== 0 && <span className="font-normal text-slate-400"> · {saves > 0 ? `saves ${inr(saves)}` : `costs ${inr(-saves)} more`}/mo</span>}
                        </span>
                      </div>
                      <input id={`cut-${c.id}`} type="range" min={-100} max={50} step={5} value={v} aria-label={`Change in ${c.name} spending`}
                        onChange={(e) => setCut(c.id, Number(e.target.value))} className="w-full accent-brand-500 mt-1" />
                    </div>
                  );
                })}
              </div>
              {baseline.categories.length > 6 && (
                <button onClick={() => setShowAll((s) => !s)} className="mt-3 text-xs font-semibold text-brand-500 hover:text-brand-600">
                  {showAll ? "Show fewer" : `Show all ${baseline.categories.length} categories`}
                </button>
              )}

              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/5 grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="extra" className="block text-sm font-medium text-slate-800 dark:text-slate-100">Extra income per month</label>
                  <p className="text-xs text-slate-400 mb-1.5">A raise, side income, rent from a room…</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{symbol()}</span>
                    <input id="extra" type="number" inputMode="numeric" min="0" max="10000000" value={extra} placeholder="0"
                      onChange={(e) => setExtra(e.target.value === "" ? "" : String(Math.min(10000000, Math.max(0, Math.floor(Number(e.target.value) || 0)))))}
                      className="w-full pl-7 pr-3 py-2.5 rounded-xl text-sm bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20" />
                  </div>
                </div>
                <div>
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">Look ahead</span>
                  <p className="text-xs text-slate-400 mb-1.5">How far to project</p>
                  <div className="flex gap-2" role="group" aria-label="Months to look ahead">
                    {HORIZONS.map((h) => (
                      <button key={h} onClick={() => setHorizon(h)} aria-pressed={horizon === h}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all
                          ${horizon === h ? "bg-brand-500 text-white border-brand-500" : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"}`}>
                        {h} mo
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div role="status" aria-live="polite"
              className={`px-4 py-3 rounded-2xl text-sm font-medium border ${touched && result.monthlyGain > 0.5
                ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/30"
                : touched && result.monthlyGain < -0.5
                  ? "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:border-rose-500/30"
                  : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-300 dark:border-white/10"}`}>
              {headline}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Tile label="Saved per month" now={inr(result.savingsBefore)} next={inr(result.savingsAfter)} good={result.savingsAfter >= result.savingsBefore} />
              <Tile label="Savings rate" now={pctText(result.rateBefore)} next={pctText(result.rateAfter)} good={(result.rateAfter ?? 0) >= (result.rateBefore ?? 0)} />
              <Tile label="Spending per month" now={inr(result.expenseBefore)} next={inr(result.expenseAfter)} good={result.expenseAfter <= result.expenseBefore} />
            </div>
            {baseline.income <= 0 && <p className="text-xs text-slate-400">No income was found in this period, so the savings rate can't be shown and "saved per month" will be negative.</p>}

            <div className={`${card} p-4`}>
              <h2 className="font-semibold text-slate-900 dark:text-white">Total saved over {result.months} months</h2>
              <p className="text-xs text-slate-400 mb-3">If every month looks like the average above.</p>
              <div className="h-64" aria-label="Chart of total savings, now versus with your changes">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(m) => `${m}m`} interval="preserveStartEnd" minTickGap={28} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={short} width={56} />
                    <Tooltip formatter={(v, n) => [inr(v), n]} labelFormatter={(m) => `After ${m} month${m === 1 ? "" : "s"}`}
                      contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Line type="monotone" dataKey="now" name="Now" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                    <Line type="monotone" dataKey="scenario" name="With your changes" stroke="#7c5cfc" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {result.goalImpact.length > 0 && (
              <div className={`${card} p-4`}>
                <h2 className="font-semibold text-slate-900 dark:text-white">Your goals</h2>
                <p className="text-xs text-slate-400 mb-3">Timing assumes all your monthly savings go to that one goal.</p>
                <ul className="space-y-3">
                  {result.goalImpact.map((g) => (
                    <li key={g.id} className="flex items-start gap-3">
                      <span className="text-xl" aria-hidden>{g.icon || "🎯"}</span>
                      <div className="flex-1 min-w-0 text-sm">
                        <p className="font-medium text-slate-800 dark:text-slate-100">{g.name} <span className="text-xs font-normal text-slate-400">{inr(g.remaining)} to go</span></p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {g.monthsScenario == null
                            ? "Not reachable while your savings are zero or negative."
                            : g.newlyReachable
                              ? `Becomes reachable ${etaText(g.monthsScenario)}.`
                              : <>Reached {etaText(g.monthsScenario)}
                                {g.monthsSooner != null && g.monthsSooner >= 0.5 && <span className="text-emerald-500 font-medium"> · {monthsText(g.monthsSooner)} sooner</span>}
                                {g.monthsSooner != null && g.monthsSooner <= -0.5 && <span className="text-rose-500 font-medium"> · {monthsText(-g.monthsSooner)} later</span>}
                                {g.monthsSooner != null && Math.abs(g.monthsSooner) >= 0.5 && <span className="text-xs text-slate-400"> (was {monthsText(g.monthsNow)})</span>}</>}
                        </p>
                        {g.needed != null && (
                          <p className="text-xs mt-0.5">
                            <span className="text-slate-400">Needs {inr(g.needed)}/month for its date: </span>
                            <span className={g.onTrackScenario ? "text-emerald-500 font-medium" : "text-rose-500 font-medium"}>{g.onTrackScenario ? "on track" : "behind"}</span>
                            {g.onTrackNow !== g.onTrackScenario && <span className="text-slate-400"> (was {g.onTrackNow ? "on track" : "behind"})</span>}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-slate-400 pb-4">This is a simple estimate from your own past spending, not financial advice. Real months vary.</p>
          </>
        )}
      </div>
    </Layout>
  );
}