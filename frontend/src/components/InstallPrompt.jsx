import { useEffect, useState, useSyncExternalStore } from "react";
import { subscribe, canInstall, updateReady, promptInstall, applyUpdate, isStandalone, isIosSafari } from "../utils/pwa";

const KEY = "install-hint-dismissed";
const read = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const write = () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } };

const useStore = (get) => useSyncExternalStore(subscribe, get, () => false);

export default function InstallPrompt() {
  const installable = useStore(canInstall);
  const update = useStore(updateReady);
  const [dismissed, setDismissed] = useState(read);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const close = () => { write(); setDismissed(true); };
  const install = async () => { const r = await promptInstall(); if (r === "dismissed") close(); };

  const showIos = !installable && !dismissed && !isStandalone() && isIosSafari();
  const showInstall = (installable || showIos) && !dismissed && !isStandalone();

  const shell = "pointer-events-auto rounded-2xl shadow-xl border px-4 py-3 text-sm flex items-center gap-3";
  const light = "bg-white border-slate-200 text-slate-800 dark:bg-raised dark:border-white/10 dark:text-slate-100";

  return (
    <div className="print:hidden fixed z-40 left-3 right-3 bottom-3 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[360px] flex flex-col gap-2 pointer-events-none">
      {!online && (
        <div role="status" className={`${shell} bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200`}>
          <span aria-hidden>📡</span>
          <span className="flex-1">You are offline. Numbers may be out of date until you reconnect.</span>
        </div>
      )}

      {update && (
        <div role="status" className={`${shell} ${light}`}>
          <span aria-hidden>✨</span>
          <span className="flex-1">A new version is ready.</span>
          <button onClick={applyUpdate} className="btn-primary !py-1.5 !px-3">Update</button>
        </div>
      )}

      {showInstall && (
        <div role="dialog" aria-label="Install Finance AI" className={`${shell} ${light}`}>
          <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-tight">Install Finance AI</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {installable ? "Open it like an app, straight from your home screen." : <>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</>}
            </p>
          </div>
          {installable && <button onClick={install} className="btn-primary !py-1.5 !px-3">Install</button>}
          <button onClick={close} aria-label="Not now" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none px-1">×</button>
        </div>
      )}
    </div>
  );
}