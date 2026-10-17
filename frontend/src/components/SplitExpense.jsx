import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";
import { localToday } from "../utils/voiceParse";
import { fmt, useCurrency, symbol } from "../utils/currency";

const money = (n) => fmt(n, 2, Number.isInteger(Number(n)) ? 0 : 2);
const card = "bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/5 rounded-2xl";
const input = `w-full px-3 py-2.5 rounded-xl text-sm bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10
  text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20`;
const ghost = "px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all disabled:opacity-40";
const errText = (e, f) => e?.response?.data?.message || f;
const dayLabel = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function Undo({ label, onConfirm, disabled }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="text-xs text-slate-400 hover:text-rose-500 disabled:opacity-40" disabled={disabled} onClick={() => setAsk(true)}>{label}</button>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-slate-500 dark:text-slate-400">Sure?</span>
      <button className="px-2 py-1 rounded-lg font-semibold text-white bg-rose-500 hover:bg-rose-600" onClick={() => { setAsk(false); onConfirm(); }}>Yes</button>
      <button className={ghost} onClick={() => setAsk(false)}>No</button>
    </span>
  );
}

// Shared expenses with "who owes whom". Everything is split equally between the people you choose.
export default function SplitExpenses({ month, monthText }) {
  useCurrency();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => localToday());
  const [paidBy, setPaidBy] = useState("");
  const [among, setAmong] = useState(null); // null = everyone

  useEffect(() => {
    let off = false;
    api.get("/household/expenses", { params: { month } })
      .then((r) => { if (!off) { setData(r.data); setError(""); } })
      .catch((e) => { if (!off) setError(errText(e, "Could not load shared expenses.")); });
    return () => { off = true; };
  }, [month, tick]);

  const run = useCallback(async (fn, okText) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ text: okText }); setTick((t) => t + 1); return true; }
    catch (e) { setMsg({ text: errText(e, "Something went wrong. Please try again."), bad: true }); return false; }
    finally { setBusy(false); }
  }, []);

  if (error) return <div className={`${card} p-4 sm:p-5`}><h2 className="font-semibold text-slate-900 dark:text-white">Split expenses</h2><p className="text-sm text-rose-500 mt-2">{error}</p></div>;
  if (!data) return <div className={`${card} p-4 sm:p-5`}><h2 className="font-semibold text-slate-900 dark:text-white">Split expenses</h2><p className="text-sm text-slate-400 mt-2">Loading…</p></div>;

  const me = data.members.find((m) => m.is_me);
  const chosen = among ?? data.members.map((m) => m.user_id);
  const payer = paidBy || String(me?.user_id || "");
  const toggle = (id) => setAmong((cur) => { const base = cur ?? data.members.map((m) => m.user_id); return base.includes(id) ? base.filter((x) => x !== id) : [...base, id]; });
  const amt = Number(amount);
  const valid = title.trim() && amt > 0 && /^\d+(\.\d{1,2})?$/.test(amount.trim()) && chosen.length > 0 && date;

  const add = async (e) => {
    e.preventDefault();
    const ok = await run(() => api.post("/household/expenses", { title: title.trim(), amount: amount.trim(), date, paid_by: Number(payer), split_among: chosen }), "Expense added");
    if (ok) { setTitle(""); setAmount(""); setAmong(null); setOpen(false); }
  };

  const mineBal = data.balances.find((b) => b.is_me)?.balance || 0;
  const headline = Math.abs(mineBal) < 0.005 ? "You are all settled up" : mineBal > 0 ? `You are owed ${money(mineBal)}` : `You owe ${money(-mineBal)}`;

  return (
    <div className={`${card} p-4 sm:p-5`} aria-label="Split expenses">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">Split expenses</h2>
          <p className="text-xs text-slate-400 mt-0.5">Add things one person paid for and see who owes whom.</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Add expense"}</button>
      </div>

      {msg && <p role={msg.bad ? "alert" : "status"} className={`text-sm mt-3 ${msg.bad ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>{msg.text}</p>}

      {open && (
        <form onSubmit={add} className="mt-4 space-y-3 p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
          <div className="grid sm:grid-cols-2 gap-3">
            <input aria-label="Expense title" className={input} maxLength={100} placeholder="What was it for? (e.g. Groceries)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{symbol()}</span>
              <input aria-label="Expense amount" className={`${input} pl-7`} type="text" inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Paid by
              <select aria-label="Paid by" className={`${input} mt-1`} value={payer} onChange={(e) => setPaidBy(e.target.value)}>
                {data.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.is_me ? "You" : m.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500 dark:text-slate-400">Date
              <input aria-label="Expense date" className={`${input} mt-1`} type="date" value={date} max="2100-01-01" onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <fieldset>
            <legend className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Split equally between</legend>
            <div className="flex flex-wrap gap-2">
              {data.members.map((m) => (
                <label key={m.user_id} className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={chosen.includes(m.user_id)} onChange={() => toggle(m.user_id)} /> {m.is_me ? "You" : m.name}
                </label>
              ))}
            </div>
            {valid && <p className="text-xs text-slate-400 mt-1.5">About {money(Math.round((amt / chosen.length) * 100) / 100)} each.</p>}
          </fieldset>
          <button className="btn-primary" disabled={busy || !valid}>Save expense</button>
        </form>
      )}

      <div className="mt-4">
        <p className={`text-sm font-semibold ${mineBal > 0.004 ? "text-emerald-600 dark:text-emerald-400" : mineBal < -0.004 ? "text-rose-500" : "text-slate-600 dark:text-slate-300"}`}>{headline}</p>
        <ul className="mt-2 grid sm:grid-cols-2 gap-1.5" aria-label="Balances">
          {data.balances.map((b) => (
            <li key={b.user_id} className="flex justify-between text-sm rounded-lg bg-slate-50 dark:bg-white/[0.03] px-3 py-1.5">
              <span className="text-slate-700 dark:text-slate-200 truncate">{b.is_me ? "You" : b.name}{b.former && <span className="text-slate-400"> (left)</span>}</span>
              <span className={b.balance > 0.004 ? "text-emerald-600 dark:text-emerald-400" : b.balance < -0.004 ? "text-rose-500" : "text-slate-400"}>
                {Math.abs(b.balance) < 0.005 ? "settled" : b.balance > 0 ? `is owed ${money(b.balance)}` : `owes ${money(-b.balance)}`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {data.suggestions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Settle up</h3>
          <ul className="space-y-1.5" aria-label="Suggested payments">
            {data.suggestions.map((t) => {
              const mine = t.from_user === me?.user_id || t.to_user === me?.user_id;
              return (
                <li key={`${t.from_user}-${t.to_user}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700 dark:text-slate-200">
                    <b>{t.from_user === me?.user_id ? "You" : t.from_name}</b> {t.from_user === me?.user_id ? "pay" : "pays"} <b>{t.to_user === me?.user_id ? "you" : t.to_name}</b> {money(t.amount)}
                  </span>
                  {mine && (
                    <button className={ghost} disabled={busy}
                      onClick={() => run(() => api.post("/household/settlements", t.from_user === me.user_id ? { to_user: t.to_user, amount: t.amount } : { from_user: t.from_user, amount: t.amount }), "Payment recorded")}>
                      Mark as paid
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <div className="flex justify-between items-baseline mb-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Expenses in {monthText}</h3>
          {data.expenses.length > 0 && <span className="text-xs text-slate-400">{money(data.month_total)} in total</span>}
        </div>
        {data.expenses.length === 0 ? <p className="text-sm text-slate-400">No shared expenses in this month.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5" aria-label="Shared expenses">
            {data.expenses.map((e) => (
              <li key={e.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 break-words">{e.title}</p>
                  <p className="text-xs text-slate-400">{dayLabel(e.date)} · paid by {e.paid_by === me?.user_id ? "you" : e.paid_by_name} · split {e.shares.length} {e.shares.length === 1 ? "way" : "ways"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{money(e.amount)}</p>
                  {e.can_delete && <Undo label="Delete" disabled={busy} onConfirm={() => run(() => api.delete(`/household/expenses/${e.id}`), "Expense deleted")} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.settlements.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Recent payments</h3>
          <ul className="space-y-1.5" aria-label="Recent payments">
            {data.settlements.slice(0, 5).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span>{dayLabel(t.date)} · {t.from_user === me?.user_id ? "You" : t.from_name} paid {t.to_user === me?.user_id ? "you" : t.to_name} <b>{money(t.amount)}</b></span>
                {t.can_delete && <Undo label="Undo" disabled={busy} onConfirm={() => run(() => api.delete(`/household/settlements/${t.id}`), "Payment removed")} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}