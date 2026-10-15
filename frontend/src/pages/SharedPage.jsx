import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import api from "../api/axios";
import { localToday } from "../utils/voiceParse";

const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
const card = "bg-white dark:bg-[#16161f] border border-slate-100 dark:border-white/5 rounded-2xl";
const input = `w-full px-3 py-2.5 rounded-xl text-sm bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10
  text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20`;
const ghost = "px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all disabled:opacity-40";

const addMonths = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
};
const errText = (e, fallback) => e?.response?.data?.message || fallback;

// A button that asks "Sure?" before doing something you cannot undo.
function ConfirmButton({ label, confirmLabel = "Yes", onConfirm, danger = true, disabled }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className={ghost} disabled={disabled} onClick={() => setAsk(true)}>{label}</button>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-slate-500 dark:text-slate-400">Sure?</span>
      <button className={`px-2.5 py-1.5 rounded-lg font-semibold text-white ${danger ? "bg-rose-500 hover:bg-rose-600" : "bg-brand-500 hover:bg-brand-600"}`}
        onClick={() => { setAsk(false); onConfirm(); }}>{confirmLabel}</button>
      <button className={ghost} onClick={() => setAsk(false)}>No</button>
    </span>
  );
}

function useFlash() {
  const [msg, setMsg] = useState(null); // { text, bad }
  const t = useRef(null);
  const show = useCallback((text, bad = false) => {
    clearTimeout(t.current); setMsg({ text, bad });
    if (!bad) t.current = setTimeout(() => setMsg(null), 4000);
  }, []);
  const clear = useCallback(() => { clearTimeout(t.current); setMsg(null); }, []);
  useEffect(() => () => clearTimeout(t.current), []);
  return [msg, show, clear];
}

const barColor = (p) => (p >= 100 ? "bg-rose-500" : p >= 80 ? "bg-amber-400" : "bg-emerald-500");

export default function SharedPage() {
  const [ov, setOv] = useState({ status: "loading" });
  const [bud, setBud] = useState(null);
  const [act, setAct] = useState(null);
  const [cats, setCats] = useState([]);
  const [month, setMonth] = useState(() => localToday().slice(0, 7));
  const [reload, setReload] = useState(0);
  const [msg, flash, clearFlash] = useFlash();
  const [busy, setBusy] = useState(false);
  const [createName, setCreateName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [lastLink, setLastLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const refresh = () => setReload((n) => n + 1);

  useEffect(() => {
    let off = false;
    api.get("/household")
      .then((r) => { if (!off) setOv({ status: "ready", data: r.data }); })
      .catch((e) => { if (!off) setOv({ status: "error", demo: e.response?.status === 403, message: errText(e, "Could not load shared budgets. Please try again.") }); });
    return () => { off = true; };
  }, [reload]);

  const inHousehold = ov.status === "ready" && !!ov.data.household;

  useEffect(() => {
    let off = false;
    if (!inHousehold) return undefined;
    api.get("/household/budgets", { params: { month } })
      .then((r) => { if (!off) setBud(r.data); })
      .catch((e) => { if (!off) { setBud(null); flash(errText(e, "Could not load the shared budgets."), true); } });
    return () => { off = true; };
  }, [inHousehold, month, ov, flash]); // ov changes after every overview reload, so budgets refresh only once membership is known

  useEffect(() => {
    let off = false;
    if (!inHousehold) return undefined;
    api.get("/household/activity", { params: { month } })
      .then((r) => { if (!off) setAct(r.data); })
      .catch(() => { if (!off) setAct({ transactions: [], sharing_members: [], failed: true }); });
    return () => { off = true; };
  }, [inHousehold, month, ov]);

  useEffect(() => {
    let off = false;
    api.get("/categories").then((r) => { if (!off) setCats(r.data.filter((c) => !c.user_id)); }).catch(() => {});
    return () => { off = true; };
  }, []);

  const run = async (fn, okText) => {
    setBusy(true); clearFlash();
    try { const r = await fn(); if (okText) flash(typeof okText === "function" ? okText(r) : okText); refresh(); return r; }
    catch (e) { flash(errText(e, "Something went wrong. Please try again."), true); return null; }
    finally { setBusy(false); }
  };

  const create = (e) => { e.preventDefault(); run(() => api.post("/household", { name: createName }), "Household created").then((r) => { if (r) setCreateName(""); }); };
  const invite = async (e) => {
    e.preventDefault(); setLastLink(null); setCopied(false);
    const r = await run(() => api.post("/household/invites", { email: inviteEmail }), (x) => x.data.message);
    if (r) { setInviteEmail(""); setLastLink({ email: r.data.invite.email, link: r.data.link, emailed: r.data.emailed }); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(lastLink.link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { flash("Could not copy. Select the link and copy it yourself.", true); }
  };
  const saveBudget = (e) => {
    e.preventDefault();
    run(() => api.post("/household/budgets", { category_id: Number(newCat), monthly_limit: Number(newLimit), month }), "Shared budget saved")
      .then((r) => { if (r) { setNewCat(""); setNewLimit(""); } });
  };
  const setSharing = (share) => run(() => api.patch("/household/me/sharing", { share }), (r) => r.data.message);
  const rename = (e) => { e.preventDefault(); run(() => api.patch("/household", { name: nameDraft }), "Renamed").then((r) => { if (r) setRenaming(false); }); };

  const h = ov.status === "ready" ? ov.data.household : null;
  const isOwner = h?.role === "owner";
  const meSharing = !!h?.members.find((m) => m.is_me)?.share_transactions;
  const thisMonth = localToday().slice(0, 7);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Shared budgets</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Track budgets together with your partner, family or flatmates. You see each other's totals per category. Single transactions are visible only from people who choose to share them.</p>
        </div>

        <div role="status" aria-live="polite">
          {msg && (
            <div className={`px-4 py-3 rounded-2xl text-sm font-medium border ${msg.bad
              ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30"
              : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/30"}`}>{msg.text}</div>
          )}
        </div>

        {ov.status === "loading" && <div className={`${card} p-6 text-sm text-slate-400`}>Loading…</div>}

        {ov.status === "error" && (
          <div role="alert" className="rounded-2xl px-4 py-3 text-sm bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/30">
            {ov.message}
            {ov.demo && <> <Link to="/signup" className="font-semibold underline">Create your own account</Link>.</>}
          </div>
        )}

        {/* ───── not in a household yet ───── */}
        {ov.status === "ready" && !h && (
          <>
            {ov.data.my_invites.length > 0 && (
              <div className={`${card} p-4 sm:p-5`}>
                <h2 className="font-semibold text-slate-900 dark:text-white mb-3">You've been invited</h2>
                <ul className="space-y-3">
                  {ov.data.my_invites.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-slate-700 dark:text-slate-200"><b>{i.invited_by_name}</b> invited you to <b>{i.household_name}</b></p>
                      <span className="flex gap-2">
                        <button className="btn-primary" disabled={busy} onClick={() => run(() => api.post(`/household/invites/${i.id}/accept`), "You joined the household")}>Accept</button>
                        <button className={ghost} disabled={busy} onClick={() => run(() => api.post(`/household/invites/${i.id}/decline`), "Invite declined")}>Decline</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <form onSubmit={create} className={`${card} p-4 sm:p-5`}>
              <h2 className="font-semibold text-slate-900 dark:text-white">Start a household</h2>
              <p className="text-xs text-slate-400 mb-3">Give it a name, then invite people by email. You can have up to {ov.data.max_members} people.</p>
              <label htmlFor="hname" className="sr-only">Household name</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input id="hname" className={input} value={createName} maxLength={60} placeholder="e.g. Our home" onChange={(e) => setCreateName(e.target.value)} />
                <button className="btn-primary whitespace-nowrap" disabled={busy || createName.trim().length < 2}>Create household</button>
              </div>
            </form>
            <div className={`${card} p-4 sm:p-5 text-sm text-slate-500 dark:text-slate-400 space-y-1.5`}>
              <p className="font-semibold text-slate-800 dark:text-slate-100">How it works</p>
              <p>• Everyone keeps adding their own transactions as usual.</p>
              <p>• A shared budget adds up what all members spend in a category each month.</p>
              <p>• Everyone is alerted at 80% and when a shared budget is passed.</p>
              <p>• Members see totals per category only. Your individual transactions stay private.</p>
            </div>
          </>
        )}

        {/* ───── in a household ───── */}
        {h && (
          <>
            <div className={`${card} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  {renaming ? (
                    <form onSubmit={rename} className="flex gap-2">
                      <input aria-label="New household name" className={input} value={nameDraft} maxLength={60} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
                      <button className="btn-primary" disabled={busy || nameDraft.trim().length < 2}>Save</button>
                      <button type="button" className={ghost} onClick={() => setRenaming(false)}>Cancel</button>
                    </form>
                  ) : (
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                      {h.name}
                      {isOwner && <button className="ml-2 text-xs font-semibold text-brand-500 hover:text-brand-600" onClick={() => { setNameDraft(h.name); setRenaming(true); }}>Rename</button>}
                    </h2>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">{h.members.length} {h.members.length === 1 ? "person" : "people"} · you are {isOwner ? "the owner" : "a member"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ConfirmButton label="Leave" confirmLabel="Yes, leave" disabled={busy}
                    onConfirm={() => run(() => api.post("/household/leave"), (r) => r.data.message)} />
                  {isOwner && <ConfirmButton label="Close for everyone" confirmLabel="Yes, close it" disabled={busy}
                    onConfirm={() => run(() => api.delete("/household"), "Household closed")} />}
                </div>
              </div>

              <ul className="mt-4 divide-y divide-slate-100 dark:divide-white/5" aria-label="Members">
                {h.members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3 py-2.5">
                    <span className="w-8 h-8 rounded-full bg-brand-500/15 text-brand-500 text-xs font-bold flex items-center justify-center shrink-0" aria-hidden>{(m.name || "?").trim().charAt(0).toUpperCase()}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{m.name}{m.is_me && <span className="text-slate-400 font-normal"> (you)</span>}</p>
                      <p className="text-xs text-slate-400 truncate">{m.email}</p>
                      {m.share_transactions && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Shares their transactions</p>}
                    </div>
                    {m.role === "owner" && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Owner</span>}
                    {isOwner && !m.is_me && <ConfirmButton label="Remove" confirmLabel="Yes, remove" disabled={busy}
                      onConfirm={() => run(() => api.delete(`/household/members/${m.user_id}`), `${m.name} was removed`)} />}
                  </li>
                ))}
                {h.invites.map((i) => (
                  <li key={`i${i.id}`} className="flex items-center gap-3 py-2.5">
                    <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 text-slate-400 text-xs flex items-center justify-center shrink-0" aria-hidden>✉</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-600 dark:text-slate-300 truncate">{i.email}</p>
                      <p className="text-xs text-slate-400">Invited, waiting to join</p>
                    </div>
                    <button className={ghost} disabled={busy} onClick={() => run(() => api.delete(`/household/invites/${i.id}`), "Invite cancelled")}>Cancel</button>
                  </li>
                ))}
              </ul>

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5" aria-label="My sharing">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Share my transactions</p>
                {meSharing ? (
                  <>
                    <p className="text-xs text-slate-400 mt-0.5 mb-2">Everyone in this household can see the title, amount, category and date of your transactions (never your notes). You can stop at any time and they disappear from view straight away.</p>
                    <button className={ghost} disabled={busy} onClick={() => setSharing(false)}>Stop sharing</button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-slate-400 mt-0.5 mb-2">Off by default. Right now the household only sees your totals per category. If you switch this on, everyone here can also see the title, amount, category and date of all your transactions, including older ones. Notes stay private.</p>
                    <ConfirmButton label="Share my transactions" confirmLabel="Yes, share" danger={false} disabled={busy} onConfirm={() => setSharing(true)} />
                  </>
                )}
              </div>

              <form onSubmit={invite} className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                <label htmlFor="invite" className="block text-sm font-medium text-slate-800 dark:text-slate-100">Invite someone</label>
                <p className="text-xs text-slate-400 mb-2">They need an account with the same email address. They can create one from the invite.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input id="invite" type="email" className={input} value={inviteEmail} placeholder="name@example.com" onChange={(e) => setInviteEmail(e.target.value)} />
                  <button className="btn-primary whitespace-nowrap" disabled={busy || !inviteEmail.trim()}>Send invite</button>
                </div>
                {lastLink && (
                  <div className="mt-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-3 text-xs">
                    <p className="text-slate-600 dark:text-slate-300 mb-1.5">
                      {lastLink.emailed ? <>We emailed <b>{lastLink.email}</b>. You can also send this link yourself:</> : <>The email could not be sent. Send this link to <b>{lastLink.email}</b> yourself:</>}
                    </p>
                    <div className="flex gap-2 items-center">
                      <input readOnly aria-label="Invite link" className={`${input} !py-1.5 !text-xs`} value={lastLink.link} onFocus={(e) => e.target.select()} />
                      <button type="button" className={ghost} onClick={copyLink}>{copied ? "Copied" : "Copy"}</button>
                    </div>
                  </div>
                )}
              </form>
            </div>

            <div className={`${card} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="font-semibold text-slate-900 dark:text-white">Shared budgets</h2>
                <div className="flex items-center gap-1.5">
                  <button className={ghost} aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>‹</button>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200 min-w-[8.5rem] text-center" aria-live="polite">{monthLabel(month)}</span>
                  <button className={ghost} aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>›</button>
                  {month !== thisMonth && <button className={ghost} onClick={() => setMonth(thisMonth)}>Today</button>}
                </div>
              </div>

              {!bud && <p className="text-sm text-slate-400">Loading…</p>}
              {bud && bud.budgets.length === 0 && (
                <div className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  <p>No shared budgets for {monthLabel(month)} yet.</p>
                  <button className={`${ghost} mt-2`} disabled={busy}
                    onClick={() => run(() => api.post("/household/budgets/copy", { from: addMonths(month, -1), to: month }), (r) => r.data.message)}>Copy from last month</button>
                </div>
              )}
              {bud && bud.budgets.length > 0 && (
                <>
                  <div className="mb-4">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Everything together</span>
                      <span className="text-slate-500 dark:text-slate-400">{inr(bud.total_spent)} of {inr(bud.total_limit)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 mt-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor(bud.total_limit > 0 ? (bud.total_spent / bud.total_limit) * 100 : 0)}`} style={{ width: `${Math.min(100, bud.total_limit > 0 ? (bud.total_spent / bud.total_limit) * 100 : 0)}%` }} />
                    </div>
                  </div>
                  <ul className="space-y-4">
                    {bud.budgets.map((b) => (
                      <li key={b.id} className="rounded-xl border border-slate-100 dark:border-white/5 p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate"><span aria-hidden>{b.icon || "💰"} </span>{b.category_name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {inr(b.spent)} of {inr(b.monthly_limit)} · <span className={b.percent >= 100 ? "text-rose-500 font-semibold" : b.percent >= 80 ? "text-amber-500 font-semibold" : ""}>{b.percent}%</span>
                              {b.spent > b.monthly_limit && <span className="text-rose-500"> · {inr(b.spent - b.monthly_limit)} over</span>}
                            </p>
                          </div>
                          <ConfirmButton label="Remove" confirmLabel="Yes, remove" disabled={busy} onConfirm={() => run(() => api.delete(`/household/budgets/${b.id}`), "Shared budget removed")} />
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 mt-2.5 overflow-hidden" role="progressbar" aria-valuenow={Math.min(100, b.percent)} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.category_name} used`}>
                          <div className={`h-full rounded-full ${barColor(b.percent)}`} style={{ width: `${Math.min(100, b.percent)}%` }} />
                        </div>
                        {b.by_member.length > 0 && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                            {b.by_member.map((m) => <span key={m.user_id}>{m.is_me ? "You" : m.name} <b className="text-slate-700 dark:text-slate-200">{inr(m.spent)}</b></span>)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <form onSubmit={saveBudget} className="mt-5 pt-4 border-t border-slate-100 dark:border-white/5">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Add or change a shared budget</p>
                <p className="text-xs text-slate-400 mb-2">For {monthLabel(month)}. Choosing a category that already has a limit changes it.</p>
                <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
                  <select aria-label="Category" className={input} value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                    <option value="">Choose a category</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                    <input aria-label="Monthly limit" type="number" inputMode="numeric" min="1" className={`${input} pl-7`} value={newLimit} placeholder="Monthly limit" onChange={(e) => setNewLimit(e.target.value)} />
                  </div>
                  <button className="btn-primary" disabled={busy || !newCat || !(Number(newLimit) > 0)}>Save</button>
                </div>
              </form>
            </div>

            <div className={`${card} p-4 sm:p-5`} aria-label="Household activity">
              <h2 className="font-semibold text-slate-900 dark:text-white">Household activity</h2>
              <p className="text-xs text-slate-400 mt-0.5 mb-3">Transactions in {monthLabel(month)} from people who chose to share them.</p>
              {!act && <p className="text-sm text-slate-400">Loading…</p>}
              {act?.failed && <p className="text-sm text-rose-500">Could not load the activity. Please try again.</p>}
              {act && !act.failed && act.sharing_members.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">Nobody is sharing their transactions yet. Each person decides for themselves with “Share my transactions” above.</p>
              )}
              {act && !act.failed && act.sharing_members.length > 0 && (
                <>
                  <p className="text-xs text-slate-400 mb-2">Sharing: {act.sharing_members.map((m) => m.name).join(", ")}</p>
                  {act.transactions.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No shared transactions in this month.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-white/5" aria-label="Shared transactions">
                      {act.transactions.map((t) => (
                        <li key={t.id} className="flex items-center gap-3 py-2.5">
                          <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 text-sm flex items-center justify-center shrink-0" aria-hidden>{t.icon || "💰"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{t.title}</p>
                            <p className="text-xs text-slate-400 truncate">{t.is_me ? "You" : t.member_name} · {t.category_name || "Uncategorised"} · {t.date}</p>
                          </div>
                          <span className={`text-sm font-semibold tabular-nums ${t.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-slate-100"}`}>
                            {t.type === "income" ? "+" : "−"}{inr(t.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}