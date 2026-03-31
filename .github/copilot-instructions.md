# Copilot Instructions for Smart Barangay Kiosk

## Project Overview
- **Framework:** React 19 + Vite
- **Purpose:** Offline-first kiosk for document requests & resident management in Philippine barangays
- **Key Features:** PWA (Progressive Web App), Supabase integration, TailwindCSS for styling

## Architecture & Data Flow
- **Entry Point:** `src/main.jsx` renders `App` into `#root`.
- **App Structure:** Main UI logic in `src/App.jsx`. Asset images in `src/assets/`.
- **State Management:** Local React state (no Redux/MobX).
- **Backend:** Supabase client in `src/supabaseClient.js` (credentials via Vite env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- **PWA:** Configured via `vite-plugin-pwa` in `vite.config.js`. Service worker files in `dev-dist/`.
- **Styling:** TailwindCSS via plugin (`tailwind.config.js`, `postcss.config.js`).

## Developer Workflows
- **Start Dev Server:** `npm run dev` (default port 5173; override with `npx vite --port=4000`)
- **Build:** `npm run build`
- **Preview Production Build:** `npm run preview`
- **Lint:** `npm run lint` (ESLint config in `eslint.config.js`)
- **PWA Testing:** Enable/disable PWA features in `vite.config.js` (`devOptions.enabled`).

## Conventions & Patterns
- **Component Files:** Use `.jsx` for React components. Keep assets in `src/assets/`.
- **Environment Variables:** Use Vite's `import.meta.env` for secrets/config.
- **Service Worker:** Custom logic in `dev-dist/sw.js`, registration in `dev-dist/registerSW.js`.
- **Static Assets:** Place icons/images in `public/` for PWA manifest and general use.
- **No TypeScript:** Project is pure JS/JSX (TypeScript not enabled).

## Integration Points
- **Supabase:** All backend calls via `src/supabaseClient.js`. Do not hardcode credentials.
- **PWA:** Manifest and icons defined in `vite.config.js`. Service worker auto-updates.
- **TailwindCSS:** Utility classes in CSS/JSX. Config in `tailwind.config.js`.

## Key Files & Directories
- `src/main.jsx`, `src/App.jsx`: Main app logic
- `src/supabaseClient.js`: Supabase integration
- `dev-dist/`: Service worker and PWA files
- `public/`: Static assets for PWA
- `vite.config.js`: Build, plugin, and PWA config
- `tailwind.config.js`, `postcss.config.js`: Styling config

---
**For AI agents:**
- Follow the above conventions for new components, integrations, and workflows.
- Reference existing files for patterns and structure.
- Use Vite and React idioms; avoid introducing TypeScript or Redux unless requested.
- Keep PWA and Supabase integration patterns consistent with current usage.
