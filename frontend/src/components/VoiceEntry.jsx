import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { parseSpoken, localToday } from "../utils/voiceParse";

const field = `w-full px-2.5 py-2 rounded-lg text-sm bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10
  text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20`;

const getRecognition = () => (typeof window === "undefined" ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null);

const MIC_ERRORS = {
  "not-allowed": "Microphone is blocked. Allow it in the browser's address bar, or type below instead.",
  "service-not-allowed": "Microphone is blocked. Allow it in the browser's address bar, or type below instead.",
  "no-speech": "I didn't hear anything. Tap the mic and try again.",
  "audio-capture": "No microphone found. You can type below instead.",
  network: "Speech needs an internet connection. You can type below instead.",
};

export default function VoiceEntry({ categories = [], onSaved }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [rows, setRows] = useState([]);
  const [listening, setListening] = useState(false);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const recRef = useRef(null);
  const textRef = useRef("");
  const supported = !!getRecognition();

  const stopListening = () => { try { recRef.current?.stop(); } catch { /* already stopped */ } };
  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* ignore */ } }, []);

  const understand = (value) => {
    const items = parseSpoken(value, categories, localToday());
    setRows(items);
    setMsg(items.length ? "" : "I couldn't find an amount. Try: “spent 250 on lunch yesterday”.");
  };

  const close = () => { stopListening(); setOpen(false); setText(""); setRows([]); setMsg(""); textRef.current = ""; };

  const listen = () => {
    const Rec = getRecognition();
    if (!Rec) return;
    if (listening) { stopListening(); return; }
    setMsg(""); setRows([]); setText(""); textRef.current = "";
    const rec = new Rec();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + " ";
      t = t.trim(); textRef.current = t; setText(t);
    };
    rec.onerror = (e) => { setMsg(MIC_ERRORS[e.error] || "Could not use the microphone. You can type below instead."); };
    rec.onend = () => { setListening(false); if (textRef.current) understand(textRef.current); };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setMsg("Could not start the microphone. You can type below instead."); }
  };

  const update = (i, patch) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const remove = (i) => setRows((r) => r.filter((_, k) => k !== i));

  const saveAll = async () => {
    const bad = rows.find((r) => !String(r.title).trim() || !(Number(r.amount) > 0) || !r.date);
    if (bad) { setMsg("Each entry needs a title, an amount above 0 and a date."); return; }
    setSaving(true); setMsg("");
    let left = [...rows];
    try {
      while (left.length) {
        const r = left[0];
        await api.post("/transactions", { title: String(r.title).trim(), amount: Number(r.amount), type: r.type, category_id: r.category_id || null, date: r.date, note: r.note });
        left = left.slice(1); setRows(left);
      }
      onSaved?.(); close();
    } catch (err) {
      setMsg((left.length < rows.length ? "Saved some, but one failed: " : "") + (err.response?.data?.message || "Could not save. Please try again."));
      if (rows.length !== left.length) onSaved?.();
    } finally { setSaving(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} title="Add a transaction by speaking" aria-label="Add by voice"
        className="px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
        🎤 Voice
      </button>

      {open && (
        <div className="print:hidden fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div role="dialog" aria-label="Add by voice" className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-surface border border-slate-200 dark:border-white/10 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Add by voice</h2>
              <button onClick={close} aria-label="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl leading-none px-1">×</button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Say it like you would to a friend: “spent 250 on lunch yesterday and 40 on tea”.
            </p>

            <div className="flex items-start gap-3">
              {supported && (
                <button onClick={listen} aria-label={listening ? "Stop listening" : "Start listening"}
                  className={`shrink-0 w-14 h-14 rounded-full text-2xl flex items-center justify-center text-white shadow-lg transition-all
                    ${listening ? "bg-red-500 animate-pulse" : "bg-brand-500 hover:bg-brand-600"}`}>
                  {listening ? "■" : "🎤"}
                </button>
              )}
              <div className="flex-1 min-w-0">
                <textarea value={text} rows={2} aria-label="What you said"
                  onChange={(e) => { setText(e.target.value); textRef.current = e.target.value; }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); understand(text); } }}
                  placeholder={supported ? (listening ? "Listening…" : "Tap the mic, or type here") : "Type it here, like “spent 250 on lunch”"}
                  className={`${field} resize-none`} />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px] text-slate-400">{supported ? "Edit the words if it misheard." : "Voice isn't supported in this browser, so type instead."}</span>
                  <button onClick={() => understand(text)} disabled={!text.trim() || listening}
                    className="text-xs font-semibold text-brand-500 hover:text-brand-600 disabled:opacity-40">Understand</button>
                </div>
              </div>
            </div>

            <div role="status" aria-live="polite">
              {msg && <p className="mt-3 text-sm rounded-xl px-3 py-2 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30">{msg}</p>}
            </div>

            {rows.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Check before saving</p>
                {rows.map((r, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 dark:border-white/10 p-3 space-y-2">
                    <div className="flex gap-2">
                      <input value={r.title} onChange={(e) => update(i, { title: e.target.value })} aria-label="Title" className={field} />
                      <button onClick={() => remove(i)} aria-label="Remove this entry" className="text-slate-400 hover:text-red-500 px-1 text-lg leading-none">×</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" min="0" step="0.01" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} aria-label="Amount" className={field} />
                      <select value={r.type} onChange={(e) => update(i, { type: e.target.value })} aria-label="Type" className={field}>
                        <option value="expense">Expense</option><option value="income">Income</option>
                      </select>
                      <select value={r.category_id} onChange={(e) => update(i, { category_id: e.target.value })} aria-label="Category" className={field}>
                        <option value="">No category</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input type="date" value={r.date} onChange={(e) => update(i, { date: e.target.value })} aria-label="Date" className={field} />
                    </div>
                  </div>
                ))}
                <button onClick={saveAll} disabled={saving} className="btn-primary w-full">
                  {saving ? "Saving…" : rows.length > 1 ? `Save ${rows.length} entries` : "Save"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}