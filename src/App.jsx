import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AdminLogin from './components/AdminLogin.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import PwaUpdatePrompt from './components/ui/PwaUpdatePrompt.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { SupabaseProvider } from './contexts/SupabaseContext.js';
import { supabaseAdmin, supabaseResident, supabaseSuperAdmin } from './supabaseClient.js';
import './App.css';

const AdminDashboard = lazy(() => import('./components/AdminDashboard.jsx'));
const SuperAdminDashboard = lazy(() => import('./components/SuperAdminDashboard.jsx'));
const KioskShell = lazy(() => import('./components/kiosk/KioskShell.jsx'));
const ResidentPortalShell = lazy(() => import('./components/resident/ResidentPortalShell.jsx'));

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
  const navigate = useNavigate();
  const pwaRedirected = useRef(false);

  // Remember the current section so the installed PWA can reopen it
  useEffect(() => {
    const path = location.pathname;
    if (['/admin', '/superadmin', '/kiosk'].includes(path)) {
      localStorage.setItem('sbk-pwa-section', path);
    } else if (path === '/') {
      localStorage.setItem('sbk-pwa-section', '/');
    }
  }, [location.pathname]);

  // On PWA launch, redirect to the last-used section
  useEffect(() => {
    if (pwaRedirected.current) return;
    pwaRedirected.current = true;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone;
    if (isStandalone && window.location.pathname === '/') {
      const saved = localStorage.getItem('sbk-pwa-section');
      if (saved && saved !== '/') {
        navigate(saved, { replace: true });
      }
    }
  }, [navigate]);

  // Admin session listener
  useEffect(() => {
    let isMounted = true;

    supabaseAdmin.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      const session = data?.session ?? null;
      const uid = session?.user?.id ?? null;
      setAdminSession(session);
      setAdminUserId(uid);
      adminUserIdRef.current = uid;
      setAdminSessionLoaded(true);
    });

    const { data: authListener } = supabaseAdmin.auth.onAuthStateChange((event, newSession) => {
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
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // SuperAdmin session listener
  useEffect(() => {
    let isMounted = true;

    supabaseSuperAdmin.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      const session = data?.session ?? null;
      const uid = session?.user?.id ?? null;
      setSuperAdminSession(session);
      setSuperAdminUserId(uid);
      superAdminUserIdRef.current = uid;
      setSuperAdminSessionLoaded(true);
    });

    const { data: authListener } = supabaseSuperAdmin.auth.onAuthStateChange((event, newSession) => {
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
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

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
      const { data, error } = await supabaseAdmin
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
      const { data, error } = await supabaseSuperAdmin
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
    await supabaseAdmin.auth.signOut();
    setAdminSession(null);
  }

  async function handleSuperAdminLogout() {
    await supabaseSuperAdmin.auth.signOut();
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
              <Route path="/" element={<SupabaseProvider client={supabaseResident}><ResidentPortalShell /></SupabaseProvider>} />
              <Route path="/admin" element={<SupabaseProvider client={supabaseAdmin}>{adminElement}</SupabaseProvider>} />
              <Route path="/superadmin" element={<SupabaseProvider client={supabaseSuperAdmin}>{superAdminElement}</SupabaseProvider>} />
              <Route path="/kiosk" element={<KioskShell />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </ErrorBoundary>
    </ToastProvider>
  );
}

export default App;
