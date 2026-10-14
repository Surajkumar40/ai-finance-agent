// Remembers an invite link while the person signs in or signs up, so they land back on it afterwards.
const KEY = "pending-invite";
export const pendingInvite = {
  get: () => { try { return sessionStorage.getItem(KEY) || ""; } catch { return ""; } },
  set: (t) => { try { sessionStorage.setItem(KEY, t); } catch { /* ignore */ } },
  clear: () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } },
};