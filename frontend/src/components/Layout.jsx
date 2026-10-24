import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import NotificationBell from "./NotificationBell";
import { syncCurrency } from "../utils/currency";

// One line-icon style for the whole sidebar: 24px grid, 1.75 stroke, drawn at 16px.
const Icon = ({ children }) => (
  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
);

const icons = {
  dashboard: <Icon><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Icon>,
  transactions: <Icon><path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4"/></Icon>,
  budgets: <Icon><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z"/></Icon>,
  categories: <Icon><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01"/></Icon>,
  shared: <Icon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></Icon>,
  recurring: <Icon><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></Icon>,
  forecast: <Icon><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></Icon>,
  goals: <Icon><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></Icon>,
  networth: <Icon><path d="M3 21h18M5 21V10m5 11V6m5 15v-8m5 8V3"/></Icon>,
  simulator: <Icon><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></Icon>,
  reports: <Icon><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6"/></Icon>,
  ai: <Icon><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 11h6M9 14h3"/></Icon>,
  profile: <Icon><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></Icon>,
};

// Pages grouped by what you do there. Routes are unchanged.
const navGroups = [
  { label: "Overview", items: [
    { to: "/dashboard", label: "Dashboard", icon: icons.dashboard },
    { to: "/transactions", label: "Transactions", icon: icons.transactions },
  ]},
  { label: "Plan", items: [
    { to: "/budgets", label: "Budgets", icon: icons.budgets },
    { to: "/recurring", label: "Recurring", icon: icons.recurring },
    { to: "/goals", label: "Goals", icon: icons.goals },
    { to: "/categories", label: "Categories", icon: icons.categories },
    { to: "/shared", label: "Shared", icon: icons.shared },
  ]},
  { label: "Insight", items: [
    { to: "/forecast", label: "Forecast", icon: icons.forecast },
    { to: "/networth", label: "Net worth", icon: icons.networth },
    { to: "/simulator", label: "What-if", icon: icons.simulator },
    { to: "/reports", label: "Reports", icon: icons.reports },
    { to: "/ai", label: "AI assistant", icon: icons.ai },
  ]},
];

// Set once the first page of this visit has been shown
let pageShown = false;

// True while the screen is wide enough for the permanent sidebar (Tailwind's lg breakpoint).
function useIsDesktop() {
  const query = "(min-width: 1024px)";
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const onChange = (e) => setMatch(e.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);
  return match;
}

const rowBase =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150";

export default function Layout({ children }) {
  const { logout, user, token } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  useEffect(() => { syncCurrency(token); }, [token]); // the saved display currency, read once per sign-in
  const [menuOpen, setMenuOpen] = useState(false); // phone: the menu slides in over the page
  const menuButton = useRef(null);
  const mainRef = useRef(null);
  const asideRef = useRef(null);

  const handleLogout = () => { logout(); navigate("/login"); };
  const isDemo = (user?.email || "").endsWith("@demo.local");
  const leaveDemo = () => { logout(); navigate("/signup"); };
  const initials = user?.name
    ? user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "U";

  const closeMenu = useCallback((returnFocus = true) => {
    setMenuOpen(false);
    if (returnFocus) menuButton.current?.focus();
  }, []);

  // Open drawer: Escape closes it, the page behind does not scroll, focus moves inside and stays inside.
  const drawerOpen = menuOpen && !isDesktop;
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = asideRef.current?.querySelector("a, button");
    first?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { closeMenu(); return; }
      if (e.key !== "Tab") return;
      const focusable = asideRef.current?.querySelectorAll("a[href], button:not([disabled])");
      if (!focusable?.length) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", onKey); };
  }, [drawerOpen, closeMenu]);

  // Each page renders its own Layout, so this runs once per page visit. After the first page of a visit, move focus to the
  // new page's content so keyboard and screen reader users start at the top of it. (The timer keeps dev double-runs harmless.)
  useEffect(() => {
    const t = setTimeout(() => {
      if (pageShown) mainRef.current?.focus({ preventScroll: true });
      pageShown = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // When the drawer is shut on a phone it is off-screen, so keep keyboard and screen reader users out of it.
  const hiddenDrawer = !isDesktop && !menuOpen;

  return (
    <div className="flex min-h-screen bg-canvas print:bg-white">

      <a href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white">
        Skip to content
      </a>

      {/* Phone: dim layer behind the open menu. Tap it to close. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 animate-overlay-in lg:hidden print:hidden" onClick={() => closeMenu()} aria-hidden="true" />
      )}

      <aside
        ref={asideRef}
        id="sidebar"
        inert={hiddenDrawer}
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? "true" : undefined}
        aria-label="Main menu"
        className={`fixed top-0 z-50 flex h-screen w-[232px] flex-col border-r border-line bg-surface px-3 py-4
                    transition-[left] duration-200 print:hidden
                    ${menuOpen ? "left-0" : "-left-[232px] lg:left-0"}`}
        onClick={(e) => { if (e.target.closest("a")) setMenuOpen(false); }}
      >
        {/* Logo */}
        <div className="mb-3 flex items-center gap-2.5 px-2 pb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
            <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>
            </svg>
          </div>
          <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Finance<span className="text-brand-500 dark:text-brand-400"> AI</span>
          </div>
        </div>

        {/* Nav */}
        <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {navGroups.map(group => (
            <div key={group.label}>
              <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">{group.label}</p>
              <div className="flex flex-col gap-0.5">
                {group.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    className={({ isActive }) =>
                      `${rowBase} relative font-medium ${isActive
                        ? "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-slate-100"
                        : "text-slate-500 hover:bg-slate-100/70 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-slate-100"}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-500 dark:bg-brand-400" />}
                        {item.icon}
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
          {isDemo && (
            <div className="mb-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-snug text-amber-700">
              <p className="font-semibold">Demo account</p>
              <p className="mt-0.5">Sample data, deleted after a day.</p>
              <button onClick={leaveDemo} className="mt-1.5 text-left font-semibold underline hover:no-underline">
                Create your own account
              </button>
            </div>
          )}

          <button
            onClick={toggle}
            aria-pressed={dark}
            className={`${rowBase} text-slate-500 hover:bg-slate-100/70 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-slate-100`}
          >
            {dark ? (
              <Icon><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></Icon>
            ) : (
              <Icon><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></Icon>
            )}
            {dark ? "Light mode" : "Dark mode"}
          </button>

          <div className="flex items-center gap-1">
            <NavLink to="/profile" aria-label="Profile"
              className={({ isActive }) => `flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${isActive ? "bg-slate-100 dark:bg-white/10" : "hover:bg-slate-100/70 dark:hover:bg-white/5"}`}>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 font-mono text-[11px] font-medium text-slate-600">
                {initials}
              </div>
              <span className="flex-1 truncate text-xs text-slate-600">{user?.name ?? "User"}</span>
            </NavLink>
            <NotificationBell />
          </div>

          <button
            onClick={handleLogout}
            className={`${rowBase} text-slate-500 hover:bg-red-500/10 hover:text-red-600`}
          >
            <Icon><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></Icon>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1 lg:ml-[232px] print:ml-0">
        {/* Phone: top bar with the menu button */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden print:hidden">
          <button
            ref={menuButton}
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="sidebar"
            className="-ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">Finance<span className="text-brand-500 dark:text-brand-400"> AI</span></span>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className="animate-fade-in p-4 outline-none sm:p-6 lg:p-8 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}