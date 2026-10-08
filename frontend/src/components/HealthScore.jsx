import { useEffect, useState } from "react";
import api from "../api/axios";

const colorFor = (s) => (s >= 80 ? "#10d9a0" : s >= 60 ? "#7c5cfc" : s >= 40 ? "#ffb547" : "#ff5e7d");

export default function HealthScore() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get("/health-score").then(res => setData(res.data)).catch(() => setError(true));
  }, []);

  const R = 50, C = 2 * Math.PI * R;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Financial Health</h2>
          <p className="text-xs text-slate-400 mt-0.5">A score out of 100 from your savings, budgets and habits</p>
        </div>
      </div>

      {error ? (
        <p className="text-center text-sm text-red-400 py-8">Could not load your score</p>
      ) : !data ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data.hasData ? (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">🩺</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Add a few transactions to get your score.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center">
          <div className="md:col-span-2 flex flex-col items-center">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" className="stroke-slate-100 dark:stroke-white/5" />
                <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" strokeLinecap="round"
                  stroke={colorFor(data.score)} strokeDasharray={C} strokeDashoffset={C * (1 - data.score / 100)}
                  style={{ transition: "stroke-dashoffset 0.8s ease" }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold font-mono text-slate-900 dark:text-white">{Math.round(data.score)}</span>
                <span className="text-[10px] text-slate-400">out of 100</span>
              </div>
            </div>
            <span className="mt-3 text-xs font-semibold px-3 py-1 rounded-full"
              style={{ background: colorFor(data.score) + "22", color: colorFor(data.score) }}>{data.grade}</span>
            {data.change !== null && data.change !== 0 && (
              <span className={`mt-1.5 text-[11px] ${data.change > 0 ? "text-emerald-500" : "text-red-400"}`}>
                {data.change > 0 ? "▲" : "▼"} {Math.abs(data.change)} pts since your last check
              </span>
            )}
          </div>

          <div className="md:col-span-3 space-y-3">
            {data.parts.map(p => (
              <div key={p.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{p.label}</span>
                  <span className="font-mono text-slate-400">{p.score} / {p.max}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${(p.score / p.max) * 100}%`, background: colorFor((p.score / p.max) * 100) }} />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{p.detail}</p>
              </div>
            ))}
            <div className="mt-2 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 px-3 py-2.5 text-xs text-brand-700 dark:text-brand-300">
              💡 <span className="font-semibold">Focus on {data.focus.label.toLowerCase()}:</span> {data.focus.tip}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
