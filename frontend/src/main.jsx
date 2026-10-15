import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import InstallPrompt from './components/InstallPrompt.jsx'
import { initPwa } from './utils/pwa.js'

initPwa()

// After a new release, a tab that was left open may ask for a page file that no longer exists.
// Reload once to pick up the new version (the flag stops a reload loop if something is really wrong).
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    if (sessionStorage.getItem('reloaded-for-update')) return;
    sessionStorage.setItem('reloaded-for-update', '1');
  } catch { /* storage blocked: reload anyway, once per page load */ }
  window.location.reload();
});

// the app started fine, so a later release may use the reload again
setTimeout(() => { try { sessionStorage.removeItem('reloaded-for-update'); } catch { /* ignore */ } }, 15000);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
        <InstallPrompt />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)