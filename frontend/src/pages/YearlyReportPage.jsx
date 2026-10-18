import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { fmt as money, compact, useCurrency } from "../utils/currency";
import { localToday } from "../utils/voiceParse";

const fmt = (n) => money(n, 0);
const card = "bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/5 rounded-2xl p-4 break-inside-avoid print:border-slate-200";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (ym) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const pctSub = (p, y) => (p === null ? null : `${p > 500 ? ">+500" : (p > 0 ? "+" : "") + p}% vs ${y}`);
const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// income and spending side by side for every month
// phones get a narrower drawing so the text stays readable
function useNarrow() {
  const q = "(max-width: 640px)";
  const [n, setN] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const f = () => setN(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return n;
}

function MonthChart({ months, monthsDone }) {
  const narrow = useNarrow();
  const W = narrow ? 380 : 800, H = narrow ? 230 : 220, L = narrow ? 40 : 46, R = 6, T = 12, B = 26;
  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.expenses)));
  const slot = (W - L - R) / 12, bw = Math.max(5, (slot - (narrow ? 5 : 10)) / 2);
  const y = (v) => H - B - (v / max) * (H - T - B);
  const ticks = [0, 0.5, 1].map((f) => f * max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Income and spending for each month">
      {ticks.map((tv) => (
        <g key={tv}>
          <line x1={L} x2={W - R} y1={y(tv)} y2={y(tv)} className="stroke-slate-200 dark:stroke-white/10" strokeWidth="1" />
          <text x={L - 6} y={y(tv) + 4} textAnchor="end" fontSize="11" className="fill-slate-400 dark:fill-slate-500">{compact(tv)}</text>
        </g>
      ))}
      {months.map((m, i) => {
        const x0 = L + i * slot + (slot - 2 * bw - 2) / 2;
        const dim = i >= monthsDone ? 0.25 : 1;
        return (
          <g key={m.month} opacity={dim}>
            {m.income > 0 && <rect x={x0} y={y(m.income)} width={bw} height={H - B - y(m.income)} rx="2" className="fill-emerald-500"><title>{`${MONTHS[i]} income: ${fmt(m.income)}`}</title></rect>}
            {m.expenses > 0 && <rect x={x0 + bw + 2} y={y(m.expenses)} width={bw} height={H - B - y(m.expenses)} rx="2" className="fill-brand-500"><title>{`${MONTHS[i]} spending: ${fmt(m.expenses)}`}</title></rect>}
            <text x={L + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize={narrow ? 10 : 11} className="fill-slate-400 dark:fill-slate-500">{narrow ? MONTHS[i][0] : MONTHS[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Stat({ label, value, sub, tone = "text-slate-900 dark:text-white" }) {
  return (
    <div className={card}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold mt-1 ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function YearlyReportPage() {
  useCurrency();
  const { user } = useAuth();
  const nowYear = Number(localToday().slice(0, 4));
  const [year, setYear] = useState(nowYear);
  const [result, setResult] = useState(null); // { year, data } | { year, error }

  useEffect(() => {
    let off = false;
    api.get("/report/year", { params: { year, today: localToday() } })
      .then((r) => { if (!off) setResult({ year, data: r.data }); })
      .catch((e) => { if (!off) setResult({ year, error: e.response?.data?.message || "Could not load the yearly report. Please try again." }); });
    return () => { off = true; };
  }, [year]);

  const current = result && result.year === year ? result : null;
  const data = (current || result)?.data;
  const error = current?.error;
  const loading = !current;
  const generated = useMemo(() => new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), []);

  const printPdf = () => {
    const root = document.documentElement, wasDark = root.classList.contains("dark"), oldTitle = document.title;
    const restore = () => { if (wasDark) root.classList.add("dark"); document.title = oldTitle; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    root.classList.remove("dark");
    document.title = `Finance report ${year}`;
    setTimeout(() => window.print(), 50);
  };

  const downloadCsv = () => {
    if (!data) return;
    const rows = [
      [`Yearly report ${data.year}`, `Currency: ${data.currency}`],
      [],
      ["Month", "Income", "Spending", "Saved", "Transactions"],
      ...data.months.map((m) => [m.month, m.income.toFixed(2), m.expenses.toFixed(2), m.net.toFixed(2), m.txCount]),
      ["Total", data.totals.income.toFixed(2), data.totals.expenses.toFixed(2), data.totals.net.toFixed(2), data.totals.txCount],
      [],
      ["Category", "Spent", "Share of spending (%)", "Transactions"],
      ...data.categories.map((c) => [c.name, c.amount.toFixed(2), c.share, c.count]),
      [],
      ["Largest expenses", "Amount", "Date", "Category"],
      ...data.topExpenses.map((t) => [t.title, t.amount.toFixed(2), t.date, t.category]),
    ];
    const text = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `finance-report-${data.year}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const t = data?.totals;
  const savedTone = t && t.net < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400";
  const btn = "px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all";

  return (
    <Layout>
      <style>{`@media print { @page { size: A4; margin: 12mm; } html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Yearly report</h1>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Your whole year in one page. <Link to="/reports" className="text-brand-500 hover:underline">Monthly report</Link></p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#16161f] overflow-hidden">
              <button onClick={() => setYear((y) => y - 1)} disabled={year <= 1990} aria-label="Previous year" className="px-3 py-2 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-30">‹</button>
              <span className="px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 min-w-[80px] text-center" aria-live="polite">{year}</span>
              <button onClick={() => setYear((y) => y + 1)} disabled={year >= nowYear} aria-label="Next year" className="px-3 py-2 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
            </div>
            <button onClick={downloadCsv} disabled={!data} className={`${btn} border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5`}>Download CSV</button>
            <button onClick={printPdf} disabled={!data} className={`${btn} bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25`}>Download PDF</button>
          </div>
        </div>

        {error && <div role="alert" className="mb-4 px-4 py-3 rounded-xl text-sm bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-500/20 print:hidden">{error}</div>}
        {!data && !error && <p className="text-sm text-slate-400 py-16 text-center">Preparing your report…</p>}

        {data && (
          <div className={`space-y-4 ${loading ? "opacity-60" : ""} transition-opacity`} aria-label="Yearly report">
            <div className="flex items-end justify-between border-b border-slate-200 dark:border-white/10 pb-3 break-inside-avoid">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-500">Finance AI · Yearly report</p>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{data.year}</h2>
              </div>
              <div className="text-right text-xs text-slate-400 dark:text-slate-500">
                {user?.name && <p className="font-medium text-slate-600 dark:text-slate-300">{user.name}</p>}
                <p>Created {generated}</p>
                {data.year === nowYear && <p>So far: {data.monthsDone} of 12 months</p>}
              </div>
            </div>

            <div className={`${card} bg-brand-50/60 dark:bg-brand-500/5 print:bg-white`}>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">In short</h3>
              <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300 list-disc pl-5">
                {data.highlights.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            </div>

            {t.txCount > 0 && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Stat label="Income" value={fmt(t.income)} sub={pctSub(data.change.incomePct, data.year - 1)} tone="text-emerald-600 dark:text-emerald-400" />
                  <Stat label="Spending" value={fmt(t.expenses)} sub={pctSub(data.change.expensesPct, data.year - 1)} />
                  <Stat label="Saved" value={fmt(t.net)} sub={t.savingsRate !== null ? `${t.savingsRate}% of income` : null} tone={savedTone} />
                  <Stat label="Average month" value={fmt(t.avgMonthlySpend)} sub="spending per month" />
                </div>

                <div className={card}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Month by month</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />Income</span>
                      <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-brand-500 inline-block" />Spending</span>
                    </div>
                  </div>
                  <MonthChart months={data.months} monthsDone={data.monthsDone} />
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full text-xs sm:text-sm">
                      <thead><tr className="text-left text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        <th className="py-1.5 font-semibold">Month</th><th className="text-right font-semibold">Income</th><th className="text-right font-semibold">Spending</th><th className="text-right font-semibold">Saved</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {data.months.map((m, i) => (
                          <tr key={m.month} className={i >= data.monthsDone ? "text-slate-300 dark:text-slate-600" : "text-slate-700 dark:text-slate-200"}>
                            <td className="py-1.5">{monthName(m.month)}</td>
                            <td className="text-right">{fmt(m.income)}</td><td className="text-right">{fmt(m.expenses)}</td>
                            <td className={`text-right ${m.net < 0 && i < data.monthsDone ? "text-red-500" : ""}`}>{fmt(m.net)}</td>
                          </tr>
                        ))}
                        <tr className="font-semibold text-slate-900 dark:text-white"><td className="py-2">Total</td><td className="text-right">{fmt(t.income)}</td><td className="text-right">{fmt(t.expenses)}</td><td className={`text-right ${savedTone}`}>{fmt(t.net)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {data.categories.length > 0 && (
                  <div className={card}>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">Where the money went</h3>
                    <ul className="space-y-2.5" aria-label="Spending by category">
                      {data.categories.map((c) => (
                        <li key={c.id}>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-700 dark:text-slate-200"><span aria-hidden="true">{c.icon}</span> {c.name} <span className="text-slate-400 text-xs">· {c.count} {c.count === 1 ? "purchase" : "purchases"}</span></span>
                            <span className="text-slate-800 dark:text-slate-100 font-medium">{fmt(c.amount)} <span className="text-slate-400 text-xs font-normal">{c.share}%</span></span>
                          </div>
                          <div className="h-1.5 mt-1 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(2, c.share)}%`, background: c.color }} /></div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.topExpenses.length > 0 && (
                  <div className={card}>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">Largest expenses</h3>
                    <ol className="divide-y divide-slate-100 dark:divide-white/5" aria-label="Largest expenses">
                      {data.topExpenses.map((e) => (
                        <li key={e.id} className="py-2 flex justify-between gap-3 text-sm">
                          <span className="min-w-0 text-slate-700 dark:text-slate-200"><span className="break-words">{e.title}</span> <span className="text-slate-400 text-xs">· {dayLabel(e.date)} · {e.category}</span></span>
                          <span className="font-medium text-slate-900 dark:text-white shrink-0">{fmt(e.amount)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}