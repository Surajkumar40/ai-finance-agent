import { vi } from "vitest";

// jsdom has no matchMedia. This fake lets a test choose whether the screen is "dark" or "wide",
// and switch it later to prove that the app reacts.
export function mockMatchMedia({ dark = false, desktop = false } = {}) {
  const state = { dark, desktop };
  const listeners = new Set();
  const matches = (query) => (query.includes("prefers-color-scheme: dark") ? state.dark : query.includes("min-width") ? state.desktop : false);
  window.matchMedia = vi.fn((query) => {
    const mql = {
      media: query,
      get matches() { return matches(query); },
      addEventListener: (_, fn) => listeners.add({ fn, query }),
      removeEventListener: (_, fn) => { for (const l of listeners) if (l.fn === fn) listeners.delete(l); },
      addListener() {}, removeListener() {}, dispatchEvent: () => false,
    };
    return mql;
  });
  return {
    set(next) {
      Object.assign(state, next);
      for (const { fn, query } of [...listeners]) fn({ matches: matches(query), media: query });
    },
  };
}