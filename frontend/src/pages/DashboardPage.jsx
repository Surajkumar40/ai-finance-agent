import { useEffect, useState } from "react";
import api from "../api/axios";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from "recharts";
import Layout from "../components/Layout";
import BudgetProgress from "../components/BudgetProgress";
import HealthScoreCard from "../components/HealthScoreCard";
import AlertsBanner from "../components/AlertsBanner";

const COLORS = ["#7c5cfc","#10d9a0","#ffb547","#ff5e7d","#3b82f6","#f472b6","#34d399","#fb923c"];
const fmt = n => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div className="card p-5 flex flex-col gap-3 animate-slide-up hover:shadow-lg transition-shadow duration-200">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>{icon}</div>
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono">{value}</p>
        {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-[#1e1e2e] border border-slate-100 dark:border-white/10 rounded-xl p-3 shadow-xl text-sm">
      {label && <p className="text-slate-400 mb-1 text-xs">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium font-mono">{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const [summary, setSummary] = useState({ income: 0, expenses: 0, balance: 0 });
  const [pieData, setPieData] = useState([]);
  const [barData, setBarData] = useState([]);
  const [recentTxns, setRecentTxns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAll(); }, []);

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
        const d = new Date(t.date ?? t.created_at);
        const key = d.toLocaleString("default", { month: "short", year: "2-digit" });
        if (!monthMap[key]) monthMap[key] = { month: key, Income: 0, Expenses: 0 };
        if (t.type === "income") monthMap[key].Income += parseFloat(t.amount);
        else monthMap[key].Expenses += parseFloat(t.amount);
      });
      setBarData(Object.values(monthMap).sort((a,b) => new Date("1 "+a.month) - new Date("1 "+b.month)).slice(-6));
      setRecentTxns(txns.slice(0, 5));
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading your finances…</p>
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Overview</h1>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
              {new Date().toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Live</span>
          </div>
        </div>

        <AlertsBanner />

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Net Balance" value={fmt(summary.balance)} sub="Total across all time"
            accent="bg-brand-50 dark:bg-brand-500/10"
            icon={<svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 2v20M2 12h20"/></svg>} />
          <StatCard label="Total Income" value={fmt(summary.income)} sub="All income transactions"
            accent="bg-emerald-50 dark:bg-emerald-500/10"
            icon={<svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>} />
          <StatCard label="Total Expenses" value={fmt(summary.expenses)} sub="All expense transactions"
            accent="bg-red-50 dark:bg-red-500/10"
            icon={<svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>} />
          <StatCard label="Savings Rate" value={`${savingsRate}%`} sub="Income saved this period"
            accent="bg-amber-50 dark:bg-amber-500/10"
            icon={<svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2"/></svg>} />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="card p-5 lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Monthly Overview</h2>
              <span className="text-xs text-slate-400 bg-slate-50 dark:bg-white/5 px-2 py-1 rounded-lg">Last 6 months</span>
            </div>
            {barData.length === 0
              ? <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No data yet</div>
              : <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} margin={{ top:0, right:0, left:-20, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill:"rgba(124,92,252,0.05)" }} />
                    <Legend wrapperStyle={{ fontSize:"12px", paddingTop:"12px" }} />
                    <Bar dataKey="Income" fill="#10d9a0" radius={[6,6,0,0]} />
                    <Bar dataKey="Expenses" fill="#ff5e7d" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
            }
          </div>

          <div className="card p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Spending Split</h2>
            </div>
            {pieData.length === 0
              ? <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No expenses yet</div>
              : <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} strokeWidth={0} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-2">
                    {pieData.slice(0,4).map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-slate-500 dark:text-slate-400">{item.name}</span>
                        </div>
                        <span className="font-medium font-mono text-slate-700 dark:text-slate-300">{fmt(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
            }
          </div>
        </div>

        {/* Health Score + Budget Progress */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <HealthScoreCard />
          </div>
          <div className="lg:col-span-3">
            <BudgetProgress />
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recent Transactions</h2>
            <a href="/transactions" className="text-xs text-brand-500 hover:text-brand-600 font-medium transition-colors">View all →</a>
          </div>
          {recentTxns.length === 0
            ? <div className="text-center py-8 text-slate-400 text-sm">No transactions yet</div>
            : <div className="space-y-1">
                {recentTxns.map((t, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${t.type === "income" ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-red-50 dark:bg-red-500/10"}`}>
                        {t.type === "income" ? "↑" : "↓"}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t.title}</p>
                        <p className="text-xs text-slate-400">{t.category_name ?? "Other"} · {new Date(t.date).toLocaleDateString("en-IN")}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold font-mono ${t.type === "income" ? "text-emerald-500" : "text-red-400"}`}>
                      {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
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