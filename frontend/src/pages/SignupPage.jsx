import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function SignupPage() {
  const { login } = useAuth();
  const { dark, toggle } = useTheme();
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
      const res = await axios.post("http://localhost:5000/api/auth/register", form);
      login(res.data.token, res.data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Signup failed");
    } finally { setLoading(false); }
  };

  const inputClass = `w-full px-4 py-3 rounded-xl text-sm
    bg-slate-100 dark:bg-white/5
    border border-slate-200 dark:border-white/10
    text-slate-900 dark:text-white
    placeholder-slate-400 dark:placeholder-slate-600
    focus:outline-none focus:border-brand-400 dark:focus:border-brand-500
    focus:ring-2 focus:ring-brand-400/20 transition-all`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d0d14] flex transition-colors duration-300">

      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-violet-600 via-brand-500 to-brand-600 relative overflow-hidden flex-col justify-between p-12">
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute rounded-full border border-white"
              style={{ width:`${(i+1)*120}px`, height:`${(i+1)*120}px`, top:'50%', left:'50%', transform:'translate(-50%,-50%)' }}/>
          ))}
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path d="M12 2v20M2 12h20"/>
            </svg>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">FinanceAI</span>
        </div>
        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            Start your journey<br/>to financial freedom.
          </h2>
          <p className="text-white/70 text-base leading-relaxed max-w-sm">
            Join thousands who use AI to take control of their money — effortlessly.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              { icon: "🤖", title: "AI Agent", desc: "Monitors 24/7" },
              { icon: "📸", title: "OCR Scanner", desc: "Scan receipts" },
              { icon: "📊", title: "Smart Charts", desc: "Live insights" },
              { icon: "🔔", title: "Alerts", desc: "Before you overspend" },
            ].map((f, i) => (
              <div key={i} className="bg-white/10 backdrop-blur rounded-xl p-3">
                <div className="text-xl mb-1">{f.icon}</div>
                <p className="text-white font-semibold text-sm">{f.title}</p>
                <p className="text-white/60 text-xs">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-white/40 text-xs">No credit card required · Free forever</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 lg:px-16 relative">

        <button onClick={toggle}
          className="absolute top-5 right-5 w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10
                     bg-white dark:bg-[#16161f] text-slate-500 dark:text-slate-400
                     flex items-center justify-center hover:border-brand-400 transition-all shadow-sm">
          {dark
            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          }
        </button>

        <div className="w-full max-w-sm animate-slide-up">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 2v20M2 12h20"/></svg>
            </div>
            <span className="font-bold text-slate-900 dark:text-white">Finance<span className="text-brand-500">AI</span></span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1 tracking-tight">Create account</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-7">Free forever · No credit card needed</p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Full Name</label>
              <input type="text" name="name" value={form.name} onChange={handleChange}
                placeholder="Suraj Kumar" required className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange}
                placeholder="you@example.com" required className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} name="password" value={form.password}
                  onChange={handleChange} placeholder="Min 6 characters" required minLength={6}
                  className={inputClass + " pr-11"} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
                  {showPass
                    ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              {/* Password strength bar */}
              {form.password && (
                <div className="mt-2 flex gap-1">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                      form.password.length >= i*3
                        ? i <= 2 ? "bg-red-400" : i === 3 ? "bg-amber-400" : "bg-emerald-400"
                        : "bg-slate-200 dark:bg-white/10"
                    }`} />
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white
                         bg-brand-500 hover:bg-brand-600 active:scale-95
                         disabled:opacity-60 disabled:cursor-not-allowed
                         transition-all duration-150 shadow-lg shadow-brand-500/25 mt-2">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Creating account…
                </span>
              ) : "Create account →"}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 dark:text-slate-500 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-brand-500 hover:text-brand-600 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}