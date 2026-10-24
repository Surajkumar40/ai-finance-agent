import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import api from "../api/axios";

const card = "bg-surface border border-slate-100 dark:border-white/5 rounded-2xl p-4 sm:p-5";
const input = `w-full px-3 py-2.5 rounded-xl text-sm bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10
  text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20`;
const label = "block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5";
const ghost = "px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-all";
const primary = "px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-brand-500/25";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#64748b"];
const ICONS = ["🐶", "🎮", "🏋️", "📚", "✈️", "🎁", "🏠", "☕", "🛒", "💊", "🎓", "🧾"];
const EMPTY = { id: null, name: "", icon: "🏷️", color: COLORS[0] };
const errText = (e, f) => e?.response?.data?.message || f;
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function usageText(c) {
  const parts = [];
  if (c.transactions) parts.push(plural(c.transactions, "transaction"));
  if (c.budgets) parts.push(plural(c.budgets, "budget"));
  if (c.recurring) parts.push(plural(c.recurring, "recurring item"));
  return parts.length ? parts.join(" · ") : "Not used yet";
}

export default function CategoriesPage() {
  const [mine, setMine] = useState([]);
  const [standard, setStandard] = useState([]);
  const [max, setMax] = useState(30);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(null); // null = closed
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [m, all] = await Promise.all([api.get("/categories/mine"), api.get("/categories")]);
      setMine(m.data.categories); setMax(m.data.max);
      setStandard(all.data.filter(c => c.user_id == null));
      setError("");
    } catch { setError("Could not load your categories. Please try again."); }
    finally { setLoaded(true); }
  }, []);
  // Loading when the page opens is exactly what an effect is for.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(EMPTY); setFormError(""); setConfirmId(null); };
  const openEdit = c => { setForm({ id: c.id, name: c.name, icon: c.icon || "🏷️", color: c.color || COLORS[0] }); setFormError(""); setConfirmId(null); };

  const save = async e => {
    e?.preventDefault();
    if (!form.name.trim()) { setFormError("Give the category a name."); return; }
    setBusy(true); setFormError(""); setNotice("");
    try {
      const body = { name: form.name, icon: form.icon, color: form.color };
      if (form.id) await api.put(`/categories/${form.id}`, body); else await api.post("/categories", body);
      setNotice(form.id ? "Category saved." : `Added ${form.name.trim()}. You can pick it when you add a transaction or a budget.`);
      setForm(null); await load();
    } catch (err) { setFormError(errText(err, "Could not save the category.")); }
    finally { setBusy(false); }
  };

  const remove = async c => {
    setBusy(true); setError(""); setNotice("");
    try { await api.delete(`/categories/${c.id}`); setNotice(`Removed ${c.name}.`); setConfirmId(null); await load(); }
    catch (err) { setError(errText(err, "Could not remove the category.")); }
    finally { setBusy(false); }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Categories</h1>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Add your own, like Pets, Gym or Hobbies, next to the standard ones.</p>
          </div>
          <button onClick={openAdd} disabled={mine.length >= max} className={primary}>+ New category</button>
        </div>

        {notice && (
          <div role="status" className="flex items-center justify-between px-4 py-3 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 text-sm text-brand-600 dark:text-brand-400">
            <span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss" className="text-xs opacity-70 hover:opacity-100">✕</button>
          </div>
        )}
        {error && <div role="alert" className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-sm text-red-600 dark:text-red-400">{error}</div>}

        {form && (
          <form onSubmit={save} className={card} aria-label={form.id ? "Edit category" : "New category"}>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">{form.id ? "Edit category" : "New category"}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem] gap-3">
              <div>
                <label htmlFor="cat-name" className={label}>Name</label>
                <input id="cat-name" className={input} value={form.name} maxLength={30} placeholder="e.g. Pet care" autoFocus
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label htmlFor="cat-icon" className={label}>Icon</label>
                <input id="cat-icon" className={`${input} text-center text-lg`} value={form.icon} aria-label="Icon (an emoji)"
                  onChange={e => setForm({ ...form, icon: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2" role="group" aria-label="Icon suggestions">
              {ICONS.map(i => (
                <button type="button" key={i} onClick={() => setForm({ ...form, icon: i })} aria-label={`Use ${i}`}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border transition-all ${form.icon === i ? "border-brand-400 bg-brand-50 dark:bg-brand-500/10" : "border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5"}`}>{i}</button>
              ))}
            </div>
            <p className={`${label} mt-4`}>Colour</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
              {COLORS.map(c => (
                <button type="button" key={c} role="radio" aria-checked={form.color === c} aria-label={`Colour ${c}`} onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full transition-all ${form.color === c ? "ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-surface scale-110" : ""}`} style={{ background: c }} />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span>Preview</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: form.color }} aria-hidden="true" />
                <span aria-hidden>{form.icon || "🏷️"}</span>{form.name.trim() || "Category"}
              </span>
            </div>
            {formError && <p role="alert" className="mt-3 text-sm text-red-500">{formError}</p>}
            <div className="flex gap-2 mt-5">
              <button type="submit" disabled={busy || !form.name.trim()} className={primary}>{busy ? "Saving…" : "Save"}</button>
              <button type="button" onClick={() => setForm(null)} className={ghost}>Cancel</button>
            </div>
          </form>
        )}

        <section className={card} aria-label="Your categories">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Your categories</h2>
            <span className="text-xs text-slate-400">{mine.length} of {max}</span>
          </div>
          {!loaded ? <p className="text-sm text-slate-400">Loading…</p> : mine.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-3xl mb-2" aria-hidden>🏷️</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">You have not added any categories yet.</p>
              <p className="text-xs text-slate-400 mt-1">Spending that does not fit the standard list gets its own place here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {mine.map(c => (
                <li key={c.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: c.color + "22" }} aria-hidden>{c.icon || "🏷️"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{c.name}</p>
                      <p className="text-xs text-slate-400">{usageText(c)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`} className={ghost}>Edit</button>
                      <button onClick={() => setConfirmId(confirmId === c.id ? null : c.id)} aria-label={`Remove ${c.name}`} className={`${ghost} hover:text-red-500`}>Remove</button>
                    </div>
                  </div>
                  {confirmId === c.id && (
                    <div className="mt-2 ml-12 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-xs text-red-600 dark:text-red-400">
                      <p>
                        Remove {c.name}?
                        {c.transactions > 0 && ` Its ${plural(c.transactions, "transaction")} will stay but have no category.`}
                        {c.budgets > 0 && ` ${plural(c.budgets, "budget")} for it will be deleted.`}
                        {c.recurring > 0 && ` ${plural(c.recurring, "recurring item")} will have no category.`}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => remove(c)} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50">Yes</button>
                        <button onClick={() => setConfirmId(null)} className={ghost}>No</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {standard.length > 0 && (
          <section className={card} aria-label="Standard categories">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Standard categories</h2>
            <p className="text-xs text-slate-400 mt-0.5 mb-3">Everyone has these. They cannot be changed.</p>
            <ul className="flex flex-wrap gap-2">
              {standard.map(c => (
                <li key={c.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color || "#6b675e" }} aria-hidden="true" />
                  <span aria-hidden>{c.icon}</span>{c.name}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Layout>
  );
}