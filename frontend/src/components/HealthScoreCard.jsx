import { useEffect, useState } from "react";
import api from "../api/axios";

function scoreColor(score) {
  if (score === null) return { ring: "#94a3b8", text: "text-slate-400", bg: "bg-slate-50 dark:bg-white/5" };
  if (score >= 75) return { ring: "#10d9a0", text: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10" };
  if (score >= 50) return { ring: "#ffb547", text: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-500/10" };
  return { ring: "#ff5e7d", text: "text-red-500", bg: "bg-red-50 dark:bg-red-500/10" };
}

const LABELS = {
  savingsRate: "Savings Rate",
  budgetAdherence: "Budget Adherence",
  spendingConsistency: "Spending Consistency",
  recurringCoverage: "Recurring Bills",
};

function Gauge({ score }) {
  const colors = scoreColor(score);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const pct = score === null ? 0 : score / 100;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor"
          className="text-slate-100 dark:text-white/5" strokeWidth="8" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke={colors.ring} strokeWidth="8"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold font-mono ${colors.text}`}>
          {score === null ? "—" : score}
        </span>
        <span className="text-[10px] text-slate-400 uppercase tracking-wider">Health</span>
      </div>
    </div>
  );
}

export default function HealthScoreCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => { fetchScore(); }, []);

  async function fetchScore() {
    try {
      const { data } = await api.get("/health/score");
      setData(data);
      setError(false);
    } catch (e) {
      console.error("Health score fetch error:", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="card p-5 animate-pulse">
      <div className="h-4 w-40 bg-slate-100 dark:bg-white/5 rounded mb-4" />
      <div className="h-28 w-28 rounded-full bg-slate-100 dark:bg-white/5" />
    </div>
  );

  if (error) return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Financial Health Score</h2>
      <p className="text-sm text-slate-400">Couldn't load your score right now.</p>
    </div>
  );

  const breakdownEntries = Object.entries(data.breakdown || {});
  const scored = breakdownEntries.filter(([, v]) => !v.skipped);
  const skipped = breakdownEntries.filter(([, v]) => v.skipped);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Financial Health Score</h2>
          <p className="text-xs text-slate-400 mt-0.5">Based on this month's activity</p>
        </div>
        <button onClick={fetchScore}
          className="text-xs text-brand-500 hover:text-brand-600 font-medium transition-colors">
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-5 flex-wrap">
        <Gauge score={data.score} />

        <div className="flex-1 min-w-[180px] space-y-2.5">
          {scored.length === 0 && (
            <p className="text-sm text-slate-400">
              Add some transactions, budgets, or recurring bills and your score will appear here.
            </p>
          )}
          {scored.map(([key, v]) => (
            <div key={key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-slate-600 dark:text-slate-300">{LABELS[key] || key}</span>
                <span className="font-mono text-slate-400">{v.points}/{v.maxPoints}</span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-brand-500 transition-all duration-700"
                  style={{ width: `${(v.points / v.maxPoints) * 100}%` }} />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{v.label}</p>
            </div>
          ))}
        </div>
      </div>

      {skipped.length > 0 && (
        <p className="text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
          Not counted yet: {skipped.map(([, v]) => v.reason).join(" · ")}
        </p>
      )}
    </div>
  );
}
