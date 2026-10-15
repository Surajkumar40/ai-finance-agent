// Registers the service worker and shares install / update / offline state with the UI.
// Everything here is safe to call anywhere: if the browser has no support, it quietly does nothing.

let deferredInstall = null;
let waitingWorker = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch { return false; }
}
export function isIosSafari() {
  const ua = window.navigator.userAgent || '';
  const ios = /iphone|ipad|ipod/i.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
  return ios && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
}
export const canInstall = () => !!deferredInstall;
export const updateReady = () => !!waitingWorker;

export async function promptInstall() {
  if (!deferredInstall) return 'unavailable';
  const ev = deferredInstall;
  deferredInstall = null; emit();      // the browser allows one prompt per event
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    return choice?.outcome || 'dismissed';
  } catch { return 'dismissed'; }
}

export function applyUpdate() {
  if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

export function initPwa() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; emit(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; emit(); });

  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return; // not in `npm run dev`: it would cache stale files

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const track = (sw) => {
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // "installed" while another version is running = a new version is waiting
          if (sw.state === 'installed' && navigator.serviceWorker.controller) { waitingWorker = sw; emit(); }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) { waitingWorker = reg.waiting; emit(); }
      track(reg.installing);
      reg.addEventListener('updatefound', () => track(reg.installing));
      // look for a new version now and then while the app stays open
      setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
    }).catch(() => { /* registration failed: the app still works normally */ });

    // Reload after an update the person accepted. On the very first visit there is no previous version
    // (the new worker simply takes over), and reloading then would flash the page for nothing.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return; reloading = true; window.location.reload();
    });
  });
}