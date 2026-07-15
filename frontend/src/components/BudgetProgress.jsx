import { useEffect, useState } from "react";
import api from "../api/axios";

const fmt = n => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function getBarColor(pct) {
  if (pct >= 100) return { bar: "bg-red-500", text: "text-red-500", bg: "bg-red-50 dark:bg-red-500/10" };
  if (pct >= 80)  return { bar: "bg-amber-400", text: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-500/10" };
  return { bar: "bg-brand-500", text: "text-brand-500", bg: "bg-brand-50 dark:bg-brand-500/10" };
}

export default function BudgetProgress() {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ category_id: "", monthly_limit: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    try {
      const [b, c] = await Promise.all([api.get("/budgets"), api.get("/categories")]);
      setBudgets(b.data);
      setCategories(c.data.filter(c => c.type === "expense" || !c.type));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function saveBudget() {
    if (!form.category_id || !form.monthly_limit) return;
    setSaving(true);
    try {
      await api.post("/budgets", form);
      setShowModal(false);
      setForm({ category_id: "", monthly_limit: "" });
      fetchAll();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function deleteBudget(id) {
    await api.delete(`/budgets/${id}`);
    fetchAll();
  }

  if (loading) return (
    <div className="card p-5 animate-pulse">
      <div className="h-4 w-32 bg-slate-100 dark:bg-white/5 rounded mb-4" />
      {[1,2,3].map(i => <div key={i} className="h-10 bg-slate-100 dark:bg-white/5 rounded-xl mb-3" />)}
    </div>
  );

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Budget Progress</h2>
          <p className="text-xs text-slate-400 mt-0.5">This month's spending vs limits</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
                     bg-brand-500 hover:bg-brand-600 text-white transition-all active:scale-95">
          + Set Budget
        </button>
      </div>

      {budgets.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-slate-400 dark:text-slate-600 mb-3">No budgets set yet</p>
          <button onClick={() => setShowModal(true)}
            className="text-xs text-brand-500 hover:text-brand-600 font-medium">
            + Set your first budget →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {budgets.map(b => {
            const pct = Math.min((parseFloat(b.spent) / parseFloat(b.monthly_limit)) * 100, 100);
            const over = parseFloat(b.spent) > parseFloat(b.monthly_limit);
            const colors = getBarColor(pct);
            return (
              <div key={b.id} className="group">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{b.icon}</span>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {b.category_name}
                    </span>
                    {over && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md
                                       bg-red-50 dark:bg-red-500/10 text-red-500">
                        Over limit
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-semibold ${colors.text}`}>
                      {fmt(b.spent)} / {fmt(b.monthly_limit)}
                    </span>
                    <button onClick={() => deleteBudget(b.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400
                                 transition-all text-xs px-1">
                      ✕
                    </button>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${colors.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-slate-400">{pct.toFixed(0)}% used</span>
                  <span className="text-[10px] text-slate-400">
                    {over
                      ? `${fmt(parseFloat(b.spent) - parseFloat(b.monthly_limit))} over`
                      : `${fmt(parseFloat(b.monthly_limit) - parseFloat(b.spent))} left`
                    }
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-white dark:bg-[#16161f]
                          border border-slate-100 dark:border-white/10 rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Set Monthly Budget</h3>
              <button onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-100 dark:bg-white/5
                             border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white
                             focus:outline-none focus:border-brand-400 transition-all">
                  <option value="">— Select category —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  Monthly Limit (₹)
                </label>
                <input type="number" value={form.monthly_limit}
                  onChange={e => setForm({...form, monthly_limit: e.target.value})}
                  placeholder="e.g. 5000"
                  className="w-full px-3 py-2.5 rounded-xl text-sm bg-slate-100 dark:bg-white/5
                             border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white
                             placeholder-slate-400 focus:outline-none focus:border-brand-400 transition-all" />
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-slate-100 dark:border-white/5">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-white/10
                           text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                Cancel
              </button>
              <button onClick={saveBudget} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
                           bg-brand-500 hover:bg-brand-600 disabled:opacity-60 transition-all">
                {saving ? "Saving…" : "Save Budget"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}