import { useEffect, useState } from "react";
import api from "../api/axios";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const fmt = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pad = n => String(n).padStart(2, "0");
const nowMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const shift = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const label = ym => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

function Mini({ title, value, hint, tone }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      <p className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-0.5">{value}</p>
      {hint && <p className={`text-[11px] mt-0.5 ${tone || "text-slate-400"}`}>{hint}</p>}
    </div>
  );
}

const Tip = ({ active, payload, label: day }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-[#1e1e2e] border border-slate-100 dark:border-white/10 rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-400 mb-0.5">Day {day}</p>
      <p className="font-mono font-semibold text-brand-500">{fmt(payload[0].value)}</p>
    </div>
  );
};

export default function SpendingInsights() {
  const [month, setMonth] = useState(nowMonth());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("daily");

  useEffect(() => {
    let cancelled = false;
    api.get("/analytics", { params: { month } })
      .then(res => { if (!cancelled) { setData(res.data); setError(""); } })
      .catch(() => { if (!cancelled) setError("Could not load insights"); });
    return () => { cancelled = true; };
  }, [month]);

  const loading = !error && (!data || data.month !== month);
  const isCurrent = month === nowMonth();
  const change = data?.expenseChangePercent;
  const maxCat = Math.max(1, ...(data?.byCategory ?? []).map(c => Math.max(c.total, c.previous)));

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Spending Insights</h2>
          <p className="text-xs text-slate-400 mt-0.5">Daily trend and how this month compares to last</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-50 dark:bg-white/5 rounded-xl p-1">
          <button onClick={() => setMonth(shift(month, -1))} aria-label="Previous month"
            className="w-7 h-7 rounded-lg text-slate-500 hover:bg-white dark:hover:bg-white/10 transition-all">‹</button>
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200 min-w-[110px] text-center">{label(month)}</span>
          <button onClick={() => setMonth(shift(month, 1))} disabled={isCurrent} aria-label="Next month"
            className="w-7 h-7 rounded-lg text-slate-500 hover:bg-white dark:hover:bg-white/10 transition-all disabled:opacity-30 disabled:hover:bg-transparent">›</button>
        </div>
      </div>

      {error ? (
        <div className="text-center text-sm text-red-400 py-10">{error}</div>
      ) : loading ? (
        <div className="flex items-center justify-center h-52">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Mini title="Spent" value={fmt(data.totals.expense)}
              hint={change === null ? "No data last month" : `${change > 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}% vs last month`}
              tone={change === null ? "" : change > 0 ? "text-red-400" : "text-emerald-500"} />
            <Mini title="Income" value={fmt(data.totals.income)}
              hint={`Net ${data.totals.net >= 0 ? "+" : "-"}${fmt(Math.abs(data.totals.net))}`}
              tone={data.totals.net >= 0 ? "text-emerald-500" : "text-red-400"} />
            <Mini title="Avg / day" value={fmt(data.avgPerDay)} hint={`${data.totals.count} transactions`} />
            {isCurrent
              ? <Mini title="Projected" value={fmt(data.projectedExpense)} hint="Spend by month end" />
              : <Mini title="Saved" value={`${data.totals.savingsRate.toFixed(0)}%`} hint="Of income" />}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3">
              <div className="flex gap-1 mb-2">
                {["daily", "cumulative"].map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg font-medium capitalize transition-all
                      ${mode === m ? "bg-brand-500 text-white" : "text-slate-500 bg-slate-50 dark:bg-white/5 hover:text-slate-700"}`}>{m}</button>
                ))}
              </div>
              {data.totals.expense === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No spending this month</div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={data.daily} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c5cfc" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#7c5cfc" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={Math.ceil(data.daily.length / 8) - 1} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Area type="monotone" dataKey={mode === "daily" ? "amount" : "cumulative"} stroke="#7c5cfc" strokeWidth={2} fill="url(#spendFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="lg:col-span-2 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Top categories vs last month</p>
              {data.byCategory.length === 0 && <p className="text-sm text-slate-400">No expenses yet</p>}
              {data.byCategory.slice(0, 5).map(c => {
                const diff = c.previous > 0 ? ((c.total - c.previous) / c.previous) * 100 : null;
                return (
                  <div key={c.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-300 truncate">{c.name}</span>
                      <span className="font-mono text-slate-700 dark:text-slate-200">
                        {fmt(c.total)}
                        {diff !== null && <span className={`ml-1.5 text-[10px] ${diff > 0 ? "text-red-400" : "text-emerald-500"}`}>{diff > 0 ? "▲" : "▼"}{Math.abs(diff).toFixed(0)}%</span>}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(c.total / maxCat) * 100}%`, background: c.color }} />
                    </div>
                  </div>
                );
              })}
              {data.topExpenses.length > 0 && (
                <div className="pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Biggest expenses</p>
                  {data.topExpenses.slice(0, 3).map((t, i) => (
                    <div key={i} className="flex justify-between text-xs py-1">
                      <span className="text-slate-500 dark:text-slate-400 truncate pr-2">{t.title}</span>
                      <span className="font-mono text-slate-700 dark:text-slate-200">{fmt(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
