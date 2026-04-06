import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { injectSpeedInsights } from '@vercel/speed-insights'
import './index.css'
import App from './App.jsx'

try { injectSpeedInsights() } catch { /* Speed Insights unsupported in this browser */ }

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
