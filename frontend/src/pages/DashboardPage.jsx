import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from "recharts";
import Layout from "../components/Layout";
import BudgetProgress from "../components/BudgetProgress";
import SpendingInsights from "../components/SpendingInsights";
import HealthScore from "../components/HealthScore";
import DashboardWidgets from "../components/DashboardWidgets";
import GetStarted from "../components/GetStarted";
import { useTheme } from "../context/ThemeContext";
import { fmt as money, useCurrency } from "../utils/currency";

// Chart colours. Muted, and each theme has its own set so every colour stays visible on its background.
const CHART = {
  light: {
    cats: ["#1f6f8b","#c2602b","#5b7f2a","#8a4f9e","#b8962e","#3d5a99","#b5456a","#6b675e"],
    income: "#0b7a55", expense: "#c2362b", axis: "#6b675e", grid: "#e4e1d8", cursor: "rgba(24,24,22,0.04)", gap: "#ffffff",
  },
  dark: {
    cats: ["#5aa9c4","#e0884f","#93b85a","#bf86d0","#d9b94f","#7b98d8","#e07a9b","#aaa69b"],
    income: "#3cc796", expense: "#f4756b", axis: "#aaa69b", grid: "#343430", cursor: "rgba(255,255,255,0.05)", gap: "#1c1c1a",
  },
};
// 30000 -> 30k, 250000 -> 2.5L (Indian lakh), so the axis labels stay short
const short = (n) => {
  const a = Math.abs(n);
  if (a >= 10000000) return `${+(n / 10000000).toFixed(1)}Cr`;
  if (a >= 100000) return `${+(n / 100000).toFixed(1)}L`;
  if (a >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  return String(n);
};
const fmt = (n) => money(n, 0);
// A date arrives as plain text (2026-10-02). new Date("2026-10-02") reads it as midnight UTC, which is the day before
// for anyone west of UTC, so build the date from its parts in the visitor's own calendar instead.
const parseDay = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v)); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v); };

function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div className="card p-5 flex flex-col gap-3 animate-slide-up">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>{icon}</div>
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white font-mono">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-raised border border-line rounded-lg p-3 shadow-lg text-sm">
      {label && <p className="text-slate-500 mb-1 text-xs">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium font-mono">{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  useCurrency();
  const { dark } = useTheme();
  const c = dark ? CHART.dark : CHART.light;
  const [summary, setSummary] = useState({ income: 0, expenses: 0, balance: 0 });
  const [pieData, setPieData] = useState([]);
  const [barData, setBarData] = useState([]);
  const [recentTxns, setRecentTxns] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchAll() {
    try {
      const { data } = await api.get("/transactions");
      const txns = data.transactions ?? data;

      let income = 0, expenses = 0;
      txns.forEach(t => {
        if (t.type === "income") income += parseFloat(t.amount);
        else expenses += parseFloat(t.amount);
      });
      setSummary({ income, expenses, balance: income - expenses });

      const catMap = {};
      txns.filter(t => t.type === "expense").forEach(t => {
        const name = t.category_name ?? t.category ?? "Other";
        catMap[name] = (catMap[name] ?? 0) + parseFloat(t.amount);
      });
      setPieData(Object.entries(catMap).map(([name, value]) => ({ name, value: +value.toFixed(2) })));

      const monthMap = {};
      txns.forEach(t => {
        const d = parseDay(t.date ?? t.created_at);
        const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
        if (!monthMap[key]) monthMap[key] = { month: key, sortKey: d.getFullYear() * 12 + d.getMonth(), Income: 0, Expenses: 0 };
        if (t.type === "income") monthMap[key].Income += parseFloat(t.amount);
        else monthMap[key].Expenses += parseFloat(t.amount);
      });
      setBarData(Object.values(monthMap).sort((a,b) => a.sortKey - b.sortKey).slice(-6));
      setRecentTxns(txns.slice(0, 5));
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll(); }, []);

  if (loading) return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6" role="status" aria-live="polite">
        <span className="sr-only">Loading your finances…</span>
        <div className="space-y-2"><div className="skeleton h-7 w-40" /><div className="skeleton h-4 w-56" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="card p-5 space-y-4"><div className="skeleton h-3 w-24" /><div className="skeleton h-7 w-32" /><div className="skeleton h-3 w-28" /></div>)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="card p-5 lg:col-span-3"><div className="skeleton h-[250px] w-full" /></div>
          <div className="card p-5 lg:col-span-2"><div className="skeleton h-[250px] w-full" /></div>
        </div>
      </div>
    </Layout>
  );

  const savingsRate = summary.income > 0
    ? (((summary.income - summary.expenses) / summary.income) * 100).toFixed(1)
    : 0;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Overview</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {new Date().toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
            </p>
          </div>
        </div>

        <GetStarted hasTransactions={recentTxns.length > 0} />

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Net Balance" value={fmt(summary.balance)} sub="Total across all time"
            accent="bg-slate-100 dark:bg-white/10"
            icon={<svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>} />
          <StatCard label="Total Income" value={fmt(summary.income)} sub="All income transactions"
            accent="bg-slate-100 dark:bg-white/10"
            icon={<svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>} />
          <StatCard label="Total Expenses" value={fmt(summary.expenses)} sub="All expense transactions"
            accent="bg-slate-100 dark:bg-white/10"
            icon={<svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>} />
          <StatCard label="Savings Rate" value={`${savingsRate}%`} sub="Income saved this period"
            accent="bg-slate-100 dark:bg-white/10"
            icon={<svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>} />
        </div>

        {/* Bills coming up, goals, shared budgets */}
        <DashboardWidgets />

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="card p-5 lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Monthly Overview</h2>
              <span className="text-xs text-slate-500 bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-md">Last 6 months</span>
            </div>
            {barData.length === 0
              ? <div className="flex items-center justify-center h-48 text-slate-500 text-sm">No data yet</div>
              : <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} margin={{ top:4, right:4, left:0, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize:11, fill:c.axis }} axisLine={false} tickLine={false} />
                    <YAxis width={44} tickFormatter={short} tick={{ fontSize:11, fill:c.axis }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill:c.cursor }} />
                    <Legend wrapperStyle={{ fontSize:"12px", paddingTop:"12px", color:c.axis }} />
                    <Bar dataKey="Income" fill={c.income} radius={[3,3,0,0]} />
                    <Bar dataKey="Expenses" fill={c.expense} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
            }
          </div>

          <div className="card p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Spending Split</h2>
            </div>
            {pieData.length === 0
              ? <div className="flex items-center justify-center h-48 text-slate-500 text-sm">No expenses yet</div>
              : <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={0}>
                        {pieData.map((_, i) => <Cell key={i} fill={c.cats[i % c.cats.length]} stroke={c.gap} strokeWidth={2} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {pieData.slice(0,4).map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: c.cats[i % c.cats.length] }} />
                          <span className="text-slate-600 dark:text-slate-300">{item.name}</span>
                        </div>
                        <span className="font-medium font-mono text-slate-700 dark:text-slate-300">{fmt(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
            }
          </div>
        </div>

        {/* Score out of 100 */}
        <HealthScore />

        {/* Month picker, daily trend, comparison with last month */}
        <SpendingInsights />

        {/* Budget Progress — NEW */}
        <BudgetProgress />

        {/* Recent Transactions */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Recent Transactions</h2>
            <Link to="/transactions" className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium">View all →</Link>
          </div>
          {recentTxns.length === 0
            ? <div className="text-center py-8 text-slate-500 text-sm">No transactions yet</div>
            : <div className="space-y-1">
                {recentTxns.map((t, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-100/70 dark:hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${t.type === "income" ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`} aria-hidden="true">
                        {t.type === "income" ? "↑" : "↓"}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{t.title}</p>
                        <p className="text-xs text-slate-500">{t.category_name ?? "Other"} · {parseDay(t.date).toLocaleDateString("en-IN")}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold font-mono ${t.type === "income" ? "text-emerald-600" : "text-red-600"}`}>
                      <span className="sr-only">{t.type === "income" ? "Income " : "Expense "}</span>{t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
          }
        </div>

      </div>
    </Layout>
  );
}