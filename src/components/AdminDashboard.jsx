import React, { Suspense, useEffect, useMemo, useState } from 'react';
import logo from '../assets/logo.png';
import { supabase } from '../supabaseClient';

const DashboardTab = React.lazy(() => import('./admin-dashboard-tabs/DashboardTab'));
const ResidentsTab = React.lazy(() => import('./admin-dashboard-tabs/ResidentsTab'));
const RequestsTab = React.lazy(() => import('./admin-dashboard-tabs/RequestsTab'));
const VerificationTab = React.lazy(() => import('./admin-dashboard-tabs/VerificationTab'));
const CalendarTab = React.lazy(() => import('./admin-dashboard-tabs/CalendarTab'));
const AnnouncementsTab = React.lazy(() => import('./admin-dashboard-tabs/AnnouncementsTab'));
const BarangayInfoTab = React.lazy(() => import('./admin-dashboard-tabs/BarangayInfoTab'));
const PricingTab = React.lazy(() => import('./admin-dashboard-tabs/PricingTab'));

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'residents', label: 'Manage Residents' },
  { key: 'requests', label: 'Requests' },
  { key: 'verification', label: 'Verification' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'barangay', label: 'Barangay Info' },
];

export default function AdminDashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [verificationCount, setVerificationCount] = useState(0);
  const [barangayId, setBarangayId] = useState(null);
  const [barangayName, setBarangayName] = useState('');
  const activeTabMeta = useMemo(() => TABS.find(tab => tab.key === activeTab), [activeTab]);

  useEffect(() => {
    let isActive = true;
    async function loadAdminBarangay() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from('admin_users')
        .select('barangay_id')
        .eq('user_id', userId)
        .single();
      if (isActive && data?.barangay_id) {
        setBarangayId(data.barangay_id);
        const { data: brgy } = await supabase
          .from('barangays')
          .select('name')
          .eq('id', data.barangay_id)
          .single();
        if (isActive && brgy?.name) {
          setBarangayName(brgy.name);
        }
      }
    }
    loadAdminBarangay();
    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    if (!barangayId) return;
    let isActive = true;

    async function loadCounts() {
      const [requestsResult, verificationResult] = await Promise.all([
        supabase.from('resident_intake_requests').select('id', { count: 'exact', head: true }).eq('barangay_id', barangayId),
        supabase.from('resident_verification_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('barangay_id', barangayId),
      ]);

      if (!isActive) return;
      setRequestCount(requestsResult.count || 0);
      setVerificationCount(verificationResult.count || 0);
    }

    loadCounts();
    const intervalId = setInterval(loadCounts, 15000);
    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [barangayId]);

  function selectTab(tabKey) {
    setActiveTab(tabKey);
    setDrawerOpen(false);
  }

  function renderTabContent() {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab barangayId={barangayId} />;
      case 'residents':
        return <ResidentsTab barangayId={barangayId} />;
      case 'requests':
        return <RequestsTab barangayId={barangayId} />;
      case 'verification':
        return <VerificationTab barangayId={barangayId} />;
      case 'calendar':
        return <CalendarTab barangayId={barangayId} />;
      case 'announcements':
        return <AnnouncementsTab barangayId={barangayId} />;
      case 'barangay':
        return <BarangayInfoTab onLogout={onLogout} barangayId={barangayId} barangayName={barangayName} />;
      case 'pricing':
        return <PricingTab barangayId={barangayId} />;
      default:
        return null;
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-(--sbk-page-bg) text-slate-900">
      <aside className="sbk-sidebar hidden flex-col border-r border-white/10 px-4 py-6 lg:flex">
        <div className="mb-10 flex flex-col items-center gap-3 px-2 text-center">
          <img src={logo} alt="Smart Barangay Kiosk" className="h-12 w-auto select-none" draggable="false" />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Admin</p>
            <p className="text-lg font-semibold text-white">Smart Barangay</p>
          </div>
        </div>
        <nav className="flex-1">
          <ul className="space-y-1">
            {TABS.map(tab => (
              <li key={tab.key}>
                <button
                  className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/40 ${
                    activeTab === tab.key
                      ? 'bg-white/15 text-white shadow-lg shadow-black/20'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                  onClick={() => selectTab(tab.key)}
                >
                  <span className="flex items-center justify-between gap-2">
                    {tab.label}
                    {tab.key === 'requests' && requestCount > 0 ? (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {requestCount}
                      </span>
                    ) : null}
                    {tab.key === 'verification' && verificationCount > 0 ? (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {verificationCount}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          className="mt-8 w-full rounded-2xl border border-white/30 px-4 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10"
          onClick={onLogout}
        >
          Logout
        </button>
      </aside>

      <main className="flex-1">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            <button
              type="button"
              className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-2 text-slate-700 shadow-sm"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation drawer"
            >
              <span className="h-0.5 w-6 rounded-full bg-slate-700" />
              <span className="h-0.5 w-6 rounded-full bg-slate-700" />
              <span className="h-0.5 w-6 rounded-full bg-slate-700" />
            </button>
            <p className="text-sm font-semibold text-slate-600">{activeTabMeta?.label}</p>
          </div>

          {drawerOpen && (
            <div
              className="fixed inset-0 z-40 flex lg:hidden"
              onClick={() => setDrawerOpen(false)}
            >
              <div className="flex-1 bg-black/40 backdrop-blur-sm" />
              <div
                className="h-full w-72 max-w-[80vw] bg-white p-6 shadow-2xl"
                onClick={event => event.stopPropagation()}
              >
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin</p>
                    <p className="text-lg font-semibold text-slate-900">Smart Barangay</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 p-2"
                    aria-label="Close drawer"
                    onClick={() => setDrawerOpen(false)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <nav className="flex flex-col gap-2">
                  {TABS.map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold ${
                        activeTab === tab.key
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 text-slate-600'
                      }`}
                      onClick={() => selectTab(tab.key)}
                    >
                      <span className="flex items-center justify-between gap-2">
                        {tab.label}
                        {tab.key === 'requests' && requestCount > 0 ? (
                          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                            {requestCount}
                          </span>
                        ) : null}
                        {tab.key === 'verification' && verificationCount > 0 ? (
                          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                            {verificationCount}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </nav>
                <button
                  type="button"
                  className="mt-6 w-full rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                  onClick={onLogout}
                >
                  Logout
                </button>
              </div>
            </div>
          )}

          <div className="sbk-scroll-area flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
            <Suspense fallback={<div className="text-center text-sm text-slate-500 py-12">Loading…</div>}>
              {renderTabContent()}
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
