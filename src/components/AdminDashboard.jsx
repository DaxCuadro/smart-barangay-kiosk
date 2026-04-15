import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import logo from '../assets/logo.png';
import { useSupabase } from '../contexts/SupabaseContext';
import GuideModal from './ui/GuideModal';
import SurveyModal from './ui/SurveyModal';
import { ADMIN_PRE_SURVEY_QUESTIONS, ADMIN_POST_SURVEY_QUESTIONS } from '../data/surveyQuestions';

const DashboardTab = React.lazy(() => import('./admin-dashboard-tabs/DashboardTab'));
const ResidentsTab = React.lazy(() => import('./admin-dashboard-tabs/ResidentsTab'));
const RequestsTab = React.lazy(() => import('./admin-dashboard-tabs/RequestsTab'));
const VerificationTab = React.lazy(() => import('./admin-dashboard-tabs/VerificationTab'));
const CalendarTab = React.lazy(() => import('./admin-dashboard-tabs/CalendarTab'));
const AnnouncementsTab = React.lazy(() => import('./admin-dashboard-tabs/AnnouncementsTab'));
const BarangayInfoTab = React.lazy(() => import('./admin-dashboard-tabs/BarangayInfoTab'));
const PricingTab = React.lazy(() => import('./admin-dashboard-tabs/PricingTab'));
const FeedbackTab = React.lazy(() => import('./admin-dashboard-tabs/FeedbackTab'));

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'residents', label: 'Manage Residents' },
  { key: 'requests', label: 'Requests' },
  { key: 'verification', label: 'Verification' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'barangay', label: 'Barangay Info' },
];

export default function AdminDashboard({ onLogout }) {
  const supabase = useSupabase();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [verificationCount, setVerificationCount] = useState(0);
  const [announcementCount, setAnnouncementCount] = useState(0);
  const [pricingCount, setPricingCount] = useState(0);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [feedbackLastSeen, setFeedbackLastSeen] = useState(() => localStorage.getItem('sbk-feedback-last-seen') || null);
  const [officialsCount, setOfficialsCount] = useState(0);
  const [barangayId, setBarangayId] = useState(null);
  const [barangayName, setBarangayName] = useState('');
  const activeTabMeta = useMemo(() => TABS.find(tab => tab.key === activeTab), [activeTab]);

  // ── Admin Survey State ──
  const [adminPreDone, setAdminPreDone] = useState(() => localStorage.getItem('sbk-admin-survey-pre-done') === 'true');
  const [adminPostDone, setAdminPostDone] = useState(() => localStorage.getItem('sbk-admin-survey-post-done') === 'true');
  const [showAdminPreSurvey, setShowAdminPreSurvey] = useState(false);
  const [showAdminPostSurvey, setShowAdminPostSurvey] = useState(false);
  // Manual re-answer: 'pre' | 'post' | null
  const [manualSurveyType, setManualSurveyType] = useState(null);

  // Show pre-usage survey once barangayId is loaded and pre not done
  useEffect(() => {
    if (barangayId && !adminPreDone) {
      setShowAdminPreSurvey(true);
    }
  }, [barangayId, adminPreDone]);

  const handleAdminPreSubmit = useCallback(async (responses) => {
    if (!barangayId) return;
    await supabase.from('survey_responses').insert({
      barangay_id: barangayId,
      survey_type: 'pre',
      source: 'admin',
      responses,
    });
    localStorage.setItem('sbk-admin-survey-pre-done', 'true');
    setAdminPreDone(true);
    setShowAdminPreSurvey(false);
  }, [supabase, barangayId]);

  const handleAdminPostSubmit = useCallback(async (responses) => {
    if (!barangayId) return;
    await supabase.from('survey_responses').insert({
      barangay_id: barangayId,
      survey_type: 'post',
      source: 'admin',
      responses,
    });
    localStorage.setItem('sbk-admin-survey-post-done', 'true');
    setAdminPostDone(true);
    setShowAdminPostSurvey(false);
  }, [supabase, barangayId]);

  const handleManualSurveySubmit = useCallback(async (responses) => {
    if (!barangayId || !manualSurveyType) return;
    await supabase.from('survey_responses').insert({
      barangay_id: barangayId,
      survey_type: manualSurveyType,
      source: 'admin',
      responses,
    });
    setManualSurveyType(null);
  }, [supabase, barangayId, manualSurveyType]);

  // Called by RequestsTab after a successful release log
  const onRequestReleased = useCallback(() => {
    if (!adminPostDone) {
      setShowAdminPostSurvey(true);
    }
  }, [adminPostDone]);

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
        .maybeSingle();
      if (isActive && data?.barangay_id) {
        setBarangayId(data.barangay_id);
        const { data: brgy } = await supabase
          .from('barangays')
          .select('name')
          .eq('id', data.barangay_id)
          .maybeSingle();
        if (isActive && brgy?.name) {
          setBarangayName(brgy.name);
        }
      }
    }
    loadAdminBarangay();
    return () => { isActive = false; };
  }, [supabase]);

  useEffect(() => {
    if (!barangayId) return;
    let isActive = true;

    async function loadCounts() {
      const todayStr = new Date().toISOString().slice(0, 10);
      const pricingKey = `pricing_${barangayId}`;

      const [requestsResult, verificationResult, announcementsResult, pricingResult, docOptionsResult, feedbackResult, officialsResult] = await Promise.all([
        supabase.from('resident_intake_requests').select('id', { count: 'exact', head: true }).eq('barangay_id', barangayId).neq('status', 'cancelled'),
        supabase.from('resident_verification_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('barangay_id', barangayId),
        supabase.from('announcements').select('id, start_date, end_date').eq('barangay_id', barangayId),
        supabase.from('app_settings').select('value').eq('key', pricingKey).maybeSingle(),
        supabase.from('app_settings').select('value').eq('key', 'document_options').maybeSingle(),
        supabase.from('resident_feedback').select('id, created_at').eq('barangay_id', barangayId),
        supabase.from('barangay_officials').select('id, role, name').eq('barangay_id', barangayId),
      ]);

      if (!isActive) return;

      setRequestCount(requestsResult.count || 0);
      setVerificationCount(verificationResult.count || 0);

      // Announcements: count ongoing (live)
      if (announcementsResult.data) {
        const liveCount = announcementsResult.data.filter(a => {
          if (!a.start_date || !a.end_date) return false;
          return a.start_date <= todayStr && a.end_date >= todayStr;
        }).length;
        setAnnouncementCount(liveCount);
      }

      // Pricing: count documents without a price set
      const docOptions = docOptionsResult.data?.value
        ? (() => { try { const v = JSON.parse(docOptionsResult.data.value); return Array.isArray(v) ? v : []; } catch { return []; } })()
        : ['Barangay Clearance', 'Certificate of Indigency', 'Residency Certification', 'Barangay ID', 'Business Clearance', 'Solo Parent Certification'];
      const pricedDocs = pricingResult.data?.value
        ? (() => { try { const v = JSON.parse(pricingResult.data.value); return Array.isArray(v) ? v.map(i => i.document) : []; } catch { return []; } })()
        : [];
      const pricedSet = new Set(pricedDocs);
      const unpricedCount = docOptions.filter(d => !pricedSet.has(d)).length;
      setPricingCount(unpricedCount);

      // Feedback: count new since last seen
      if (feedbackResult.data) {
        const lastSeen = localStorage.getItem('sbk-feedback-last-seen');
        if (lastSeen) {
          const newCount = feedbackResult.data.filter(f => f.created_at > lastSeen).length;
          setFeedbackCount(newCount);
        } else {
          setFeedbackCount(feedbackResult.data.length);
        }
      }

      // Officials: count missing required roles
      if (officialsResult.data) {
        const REQUIRED_ROLES = [
          { key: 'punong', limit: 1 },
          { key: 'kagawad', limit: 7 },
          { key: 'sk', limit: 1 },
          { key: 'treasurer', limit: 1 },
          { key: 'secretary', limit: 1 },
        ];
        let missingCount = 0;
        for (const role of REQUIRED_ROLES) {
          const filled = officialsResult.data.filter(o => (o.role || '').toLowerCase() === role.key && o.name && o.name.trim());
          missingCount += Math.max(0, role.limit - filled.length);
        }
        setOfficialsCount(missingCount);
      }
    }

    loadCounts();
    const intervalId = setInterval(() => {
      if (document.hidden) return;
      loadCounts();
    }, 15000);
    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [supabase, barangayId]);

  function selectTab(tabKey) {
    setActiveTab(tabKey);
    setDrawerOpen(false);
    if (tabKey === 'feedback') {
      const now = new Date().toISOString();
      localStorage.setItem('sbk-feedback-last-seen', now);
      setFeedbackLastSeen(now);
      setFeedbackCount(0);
    }
  }

  function renderTabContent() {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab barangayId={barangayId} />;
      case 'residents':
        return <ResidentsTab barangayId={barangayId} />;
      case 'requests':
        return <RequestsTab barangayId={barangayId} onRequestReleased={onRequestReleased} />;
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
      case 'feedback':
        return <FeedbackTab barangayId={barangayId} />;
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
                    {tab.key === 'announcements' && announcementCount > 0 ? (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {announcementCount}
                      </span>
                    ) : null}
                    {tab.key === 'pricing' && pricingCount > 0 ? (
                      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {pricingCount}
                      </span>
                    ) : null}
                    {tab.key === 'feedback' && feedbackCount > 0 ? (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {feedbackCount}
                      </span>
                    ) : null}
                    {tab.key === 'barangay' && officialsCount > 0 ? (
                      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {officialsCount}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-8 flex flex-col gap-3">
          <GuideModal guideSrc="/admin-guide.png" label="Admin Guide" />
          <button
            type="button"
            className="w-full rounded-2xl border border-white/30 px-4 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            onClick={() => setManualSurveyType('pre')}
          >
            📝 Answer Survey
          </button>
          <button
            type="button"
            className="w-full rounded-2xl border border-white/30 px-4 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
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
            <GuideModal guideSrc="/admin-guide.png" label="Admin Guide" className="guide-trigger--light" />
          </div>

          {drawerOpen && (
            <div
              className="fixed inset-0 z-40 flex lg:hidden"
              onClick={() => setDrawerOpen(false)}
            >
              <div
                className="h-full w-64 max-w-[75vw] bg-white p-4 shadow-2xl"
                onClick={event => event.stopPropagation()}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Admin</p>
                    <p className="text-base font-semibold text-slate-900">Smart Barangay</p>
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
                <nav className="flex flex-col gap-1.5">
                  {TABS.map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${
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
                        {tab.key === 'announcements' && announcementCount > 0 ? (
                          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                            {announcementCount}
                          </span>
                        ) : null}
                        {tab.key === 'pricing' && pricingCount > 0 ? (
                          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                            {pricingCount}
                          </span>
                        ) : null}
                        {tab.key === 'feedback' && feedbackCount > 0 ? (
                          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                            {feedbackCount}
                          </span>
                        ) : null}
                        {tab.key === 'barangay' && officialsCount > 0 ? (
                          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                            {officialsCount}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </nav>
                <button
                  type="button"
                  className="mt-4 w-full rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
                  onClick={onLogout}
                >
                  Logout
                </button>
              </div>
              <div className="flex-1 bg-black/40 backdrop-blur-sm" />
            </div>
          )}

          <div className="sbk-scroll-area flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
            <Suspense fallback={<div className="text-center text-sm text-slate-500 py-12">Loading…</div>}>
              {renderTabContent()}
            </Suspense>
          </div>
        </div>
      </main>

      {/* ── Admin Survey Modals ── */}
      <SurveyModal
        open={showAdminPreSurvey && !showAdminPostSurvey && !manualSurveyType}
        title="Pre-Usage Survey (Admin)"
        subtitle="Please rate the following statements about the current barangay document processing workflow before using the system."
        questions={ADMIN_PRE_SURVEY_QUESTIONS}
        onSubmit={handleAdminPreSubmit}
        variant="remote"
      />
      <SurveyModal
        open={showAdminPostSurvey && !manualSurveyType}
        title="Post-Usage Survey (Admin)"
        subtitle="You've completed your first document release! Please rate the following statements about your experience using the system."
        questions={ADMIN_POST_SURVEY_QUESTIONS}
        onSubmit={handleAdminPostSubmit}
        variant="remote"
      />
      <SurveyModal
        open={!!manualSurveyType}
        title={manualSurveyType === 'pre' ? 'Pre-Usage Survey (Admin)' : 'Post-Usage Survey (Admin)'}
        subtitle={manualSurveyType === 'pre'
          ? 'Rate the following statements about the current barangay document processing workflow.'
          : 'Rate the following statements about your experience using the Smart Barangay Kiosk System.'}
        questions={manualSurveyType === 'pre' ? ADMIN_PRE_SURVEY_QUESTIONS : ADMIN_POST_SURVEY_QUESTIONS}
        onSubmit={handleManualSurveySubmit}
        onDismiss={() => setManualSurveyType(manualSurveyType === 'pre' ? 'post' : null)}
        variant="remote"
        optional
      />

      {pricingCount > 0 && activeTab !== 'pricing' && barangayId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl text-center space-y-5">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">💰</div>
            <h2 className="text-xl font-bold text-slate-900">Document Pricing Required</h2>
            <p className="text-sm text-slate-600">
              You have <strong className="text-amber-600">{pricingCount}</strong> document{pricingCount > 1 ? 's' : ''} without
              pricing configured. Please set up prices so residents can see the correct fees
              when requesting documents.
            </p>
            <button
              type="button"
              className="rounded-full bg-amber-600 px-8 py-3 text-sm font-semibold text-white shadow hover:bg-amber-500 transition"
              onClick={() => selectTab('pricing')}
            >
              Set up prices now
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
