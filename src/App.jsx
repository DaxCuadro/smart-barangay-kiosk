import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLogin from './components/AdminLogin.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { supabase } from './supabaseClient.js';
import './App.css';

const AdminDashboard = lazy(() => import('./components/AdminDashboard.jsx'));
const SuperAdminDashboard = lazy(() => import('./components/SuperAdminDashboard.jsx'));
const KioskShell = lazy(() => import('./components/kiosk/KioskShell.jsx'));
const ResidentPortalShell = lazy(() => import('./components/resident/ResidentPortalShell.jsx'));

function App() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminChecking, setAdminChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data?.session ?? null);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (isMounted) {
        setSession(newSession);
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadAdminAccess() {
      if (!session?.user?.id) {
        if (isActive) {
          setIsAdmin(false);
          setAdminChecking(false);
        }
        return;
      }

      setAdminChecking(true);
      const { data, error } = await supabase
        .from('admin_users')
        .select('user_id, role')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!isActive) return;

      const hasAccess = Boolean(data && !error);
      setIsAdmin(hasAccess);
      setIsSuperAdmin(hasAccess && data?.role === 'superadmin');
      setAdminChecking(false);
    }

    loadAdminAccess();
    return () => {
      isActive = false;
    };
  }, [session]);

  function handleLogin(newSession) {
    setSession(newSession);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
  }

  const adminElement = adminChecking ? (
    <div className="min-h-screen w-full bg-(--sbk-page-bg) px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-4xl border border-transparent bg-white/95 p-6 shadow-2xl text-center text-sm text-slate-600">
        Checking admin access...
      </div>
    </div>
  ) : !session || !isAdmin ? (
    <AdminLogin
      onLogin={handleLogin}
      accessError={session && !isAdmin ? 'This account is not authorized for admin access.' : null}
      onLogout={session && !isAdmin ? handleLogout : null}
    />
  ) : (
    <AdminDashboard onLogout={handleLogout} />
  );

  const superAdminElement = adminChecking ? (
    <div className="min-h-screen w-full bg-(--sbk-page-bg) px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-4xl border border-transparent bg-white/95 p-6 shadow-2xl text-center text-sm text-slate-600">
        Checking superadmin access...
      </div>
    </div>
  ) : !session || !isSuperAdmin ? (
    <AdminLogin
      onLogin={handleLogin}
      accessError={session && !isSuperAdmin ? 'This account is not authorized for superadmin access.' : null}
      onLogout={session && !isSuperAdmin ? handleLogout : null}
    />
  ) : (
    <SuperAdminDashboard onLogout={handleLogout} />
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
              <Route path="/" element={<ResidentPortalShell />} />
              <Route path="/admin" element={adminElement} />
              <Route path="/superadmin" element={superAdminElement} />
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
