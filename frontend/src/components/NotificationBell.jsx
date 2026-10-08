import { useEffect, useRef, useState } from "react";
import api from "../api/axios";

const timeAgo = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export default function NotificationBell() {
  const [data, setData] = useState({ unread: 0, alerts: [] });
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const load = async () => {
    try { const res = await api.get("/alerts"); setData(res.data); } catch { /* ignore */ }
  };

  useEffect(() => {
    const tick = () => api.get("/alerts").then(res => setData(res.data)).catch(() => { /* ignore */ });
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const markRead = async (a) => {
    if (a.is_read) return;
    setData(d => ({ unread: Math.max(0, d.unread - 1), alerts: d.alerts.map(x => x.id === a.id ? { ...x, is_read: true } : x) }));
    try { await api.post(`/alerts/${a.id}/read`); } catch { /* ignore */ }
  };
  const markAll = async () => {
    setData(d => ({ unread: 0, alerts: d.alerts.map(x => ({ ...x, is_read: true })) }));
    try { await api.post("/alerts/read-all"); } catch { /* ignore */ }
  };
  const clearAll = async () => {
    setData({ unread: 0, alerts: [] });
    try { await api.delete("/alerts"); } catch { /* ignore */ }
  };

  return (
    <div className="relative ml-auto" ref={boxRef}>
      <button onClick={() => { setOpen(o => !o); if (!open) load(); }} aria-label="Notifications"
        className="relative w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400
                   hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {data.unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full bottom-0 ml-3 w-80 max-h-[70vh] flex flex-col z-50 rounded-2xl shadow-2xl
                        bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/10 animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Notifications</h3>
            <div className="flex gap-3 text-xs">
              <button onClick={markAll} className="text-brand-500 hover:text-brand-600 font-medium">Mark all read</button>
              <button onClick={clearAll} className="text-slate-400 hover:text-red-500">Clear</button>
            </div>
          </div>
          <div className="overflow-y-auto p-2">
            {data.alerts.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">You're all caught up 🎉</p>
            ) : data.alerts.map(a => (
              <button key={a.id} onClick={() => markRead(a)}
                className={`w-full text-left flex gap-2.5 px-3 py-2.5 rounded-xl transition-colors hover:bg-slate-50 dark:hover:bg-white/5
                  ${a.type === "budget_exceeded" ? "border-l-2 border-red-400" : a.type === "budget_warning" ? "border-l-2 border-amber-400" : a.type === "goal_completed" ? "border-l-2 border-emerald-400" : ""}`}>
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${a.is_read ? "bg-transparent" : "bg-brand-500"}`} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-xs leading-relaxed ${a.is_read ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-100 font-medium"}`}>{a.message}</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">{timeAgo(a.triggered_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
