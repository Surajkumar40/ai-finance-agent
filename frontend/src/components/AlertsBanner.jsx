import { useEffect, useState } from "react";
import api from "../api/axios";

const fmtTime = d => new Date(d).toLocaleDateString("en-IN", { month: "short", day: "numeric" });

export default function AlertsBanner() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { fetchAlerts(); }, []);

  async function fetchAlerts() {
    try {
      const { data } = await api.get("/alerts?unread=true");
      setAlerts(data);
    } catch (e) {
      console.error("Alerts fetch error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function dismiss(id) {
    setAlerts(prev => prev.filter(a => a.id !== id));
    try { await api.patch(`/alerts/${id}/read`); } catch (e) { console.error(e); }
  }

  async function dismissAll() {
    const ids = alerts.map(a => a.id);
    setAlerts([]);
    try { await api.patch("/alerts/read-all"); } catch (e) { console.error(e); }
  }

  if (loading || alerts.length === 0) return null;

  const visible = expanded ? alerts : alerts.slice(0, 1);

  return (
    <div className="card p-4 border-amber-200/50 dark:border-amber-500/20 bg-amber-50/40 dark:bg-amber-500/5 animate-slide-up">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {alerts.length === 1 ? "1 spending alert" : `${alerts.length} spending alerts`}
          </h3>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {alerts.length > 1 && (
            <button onClick={() => setExpanded(e => !e)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-medium">
              {expanded ? "Show less" : `Show all ${alerts.length}`}
            </button>
          )}
          <button onClick={dismissAll} className="text-xs text-amber-600 hover:text-amber-700 font-medium">
            Dismiss all
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {visible.map(a => (
          <div key={a.id} className="flex items-start justify-between gap-3 text-sm bg-white/60 dark:bg-white/5 rounded-xl px-3 py-2">
            <div>
              <p className="text-slate-700 dark:text-slate-200">{a.message}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{fmtTime(a.triggered_at)}</p>
            </div>
            <button onClick={() => dismiss(a.id)}
              className="text-slate-300 hover:text-slate-500 dark:hover:text-slate-300 shrink-0 text-xs px-1">
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
