import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseAnonKey, supabaseUrl } from '../supabaseClient';
import { useSupabase } from '../contexts/SupabaseContext';
import ConfirmDialog from './ui/ConfirmDialog';
import ChatPanel from './ui/ChatPanel';
import DailySummaryPanel from './ui/DailySummaryPanel';
import ThesisDocumentsTab from './admin-dashboard-tabs/ThesisDocumentsTab';
import { useToast } from '../hooks/useToast';

const SUPERADMIN_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'broadcast', label: 'Broadcast' },
  { key: 'tenants', label: 'Tenants' },
  { key: 'admins', label: 'Admins' },
  { key: 'residents', label: 'Residents' },
  { key: 'requests', label: 'Requests' },
  { key: 'documents', label: 'Documents' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'cleanup', label: 'Data Cleanup' },
  { key: 'access', label: 'Access & Security' },
  { key: 'thesis-docs', label: 'Thesis Docs' },
];

const CLEANUP_CATEGORIES = [
  { key: 'feedback', label: 'Feedback', table: 'resident_feedback', description: 'All resident feedback/ratings on released documents' },
  { key: 'requests', label: 'Document Requests', table: 'resident_intake_requests', description: 'All document requests (pending, current, done, cancelled)' },
  { key: 'releases', label: 'Release Logs', table: 'release_logs', description: 'Released document history (also removes linked feedback)' },
  { key: 'verifications', label: 'Verification Requests', table: 'resident_verification_requests', description: 'New/update resident verification submissions' },
  { key: 'announcements', label: 'Announcements', table: 'announcements', description: 'All barangay announcements' },
  { key: 'events', label: 'Calendar Events', table: 'admin_events', description: 'All calendar events added by admins' },
  { key: 'residents', label: 'Residents', table: 'residents', description: 'All registered residents (also removes linked requests, releases, feedback)' },
  { key: 'audit_logs', label: 'Audit Logs', table: 'audit_logs', description: 'All audit log entries (superadmin action history)' },
];

/* ── Audit helper ─────────────────────────────────────────────── */
async function logAudit(client, { action, targetType, targetId, targetLabel, metadata }) {
  const { data: { session } } = await client.auth.getSession();
  if (!session) return;
  await client.from('audit_logs').insert({
    actor_id: session.user.id,
    actor_email: session.user.email,
    action,
    target_type: targetType || null,
    target_id: targetId || null,
    target_label: targetLabel || null,
    metadata: metadata || {},
  });
}

/* ── CSV export helper ────────────────────────────────────────── */
function downloadCSV(rows, headers, filename) {
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Simple bar chart component ───────────────────────────────── */
function BarChart({ data, label, colorClass = 'bg-blue-500' }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-28 truncate text-xs text-slate-600">{d.name}</span>
            <div className="relative flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
              <div className={`absolute inset-y-0 left-0 rounded-full ${colorClass} transition-all`} style={{ width: `${Math.max((d.value / max) * 100, 2)}%` }} />
              <span className="relative z-10 flex h-full items-center px-2 text-[11px] font-bold text-slate-800">{d.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Onboarding wizard step labels ────────────────────────────── */
const WIZARD_STEPS = ['Name & Code', 'Zones', 'Features', 'Admin Account', 'Done'];

const DEFAULT_DOCUMENT_OPTIONS = [
  'Barangay Clearance',
  'Certificate of Indigency',
  'Residency Certification',
  'Barangay ID',
  'Business Clearance',
  'Solo Parent Certification',
];

const SERVICE_FEE_KEY = 'service_fee';
const SMS_FEE_KEY = 'sms_fee';

const EMPTY_HEALTH_SNAPSHOT = {
  residents: 0,
  requests: 0,
  verifications: 0,
  releases: 0,
  announcements: 0,
  lastRequestAt: null,
  lastVerificationAt: null,
  lastReleaseAt: null,
};

function normalizeDocumentOptions(value) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = parsed.split('\n');
    }
  }

  if (!Array.isArray(parsed)) {
    return DEFAULT_DOCUMENT_OPTIONS;
  }

  const seen = new Set();
  const cleaned = parsed
    .map(item => (item || '').trim())
    .filter(item => item && !seen.has(item.toLowerCase()) && (seen.add(item.toLowerCase()), true));

  return cleaned.length ? cleaned : DEFAULT_DOCUMENT_OPTIONS;
}

function normalizeResidentAccount(record) {
  const nestedProfile = Array.isArray(record?.resident_profiles) ? record.resident_profiles[0] : record?.resident_profiles;
  const profileBarangayId = nestedProfile?.barangay_id || record?.profile?.barangay_id || record?.barangay_id || null;
  return {
    ...record,
    barangay_id: profileBarangayId,
  };
}

export default function SuperAdminDashboard({ onLogout }) {
  const supabase = useSupabase();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [barangays, setBarangays] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [zoneSettings, setZoneSettings] = useState([]);
  const [residentAccounts, setResidentAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [documentOptions, setDocumentOptions] = useState(DEFAULT_DOCUMENT_OPTIONS);
  const [documentInput, setDocumentInput] = useState('');
  const [serviceFee, setServiceFee] = useState(0);
  const [smsFee, setSmsFee] = useState(0);
  const [serviceFeeInput, setServiceFeeInput] = useState('');
  const [smsFeeInput, setSmsFeeInput] = useState('');
  const [feesSaving, setFeesSaving] = useState(false);
  const [feesInfo, setFeesInfo] = useState('');
  const [feesError, setFeesError] = useState('');
  const [createForm, setCreateForm] = useState({ name: '', code: '' });

  /* ── Seal upload state ── */
  const [sealForm, setSealForm] = useState({ barangayId: '', province: '', municipality: '', barangayAddress: '', barangayEmail: '' });
  const [sealFile, setSealFile] = useState(null);
  const [sealPreview, setSealPreview] = useState('');
  const [sealSaving, setSealSaving] = useState(false);
  const [assignForm, setAssignForm] = useState({ userId: '', email: '', barangayId: '', role: 'barangay_admin' });
  const [createAdminForm, setCreateAdminForm] = useState({ email: '', password: '', barangayId: '', role: 'barangay_admin' });
  const [zoneForm, setZoneForm] = useState({ barangayId: '', zonesCount: '' });
  const [featureForm, setFeatureForm] = useState({ barangayId: '', kiosk: true, portal: true, announcements: true });
  const [kioskPassword, setKioskPassword] = useState('');
  const [kioskPasswordInput, setKioskPasswordInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [documentsSaving, setDocumentsSaving] = useState(false);
  const [pendingDeleteResident, setPendingDeleteResident] = useState(null);
  const [pendingDeleteBarangay, setPendingDeleteBarangay] = useState(null);
  const [deleteBarangayConfirmText, setDeleteBarangayConfirmText] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [adminDeletingId, setAdminDeletingId] = useState('');
  const [pendingDeleteAdmin, setPendingDeleteAdmin] = useState(null);
  const [residentSearch, setResidentSearch] = useState('');
  const [residentStatusFilter, setResidentStatusFilter] = useState('all');
  const [residentSortMode, setResidentSortMode] = useState('recent');
  const [residentBarangayFilter, setResidentBarangayFilter] = useState('all');
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState('');
  const [healthSnapshot, setHealthSnapshot] = useState(EMPTY_HEALTH_SNAPSHOT);
  const [selectedHealthBarangay, setSelectedHealthBarangay] = useState('');
  const [barangayHealthSnapshot, setBarangayHealthSnapshot] = useState(EMPTY_HEALTH_SNAPSHOT);
  const [barangayHealthLoading, setBarangayHealthLoading] = useState(false);
  const [barangayHealthError, setBarangayHealthError] = useState('');

  // ── System Broadcast state ──
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '', type: 'info', enabled: false });
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastSaving, setBroadcastSaving] = useState(false);
  const [broadcastInfo, setBroadcastInfo] = useState('');
  const [broadcastError, setBroadcastError] = useState('');

  // ── Feature 1: Audit Log state ──
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState('');

  // ── Feature 2: Analytics state ──
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // ── Feature 3: Real-Time Activity Feed state ──
  const [activityFeed, setActivityFeed] = useState([]);
  const feedChannelRef = useRef(null);

  // ── Feature 5: Global Search state ──
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState(null);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);

  // ── Feedback state ──
  const [allFeedback, setAllFeedback] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [feedbackRatingFilter, setFeedbackRatingFilter] = useState('all');
  const [feedbackBarangayFilter, setFeedbackBarangayFilter] = useState('all');

  // ── Data Cleanup state ──
  const [cleanupBarangayId, setCleanupBarangayId] = useState('');
  const [cleanupCategories, setCleanupCategories] = useState({});
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupResults, setCleanupResults] = useState(null);
  const [pendingCleanup, setPendingCleanup] = useState(null);

  // ── Feature 4: Onboarding Wizard state ──
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardData, setWizardData] = useState({ name: '', code: '', zonesCount: '7', kiosk: true, portal: true, announcements: true, adminEmail: '', adminPassword: '', adminRole: 'barangay_admin' });
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [wizardCreatedBarangay, setWizardCreatedBarangay] = useState(null);

  // ── Requests tab state ──
  const [saRequests, setSaRequests] = useState([]);
  const [saRequestsLoading, setSaRequestsLoading] = useState(false);
  const [saRequestsSearch, setSaRequestsSearch] = useState('');
  const [saRequestsBarangayFilter, setSaRequestsBarangayFilter] = useState('all');
  const [saRequestsStatusFilter, setSaRequestsStatusFilter] = useState('all');
  const [saExpandedRequestId, setSaExpandedRequestId] = useState(null);
  const [saChatOpen, setSaChatOpen] = useState(null);
  const [saAuthSession, setSaAuthSession] = useState(null);

  // Get auth session for chat
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSaAuthSession(data?.session || null));
  }, [supabase]);

  const loadSaRequests = useCallback(async () => {
    setSaRequestsLoading(true);
    const { data, error: fetchErr } = await supabase
      .from('resident_intake_requests')
      .select('id, created_at, status, resident_id, request_source, first_name, last_name, middle_name, sex, civil_status, birthday, birthplace, address, zone, occupation, education, religion, telephone, email, document, purpose, reference_number, queue_number, barangay_id')
      .order('created_at', { ascending: false })
      .limit(500);
    if (!fetchErr && data) setSaRequests(data);
    setSaRequestsLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (activeTab === 'requests') loadSaRequests();
  }, [activeTab, loadSaRequests]);

  const filteredSaRequests = useMemo(() => {
    let out = saRequests;
    if (saRequestsBarangayFilter !== 'all') {
      out = out.filter(r => r.barangay_id === saRequestsBarangayFilter);
    }
    if (saRequestsStatusFilter !== 'all') {
      out = out.filter(r => r.status === saRequestsStatusFilter);
    }
    if (saRequestsSearch.trim()) {
      const q = saRequestsSearch.toLowerCase();
      out = out.filter(r =>
        (r.first_name || '').toLowerCase().includes(q) ||
        (r.last_name || '').toLowerCase().includes(q) ||
        (r.middle_name || '').toLowerCase().includes(q) ||
        (r.document || '').toLowerCase().includes(q) ||
        (r.reference_number || '').toLowerCase().includes(q)
      );
    }
    return out;
  }, [saRequests, saRequestsBarangayFilter, saRequestsStatusFilter, saRequestsSearch]);

  async function handleSaOpenChat(request) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('request_id', request.id)
      .maybeSingle();

    let residentAuthUid = null;
    if (request.resident_id) {
      const { data: profile } = await supabase
        .from('resident_profiles')
        .select('user_id')
        .eq('resident_id', request.resident_id)
        .maybeSingle();
      residentAuthUid = profile?.user_id || null;
    }

    setSaChatOpen({
      request,
      conversationId: conv?.id || null,
      residentAuthUid,
    });
  }

  useEffect(() => {
    let isActive = true;

    async function loadData() {
      setLoading(true);
      setError('');
      const [barangayResult, adminResult, zoneResult, settingsResult, residentResult] = await Promise.all([
        supabase.from('barangays').select('id, name, code, status, enable_kiosk, enable_portal, enable_announcements, created_at, seal_url, province, municipality, barangay_address, barangay_email').order('created_at', { ascending: false }),
        supabase.rpc('get_admin_users'),
        supabase.from('barangay_zone_settings').select('id, barangay_id, zones_count').order('barangay_id', { ascending: true }),
        supabase.from('app_settings').select('key, value').in('key', ['kiosk_change_password', 'document_options', SERVICE_FEE_KEY, SMS_FEE_KEY]),
        supabase
          .from('resident_accounts')
          .select('user_id, email, status, created_at, updated_at, disabled_at')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (!isActive) return;
      if (barangayResult.error || adminResult.error || zoneResult.error || settingsResult.error || residentResult.error) {
        setError(
          barangayResult.error?.message
          || adminResult.error?.message
          || zoneResult.error?.message
          || settingsResult.error?.message
          || residentResult.error?.message
          || 'Failed to load data.',
        );
        setLoading(false);
        return;
      }
      const kioskSetting = (settingsResult.data || []).find(item => item.key === 'kiosk_change_password');
      const kioskPasswordIsSet = Boolean((kioskSetting?.value || '').trim());
      const documentSetting = (settingsResult.data || []).find(item => item.key === 'document_options');
      const serviceFeeSetting = (settingsResult.data || []).find(item => item.key === SERVICE_FEE_KEY);
      const smsFeeSetting = (settingsResult.data || []).find(item => item.key === SMS_FEE_KEY);

      const parseNumber = value => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : 0;
      };

      let profileMap = {};
      const residentUserIds = (residentResult.data || []).map(item => item.user_id).filter(Boolean);
      if (residentUserIds.length) {
        const { data: profileRows, error: profileError } = await supabase
          .from('resident_profiles')
          .select('user_id, barangay_id')
          .in('user_id', residentUserIds);

        if (!isActive) return;
        if (profileError) {
          setError(profileError.message || 'Failed to load resident barangay mapping.');
          setLoading(false);
          return;
        }

        profileMap = (profileRows || []).reduce((acc, row) => {
          if (row.user_id) {
            acc[row.user_id] = row.barangay_id || null;
          }
          return acc;
        }, {});
      }

      setBarangays(barangayResult.data || []);
      setAdminUsers(adminResult.data || []);
      setZoneSettings(zoneResult.data || []);
      setKioskPassword(kioskPasswordIsSet ? '(set)' : '');
      setDocumentOptions(normalizeDocumentOptions(documentSetting?.value));
      const nextServiceFee = parseNumber(serviceFeeSetting?.value);
      const nextSmsFee = parseNumber(smsFeeSetting?.value);
      setServiceFee(nextServiceFee);
      setSmsFee(nextSmsFee);
      setServiceFeeInput(nextServiceFee ? String(nextServiceFee) : '');
      setSmsFeeInput(nextSmsFee ? String(nextSmsFee) : '');
      setResidentAccounts((residentResult.data || []).map(record => normalizeResidentAccount({
        ...record,
        barangay_id: profileMap[record.user_id] || null,
      })));
      setLoading(false);
    }

    loadData();
    return () => {
      isActive = false;
    };
  }, [supabase]);

  /* ── Feature 3: Real-Time Activity Feed ──────────────────────── */
  useEffect(() => {
    const channel = supabase
      .channel('superadmin-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'resident_intake_requests' }, (payload) => {
        setActivityFeed(prev => [{ id: payload.new.id, type: 'request', message: `New request: ${payload.new.document || 'Unknown'}`, detail: payload.new.reference_number || '', time: payload.new.created_at || new Date().toISOString() }, ...prev].slice(0, 50));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'resident_verification_requests' }, (payload) => {
        setActivityFeed(prev => [{ id: payload.new.id, type: 'verification', message: `New verification: ${payload.new.last_name || ''}, ${payload.new.first_name || ''}`, detail: payload.new.status || 'pending', time: payload.new.created_at || new Date().toISOString() }, ...prev].slice(0, 50));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'release_logs' }, (payload) => {
        setActivityFeed(prev => [{ id: payload.new.id, type: 'release', message: `Document released: ${payload.new.document || 'Unknown'}`, detail: payload.new.reference_number || '', time: payload.new.released_at || new Date().toISOString() }, ...prev].slice(0, 50));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'residents' }, (payload) => {
        setActivityFeed(prev => [{ id: payload.new.id, type: 'resident', message: `New resident: ${payload.new.last_name || ''}, ${payload.new.first_name || ''}`, detail: '', time: payload.new.created_at || new Date().toISOString() }, ...prev].slice(0, 50));
      })
      .subscribe();

    feedChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  /* ── Feature 1: Audit Log loader ─────────────────────────────── */
  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    const { data, error: auditError } = await supabase
      .from('audit_logs')
      .select('id, actor_id, actor_email, action, target_type, target_id, target_label, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (auditError) {
      setError(auditError.message);
    } else {
      setAuditLogs(data || []);
    }
    setAuditLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (activeTab === 'audit') { const run = async () => { await loadAuditLogs(); }; run(); }
  }, [activeTab, loadAuditLogs]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditFilter.trim().toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter(l => {
      const haystack = [l.actor_email, l.action, l.target_type, l.target_label, l.target_id].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [auditLogs, auditFilter]);

  /* ── Feature 2: Analytics loader ─────────────────────────────── */
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    const [reqResult, resResult, verResult, relResult] = await Promise.all([
      supabase.from('resident_intake_requests').select('id, barangay_id, document, status, created_at').order('created_at', { ascending: false }).limit(1000),
      supabase.from('residents').select('id, barangay_id, sex, birthday, created_at').limit(2000),
      supabase.from('resident_verification_requests').select('id, barangay_id, status, created_at').limit(1000),
      supabase.from('release_logs').select('id, barangay_id, document, released_at').limit(1000),
    ]);
    setAnalyticsData({
      requests: reqResult.data || [],
      residents: resResult.data || [],
      verifications: verResult.data || [],
      releases: relResult.data || [],
    });
    setAnalyticsLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (activeTab === 'analytics') { const run = async () => { await loadAnalytics(); }; run(); }
  }, [activeTab, loadAnalytics]);

  /* ── System Broadcast loader ────────────────────────────────── */
  useEffect(() => {
    if (activeTab !== 'broadcast') return;
    let isActive = true;
    setBroadcastLoading(true);
    setBroadcastError('');
    (async () => {
      const { data, error: fetchErr } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'system_broadcast')
        .maybeSingle();
      if (!isActive) return;
      setBroadcastLoading(false);
      if (fetchErr) {
        setBroadcastError(fetchErr.message);
        return;
      }
      if (data?.value) {
        try {
          const parsed = JSON.parse(data.value);
          setBroadcastForm({
            title: parsed.title || '',
            message: parsed.message || '',
            type: parsed.type || 'info',
            enabled: parsed.enabled ?? false,
          });
        } catch {
          setBroadcastForm({ title: '', message: '', type: 'info', enabled: false });
        }
      }
    })();
    return () => { isActive = false; };
  }, [activeTab, supabase]);

  async function handleSaveBroadcast() {
    setBroadcastSaving(true);
    setBroadcastInfo('');
    setBroadcastError('');
    const payload = JSON.stringify({
      title: broadcastForm.title.trim(),
      message: broadcastForm.message.trim(),
      type: broadcastForm.type,
      enabled: broadcastForm.enabled,
      updated_at: new Date().toISOString(),
    });
    const { error: upsertErr } = await supabase
      .from('app_settings')
      .upsert({ key: 'system_broadcast', value: payload, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setBroadcastSaving(false);
    if (upsertErr) {
      setBroadcastError(`Failed to save: ${upsertErr.message}`);
      return;
    }
    setBroadcastInfo(broadcastForm.enabled ? 'Broadcast is now live across all kiosks and resident portals.' : 'Broadcast saved (currently disabled).');
    addToast(broadcastForm.enabled ? 'Broadcast published.' : 'Broadcast saved.', 'success');
    await logAudit(supabase, { action: 'update_broadcast', targetType: 'app_settings', targetLabel: 'system_broadcast', metadata: { enabled: broadcastForm.enabled } });
  }

  async function handleClearBroadcast() {
    setBroadcastSaving(true);
    setBroadcastInfo('');
    setBroadcastError('');
    const payload = JSON.stringify({ title: '', message: '', type: 'info', enabled: false, updated_at: new Date().toISOString() });
    const { error: upsertErr } = await supabase
      .from('app_settings')
      .upsert({ key: 'system_broadcast', value: payload, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setBroadcastSaving(false);
    if (upsertErr) {
      setBroadcastError(`Failed to clear: ${upsertErr.message}`);
      return;
    }
    setBroadcastForm({ title: '', message: '', type: 'info', enabled: false });
    setBroadcastInfo('Broadcast cleared.');
    addToast('Broadcast cleared.', 'success');
    await logAudit(supabase, { action: 'clear_broadcast', targetType: 'app_settings', targetLabel: 'system_broadcast' });
  }

  /* ── Feedback loader ─────────────────────────────────────────── */
  const loadAllFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    const [residentResult, kioskResult] = await Promise.all([
      supabase
        .from('resident_feedback')
        .select(`
          id,
          rating,
          comment,
          created_at,
          barangay_id,
          release_log_id,
          resident_id,
          release_logs!inner ( document, resident_name, released_at )
        `)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('kiosk_feedback')
        .select('id, rating, comment, created_at, barangay_id, resident_name, document')
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    const residentRows = (residentResult.data || []).map(item => ({
      ...item,
      _source: 'release',
      _name: item.release_logs?.resident_name || 'Resident',
      _document: item.release_logs?.document || 'Document',
    }));
    const kioskRows = (kioskResult.data || []).map(item => ({
      ...item,
      _source: 'kiosk',
      _name: item.resident_name || 'Walk-in',
      _document: item.document || 'N/A',
    }));
    const merged = [...residentRows, ...kioskRows].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    setAllFeedback(merged);
    setFeedbackLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (activeTab === 'feedback') { loadAllFeedback(); }
  }, [activeTab, loadAllFeedback]);

  const filteredFeedback = useMemo(() => {
    const q = feedbackSearch.trim().toLowerCase();
    return allFeedback.filter(item => {
      if (feedbackRatingFilter !== 'all' && String(item.rating) !== feedbackRatingFilter) return false;
      if (feedbackBarangayFilter !== 'all' && item.barangay_id !== feedbackBarangayFilter) return false;
      if (!q) return true;
      return [item._document, item._name, item.comment].join(' ').toLowerCase().includes(q);
    });
  }, [allFeedback, feedbackSearch, feedbackRatingFilter, feedbackBarangayFilter]);

  const feedbackStats = useMemo(() => {
    if (!allFeedback.length) return { avg: 0, total: 0, distribution: [0, 0, 0, 0, 0] };
    const dist = [0, 0, 0, 0, 0];
    let sum = 0;
    allFeedback.forEach(item => { sum += item.rating; dist[item.rating - 1] += 1; });
    return { avg: sum / allFeedback.length, total: allFeedback.length, distribution: dist };
  }, [allFeedback]);

  /* ── Feature 5: Global Search ────────────────────────────────── */
  const handleGlobalSearch = useCallback(async (query) => {
    const q = (query || '').trim();
    if (!q || q.length < 2) { setGlobalSearchResults(null); return; }
    setGlobalSearchLoading(true);
    const pattern = `%${q}%`;
    const [brgyRes, adminRes, residentRes, reqRes] = await Promise.all([
      supabase.from('barangays').select('id, name, code').or(`name.ilike.${pattern},code.ilike.${pattern}`).limit(10),
      supabase.rpc('get_admin_users').then(r => ({ data: (r.data || []).filter(a => [a.email, a.user_id, a.role].join(' ').toLowerCase().includes(q.toLowerCase())).slice(0, 10), error: r.error })),
      supabase.from('residents').select('id, barangay_id, first_name, last_name').or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`).limit(10),
      supabase.from('resident_intake_requests').select('id, document, reference_number, status, barangay_id').or(`document.ilike.${pattern},reference_number.ilike.${pattern}`).limit(10),
    ]);
    setGlobalSearchResults({
      barangays: brgyRes.data || [],
      admins: adminRes.data || [],
      residents: residentRes.data || [],
      requests: reqRes.data || [],
    });
    setGlobalSearchLoading(false);
  }, [supabase]);

  /* ── Feature 4: Onboarding Wizard handlers ───────────────────── */
  function resetWizard() {
    setWizardStep(0);
    setWizardData({ name: '', code: '', zonesCount: '7', kiosk: true, portal: true, announcements: true, adminEmail: '', adminPassword: '', adminRole: 'barangay_admin' });
    setWizardError('');
    setWizardCreatedBarangay(null);
  }

  async function handleWizardFinish() {
    setWizardSaving(true);
    setWizardError('');
    // Step 1: Create barangay
    const { data: brgy, error: brgyErr } = await supabase
      .from('barangays')
      .insert({ name: wizardData.name.trim(), code: wizardData.code.trim() || null, enable_kiosk: wizardData.kiosk, enable_portal: wizardData.portal, enable_announcements: wizardData.announcements })
      .select('id, name, code, status, enable_kiosk, enable_portal, enable_announcements, created_at')
      .single();
    if (brgyErr) { setWizardError(brgyErr.message); setWizardSaving(false); return; }

    // Step 2: Set zones
    const zonesValue = Math.max(1, Math.floor(Number(wizardData.zonesCount) || 7));
    const { data: zoneData } = await supabase.rpc('upsert_zone_settings', { p_barangay_id: brgy.id, p_zones_count: zonesValue }).single();
    if (zoneData) setZoneSettings(prev => [zoneData, ...prev.filter(z => z.barangay_id !== brgy.id)]);

    // Step 3: Create admin (optional)
    let adminCreated = false;
    if (wizardData.adminEmail.trim() && wizardData.adminPassword) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      const token = refreshed?.session?.access_token;
      if (token) {
        const res = await fetch(`${supabaseUrl}/functions/v1/create_admin_user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
          body: JSON.stringify({ email: wizardData.adminEmail.trim(), password: wizardData.adminPassword, barangay_id: brgy.id, role: wizardData.adminRole }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.user_id) {
          setAdminUsers(prev => [{ user_id: body.user_id, email: wizardData.adminEmail.trim(), role: wizardData.adminRole, barangay_id: brgy.id }, ...prev]);
          adminCreated = true;
        }
      }
    }

    setBarangays(prev => [brgy, ...prev]);
    setWizardCreatedBarangay(brgy);
    setWizardStep(WIZARD_STEPS.length - 1);
    setWizardSaving(false);

    logAudit(supabase, { action: 'wizard_create_barangay', targetType: 'barangay', targetId: brgy.id, targetLabel: brgy.name, metadata: { adminCreated, zones: zonesValue } });
    addToast(`Barangay "${brgy.name}" onboarded successfully!`, 'success');
  }

  useEffect(() => {
    let isActive = true;
    async function loadHealth() {
      setHealthLoading(true);
      setHealthError('');
      const [residentsResult, requestsResult, verificationResult, releaseResult, announcementsResult, lastRequestResult, lastVerificationResult, lastReleaseResult] = await Promise.all([
        supabase.from('residents').select('id', { count: 'exact', head: true }),
        supabase.from('resident_intake_requests').select('id', { count: 'exact', head: true }),
        supabase.from('resident_verification_requests').select('id', { count: 'exact', head: true }),
        supabase.from('release_logs').select('id', { count: 'exact', head: true }),
        supabase.from('announcements').select('id', { count: 'exact', head: true }),
        supabase.from('resident_intake_requests').select('created_at').order('created_at', { ascending: false }).limit(1),
        supabase.from('resident_verification_requests').select('created_at').order('created_at', { ascending: false }).limit(1),
        supabase.from('release_logs').select('released_at').order('released_at', { ascending: false }).limit(1),
      ]);

      if (!isActive) return;
      const errors = [
        residentsResult.error,
        requestsResult.error,
        verificationResult.error,
        releaseResult.error,
        announcementsResult.error,
        lastRequestResult.error,
        lastVerificationResult.error,
        lastReleaseResult.error,
      ].filter(Boolean);

      if (errors.length) {
        setHealthError(errors[0].message || 'Failed to load DB health.');
        setHealthLoading(false);
        return;
      }

      const lastRequestAt = lastRequestResult.data?.[0]?.created_at || null;
      const lastVerificationAt = lastVerificationResult.data?.[0]?.created_at || null;
      const lastReleaseAt = lastReleaseResult.data?.[0]?.released_at || null;

      setHealthSnapshot({
        residents: residentsResult.count || 0,
        requests: requestsResult.count || 0,
        verifications: verificationResult.count || 0,
        releases: releaseResult.count || 0,
        announcements: announcementsResult.count || 0,
        lastRequestAt,
        lastVerificationAt,
        lastReleaseAt,
      });
      setHealthLoading(false);
    }

    loadHealth();
    return () => {
      isActive = false;
    };
  }, [supabase]);

  const loadBarangayHealthSnapshot = useCallback(async function loadBarangayHealthSnapshot(barangayId, isCancelled = () => false) {
    if (!barangayId) return;
    setBarangayHealthLoading(true);
    setBarangayHealthError('');
    const [residentsResult, requestsResult, verificationResult, releaseResult, announcementsResult, lastRequestResult, lastVerificationResult, lastReleaseResult] = await Promise.all([
      supabase.from('residents').select('id', { count: 'exact', head: true }).eq('barangay_id', barangayId),
      supabase.from('resident_intake_requests').select('id', { count: 'exact', head: true }).eq('barangay_id', barangayId),
      supabase.from('resident_verification_requests').select('id', { count: 'exact', head: true }).eq('barangay_id', barangayId),
      supabase.from('release_logs').select('id', { count: 'exact', head: true }).eq('barangay_id', barangayId),
      supabase.from('announcements').select('id', { count: 'exact', head: true }).eq('barangay_id', barangayId),
      supabase.from('resident_intake_requests').select('created_at').eq('barangay_id', barangayId).order('created_at', { ascending: false }).limit(1),
      supabase.from('resident_verification_requests').select('created_at').eq('barangay_id', barangayId).order('created_at', { ascending: false }).limit(1),
      supabase.from('release_logs').select('released_at').eq('barangay_id', barangayId).order('released_at', { ascending: false }).limit(1),
    ]);

    if (isCancelled()) {
      setBarangayHealthLoading(false);
      return;
    }
    const errors = [
      residentsResult.error,
      requestsResult.error,
      verificationResult.error,
      releaseResult.error,
      announcementsResult.error,
      lastRequestResult.error,
      lastVerificationResult.error,
      lastReleaseResult.error,
    ].filter(Boolean);

    if (errors.length) {
      setBarangayHealthError(errors[0].message || 'Failed to load barangay health.');
      setBarangayHealthSnapshot(EMPTY_HEALTH_SNAPSHOT);
      setBarangayHealthLoading(false);
      return;
    }

    setBarangayHealthSnapshot({
      residents: residentsResult.count || 0,
      requests: requestsResult.count || 0,
      verifications: verificationResult.count || 0,
      releases: releaseResult.count || 0,
      announcements: announcementsResult.count || 0,
      lastRequestAt: lastRequestResult.data?.[0]?.created_at || null,
      lastVerificationAt: lastVerificationResult.data?.[0]?.created_at || null,
      lastReleaseAt: lastReleaseResult.data?.[0]?.released_at || null,
    });
    setBarangayHealthLoading(false);
  }, [supabase]);

  const barangayOptions = useMemo(() => {
    return barangays.map(item => ({ id: item.id, label: item.code ? `${item.name} (${item.code})` : item.name }));
  }, [barangays]);

  const barangayMap = useMemo(() => {
    return barangays.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }, [barangays]);

  useEffect(() => {
    const barangayId = selectedHealthBarangay || (barangayOptions[0]?.id ? String(barangayOptions[0].id) : '');
    if (!barangayId) return;
    let cancelled = false;
    (async () => {
      await loadBarangayHealthSnapshot(barangayId, () => cancelled);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedHealthBarangay, barangayOptions, loadBarangayHealthSnapshot]);

  const adminUserIds = useMemo(() => {
    return new Set(adminUsers.map(item => item.user_id));
  }, [adminUsers]);

  const filteredResidentAccounts = useMemo(() => {
    return residentAccounts.filter(item => !adminUserIds.has(item.user_id));
  }, [residentAccounts, adminUserIds]);

  const filteredAdminUsers = useMemo(() => {
    const query = adminSearch.trim().toLowerCase();
    if (!query) return adminUsers;
    return adminUsers.filter(item => {
      const barangayName = barangayMap[item.barangay_id]?.name || '';
      const haystack = [item.email || '', item.user_id || '', item.role || '', barangayName, item.barangay_id || '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [adminUsers, adminSearch, barangayMap]);

  const filteredResidentAccountsView = useMemo(() => {
    const query = residentSearch.trim().toLowerCase();
    const filtered = filteredResidentAccounts
      .filter(item => (residentStatusFilter === 'all' ? true : item.status === residentStatusFilter))
      .filter(item => (residentBarangayFilter === 'all' ? true : String(item.barangay_id || '') === String(residentBarangayFilter)))
      .filter(item => {
        if (!query) return true;
        const haystack = [item.email || '', item.user_id || '', item.status || ''].join(' ').toLowerCase();
        return haystack.includes(query);
      });

    if (residentSortMode === 'barangay') {
      return [...filtered].sort((a, b) => {
        const nameA = barangayMap[a.barangay_id]?.name || 'zzz';
        const nameB = barangayMap[b.barangay_id]?.name || 'zzz';
        if (nameA === nameB) return (b.created_at || '').localeCompare(a.created_at || '');
        return nameA.localeCompare(nameB);
      });
    }

    return [...filtered].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [filteredResidentAccounts, residentSearch, residentStatusFilter, residentBarangayFilter, residentSortMode, barangayMap]);

  async function handleCreateBarangay(event) {
    event.preventDefault();
    if (!createForm.name.trim()) return;
    setSaving(true);
    setError('');
    const payload = {
      name: createForm.name.trim(),
      code: createForm.code.trim() || null,
    };
    const { data, error: insertError } = await supabase
      .from('barangays')
      .insert(payload)
      .select('id, name, code, status, created_at')
      .single();
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }
    setBarangays(prev => [data, ...prev]);
    setCreateForm({ name: '', code: '' });
    setSaving(false);
    addToast('Barangay created successfully.', 'success');
    logAudit(supabase, { action: 'create_barangay', targetType: 'barangay', targetId: data.id, targetLabel: data.name });
  }

  async function handleAssignAdmin(event) {
    event.preventDefault();
    if (!assignForm.userId.trim() || !assignForm.barangayId) {
      setError('Provide the auth user ID and select a barangay.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      user_id: assignForm.userId.trim(),
      email: assignForm.email.trim() || null,
      barangay_id: assignForm.barangayId,
      role: assignForm.role,
    };
    const { data, error: upsertError } = await supabase
      .from('admin_users')
      .upsert(payload, { onConflict: 'user_id' })
      .select('user_id, email, role, barangay_id, created_at')
      .single();
    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }
    setAdminUsers(prev => [data, ...prev.filter(item => item.user_id !== data.user_id)]);
    setAssignForm({ userId: '', email: '', barangayId: '', role: 'barangay_admin' });
    setSaving(false);
    addToast('Admin assigned successfully.', 'success');
    logAudit(supabase, { action: 'assign_admin', targetType: 'admin', targetId: data.user_id, targetLabel: data.email, metadata: { role: data.role, barangay_id: data.barangay_id } });
  }

  async function handleDeleteAdmin(userId) {
    if (!userId) return;
    setAdminDeletingId(userId);
    setError('');
    const { error: deleteError } = await supabase.from('admin_users').delete().eq('user_id', userId);
    setAdminDeletingId('');
    if (deleteError) {
      setError(deleteError.message || 'Failed to delete admin assignment.');
      return;
    }
    setAdminUsers(prev => prev.filter(item => item.user_id !== userId));
    addToast('Admin assignment removed.', 'success');
    logAudit(supabase, { action: 'remove_admin', targetType: 'admin', targetId: userId });
  }

  async function handleCreateAdmin(event) {
    event.preventDefault();
    if (!createAdminForm.email.trim() || !createAdminForm.password || (createAdminForm.role !== 'superadmin' && !createAdminForm.barangayId)) {
      setError('Email and password are required. A barangay is required for barangay_admin role.');
      return;
    }
    setSaving(true);
    setError('');

    // Get a fresh access token
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const accessToken = refreshed?.session?.access_token;
    if (refreshError || !accessToken) {
      // Fallback to cached session if refresh fails
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        setError('Session expired. Please sign out and sign in again.');
        setSaving(false);
        return;
      }
    }
    const token = refreshed?.session?.access_token || (await supabase.auth.getSession()).data?.session?.access_token;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/create_admin_user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          email: createAdminForm.email.trim(),
          password: createAdminForm.password,
          barangay_id: createAdminForm.role === 'superadmin' ? null : createAdminForm.barangayId,
          role: createAdminForm.role,
        }),
      });

      const responseBody = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg = responseBody?.error || responseBody?.message || `Error ${response.status}`;
        const detail = responseBody?.detail ? ` (${responseBody.detail})` : '';
        setError(`${msg}${detail}`);
        setSaving(false);
        return;
      }

      if (!responseBody?.user_id) {
        setError(responseBody?.error || 'Create admin failed. Please try again.');
        setSaving(false);
        return;
      }

      setAdminUsers(prev => [{
        user_id: responseBody.user_id,
        email: createAdminForm.email.trim(),
        role: createAdminForm.role,
        barangay_id: createAdminForm.role === 'superadmin' ? null : createAdminForm.barangayId,
      }, ...prev]);
      setCreateAdminForm({ email: '', password: '', barangayId: '', role: 'barangay_admin' });
      setSaving(false);
      addToast('Admin account created.', 'success');
      logAudit(supabase, { action: 'create_admin', targetType: 'admin', targetId: responseBody.user_id, targetLabel: createAdminForm.email.trim(), metadata: { role: createAdminForm.role } });
    } catch (err) {
      setError(err.message || 'Network error. Please try again.');
      setSaving(false);
    }
  }

  async function handleSaveZoneSettings(event) {
    event.preventDefault();
    const zonesValue = Number(zoneForm.zonesCount);
    if (!zoneForm.barangayId || !Number.isFinite(zonesValue) || zonesValue < 1) return;
    setSaving(true);
    setError('');
        const { data, error: saveError } = await supabase
          .rpc('upsert_zone_settings', {
            p_barangay_id: zoneForm.barangayId,
            p_zones_count: Math.floor(zonesValue),
          })
          .single();

      if (saveError) {
        setError(saveError.message);
        setSaving(false);
        return;
      }

    setZoneSettings(prev => [data, ...prev.filter(item => item.barangay_id !== data.barangay_id)]);
    setZoneForm({ barangayId: '', zonesCount: '' });
    setSaving(false);
    addToast('Zone settings saved.', 'success');
    logAudit(supabase, { action: 'save_zone_settings', targetType: 'barangay', targetId: data.barangay_id, metadata: { zones_count: data.zones_count } });
  }

  function handleFeatureBarangayChange(event) {
    const barangayId = event.target.value;
    const selected = barangayMap[barangayId];
    setFeatureForm({
      barangayId,
      kiosk: selected?.enable_kiosk ?? true,
      portal: selected?.enable_portal ?? true,
      announcements: selected?.enable_announcements ?? true,
    });
  }

  async function handleSaveFeatureToggles(event) {
    event.preventDefault();
    if (!featureForm.barangayId) return;
    setSaving(true);
    setError('');
    const { data, error: updateError } = await supabase
      .from('barangays')
      .update({
        enable_kiosk: featureForm.kiosk,
        enable_portal: featureForm.portal,
        enable_announcements: featureForm.announcements,
      })
      .eq('id', featureForm.barangayId)
      .select('id, name, code, status, enable_kiosk, enable_portal, enable_announcements, created_at')
      .single();

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setBarangays(prev => [data, ...prev.filter(item => item.id !== data.id)]);
    setSaving(false);
    addToast('Feature toggles saved.', 'success');
    logAudit(supabase, { action: 'save_feature_toggles', targetType: 'barangay', targetId: data.id, targetLabel: data.name, metadata: { kiosk: data.enable_kiosk, portal: data.enable_portal, announcements: data.enable_announcements } });
  }

  async function handleSaveKioskPassword(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const trimmed = kioskPasswordInput.trim();
    if (trimmed && trimmed.length < 6) {
      setError('Kiosk password must be at least 6 characters.');
      setSaving(false);
      return;
    }
    try {
      const { data, error: updateError } = await supabase
        .from('app_settings')
        .upsert({
          key: 'kiosk_change_password',
          value: trimmed || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })
        .select('key, value')
        .single();

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      setKioskPassword(data?.value ? '(set)' : '');
      setKioskPasswordInput('');
      setSaving(false);
      addToast('Kiosk password updated.', 'success');
      logAudit(supabase, { action: 'update_kiosk_password', targetType: 'setting', targetId: 'kiosk_change_password' });
    } catch (err) {
      setError(err?.message || 'Unexpected error saving kiosk password.');
      setSaving(false);
    }
  }

  /* ── Seal & barangay header handlers ─────────────────────────── */
  function handleSealBarangayChange(event) {
    const id = event.target.value;
    const brgy = barangayMap[id];
    setSealForm({
      barangayId: id,
      province: brgy?.province || '',
      municipality: brgy?.municipality || '',
      barangayAddress: brgy?.barangay_address || '',
      barangayEmail: brgy?.barangay_email || '',
    });
    setSealPreview(brgy?.seal_url || '');
    setSealFile(null);
  }

  function handleSealFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      addToast('Only PNG, JPEG, or WebP images are allowed.', 'warning');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      addToast('Image must be under 2 MB.', 'warning');
      return;
    }
    setSealFile(file);
    setSealPreview(URL.createObjectURL(file));
  }

  async function handleSaveSeal(event) {
    event.preventDefault();
    if (!sealForm.barangayId) return;
    setSealSaving(true);
    setError('');

    let sealUrl = barangayMap[sealForm.barangayId]?.seal_url || null;

    if (sealFile) {
      const ext = sealFile.name.split('.').pop() || 'png';
      const filePath = `${sealForm.barangayId}/seal.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('barangay-seals')
        .upload(filePath, sealFile, { upsert: true, contentType: sealFile.type });

      if (uploadError) {
        setError(`Seal upload failed: ${uploadError.message}`);
        setSealSaving(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('barangay-seals')
        .getPublicUrl(filePath);
      sealUrl = publicUrlData?.publicUrl || null;
    }

    const { data: updated, error: updateError } = await supabase
      .from('barangays')
      .update({
        seal_url: sealUrl,
        province: sealForm.province.trim() || null,
        municipality: sealForm.municipality.trim() || null,
        barangay_address: sealForm.barangayAddress.trim() || null,
        barangay_email: sealForm.barangayEmail.trim() || null,
      })
      .eq('id', sealForm.barangayId)
      .select('id, name, code, status, enable_kiosk, enable_portal, enable_announcements, created_at, seal_url, province, municipality, barangay_address, barangay_email')
      .single();

    if (updateError) {
      setError(updateError.message);
      setSealSaving(false);
      return;
    }

    setBarangays(prev => prev.map(b => (b.id === updated.id ? { ...b, ...updated } : b)));
    setSealPreview(updated.seal_url || '');
    setSealFile(null);
    setSealSaving(false);
    addToast('Barangay seal and header info saved.', 'success');
    logAudit(supabase, { action: 'update_barangay_seal', targetType: 'barangay', targetId: updated.id, targetLabel: updated.name });
  }

  function handleAddDocumentOption(event) {
    event.preventDefault();
    const value = documentInput.trim();
    if (!value) return;
    setDocumentOptions(prev => {
      const next = normalizeDocumentOptions([...prev, value]);
      return next;
    });
    setDocumentInput('');
  }

  function handleUpdateDocumentOption(index, value) {
    const nextValue = (value || '').trimStart();
    setDocumentOptions(prev => prev.map((item, idx) => (idx === index ? nextValue : item)));
  }

  function handleRemoveDocumentOption(index) {
    setDocumentOptions(prev => prev.filter((_, idx) => idx !== index));
  }

  async function handleSaveDocumentOptions() {
    const cleaned = normalizeDocumentOptions(documentOptions);
    setDocumentsSaving(true);
    setError('');
    const { error: updateError } = await supabase
      .from('app_settings')
      .upsert({
        key: 'document_options',
        value: JSON.stringify(cleaned),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
      .select('key')
      .single();

    if (updateError) {
      setError(updateError.message);
      setDocumentsSaving(false);
      return;
    }

    setDocumentOptions(cleaned);
    setDocumentsSaving(false);
    addToast('Document options saved.', 'success');
    logAudit(supabase, { action: 'save_document_options', targetType: 'setting', targetId: 'document_options', metadata: { count: cleaned.length } });
  }

  async function handleSaveFees(event) {
    event.preventDefault();
    setFeesError('');
    setFeesInfo('');
    const nextService = Number(serviceFeeInput || 0);
    const nextSms = Number(smsFeeInput || 0);
    if (!Number.isFinite(nextService) || nextService < 0 || !Number.isFinite(nextSms) || nextSms < 0) {
      setFeesError('Fees must be non-negative numbers.');
      return;
    }
    setFeesSaving(true);
    const { error: updateError } = await supabase
      .from('app_settings')
      .upsert([
        { key: SERVICE_FEE_KEY, value: nextService, updated_at: new Date().toISOString() },
        { key: SMS_FEE_KEY, value: nextSms, updated_at: new Date().toISOString() },
      ], { onConflict: 'key' });

    setFeesSaving(false);
    if (updateError) {
      setFeesError(updateError.message);
      return;
    }
    setServiceFee(nextService);
    setSmsFee(nextSms);
    setFeesInfo('Fees saved and will be used across admin, kiosk, and remote requests.');
    addToast('Platform fees updated.', 'success');
    logAudit(supabase, { action: 'save_platform_fees', targetType: 'setting', metadata: { service_fee: nextService, sms_fee: nextSms } });
  }

  async function handleToggleResident(userId, nextStatus) {
    setSaving(true);
    setError('');
    const payload = {
      status: nextStatus,
      disabled_at: nextStatus === 'disabled' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { data, error: updateError } = await supabase
      .from('resident_accounts')
      .update(payload)
      .eq('user_id', userId)
      .select('user_id, email, status, created_at, updated_at, disabled_at')
      .single();

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setResidentAccounts(prev => {
      const existing = prev.find(item => item.user_id === data.user_id);
      return [{
        ...data,
        barangay_id: existing?.barangay_id || null,
      }, ...prev.filter(item => item.user_id !== data.user_id)];
    });
    setSaving(false);
    addToast(`Account ${nextStatus === 'disabled' ? 'disabled' : 'enabled'}.`, 'success');
    logAudit(supabase, { action: nextStatus === 'disabled' ? 'disable_resident' : 'enable_resident', targetType: 'resident', targetId: userId });
  }

  async function handleDeleteResident(userId) {
    setSaving(true);
    setError('');
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.access_token) {
      setError('You are not signed in. Please sign in again.');
      setSaving(false);
      return;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/delete_user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        user_id: userId,
      }),
    });

    let responseBody = {};
    let responseText = '';
    try {
      responseBody = await response.json();
    } catch {
      responseText = await response.text().catch(() => '');
    }

    if (!response.ok) {
      const detail = responseBody?.detail ? ` (${responseBody.detail})` : '';
      setError(responseBody?.error ? `${responseBody.error}${detail}` : responseText || 'Failed to delete user.');
      setSaving(false);
      return;
    }

    await supabase.from('resident_accounts').delete().eq('user_id', userId);
    setResidentAccounts(prev => prev.filter(item => item.user_id !== userId));
    setSaving(false);
    addToast('Account deleted.', 'success');
    logAudit(supabase, { action: 'delete_resident', targetType: 'resident', targetId: userId });
  }

  async function handleDeleteBarangay(barangayId) {
    if (!barangayId) return;
    setSaving(true);
    setError('');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (sessionError || !session?.access_token) {
      setError('You are not signed in. Please sign in again.');
      setSaving(false);
      return;
    }

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed?.session?.access_token) {
      setError('Your session expired. Please sign in again.');
      setSaving(false);
      return;
    }

    const accessToken = refreshed.session.access_token;

    const { data: deleteData, error: invokeError } = await supabase.functions.invoke('delete_barangay', {
      body: {
        barangay_id: barangayId,
        access_token: accessToken,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
      },
    });

    if (invokeError || deleteData?.error) {
      const detail = deleteData?.detail
        ? ` (${typeof deleteData.detail === 'string' ? deleteData.detail : 'Check function logs for details.'})`
        : '';
      setError(deleteData?.error ? `${deleteData.error}${detail}` : invokeError?.message || 'Failed to delete barangay.');
      setSaving(false);
      return;
    }

    setBarangays(prev => prev.filter(item => item.id !== barangayId));
    setZoneSettings(prev => prev.filter(item => item.barangay_id !== barangayId));
    setAdminUsers(prev => prev.filter(item => item.barangay_id !== barangayId));
    setFeatureForm(prev => (prev.barangayId === barangayId
      ? { barangayId: '', kiosk: true, portal: true, announcements: true }
      : prev));
    setZoneForm(prev => (prev.barangayId === barangayId ? { barangayId: '', zonesCount: '' } : prev));
    await handleRefreshHealth();
    setSaving(false);
    addToast('Barangay and all tied data were deleted.', 'success');
    logAudit(supabase, { action: 'delete_barangay', targetType: 'barangay', targetId: barangayId });
  }

  /* ── Data Cleanup handler ───────────────────────────────────── */
  async function handleCleanupData(barangayId, selectedCategories) {
    if (!barangayId || !selectedCategories) return;
    setCleanupRunning(true);
    setCleanupResults(null);

    const selected = CLEANUP_CATEGORIES.filter(c => selectedCategories[c.key]);
    if (!selected.length) {
      setCleanupRunning(false);
      return;
    }

    // Order matters: feedback → releases → requests → verifications → residents → others
    const deleteOrder = ['feedback', 'requests', 'releases', 'verifications', 'announcements', 'events', 'residents', 'audit_logs'];
    const sorted = [...selected].sort((a, b) => deleteOrder.indexOf(a.key) - deleteOrder.indexOf(b.key));

    const results = {};
    for (const category of sorted) {
      let result;
      if (category.table === 'audit_logs') {
        // Audit logs don't have a direct barangay_id column — delete all when selected
        result = await supabase.from(category.table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } else {
        result = await supabase.from(category.table).delete().eq('barangay_id', barangayId);
      }
      if (result.error) {
        results[category.key] = { success: false, error: result.error.message };
      } else {
        results[category.key] = { success: true };
      }
    }

    setCleanupResults(results);
    setCleanupRunning(false);

    const failedCount = Object.values(results).filter(r => !r.success).length;
    const successCount = Object.values(results).filter(r => r.success).length;
    const barangayName = barangays.find(b => b.id === barangayId)?.name || barangayId;

    if (failedCount === 0) {
      addToast(`Cleaned ${successCount} data categor${successCount === 1 ? 'y' : 'ies'} for ${barangayName}.`, 'success');
    } else {
      addToast(`${successCount} cleared, ${failedCount} failed. Check results below.`, 'error');
    }

    logAudit(supabase, {
      action: 'cleanup_barangay_data',
      targetType: 'barangay',
      targetId: barangayId,
      targetLabel: barangayName,
      metadata: { categories: sorted.map(c => c.key), results },
    });
  }

  function formatTimestamp(value) {
    if (!value) return 'No activity yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No activity yet';
    return date.toLocaleString('en-PH');
  }

  async function handleRefreshHealth() {
    setHealthLoading(true);
    setHealthError('');
    const [residentsResult, requestsResult, verificationResult, releaseResult, announcementsResult, lastRequestResult, lastVerificationResult, lastReleaseResult] = await Promise.all([
      supabase.from('residents').select('id', { count: 'exact', head: true }),
      supabase.from('resident_intake_requests').select('id', { count: 'exact', head: true }),
      supabase.from('resident_verification_requests').select('id', { count: 'exact', head: true }),
      supabase.from('release_logs').select('id', { count: 'exact', head: true }),
      supabase.from('announcements').select('id', { count: 'exact', head: true }),
      supabase.from('resident_intake_requests').select('created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('resident_verification_requests').select('created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('release_logs').select('released_at').order('released_at', { ascending: false }).limit(1),
    ]);

    const errors = [
      residentsResult.error,
      requestsResult.error,
      verificationResult.error,
      releaseResult.error,
      announcementsResult.error,
      lastRequestResult.error,
      lastVerificationResult.error,
      lastReleaseResult.error,
    ].filter(Boolean);

    if (errors.length) {
      setHealthError(errors[0].message || 'Failed to load DB health.');
      setHealthLoading(false);
      return;
    }

    const lastRequestAt = lastRequestResult.data?.[0]?.created_at || null;
    const lastVerificationAt = lastVerificationResult.data?.[0]?.created_at || null;
    const lastReleaseAt = lastReleaseResult.data?.[0]?.released_at || null;

    setHealthSnapshot({
      residents: residentsResult.count || 0,
      requests: requestsResult.count || 0,
      verifications: verificationResult.count || 0,
      releases: releaseResult.count || 0,
      announcements: announcementsResult.count || 0,
      lastRequestAt,
      lastVerificationAt,
      lastReleaseAt,
    });
    setHealthLoading(false);
  }

  async function handleRefreshBarangayHealth() {
    const barangayId = selectedHealthBarangay || (barangayOptions[0]?.id ? String(barangayOptions[0].id) : '');
    if (!barangayId) return;
    await loadBarangayHealthSnapshot(barangayId);
  }

  return (
    <div className="sa-shell min-h-screen w-full bg-(--sbk-page-bg) px-4 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        {/* Mobile header with hamburger */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 rounded-2xl shadow-sm lg:hidden">
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
          <p className="text-sm font-semibold text-slate-600">{SUPERADMIN_TABS.find(t => t.key === activeTab)?.label}</p>
        </div>

        {/* Mobile drawer */}
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
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Superadmin</p>
                  <p className="text-base font-semibold text-slate-900">Developer Panel</p>
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
                {SUPERADMIN_TABS.map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                      activeTab === tab.key
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 text-slate-600'
                    }`}
                    onClick={() => { setActiveTab(tab.key); setDrawerOpen(false); }}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
              <button
                type="button"
                className="mt-4 w-full rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700"
                onClick={onLogout}
              >
                Sign out
              </button>
            </div>
            <div className="flex-1 bg-black/40 backdrop-blur-sm" />
          </div>
        )}

        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">Superadmin</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">Developer Panel</h1>
              <p className="mt-2 text-sm text-slate-600">
                Manage barangays, assign administrators, and monitor tenant data from one workspace.
              </p>
            </div>
            {/* ── Feature 5: Global Search ── */}
            <div className="relative w-full max-w-sm">
              <input
                type="search"
                value={globalSearch}
                onChange={event => {
                  setGlobalSearch(event.target.value);
                  handleGlobalSearch(event.target.value);
                }}
                placeholder="Search everything... (barangays, admins, residents, requests)"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
              />
              {globalSearchLoading ? (
                <span className="absolute right-3 top-2.5 text-xs text-slate-400">Searching…</span>
              ) : null}
              {globalSearchResults && globalSearch.trim().length >= 2 ? (
                <div className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-xl max-h-80 overflow-y-auto">
                  <button type="button" className="absolute top-2 right-3 text-xs text-slate-400 hover:text-slate-600" onClick={() => { setGlobalSearch(''); setGlobalSearchResults(null); }}>Clear</button>
                  {[
                    { label: 'Barangays', items: globalSearchResults.barangays, render: i => `${i.name} (${i.code || 'no code'})` },
                    { label: 'Admins', items: globalSearchResults.admins, render: i => `${i.email || 'No email'} · ${i.role}` },
                    { label: 'Residents', items: globalSearchResults.residents, render: i => `${i.last_name}, ${i.first_name}` },
                    { label: 'Requests', items: globalSearchResults.requests, render: i => `${i.document || 'Unknown'} · ${i.reference_number || i.status || ''}` },
                  ].map(group => (
                    group.items.length ? (
                      <div key={group.label} className="mb-3">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">{group.label}</p>
                        {group.items.map((item, idx) => (
                          <p key={idx} className="truncate text-sm text-slate-700 py-0.5">{group.render(item)}</p>
                        ))}
                      </div>
                    ) : null
                  ))}
                  {!globalSearchResults.barangays.length && !globalSearchResults.admins.length && !globalSearchResults.residents.length && !globalSearchResults.requests.length ? (
                    <p className="text-sm text-slate-400">No results found.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        ) : null}
        <nav className="hidden flex-wrap gap-2 lg:flex">
          {SUPERADMIN_TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-emerald-500 font-semibold">DB Health</p>
                <h2 className="text-xl font-bold text-gray-900">Activity snapshot</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Proxy metrics based on row counts and latest activity timestamps.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                onClick={handleRefreshHealth}
                disabled={healthLoading}
              >
                {healthLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            {healthError ? (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                {healthError}
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-gray-400">Residents</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{healthSnapshot.residents}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-gray-400">Requests</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{healthSnapshot.requests}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-gray-400">Verifications</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{healthSnapshot.verifications}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-gray-400">Releases</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{healthSnapshot.releases}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-gray-400">Announcements</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{healthSnapshot.announcements}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-gray-400">Last request</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{formatTimestamp(healthSnapshot.lastRequestAt)}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-gray-400">Last verification</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{formatTimestamp(healthSnapshot.lastVerificationAt)}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-gray-400">Last release</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{formatTimestamp(healthSnapshot.lastReleaseAt)}</p>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === 'overview' ? (
          <section className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6 shadow-lg">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold">Per Barangay</p>
                <h2 className="text-xl font-bold text-indigo-900">Focused activity snapshot</h2>
                <p className="mt-1 text-sm text-indigo-700/80">Switch barangays to see granular request traffic and recency.</p>
              </div>
              <div className="flex flex-wrap gap-2 sm:items-center">
                <select
                  className="rounded-2xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-900 shadow-sm"
                  value={selectedHealthBarangay || (barangayOptions[0]?.id ? String(barangayOptions[0].id) : '')}
                  onChange={event => setSelectedHealthBarangay(event.target.value)}
                  aria-label="Select barangay for health snapshot"
                >
                  {barangayOptions.map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                  onClick={handleRefreshBarangayHealth}
                  disabled={barangayHealthLoading}
                >
                  {barangayHealthLoading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            </div>
            {barangayHealthError ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{barangayHealthError}</div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-indigo-400">Residents</p>
                <p className="mt-1 text-lg font-semibold text-indigo-900">{barangayHealthSnapshot.residents}</p>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-indigo-400">Requests</p>
                <p className="mt-1 text-lg font-semibold text-indigo-900">{barangayHealthSnapshot.requests}</p>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-indigo-400">Verifications</p>
                <p className="mt-1 text-lg font-semibold text-indigo-900">{barangayHealthSnapshot.verifications}</p>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-indigo-400">Releases</p>
                <p className="mt-1 text-lg font-semibold text-indigo-900">{barangayHealthSnapshot.releases}</p>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-indigo-400">Announcements</p>
                <p className="mt-1 text-lg font-semibold text-indigo-900">{barangayHealthSnapshot.announcements}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-indigo-400">Last request</p>
                <p className="mt-1 text-sm font-semibold text-indigo-900">{formatTimestamp(barangayHealthSnapshot.lastRequestAt)}</p>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-indigo-400">Last verification</p>
                <p className="mt-1 text-sm font-semibold text-indigo-900">{formatTimestamp(barangayHealthSnapshot.lastVerificationAt)}</p>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-widest text-indigo-400">Last release</p>
                <p className="mt-1 text-sm font-semibold text-indigo-900">{formatTimestamp(barangayHealthSnapshot.lastReleaseAt)}</p>
              </div>
            </div>
          </section>
        ) : null}

        {/* ── Feature 3: Real-Time Activity Feed ── */}
        {activeTab === 'overview' ? (
          <section className="rounded-3xl border border-violet-100 bg-violet-50 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-violet-500 font-semibold">Live</p>
                <h2 className="text-xl font-bold text-violet-900">Activity Feed</h2>
                <p className="mt-1 text-sm text-violet-700/80">Real-time events from all barangays. Updates automatically.</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-500">
                <span className="inline-block h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
                Listening
              </span>
            </div>
            <div className="mt-4 max-h-64 overflow-y-auto space-y-2 scrollbar-thin">
              {activityFeed.length ? activityFeed.map(event => (
                <div key={event.id} className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-white px-4 py-2.5">
                  <span className={`mt-0.5 inline-block h-2 w-2 rounded-full shrink-0 ${event.type === 'request' ? 'bg-blue-500' : event.type === 'verification' ? 'bg-amber-500' : event.type === 'release' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-violet-900">{event.message}</p>
                    <p className="text-xs text-violet-500">{event.detail} · {formatTimestamp(event.time)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600">{event.type}</span>
                </div>
              )) : (
                <p className="rounded-2xl border border-dashed border-violet-200 px-4 py-3 text-sm text-violet-400">
                  No events yet. Activity will appear here in real time as residents submit requests, get verified, or have documents released.
                </p>
              )}
            </div>
          </section>
        ) : null}

        {/* ── Daily Summary (overview tab) ── */}
        {activeTab === 'overview' ? (
          <DailySummaryPanel supabase={supabase} barangayId={null} />
        ) : null}

        {/* ── Feature 2: Analytics Tab ── */}
        {activeTab === 'analytics' ? (
          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-cyan-500 font-semibold">Analytics</p>
                  <h2 className="text-xl font-bold text-gray-900">Platform Insights</h2>
                  <p className="mt-1 text-sm text-gray-500">Visual breakdowns of requests, residents, and document activity.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-full border border-cyan-200 px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-50" onClick={loadAnalytics} disabled={analyticsLoading}>
                    {analyticsLoading ? 'Loading…' : 'Refresh'}
                  </button>
                  {analyticsData ? (
                    <>
                      <button type="button" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => {
                        const rows = analyticsData.requests.map(r => ({ id: r.id, barangay_id: r.barangay_id, document: r.document, status: r.status, created_at: r.created_at }));
                        downloadCSV(rows, ['id', 'barangay_id', 'document', 'status', 'created_at'], 'requests_export.csv');
                        addToast('Requests exported to CSV.', 'success');
                        logAudit(supabase, { action: 'export_csv', targetType: 'requests', metadata: { count: rows.length } });
                      }}>Export Requests CSV</button>
                      <button type="button" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => {
                        const rows = analyticsData.residents.map(r => ({ id: r.id, barangay_id: r.barangay_id, sex: r.sex, birthday: r.birthday, created_at: r.created_at }));
                        downloadCSV(rows, ['id', 'barangay_id', 'sex', 'birthday', 'created_at'], 'residents_export.csv');
                        addToast('Residents exported to CSV.', 'success');
                        logAudit(supabase, { action: 'export_csv', targetType: 'residents', metadata: { count: rows.length } });
                      }}>Export Residents CSV</button>
                    </>
                  ) : null}
                </div>
              </div>

              {analyticsLoading ? (
                <p className="mt-6 text-sm text-gray-400">Loading analytics data…</p>
              ) : analyticsData ? (() => {
                // Compute charts
                const requestsByBarangay = barangays.map(b => ({
                  name: b.name,
                  value: analyticsData.requests.filter(r => r.barangay_id === b.id).length,
                })).sort((a, b) => b.value - a.value);

                const residentsByBarangay = barangays.map(b => ({
                  name: b.name,
                  value: analyticsData.residents.filter(r => r.barangay_id === b.id).length,
                })).sort((a, b) => b.value - a.value);

                const docTypeCounts = {};
                for (const r of analyticsData.requests) {
                  const doc = r.document || 'Unknown';
                  docTypeCounts[doc] = (docTypeCounts[doc] || 0) + 1;
                }
                const requestsByDocType = Object.entries(docTypeCounts)
                  .map(([name, value]) => ({ name, value }))
                  .sort((a, b) => b.value - a.value);

                const statusCounts = {};
                for (const r of analyticsData.requests) {
                  const st = r.status || 'unknown';
                  statusCounts[st] = (statusCounts[st] || 0) + 1;
                }
                const requestsByStatus = Object.entries(statusCounts)
                  .map(([name, value]) => ({ name, value }))
                  .sort((a, b) => b.value - a.value);

                const verByStatus = {};
                for (const v of analyticsData.verifications) {
                  const st = v.status || 'unknown';
                  verByStatus[st] = (verByStatus[st] || 0) + 1;
                }
                const verificationsByStatus = Object.entries(verByStatus)
                  .map(([name, value]) => ({ name, value }))
                  .sort((a, b) => b.value - a.value);

                // Demographics
                const sexCounts = {};
                for (const r of analyticsData.residents) {
                  const s = r.sex || 'Unspecified';
                  sexCounts[s] = (sexCounts[s] || 0) + 1;
                }
                const residentsBySex = Object.entries(sexCounts)
                  .map(([name, value]) => ({ name, value }))
                  .sort((a, b) => b.value - a.value);

                const now = new Date();
                const ageBuckets = { '0-17': 0, '18-30': 0, '31-45': 0, '46-60': 0, '60+': 0, 'Unknown': 0 };
                for (const r of analyticsData.residents) {
                  if (!r.birthday) { ageBuckets['Unknown']++; continue; }
                  const age = Math.floor((now - new Date(r.birthday)) / 31557600000);
                  if (age < 18) ageBuckets['0-17']++;
                  else if (age <= 30) ageBuckets['18-30']++;
                  else if (age <= 45) ageBuckets['31-45']++;
                  else if (age <= 60) ageBuckets['46-60']++;
                  else ageBuckets['60+']++;
                }
                const residentsByAge = Object.entries(ageBuckets)
                  .filter(([, v]) => v > 0)
                  .map(([name, value]) => ({ name, value }));

                // Summary cards
                const totalRequests = analyticsData.requests.length;
                const totalResidents = analyticsData.residents.length;
                const totalVerifications = analyticsData.verifications.length;
                const totalReleases = analyticsData.releases.length;
                const pendingRequests = analyticsData.requests.filter(r => r.status === 'pending').length;
                const pendingVerifications = analyticsData.verifications.filter(v => v.status === 'pending').length;

                return (
                  <>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                      <div className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-widest text-cyan-500">Total Requests</p>
                        <p className="mt-1 text-lg font-bold text-cyan-900">{totalRequests}</p>
                      </div>
                      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-widest text-blue-500">Total Residents</p>
                        <p className="mt-1 text-lg font-bold text-blue-900">{totalResidents}</p>
                      </div>
                      <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-widest text-amber-500">Verifications</p>
                        <p className="mt-1 text-lg font-bold text-amber-900">{totalVerifications}</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-widest text-emerald-500">Releases</p>
                        <p className="mt-1 text-lg font-bold text-emerald-900">{totalReleases}</p>
                      </div>
                      <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-widest text-rose-500">Pending Requests</p>
                        <p className="mt-1 text-lg font-bold text-rose-900">{pendingRequests}</p>
                      </div>
                      <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-widest text-orange-500">Pending Verif.</p>
                        <p className="mt-1 text-lg font-bold text-orange-900">{pendingVerifications}</p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-6 lg:grid-cols-2">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <BarChart data={requestsByBarangay} label="Requests per Barangay" colorClass="bg-cyan-500" />
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <BarChart data={residentsByBarangay} label="Residents per Barangay" colorClass="bg-blue-500" />
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <BarChart data={requestsByDocType} label="Requests by Document Type" colorClass="bg-emerald-500" />
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <BarChart data={requestsByStatus} label="Requests by Status" colorClass="bg-amber-500" />
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <BarChart data={verificationsByStatus} label="Verifications by Status" colorClass="bg-violet-500" />
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <BarChart data={residentsBySex} label="Residents by Sex" colorClass="bg-pink-500" />
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 lg:col-span-2">
                        <BarChart data={residentsByAge} label="Residents by Age Group" colorClass="bg-indigo-500" />
                      </div>
                    </div>
                  </>
                );
              })() : (
                <p className="mt-6 text-sm text-gray-400">Click Refresh to load analytics.</p>
              )}
            </div>
          </section>
        ) : null}

        {/* ── System Broadcast Tab ── */}
        {activeTab === 'broadcast' ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold">System-Wide</p>
              <h2 className="text-xl font-bold text-gray-900">Broadcast Announcement</h2>
              <p className="mt-2 text-sm text-gray-500">
                Publish a system-wide notice that appears on <strong>all kiosks</strong> and <strong>resident portals</strong>. Use this for updates, maintenance notices, or bug fix announcements.
              </p>
            </div>

            {broadcastLoading ? (
              <p className="text-sm text-gray-500">Loading current broadcast…</p>
            ) : (
              <div className="space-y-5">
                {broadcastError && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{broadcastError}</p>}
                {broadcastInfo && <p className="rounded-xl bg-green-50 px-4 py-2 text-sm text-green-700">{broadcastInfo}</p>}

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={broadcastForm.enabled}
                    onChange={e => setBroadcastForm(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-semibold text-gray-900">
                    {broadcastForm.enabled ? '🟢 Broadcast is enabled (visible to all users)' : '⚪ Broadcast is disabled (hidden)'}
                  </span>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Title</label>
                    <input
                      type="text"
                      value={broadcastForm.title}
                      onChange={e => setBroadcastForm(prev => ({ ...prev, title: e.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
                      placeholder="e.g. System Update v2.5 — Bug Fixes & Improvements"
                      maxLength={150}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Message</label>
                    <textarea
                      value={broadcastForm.message}
                      onChange={e => setBroadcastForm(prev => ({ ...prev, message: e.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
                      rows={4}
                      placeholder="Describe the update, bug fix, or announcement. This message will be displayed to all residents and kiosk users."
                      maxLength={500}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Type</label>
                    <select
                      value={broadcastForm.type}
                      onChange={e => setBroadcastForm(prev => ({ ...prev, type: e.target.value }))}
                      className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="info">ℹ️ Info</option>
                      <option value="update">🔄 Update / Bug Fix</option>
                      <option value="warning">⚠️ Warning / Maintenance</option>
                      <option value="success">✅ Good News</option>
                    </select>
                  </div>
                </div>

                {broadcastForm.enabled && broadcastForm.title.trim() ? (
                  <div className={`rounded-2xl border p-4 text-sm ${
                    broadcastForm.type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : broadcastForm.type === 'success' ? 'border-green-200 bg-green-50 text-green-900'
                    : broadcastForm.type === 'update' ? 'border-blue-200 bg-blue-50 text-blue-900'
                    : 'border-indigo-200 bg-indigo-50 text-indigo-900'
                  }`}>
                    <p className="font-semibold">{broadcastForm.title}</p>
                    {broadcastForm.message && <p className="mt-1 text-xs opacity-80">{broadcastForm.message}</p>}
                    <p className="mt-2 text-[11px] opacity-60">Preview — this is how users will see the broadcast</p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:opacity-50"
                    onClick={handleSaveBroadcast}
                    disabled={broadcastSaving || !broadcastForm.title.trim()}
                  >
                    {broadcastSaving ? 'Saving…' : 'Save & Publish'}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-gray-200 px-6 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    onClick={handleClearBroadcast}
                    disabled={broadcastSaving}
                  >
                    Clear Broadcast
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'tenants' ? (
          <>
            {/* ── Feature 4: Onboarding Wizard ── */}
            <section className="rounded-3xl border-2 border-dashed border-teal-300 bg-teal-50 p-6 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-teal-500 font-semibold">Quick Setup</p>
                  <h2 className="text-xl font-bold text-teal-900">Barangay Onboarding Wizard</h2>
                  <p className="mt-1 text-sm text-teal-700/80">Create a barangay, configure zones &amp; features, and set up an admin — all in one guided flow.</p>
                </div>
                <button type="button" className="rounded-full bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-teal-500" onClick={() => { resetWizard(); setWizardOpen(true); }}>
                  Start Wizard
                </button>
              </div>

              {wizardOpen ? (
                <div className="mt-6">
                  {/* Step indicators */}
                  <div className="flex items-center gap-1 mb-6">
                    {WIZARD_STEPS.map((step, i) => (
                      <div key={step} className="flex items-center gap-1">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i < wizardStep ? 'bg-teal-600 text-white' : i === wizardStep ? 'bg-teal-900 text-white' : 'bg-teal-200 text-teal-600'}`}>{i + 1}</span>
                        <span className={`text-xs font-semibold ${i <= wizardStep ? 'text-teal-900' : 'text-teal-400'}`}>{step}</span>
                        {i < WIZARD_STEPS.length - 1 ? <span className="mx-1 h-px w-6 bg-teal-300" /> : null}
                      </div>
                    ))}
                  </div>

                  {wizardError ? <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{wizardError}</p> : null}

                  {/* Step 0: Name & Code */}
                  {wizardStep === 0 ? (
                    <div className="space-y-4 max-w-md">
                      <label className="block text-sm font-semibold text-teal-900">
                        Barangay name *
                        <input type="text" className="mt-2 w-full rounded-2xl border border-teal-200 px-4 py-3 text-sm text-gray-900" value={wizardData.name} onChange={e => setWizardData(p => ({ ...p, name: e.target.value }))} required />
                      </label>
                      <label className="block text-sm font-semibold text-teal-900">
                        Code (optional)
                        <input type="text" className="mt-2 w-full rounded-2xl border border-teal-200 px-4 py-3 text-sm text-gray-900" value={wizardData.code} onChange={e => setWizardData(p => ({ ...p, code: e.target.value }))} placeholder="brgy-001" />
                      </label>
                      <button type="button" className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-500" disabled={!wizardData.name.trim()} onClick={() => setWizardStep(1)}>Next</button>
                    </div>
                  ) : null}

                  {/* Step 1: Zones */}
                  {wizardStep === 1 ? (
                    <div className="space-y-4 max-w-md">
                      <label className="block text-sm font-semibold text-teal-900">
                        Number of zones / purok
                        <input type="number" min="1" className="mt-2 w-full rounded-2xl border border-teal-200 px-4 py-3 text-sm text-gray-900" value={wizardData.zonesCount} onChange={e => setWizardData(p => ({ ...p, zonesCount: e.target.value }))} />
                      </label>
                      <div className="flex gap-2">
                        <button type="button" className="rounded-full border border-teal-200 bg-white px-5 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50" onClick={() => setWizardStep(0)}>Back</button>
                        <button type="button" className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-500" onClick={() => setWizardStep(2)}>Next</button>
                      </div>
                    </div>
                  ) : null}

                  {/* Step 2: Features */}
                  {wizardStep === 2 ? (
                    <div className="space-y-4 max-w-md">
                      <p className="text-sm text-teal-800">Enable or disable these services for <strong>{wizardData.name}</strong>:</p>
                      <label className="flex items-center gap-2 text-sm text-teal-900">
                        <input type="checkbox" checked={wizardData.kiosk} onChange={e => setWizardData(p => ({ ...p, kiosk: e.target.checked }))} /> Kiosk
                      </label>
                      <label className="flex items-center gap-2 text-sm text-teal-900">
                        <input type="checkbox" checked={wizardData.portal} onChange={e => setWizardData(p => ({ ...p, portal: e.target.checked }))} /> Remote Portal
                      </label>
                      <label className="flex items-center gap-2 text-sm text-teal-900">
                        <input type="checkbox" checked={wizardData.announcements} onChange={e => setWizardData(p => ({ ...p, announcements: e.target.checked }))} /> Announcements
                      </label>
                      <div className="flex gap-2">
                        <button type="button" className="rounded-full border border-teal-200 bg-white px-5 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50" onClick={() => setWizardStep(1)}>Back</button>
                        <button type="button" className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-500" onClick={() => setWizardStep(3)}>Next</button>
                      </div>
                    </div>
                  ) : null}

                  {/* Step 3: Admin Account */}
                  {wizardStep === 3 ? (
                    <div className="space-y-4 max-w-md">
                      <p className="text-sm text-teal-800">Optionally create the first admin for <strong>{wizardData.name}</strong>. Leave blank to skip.</p>
                      <label className="block text-sm font-semibold text-teal-900">
                        Admin email
                        <input type="email" className="mt-2 w-full rounded-2xl border border-teal-200 px-4 py-3 text-sm text-gray-900" value={wizardData.adminEmail} onChange={e => setWizardData(p => ({ ...p, adminEmail: e.target.value }))} placeholder="admin@example.com" />
                      </label>
                      <label className="block text-sm font-semibold text-teal-900">
                        Temporary password
                        <input type="password" className="mt-2 w-full rounded-2xl border border-teal-200 px-4 py-3 text-sm text-gray-900" value={wizardData.adminPassword} onChange={e => setWizardData(p => ({ ...p, adminPassword: e.target.value }))} />
                      </label>
                      <label className="block text-sm font-semibold text-teal-900">
                        Role
                        <select className="mt-2 w-full rounded-2xl border border-teal-200 px-4 py-3 text-sm text-gray-900" value={wizardData.adminRole} onChange={e => setWizardData(p => ({ ...p, adminRole: e.target.value }))}>
                          <option value="barangay_admin">Barangay admin</option>
                          <option value="superadmin">Superadmin</option>
                        </select>
                      </label>
                      <div className="flex gap-2">
                        <button type="button" className="rounded-full border border-teal-200 bg-white px-5 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50" onClick={() => setWizardStep(2)}>Back</button>
                        <button type="button" className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-500" onClick={handleWizardFinish} disabled={wizardSaving}>
                          {wizardSaving ? 'Creating…' : 'Finish & Create'}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Step 4: Done */}
                  {wizardStep === WIZARD_STEPS.length - 1 && wizardCreatedBarangay ? (
                    <div className="space-y-4 max-w-md">
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                        <p className="text-sm font-semibold text-emerald-800">Barangay "{wizardCreatedBarangay.name}" has been created and configured.</p>
                        <p className="mt-1 text-xs text-emerald-600">You can now manage it from the Tenants, Admins, and other tabs.</p>
                      </div>
                      <button type="button" className="rounded-full border border-teal-200 bg-white px-5 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50" onClick={() => { setWizardOpen(false); resetWizard(); }}>Close Wizard</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-blue-500 font-semibold">Barangays</p>
                    <h2 className="text-xl font-bold text-gray-900">Create barangay</h2>
                  </div>
                </div>
                <form className="mt-5 space-y-4" onSubmit={handleCreateBarangay}>
                  <label className="block text-sm font-semibold text-gray-700">
                    Barangay name
                    <input
                      type="text"
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      value={createForm.name}
                      onChange={event => setCreateForm(prev => ({ ...prev, name: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="block text-sm font-semibold text-gray-700">
                    Barangay code (optional)
                    <input
                      type="text"
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      value={createForm.code}
                      onChange={event => setCreateForm(prev => ({ ...prev, code: event.target.value }))}
                      placeholder="e.g., brgy-001"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Create barangay'}
                  </button>
                </form>
              </div>

              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
                <div>
                  <p className="text-xs uppercase tracking-widest text-emerald-500 font-semibold">Barangay Settings</p>
                  <h2 className="text-xl font-bold text-gray-900">Zone count</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Set how many zones/purok appear in resident forms for each barangay.
                  </p>
                </div>
                <form className="mt-5 space-y-4" onSubmit={handleSaveZoneSettings}>
                  <label className="block text-sm font-semibold text-gray-700">
                    Barangay
                    <select
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      value={zoneForm.barangayId}
                      onChange={event => setZoneForm(prev => ({ ...prev, barangayId: event.target.value }))}
                      required
                    >
                      <option value="">Select barangay</option>
                      {barangayOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-gray-700">
                    Zones count
                    <input
                      type="number"
                      min="1"
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      value={zoneForm.zonesCount}
                      onChange={event => setZoneForm(prev => ({ ...prev, zonesCount: event.target.value }))}
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save settings'}
                  </button>
                </form>
                {zoneSettings.length ? (
                  <div className="mt-4 space-y-2 text-xs text-gray-500">
                    {zoneSettings.map(item => (
                      <div key={item.id} className="flex items-center justify-between">
                        <span>{barangayMap[item.barangay_id]?.name || item.barangay_id}</span>
                        <span>{item.zones_count} zones</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Feature Toggles</p>
                <h2 className="text-xl font-bold text-gray-900">Enable services</h2>
                <p className="mt-2 text-sm text-gray-500">
                  Turn on/off kiosk, remote portal, and announcements per barangay.
                </p>
              </div>
              <form className="mt-5 grid gap-4 md:grid-cols-[2fr,1fr,1fr,1fr]" onSubmit={handleSaveFeatureToggles}>
                <label className="block text-sm font-semibold text-gray-700 md:col-span-4">
                  Barangay
                  <select
                    className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                    value={featureForm.barangayId}
                    onChange={handleFeatureBarangayChange}
                    required
                  >
                    <option value="">Select barangay</option>
                    {barangayOptions.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={featureForm.kiosk}
                    onChange={event => setFeatureForm(prev => ({ ...prev, kiosk: event.target.checked }))}
                    disabled={!featureForm.barangayId}
                  />
                  Kiosk
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={featureForm.portal}
                    onChange={event => setFeatureForm(prev => ({ ...prev, portal: event.target.checked }))}
                    disabled={!featureForm.barangayId}
                  />
                  Remote portal
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={featureForm.announcements}
                    onChange={event => setFeatureForm(prev => ({ ...prev, announcements: event.target.checked }))}
                    disabled={!featureForm.barangayId}
                  />
                  Announcements
                </label>
                <div className="md:col-span-4">
                  <button
                    type="submit"
                    className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
                    disabled={saving || !featureForm.barangayId}
                  >
                    {saving ? 'Saving...' : 'Save toggles'}
                  </button>
                </div>
              </form>
            </section>

            {/* ── Barangay Seal & Document Header ── */}
            <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
              <div>
                <p className="text-xs uppercase tracking-widest text-rose-500 font-semibold">Document Branding</p>
                <h2 className="text-xl font-bold text-gray-900">Barangay seal &amp; header</h2>
                <p className="mt-2 text-sm text-gray-500">
                  Upload the official barangay seal image and set the header information used in generated PDF documents (province, municipality, address, email).
                </p>
              </div>
              <form className="mt-5 space-y-4" onSubmit={handleSaveSeal}>
                <label className="block text-sm font-semibold text-gray-700">
                  Barangay
                  <select
                    className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                    value={sealForm.barangayId}
                    onChange={handleSealBarangayChange}
                    required
                  >
                    <option value="">Select barangay</option>
                    {barangayOptions.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>

                {sealForm.barangayId && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-semibold text-gray-700">
                        Province
                        <input type="text" className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900" value={sealForm.province} onChange={e => setSealForm(p => ({ ...p, province: e.target.value }))} placeholder="e.g., Camarines Sur" />
                      </label>
                      <label className="block text-sm font-semibold text-gray-700">
                        Municipality / City
                        <input type="text" className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900" value={sealForm.municipality} onChange={e => setSealForm(p => ({ ...p, municipality: e.target.value }))} placeholder="e.g., Presentacion" />
                      </label>
                      <label className="block text-sm font-semibold text-gray-700">
                        Barangay address line
                        <input type="text" className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900" value={sealForm.barangayAddress} onChange={e => setSealForm(p => ({ ...p, barangayAddress: e.target.value }))} placeholder="e.g., Barangay Maangas, Zone 9, District IV" />
                      </label>
                      <label className="block text-sm font-semibold text-gray-700">
                        Barangay email
                        <input type="email" className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900" value={sealForm.barangayEmail} onChange={e => setSealForm(p => ({ ...p, barangayEmail: e.target.value }))} placeholder="e.g., barangay@gmail.com" />
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Barangay seal image</label>
                      <div className="flex items-center gap-4">
                        {sealPreview && (
                          <img src={sealPreview} alt="Barangay seal preview" className="h-20 w-20 rounded-2xl border border-gray-200 object-contain bg-white" />
                        )}
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleSealFileChange} className="text-sm text-gray-600" />
                      </div>
                      <p className="mt-1 text-xs text-gray-400">PNG, JPEG, or WebP. Max 2 MB. This seal will appear on generated PDF documents.</p>
                    </div>

                    <button type="submit" className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-rose-500 disabled:opacity-60" disabled={sealSaving}>
                      {sealSaving ? 'Saving…' : 'Save seal & header'}
                    </button>
                  </>
                )}
              </form>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Directory</p>
                  <h2 className="text-xl font-bold text-gray-900">Existing barangays</h2>
                </div>
              </div>
              {loading ? (
                <p className="mt-4 text-sm text-gray-500">Loading data...</p>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {barangays.map(item => (
                    <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.code || 'No code'} · {item.status}</p>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          onClick={() => {
                            setPendingDeleteBarangay(item);
                            setDeleteBarangayConfirmText('');
                          }}
                          disabled={saving}
                        >
                          Delete barangay
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}

        {activeTab === 'admins' ? (
          <>
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
                <div>
                  <p className="text-xs uppercase tracking-widest text-purple-500 font-semibold">Admins</p>
                  <h2 className="text-xl font-bold text-gray-900">Assign administrator</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Admin users must already exist in Supabase Auth. Paste the user ID here.
                  </p>
                </div>
                <form className="mt-5 space-y-4" onSubmit={handleAssignAdmin}>
                  <label className="block text-sm font-semibold text-gray-700">
                    Admin email (optional)
                    <input
                      type="email"
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      value={assignForm.email}
                      onChange={event => setAssignForm(prev => ({ ...prev, email: event.target.value }))}
                      placeholder="admin@example.com"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-gray-700">
                    Auth user ID
                    <input
                      type="text"
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      value={assignForm.userId}
                      onChange={event => setAssignForm(prev => ({ ...prev, userId: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="block text-sm font-semibold text-gray-700">
                    Barangay
                    <select
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      value={assignForm.barangayId}
                      onChange={event => setAssignForm(prev => ({ ...prev, barangayId: event.target.value }))}
                      required
                    >
                      <option value="">Select barangay</option>
                      {barangayOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-gray-700">
                    Role
                    <select
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      value={assignForm.role}
                      onChange={event => setAssignForm(prev => ({ ...prev, role: event.target.value }))}
                    >
                      <option value="barangay_admin">Barangay admin</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Assign admin'}
                  </button>
                </form>
              </div>

              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
                <div>
                  <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold">Admins</p>
                  <h2 className="text-xl font-bold text-gray-900">Create admin account</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Creates a Supabase Auth user and assigns them to a barangay.
                  </p>
                </div>
                <form className="mt-5 space-y-4" onSubmit={handleCreateAdmin}>
                  <label className="block text-sm font-semibold text-gray-700">
                    Email
                    <input
                      type="email"
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      value={createAdminForm.email}
                      onChange={event => setCreateAdminForm(prev => ({ ...prev, email: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="block text-sm font-semibold text-gray-700">
                    Temporary password
                    <input
                      type="password"
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      value={createAdminForm.password}
                      onChange={event => setCreateAdminForm(prev => ({ ...prev, password: event.target.value }))}
                      required
                    />
                  </label>
                  {createAdminForm.role !== 'superadmin' && (
                  <label className="block text-sm font-semibold text-gray-700">
                    Barangay
                    <select
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      value={createAdminForm.barangayId}
                      onChange={event => setCreateAdminForm(prev => ({ ...prev, barangayId: event.target.value }))}
                      required
                    >
                      <option value="">Select barangay</option>
                      {barangayOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  )}
                  <label className="block text-sm font-semibold text-gray-700">
                    Role
                    <select
                      className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      value={createAdminForm.role}
                      onChange={event => setCreateAdminForm(prev => ({ ...prev, role: event.target.value }))}
                    >
                      <option value="barangay_admin">Barangay admin</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Create admin'}
                  </button>
                </form>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Admins</p>
                  <h2 className="text-xl font-bold text-gray-900">Admin assignments</h2>
                  <p className="text-sm text-gray-500">Search, audit, and remove barangay admin links.</p>
                </div>
                <input
                  type="search"
                  value={adminSearch}
                  onChange={event => setAdminSearch(event.target.value)}
                  placeholder="Search admin email, role, or barangay"
                  className="w-full max-w-xs rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />
              </div>
              {loading ? (
                <p className="mt-4 text-sm text-gray-500">Loading data...</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {filteredAdminUsers.map(item => (
                    <div key={item.user_id} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">
                        Email: {item.email || 'Unknown'}, {item.user_id}
                      </p>
                      <p className="text-xs text-gray-500">
                        Role: {item.role} · Barangay: {barangayMap[item.barangay_id]?.name || 'Unassigned'}, {item.barangay_id || 'Unassigned'}
                      </p>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          onClick={() => setPendingDeleteAdmin(item)}
                          disabled={Boolean(adminDeletingId)}
                        >
                          Remove admin
                        </button>
                      </div>
                    </div>
                  ))}
                  {!filteredAdminUsers.length ? (
                    <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">No admin assignments yet.</p>
                  ) : null}
                </div>
              )}
            </section>
          </>
        ) : null}

        {activeTab === 'residents' ? (
          <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Residents</p>
                <h2 className="text-xl font-bold text-gray-900">Remote accounts</h2>
                <p className="text-sm text-gray-500">Filter by status, barangay, or sort to review access.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="search"
                  value={residentSearch}
                  onChange={event => setResidentSearch(event.target.value)}
                  placeholder="Search resident account"
                  className="w-full rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />
                <select
                  value={residentStatusFilter}
                  onChange={event => setResidentStatusFilter(event.target.value)}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900"
                  aria-label="Filter resident accounts by status"
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
                <select
                  value={residentBarangayFilter}
                  onChange={event => setResidentBarangayFilter(event.target.value)}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900"
                  aria-label="Filter resident accounts by barangay"
                >
                  <option value="all">All barangays</option>
                  {barangayOptions.map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={residentSortMode}
                  onChange={event => setResidentSortMode(event.target.value)}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900"
                  aria-label="Sort resident accounts"
                >
                  <option value="recent">Newest first</option>
                  <option value="barangay">Sort by barangay</option>
                </select>
              </div>
            </div>
            {loading ? (
              <p className="mt-4 text-sm text-gray-500">Loading data...</p>
            ) : filteredResidentAccountsView.length ? (
              <div className="mt-4 space-y-3">
                {filteredResidentAccountsView.map(item => (
                  <div key={item.user_id} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Email: {item.email}, {item.user_id}</p>
                        <p className="text-xs text-gray-500">
                          Status: {item.status} · Updated: {formatTimestamp(item.updated_at)}
                        </p>
                        <p className="text-xs text-gray-500">Barangay: {barangayMap[item.barangay_id]?.name || 'Unlinked'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.status === 'disabled' ? (
                          <button
                            type="button"
                            className="rounded-full border border-emerald-200 px-4 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                            onClick={() => handleToggleResident(item.user_id, 'active')}
                            disabled={saving}
                          >
                            Enable
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="rounded-full border border-amber-200 px-4 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                            onClick={() => handleToggleResident(item.user_id, 'disabled')}
                            disabled={saving}
                          >
                            Disable
                          </button>
                        )}
                        <button
                          type="button"
                          className="rounded-full border border-rose-200 px-4 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          onClick={() => setPendingDeleteResident(item)}
                          disabled={saving}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">No resident accounts found yet.</p>
            )}
          </section>
        ) : null}

        {/* ── Data Cleanup Tab ── */}
        {activeTab === 'cleanup' ? (
          <section className="rounded-3xl border border-red-100 bg-white p-6 shadow-lg">
            <div>
              <p className="text-xs uppercase tracking-widest text-red-500 font-semibold">Maintenance</p>
              <h2 className="text-xl font-bold text-gray-900">Data Cleanup</h2>
              <p className="mt-2 text-sm text-gray-500">
                Selectively clear test or unwanted data for a specific barangay before deployment. This permanently deletes records and cannot be undone.
              </p>
            </div>

            <div className="mt-5 space-y-5">
              <label className="block text-sm font-semibold text-gray-700">
                Select barangay
                <select
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                  value={cleanupBarangayId}
                  onChange={e => {
                    setCleanupBarangayId(e.target.value);
                    setCleanupCategories({});
                    setCleanupResults(null);
                  }}
                >
                  <option value="">Choose a barangay…</option>
                  {barangayOptions.map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>

              {cleanupBarangayId && (
                <>
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-3">Select data to clear</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <button
                        type="button"
                        className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        onClick={() => {
                          const allSelected = CLEANUP_CATEGORIES.every(c => cleanupCategories[c.key]);
                          const next = {};
                          CLEANUP_CATEGORIES.forEach(c => { next[c.key] = !allSelected; });
                          setCleanupCategories(next);
                        }}
                      >
                        {CLEANUP_CATEGORIES.every(c => cleanupCategories[c.key]) ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {CLEANUP_CATEGORIES.map(cat => (
                        <label
                          key={cat.key}
                          className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${cleanupCategories[cat.key] ? 'border-red-300 bg-red-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                            checked={!!cleanupCategories[cat.key]}
                            onChange={e => setCleanupCategories(prev => ({ ...prev, [cat.key]: e.target.checked }))}
                          />
                          <div>
                            <span className="text-sm font-semibold text-gray-900">{cat.label}</span>
                            <p className="text-xs text-gray-500 mt-0.5">{cat.description}</p>
                            {cleanupResults?.[cat.key] && (
                              <p className={`text-xs font-semibold mt-1 ${cleanupResults[cat.key].success ? 'text-green-600' : 'text-red-600'}`}>
                                {cleanupResults[cat.key].success ? '✓ Cleared' : `✗ ${cleanupResults[cat.key].error}`}
                              </p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-red-500 disabled:opacity-60"
                      disabled={cleanupRunning || !Object.values(cleanupCategories).some(Boolean)}
                      onClick={() => {
                        const selected = CLEANUP_CATEGORIES.filter(c => cleanupCategories[c.key]).map(c => c.label);
                        const brgyName = barangays.find(b => b.id === cleanupBarangayId)?.name || 'this barangay';
                        setPendingCleanup({
                          barangayId: cleanupBarangayId,
                          barangayName: brgyName,
                          categories: cleanupCategories,
                          selectedLabels: selected,
                        });
                      }}
                    >
                      {cleanupRunning ? 'Clearing…' : `Clear ${Object.values(cleanupCategories).filter(Boolean).length} selected`}
                    </button>
                    {cleanupResults && (
                      <span className="text-xs text-gray-500">
                        {Object.values(cleanupResults).filter(r => r.success).length} cleared
                        {Object.values(cleanupResults).some(r => !r.success)
                          ? `, ${Object.values(cleanupResults).filter(r => !r.success).length} failed`
                          : ''}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === 'access' ? (
          <section className="rounded-3xl border border-amber-100 bg-amber-50 p-6 shadow-lg">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-amber-600 font-semibold">Kiosk Access</p>
                <h2 className="text-xl font-bold text-amber-900">Change-barangay password</h2>
                <p className="mt-1 text-sm text-amber-800/80">Lock down who can switch kiosk barangays from the welcome screen.</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-xs font-semibold text-amber-700 shadow">Current: {kioskPassword ? 'Set' : 'Not set'}</div>
            </div>
            <form className="mt-5 space-y-4" onSubmit={handleSaveKioskPassword}>
              <label className="block text-sm font-semibold text-amber-900">
                New password
                <input
                  type="password"
                  className="mt-2 w-full rounded-2xl border border-amber-200 px-4 py-3 text-sm text-amber-900 shadow-sm"
                  value={kioskPasswordInput}
                  onChange={event => setKioskPasswordInput(event.target.value)}
                  placeholder="At least 6 characters"
                />
              </label>
              <div className="flex flex-wrap gap-2 text-xs text-amber-800/80">
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">Applies to kiosk welcome screen</span>
                <span className="rounded-full bg-white px-3 py-1 shadow-sm">Share with on-site staff only</span>
              </div>
              <button
                type="submit"
                className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-amber-400"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save password'}
              </button>
            </form>
            <div className="mt-6 border-t border-amber-200 pt-4">
              <button
                type="button"
                className="w-full rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                onClick={onLogout}
              >
                Sign out
              </button>
            </div>
          </section>
        ) : null}

        {/* ── Thesis Documents Tab ── */}
        {activeTab === 'thesis-docs' ? (
          <section className="rounded-3xl border border-violet-100 bg-violet-50/30 p-6 shadow-lg">
            <ThesisDocumentsTab />
          </section>
        ) : null}

        {/* ── Requests Tab ── */}
        {activeTab === 'requests' ? (
          <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold">Requests</p>
                <h2 className="text-xl font-bold text-gray-900">Document Requests</h2>
                <p className="text-sm text-gray-500">View all requests across barangays and chat with residents as System.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="search"
                  value={saRequestsSearch}
                  onChange={e => setSaRequestsSearch(e.target.value)}
                  placeholder="Search name, document, reference…"
                  className="w-full max-w-xs rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />
                <select
                  className="rounded-full border border-gray-200 px-3 py-2 text-sm text-gray-700"
                  value={saRequestsBarangayFilter}
                  onChange={e => setSaRequestsBarangayFilter(e.target.value)}
                >
                  <option value="all">All barangays</option>
                  {barangays.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <select
                  className="rounded-full border border-gray-200 px-3 py-2 text-sm text-gray-700"
                  value={saRequestsStatusFilter}
                  onChange={e => setSaRequestsStatusFilter(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="current">In Progress</option>
                  <option value="done">Done</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button type="button" className="rounded-full border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50" onClick={loadSaRequests} disabled={saRequestsLoading}>
                  {saRequestsLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
            </div>

            {saRequestsLoading ? (
              <p className="mt-4 text-sm text-gray-400">Loading requests…</p>
            ) : filteredSaRequests.length ? (
              <div className="mt-4 space-y-3 max-h-[70vh] overflow-y-auto">
                {filteredSaRequests.map(request => {
                  const brgyName = barangays.find(b => b.id === request.barangay_id)?.name || 'Unknown';
                  const residentName = `${request.last_name || ''}, ${request.first_name || ''}${request.middle_name ? ' ' + request.middle_name : ''}`.trim();
                  const statusBadge =
                    request.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                    request.status === 'current' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                    request.status === 'done' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                    'bg-gray-100 text-gray-700 border-gray-200';
                  const isExpanded = saExpandedRequestId === request.id;
                  return (
                    <div key={request.id} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900">{request.document || 'Document request'}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {residentName} · {brgyName}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[11px] font-semibold px-3 py-1 rounded-full border ${statusBadge}`}>
                            {request.status}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            {request.reference_number || ''}
                          </span>
                          <button
                            type="button"
                            className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                            onClick={() => setSaExpandedRequestId(isExpanded ? null : request.id)}
                          >
                            {isExpanded ? 'Hide' : 'Details'}
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                            onClick={() => handleSaOpenChat(request)}
                          >
                            Chat
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="mt-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-600">
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Full Name</p>
                              <p className="text-gray-700">{residentName || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Barangay</p>
                              <p className="text-gray-700">{brgyName}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Document</p>
                              <p className="text-gray-700">{request.document || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Purpose</p>
                              <p className="text-gray-700">{request.purpose || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Status</p>
                              <p className="text-gray-700">{request.status || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Reference</p>
                              <p className="text-gray-700">{request.reference_number || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Source</p>
                              <p className="text-gray-700">{request.request_source || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Telephone</p>
                              <p className="text-gray-700">{request.telephone || 'N/A'}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Submitted</p>
                              <p className="text-gray-700">{formatTimestamp(request.created_at)}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
                No requests found. Requests will appear here as residents submit them from kiosks or the portal.
              </p>
            )}
          </section>
        ) : null}

        {/* Chat slide-over (SuperAdmin) */}
        {saChatOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={() => setSaChatOpen(null)}>
            <div
              className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <ChatPanel
                supabase={supabase}
                conversationId={saChatOpen.conversationId}
                requestId={saChatOpen.request.id}
                barangayId={saChatOpen.request.barangay_id}
                senderRole="system"
                senderId={saAuthSession?.user?.id}
                residentUserId={saChatOpen.residentAuthUid}
                onConversationCreated={(convId) =>
                  setSaChatOpen((prev) => (prev ? { ...prev, conversationId: convId } : prev))
                }
                onClose={() => setSaChatOpen(null)}
                residentName={`${saChatOpen.request.first_name || ''} ${saChatOpen.request.last_name || ''}`.trim()}
                documentName={saChatOpen.request.document}
              />
            </div>
          </div>
        )}

        {activeTab === 'documents' ? (
          <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Documents</p>
                <h2 className="text-xl font-bold text-gray-900">Requestable document list</h2>
                <p className="mt-2 text-sm text-gray-500">Update the options shown to residents when they submit requests.</p>
              </div>
              <button
                type="button"
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
                onClick={handleSaveDocumentOptions}
                disabled={documentsSaving}
              >
                {documentsSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[2fr,1fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Platform fees</p>
                      <h3 className="text-sm font-semibold text-slate-800">Set by superadmin</h3>
                      <p className="text-xs text-slate-500">Used across admin pricing, kiosk, and remote requests.</p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                      onClick={handleSaveFees}
                      disabled={feesSaving}
                    >
                      {feesSaving ? 'Saving…' : 'Save fees'}
                    </button>
                  </div>
                  <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleSaveFees}>
                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span>Service fee (platform)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                        value={serviceFeeInput}
                        onChange={event => setServiceFeeInput(event.target.value)}
                        placeholder="0.00"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span>SMS fee</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                        value={smsFeeInput}
                        onChange={event => setSmsFeeInput(event.target.value)}
                        placeholder="0.00"
                      />
                    </label>
                    <div className="sm:col-span-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">Current service fee: ₱ {serviceFee.toFixed(2)}</span>
                      <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">Current SMS fee: ₱ {smsFee.toFixed(2)}</span>
                    </div>
                    {feesError ? (
                      <p className="sm:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{feesError}</p>
                    ) : null}
                    {feesInfo ? (
                      <p className="sm:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{feesInfo}</p>
                    ) : null}
                  </form>
                </div>

                <div>
                  <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleAddDocumentOption}>
                    <input
                      type="text"
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
                      placeholder="Add a new document type"
                      value={documentInput}
                      onChange={event => setDocumentInput(event.target.value)}
                    />
                    <button
                      type="submit"
                      className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-blue-500"
                      disabled={!documentInput.trim()}
                    >
                      Add
                    </button>
                  </form>

                  <div className="mt-4 space-y-3">
                    {documentOptions.length ? documentOptions.map((item, index) => (
                      <div key={`${item}-${index}`} className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:gap-3">
                        <input
                          type="text"
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900"
                          value={item}
                          onChange={event => handleUpdateDocumentOption(index, event.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-gray-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-700">Option {index + 1}</span>
                          <button
                            type="button"
                            className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            onClick={() => handleRemoveDocumentOption(index)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )) : (
                      <p className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-gray-500">No document options yet. Add at least one before saving.</p>
                    )}
                  </div>
                  <p className="mt-4 text-xs text-gray-500">Changes apply to all barangays. Save to push the list to resident portals and kiosks.</p>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Guidance</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Service fee and SMS fee are applied to every request in admin, kiosk, and remote portals.</li>
                  <li>Admins add per-document prices inside the Pricing tab; totals combine admin price + service fee + SMS fee.</li>
                  <li>Document options here power autocomplete in Pricing and requester forms.</li>
                </ul>
              </div>
            </div>

          </section>
        ) : null}

        {/* ── Feedback Tab ── */}
        {activeTab === 'feedback' ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-amber-600 font-semibold">Feedback</p>
                <h2 className="text-xl font-bold text-gray-900">Resident Feedback & Ratings</h2>
                <p className="text-sm text-gray-500">All ratings submitted by residents across barangays.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-full border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50" onClick={loadAllFeedback} disabled={feedbackLoading}>
                  {feedbackLoading ? 'Loading…' : 'Refresh'}
                </button>
                {allFeedback.length ? (
                  <button type="button" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => {
                    const barangayMap = Object.fromEntries(barangays.map(b => [b.id, b.name]));
                    const rows = allFeedback.map(item => ({
                      date: formatTimestamp(item.created_at),
                      barangay: barangayMap[item.barangay_id] || item.barangay_id,
                      source: item._source === 'kiosk' ? 'Kiosk' : 'Release',
                      resident: item._name,
                      document: item._document,
                      rating: item.rating,
                      comment: item.comment || '',
                    }));
                    downloadCSV(rows, ['date', 'barangay', 'source', 'resident', 'document', 'rating', 'comment'], 'all_feedback_export.csv');
                    addToast('Feedback exported.', 'success');
                  }}>Export CSV</button>
                ) : null}
              </div>
            </div>

            {/* Summary stats */}
            {allFeedback.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{feedbackStats.avg.toFixed(1)}</p>
                  <p className="text-xs text-gray-500">Average Rating</p>
                  <span style={{ letterSpacing: '2px' }}>
                    {[1, 2, 3, 4, 5].map(s => (
                      <span key={s} style={{ color: s <= Math.round(feedbackStats.avg) ? '#f59e0b' : '#d1d5db' }}>★</span>
                    ))}
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{feedbackStats.total}</p>
                  <p className="text-xs text-gray-500">Total Reviews</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center col-span-2">
                  <p className="text-xs text-gray-500 mb-2">Rating Distribution</p>
                  <div className="space-y-1">
                    {[5, 4, 3, 2, 1].map(star => {
                      const count = feedbackStats.distribution[star - 1];
                      const pct = feedbackStats.total ? (count / feedbackStats.total) * 100 : 0;
                      return (
                        <div key={star} className="flex items-center gap-2 text-xs">
                          <span className="w-4 text-right font-semibold text-gray-700">{star}</span>
                          <span style={{ color: '#f59e0b' }}>★</span>
                          <div className="relative flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                            <div className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-all" style={{ width: `${Math.max(pct, 1)}%` }} />
                          </div>
                          <span className="w-8 text-right text-gray-500">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Filters */}
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                type="search"
                value={feedbackSearch}
                onChange={e => setFeedbackSearch(e.target.value)}
                placeholder="Search name, document, comment…"
                className="w-full max-w-xs rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400"
              />
              <select value={feedbackRatingFilter} onChange={e => setFeedbackRatingFilter(e.target.value)} className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900">
                <option value="all">All ratings</option>
                {[5, 4, 3, 2, 1].map(r => (<option key={r} value={String(r)}>{r} star{r > 1 ? 's' : ''}</option>))}
              </select>
              <select value={feedbackBarangayFilter} onChange={e => setFeedbackBarangayFilter(e.target.value)} className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900">
                <option value="all">All barangays</option>
                {barangays.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>

            {/* Feedback list */}
            {feedbackLoading ? (
              <p className="mt-4 text-sm text-gray-400">Loading feedback…</p>
            ) : filteredFeedback.length ? (
              <div className="mt-4 max-h-130 overflow-y-auto space-y-2">
                {filteredFeedback.map(item => {
                  const brgyName = barangays.find(b => b.id === item.barangay_id)?.name || 'Unknown';
                  const starLabels = ['', 'Very Poor', 'Poor', 'Average', 'Good', 'Excellent'];
                  return (
                    <div key={`${item._source}-${item.id}`} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span style={{ letterSpacing: '2px' }}>
                              {[1, 2, 3, 4, 5].map(s => (
                                <span key={s} style={{ color: s <= item.rating ? '#f59e0b' : '#d1d5db' }}>★</span>
                              ))}
                            </span>
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                              {starLabels[item.rating]}
                            </span>
                            {item._source === 'kiosk' ? (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">Kiosk</span>
                            ) : null}
                          </div>
                          <p className="text-sm font-semibold text-gray-900">
                            {item._name} — {item._document}
                          </p>
                          <p className="text-xs text-gray-500">{brgyName}</p>
                          {item.comment ? (
                            <p className="text-sm text-gray-600 mt-1">"{item.comment}"</p>
                          ) : null}
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{formatTimestamp(item.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : allFeedback.length ? (
              <p className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
                No feedback matches your filter.
              </p>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
                No feedback received yet. Residents can rate their experience after claiming a document.
              </p>
            )}
          </section>
        ) : null}

        {/* ── Feature 1: Audit Log Tab ── */}
        {activeTab === 'audit' ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-orange-500 font-semibold">Audit</p>
                <h2 className="text-xl font-bold text-gray-900">Action History</h2>
                <p className="text-sm text-gray-500">Every admin action is recorded here for accountability and compliance.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="search"
                  value={auditFilter}
                  onChange={e => setAuditFilter(e.target.value)}
                  placeholder="Filter by action, email, target…"
                  className="w-full max-w-xs rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400"
                />
                <button type="button" className="rounded-full border border-orange-200 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50" onClick={loadAuditLogs} disabled={auditLoading}>
                  {auditLoading ? 'Loading…' : 'Refresh'}
                </button>
                {auditLogs.length ? (
                  <button type="button" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => {
                    downloadCSV(auditLogs, ['id', 'actor_email', 'action', 'target_type', 'target_id', 'target_label', 'created_at'], 'audit_log_export.csv');
                    addToast('Audit log exported.', 'success');
                  }}>Export CSV</button>
                ) : null}
              </div>
            </div>
            {auditLoading ? (
              <p className="mt-4 text-sm text-gray-400">Loading audit logs…</p>
            ) : filteredAuditLogs.length ? (
              <div className="mt-4 max-h-130 overflow-y-auto space-y-2">
                {filteredAuditLogs.map(log => (
                  <div key={log.id} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          <span className="inline-block rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-orange-700 mr-2">{log.action}</span>
                          {log.target_label || log.target_id || ''}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          by {log.actor_email || log.actor_id} · {log.target_type ? `${log.target_type} ` : ''}{formatTimestamp(log.created_at)}
                        </p>
                      </div>
                      {log.metadata && Object.keys(log.metadata).length ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 max-w-xs truncate" title={JSON.stringify(log.metadata)}>
                          {JSON.stringify(log.metadata).slice(0, 60)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
                No audit logs recorded yet. Actions will appear here as you manage tenants, admins, and settings.
              </p>
            )}
          </section>
        ) : null}

        <ConfirmDialog
          open={Boolean(pendingDeleteAdmin)}
          title="Remove admin assignment"
          description={pendingDeleteAdmin ? `Remove ${pendingDeleteAdmin.email || 'this admin'} from their barangay?` : 'Remove this admin assignment?'}
          confirmLabel="Remove admin"
          tone="danger"
          loading={Boolean(adminDeletingId)}
          onConfirm={async () => {
            if (!pendingDeleteAdmin) return;
            await handleDeleteAdmin(pendingDeleteAdmin.user_id);
            setPendingDeleteAdmin(null);
          }}
          onCancel={() => setPendingDeleteAdmin(null)}
        />

        <ConfirmDialog
          open={Boolean(pendingDeleteResident)}
          title="Delete resident account"
          description={`Permanently delete the account for ${pendingDeleteResident?.email || 'this user'}? This cannot be undone.`}
          confirmLabel="Delete"
          tone="danger"
          loading={saving}
          onConfirm={async () => {
            if (!pendingDeleteResident) return;
            await handleDeleteResident(pendingDeleteResident.user_id);
            setPendingDeleteResident(null);
          }}
          onCancel={() => setPendingDeleteResident(null)}
        />

        <ConfirmDialog
          open={Boolean(pendingDeleteBarangay)}
          title="Delete barangay and all data"
          description={pendingDeleteBarangay
            ? `Delete ${pendingDeleteBarangay.name} and all tied records (residents, requests, verifications, releases, announcements, events, officials, zone settings, and admin assignments)? This cannot be undone.`
            : 'Delete this barangay and all tied records? This cannot be undone.'}
          confirmLabel="Delete permanently"
          tone="danger"
          loading={saving}
          confirmDisabled={deleteBarangayConfirmText.trim() !== (pendingDeleteBarangay?.name || '')}
          onConfirm={async () => {
            if (!pendingDeleteBarangay) return;
            await handleDeleteBarangay(pendingDeleteBarangay.id);
            setPendingDeleteBarangay(null);
            setDeleteBarangayConfirmText('');
          }}
          onCancel={() => {
            setPendingDeleteBarangay(null);
            setDeleteBarangayConfirmText('');
          }}
        >
          {pendingDeleteBarangay ? (
            <label className="block text-sm font-semibold text-gray-700">
              Type <span className="font-bold text-gray-900">{pendingDeleteBarangay.name}</span> to confirm
              <input
                type="text"
                className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900"
                value={deleteBarangayConfirmText}
                onChange={event => setDeleteBarangayConfirmText(event.target.value)}
                placeholder={pendingDeleteBarangay.name}
                autoComplete="off"
              />
            </label>
          ) : null}
        </ConfirmDialog>

        <ConfirmDialog
          open={Boolean(pendingCleanup)}
          title="Confirm data cleanup"
          description={pendingCleanup
            ? `Permanently delete the following data for ${pendingCleanup.barangayName}? This cannot be undone.`
            : 'Confirm cleanup?'}
          confirmLabel={cleanupRunning ? 'Clearing…' : 'Clear data permanently'}
          tone="danger"
          loading={cleanupRunning}
          onConfirm={async () => {
            if (!pendingCleanup) return;
            await handleCleanupData(pendingCleanup.barangayId, pendingCleanup.categories);
            setPendingCleanup(null);
          }}
          onCancel={() => setPendingCleanup(null)}
        >
          {pendingCleanup ? (
            <ul className="mt-2 space-y-1">
              {pendingCleanup.selectedLabels.map(label => (
                <li key={label} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                  {label}
                </li>
              ))}
            </ul>
          ) : null}
        </ConfirmDialog>
      </div>
    </div>
  );
}
