import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const fmt = n => (n < 0 ? "-" : "") + "₹" + Math.abs(Number(n)).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pad = n => String(n).padStart(2, "0");
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const localToday = () => { const d = new Date(); return `${thisMonth()}-${pad(d.getDate())}`; };
const shiftMonth = (m, delta) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const monthLabel = m => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};
const dayLabel = s => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

// ───────── small pieces ─────────
const card = "bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/5 rounded-2xl p-4 break-inside-avoid print:border-slate-200";

function Change({ pct, goodWhenDown }) {
  if (pct === null || pct === undefined) return <span className="text-slate-400 dark:text-slate-500">no data last month</span>;
  if (pct === 0) return <span className="text-slate-400 dark:text-slate-500">same as last month</span>;
  const up = pct > 0;
  const good = goodWhenDown ? !up : up;
  return (
    <span className={good ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% vs last month
    </span>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className={card}>
      <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold font-mono mt-1 ${tone || "text-slate-900 dark:text-white"}`}>{value}</p>
      <p className="text-xs mt-0.5 text-slate-400 dark:text-slate-500">{sub}</p>
    </div>
  );
}

function DailyChart({ daily }) {
  const W = 800, H = 150, L = 8, R = 8, T = 10, B = 22;
  const max = Math.max(1, ...daily.map(d => d.amount));
  const slot = (W - L - R) / daily.length;
  const bw = Math.max(3, slot - 3);
  const labelDays = new Set([1, 5, 10, 15, 20, 25, daily.length]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block text-brand-500" role="img" aria-label="Spending per day">
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="stroke-slate-200 dark:stroke-white/10" strokeWidth="1" />
      {daily.map((d, i) => {
        const h = d.amount > 0 ? Math.max(2, (d.amount / max) * (H - T - B)) : 0;
        const x = L + i * slot + (slot - bw) / 2;
        return (
          <g key={d.date}>
            {d.amount > 0 && (
              <rect x={x} y={H - B - h} width={bw} height={h} rx="2" fill="currentColor" opacity={d.future ? 0.25 : 1}>
                <title>{`${dayLabel(d.date)}: ${fmt(d.amount)}`}</title>
              </rect>
            )}
            {labelDays.has(i + 1) && (
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" className="fill-slate-400 dark:fill-slate-500">{i + 1}</text>
            )}
          </g>
        );
      })}
      <text x={W - R} y={T + 2} textAnchor="end" fontSize="11" className="fill-slate-400 dark:fill-slate-500">Highest day {fmt(max)}</text>
    </svg>
  );
}

const STATUS = {
  over: { bar: "bg-red-500", text: "text-red-600 dark:text-red-400", label: "Over budget" },
  warning: { bar: "bg-amber-400", text: "text-amber-600 dark:text-amber-400", label: "Close to limit" },
  ok: { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "On track" },
};

// ───────── page ─────────
export default function ReportsPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [result, setResult] = useState(null); // { month, data } | { month, error }

  useEffect(() => {
    let cancelled = false;
    api.get("/report", { params: { month, today: localToday() } })
      .then(res => { if (!cancelled) setResult({ month, data: res.data }); })
      .catch(err => { if (!cancelled) setResult({ month, error: err.response?.data?.message || "Could not load the report. Please try again." }); });
    return () => { cancelled = true; };
  }, [month]);

  const current = result && result.month === month ? result : null;
  const data = (current || result)?.data;
  const loading = !current;
  const error = current?.error;
  const atLatest = month >= thisMonth();

  const generated = useMemo(() => new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), []);

  // Print always in light colours, with a helpful file name, then put things back
  const download = () => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    const oldTitle = document.title;
    const restore = () => {
      if (wasDark) root.classList.add("dark");
      document.title = oldTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    root.classList.remove("dark");
    document.title = `Finance report ${month}`;
    setTimeout(() => { window.print(); }, 50);
  };

  const t = data?.totals;
  const savedTone = t && t.net < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400";

  return (
    <Layout>
      <style>{`@media print { @page { size: A4; margin: 12mm; } html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div className="max-w-4xl mx-auto">
        {/* Controls (not printed) */}
        <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Monthly report</h1>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">A summary of your month that you can save as a PDF.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#16161f] overflow-hidden">
              <button onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Previous month"
                className="px-3 py-2 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5">‹</button>
              <span className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 min-w-[140px] text-center">{monthLabel(month)}</span>
              <button onClick={() => setMonth(m => shiftMonth(m, 1))} disabled={atLatest} aria-label="Next month"
                className="px-3 py-2 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
            </div>
            <button onClick={download} disabled={!data}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25 disabled:opacity-50 transition-all">
              Download PDF
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-500/20 print:hidden">{error}</div>
        )}
        {!data && !error && <p className="text-sm text-slate-400 py-16 text-center">Preparing your report…</p>}

        {data && (
          <div className={`space-y-4 ${loading ? "opacity-60" : ""} transition-opacity`}>
            {/* Title */}
            <div className="flex items-end justify-between border-b border-slate-200 dark:border-white/10 pb-3 break-inside-avoid">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Finance AI · Monthly report</p>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{monthLabel(data.month)}</h2>
              </div>
              <div className="text-right text-xs text-slate-400 dark:text-slate-500">
                {user?.name && <p className="font-medium text-slate-600 dark:text-slate-300">{user.name}</p>}
                <p>Created {generated}</p>
                {data.isCurrentMonth && <p>So far: {data.daysElapsed} of {data.daysInMonth} days</p>}
              </div>
            </div>

            {/* Summary */}
            <div className={`${card} bg-brand-50/60 dark:bg-brand-500/5 print:bg-white`}>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">In short</h3>
              <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                {data.highlights.map((h, i) => <li key={i} className="flex gap-2"><span className="text-brand-500">•</span><span>{h}</span></li>)}
              </ul>
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Income" value={fmt(t.income)} sub={<Change pct={data.change.incomePct} />} />
              <Stat label="Spent" value={fmt(t.expenses)} sub={<Change pct={data.change.expensesPct} goodWhenDown />} />
              <Stat label={t.net >= 0 ? "Saved" : "Overspent"} value={fmt(Math.abs(t.net))} tone={savedTone}
                sub={t.savingsRate === null ? "no income recorded" : `${t.savingsRate}% of income`} />
              <Stat label="Average per day" value={fmt(data.avgDailySpend)} sub={`${data.noSpendDays} no-spend day${data.noSpendDays === 1 ? "" : "s"}`} />
            </div>

            {/* Categories */}
            <div className={card}>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">Where the money went</h3>
              {data.categories.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No spending this month.</p>
              ) : (
                <ul className="space-y-3">
                  {data.categories.map(c => (
                    <li key={c.category_id ?? "none"}>
                      <div className="flex items-baseline gap-2 text-sm">
                        <span>{c.icon}</span>
                        <span className="font-medium text-slate-700 dark:text-slate-200">{c.name}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{c.share}%</span>
                        <span className="ml-auto text-xs"><Change pct={c.changePct} goodWhenDown /></span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-white w-24 text-right">{fmt(c.amount)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(2, c.share)}%`, background: c.color }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Daily */}
            <div className={card}>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">Spending day by day</h3>
              <DailyChart daily={data.daily} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Budgets */}
              <div className={card}>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">Budgets</h3>
                {data.budgets.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No budgets set for this month.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.budgets.map(b => {
                      const s = STATUS[b.status];
                      return (
                        <li key={b.category_id}>
                          <div className="flex items-baseline gap-2 text-sm">
                            <span>{b.icon}</span>
                            <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{b.name}</span>
                            <span className={`ml-auto text-xs font-medium ${s.text}`}>{s.label}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 mt-1.5 overflow-hidden">
                            <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${Math.min(100, b.percent)}%` }} />
                          </div>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{fmt(b.spent)} of {fmt(b.limit)} ({b.percent}%)</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Top expenses */}
              <div className={card}>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">Biggest expenses</h3>
                {data.topExpenses.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No expenses this month.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-white/5">
                    {data.topExpenses.map(e => (
                      <li key={e.id} className="flex items-center gap-3 py-2">
                        <span className="w-12 shrink-0 text-xs text-slate-400 dark:text-slate-500">{dayLabel(e.date)}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-slate-700 dark:text-slate-200 truncate">{e.title}</span>
                          <span className="block text-xs text-slate-400 dark:text-slate-500">{e.icon} {e.category}</span>
                        </span>
                        <span className="text-sm font-mono font-semibold text-slate-800 dark:text-white">{fmt(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Goals */}
            {data.goals.length > 0 && (
              <div className={card}>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">Savings goals (as of today)</h3>
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                  {data.goals.map((g, i) => (
                    <li key={i}>
                      <div className="flex items-baseline gap-2 text-sm">
                        <span>{g.icon}</span>
                        <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{g.name}</span>
                        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{g.completed ? "Reached 🎉" : `${g.percent}%`}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/5 mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${g.percent}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{fmt(g.saved)} of {fmt(g.target)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-slate-400 dark:text-slate-600 text-center pt-2">
              Made from your recorded transactions. {data.isCurrentMonth ? "This month is not over yet, so numbers can still change." : ""}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}