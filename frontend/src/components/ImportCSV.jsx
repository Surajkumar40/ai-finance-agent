import { useMemo, useRef, useState } from "react";
import api from "../api/axios";
import {
  MAX_ROWS, parseCSV, findHeaderRow, guessMapping, buildRows, applyKnownCategories,
} from "../utils/importCsv";

const fmt = n => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const niceDate = s => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const selectClass = `w-full px-3 py-2 rounded-xl text-sm bg-slate-100 dark:bg-white/5
  border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white
  focus:outline-none focus:border-brand-400 transition-all`;
const labelClass = "block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1";

const SAMPLE = "Date,Description,Amount\n2026-10-01,Salary,50000\n2026-10-02,Swiggy order,-350.50\n2026-10-03,Uber ride,-220\n";

function ColumnSelect({ label, value, onChange, headers, optional = true }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <select value={value} onChange={e => onChange(Number(e.target.value))} className={selectClass}>
        <option value={-1}>{optional ? "— none —" : "— choose —"}</option>
        {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </div>
  );
}

export default function ImportCSV({ transactions = [], categories = [], onDone }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("upload"); // upload | map | done
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState([]);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [map, setMap] = useState(null);
  const [dayFirst, setDayFirst] = useState(true);
  const [positiveIsExpense, setPositiveIsExpense] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [defaultCat, setDefaultCat] = useState("");
  const [aiMap, setAiMap] = useState({});
  const [ai, setAi] = useState({ running: false, msg: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const headers = rawRows[headerIdx] || [];
  const dataRows = useMemo(() => rawRows.slice(headerIdx + 1), [rawRows, headerIdx]);

  const built = useMemo(
    () => (map ? buildRows(dataRows, map, { dayFirst, positiveIsExpense }) : { rows: [], problems: [] }),
    [dataRows, map, dayFirst, positiveIsExpense]
  );

  const rows = useMemo(
    () => applyKnownCategories(built.rows, categories, transactions)
      .map(r => (r.category_id || !aiMap[r.title] ? r : { ...r, category_id: aiMap[r.title] })),
    [built.rows, categories, transactions, aiMap]
  );

  const catName = useMemo(() => new Map(categories.map(c => [c.id, c.name])), [categories]);
  const categorised = rows.filter(r => r.category_id).length;
  const uncategorised = rows.length - categorised;
  const income = rows.filter(r => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const expense = rows.filter(r => r.type === "expense").reduce((s, r) => s + r.amount, 0);
  const dates = rows.map(r => r.date).sort();
  const usingSplitColumns = map && (map.debit >= 0 || map.credit >= 0);
  const needsSignChoice = map && !usingSplitColumns && map.amount >= 0 && map.type < 0;

  const close = () => {
    const wasDone = step === "done";
    setOpen(false);
    // The dialog unmounts when closed, so reset everything right away (a delayed reset could wipe a re-opened dialog)
    setStep("upload"); setFileName(""); setRawRows([]); setMap(null); setAiMap({}); setAi({ running: false, msg: "" });
    setError(""); setResult(null); setDefaultCat(""); setDayFirst(true); setPositiveIsExpense(false); setSkipDuplicates(true);
    if (wasDone) onDone?.();
  };

  const handleFile = async e => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file) return;
    setError("");
    if (file.size > 2 * 1024 * 1024) { setError("That file is larger than 2 MB. Split it into smaller files."); return; }
    try {
      const parsed = parseCSV(await file.text());
      if (parsed.length < 2) { setError("That file looks empty. It needs a header row and at least one transaction."); return; }
      const h = findHeaderRow(parsed);
      const guess = guessMapping(parsed[h]);
      setRawRows(parsed); setHeaderIdx(h); setMap(guess); setFileName(file.name);
      setAiMap({}); setAi({ running: false, msg: "" });
      setStep("map");
    } catch {
      setError("Could not read that file. Please choose a .csv file.");
    }
  };

  const setCol = key => value => setMap(m => ({ ...m, [key]: value }));

  const runAI = async () => {
    const titles = [...new Set(rows.filter(r => !r.category_id).map(r => r.title))].slice(0, 200);
    if (!titles.length) return;
    setAi({ running: true, msg: "" });
    try {
      const { data } = await api.post("/import/categorise", { descriptions: titles });
      const got = data.mapping || {};
      const n = Object.keys(got).length;
      setAiMap(prev => ({ ...prev, ...got }));
      const leftOver = uncategorised - rows.filter(r => !r.category_id && got[r.title]).length;
      setAi({
        running: false,
        msg: n
          ? `AI matched ${n} of ${titles.length} descriptions.${data.partial ? " Some could not be checked." : ""}${leftOver > 0 && titles.length === 200 ? " Click again to continue with the rest." : ""}`
          : "The AI could not match any of them. You can set a default category below.",
      });
    } catch (err) {
      setAi({ running: false, msg: err.response?.data?.message || "AI categorising is not available right now." });
    }
  };

  const doImport = async () => {
    setBusy(true); setError("");
    try {
      const { data } = await api.post("/import/commit", {
        skip_duplicates: skipDuplicates,
        rows: rows.map(r => ({
          date: r.date, title: r.title, amount: r.amount, type: r.type,
          category_id: r.category_id || (defaultCat ? Number(defaultCat) : null),
        })),
      });
      setResult(data);
      setStep("done");
    } catch (err) {
      setError(err.response?.data?.message || "Import failed. Nothing was saved.");
    } finally { setBusy(false); }
  };

  const downloadSample = () => {
    const url = URL.createObjectURL(new Blob([SAMPLE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "sample-import.csv";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const tooMany = rows.length > MAX_ROWS;
  const canImport = rows.length > 0 && !tooMany && !busy;

  return (
    <>
      <button onClick={() => setOpen(true)}
        title="Add many transactions at once from a bank or card statement"
        className="px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-white/10
                   text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
        Import CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={close}>
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/10 shadow-2xl"
            onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">Import transactions from CSV</h3>
                {step === "map" && <p className="text-xs text-slate-400 mt-0.5">{fileName}</p>}
              </div>
              <button onClick={close} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
            </div>

            <div className="px-6 py-5 overflow-y-auto space-y-5">

              {/* ───────── Step 1: choose file ───────── */}
              {step === "upload" && (
                <div className="text-center py-6">
                  <p className="text-4xl mb-3">📄</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Choose a CSV file exported from your bank or card.</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    It needs a date, a description and an amount (or separate debit and credit columns). You can check everything before it is saved.
                  </p>
                  <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" onChange={handleFile} className="hidden" />
                  <button onClick={() => fileRef.current?.click()}
                    className="mt-5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 active:scale-95 transition-all shadow-lg shadow-brand-500/25">
                    Choose CSV file
                  </button>
                  <div className="mt-4">
                    <button onClick={downloadSample} className="text-xs text-slate-400 hover:text-brand-500 transition-colors">Download a sample file</button>
                  </div>
                  {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
                </div>
              )}

              {/* ───────── Step 2: map + preview ───────── */}
              {step === "map" && map && (
                <>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">1. Check the columns</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <ColumnSelect label="Date" value={map.date} onChange={setCol("date")} headers={headers} optional={false} />
                      <ColumnSelect label="Description" value={map.desc} onChange={setCol("desc")} headers={headers} />
                      <ColumnSelect label="Amount" value={map.amount} onChange={setCol("amount")} headers={headers} />
                      <ColumnSelect label="Debit (money out)" value={map.debit} onChange={setCol("debit")} headers={headers} />
                      <ColumnSelect label="Credit (money in)" value={map.credit} onChange={setCol("credit")} headers={headers} />
                      <ColumnSelect label="Type (Dr/Cr)" value={map.type} onChange={setCol("type")} headers={headers} />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      Use either one Amount column, or Debit and Credit columns. If you pick Debit or Credit, the Amount column is ignored.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className={labelClass}>Date format</label>
                        <select value={dayFirst ? "dmy" : "mdy"} onChange={e => setDayFirst(e.target.value === "dmy")} className={selectClass}>
                          <option value="dmy">Day first (31/12/2026)</option>
                          <option value="mdy">Month first (12/31/2026)</option>
                        </select>
                      </div>
                      {needsSignChoice && (
                        <div>
                          <label className={labelClass}>Amounts in this file</label>
                          <select value={positiveIsExpense ? "pos" : "neg"} onChange={e => setPositiveIsExpense(e.target.value === "pos")} className={selectClass}>
                            <option value="neg">Negative = spent, positive = received</option>
                            <option value="pos">Positive = spent (credit card)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Summary */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">2. Preview</p>
                    {rows.length === 0 ? (
                      <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm">
                        No usable rows yet. Check that the Date column and an Amount (or Debit/Credit) column are chosen above.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2.5">
                            <p className="text-[10px] uppercase tracking-widest text-slate-400">Rows</p>
                            <p className="text-base font-bold font-mono text-slate-900 dark:text-white">{rows.length}</p>
                          </div>
                          <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2.5">
                            <p className="text-[10px] uppercase tracking-widest text-slate-400">Money in</p>
                            <p className="text-base font-bold font-mono text-emerald-500">{fmt(income)}</p>
                          </div>
                          <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2.5">
                            <p className="text-[10px] uppercase tracking-widest text-slate-400">Money out</p>
                            <p className="text-base font-bold font-mono text-red-500">{fmt(expense)}</p>
                          </div>
                          <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2.5">
                            <p className="text-[10px] uppercase tracking-widest text-slate-400">Dates</p>
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-1">
                              {niceDate(dates[0])} – {niceDate(dates[dates.length - 1])}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100 dark:border-white/5">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 dark:bg-white/5 text-slate-400 uppercase tracking-wider">
                              <tr>
                                <th className="text-left px-3 py-2 font-semibold">Date</th>
                                <th className="text-left px-3 py-2 font-semibold">Description</th>
                                <th className="text-left px-3 py-2 font-semibold">Category</th>
                                <th className="text-right px-3 py-2 font-semibold">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.slice(0, 8).map((r, i) => (
                                <tr key={i} className="border-t border-slate-100 dark:border-white/5">
                                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{niceDate(r.date)}</td>
                                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200 max-w-[260px] truncate">{r.title}</td>
                                  <td className="px-3 py-2 text-slate-500">{catName.get(r.category_id) || <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
                                  <td className={`px-3 py-2 text-right font-mono font-semibold ${r.type === "income" ? "text-emerald-500" : "text-red-500"}`}>
                                    {r.type === "income" ? "+" : "−"}{fmt(r.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {rows.length > 8 && <p className="text-[11px] text-slate-400 mt-1.5">Showing the first 8 of {rows.length} rows.</p>}
                      </>
                    )}

                    {built.problems.length > 0 && (
                      <details className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        <summary className="cursor-pointer text-amber-500">{built.problems.length} line{built.problems.length > 1 ? "s" : ""} will be skipped (no valid date or amount)</summary>
                        <ul className="mt-2 space-y-1 pl-4 list-disc">
                          {built.problems.slice(0, 5).map((p, i) => (
                            <li key={i}>Line {p.line}: {p.reason} — <span className="text-slate-400">{p.cells.filter(Boolean).join(", ").slice(0, 80)}</span></li>
                          ))}
                          {built.problems.length > 5 && <li>…and {built.problems.length - 5} more</li>}
                        </ul>
                      </details>
                    )}
                    {tooMany && (
                      <p className="text-sm text-red-500 mt-3">This file has {rows.length} rows. The limit is {MAX_ROWS} per import, so please split it.</p>
                    )}
                  </div>

                  {/* Categories */}
                  {rows.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">3. Categories</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {categorised} of {rows.length} rows already have a category
                        <span className="text-slate-400"> (from your file or your past transactions)</span>.
                      </p>
                      {uncategorised > 0 && (
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          <button onClick={runAI} disabled={ai.running}
                            className="px-4 py-2 rounded-xl text-sm font-medium border border-brand-200 dark:border-brand-500/30 text-brand-600 dark:text-brand-400
                                       hover:bg-brand-50 dark:hover:bg-brand-500/10 disabled:opacity-60 transition-all">
                            {ai.running ? "Asking AI…" : `✨ Categorise the other ${uncategorised} with AI`}
                          </button>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">Anything left goes to</span>
                            <select value={defaultCat} onChange={e => setDefaultCat(e.target.value)} className={`${selectClass} !w-auto`}>
                              <option value="">No category</option>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                      {ai.msg && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{ai.msg}</p>}
                    </div>
                  )}

                  {rows.length > 0 && (
                    <label className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} className="mt-0.5 accent-brand-500" />
                      <span>
                        Skip transactions I have already added
                        <span className="block text-xs text-slate-400">Same date, description, type and amount. Safe if you import the same statement twice.</span>
                      </span>
                    </label>
                  )}

                  {error && <p className="text-sm text-red-500">{error}</p>}
                </>
              )}

              {/* ───────── Step 3: done ───────── */}
              {step === "done" && result && (
                <div className="text-center py-6">
                  <p className="text-4xl mb-3">{result.imported ? "✅" : "ℹ️"}</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                    {result.imported ? `Imported ${result.imported} transaction${result.imported > 1 ? "s" : ""}` : "Nothing new to import"}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                    {result.skipped_duplicates > 0 && `${result.skipped_duplicates} already existed and were skipped. `}
                    {result.invalid > 0 && `${result.invalid} rows were not valid and were left out.`}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-white/5 shrink-0">
              {step === "map" ? (
                <>
                  <button onClick={() => { setStep("upload"); setError(""); }}
                    className="px-4 py-2.5 rounded-xl text-sm border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                    Choose another file
                  </button>
                  <button onClick={doImport} disabled={!canImport}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 transition-all">
                    {busy ? "Importing…" : `Import ${rows.length} transaction${rows.length === 1 ? "" : "s"}`}
                  </button>
                </>
              ) : (
                <>
                  <span />
                  <button onClick={close}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 transition-all">
                    {step === "done" ? "Done" : "Cancel"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}