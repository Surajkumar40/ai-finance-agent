import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import api from "../api/axios";

const EMPTY_FORM = {
  title: "", amount: "", type: "expense",
  category_id: "", date: new Date().toISOString().split("T")[0], note: "",
};

const inputClass = `w-full px-3 py-2.5 rounded-xl text-sm
  bg-slate-100 dark:bg-white/5
  border border-slate-200 dark:border-white/10
  text-slate-900 dark:text-white
  placeholder-slate-400 dark:placeholder-slate-600
  focus:outline-none focus:border-brand-400 dark:focus:border-brand-500
  focus:ring-2 focus:ring-brand-400/20 transition-all`;

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const fetchAll = async () => {
    const [txRes, catRes] = await Promise.all([
      api.get("/transactions"),
      api.get("/categories"),
    ]);
    setTransactions(txRes.data);
    setCategories(catRes.data);
  };

  useEffect(() => { fetchAll(); }, []);

  async function autoCategory(desc) {
    if (!desc || form.category_id) return;
    try {
      const { data } = await api.post("/ai/categorise", {
        description: desc,
        categories: categories.map(c => ({ id: c.id, name: c.name })),
      });
      const matched = categories.find(c => c.name.toLowerCase() === data.category?.toLowerCase());
      if (matched) setForm(f => ({ ...f, category_id: matched.id }));
    } catch { }
  }

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setError(""); setShowModal(true); };
  const openEdit = (t) => {
    setForm({ title: t.title, amount: t.amount, type: t.type, category_id: t.category_id || "", date: t.date?.split("T")[0] || "", note: t.note || "" });
    setEditId(t.id); setError(""); setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this transaction?")) return;
    await api.delete(`/transactions/${id}`);
    fetchAll();
  };

  const handleSubmit = async () => {
    if (!form.title || !form.amount || !form.date) { setError("Title, amount and date are required."); return; }
    setLoading(true);
    try {
      if (editId) await api.put(`/transactions/${editId}`, form);
      else await api.post("/transactions", form);
      setShowModal(false); fetchAll();
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    } finally { setLoading(false); }
  };

  const fmt = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  const filtered = transactions
    .filter(t => filter === "all" || t.type === filter)
    .filter(t => t.title?.toLowerCase().includes(search.toLowerCase()) ||
                 t.category_name?.toLowerCase().includes(search.toLowerCase()));

  const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + parseFloat(t.amount), 0);
  const totalExpense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + parseFloat(t.amount), 0);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Transactions</h1>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">{transactions.length} total records</p>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white
                       bg-brand-500 hover:bg-brand-600 active:scale-95 transition-all shadow-lg shadow-brand-500/25">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            Add Transaction
          </button>
        </div>

        {/* Summary pills */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
            <span className="text-emerald-500 text-xs">↑</span>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Income</span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">{fmt(totalIncome)}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
            <span className="text-red-400 text-xs">↓</span>
            <span className="text-xs font-medium text-red-500 dark:text-red-400">Expenses</span>
            <span className="text-xs font-bold text-red-500 dark:text-red-400 font-mono">{fmt(totalExpense)}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20">
            <span className="text-xs font-medium text-brand-600 dark:text-brand-400">Balance</span>
            <span className="text-xs font-bold text-brand-600 dark:text-brand-400 font-mono">{fmt(totalIncome - totalExpense)}</span>
          </div>
        </div>

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search transactions…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white dark:bg-[#16161f]
                         border border-slate-200 dark:border-white/10
                         text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600
                         focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20 transition-all" />
          </div>
          <div className="flex gap-2">
            {["all","income","expense"].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                  filter === f
                    ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25"
                    : "bg-white dark:bg-[#16161f] border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-brand-300"
                }`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/5 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-600">
              <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5"/>
                <path d="M14 21h7M17.5 17.5 21 21"/>
              </svg>
              <p className="text-sm font-medium">No transactions found</p>
              <p className="text-xs mt-1">Try adding one or changing your filter</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/5">
                    {["Title", "Category", "Date", "Type", "Amount", ""].map(h => (
                      <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                  {filtered.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${
                            t.type === "income" ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-red-50 dark:bg-red-500/10"
                          }`}>
                            {t.type === "income" ? "↑" : "↓"}
                          </div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t.title}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium"
                          style={{ background: (t.category_color || "#7c5cfc") + "18", color: t.category_color || "#7c5cfc" }}>
                          {t.category_name || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-500 dark:text-slate-400 font-mono">
                        {new Date(t.date).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${
                          t.type === "income"
                            ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400"
                        }`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-sm font-bold font-mono ${
                          t.type === "income" ? "text-emerald-500" : "text-red-400"
                        }`}>
                          {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(t)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium
                                       text-brand-500 bg-brand-50 dark:bg-brand-500/10
                                       hover:bg-brand-100 dark:hover:bg-brand-500/20 transition-all">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(t.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium
                                       text-red-500 bg-red-50 dark:bg-red-500/10
                                       hover:bg-red-100 dark:hover:bg-red-500/20 transition-all">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white dark:bg-[#16161f]
                          border border-slate-100 dark:border-white/10
                          rounded-2xl shadow-2xl animate-slide-up"
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-white/5">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {editId ? "Edit Transaction" : "New Transaction"}
              </h3>
              <button onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center
                           text-slate-400 hover:text-slate-600 dark:hover:text-slate-200
                           hover:bg-slate-100 dark:hover:bg-white/10 transition-all">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-500 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Title</label>
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                  onBlur={e => autoCategory(e.target.value)}
                  placeholder="e.g. Grocery run" className={inputClass} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Amount (₹)</label>
                  <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})}
                    placeholder="0" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Type</label>
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className={inputClass}>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Category</label>
                  <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className={inputClass}>
                    <option value="">— None —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Date</label>
                  <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Note (optional)</label>
                <input value={form.note} onChange={e => setForm({...form, note: e.target.value})}
                  placeholder="Any extra details…" className={inputClass} />
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 dark:border-white/5">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-white/10
                           text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white
                           bg-brand-500 hover:bg-brand-600 active:scale-95
                           disabled:opacity-60 transition-all shadow-lg shadow-brand-500/20">
                {loading ? "Saving…" : editId ? "Update" : "Add Transaction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}