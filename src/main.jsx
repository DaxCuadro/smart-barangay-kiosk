import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { injectSpeedInsights } from '@vercel/speed-insights'
import './index.css'
import App from './App.jsx'

try { injectSpeedInsights() } catch { /* Speed Insights unsupported in this browser */ }

// ── One-time cleanup of stale Supabase auth tokens ──────────────────────
// Older versions of the app used a single default Supabase client whose
// tokens were stored under the default key `sb-<project-ref>-auth-token`.
// This key is no longer used (each panel has its own storageKey), but if it
// is still in localStorage it causes a spurious token-refresh request on
// startup that can trigger Supabase's 429 rate-limit and instant sign-out.
//
// Panel-specific keys with deeply expired refresh tokens (>30 days) are
// also cleaned up to prevent the same issue on machines that haven't been
// used in a while.
const AUTH_CLEANUP_VERSION = 1;
if (typeof localStorage !== 'undefined') {
  const doneKey = '_sbk_auth_cleanup';
  const done = Number(localStorage.getItem(doneKey) || '0');

  if (done < AUTH_CLEANUP_VERSION) {
    // Remove the old default key (any project ref)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && /^sb-[a-z]+-auth-token$/.test(key) && key !== 'sb-admin-auth-token' && key !== 'sb-superadmin-auth-token' && key !== 'sb-resident-auth-token') {
        localStorage.removeItem(key);
      }
    }

    // For each panel key, remove the token if the refresh token has expired.
    // Supabase refresh tokens expire in 7 days by default; we use a generous
    // 30-day threshold so legitimate sessions are not disrupted.
    const panelKeys = ['sb-admin-auth-token', 'sb-superadmin-auth-token', 'sb-resident-auth-token'];
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    for (const key of panelKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const expiresAt = parsed?.expires_at; // epoch seconds
        if (expiresAt && (expiresAt * 1000) < (Date.now() - THIRTY_DAYS_MS)) {
          localStorage.removeItem(key);
        }
      } catch {
        // Corrupt entry — remove it
        localStorage.removeItem(key);
      }
    }

    localStorage.setItem(doneKey, String(AUTH_CLEANUP_VERSION));
  }
}

// In dev mode, unregister any leftover service workers to prevent unwanted
// caching / auto-reload behaviour from previously-installed PWA workers.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const reg of registrations) {
      reg.unregister();
      console.log('[dev] Unregistered stale service worker:', reg.scope);
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
