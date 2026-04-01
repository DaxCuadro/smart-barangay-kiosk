import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLogin from './components/AdminLogin.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
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

  // Admin session listener
  useEffect(() => {
    let isMounted = true;

    supabaseAdmin.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setAdminSession(data?.session ?? null);
      }
    });

    const { data: authListener } = supabaseAdmin.auth.onAuthStateChange((_event, newSession) => {
      if (isMounted) {
        setAdminSession(newSession);
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
      if (isMounted) {
        setSuperAdminSession(data?.session ?? null);
      }
    });

    const { data: authListener } = supabaseSuperAdmin.auth.onAuthStateChange((_event, newSession) => {
      if (isMounted) {
        setSuperAdminSession(newSession);
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Check admin role
  useEffect(() => {
    let isActive = true;

    async function loadAdminAccess() {
      if (!adminSession?.user?.id) {
        if (isActive) {
          setIsAdmin(false);
          setAdminChecking(false);
        }
        return;
      }

      setAdminChecking(true);
      const { data, error } = await supabaseAdmin
        .from('admin_users')
        .select('user_id, role')
        .eq('user_id', adminSession.user.id)
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
  }, [adminSession]);

  // Check superadmin role
  useEffect(() => {
    let isActive = true;

    async function loadSuperAdminAccess() {
      if (!superAdminSession?.user?.id) {
        if (isActive) {
          setIsSuperAdmin(false);
          setSuperAdminChecking(false);
        }
        return;
      }

      setSuperAdminChecking(true);
      const { data, error } = await supabaseSuperAdmin
        .from('admin_users')
        .select('user_id, role')
        .eq('user_id', superAdminSession.user.id)
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
  }, [superAdminSession]);

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
