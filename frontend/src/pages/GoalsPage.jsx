import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import api from "../api/axios";

const ICONS = ["🎯", "💻", "🏠", "🚗", "✈️", "📱", "🎓", "💍", "🏍️", "🛡️"];
const EMPTY = { name: "", icon: "🎯", target_amount: "", saved_amount: "", target_date: "" };

const fmt = n => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const niceDate = s => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const inputClass = `w-full px-3 py-2.5 rounded-xl text-sm
  bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10
  text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600
  focus:outline-none focus:border-brand-400 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-400/20 transition-all`;
const labelClass = "block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5";

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5">
          <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(null);      // null = closed, object = create/edit form
  const [editId, setEditId] = useState(null);
  const [money, setMoney] = useState(null);    // { goal, amount }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { const { data } = await api.get("/goals"); setGoals(data); } catch { setError("Could not load goals"); }
    finally { setLoaded(true); }
  };
  useEffect(() => {
    api.get("/goals").then(res => setGoals(res.data)).catch(() => setError("Could not load goals")).finally(() => setLoaded(true));
  }, []);

  const openNew = () => { setForm(EMPTY); setEditId(null); setError(""); };
  const openEdit = g => {
    setForm({ name: g.name, icon: g.icon, target_amount: g.target_amount, saved_amount: "", target_date: g.target_date || "" });
    setEditId(g.id); setError("");
  };

  const saveGoal = async () => {
    if (!form.name.trim() || !(Number(form.target_amount) > 0)) { setError("Give your goal a name and a target amount."); return; }
    setBusy(true); setError("");
    try {
      const body = { name: form.name, icon: form.icon, target_amount: Number(form.target_amount), target_date: form.target_date || null };
      if (editId) await api.put(`/goals/${editId}`, body);
      else await api.post("/goals", { ...body, saved_amount: Number(form.saved_amount) || 0 });
      setForm(null); load();
    } catch (err) { setError(err.response?.data?.message || "Something went wrong"); }
    finally { setBusy(false); }
  };

  const contribute = async (sign) => {
    const amount = Number(money.amount);
    if (!(amount > 0)) { setError("Enter an amount greater than 0."); return; }
    setBusy(true); setError("");
    try {
      await api.post(`/goals/${money.goal.id}/contribute`, { amount: sign * amount });
      setMoney(null); load();
    } catch (err) { setError(err.response?.data?.message || "Something went wrong"); }
    finally { setBusy(false); }
  };

  const remove = async g => {
    if (!confirm(`Delete the goal "${g.name}"?`)) return;
    await api.delete(`/goals/${g.id}`); load();
  };

  const active = goals.filter(g => !g.completed);
  const totalSaved = active.reduce((s, g) => s + g.saved_amount, 0);
  const totalTarget = active.reduce((s, g) => s + g.target_amount, 0);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Savings Goals</h1>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Save up for what matters, one step at a time</p>
          </div>
          <button onClick={openNew}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 active:scale-95 transition-all shadow-lg shadow-brand-500/25">
            + New goal
          </button>
        </div>

        {error && !form && !money && (
          <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-500 text-sm">{error}</div>
        )}

        {active.length > 0 && (
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Saved towards active goals</p>
              <p className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                {fmt(totalSaved)} <span className="text-sm font-normal text-slate-400">of {fmt(totalTarget)}</span>
              </p>
            </div>
            <span className="text-2xl font-bold font-mono text-brand-500">{totalTarget ? Math.round((totalSaved / totalTarget) * 100) : 0}%</span>
          </div>
        )}

        {!loaded ? (
          <div className="card py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : goals.length === 0 ? (
          <div className="card py-14 text-center">
            <p className="text-4xl mb-2">🎯</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">No goals yet.</p>
            <p className="text-xs text-slate-400 mt-1">Create one — a laptop, a trip, an emergency fund.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {goals.map(g => (
              <div key={g.id} className={`card p-5 ${g.completed ? "ring-1 ring-emerald-400/40" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center text-xl shrink-0">{g.icon}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{g.name}</p>
                      <p className="text-xs text-slate-400">
                        {g.completed ? "Completed 🎉"
                          : g.target_date
                            ? `${niceDate(g.target_date)} · ${g.days_left < 0 ? `${Math.abs(g.days_left)} days overdue` : g.days_left === 0 ? "due today" : `${g.days_left} days left`}`
                            : "No deadline"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(g)} className="text-xs px-2 py-1 rounded-lg text-slate-400 hover:text-brand-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">Edit</button>
                    <button onClick={() => remove(g)} aria-label="Delete goal" className="text-xs px-2 py-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all">✕</button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-end justify-between mb-1.5">
                    <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">{fmt(g.saved_amount)}</span>
                    <span className="text-xs text-slate-400">of {fmt(g.target_amount)} · {g.percent}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${g.percent}%`, background: g.completed ? "#10d9a0" : "#7c5cfc" }} />
                  </div>
                  {!g.completed && g.monthly_needed !== null && (
                    <p className="text-[11px] text-slate-400 mt-2">Save about <span className="font-semibold text-brand-500">{fmt(g.monthly_needed)}</span> a month to get there on time</p>
                  )}
                </div>

                <button onClick={() => { setMoney({ goal: g, amount: "" }); setError(""); }}
                  className="mt-4 w-full py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-brand-400 hover:text-brand-500 transition-all">
                  + Add or withdraw money
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {form && (
        <Modal title={editId ? "Edit goal" : "New savings goal"} onClose={() => setForm(null)}>
          <div className="px-6 py-5 space-y-4">
            {error && <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-500 text-sm">{error}</div>}
            <div>
              <label className={labelClass}>Goal name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. New laptop" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Icon</label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(i => (
                  <button key={i} type="button" onClick={() => setForm({ ...form, icon: i })}
                    className={`w-9 h-9 rounded-lg text-lg transition-all ${form.icon === i ? "bg-brand-500/15 ring-2 ring-brand-500" : "bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10"}`}>{i}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Target (₹)</label>
                <input type="number" min="0" value={form.target_amount} onChange={e => setForm({ ...form, target_amount: e.target.value })} placeholder="50000" className={inputClass} />
              </div>
              {!editId && (
                <div>
                  <label className={labelClass}>Already saved (₹)</label>
                  <input type="number" min="0" value={form.saved_amount} onChange={e => setForm({ ...form, saved_amount: e.target.value })} placeholder="0" className={inputClass} />
                </div>
              )}
            </div>
            <div>
              <label className={labelClass}>Target date (optional)</label>
              <input type="date" value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-slate-100 dark:border-white/5">
            <button onClick={() => setForm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">Cancel</button>
            <button onClick={saveGoal} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 active:scale-95 disabled:opacity-60 transition-all shadow-lg shadow-brand-500/20">
              {busy ? "Saving…" : editId ? "Update" : "Create goal"}
            </button>
          </div>
        </Modal>
      )}

      {money && (
        <Modal title={`${money.goal.icon} ${money.goal.name}`} onClose={() => setMoney(null)}>
          <div className="px-6 py-5 space-y-4">
            {error && <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-500 text-sm">{error}</div>}
            <p className="text-xs text-slate-400">Saved so far: <span className="font-mono text-slate-600 dark:text-slate-300">{fmt(money.goal.saved_amount)}</span> of {fmt(money.goal.target_amount)}</p>
            <div>
              <label className={labelClass}>Amount (₹)</label>
              <input type="number" min="0" autoFocus value={money.amount} onChange={e => setMoney({ ...money, amount: e.target.value })} placeholder="0" className={inputClass} />
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-slate-100 dark:border-white/5">
            <button onClick={() => contribute(-1)} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-60 transition-all">Withdraw</button>
            <button onClick={() => contribute(1)} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 active:scale-95 disabled:opacity-60 transition-all shadow-lg shadow-brand-500/20">Add money</button>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
