import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import api from "../api/axios";

const today = () => new Date().toLocaleDateString("en-CA");
const EMPTY = { title: "", amount: "", type: "expense", frequency: "monthly", category_id: "", next_due: today(), notes: "" };
const FREQ = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
const PER_MONTH = { daily: 30.44, weekly: 4.345, monthly: 1, yearly: 1 / 12 };

const fmt = n => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const parseYMD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const niceDate = s => parseYMD(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const dueIn = s => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const days = Math.round((parseYMD(s) - t) / 86400000);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
};

const inputClass = `w-full px-3 py-2.5 rounded-xl text-sm
  bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10
  text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600
  focus:outline-none focus:border-brand-400 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-400/20 transition-all`;
const labelClass = "block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5";

export default function RecurringPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    try {
      const [r, c] = await Promise.all([api.get("/recurring"), api.get("/categories")]);
      setItems(r.data); setCategories(c.data);
    } catch { setNotice("Could not load recurring transactions"); }
    finally { setLoaded(true); }
  };
  useEffect(() => {
    Promise.all([api.get("/recurring"), api.get("/categories")])
      .then(([r, c]) => { setItems(r.data); setCategories(c.data); })
      .catch(() => setNotice("Could not load recurring transactions"))
      .finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    if (!form.title.trim() || !(Number(form.amount) > 0) || !form.next_due) {
      setError("Title, a positive amount and a start date are required."); return;
    }
    setSaving(true); setError("");
    try {
      const { data } = await api.post("/recurring", { ...form, amount: Number(form.amount), category_id: form.category_id || null });
      setShowModal(false);
      setNotice(data.created_now ? `Saved — ${data.created_now} transaction(s) were added right away.` : "Saved — it will be added automatically on its due date.");
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    } finally { setSaving(false); }
  };

  const toggle = async (it) => {
    setItems(list => list.map(x => x.id === it.id ? { ...x, is_active: !x.is_active } : x));
    try { await api.put(`/recurring/${it.id}`, { is_active: !it.is_active }); }
    catch { load(); }
  };
  const remove = async (it) => {
    if (!confirm(`Delete "${it.title}"? Past transactions it created will stay.`)) return;
    await api.delete(`/recurring/${it.id}`); load();
  };
  const runNow = async () => {
    try {
      const { data } = await api.post("/recurring/run");
      setNotice(data.created ? `Added ${data.created} due transaction(s).` : "Nothing is due right now.");
      load();
    } catch { setNotice("Could not run recurring transactions"); }
  };

  const monthly = type => items.filter(i => i.is_active && i.type === type)
    .reduce((s, i) => s + Number(i.amount) * PER_MONTH[i.frequency], 0);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Recurring</h1>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Rent, subscriptions, salary — added automatically on their due date</p>
          </div>
          <div className="flex gap-2">
            <button onClick={runNow}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
              Run due now
            </button>
            <button onClick={() => { setForm(EMPTY); setError(""); setShowModal(true); }}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 active:scale-95 transition-all shadow-lg shadow-brand-500/25">
              + Add recurring
            </button>
          </div>
        </div>

        {notice && (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 text-sm text-brand-600 dark:text-brand-400">
            <span>{notice}</span>
            <button onClick={() => setNotice("")} className="text-xs opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Fixed expenses / month</p>
            <p className="text-xl font-bold font-mono text-red-400 mt-1">{fmt(monthly("expense"))}</p>
          </div>
          <div className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Regular income / month</p>
            <p className="text-xl font-bold font-mono text-emerald-500 mt-1">{fmt(monthly("income"))}</p>
          </div>
        </div>

        <div className="card divide-y divide-slate-100 dark:divide-white/5">
          {!loaded ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-3xl mb-2">🔁</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">No recurring transactions yet.</p>
              <p className="text-xs text-slate-400 mt-1">Add your rent, Netflix or salary and never enter them by hand again.</p>
            </div>
          ) : items.map(it => (
            <div key={it.id} className={`flex items-center gap-3 px-4 py-3.5 ${it.is_active ? "" : "opacity-50"}`}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                style={{ background: (it.category_color || "#7c5cfc") + "22" }}>
                {it.category_icon || (it.type === "income" ? "↑" : "↓")}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{it.title}</p>
                <p className="text-xs text-slate-400">
                  {FREQ[it.frequency]} · {it.category_name || "No category"} ·{" "}
                  {it.is_active ? <>next {niceDate(it.next_due)} <span className="text-brand-500">({dueIn(it.next_due)})</span></> : "paused"}
                </p>
              </div>
              <span className={`text-sm font-semibold font-mono ${it.type === "income" ? "text-emerald-500" : "text-red-400"}`}>
                {it.type === "income" ? "+" : "-"}{fmt(it.amount)}
              </span>
              <button onClick={() => toggle(it)} title={it.is_active ? "Pause" : "Resume"}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-brand-400 hover:text-brand-500 transition-all">
                {it.is_active ? "Pause" : "Resume"}
              </button>
              <button onClick={() => remove(it)} title="Delete"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5">
              <h3 className="font-semibold text-slate-900 dark:text-white">Add recurring transaction</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {error && <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-500 dark:text-red-400 text-sm">{error}</div>}
              <div>
                <label className={labelClass}>Title</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. House rent" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Amount (₹)</label>
                  <input type="number" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputClass}>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Repeats</label>
                  <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className={inputClass}>
                    {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Category</label>
                  <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className={inputClass}>
                    <option value="">— None —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>First due date</label>
                <input type="date" value={form.next_due} onChange={e => setForm({ ...form, next_due: e.target.value })} className={inputClass} />
                <p className="text-[11px] text-slate-400 mt-1.5">Today or an earlier date is added immediately (missed months are caught up).</p>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 dark:border-white/5">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={save} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 active:scale-95 disabled:opacity-60 transition-all shadow-lg shadow-brand-500/20">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
