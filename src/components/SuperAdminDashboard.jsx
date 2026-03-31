import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseAnonKey, supabaseUrl } from '../supabaseClient';
import ConfirmDialog from './ui/ConfirmDialog';
import { useToast } from '../hooks/useToast';

const SUPERADMIN_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'tenants', label: 'Tenants' },
  { key: 'admins', label: 'Admins' },
  { key: 'residents', label: 'Residents' },
  { key: 'access', label: 'Access & Security' },
  { key: 'documents', label: 'Documents' },
  { key: 'audit', label: 'Audit Log' },
];

/* ── Audit helper ─────────────────────────────────────────────── */
async function logAudit({ action, targetType, targetId, targetLabel, metadata }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from('audit_logs').insert({
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
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
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

  // ── Feature 4: Onboarding Wizard state ──
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardData, setWizardData] = useState({ name: '', code: '', zonesCount: '7', kiosk: true, portal: true, announcements: true, adminEmail: '', adminPassword: '', adminRole: 'barangay_admin' });
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [wizardCreatedBarangay, setWizardCreatedBarangay] = useState(null);

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
      setKioskPassword(kioskSetting?.value || '');
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
  }, []);

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
  }, []);

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
  }, []);

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
  }, []);

  useEffect(() => {
    if (activeTab === 'analytics') { const run = async () => { await loadAnalytics(); }; run(); }
  }, [activeTab, loadAnalytics]);

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
  }, []);

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

    logAudit({ action: 'wizard_create_barangay', targetType: 'barangay', targetId: brgy.id, targetLabel: brgy.name, metadata: { adminCreated, zones: zonesValue } });
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
  }, []);

  async function loadBarangayHealthSnapshot(barangayId, isCancelled = () => false) {
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
  }

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
  }, [selectedHealthBarangay, barangayOptions]);

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
    logAudit({ action: 'create_barangay', targetType: 'barangay', targetId: data.id, targetLabel: data.name });
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
    logAudit({ action: 'assign_admin', targetType: 'admin', targetId: data.user_id, targetLabel: data.email, metadata: { role: data.role, barangay_id: data.barangay_id } });
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
    logAudit({ action: 'remove_admin', targetType: 'admin', targetId: userId });
  }

  async function handleCreateAdmin(event) {
    event.preventDefault();
    if (!createAdminForm.email.trim() || !createAdminForm.password || !createAdminForm.barangayId) {
      setError('Email, password, and barangay are required to create an admin.');
      return;
    }
    setSaving(true);
    setError('');
    // Always refresh before destructive operations to avoid stale/invalid JWTs
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const accessToken = refreshed?.session?.access_token || sessionData?.session?.access_token || '';
    if (sessionError || refreshError || !accessToken) {
      setError('You are not signed in. Please sign in again.');
      setSaving(false);
      return;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/create_admin_user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        email: createAdminForm.email.trim(),
        password: createAdminForm.password,
        barangay_id: createAdminForm.barangayId,
        role: createAdminForm.role,
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
      setError(responseBody?.error ? `${responseBody.error}${detail}` : responseText || 'Failed to create admin user.');
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
      barangay_id: createAdminForm.barangayId,
    }, ...prev]);
    setCreateAdminForm({ email: '', password: '', barangayId: '', role: 'barangay_admin' });
    setSaving(false);
    addToast('Admin account created.', 'success');
    logAudit({ action: 'create_admin', targetType: 'admin', targetId: responseBody.user_id, targetLabel: createAdminForm.email.trim(), metadata: { role: createAdminForm.role } });
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
    logAudit({ action: 'save_zone_settings', targetType: 'barangay', targetId: data.barangay_id, metadata: { zones_count: data.zones_count } });
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
    logAudit({ action: 'save_feature_toggles', targetType: 'barangay', targetId: data.id, targetLabel: data.name, metadata: { kiosk: data.enable_kiosk, portal: data.enable_portal, announcements: data.enable_announcements } });
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

    setKioskPassword(data?.value || '');
    setKioskPasswordInput('');
    setSaving(false);
    addToast('Kiosk password updated.', 'success');
    logAudit({ action: 'update_kiosk_password', targetType: 'setting', targetId: 'kiosk_change_password' });
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
    logAudit({ action: 'update_barangay_seal', targetType: 'barangay', targetId: updated.id, targetLabel: updated.name });
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
    logAudit({ action: 'save_document_options', targetType: 'setting', targetId: 'document_options', metadata: { count: cleaned.length } });
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
    logAudit({ action: 'save_platform_fees', targetType: 'setting', metadata: { service_fee: nextService, sms_fee: nextSms } });
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
    logAudit({ action: nextStatus === 'disabled' ? 'disable_resident' : 'enable_resident', targetType: 'resident', targetId: userId });
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
    logAudit({ action: 'delete_resident', targetType: 'resident', targetId: userId });
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
    logAudit({ action: 'delete_barangay', targetType: 'barangay', targetId: barangayId });
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
    <div className="min-h-screen w-full bg-(--sbk-page-bg) px-4 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-8">
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
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onLogout}
            >
              Sign out
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        ) : null}
        <nav className="flex flex-wrap gap-2">
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
                        logAudit({ action: 'export_csv', targetType: 'requests', metadata: { count: rows.length } });
                      }}>Export Requests CSV</button>
                      <button type="button" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => {
                        const rows = analyticsData.residents.map(r => ({ id: r.id, barangay_id: r.barangay_id, sex: r.sex, birthday: r.birthday, created_at: r.created_at }));
                        downloadCSV(rows, ['id', 'barangay_id', 'sex', 'birthday', 'created_at'], 'residents_export.csv');
                        addToast('Residents exported to CSV.', 'success');
                        logAudit({ action: 'export_csv', targetType: 'residents', metadata: { count: rows.length } });
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
          </section>
        ) : null}

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
      </div>
    </div>
  );
}
