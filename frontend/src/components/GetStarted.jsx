import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { localToday } from "../utils/voiceParse";

// A short checklist for someone who has just signed up. Each step ticks itself off from the person's real data,
// the whole card disappears once every step is done, and "Hide" removes it earlier (remembered in this browser).
const KEY = "finance-ai-getstarted-hidden";
const wasHidden = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

// Does the person have at least one of these? If we cannot tell (the request failed), say yes so we never nag by mistake.
const hasAny = (url, params) =>
  api.get(url, { params }).then((r) => (Array.isArray(r.data) ? r.data.length > 0 : true)).catch(() => true);

export default function GetStarted({ hasTransactions }) {
  const [hidden, setHidden] = useState(wasHidden);
  const [have, setHave] = useState(null); // { budgets, goals, recurring } once loaded

  useEffect(() => {
    if (hidden) return undefined;
    let off = false;
    const today = localToday();
    Promise.all([hasAny("/budgets", { month: today.slice(0, 7) }), hasAny("/goals", { today }), hasAny("/recurring")])
      .then(([budgets, goals, recurring]) => { if (!off) setHave({ budgets, goals, recurring }); });
    return () => { off = true; };
  }, [hidden]);

  if (hidden || !have) return null;
  const steps = [
    { done: hasTransactions, title: "Add your first transaction", hint: "Record something you spent or earned.", to: "/transactions" },
    { done: have.budgets, title: "Set a budget", hint: "Choose a monthly limit for a category.", to: "/budgets" },
    { done: have.goals, title: "Create a savings goal", hint: "Something to save towards, like a phone or a trip.", to: "/goals" },
    { done: have.recurring, title: "Add a recurring bill or income", hint: "Rent, a subscription or your salary.", to: "/recurring" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const hide = () => { try { localStorage.setItem(KEY, "1"); } catch { /* the card just comes back next visit */ } setHidden(true); };

  return (
    <section className="card p-5" aria-label="Get started">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Get started</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{doneCount} of {steps.length} done</p>
        </div>
        <button onClick={hide} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Hide</button>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden mb-4" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-label="Setup progress">
        <div className="h-full bg-brand-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ul className="space-y-2.5">
        {steps.map((s) => (
          <li key={s.title} className="flex items-center gap-3">
            <span aria-hidden="true" className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${s.done ? "bg-emerald-500 text-white" : "border border-slate-300 dark:border-white/20"}`}>{s.done ? "✓" : ""}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${s.done ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-200 font-medium"}`}>{s.title}</p>
              {!s.done && <p className="text-xs text-slate-400 dark:text-slate-500">{s.hint}</p>}
            </div>
            {s.done
              ? <span className="sr-only">Done</span>
              : <Link to={s.to} className="text-xs font-medium text-brand-500 hover:text-brand-600 shrink-0">Start →</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}