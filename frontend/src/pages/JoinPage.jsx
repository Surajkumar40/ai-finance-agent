import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import AuthCard, { primaryBtn, ErrorBox } from "../components/AuthCard";
import { pendingInvite as store } from "../utils/pendingInvite";

const secondary = "block w-full text-center py-3 rounded-xl font-semibold text-sm border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all";

// Opened from the link in an invite email: /join?token=...
export default function JoinPage() {
  const [params] = useSearchParams();
  const { token: session, logout } = useAuth();
  const navigate = useNavigate();
  const urlToken = params.get("token") || "";
  const token = urlToken || store.get();
  const [info, setInfo] = useState(null);       // answer from the server
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Signed out: remember the invite through sign in / sign up. Signed in: it has done its job, so forget it
  // (otherwise an old link would keep pulling the person back here).
  useEffect(() => {
    if (!urlToken) return;
    if (session) store.clear(); else store.set(urlToken);
  }, [urlToken, session]);

  useEffect(() => {
    let off = false;
    if (!session || !token) return undefined;
    api.get("/household/invite-info", { params: { token } })
      .then((r) => { if (!off) setInfo(r.data); })
      .catch((e) => { if (!off) setFailed(e.response?.data?.message || "Could not check this invite. Please try again."); });
    return () => { off = true; };
  }, [session, token]);

  const join = async () => {
    setBusy(true); setError("");
    try { await api.post("/household/join", { token }); store.clear(); navigate("/shared", { replace: true }); }
    catch (e) { setError(e.response?.data?.message || "Could not join. Please try again."); }
    finally { setBusy(false); }
  };
  const switchAccount = () => { store.set(token); logout(); navigate("/login", { replace: true }); }; // saved again, so it comes back after signing in with the right account
  const done = () => store.clear();

  if (!token) {
    return (
      <AuthCard title="No invite found" subtitle="This link is missing its invite code. Open the link from the email again.">
        <Link to={session ? "/dashboard" : "/login"} className={secondary}>{session ? "Go to the app" : "Go to sign in"}</Link>
      </AuthCard>
    );
  }

  if (!session) {
    return (
      <AuthCard title="You've been invited" subtitle="Sign in, or create an account, using the email address the invite was sent to. Then you can join.">
        <Link to="/login" className={`${primaryBtn} block text-center`}>Sign in</Link>
        <Link to="/signup" className={`${secondary} mt-3`}>Create an account</Link>
      </AuthCard>
    );
  }

  if (failed) {
    return (
      <AuthCard title="Could not open the invite" subtitle={failed}>
        <Link to="/shared" onClick={done} className={`${secondary}`}>Go to shared budgets</Link>
      </AuthCard>
    );
  }

  if (!info) return <AuthCard title="One moment…" subtitle="Checking your invite." />;

  const gone = { not_found: "This invite was not found.", used: "This invite was already used.", cancelled: "This invite was cancelled.", expired: "This invite has expired." };
  if (info.state !== "valid") {
    return (
      <AuthCard title="This invite can't be used" subtitle={`${gone[info.state] || "This invite is not valid."} Ask the person for a new one.`}>
        <Link to="/shared" onClick={done} className={`${primaryBtn} block text-center`}>Go to shared budgets</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={`Join ${info.household_name}`} subtitle={`${info.invited_by_name} invited you to track budgets together. You will see each other's totals per category. Single transactions are only visible from people who choose to share them.`}>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!info.email_matches ? (
        <>
          <ErrorBox>This invite was sent to <b>{info.invite_email}</b>, but you are signed in as <b>{info.my_email}</b>.</ErrorBox>
          <button onClick={switchAccount} className={primaryBtn}>Sign in with a different account</button>
          <Link to="/shared" onClick={done} className={`${secondary} mt-3`}>Not now</Link>
        </>
      ) : info.already_in_household ? (
        <>
          <ErrorBox>You are already in a household. Leave it first, then open this link again.</ErrorBox>
          <Link to="/shared" className={`${primaryBtn} block text-center`}>Go to shared budgets</Link>
        </>
      ) : (
        <>
          <button onClick={join} disabled={busy} className={primaryBtn}>{busy ? "Joining…" : "Join household"}</button>
          <Link to="/shared" onClick={done} className={`${secondary} mt-3`}>Not now</Link>
        </>
      )}
    </AuthCard>
  );
}