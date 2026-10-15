import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const inputClass = `w-full px-3 py-2.5 rounded-xl text-sm
  bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10
  text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600
  focus:outline-none focus:border-brand-400 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-400/20 transition-all
  disabled:opacity-60 disabled:cursor-not-allowed`;
const labelClass = "block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5";
const cardClass = "bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/5 rounded-2xl p-5";
const btnBase = "px-4 py-2.5 rounded-xl text-sm font-semibold transition-all min-w-[140px]";
// idle = purple, nothing to save = quiet grey, just saved = green tick (goes back by itself)
const btnClass = (state) => state === "saved"
  ? `${btnBase} bg-emerald-500 text-white shadow-lg shadow-emerald-500/20`
  : state === "idle"
    ? `${btnBase} bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed`
    : `${btnBase} bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/25 disabled:opacity-60 disabled:cursor-not-allowed`;
const ghostBtn = "px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-brand-400 hover:text-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all";

function Notice({ kind, children }) {
  if (!children) return null;
  const styles = kind === "ok"
    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-500/20"
    : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 border-red-100 dark:border-red-500/20";
  return <div role={kind === "ok" ? "status" : "alert"} className={`mt-3 px-3 py-2 rounded-xl text-sm border ${styles}`}>{children}</div>;
}

const errText = (err, fallback) => err.response?.data?.message || fallback;

// Success messages and the green "Saved" button fade back to normal on their own. Errors stay until the next try.
function useFlash(ms = 4000) {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = (m) => {
    clearTimeout(timer.current);
    setMsg(m);
    if (m && m.kind === "ok") timer.current = setTimeout(() => setMsg(null), ms);
  };
  return [msg, flash];
}
function useBlink(ms = 2000) {
  const [on, setOn] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const blink = () => { clearTimeout(timer.current); setOn(true); timer.current = setTimeout(() => setOn(false), ms); };
  return [on, blink];
}

export default function ProfilePage() {
  const { user, token, login, logout } = useAuth();
  const navigate = useNavigate();
  const isDemo = (user?.email || "").endsWith("@demo.local");

  // profile
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [memberSince, setMemberSince] = useState("");
  const [profileMsg, setProfileMsg] = useFlash(); // { kind, text }
  const [profileSaved, blinkProfile] = useBlink();
  const [savingProfile, setSavingProfile] = useState(false);

  // password
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useFlash();
  const [pwSaved, blinkPw] = useBlink();
  const [savingPw, setSavingPw] = useState(false);

  // data + delete
  const [exportMsg, setExportMsg] = useFlash();
  const [exporting, setExporting] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delWord, setDelWord] = useState("");
  const [delMsg, setDelMsg] = useFlash();
  const [deleting, setDeleting] = useState(false);

  // fresh copy from the server (also gives "member since")
  useEffect(() => {
    let cancelled = false;
    api.get("/account/me").then(res => {
      if (cancelled) return;
      setName(res.data.name); setEmail(res.data.email);
      if (res.data.created_at) setMemberSince(new Date(res.data.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" }));
    }).catch(() => { /* the saved copy is fine */ });
    return () => { cancelled = true; };
  }, []);

  const unchanged = name.trim() === (user?.name || "") && email.trim() === (user?.email || "");

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true); setProfileMsg(null);
    try {
      const res = await api.put("/account/profile", { name, email });
      login(token, res.data.user); // keep the saved login in step with the new details
      setName(res.data.user.name); setEmail(res.data.user.email);
      blinkProfile();
      setProfileMsg({ kind: "ok", text: "Your details were updated." });
    } catch (err) {
      setProfileMsg({ kind: "err", text: errText(err, "Could not save your details. Please try again.") });
    } finally { setSavingProfile(false); }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (pw.next.length < 8) return setPwMsg({ kind: "err", text: "New password must be at least 8 characters." });
    if (pw.next !== pw.confirm) return setPwMsg({ kind: "err", text: "The two new passwords do not match." });
    setSavingPw(true);
    try {
      const res = await api.put("/account/password", { currentPassword: pw.current, newPassword: pw.next });
      // Other devices are signed out by the server; this one gets a fresh sign-in so you stay here.
      if (res.data?.token) { try { localStorage.setItem("token", res.data.token); } catch { /* storage blocked: you will be asked to sign in again */ } }
      setPw({ current: "", next: "", confirm: "" });
      blinkPw();
      setPwMsg({ kind: "ok", text: "Your password was changed. Other devices were signed out." });
    } catch (err) {
      setPwMsg({ kind: "err", text: errText(err, "Could not change the password. Please try again.") });
    } finally { setSavingPw(false); }
  };

  const download = async (format) => {
    setExporting(format); setExportMsg(null);
    try {
      const res = await api.get("/account/export", { params: { format }, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finance-${format === "csv" ? "transactions" : "data"}-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMsg({ kind: "ok", text: "Download started." });
    } catch {
      setExportMsg({ kind: "err", text: "Could not prepare your data. Please try again." });
    } finally { setExporting(""); }
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    setDeleting(true); setDelMsg(null);
    try {
      await api.delete("/account", { data: { password: delPw } });
      logout();
      navigate("/signup");
    } catch (err) {
      setDelMsg({ kind: "err", text: errText(err, "Could not delete the account. Please try again.") });
      setDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Profile</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            Your details, password and data{memberSince ? ` · member since ${memberSince}` : ""}.
          </p>
        </div>

        {isDemo && (
          <div className="px-4 py-3 rounded-xl text-sm bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-amber-700 dark:text-amber-300">
            This is a demo account, so changing details, password or deleting is turned off. Create your own account to use these.
          </div>
        )}

        {/* Details */}
        <form onSubmit={saveProfile} className={cardClass}>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-4">Your details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="pf-name">Name</label>
              <input id="pf-name" value={name} onChange={e => { setName(e.target.value); setProfileMsg(null); }} disabled={isDemo} maxLength={100} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pf-email">Email</label>
              <input id="pf-email" type="email" value={email} onChange={e => { setEmail(e.target.value); setProfileMsg(null); }} disabled={isDemo} maxLength={100} required className={inputClass} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="submit" disabled={isDemo || savingProfile || unchanged}
              className={btnClass(profileSaved ? "saved" : (unchanged || isDemo) && !savingProfile ? "idle" : "active")}>
              {savingProfile ? "Saving…" : profileSaved ? "✓ Saved" : "Save changes"}
            </button>
          </div>
          <Notice kind={profileMsg?.kind}>{profileMsg?.text}</Notice>
        </form>

        {/* Password */}
        <form onSubmit={savePassword} className={cardClass}>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-1">Change password</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Forgot the current one? Sign out and use "Forgot password" on the sign-in page.</p>
          <div className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="pw-current">Current password</label>
              <input id="pw-current" type="password" autoComplete="current-password" value={pw.current} onChange={e => { setPw({ ...pw, current: e.target.value }); setPwMsg(null); }} disabled={isDemo} required className={inputClass} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="pw-new">New password</label>
                <input id="pw-new" type="password" autoComplete="new-password" value={pw.next} onChange={e => { setPw({ ...pw, next: e.target.value }); setPwMsg(null); }} disabled={isDemo} required className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="pw-confirm">Type it again</label>
                <input id="pw-confirm" type="password" autoComplete="new-password" value={pw.confirm} onChange={e => { setPw({ ...pw, confirm: e.target.value }); setPwMsg(null); }} disabled={isDemo} required className={inputClass} />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <button type="submit" disabled={isDemo || savingPw}
              className={btnClass(pwSaved ? "saved" : isDemo ? "idle" : "active")}>
              {savingPw ? "Changing…" : pwSaved ? "✓ Password changed" : "Change password"}
            </button>
          </div>
          <Notice kind={pwMsg?.kind}>{pwMsg?.text}</Notice>
        </form>

        {/* Data */}
        <div className={cardClass}>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white mb-1">Your data</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
            Download a copy any time. The CSV has your transactions and opens in Excel or Google Sheets. The JSON file has everything: transactions, budgets, goals and recurring items.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => download("csv")} disabled={!!exporting} className={ghostBtn}>{exporting === "csv" ? "Preparing…" : "Download transactions (CSV)"}</button>
            <button onClick={() => download("json")} disabled={!!exporting} className={ghostBtn}>{exporting === "json" ? "Preparing…" : "Download everything (JSON)"}</button>
          </div>
          <Notice kind={exportMsg?.kind}>{exportMsg?.text}</Notice>
        </div>

        {/* Danger zone */}
        <div className="rounded-2xl p-5 border border-red-200 dark:border-red-500/20 bg-white dark:bg-[#16161f]">
          <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">Delete account</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
            This permanently removes your account and everything in it: transactions, budgets, goals, recurring items, alerts and chat history. It cannot be undone. Download your data first if you want to keep a copy.
          </p>
          {!delOpen ? (
            <button onClick={() => setDelOpen(true)} disabled={isDemo}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              Delete my account…
            </button>
          ) : (
            <form onSubmit={deleteAccount} className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="del-pw">Your password</label>
                <input id="del-pw" type="password" autoComplete="current-password" value={delPw} onChange={e => setDelPw(e.target.value)} required className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="del-word">Type DELETE to confirm</label>
                <input id="del-word" value={delWord} onChange={e => setDelWord(e.target.value)} placeholder="DELETE" autoComplete="off" className={inputClass} />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={deleting || !delPw || delWord !== "DELETE"}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                  {deleting ? "Deleting…" : "Delete everything"}
                </button>
                <button type="button" onClick={() => { setDelOpen(false); setDelPw(""); setDelWord(""); setDelMsg(null); }} className={ghostBtn}>Cancel</button>
              </div>
            </form>
          )}
          <Notice kind={delMsg?.kind}>{delMsg?.text}</Notice>
        </div>
      </div>
    </Layout>
  );
}