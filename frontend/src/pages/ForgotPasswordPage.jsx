import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import AuthCard, { inputClass, labelClass, primaryBtn, ErrorBox } from "../components/AuthCard";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // server message once sent

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await api.post("/account/forgot-password", { email: email.trim() });
      setDone(res.data?.message || "If that email belongs to an account, a reset link is on its way.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not send the email. Please try again.");
    } finally { setLoading(false); }
  };

  if (done) {
    return (
      <AuthCard title="Check your email" subtitle="We sent you a link to reset your password.">
        <div className="px-4 py-3 rounded-xl text-sm bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
          {done}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-4 leading-relaxed">
          Nothing in your inbox after a minute? Look in the spam folder, or{" "}
          <button onClick={() => setDone(null)} className="text-brand-500 hover:text-brand-600 font-medium">try again</button>.
        </p>
        <Link to="/login" className="block text-center text-sm text-brand-500 hover:text-brand-600 font-medium mt-6">Back to sign in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot your password?" subtitle="Enter your email and we'll send you a link to choose a new one.">
      {error && <ErrorBox>{error}</ErrorBox>}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="fp-email">Email</label>
          <input id="fp-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" required autoFocus className={inputClass} />
        </div>
        <button type="submit" disabled={loading || !email.trim()} className={primaryBtn}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="text-center text-sm text-slate-400 dark:text-slate-500 mt-6">
        Remembered it?{" "}
        <Link to="/login" className="text-brand-500 hover:text-brand-600 font-medium">Sign in</Link>
      </p>
    </AuthCard>
  );
}