import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import AuthCard, { inputClass, labelClass, primaryBtn, ErrorBox } from "../components/AuthCard";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [valid, setValid] = useState(null); // null = checking the link
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // find out straight away if the link is still good
  useEffect(() => {
    let cancelled = false;
    if (!token) { Promise.resolve().then(() => { if (!cancelled) setValid(false); }); return () => { cancelled = true; }; }
    api.get("/account/reset-password/check", { params: { token } })
      .then(res => { if (!cancelled) setValid(!!res.data?.valid); })
      .catch(() => { if (!cancelled) setValid(true); }); // cannot tell (server asleep?), so let them try
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setLoading(true);
    try {
      await api.post("/account/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || "Could not change the password. Please try again.");
    } finally { setLoading(false); }
  };

  if (valid === null) {
    return <AuthCard title="One moment…" subtitle="Checking your reset link."><p className="text-sm text-slate-400">The server may need a few seconds to wake up.</p></AuthCard>;
  }

  if (done) {
    return (
      <AuthCard title="Password changed" subtitle="You can now sign in with your new password.">
        <button onClick={() => navigate("/login")} className={primaryBtn}>Go to sign in</button>
      </AuthCard>
    );
  }

  if (!valid) {
    return (
      <AuthCard title="This link has expired" subtitle="Reset links work once and only for 1 hour.">
        <Link to="/forgot-password" className={`${primaryBtn} block text-center`}>Get a new link</Link>
        <Link to="/login" className="block text-center text-sm text-brand-500 hover:text-brand-600 font-medium mt-6">Back to sign in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="Pick something you have not used before.">
      {error && <ErrorBox>{error}</ErrorBox>}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="rp-new">New password</label>
          <input id="rp-new" type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="At least 6 characters" required autoFocus className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="rp-confirm">Type it again</label>
          <input id="rp-confirm" type={show ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Same password" required className={inputClass} />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
          <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show passwords
        </label>
        <button type="submit" disabled={loading} className={primaryBtn}>{loading ? "Saving…" : "Change password"}</button>
      </form>
    </AuthCard>
  );
}