import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

// Small centred card used by the forgot-password and reset-password pages
export default function AuthCard({ title, subtitle, children }) {
  const { dark, toggle } = useTheme();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d0d14] flex flex-col justify-center items-center px-6 py-12 relative transition-colors duration-300">
      <button onClick={toggle} aria-label="Toggle theme"
        className="absolute top-5 right-5 w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10
                   bg-white dark:bg-[#16161f] text-slate-500 dark:text-slate-400
                   flex items-center justify-center hover:border-brand-400 transition-all shadow-sm">
        {dark
          ? <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
      </button>

      <div className="w-full max-w-sm animate-slide-up">
        <Link to="/login" className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 2v20M2 12h20"/></svg>
          </div>
          <span className="font-bold text-slate-900 dark:text-white">Finance<span className="text-brand-500">AI</span></span>
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400 dark:text-slate-500 mb-7">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export const inputClass = `w-full px-4 py-3 rounded-xl text-sm
  bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10
  text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600
  focus:outline-none focus:border-brand-400 dark:focus:border-brand-500
  focus:ring-2 focus:ring-brand-400/20 transition-all`;
export const labelClass = "block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5";
export const primaryBtn = `w-full py-3 rounded-xl font-semibold text-sm text-white bg-brand-500 hover:bg-brand-600 active:scale-95
  disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 shadow-lg shadow-brand-500/25`;
export function ErrorBox({ children }) {
  return (
    <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">{children}</div>
  );
}