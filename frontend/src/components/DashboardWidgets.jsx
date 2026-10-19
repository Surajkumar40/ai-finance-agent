import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { localToday } from "../utils/voiceParse";
import { fmt as money, useCurrency } from "../utils/currency";

// Small cards under the numbers: bills coming up, savings goals, net worth, and the household's shared budgets.
// Each one loads on its own, so if one fails the others still show.
const fmt = (n) => money(n, 0);
const parseYMD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const daysUntil = (s) => { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((parseYMD(s) - t) / 86400000); };
const whenText = (n) => (n < 0 ? "overdue" : n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);
const bar = (p) => (p >= 100 ? "bg-rose-500" : p >= 80 ? "bg-amber-400" : "bg-emerald-500");

function Card({ title, to, linkText, children }) {
  return (
    <section className="card p-5 flex flex-col" aria-label={title}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
        <Link to={to} className="text-xs text-brand-500 hover:text-brand-600 font-medium transition-colors">{linkText} →</Link>
      </div>
      {children}
    </section>
  );
}
const Muted = ({ children }) => <p className="text-sm text-slate-400 dark:text-slate-500">{children}</p>;

// state: { status: "loading" | "error" | "ready", data }
function useLoad(fn) {
  const [s, setS] = useState({ status: "loading" });
  useEffect(() => {
    let off = false;
    fn().then((data) => { if (!off) setS({ status: "ready", data }); })
      .catch((e) => { if (!off) setS({ status: "error", code: e.response?.status }); });
    return () => { off = true; };
  // fn is a stable module-level function below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return s;
}

const loadBills = () => api.get("/recurring").then((r) => r.data
  .filter((b) => b.is_active && b.type === "expense" && b.next_due)
  .map((b) => ({ ...b, n: daysUntil(b.next_due) }))
  .filter((b) => b.n <= 30)
  .sort((a, b) => a.n - b.n));

function Bills() {
  const s = useLoad(loadBills);
  return (
    <Card title="Bills coming up" to="/recurring" linkText="Manage">
      {s.status === "loading" && <Muted>Loading…</Muted>}
      {s.status === "error" && <Muted>Could not load your bills.</Muted>}
      {s.status === "ready" && s.data.length === 0 && <Muted>Nothing due in the next 30 days. Add rent, subscriptions and other regular bills under Recurring and they show up here.</Muted>}
      {s.status === "ready" && s.data.length > 0 && (
        <ul className="space-y-2.5">
          {s.data.slice(0, 5).map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{b.title}</p>
                <p className={`text-xs ${b.n <= 1 ? "text-amber-500 font-medium" : "text-slate-400"}`}>{whenText(b.n)}</p>
              </div>
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{fmt(b.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const loadGoals = () => api.get("/goals").then((r) => r.data.filter((g) => !g.completed).sort((a, b) => b.percent - a.percent));

function Goals() {
  const s = useLoad(loadGoals);
  return (
    <Card title="Savings goals" to="/goals" linkText="All goals">
      {s.status === "loading" && <Muted>Loading…</Muted>}
      {s.status === "error" && <Muted>Could not load your goals.</Muted>}
      {s.status === "ready" && s.data.length === 0 && <Muted>No active goals. Set a target, like a trip or an emergency fund, and track it here.</Muted>}
      {s.status === "ready" && s.data.length > 0 && (
        <ul className="space-y-3.5">
          {s.data.slice(0, 3).map((g) => (
            <li key={g.id}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="font-medium text-slate-700 dark:text-slate-200 truncate"><span aria-hidden>{g.icon} </span>{g.name}</p>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{g.percent}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 mt-1.5 overflow-hidden" role="progressbar" aria-valuenow={g.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.name} progress`}>
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${g.percent}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-1">{fmt(g.saved_amount)} of {fmt(g.target_amount)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const loadNetWorth = () => api.get("/networth", { params: { today: localToday() } }).then((r) => r.data);

// A tiny line of the net worth over the last months. Needs at least two points that differ in time, not in value.
function Spark({ points }) {
  if (points.length < 2) return null;
  const w = 120, h = 32, lo = Math.min(...points), hi = Math.max(...points), span = hi - lo || 1;
  const xy = points.map((v, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - lo) / span) * (h - 6)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 text-brand-500" role="img" aria-label="Net worth over the last months" preserveAspectRatio="none">
      <polyline points={xy} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function NetWorth() {
  const s = useLoad(loadNetWorth);
  if (s.status === "error" && s.code === 403) return null; // demo accounts cannot track net worth
  return (
    <Card title="Net worth" to="/networth" linkText="Details">
      {s.status === "loading" && <Muted>Loading…</Muted>}
      {s.status === "error" && <Muted>Could not load your net worth.</Muted>}
      {s.status === "ready" && s.data.items.length === 0 && <Muted>Add what you own and what you owe, like bank balances, investments and loans, to see your total here.</Muted>}
      {s.status === "ready" && s.data.items.length > 0 && (() => {
        const { totals, change, trend } = s.data;
        const up = change && change.amount > 0, down = change && change.amount < 0;
        return (
          <>
            <span className={`text-2xl font-bold font-mono ${totals.net < 0 ? "text-rose-500" : "text-slate-900 dark:text-white"}`}>{fmt(totals.net)}</span>
            {change && (
              <p className={`text-xs mt-1 ${up ? "text-emerald-500" : down ? "text-rose-500" : "text-slate-400"}`}>
                {up ? "▲ " : down ? "▼ " : ""}{change.amount === 0 ? "No change" : fmt(Math.abs(change.amount))} since last month
              </p>
            )}
            <div className="mt-3"><Spark points={trend.map((t) => t.net)} /></div>
            <p className="text-xs text-slate-400 mt-2">{fmt(totals.assets)} owned · {fmt(totals.debts)} owed</p>
          </>
        );
      })()}
    </Card>
  );
}

const loadShared = async () => {
  const ov = (await api.get("/household")).data;
  if (!ov.household) return { none: true, invites: ov.my_invites?.length || 0 };
  const month = localToday().slice(0, 7);
  const b = (await api.get("/household/budgets", { params: { month } })).data;
  return { name: ov.household.name, people: ov.household.members.length, budgets: b.budgets, spent: b.total_spent, limit: b.total_limit };
};

function Shared() {
  const s = useLoad(loadShared);
  if (s.status === "error" && s.code === 403) return null; // demo accounts do not have shared budgets
  return (
    <Card title="Shared budgets" to="/shared" linkText="Open">
      {s.status === "loading" && <Muted>Loading…</Muted>}
      {s.status === "error" && <Muted>Could not load shared budgets.</Muted>}
      {s.status === "ready" && s.data.none && (
        <Muted>{s.data.invites > 0 ? `You have ${s.data.invites} invite${s.data.invites > 1 ? "s" : ""} waiting.` : "Track a budget together with family or flatmates. You only see totals, unless someone chooses to share more."}</Muted>
      )}
      {s.status === "ready" && !s.data.none && (() => {
        const d = s.data; const pct = d.limit > 0 ? Math.round((d.spent / d.limit) * 100) : 0;
        const over = d.budgets.filter((b) => b.percent >= 100);
        return (
          <>
            <p className="text-xs text-slate-400 mb-2">{d.name} · {d.people} {d.people === 1 ? "person" : "people"}</p>
            {d.budgets.length === 0 ? <Muted>No shared budgets this month yet.</Muted> : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">{fmt(d.spent)}</span>
                  <span className="text-xs text-slate-400">of {fmt(d.limit)} · {pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 mt-2 overflow-hidden" role="progressbar" aria-valuenow={Math.min(100, pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Shared budgets used">
                  <div className={`h-full rounded-full ${bar(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <p className={`text-xs mt-2 ${over.length ? "text-rose-500 font-medium" : "text-slate-400"}`}>
                  {over.length ? `${over.length} over the limit: ${over.slice(0, 2).map((b) => b.category_name).join(", ")}${over.length > 2 ? "…" : ""}` : `${d.budgets.length} shared ${d.budgets.length === 1 ? "budget" : "budgets"}, all within limits`}
                </p>
              </>
            )}
          </>
        );
      })()}
    </Card>
  );
}

export default function DashboardWidgets() {
  useCurrency();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <Bills />
      <Goals />
      <NetWorth />
      <Shared />
    </div>
  );
}