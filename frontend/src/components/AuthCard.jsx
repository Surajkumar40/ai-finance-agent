import { Link } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

const Sun = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
);
const Moon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>
);

// Light/dark switch used on the sign-in style pages
export function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button onClick={toggle} aria-pressed={dark} aria-label="Dark mode"
      className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-slate-500 transition-colors hover:text-slate-800 dark:hover:text-slate-100">
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}

// Logo mark + name
export function Brand({ light = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${light ? "bg-white/15" : "bg-brand-500"}`}>
        <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>
      </div>
      <span className={`text-sm font-semibold tracking-tight ${light ? "text-white" : "text-slate-900 dark:text-slate-100"}`}>
        Finance<span className={light ? "text-brand-300" : "text-brand-500 dark:text-brand-400"}> AI</span>
      </span>
    </div>
  );
}

// Left half of the sign-in and sign-up pages (hidden on phones). Flat colour, plain list, only claims the app really backs up.
export function BrandPanel({ title, text, points }) {
  return (
    <div className="hidden flex-col justify-between bg-brand-900 p-12 lg:flex lg:w-[44%]">
      <Brand light />
      <div>
        <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight text-white">{title}</h2>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-brand-100">{text}</p>
        <ul className="mt-8 space-y-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-sm text-brand-100">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-brand-300">Your data stays private to your account.</p>
    </div>
  );
}

// Small centred card used by the forgot-password and reset-password pages
export default function AuthCard({ title, subtitle, children }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-12">
      <ThemeToggle />
      <div className="w-full max-w-sm animate-slide-up">
        <Link to="/login" className="mb-8 inline-block"><Brand /></Link>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="mb-7 text-sm text-slate-500">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export const inputClass = "field !py-2.5";
export const labelClass = "field-label";
export const primaryBtn = "btn-primary w-full !py-2.5";
export function ErrorBox({ children }) {
  return (
    <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">{children}</div>
  );
}