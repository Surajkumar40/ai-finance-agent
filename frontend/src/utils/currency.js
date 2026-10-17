// Display currency. Numbers are stored as they are; this only chooses the symbol and the digit grouping.
// There is NO conversion: switching the currency relabels amounts, it does not recalculate them.
import { useSyncExternalStore } from "react";
import api from "../api/axios";

export const CURRENCY_LOCALES = {
  INR: "en-IN", USD: "en-US", EUR: "en-IE", GBP: "en-GB", AED: "en-AE", SGD: "en-SG", AUD: "en-AU", CAD: "en-CA", JPY: "en-US",
};
const DEFAULT = "INR";
const valid = (c) => typeof c === "string" && Object.prototype.hasOwnProperty.call(CURRENCY_LOCALES, c);

const readSaved = () => { try { const c = localStorage.getItem("currency"); return valid(c) ? c : DEFAULT; } catch { return DEFAULT; } };
let code = readSaved();
let syncedFor = null;
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const getCurrency = () => code;

export function setCurrency(c) {
  if (!valid(c) || c === code) return;
  code = c;
  try { localStorage.setItem("currency", c); } catch { /* private mode: fine */ }
  listeners.forEach((f) => f());
}

// forget the previous person's choice (called on sign-out)
export function resetCurrency() {
  syncedFor = null;
  try { localStorage.removeItem("currency"); } catch { /* ignore */ }
  code = DEFAULT;
  listeners.forEach((f) => f());
}

// reads the saved choice from the server once per sign-in
export async function syncCurrency(token) {
  if (!token || syncedFor === token) return;
  syncedFor = token;
  try {
    const r = await api.get("/account/me");
    if (syncedFor === token) setCurrency(r.data.currency);
  } catch { syncedFor = null; /* try again on the next page */ }
}

const cache = new Map();
const nf = (c, max, min) => {
  const d = c === "JPY" ? 0 : max;
  const key = `${c}:${Math.min(min, d)}:${d}`;
  if (!cache.has(key)) cache.set(key, new Intl.NumberFormat(CURRENCY_LOCALES[c], { style: "currency", currency: c, minimumFractionDigits: Math.min(min, d), maximumFractionDigits: d }));
  return cache.get(key);
};

// fmt(1234.5) -> "₹1,235" · fmt(1234.5, 2) -> "₹1,234.5" · fmt(1234.5, 2, 2) -> "₹1,234.50"
export const fmt = (n, max = 0, min = 0) => nf(code, max, min).format(Number(n) || 0);

// the symbol alone, for input prefixes ("₹", "$", "AED")
export const symbol = () => (nf(code, 0, 0).formatToParts(0).find((p) => p.type === "currency") || { value: code }).value;

// short form for chart axes: ₹1.2L, ₹3Cr for rupees; $1.2K, $3M for the rest. Keeps the sign in front.
export function compact(n) {
  const v = Number(n) || 0, a = Math.abs(v), s = v < 0 ? "-" : "";
  const sym = symbol();
  if (code === "INR") {
    if (a >= 10000000) return `${s}${sym}${+(a / 10000000).toFixed(1)}Cr`;
    if (a >= 100000) return `${s}${sym}${+(a / 100000).toFixed(1)}L`;
    if (a >= 1000) return `${s}${sym}${+(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
    return `${s}${sym}${Math.round(a)}`;
  }
  const c = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(a);
  return `${s}${sym}${c}`;
}

// components that show money call this so they redraw when the currency changes
export const useCurrency = () => useSyncExternalStore(subscribe, getCurrency);