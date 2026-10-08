import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import NotificationBell from "./NotificationBell";

const navItems = [
  { to: "/dashboard",    label: "Dashboard",    icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )},
  { to: "/transactions", label: "Transactions", icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4"/>
    </svg>
  )},
  { to: "/recurring",    label: "Recurring",    icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>
    </svg>
  )},
  { to: "/goals",        label: "Goals",        icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>
    </svg>
  )},
  { to: "/ai",           label: "AI Agent",     icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M12 2a4 4 0 0 1 4 4v1h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v1a4 4 0 0 1-8 0v-1H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1V6a4 4 0 0 1 4-4z"/>
      <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/>
      <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/>
    </svg>
  )},
];

export default function Layout({ children }) {
  const { logout, user } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/login"); };
  const initials = user?.name
    ? user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "U";

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-[#0d0d14] transition-colors duration-300">

      {/* Sidebar */}
      <aside className="w-[220px] fixed top-0 left-0 h-screen flex flex-col
                        bg-white dark:bg-[#11111a]
                        border-r border-slate-100 dark:border-white/5
                        px-3 py-5 z-50">

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-2 pb-5 mb-2 border-b border-slate-100 dark:border-white/5">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path d="M12 2v20M2 12h20"/>
              <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" opacity="0.4"/>
            </svg>
          </div>
          <div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">Finance</span>
            <span className="text-sm font-semibold text-brand-500 tracking-tight">AI</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 flex-1">
          <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-widest px-2 mb-1 mt-1">
            Main
          </p>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 relative
                ${isActive
                  ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-slate-200"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-500 rounded-r-full" />
                  )}
                  {item.icon}
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-100 dark:border-white/5 pt-3 flex flex-col gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 dark:text-slate-400
                       hover:bg-slate-50 dark:hover:bg-white/5 transition-all w-full"
          >
            {dark ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
            {dark ? "Light mode" : "Dark mode"}
          </button>

          {/* User */}
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-brand-500/10 border border-brand-500/20
                            flex items-center justify-center text-[11px] font-semibold text-brand-500 font-mono">
              {initials}
            </div>
            <span className="text-xs text-slate-600 dark:text-slate-400 truncate flex-1">{user?.name ?? "User"}</span>
            <NotificationBell />
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm w-full
                       text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-white/5
                       hover:border-red-200 dark:hover:border-red-500/20
                       hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/5
                       transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-[220px] flex-1 p-8 animate-fade-in">
        {children}
      </main>
    </div>
  );
}