import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext();

const COLORS = { light: "#f6f5f1", dark: "#141413" }; // same as --canvas in index.css

const readSaved = () => {
  try { return localStorage.getItem("theme"); } catch { return null; }
};

// Puts the theme on <html>: the class Tailwind reads, the browser's own colour scheme (scrollbars, form controls)
// and the colour of the phone's address bar.
function applyTheme(dark) {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  root.style.backgroundColor = dark ? COLORS.dark : COLORS.light;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? COLORS.dark : COLORS.light);
}

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    const saved = readSaved();
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => { applyTheme(dark); }, [dark]);

  // Until the person picks a theme themselves, follow the device when it switches (for example at sunset).
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => { if (!readSaved()) setDark(e.matches); };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Only a deliberate click is remembered. A short fade is switched on so colours blend instead of snapping.
  const toggle = useCallback(() => {
    const root = document.documentElement;
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 300);
    setDark((d) => {
      const next = !d;
      try { localStorage.setItem("theme", next ? "dark" : "light"); } catch { /* private mode: still switches for this visit */ }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ dark, toggle }), [dark, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// The hook lives next to its provider on purpose; only dev hot-reload cares.
// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);