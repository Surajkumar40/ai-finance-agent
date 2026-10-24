import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { Brand, BrandPanel, ThemeToggle, ErrorBox, inputClass, labelClass } from "../components/AuthCard";

export default function SignupPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await api.post("/auth/register", form);
      login(res.data.token, res.data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Signup failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen bg-canvas">
      <BrandPanel
        title="Take control of your money, one month at a time."
        text="Set it up in a minute. Add transactions by hand, by voice, or from a receipt photo."
        points={["Budgets with alerts before you overspend", "Savings goals with a projected finish date", "Share expenses with your household"]}
      />

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-12 lg:px-16">
        <ThemeToggle />
        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-8 lg:hidden"><Brand /></div>

          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Create account</h1>
          <p className="mb-7 text-sm text-slate-500">Free forever · No credit card needed</p>

          {error && <ErrorBox>{error}</ErrorBox>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className={labelClass}>Full name</label>
              <input id="name" type="text" name="name" value={form.name} onChange={handleChange} autoComplete="name"
                placeholder="Suraj Kumar" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>Email</label>
              <input id="email" type="email" name="email" value={form.email} onChange={handleChange} autoComplete="email"
                placeholder="you@example.com" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>Password</label>
              <div className="relative">
                <input id="password" type={showPass ? "text" : "password"} name="password" value={form.password} autoComplete="new-password"
                  onChange={handleChange} placeholder="Min 8 characters" required minLength={8}
                  className={inputClass + " pr-11"} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-100">
                  {showPass ? <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg> : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                </button>
              </div>
              {/* Password strength bar */}
              {form.password && (
                <div className="mt-2 flex gap-1" aria-hidden="true">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      form.password.length >= i*3
                        ? i <= 2 ? "bg-red-500" : i === 3 ? "bg-amber-500" : "bg-emerald-500"
                        : "bg-slate-200 dark:bg-white/10"
                    }`} />
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={loading} className="btn-primary mt-2 w-full !py-2.5">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  Creating account…
                </span>
              ) : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-brand-600 hover:underline dark:text-brand-400">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}