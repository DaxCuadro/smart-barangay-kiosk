# Smart Barangay Kiosk

An offline-first Progressive Web App (PWA) kiosk system designed for Philippine barangays. It enables residents to request documents and allows barangay admins to manage residents, announcements, events, and document requests — all from a single touchscreen-friendly interface.

## Features

- **Document Requests** — Residents can request barangay clearances and other documents via kiosk
- **Resident Management** — Admins can add, view, and verify residents
- **Announcements & Events** — Post barangay announcements and manage a community calendar
- **Barangay Info Management** — Configure barangay name, officials, and branding (seal/logo)
- **Pricing Configuration** — Set fees for document types
- **Multi-Barangay Support** — Super admin can manage multiple barangay tenants
- **PWA / Offline Support** — Works as an installable app; service worker for offline capability
- **PDF Generation** — Generates printable barangay clearance PDFs

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite |
| Styling | TailwindCSS |
| Backend / Database | Supabase (PostgreSQL + Auth + Storage) |
| PDF Generation | jsPDF |
| PWA | vite-plugin-pwa + Workbox |

## Getting Started (Local Development)

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/smart-barangay-kiosk.git
cd smart-barangay-kiosk
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file in the project root:

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

You can find these in your Supabase project under **Settings → API**.

> **Never commit `.env.local` or any `.env` file to the repository.**

### 4. Run database migrations

Apply all SQL files in `supabase/migrations/` to your Supabase project in order (001 → 021) via the Supabase SQL Editor.

### 5. Start the development server

```bash
npm run dev
```

App runs at `http://localhost:5173` by default.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |

## Project Structure

```
src/
├── App.jsx                  # Main app / routing
├── supabaseClient.js        # Supabase client initialization
├── components/
│   ├── AdminDashboard.jsx   # Admin panel shell
│   ├── AdminLogin.jsx       # Admin login screen
│   ├── SuperAdminDashboard.jsx
│   ├── admin-dashboard-tabs/ # Individual admin tabs
│   ├── kiosk/               # Public-facing kiosk screens
│   ├── resident/            # Resident portal screens
│   └── ui/                  # Shared UI components
├── contexts/                # React context providers
├── hooks/                   # Custom React hooks
└── utils/                   # Utility functions (PDF gen, storage)
supabase/
├── migrations/              # SQL migration files (apply in order)
└── functions/               # Supabase Edge Functions
```

## Environment Variables Reference

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous/public API key |
