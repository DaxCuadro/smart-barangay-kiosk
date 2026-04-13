import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AdminLogin from './components/AdminLogin.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import PwaUpdatePrompt from './components/ui/PwaUpdatePrompt.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { SupabaseProvider } from './contexts/SupabaseContext.js';
import { getSupabaseAdmin, getSupabaseResident, getSupabaseSuperAdmin } from './supabaseClient.js';
import './App.css';

const AdminDashboard = lazy(() => import('./components/AdminDashboard.jsx'));
const SuperAdminDashboard = lazy(() => import('./components/SuperAdminDashboard.jsx'));
const KioskShell = lazy(() => import('./components/kiosk/KioskShell.jsx'));
const ResidentPortalShell = lazy(() => import('./components/resident/ResidentPortalShell.jsx'));

// If the PWA opens a URL that looks like a static file (e.g. .svg, .png),
// do a hard navigation so the server can serve it instead of React Router
// redirecting to "/".
function CatchAllRedirect() {
  const path = window.location.pathname;
  if (/\.\w+$/.test(path)) {
    window.location.replace(path);
    return null;
  }
  return <Navigate to="/" replace />;
}

// Thin wrapper that lazily creates the Supabase client when the route mounts,
// preventing all panel clients from being created (and refreshing tokens) on startup.
function LazySupabaseProvider({ getClient, children }) {
  const client = useMemo(() => getClient(), [getClient]);
  return <SupabaseProvider client={client}>{children}</SupabaseProvider>;
}

function App() {
  const [adminSession, setAdminSession] = useState(null);
  const [superAdminSession, setSuperAdminSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminChecking, setAdminChecking] = useState(true);
  const [superAdminChecking, setSuperAdminChecking] = useState(true);
  const [adminSessionLoaded, setAdminSessionLoaded] = useState(false);
  const [superAdminSessionLoaded, setSuperAdminSessionLoaded] = useState(false);

  // Track user IDs so role checks only re-run when the actual user changes,
  // not on every token refresh (which would unmount/remount the dashboard).
  const [adminUserId, setAdminUserId] = useState(null);
  const [superAdminUserId, setSuperAdminUserId] = useState(null);
  const adminUserIdRef = useRef(null);
  const superAdminUserIdRef = useRef(null);

  const location = useLocation();

  // Swap the PWA manifest based on the current section so each
  // "Add to Home Screen" installs as a separate app.
  useEffect(() => {
    const path = location.pathname;
    let href;
    if (path === '/kiosk') href = '/manifest-kiosk.json';
    else if (path === '/admin') href = '/manifest-admin.json';
    else if (path === '/superadmin') href = '/manifest-superadmin.json';
    else return; // default manifest handled by VitePWA plugin

    let link = document.querySelector('link[rel="manifest"]');
    if (link) {
      link.href = href;
    } else {
      link = document.createElement('link');
      link.rel = 'manifest';
      link.href = href;
      document.head.appendChild(link);
    }

    return () => {
      // Restore default manifest when navigating away
      const el = document.querySelector('link[rel="manifest"]');
      if (el) el.href = '/manifest.webmanifest';
    };
  }, [location.pathname]);

  // Admin session listener — only active on /admin route to avoid
  // creating the Supabase client (and triggering token refresh) on other routes.
  useEffect(() => {
    if (location.pathname !== '/admin') {
      // Not on admin route — reset state but don't create the client
      setAdminSession(null);
      setAdminUserId(null);
      adminUserIdRef.current = null;
      setAdminSessionLoaded(true);
      setAdminChecking(false);
      return;
    }

    setAdminSessionLoaded(false);
    setAdminChecking(true);

    const client = getSupabaseAdmin();
    let isMounted = true;

    // Single controlled session recovery: getSession reads from localStorage,
    // and if the access-token is expired it does ONE refresh request.
    // autoRefreshToken is OFF on this client so no background retry storm.
    client.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        // Refresh token is invalid/expired — clear stale session so the user
        // sees the login form instead of an infinite retry loop.
        client.auth.signOut({ scope: 'local' });
        setAdminSession(null);
        setAdminUserId(null);
        adminUserIdRef.current = null;
        setAdminSessionLoaded(true);
        return;
      }
      const session = data?.session ?? null;
      const uid = session?.user?.id ?? null;
      setAdminSession(session);
      setAdminUserId(uid);
      adminUserIdRef.current = uid;
      setAdminSessionLoaded(true);

      // Session is valid — enable auto-refresh so the token stays fresh
      // for the duration of this browsing session.
      if (session) {
        client.auth.startAutoRefresh();
      }
    });

    const { data: authListener } = client.auth.onAuthStateChange((event, newSession) => {
      if (!isMounted) return;
      // Ignore token refresh failures — keep existing session so users aren't kicked out
      if (event === 'TOKEN_REFRESHED' && !newSession) return;
      setAdminSession(newSession);
      // Only update user ID (triggering role re-check) if the user actually changed
      const newUid = newSession?.user?.id ?? null;
      if (newUid !== adminUserIdRef.current) {
        adminUserIdRef.current = newUid;
        setAdminUserId(newUid);
      }
      // Start auto-refresh after a successful login
      if (event === 'SIGNED_IN' && newSession) {
        client.auth.startAutoRefresh();
      }
      if (event === 'SIGNED_OUT') {
        client.auth.stopAutoRefresh();
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
      client.auth.stopAutoRefresh();
    };
  }, [location.pathname]);

  // SuperAdmin session listener — only active on /superadmin route
  useEffect(() => {
    if (location.pathname !== '/superadmin') {
      setSuperAdminSession(null);
      setSuperAdminUserId(null);
      superAdminUserIdRef.current = null;
      setSuperAdminSessionLoaded(true);
      setSuperAdminChecking(false);
      return;
    }

    setSuperAdminSessionLoaded(false);
    setSuperAdminChecking(true);

    const client = getSupabaseSuperAdmin();
    let isMounted = true;

    client.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        client.auth.signOut({ scope: 'local' });
        setSuperAdminSession(null);
        setSuperAdminUserId(null);
        superAdminUserIdRef.current = null;
        setSuperAdminSessionLoaded(true);
        return;
      }
      const session = data?.session ?? null;
      const uid = session?.user?.id ?? null;
      setSuperAdminSession(session);
      setSuperAdminUserId(uid);
      superAdminUserIdRef.current = uid;
      setSuperAdminSessionLoaded(true);

      if (session) {
        client.auth.startAutoRefresh();
      }
    });

    const { data: authListener } = client.auth.onAuthStateChange((event, newSession) => {
      if (!isMounted) return;
      // Ignore token refresh failures — keep existing session so users aren't kicked out
      if (event === 'TOKEN_REFRESHED' && !newSession) return;
      setSuperAdminSession(newSession);
      // Only update user ID (triggering role re-check) if the user actually changed
      const newUid = newSession?.user?.id ?? null;
      if (newUid !== superAdminUserIdRef.current) {
        superAdminUserIdRef.current = newUid;
        setSuperAdminUserId(newUid);
      }
      if (event === 'SIGNED_IN' && newSession) {
        client.auth.startAutoRefresh();
      }
      if (event === 'SIGNED_OUT') {
        client.auth.stopAutoRefresh();
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
      client.auth.stopAutoRefresh();
    };
  }, [location.pathname]);

  // Check admin role — only when user ID changes, not on token refreshes
  useEffect(() => {
    let isActive = true;

    async function loadAdminAccess() {
      if (!adminUserId) {
        if (isActive) {
          setIsAdmin(false);
          if (adminSessionLoaded) setAdminChecking(false);
        }
        return;
      }

      setAdminChecking(true);
      const { data, error } = await getSupabaseAdmin()
        .from('admin_users')
        .select('user_id, role')
        .eq('user_id', adminUserId)
        .maybeSingle();

      if (!isActive) return;

      const hasAccess = Boolean(data && !error);
      setIsAdmin(hasAccess);
      setAdminChecking(false);
    }

    loadAdminAccess();
    return () => {
      isActive = false;
    };
  }, [adminUserId, adminSessionLoaded]);

  // Check superadmin role — only when user ID changes, not on token refreshes
  useEffect(() => {
    let isActive = true;

    async function loadSuperAdminAccess() {
      if (!superAdminUserId) {
        if (isActive) {
          setIsSuperAdmin(false);
          if (superAdminSessionLoaded) setSuperAdminChecking(false);
        }
        return;
      }

      setSuperAdminChecking(true);
      const { data, error } = await getSupabaseSuperAdmin()
        .from('admin_users')
        .select('user_id, role')
        .eq('user_id', superAdminUserId)
        .maybeSingle();

      if (!isActive) return;

      const hasAccess = Boolean(data && !error && data?.role === 'superadmin');
      setIsSuperAdmin(hasAccess);
      setSuperAdminChecking(false);
    }

    loadSuperAdminAccess();
    return () => {
      isActive = false;
    };
  }, [superAdminUserId, superAdminSessionLoaded]);

  function handleAdminLogin(newSession) {
    setAdminSession(newSession);
  }

  function handleSuperAdminLogin(newSession) {
    setSuperAdminSession(newSession);
  }

  async function handleAdminLogout() {
    await getSupabaseAdmin().auth.signOut();
    setAdminSession(null);
  }

  async function handleSuperAdminLogout() {
    await getSupabaseSuperAdmin().auth.signOut();
    setSuperAdminSession(null);
  }

  const adminElement = adminChecking ? (
    <div className="min-h-screen w-full bg-(--sbk-page-bg) px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-4xl border border-transparent bg-white/95 p-6 shadow-2xl text-center text-sm text-slate-600">
        Checking admin access...
      </div>
    </div>
  ) : !adminSession || !isAdmin ? (
    <AdminLogin
      onLogin={handleAdminLogin}
      accessError={adminSession && !isAdmin ? 'This account is not authorized for admin access.' : null}
      onLogout={adminSession && !isAdmin ? handleAdminLogout : null}
    />
  ) : (
    <AdminDashboard onLogout={handleAdminLogout} />
  );

  const superAdminElement = superAdminChecking ? (
    <div className="min-h-screen w-full bg-(--sbk-page-bg) px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-4xl border border-transparent bg-white/95 p-6 shadow-2xl text-center text-sm text-slate-600">
        Checking superadmin access...
      </div>
    </div>
  ) : !superAdminSession || !isSuperAdmin ? (
    <AdminLogin
      onLogin={handleSuperAdminLogin}
      accessError={superAdminSession && !isSuperAdmin ? 'This account is not authorized for superadmin access.' : null}
      onLogout={superAdminSession && !isSuperAdmin ? handleSuperAdminLogout : null}
    />
  ) : (
    <SuperAdminDashboard onLogout={handleSuperAdminLogout} />
  );

  const loadingFallback = (
    <div className="min-h-screen w-full bg-(--sbk-page-bg) px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-4xl border border-transparent bg-white/95 p-6 shadow-2xl text-center text-sm text-slate-600">
        Loading...
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <ErrorBoundary>
        <PwaUpdatePrompt />
        <div className="sbk-shell">
          <Suspense fallback={loadingFallback}>
            <Routes>
              <Route path="/" element={<LazySupabaseProvider getClient={getSupabaseResident}><ResidentPortalShell /></LazySupabaseProvider>} />
              <Route path="/admin" element={<LazySupabaseProvider getClient={getSupabaseAdmin}>{adminElement}</LazySupabaseProvider>} />
              <Route path="/superadmin" element={<LazySupabaseProvider getClient={getSupabaseSuperAdmin}>{superAdminElement}</LazySupabaseProvider>} />
              <Route path="/kiosk" element={<KioskShell />} />
              <Route path="*" element={<CatchAllRedirect />} />
            </Routes>
          </Suspense>
        </div>
      </ErrorBoundary>
    </ToastProvider>
  );
}

export default App;
