import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import api from "../api/axios";
import { fmt as money, compact, symbol, useCurrency } from "../utils/currency";
import { localToday } from "../utils/voiceParse";

const fmt = (n) => money(n, 2);
const card = "bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/5 rounded-2xl p-4 sm:p-5";
const input = `w-full px-3 py-2.5 rounded-xl text-sm bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10
  text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20`;
const ghost = "px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all disabled:opacity-40";
const LABEL = {
  cash: "Cash", bank: "Bank account", savings: "Savings", investment: "Investments", property: "Property", vehicle: "Vehicle", other: "Other",
  loan: "Loan", credit_card: "Credit card", mortgage: "Mortgage",
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const errText = (e, f) => e?.response?.data?.message || f;
const dayLabel = (s) => (s ? new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : "");

function useNarrow() {
  const q = "(max-width: 640px)";
  const [n, setN] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const f = () => setN(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  return n;
}

// the net worth at the end of each of the last 12 months
function TrendChart({ trend }) {
  const narrow = useNarrow();
  const W = narrow ? 380 : 800, H = 200, L = narrow ? 46 : 54, R = 10, T = 14, B = 26;
  const vals = trend.map((t) => t.net);
  const rawLo = Math.min(0, ...vals), rawHi = Math.max(0, ...vals);
  let lo = rawLo, hi = rawHi === rawLo ? rawLo + 1 : rawHi;
  const pad = (hi - lo) * 0.08; lo -= rawLo < 0 ? pad : 0; hi += rawHi > 0 ? pad : 0; // a little room so the line does not touch the edges
  const x = (i) => L + (i * (W - L - R)) / (trend.length - 1);
  const y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const line = trend.map((t, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(t.net).toFixed(1)}`).join(" ");
  const area = `${line} L${x(trend.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const ticks = [...new Set([rawHi, 0, rawLo])]; // the real high point, zero, and the real low point
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block text-brand-500" role="img" aria-label="Net worth over the last 12 months">
      {ticks.map((tv, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(tv)} y2={y(tv)} className="stroke-slate-200 dark:stroke-white/10" strokeWidth="1" />
          <text x={L - 6} y={y(tv) + 4} textAnchor="end" fontSize="11" className="fill-slate-400 dark:fill-slate-500">{compact(tv)}</text>
        </g>
      ))}
      {lo < 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="1" strokeDasharray="3 3" />}
      <path d={area} fill="currentColor" opacity="0.1" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {trend.map((t, i) => (
        <g key={t.month}>
          <circle cx={x(i)} cy={y(t.net)} r={i === trend.length - 1 ? 4 : 2.5} fill="currentColor"><title>{`${MON[Number(t.month.slice(5)) - 1]} ${t.month.slice(0, 4)}: ${fmt(t.net)}`}</title></circle>
          {(!narrow || i % 2 === 1 || i === trend.length - 1) && (
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={narrow ? 10 : 11} className="fill-slate-400 dark:fill-slate-500">{MON[Number(t.month.slice(5)) - 1]}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

function Stat({ label, value, sub, tone = "text-slate-900 dark:text-white" }) {
  return (
    <div className={card}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold mt-1 break-words ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Row({ item, busy, onSave, onRemove }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState("");
  const [ask, setAsk] = useState(false);
  const valid = /^\d+(\.\d{1,2})?$/.test(val.trim());
  return (
    <li className="py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 break-words">{item.name}</p>
        <p className="text-xs text-slate-400">{LABEL[item.category] || item.category}{item.updated_at ? ` · updated ${dayLabel(item.updated_at)}` : ""}</p>
      </div>
      {!edit ? (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{fmt(item.balance)}</span>
          <button className={ghost} disabled={busy} aria-label={`Update ${item.name}`} onClick={() => { setVal(String(item.balance)); setEdit(true); setAsk(false); }}>Update</button>
          {!ask
            ? <button className="text-xs text-slate-400 hover:text-rose-500 disabled:opacity-40" disabled={busy} aria-label={`Remove ${item.name}`} onClick={() => setAsk(true)}>Remove</button>
            : (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Sure?</span>
                <button className="px-2 py-1 rounded-lg font-semibold text-white bg-rose-500 hover:bg-rose-600" onClick={onRemove}>Yes</button>
                <button className={ghost} onClick={() => setAsk(false)}>No</button>
              </span>
            )}
        </div>
      ) : (
        <form className="flex items-center gap-2 ml-auto" onSubmit={(e) => { e.preventDefault(); if (valid) onSave(val.trim()).then((ok) => { if (ok) setEdit(false); }); }}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{symbol()}</span>
            <input aria-label={`New balance for ${item.name}`} autoFocus className={`${input} pl-7 w-36`} inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={busy || !valid}>Save</button>
          <button type="button" className={ghost} onClick={() => setEdit(false)}>Cancel</button>
        </form>
      )}
    </li>
  );
}

export default function NetWorthPage() {
  useCurrency();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("asset");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("bank");
  const [balance, setBalance] = useState("");

  useEffect(() => {
    let off = false;
    api.get("/networth", { params: { today: localToday() } })
      .then((r) => { if (!off) { setData(r.data); setError(""); } })
      .catch((e) => { if (!off) setError(errText(e, "Could not load your net worth. Please try again.")); });
    return () => { off = true; };
  }, [tick]);

  const run = useCallback(async (fn, okText) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ text: okText }); setTick((t) => t + 1); return true; }
    catch (e) { setMsg({ text: errText(e, "Something went wrong. Please try again."), bad: true }); return false; }
    finally { setBusy(false); }
  }, []);

  const pickKind = (k) => { setKind(k); setCategory(k === "asset" ? "bank" : "loan"); };
  const valid = name.trim() && /^\d+(\.\d{1,2})?$/.test(balance.trim());
  const add = async (e) => {
    e.preventDefault();
    const ok = await run(() => api.post("/networth", { name: name.trim(), kind, category, balance: balance.trim(), today: localToday() }), "Added");
    if (ok) { setName(""); setBalance(""); setOpen(false); }
  };

  const t = data?.totals;
  const netTone = t && t.net < 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400";
  const assets = data?.items.filter((i) => i.kind === "asset") || [];
  const debts = data?.items.filter((i) => i.kind === "debt") || [];
  const full = data && data.items.length >= data.max_items;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Net worth</h1>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">What you own minus what you owe. Update the balances now and then and the trend builds itself.</p>
          </div>
          <button className="btn-primary" disabled={!data || full} onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Add account or debt"}</button>
        </div>

        {msg && <p role={msg.bad ? "alert" : "status"} className={`text-sm ${msg.bad ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>{msg.text}</p>}
        {error && <div role="alert" className="px-4 py-3 rounded-xl text-sm bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-500/20">{error}</div>}
        {!data && !error && <p className="text-sm text-slate-400 py-16 text-center">Loading…</p>}
        {full && <p className="text-xs text-slate-400">You are tracking the maximum of {data.max_items} items.</p>}

        {open && data && (
          <form onSubmit={add} className={`${card} space-y-3`} aria-label="Add an item">
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden" role="group" aria-label="Type">
              {[["asset", "I own this"], ["debt", "I owe this"]].map(([k, label]) => (
                <button type="button" key={k} aria-pressed={kind === k} onClick={() => pickKind(k)}
                  className={`px-4 py-2 text-sm font-medium ${kind === k ? "bg-brand-500 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"}`}>{label}</button>
              ))}
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <input aria-label="Name" className={input} maxLength={60} placeholder={kind === "asset" ? "e.g. HDFC savings" : "e.g. Car loan"} value={name} onChange={(e) => setName(e.target.value)} />
              <select aria-label="Kind of item" className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
                {data.categories[kind].map((c) => <option key={c} value={c}>{LABEL[c] || c}</option>)}
              </select>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{symbol()}</span>
                <input aria-label="Balance" className={`${input} pl-7`} inputMode="decimal" placeholder={kind === "asset" ? "Current balance" : "Amount you owe"} value={balance} onChange={(e) => setBalance(e.target.value)} />
              </div>
            </div>
            <button className="btn-primary" disabled={busy || !valid}>Save</button>
          </form>
        )}

        {data && data.items.length === 0 && !open && (
          <div className={`${card} text-center py-10`}>
            <p className="font-semibold text-slate-800 dark:text-white">Start with the big things</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">Add your bank accounts, savings and investments, then any loans or credit card balances. Your net worth appears here.</p>
            <button className="btn-primary mt-4" onClick={() => setOpen(true)}>Add your first item</button>
          </div>
        )}

        {data && data.items.length > 0 && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Summary">
              <div className="col-span-2 lg:col-span-1"><Stat label="Net worth" value={fmt(t.net)} tone={netTone} /></div>
              <Stat label="You own" value={fmt(t.assets)} tone="text-emerald-600 dark:text-emerald-400" />
              <Stat label="You owe" value={fmt(t.debts)} tone={t.debts > 0 ? "text-rose-500" : undefined} />
              <Stat label="Since last month" value={data.change ? `${data.change.amount > 0 ? "+" : ""}${fmt(data.change.amount)}` : "—"}
                tone={data.change ? (data.change.amount < 0 ? "text-red-500" : data.change.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : undefined) : undefined}
                sub={data.change ? "vs the end of last month" : "needs an earlier update"} />
            </div>

            <div className={card}>
              <h2 className="font-semibold text-slate-900 dark:text-white mb-2">Last 12 months</h2>
              <TrendChart trend={data.trend} />
              {!data.change && <p className="text-xs text-slate-400 mt-2">The line fills in as you update your balances over the coming weeks.</p>}
            </div>

            {[["What you own", assets, "No accounts yet."], ["What you owe", debts, "No debts. Nice."]].map(([title, list, empty]) => (
              <div key={title} className={card} aria-label={title}>
                <div className="flex justify-between items-baseline">
                  <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
                  <span className="text-sm text-slate-500 dark:text-slate-400">{fmt(list.reduce((s, i) => s + i.balance, 0))}</span>
                </div>
                {list.length === 0 ? <p className="text-sm text-slate-400 mt-2">{empty}</p> : (
                  <ul className="divide-y divide-slate-100 dark:divide-white/5 mt-1">
                    {list.map((i) => (
                      <Row key={i.id} item={i} busy={busy}
                        onSave={(b) => run(() => api.put(`/networth/${i.id}`, { balance: b, today: localToday() }), "Balance updated")}
                        onRemove={() => run(() => api.delete(`/networth/${i.id}`), "Removed")} />
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <p className="text-xs text-slate-400">Removing an item also removes its history from the trend.</p>
          </>
        )}
      </div>
    </Layout>
  );
}