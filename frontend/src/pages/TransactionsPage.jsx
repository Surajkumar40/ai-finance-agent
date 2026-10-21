import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import api from "../api/axios";
import { downloadCSV } from "../utils/csv";
import ImportCSV from "../components/ImportCSV";
import VoiceEntry from "../components/VoiceEntry";
import { localToday } from "../utils/voiceParse";
import { fmt as money, useCurrency, symbol } from "../utils/currency";

const EMPTY_FORM = {
  title: "", amount: "", type: "expense",
  category_id: "", date: "", note: "",
};

const inputClass = `w-full px-3 py-2.5 rounded-xl text-sm
  bg-slate-100 dark:bg-white/5
  border border-slate-200 dark:border-white/10
  text-slate-900 dark:text-white
  placeholder-slate-400 dark:placeholder-slate-600
  focus:outline-none focus:border-brand-400 dark:focus:border-brand-500
  focus:ring-2 focus:ring-brand-400/20 transition-all`;

// Shrinks a phone photo to <=1600px JPEG so uploads are small and fast
async function fileToDataUrl(file, maxSide = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

const MAX_BULK = 500; // the most the server changes in one go
const PAGE = 50; // rows drawn at a time, so a long history does not slow the page down
const RANGES = [
  { id: "all", label: "All time" }, { id: "month", label: "This month" }, { id: "last", label: "Last month" },
  { id: "90", label: "Last 90 days" }, { id: "year", label: "This year" },
];
const SORTS = [
  { id: "new", label: "Newest first" }, { id: "old", label: "Oldest first" },
  { id: "high", label: "Largest amount" }, { id: "low", label: "Smallest amount" },
];
// Ties always fall back to newest first, so the order is the same every time.
const bySort = id => (a, b) => {
  const byDate = dayOf(b.date) < dayOf(a.date) ? -1 : dayOf(b.date) > dayOf(a.date) ? 1 : b.id - a.id;
  if (id === "old") return -byDate;
  if (id === "high") return parseFloat(b.amount) - parseFloat(a.amount) || byDate;
  if (id === "low") return parseFloat(a.amount) - parseFloat(b.amount) || byDate;
  return byDate;
};
const ymdLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayOf = v => String(v).slice(0, 10);
const showDate = v => { const [y, m, d] = dayOf(v).split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN"); }; // not new Date(text): that shifts the day west of UTC
// [start, end) as YYYY-MM-DD text, in the visitor's own calendar
function rangeStart(id) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  if (id === "month") return { start: ymdLocal(new Date(y, m, 1)), end: ymdLocal(new Date(y, m + 1, 1)) };
  if (id === "last") return { start: ymdLocal(new Date(y, m - 1, 1)), end: ymdLocal(new Date(y, m, 1)) };
  if (id === "90") return { start: ymdLocal(new Date(y, m, n.getDate() - 90)), end: ymdLocal(new Date(y, m, n.getDate() + 1)) };
  if (id === "year") return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
  return null;
}

export default function TransactionsPage() {
  useCurrency();
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [range, setRange] = useState("all");
  const [catFilter, setCatFilter] = useState("all"); // "all" | "none" (no category) | a category id
  const [sortBy, setSortBy] = useState("new");
  const [limit, setLimit] = useState(PAGE); // rows shown; "Show more" adds another page
  const [selected, setSelected] = useState(() => new Set()); // ids ticked for a bulk action
  const [bulkAsk, setBulkAsk] = useState(false); // "Delete N? Yes / No" is showing
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const allBox = useRef(null);
  const [undo, setUndo] = useState(null);       // { rows, text } for the "Undo" bar after a delete
  const undoTimer = useRef(null);
  useEffect(() => () => clearTimeout(undoTimer.current), []);
  // Changing what is shown also clears the ticks, so a bulk action never touches rows you can no longer see.
  const resetView = () => { setLimit(PAGE); setSelected(new Set()); setBulkAsk(false); };
  const [scanning, setScanning] = useState(false);

  const fetchAll = async () => {
    const [txRes, catRes] = await Promise.all([
      api.get("/transactions"),
      api.get("/categories"),
    ]);
    setTransactions(txRes.data);
    setCategories(catRes.data);
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
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
    } catch { /* auto-category is a nicety; ignore failures */ }
  }

  const openAdd = () => { setForm({ ...EMPTY_FORM, date: localToday() }); setEditId(null); setError(""); setShowModal(true); };
  const openEdit = (t) => {
    setForm({ title: t.title, amount: t.amount, type: t.type, category_id: t.category_id || "", date: t.date?.split("T")[0] || "", note: t.note || "" });
    setEditId(t.id); setError(""); setShowModal(true);
  };

  // What a deleted transaction needs to be put back exactly as it was.
  const keepForUndo = t => ({ title: t.title, amount: Number(t.amount), type: t.type, category_id: t.category_id || null, date: dayOf(t.date), note: t.note || null, is_recurring: !!t.is_recurring });
  const offerUndo = (rows, text) => {
    clearTimeout(undoTimer.current);
    setUndo({ rows, text });
    undoTimer.current = setTimeout(() => setUndo(null), 15000);
  };
  const handleDelete = async (id) => {
    if (!confirm("Delete this transaction?")) return;
    const gone = transactions.find(t => t.id === id);
    try {
      await api.delete(`/transactions/${id}`);
      if (gone) offerUndo([keepForUndo(gone)], `Deleted "${gone.title}".`);
    } catch { setBulkMsg("Could not delete it."); }
    fetchAll();
  };
  const doUndo = async () => {
    if (!undo) return;
    const { rows } = undo;
    clearTimeout(undoTimer.current); setUndo(null);
    try {
      const { data } = await api.post("/transactions/bulk/restore", { rows });
      setBulkMsg(`Restored ${data.restored} transaction${data.restored === 1 ? "" : "s"}.`);
      await fetchAll();
    } catch (err) { setBulkMsg(err.response?.data?.message || "Could not restore them."); }
  };

  const handleReceipt = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true); setError("");
    try {
      const image = await fileToDataUrl(file);
      const { data } = await api.post("/receipts/scan", { image });
      setForm(f => ({
        ...f, title: data.title, amount: data.amount, type: data.type, date: data.date,
        category_id: data.category_id || f.category_id, note: f.note || "Scanned from receipt",
      }));
    } catch (err) {
      setError(err.response?.data?.message || "Could not read this image. Try a clear JPG or PNG photo.");
    } finally { setScanning(false); }
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

  const fmt = (n) => money(n, 0);

  const from = rangeStart(range);
  const q = search.trim().toLowerCase();
  const filtered = transactions
    .filter(t => filter === "all" || t.type === filter)
    .filter(t => !from || dayOf(t.date) >= from.start && dayOf(t.date) < from.end)
    .filter(t => catFilter === "all" || (catFilter === "none" ? !t.category_id : String(t.category_id) === catFilter))
    .filter(t => !q || t.title?.toLowerCase().includes(q) || t.category_name?.toLowerCase().includes(q) || t.note?.toLowerCase().includes(q))
    .sort(bySort(sortBy));
  const shown = filtered.slice(0, limit);
  const sumOf = type => filtered.filter(t => t.type === type).reduce((s, t) => s + parseFloat(t.amount), 0);
  const isFiltered = filter !== "all" || range !== "all" || catFilter !== "all" || q !== "";

  const pickedIds = transactions.filter(t => selected.has(t.id)).map(t => t.id); // ticks of rows that still exist
  const pickedCount = pickedIds.length;
  const shownIds = shown.map(t => t.id);
  const allShownPicked = shownIds.length > 0 && shownIds.every(id => selected.has(id));
  const toggleOne = id => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleShown = () => setSelected(prev => { const n = new Set(prev); if (allShownPicked) shownIds.forEach(id => n.delete(id)); else shownIds.forEach(id => n.add(id)); return n; });
  const pickAllMatching = () => setSelected(new Set(filtered.slice(0, MAX_BULK).map(t => t.id)));
  const clearPicked = () => { setSelected(new Set()); setBulkAsk(false); };
  useEffect(() => { if (allBox.current) allBox.current.indeterminate = pickedCount > 0 && !allShownPicked; }, [pickedCount, allShownPicked]);

  const bulkDelete = async () => {
    setBulkBusy(true); setBulkMsg("");
    try {
      const gone = transactions.filter(t => selected.has(t.id)).map(keepForUndo);
      const { data } = await api.post("/transactions/bulk/delete", { ids: pickedIds });
      if (data.deleted > 0) offerUndo(gone, `Deleted ${data.deleted} transaction${data.deleted === 1 ? "" : "s"}.`);
      clearPicked(); await fetchAll();
    } catch (err) { setBulkMsg(err.response?.data?.message || "Could not delete them."); }
    finally { setBulkBusy(false); }
  };
  const bulkCategory = async value => {
    if (value === "") return;
    setBulkBusy(true); setBulkMsg("");
    try {
      const { data } = await api.post("/transactions/bulk/category", { ids: pickedIds, category_id: value === "none" ? null : Number(value) });
      setBulkMsg(`Changed the category of ${data.updated} transaction${data.updated === 1 ? "" : "s"}.`);
      clearPicked(); await fetchAll();
    } catch (err) { setBulkMsg(err.response?.data?.message || "Could not change the category."); }
    finally { setBulkBusy(false); }
  };

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
          <div className="flex flex-wrap gap-2">
            <VoiceEntry categories={categories} onSaved={fetchAll} />
            <ImportCSV transactions={transactions} categories={categories} onDone={fetchAll} />
            <button onClick={() => downloadCSV(filtered)} disabled={filtered.length === 0}
              title="Download the transactions shown below as a spreadsheet file"
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-white/10
                         text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40 transition-all">
              Export CSV
            </button>
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white
                         bg-brand-500 hover:bg-brand-600 active:scale-95 transition-all shadow-lg shadow-brand-500/25">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              Add Transaction
            </button>
          </div>
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
            <input value={search} onChange={e => { setSearch(e.target.value); resetView(); }}
              placeholder="Search transactions…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm bg-white dark:bg-[#16161f]
                         border border-slate-200 dark:border-white/10
                         text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600
                         focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20 transition-all" />
          </div>
          <div className="flex gap-2">
            {["all","income","expense"].map(f => (
              <button key={f} onClick={() => { setFilter(f); resetView(); }}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                  filter === f
                    ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25"
                    : "bg-white dark:bg-[#16161f] border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-brand-300"
                }`}>
                {f}
              </button>
            ))}
          </div>
          <select value={range} onChange={e => { setRange(e.target.value); resetView(); }} aria-label="Show transactions from"
            className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#16161f] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-brand-400">
            {RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-2 -mt-2">
          <select value={catFilter} onChange={e => { setCatFilter(e.target.value); resetView(); }} aria-label="Filter by category"
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-[#16161f] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-brand-400 max-w-full">
            <option value="all">All categories</option>
            <option value="none">No category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={sortBy} onChange={e => { setSortBy(e.target.value); resetView(); }} aria-label="Sort transactions"
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-[#16161f] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-brand-400">
            {SORTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          {isFiltered && (
            <button onClick={() => { setSearch(""); setFilter("all"); setRange("all"); setCatFilter("all"); resetView(); }}
              className="px-3 py-2 rounded-xl text-xs font-medium text-brand-500 hover:text-brand-600">Clear filters</button>
          )}
        </div>

        {isFiltered && filtered.length > 0 && (
          <p className="text-xs text-slate-400" aria-live="polite">
            {filtered.length} of {transactions.length} shown · income <span className="font-mono text-emerald-500">{fmt(sumOf("income"))}</span> · expenses <span className="font-mono text-red-400">{fmt(sumOf("expense"))}</span>
          </p>
        )}

        {undo && (
          <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-4 py-3 rounded-xl bg-slate-900 text-white text-sm shadow-2xl max-w-[92vw]">
            <span className="truncate">{undo.text}</span>
            <button onClick={doUndo} className="font-semibold text-brand-300 hover:text-white shrink-0">Undo</button>
            <button onClick={() => { clearTimeout(undoTimer.current); setUndo(null); }} aria-label="Dismiss" className="opacity-60 hover:opacity-100 shrink-0">✕</button>
          </div>
        )}

        {bulkMsg && (
          <div role="status" className="flex items-center justify-between px-4 py-3 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 text-sm text-brand-600 dark:text-brand-400">
            <span>{bulkMsg}</span><button onClick={() => setBulkMsg("")} aria-label="Dismiss" className="text-xs opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {pickedCount > 0 && (
          <div role="region" aria-label="Bulk actions" className="sticky top-2 z-10 flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl bg-white dark:bg-[#1c1c28] border border-brand-200 dark:border-brand-500/30 shadow-lg">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{pickedCount} selected</span>
            {allShownPicked && pickedCount < Math.min(filtered.length, MAX_BULK) && (
              <button onClick={pickAllMatching} className="text-xs font-semibold text-brand-500 hover:text-brand-600">
                Select {filtered.length > MAX_BULK ? `the first ${MAX_BULK}` : `all ${filtered.length}`} that match
              </button>
            )}
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <select aria-label="Change category of the selected" value="" disabled={bulkBusy} onChange={e => bulkCategory(e.target.value)}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300">
                <option value="">Change category…</option>
                <option value="none">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {bulkAsk ? (
                <span className="flex items-center gap-2 text-xs text-red-500">
                  Delete {pickedCount}? This cannot be undone.
                  <button onClick={bulkDelete} disabled={bulkBusy} className="px-3 py-1.5 rounded-lg font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50">Yes</button>
                  <button onClick={() => setBulkAsk(false)} className="px-3 py-1.5 rounded-lg font-semibold border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300">No</button>
                </span>
              ) : (
                <button onClick={() => setBulkAsk(true)} disabled={bulkBusy}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-red-500 border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50">Delete</button>
              )}
              <button onClick={clearPicked} className="px-3 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">Clear</button>
            </div>
          </div>
        )}

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
                    <th className="pl-5 pr-0 py-3.5 w-8">
                      <input ref={allBox} type="checkbox" checked={allShownPicked} onChange={toggleShown} aria-label="Select all shown transactions"
                        className="w-4 h-4 rounded accent-brand-500 cursor-pointer" />
                    </th>
                    {["Title", "Category", "Date", "Type", "Amount", ""].map(h => (
                      <th key={h} className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                  {shown.map(t => (
                    <tr key={t.id} className={`hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group ${selected.has(t.id) ? "bg-brand-50/60 dark:bg-brand-500/5" : ""}`}>
                      <td className="pl-5 pr-0 py-3.5 w-8">
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} aria-label={`Select ${t.title}`}
                          className="w-4 h-4 rounded accent-brand-500 cursor-pointer" />
                      </td>
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
                        {showDate(t.date)}
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
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
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

        {filtered.length > shown.length && (
          <div className="flex justify-center">
            <button onClick={() => setLimit(l => l + PAGE)}
              className="px-5 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
              Show more ({filtered.length - shown.length} more)
            </button>
          </div>
        )}
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

              {!editId && (
                <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed text-sm font-medium cursor-pointer transition-all
                  ${scanning ? "opacity-60 cursor-wait" : "hover:border-brand-400 hover:text-brand-500"}
                  border-slate-300 dark:border-white/15 text-slate-500 dark:text-slate-400`}>
                  <input type="file" accept="image/*" className="hidden" onChange={handleReceipt} disabled={scanning} />
                  {scanning ? "Reading receipt…" : "📷 Scan a receipt to auto-fill"}
                </label>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Title</label>
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                  onBlur={e => autoCategory(e.target.value)}
                  placeholder="e.g. Grocery run" className={inputClass} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Amount ({symbol()})</label>
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