import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { Brand, BrandPanel, ThemeToggle, ErrorBox, inputClass, labelClass } from "../components/AuthCard";

const pad = n => String(n).padStart(2, "0");
// the visitor's own calendar date, so the sample data lines up with "today" for them
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await api.post("/auth/login", form);
      login(res.data.token, res.data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally { setLoading(false); }
  };

  const startDemo = async () => {
    setDemoLoading(true); setError("");
    try {
      const res = await api.post("/demo", { today: localToday() });
      login(res.data.token, res.data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Could not start the demo. Please try again.");
    } finally { setDemoLoading(false); }
  };

  return (
    <div className="flex min-h-screen bg-canvas">
      <BrandPanel
        title="Know where your money goes."
        text="Track spending, plan budgets and ask questions in plain language."
        points={["Budgets with alerts at 80% and 100%", "Scan a receipt photo to fill in the form", "Bills and goals in one dashboard"]}
      />

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-12 lg:px-16">
        <ThemeToggle />
        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-8 lg:hidden"><Brand /></div>

          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Sign in</h1>
          <p className="mb-7 text-sm text-slate-500">Welcome back. Enter your details below.</p>

          {error && <ErrorBox>{error}</ErrorBox>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className={labelClass}>Email</label>
              <input id="email" type="email" name="email" value={form.email} autoComplete="email"
                onChange={handleChange} placeholder="you@example.com" required className={inputClass} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-medium text-slate-600 dark:text-slate-300">Password</label>
                <Link to="/forgot-password" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">Forgot password?</Link>
              </div>
              <div className="relative">
                <input id="password" type={showPass ? "text" : "password"} name="password" value={form.password} autoComplete="current-password"
                  onChange={handleChange} placeholder="••••••••" required className={inputClass + " pr-11"} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-100">
                  {showPass ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg> : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary mt-2 w-full !py-2.5">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  Signing in…
                </span>
              ) : "Sign in"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="text-xs text-slate-500">or</span>
            <div className="h-px flex-1 bg-line" />
          </div>

          <button type="button" onClick={startDemo} disabled={demoLoading || loading} className="btn-secondary w-full !py-2.5">
            {demoLoading ? "Setting up your demo…" : "Try the demo, no sign-up needed"}
          </button>
          {demoLoading && (
            <p role="status" className="mt-2 text-center text-xs text-slate-500">
              The first visit can take up to a minute while the server wakes up.
            </p>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            Don't have an account?{" "}
            <Link to="/signup" className="font-medium text-brand-600 hover:underline dark:text-brand-400">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}