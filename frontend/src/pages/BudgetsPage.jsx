import { useCallback, useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import api from "../api/axios";

const fmt = n => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// ---- month helpers (month is always "YYYY-MM") ----
const pad = n => String(n).padStart(2, "0");
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const shiftMonth = (m, delta) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const monthLabel = m => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};
// Where you "should" be in the month: today's share of the days (null for future months)
const pacePercent = m => {
  const now = thisMonth();
  if (m < now) return 100;
  if (m > now) return null;
  const [y, mo] = m.split("-").map(Number);
  return (new Date().getDate() / new Date(y, mo, 0).getDate()) * 100;
};

function colorsFor(pct) {
  if (pct >= 100) return { bar: "bg-red-500", text: "text-red-500" };
  if (pct >= 80) return { bar: "bg-amber-400", text: "text-amber-500" };
  return { bar: "bg-brand-500", text: "text-brand-500" };
}

const inputClass = `w-full px-3 py-2.5 rounded-xl text-sm
  bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10
  text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600
  focus:outline-none focus:border-brand-400 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-400/20 transition-all`;
const labelClass = "block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5";

export default function BudgetsPage() {
  const [month, setMonth] = useState(thisMonth());
  const [budgets, setBudgets] = useState([]);
  const [unbudgeted, setUnbudgeted] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(null); // null | { id?, category_id, monthly_limit, name? }
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    try {
      const [b, u, c] = await Promise.all([
        api.get("/budgets", { params: { month } }),
        api.get("/budgets/unbudgeted", { params: { month } }),
        api.get("/categories"),
      ]);
      if (id !== reqId.current) return; // a newer month was picked meanwhile
      setBudgets(b.data);
      setUnbudgeted(u.data);
      setCategories(c.data);
      setError("");
    } catch {
      if (id === reqId.current) setError("Could not load budgets. Please try again.");
    } finally {
      if (id === reqId.current) setLoaded(true);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const goToMonth = delta => { setLoaded(false); setNotice(""); setMonth(m => shiftMonth(m, delta)); };

  // ---- totals ----
  const totalLimit = budgets.reduce((s, b) => s + Number(b.monthly_limit), 0);
  const totalSpent = budgets.reduce((s, b) => s + Number(b.spent), 0);
  const overCount = budgets.filter(b => Number(b.spent) > Number(b.monthly_limit)).length;
  const totalPct = totalLimit ? (totalSpent / totalLimit) * 100 : 0;
  const pace = pacePercent(month);
  const budgetedIds = new Set(budgets.map(b => b.category_id));
  const availableCategories = categories.filter(c => !budgetedIds.has(c.id));

  // ---- actions ----
  const openAdd = (category_id = "") => { setModal({ category_id: String(category_id), monthly_limit: "" }); setFormError(""); };
  const openEdit = b => {
    setModal({ id: b.id, category_id: String(b.category_id), monthly_limit: String(Number(b.monthly_limit)), name: b.category_name });
    setFormError("");
  };

  const save = async () => {
    const limit = Number(modal.monthly_limit);
    if (!modal.category_id || !(limit > 0)) { setFormError("Choose a category and enter a limit above 0."); return; }
    setBusy(true); setFormError("");
    try {
      if (modal.id) await api.put(`/budgets/${modal.id}`, { monthly_limit: limit });
      else await api.post("/budgets", { category_id: Number(modal.category_id), monthly_limit: limit, month });
      setModal(null);
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || "Something went wrong");
    } finally { setBusy(false); }
  };

  const remove = async b => {
    if (!confirm(`Remove the ${b.category_name} budget for ${monthLabel(month)}?`)) return;
    try { await api.delete(`/budgets/${b.id}`); load(); }
    catch { setError("Could not delete that budget."); }
  };

  const copyPrevious = async () => {
    const prev = shiftMonth(month, -1);
    setBusy(true); setError(""); setNotice("");
    try {
      const { data } = await api.post("/budgets/copy", { from: prev, to: month });
      setNotice(data.copied
        ? `Copied ${data.copied} budget${data.copied > 1 ? "s" : ""} from ${monthLabel(prev)}.`
        : `Nothing new to copy from ${monthLabel(prev)}.`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not copy budgets.");
    } finally { setBusy(false); }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Budgets</h1>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Set a monthly limit for each category</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center card px-1 py-1">
              <button onClick={() => goToMonth(-1)} aria-label="Previous month"
                className="w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">‹</button>
              <span className="px-2 text-sm font-semibold text-slate-700 dark:text-slate-200 min-w-[130px] text-center">
                {monthLabel(month)}
              </span>
              <button onClick={() => goToMonth(1)} aria-label="Next month"
                className="w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">›</button>
            </div>
            <button onClick={() => openAdd()} disabled={!loaded}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600
                         disabled:opacity-60 active:scale-95 transition-all shadow-lg shadow-brand-500/25">
              + Set budget
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-500 text-sm">{error}</div>
        )}
        {notice && (
          <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm">{notice}</div>
        )}

        {!loaded ? (
          <div className="card py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <>
            {/* Summary */}
            {budgets.length > 0 && (
              <div className="card p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Budgeted</p>
                    <p className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">{fmt(totalLimit)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Spent</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${colorsFor(totalPct).text}`}>{fmt(totalSpent)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                      {totalSpent > totalLimit ? "Over by" : "Remaining"}
                    </p>
                    <p className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                      {fmt(Math.abs(totalLimit - totalSpent))}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Over limit</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${overCount ? "text-red-500" : "text-emerald-500"}`}>
                      {overCount} {overCount === 1 ? "category" : "categories"}
                    </p>
                  </div>
                </div>
                <div className="relative h-2.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden mt-4">
                  <div className={`h-full rounded-full transition-all duration-700 ${colorsFor(totalPct).bar}`}
                    style={{ width: `${Math.min(totalPct, 100)}%` }} />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {totalPct.toFixed(0)}% of your total budget used
                  {pace !== null && pace < 100 && ` · ${pace.toFixed(0)}% of the month has passed`}
                </p>
              </div>
            )}

            {/* Empty state */}
            {budgets.length === 0 && (
              <div className="card py-14 text-center">
                <p className="text-4xl mb-2">💰</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">No budgets for {monthLabel(month)} yet.</p>
                <p className="text-xs text-slate-400 mt-1">Set a limit for a category, or reuse last month's budgets.</p>
                <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
                  <button onClick={() => openAdd()}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 active:scale-95 transition-all">
                    + Set budget
                  </button>
                  <button onClick={copyPrevious} disabled={busy}
                    className="px-4 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300
                               hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-60 transition-all">
                    {busy ? "Copying…" : `Copy from ${monthLabel(shiftMonth(month, -1))}`}
                  </button>
                </div>
              </div>
            )}

            {/* Budget cards */}
            {budgets.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {budgets.map(b => {
                  const limit = Number(b.monthly_limit);
                  const spent = Number(b.spent);
                  const pct = limit ? (spent / limit) * 100 : 0;
                  const over = spent > limit;
                  const c = colorsFor(pct);
                  return (
                    <div key={b.id} className={`card p-5 group ${over ? "ring-1 ring-red-400/40" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center text-xl shrink-0">
                            {b.icon || "💰"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{b.category_name}</p>
                            <p className="text-xs text-slate-400">
                              {over ? "Over limit" : pct >= 80 ? "Close to the limit" : "On track"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(b)} className="px-2 py-1 text-xs text-slate-500 hover:text-brand-500">Edit</button>
                          <button onClick={() => remove(b)} className="px-2 py-1 text-xs text-slate-400 hover:text-red-500">✕</button>
                        </div>
                      </div>

                      <div className="flex items-baseline justify-between mt-4">
                        <span className={`text-lg font-bold font-mono ${c.text}`}>{fmt(spent)}</span>
                        <span className="text-xs font-mono text-slate-400">of {fmt(limit)}</span>
                      </div>

                      <div className="relative h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden mt-2">
                        <div className={`h-full rounded-full transition-all duration-700 ${c.bar}`}
                          style={{ width: `${Math.min(pct, 100)}%` }} />
                        {pace !== null && pace < 100 && (
                          <div className="absolute top-0 h-full w-0.5 bg-slate-400/70" style={{ left: `${pace}%` }} title="Where you'd be at an even pace" />
                        )}
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className="text-[11px] text-slate-400">{pct.toFixed(0)}% used</span>
                        <span className={`text-[11px] ${over ? "text-red-500 font-medium" : "text-slate-400"}`}>
                          {over ? `${fmt(spent - limit)} over` : `${fmt(limit - spent)} left`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Copy button when some budgets exist already */}
            {budgets.length > 0 && (
              <div className="flex justify-end">
                <button onClick={copyPrevious} disabled={busy}
                  className="text-xs text-slate-500 hover:text-brand-500 disabled:opacity-60 transition-colors">
                  {busy ? "Copying…" : `Add missing budgets from ${monthLabel(shiftMonth(month, -1))}`}
                </button>
              </div>
            )}

            {/* Spending without a budget */}
            {unbudgeted.length > 0 && (
              <div className="card p-5">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Spending without a budget</h2>
                <p className="text-xs text-slate-400 mt-0.5 mb-3">
                  You spent money in these categories in {monthLabel(month)}, but they have no limit.
                </p>
                <div className="space-y-2">
                  {unbudgeted.map(u => (
                    <div key={u.category_id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-white/5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base">{u.icon || "💰"}</span>
                        <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{u.category_name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-mono text-slate-500 dark:text-slate-400">{fmt(u.spent)}</span>
                        <button onClick={() => openAdd(u.category_id)}
                          className="text-xs font-semibold text-brand-500 hover:text-brand-600">Set budget</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add / edit modal */}
      {modal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/10 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {modal.id ? `Edit ${modal.name} budget` : "Set monthly budget"}
              </h3>
              <button onClick={() => setModal(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-slate-400">For {monthLabel(month)}</p>
              {!modal.id && (
                <div>
                  <label className={labelClass}>Category</label>
                  <select value={modal.category_id} onChange={e => setModal({ ...modal, category_id: e.target.value })} className={inputClass}>
                    <option value="">— Select category —</option>
                    {availableCategories.map(c => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={labelClass}>Monthly limit (₹)</label>
                <input type="number" min="1" value={modal.monthly_limit} autoFocus
                  onChange={e => setModal({ ...modal, monthly_limit: e.target.value })}
                  onKeyDown={e => e.key === "Enter" && save()}
                  placeholder="e.g. 5000" className={inputClass} />
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100 dark:border-white/5">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                Cancel
              </button>
              <button onClick={save} disabled={busy}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-60 transition-all">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}