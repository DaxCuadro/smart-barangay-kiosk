import { useEffect, useMemo, useRef, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import { useToast } from '../../hooks/useToast';
import {
  BARANGAY_INFO_STORAGE_KEY,
  getBarangayZonesCount,
  getSelectedBarangayId,
  getSelectedBarangayName,
  setBarangayInfo,
} from '../../utils/barangayInfoStorage';
import ResidentPortalTabs from './ResidentPortalTabs';
import './residentPortalShell.css';

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
const PRICING_KEY_PREFIX = 'pricing_';

const SEX_OPTIONS = ['Male', 'Female'];
const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated'];
const EDUCATION_LEVELS = [
  'No formal education',
  'Primary',
  'Secondary',
  'Vocational',
  'College',
  'Postgraduate',
];

const PROFILE_TABLE = 'resident_profiles';
const VERIFICATION_TABLE = 'resident_verification_requests';
const REQUESTS_TABLE = 'resident_intake_requests';
const RELEASE_LOGS_TABLE = 'release_logs';
const ZONE_SETTINGS_TABLE = 'barangay_zone_settings';
const RESIDENT_ACCOUNTS_TABLE = 'resident_accounts';

function sanitizeEmail(value) {
  return value.trim();
}

function extractZoneFromAddress(value) {
  if (typeof value !== 'string') return '';
  const match = value.match(/(?:zone|purok)\s*(\d+)/i);
  return match ? match[1] : '';
}

function normalizePhoneDigits(value) {
  return (value || '').replace(/\D/g, '');
}

function toTitleCase(value) {
  if (!value) return value;
  // Lowercase everything first, then capitalize the first letter of each word.
  // Uses [\s-] as word separators so ñ and accented chars inside a word stay lowercase.
  return value
    .toLowerCase()
    .replace(/(^|[\s-])\S/g, (match) => match.toUpperCase());
}

function normalizeDocumentOptions(value) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = parsed.split('\n');
    }
  }
  if (!Array.isArray(parsed)) return DEFAULT_DOCUMENT_OPTIONS;
  const seen = new Set();
  const cleaned = parsed
    .map(item => (item || '').trim())
    .filter(item => item && !seen.has(item.toLowerCase()) && (seen.add(item.toLowerCase()), true));
  return cleaned.length ? cleaned : DEFAULT_DOCUMENT_OPTIONS;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const EMPTY_NEW_APPLICANT = {
  firstName: '',
  lastName: '',
  middleName: '',
  sex: '',
  civilStatus: '',
  birthday: '',
  birthplace: '',
  address: '',
  zone: '',
  occupation: '',
  education: '',
  religion: '',
  email: '',
  telephone: '',
};

function ResidentPortalShell() {
  const supabase = useSupabase();
  const { addToast } = useToast();
  const [session, setSession] = useState(null);
  const [sessionUserId, setSessionUserId] = useState(null);
  const sessionUserIdRef = useRef(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMode, setAuthMode] = useState('signin');
  const initialRecovery = typeof window !== 'undefined' && (window.location.hash || '').includes('type=recovery');
    const [authError, setAuthError] = useState(initialRecovery ? '' : '');
    const [authInfo, setAuthInfo] = useState(initialRecovery ? 'Set your new password below.' : '');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(initialRecovery);
  const [recoverySaving, setRecoverySaving] = useState(false);
  const [recoveryCompleted, setRecoveryCompleted] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpMaskedPhone, setOtpMaskedPhone] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [linkForm, setLinkForm] = useState({ firstName: '', lastName: '', birthday: '', zone: '', telephone: '' });
  const [linkResults, setLinkResults] = useState([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [barangays, setBarangays] = useState([]);
  const [selectedBarangayId, setSelectedBarangayId] = useState(() => getSelectedBarangayId());
  const [selectedBarangayName, setSelectedBarangayName] = useState(() => getSelectedBarangayName());
  const [barangayLoading, setBarangayLoading] = useState(true);
  const [barangayError, setBarangayError] = useState('');
  const [selectedResident, setSelectedResident] = useState(null);
  const [newApplicantForm, setNewApplicantForm] = useState(EMPTY_NEW_APPLICANT);
  const [newApplicantError, setNewApplicantError] = useState('');
  const [newApplicantSaving, setNewApplicantSaving] = useState(false);
  const [newApplicantInfo, setNewApplicantInfo] = useState('');
  const [requestForm, setRequestForm] = useState({ document: '', purpose: '', ctcNumber: '', ctcDate: '' });
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestSuccessModal, setRequestSuccessModal] = useState({
    open: false,
    message: '',
    reference: '',
    price: null,
    document: '',
  });
  const [onboardingTab, setOnboardingTab] = useState('new');
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [profileForm, setProfileForm] = useState(EMPTY_NEW_APPLICANT);
  const [profileSaveError, setProfileSaveError] = useState('');
  const [profileSaveInfo, setProfileSaveInfo] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [accountPassword, setAccountPassword] = useState('');
  const [accountShowPassword, setAccountShowPassword] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [accountInfo, setAccountInfo] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [releaseLogs, setReleaseLogs] = useState([]);
  const [releaseLogsLoading, setReleaseLogsLoading] = useState(false);
  const [zoneCount, setZoneCount] = useState(() => getBarangayZonesCount());
  const [documentOptions, setDocumentOptions] = useState(DEFAULT_DOCUMENT_OPTIONS);
  const [pricingInfo, setPricingInfo] = useState({ prices: {}, serviceFee: 0, smsFee: 0 });
  // account status is inferred from Supabase session; no local state needed

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        const nextSession = data?.session ?? null;
        const uid = nextSession?.user?.id ?? null;
        setSession(nextSession);
        setSessionUserId(uid);
        sessionUserIdRef.current = uid;
        setAuthLoading(false);
      }
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;

      // Ignore token refresh failures — keep existing session
      if (_event === 'TOKEN_REFRESHED' && !newSession) return;

      const nextSession = newSession ?? null;
      setSession(nextSession);

      // Only trigger downstream effects (profile reload etc.) when user actually changes
      const newUid = nextSession?.user?.id ?? null;
      if (newUid !== sessionUserIdRef.current) {
        sessionUserIdRef.current = newUid;
        setSessionUserId(newUid);
      }

      if (_event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setRecoveryCompleted(false);
        setAuthError('');
        setAuthInfo('Set your new password below.');
      }
    });
    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase.auth]);

  useEffect(() => {
    let isActive = true;
    async function loadDocumentOptions() {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'document_options')
        .maybeSingle();

      if (!isActive) return;
      if (!error && data?.value) {
        setDocumentOptions(normalizeDocumentOptions(data.value));
      } else {
        setDocumentOptions(DEFAULT_DOCUMENT_OPTIONS);
      }
    }
    loadDocumentOptions();
    return () => {
      isActive = false;
    };
  }, [supabase]);

  useEffect(() => {
    let isActive = true;
    async function loadPricing() {
      if (!selectedBarangayId) {
        setPricingInfo({ prices: {}, serviceFee: 0, smsFee: 0 });
        return;
      }

      const pricingKey = `${PRICING_KEY_PREFIX}${selectedBarangayId}`;
      const keys = [SERVICE_FEE_KEY, SMS_FEE_KEY, pricingKey];
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', keys);

      if (!isActive) return;
      if (error) {
        setPricingInfo({ prices: {}, serviceFee: 0, smsFee: 0 });
        return;
      }

      const map = new Map((data || []).map(row => [row.key, row.value]));
      const parsedPricing = safeParseJson(map.get(pricingKey), []);
      const prices = {};
      (parsedPricing || []).forEach(item => {
        if (item?.document) {
          prices[item.document] = toNumber(item.price, 0);
        }
      });

      setPricingInfo({
        prices,
        serviceFee: toNumber(map.get(SERVICE_FEE_KEY), 0),
        smsFee: toNumber(map.get(SMS_FEE_KEY), 0),
      });
    }

    loadPricing();
    return () => {
      isActive = false;
    };
  }, [selectedBarangayId, supabase]);

  useEffect(() => {
    let isActive = true;
    async function loadBarangays() {
      setBarangayLoading(true);
      setBarangayError('');
      const { data, error } = await supabase
        .from('barangays')
        .select('id, name, code, status, enable_portal, enable_announcements')
        .order('name', { ascending: true });
      if (!isActive) return;
      if (error) {
        setBarangayError(error.message);
        setBarangays([]);
        setBarangayLoading(false);
        return;
      }
      const activeBarangays = (data || []).filter(item => item.status !== 'inactive' && item.enable_portal !== false);
      setBarangays(activeBarangays);
      const storedId = getSelectedBarangayId();
      const hasActive = activeBarangays.some(item => item.id === storedId);
      if ((!storedId || !hasActive) && activeBarangays.length > 0) {
        const fallback = activeBarangays[0];
        setSelectedBarangayId(fallback.id);
        setSelectedBarangayName(fallback.name || '');
        setBarangayInfo({ barangayId: fallback.id, barangayName: fallback.name || '' });
      }
      setBarangayLoading(false);
    }
    loadBarangays();
    return () => {
      isActive = false;
    };
  }, [supabase]);

  useEffect(() => {
    let isActive = true;
    async function loadProfile() {
      if (!session?.user?.id) {
        setProfile(null);
        setSelectedResident(null);
        setProfileForm(EMPTY_NEW_APPLICANT);
        setProfileLoading(false);
        return;
      }
      setProfileLoading(true);
      const { data: accountRow, error: accountError } = await supabase
        .from(RESIDENT_ACCOUNTS_TABLE)
        .select('status')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!isActive) return;
      if (accountError) {
        setProfileError(accountError.message);
        setProfile(null);
        setSelectedResident(null);
        setProfileForm(EMPTY_NEW_APPLICANT);
        setProfileLoading(false);
        return;
      }
      if (!accountRow) {
        await supabase.from(RESIDENT_ACCOUNTS_TABLE).insert({
          user_id: session.user.id,
          email: session.user.email || 'unknown',
          status: 'active',
        });
      } else if (accountRow.status === 'disabled') {
        await supabase.auth.signOut();
        setSession(null);
        setAuthError('Your account is disabled. Please contact the barangay office.');
        setProfileLoading(false);
        return;
      }
      setProfileError('');
      const { data, error } = await supabase
        .from(PROFILE_TABLE)
        .select('id, user_id, resident_id, status, verification_request_id, barangay_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!isActive) return;
      if (error) {
        setProfileError(error.message);
        setProfile(null);
        setSelectedResident(null);
        setProfileForm(EMPTY_NEW_APPLICANT);
        setProfileLoading(false);
        return;
      }
      let nextProfile = data || null;
      setProfile(nextProfile);

      if (nextProfile?.barangay_id && selectedBarangayId && nextProfile.barangay_id !== selectedBarangayId) {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setSelectedResident(null);
        setAuthError('This account belongs to a different barangay.');
        setAuthInfo('');
        setProfileLoading(false);
        return;
      }

      if (!nextProfile && selectedBarangayId) {
        const { data: createdProfile } = await supabase
          .from(PROFILE_TABLE)
          .insert({
            user_id: session.user.id,
            resident_id: null,
            status: 'new',
            verification_request_id: null,
            barangay_id: selectedBarangayId,
          })
          .select('id, user_id, resident_id, status, verification_request_id, barangay_id')
          .single();

        if (createdProfile) {
          nextProfile = createdProfile;
          setProfile(createdProfile);
        }
      }

      if (nextProfile && !nextProfile.barangay_id && selectedBarangayId) {
        const { data: updatedProfile } = await supabase
          .from(PROFILE_TABLE)
          .update({ barangay_id: selectedBarangayId })
          .eq('user_id', session.user.id)
          .select('id, user_id, resident_id, status, verification_request_id, barangay_id')
          .single();
        if (updatedProfile) {
          nextProfile = updatedProfile;
          setProfile(updatedProfile);
        }
      }

      if (nextProfile?.barangay_id && nextProfile.barangay_id !== selectedBarangayId) {
        const matched = barangays.find(item => item.id === nextProfile.barangay_id);
        setSelectedBarangayId(nextProfile.barangay_id);
        setSelectedBarangayName(matched?.name || selectedBarangayName || '');
        setBarangayInfo({
          barangayId: nextProfile.barangay_id,
          barangayName: matched?.name || selectedBarangayName || '',
        });
      }

      if (!nextProfile || (nextProfile.status === 'pending' && !nextProfile.resident_id)) {
        const { data: verificationData } = await supabase
          .from(VERIFICATION_TABLE)
          .select('id, status, resident_id, barangay_id')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (verificationData?.status === 'approved' && verificationData.resident_id) {
          const syncedProfile = {
            user_id: session.user.id,
            resident_id: verificationData.resident_id,
            status: 'verified',
            verification_request_id: null,
            barangay_id: verificationData.barangay_id || selectedBarangayId || null,
          };
          await supabase
            .from(PROFILE_TABLE)
            .upsert(syncedProfile, { onConflict: 'user_id' });
          nextProfile = syncedProfile;
          setProfile(syncedProfile);
        }
      }

      if (nextProfile?.resident_id) {
        let residentData = null;
        const { data: directResident } = await supabase
          .from('residents')
          .select('id, first_name, last_name, middle_name, sex, civil_status, birthday, birthplace, address, occupation, education, religion, telephone, email')
          .eq('id', nextProfile.resident_id)
          .maybeSingle();
        residentData = directResident || null;

        if (isActive && residentData) {
          setSelectedResident(residentData);
          setProfileForm({
            firstName: residentData.first_name || '',
            lastName: residentData.last_name || '',
            middleName: residentData.middle_name || '',
            sex: residentData.sex || '',
            civilStatus: residentData.civil_status || '',
            birthday: residentData.birthday || '',
            birthplace: residentData.birthplace || '',
            address: residentData.address || '',
            zone: extractZoneFromAddress(residentData.address || ''),
            occupation: residentData.occupation || '',
            education: residentData.education || '',
            religion: residentData.religion || '',
            email: residentData.email || '',
            telephone: residentData.telephone || '',
          });
          setActiveTab('home');
        }
      }
      setProfileLoading(false);
    }
    loadProfile();
    return () => {
      isActive = false;
    };
  }, [sessionUserId, barangays, selectedBarangayId, selectedBarangayName, supabase]);

  useEffect(() => {
    let isActive = true;
    async function loadAnnouncements() {
      if (!selectedBarangayId) {
        setAnnouncements([]);
        return;
      }
      const selectedBrgy = barangays.find(item => item.id === selectedBarangayId);
      if (selectedBrgy?.enable_announcements === false) {
        setAnnouncements([]);
        return;
      }
      const { data } = await supabase
        .from('announcements')
        .select('id, title, description, start_date, end_date, image_data')
        .eq('barangay_id', selectedBarangayId)
        .order('start_date', { ascending: true })
        .limit(3);
      if (!isActive) return;
      setAnnouncements(data || []);
    }
    loadAnnouncements();
    return () => {
      isActive = false;
    };
  }, [selectedBarangayId, barangays, supabase]);

  useEffect(() => {
    let isActive = true;
    async function loadZoneCount() {
      if (!selectedBarangayId) return;
      const { data, error } = await supabase
        .from(ZONE_SETTINGS_TABLE)
        .select('zones_count')
        .eq('barangay_id', selectedBarangayId)
        .order('id', { ascending: false })
        .limit(1);
      if (!isActive) return;
      if (error) return;
      const record = Array.isArray(data) ? data[0] : data;
      const numeric = Number(record?.zones_count);
      if (Number.isFinite(numeric) && numeric > 0) {
        setZoneCount(numeric);
        setBarangayInfo({ zonesCount: numeric });
      }
    }
    loadZoneCount();
    return () => {
      isActive = false;
    };
  }, [selectedBarangayId, supabase]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleStorage = event => {
      if (!event || event.key === null || event.key === BARANGAY_INFO_STORAGE_KEY) {
        setZoneCount(getBarangayZonesCount());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    let isActive = true;
    async function loadRequests() {
      if (!selectedResident?.id || !selectedBarangayId) {
        setRequests([]);
        return;
      }
      setRequestsLoading(true);
      const { data, error } = await supabase
        .from(REQUESTS_TABLE)
        .select('id, document, status, created_at')
        .eq('resident_id', selectedResident.id)
        .eq('barangay_id', selectedBarangayId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(10);
      if (!isActive) return;
      if (error) {
        setRequests([]);
        setRequestsLoading(false);
        return;
      }
      setRequests(data || []);
      setRequestsLoading(false);
    }
    loadRequests();
    // Real-time subscription for request status changes
    let channel;
    if (selectedResident?.id && selectedBarangayId) {
      channel = supabase
        .channel(`resident-requests-${selectedResident.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: REQUESTS_TABLE,
          filter: `resident_id=eq.${selectedResident.id}`,
        }, () => {
          loadRequests();
        })
        .subscribe();
    }
    return () => {
      isActive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [selectedResident, selectedBarangayId, supabase]);

  useEffect(() => {
    let isActive = true;
    async function loadReleaseLogs() {
      if (!selectedResident?.id || !selectedBarangayId) {
        setReleaseLogs([]);
        setReleaseLogsLoading(false);
        return;
      }
      setReleaseLogsLoading(true);
      const { data, error } = await supabase
        .from(RELEASE_LOGS_TABLE)
        .select('id, request_id, resident_id, document, contact, zone, source, released_at')
        .eq('resident_id', selectedResident.id)
        .eq('barangay_id', selectedBarangayId)
        .order('released_at', { ascending: false })
        .limit(10);
      if (!isActive) return;
      if (error) {
        setReleaseLogs([]);
        setReleaseLogsLoading(false);
        return;
      }
      setReleaseLogs(data || []);
      setReleaseLogsLoading(false);
    }
    loadReleaseLogs();
    // Real-time subscription for release logs
    let channel;
    if (selectedResident?.id && selectedBarangayId) {
      channel = supabase
        .channel(`resident-releases-${selectedResident.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: RELEASE_LOGS_TABLE,
          filter: `resident_id=eq.${selectedResident.id}`,
        }, () => {
          loadReleaseLogs();
        })
        .subscribe();
    }
    return () => {
      isActive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [selectedResident, selectedBarangayId, supabase]);

  const canSubmitAuth = useMemo(() => {
    const baseValid = sanitizeEmail(email).length > 0 && password.length >= 6 && Boolean(selectedBarangayId);
    if (authMode === 'signup') return baseValid && phone.trim().length >= 10;
    return baseValid;
  }, [email, password, phone, selectedBarangayId, authMode]);

  const verificationStatus = profile?.resident_id ? 'verified' : (profile?.status || 'new');
  const canAccessTabs = Boolean(profile?.resident_id) && verificationStatus !== 'pending';
  const requestCounts = useMemo(() => {
    return requests.reduce(
      (acc, item) => {
        const key = item.status || 'pending';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      { pending: 0, current: 0, done: 0 },
    );
  }, [requests]);

  async function handleSignIn(event) {
    event.preventDefault();
    setAuthError('');
    setAuthInfo('');
    const sanitized = sanitizeEmail(email);
    if (!selectedBarangayId) {
      setAuthError('Select your barangay before signing in.');
      return;
    }
    if (!sanitized || !password) {
      setAuthError('Enter your email and password.');
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: sanitized, password });
    if (error) {
      if (error.message === 'Invalid login credentials') {
        setAuthError('Incorrect email or password. Please check and try again.');
      } else if (error.message?.includes('Email not confirmed')) {
        setAuthError('Your email has not been confirmed. Check your inbox.');
      } else {
        setAuthError(error.message);
      }
      return;
    }
    setPassword('');
    setAuthInfo('Checking account access...');
  }

  async function handleSignUp(event) {
    event.preventDefault();
    setAuthError('');
    setAuthInfo('');
    const sanitized = sanitizeEmail(email);
    if (!selectedBarangayId) {
      setAuthError('Select your barangay before creating an account.');
      return;
    }
    if (!sanitized || !password) {
      setAuthError('Enter your email and password.');
      return;
    }
    const { data, error } = await supabase.functions.invoke('create_resident_user', {
      body: { email: sanitized, password, phone: phone.trim(), barangay_id: selectedBarangayId || '' },
    });
    if (error || data?.error) {
      setAuthError(data?.error || error?.message || 'Failed to create account.');
      return;
    }
    setPassword('');
    setPhone('');
    setAuthInfo('Account created. You can now sign in.');
    setAuthMode('signin');
    addToast('Account created. You can sign in now.', 'success');
  }

  async function handleForgotPassword() {
    const sanitized = sanitizeEmail(email);
    if (!sanitized) {
      setAuthError('Enter your email first so we can send an OTP.');
      return;
    }

    setForgotLoading(true);
    setAuthError('');
    setAuthInfo('');

    const { data, error } = await supabase.functions.invoke('request_otp', {
      body: { email: sanitized, user_type: 'resident' },
    });

    setForgotLoading(false);
    if (error || data?.error) {
      const msg = data?.error || '';
      if (msg.includes('No phone number')) {
        setAuthError('No phone number is linked to this account. Contact your barangay admin to add one.');
      } else {
        setAuthError(msg || error?.message || 'Failed to send OTP. Please try again.');
      }
      return;
    }

    setOtpMaskedPhone(data?.masked_phone || '');
    setOtpMode(true);
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setAuthInfo(`OTP sent to ${data?.masked_phone || 'your phone'}. Enter it below.`);
    addToast('OTP sent to your phone.', 'success');
  }

  async function handleVerifyOtpAndReset(event) {
    event.preventDefault();
    setAuthError('');
    setAuthInfo('');

    if (!otpCode.trim()) {
      setAuthError('Enter the OTP code sent to your phone.');
      return;
    }
    if (newPassword.length < 8) {
      setAuthError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setAuthError('Password confirmation does not match.');
      return;
    }

    setOtpVerifying(true);
    const { data, error } = await supabase.functions.invoke('verify_otp', {
      body: { email: sanitizeEmail(email), otp: otpCode.trim(), new_password: newPassword },
    });
    setOtpVerifying(false);

    if (error || data?.error) {
      setAuthError(data?.error || error?.message || 'Failed to verify OTP.');
      return;
    }

    setOtpMode(false);
    setOtpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setRecoveryCompleted(true);
    setAuthInfo('Password updated successfully. You can now sign in.');
    addToast('Password updated successfully.', 'success');
  }

  async function handleRecoveryPasswordUpdate(event) {
    event.preventDefault();
    setAuthError('');
    setAuthInfo('');

    if (newPassword.length < 8) {
      setAuthError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setAuthError('Password confirmation does not match.');
      return;
    }

    setRecoverySaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setRecoverySaving(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setNewPassword('');
    setConfirmPassword('');
    setRecoveryMode(false);
    setRecoveryCompleted(true);
    window.history.replaceState(null, '', '/');
    setAuthInfo('Password updated successfully.');
    addToast('Password updated successfully.', 'success');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setAuthError('');
    setAuthInfo('');
    setActiveTab('home');
    setLinkResults([]);
    setSelectedResident(null);
    setNewApplicantForm(EMPTY_NEW_APPLICANT);
  }

  function handleBarangaySelect(event) {
    const nextId = event.target.value;
    const nextBarangay = barangays.find(item => item.id === nextId);
    setSelectedBarangayId(nextId);
    setSelectedBarangayName(nextBarangay?.name || '');
    setBarangayInfo({ barangayId: nextId, barangayName: nextBarangay?.name || '' });
  }

  async function handleSearchLink(event) {
    event.preventDefault();
    setLinkError('');
    setLinkResults([]);
    setSelectedResident(null);
    if (!linkForm.firstName.trim() || !linkForm.lastName.trim() || !linkForm.birthday) {
      setLinkError('First name, last name, and birthday are required.');
      return;
    }
    setLinkLoading(true);
    const { data, error } = await supabase.rpc('match_resident', {
      p_first_name: linkForm.firstName.trim(),
      p_last_name: linkForm.lastName.trim(),
      p_birth_date: linkForm.birthday,
      p_zone_value: linkForm.zone.trim() || null,
      p_barangay_id: selectedBarangayId || null,
    });
    if (error) {
      if (error.message?.includes('match_resident')) {
        setLinkError('Resident search is currently unavailable. Please contact your barangay admin or try the "New resident details" tab instead.');
      } else {
        setLinkError(error.message);
      }
      setLinkLoading(false);
      return;
    }
    const records = Array.isArray(data) ? data : [];
    const scopedRecords = selectedBarangayId
      ? records.filter(record => record?.barangay_id === selectedBarangayId)
      : records;

    const inputDigits = normalizePhoneDigits(linkForm.telephone);
    const filtered = inputDigits
      ? scopedRecords.filter(record => {
          const recordDigits = normalizePhoneDigits(record?.telephone);
          if (!recordDigits) return true;
          return recordDigits === inputDigits;
        })
      : scopedRecords;
    if ((inputDigits && filtered.length === 0) || (!inputDigits && scopedRecords.length === 0)) {
      setLinkError('No matching record found for this barangay.');
    }
    setLinkResults(filtered);
    setLinkLoading(false);
  }

  async function handleConfirmExisting() {
    if (!selectedResident || !session?.user?.id) return;
    setLinkError('');
    if (!selectedBarangayId) {
      setLinkError('Select your barangay before linking your record.');
      return;
    }
    const payload = {
      user_id: session.user.id,
      resident_id: selectedResident.id,
      status: 'verified',
      verification_request_id: null,
      barangay_id: selectedBarangayId || null,
    };
    const { error } = await supabase
      .from(PROFILE_TABLE)
      .upsert(payload, { onConflict: 'user_id' });
    if (error) {
      setLinkError(error.message);
      return;
    }
    setProfile(payload);
    setActiveTab('home');
  }

  function handleNewApplicantChange(event) {
    const { name, value } = event.target;
    const titleCaseFields = new Set([
      'firstName',
      'lastName',
      'middleName',
      'birthplace',
      'address',
      'occupation',
      'religion',
    ]);
    const nextValue = titleCaseFields.has(name) ? toTitleCase(value) : value;
    setNewApplicantForm(prev => ({ ...prev, [name]: nextValue }));
  }

  async function handleSubmitNewApplicant(event) {
    event.preventDefault();
    if (!session?.user?.id) return;
    setNewApplicantError('');
    setNewApplicantInfo('');
    if (!selectedBarangayId) {
      setNewApplicantError('Select your barangay before submitting.');
      return;
    }
    if (!newApplicantForm.firstName.trim() || !newApplicantForm.lastName.trim() || !newApplicantForm.birthday) {
      setNewApplicantError('First name, last name, and birthday are required.');
      return;
    }
    if (!newApplicantForm.sex || !newApplicantForm.civilStatus) {
      setNewApplicantError('Sex and civil status are required.');
      return;
    }
    if (!newApplicantForm.zone.trim()) {
      setNewApplicantError('Zone is required.');
      return;
    }

    const phoneDigits = normalizePhoneDigits(newApplicantForm.telephone);
    if (phoneDigits && phoneDigits.length !== 11) {
      setNewApplicantError('Phone number must be exactly 11 digits (e.g. 09171234567).');
      return;
    }
    if (!privacyConsent) {
      setNewApplicantError('You must agree to the Data Privacy Act consent before submitting.');
      return;
    }

    setNewApplicantSaving(true);
    const payload = {
      user_id: session.user.id,
      request_type: 'new',
      status: 'pending',
      barangay_id: selectedBarangayId || null,
      first_name: newApplicantForm.firstName.trim(),
      last_name: newApplicantForm.lastName.trim(),
      middle_name: newApplicantForm.middleName.trim() || null,
      sex: newApplicantForm.sex || null,
      civil_status: newApplicantForm.civilStatus || null,
      birthday: newApplicantForm.birthday || null,
      birthplace: newApplicantForm.birthplace.trim() || null,
      address: newApplicantForm.address.trim() || null,
      zone: newApplicantForm.zone.trim(),
      occupation: newApplicantForm.occupation.trim() || null,
      education: newApplicantForm.education || null,
      religion: newApplicantForm.religion.trim() || null,
      email: newApplicantForm.email.trim() || null,
      telephone: newApplicantForm.telephone.trim() || null,
    };

    const { data, error } = await supabase
      .from(VERIFICATION_TABLE)
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      setNewApplicantError(error.message);
      setNewApplicantSaving(false);
      return;
    }

    await supabase
      .from(PROFILE_TABLE)
      .upsert(
        {
          user_id: session.user.id,
          resident_id: null,
          status: 'pending',
          verification_request_id: data?.id || null,
          barangay_id: selectedBarangayId || null,
        },
        { onConflict: 'user_id' },
      );

    setProfile({
      user_id: session.user.id,
      resident_id: null,
      status: 'pending',
      verification_request_id: data?.id || null,
      barangay_id: selectedBarangayId || null,
    });
    setNewApplicantSaving(false);
    setNewApplicantInfo('Your details were submitted. Please wait for admin confirmation.');
  }

  function handleProfileChange(event) {
    const { name, value } = event.target;
    const titleCaseFields = new Set([
      'firstName',
      'lastName',
      'middleName',
      'birthplace',
      'address',
      'occupation',
      'religion',
    ]);
    const nextValue = titleCaseFields.has(name) ? toTitleCase(value) : value;
    setProfileForm(prev => ({ ...prev, [name]: nextValue }));
  }

  async function handleSubmitProfileUpdate(event) {
    event.preventDefault();
    if (!session?.user?.id || !selectedResident?.id) return;
    setProfileSaveError('');
    setProfileSaveInfo('');
    if (!selectedBarangayId) {
      setProfileSaveError('Select your barangay before submitting.');
      return;
    }

    const phoneDigits = normalizePhoneDigits(profileForm.telephone);
    if (phoneDigits && phoneDigits.length !== 11) {
      setProfileSaveError('Phone number must be exactly 11 digits (e.g. 09171234567).');
      return;
    }

    setProfileSaving(true);
    const payload = {
      user_id: session.user.id,
      resident_id: selectedResident.id,
      request_type: 'update',
      status: 'pending',
      barangay_id: selectedBarangayId || null,
      first_name: profileForm.firstName.trim(),
      last_name: profileForm.lastName.trim(),
      middle_name: profileForm.middleName.trim() || null,
      sex: profileForm.sex || null,
      civil_status: profileForm.civilStatus || null,
      birthday: profileForm.birthday || null,
      birthplace: profileForm.birthplace.trim() || null,
      address: profileForm.address.trim() || null,
      zone: profileForm.zone.trim() || null,
      occupation: profileForm.occupation.trim() || null,
      education: profileForm.education || null,
      religion: profileForm.religion.trim() || null,
      email: profileForm.email.trim() || null,
      telephone: profileForm.telephone.trim() || null,
    };

    const { data, error } = await supabase
      .from(VERIFICATION_TABLE)
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      setProfileSaveError(error.message);
      setProfileSaving(false);
      return;
    }

    await supabase
      .from(PROFILE_TABLE)
      .upsert(
        {
          user_id: session.user.id,
          resident_id: selectedResident.id,
          status: 'pending_update',
          verification_request_id: data?.id || null,
          barangay_id: selectedBarangayId || null,
        },
        { onConflict: 'user_id' },
      );

    setProfile(prev => ({
      ...(prev || {}),
      user_id: session.user.id,
      resident_id: selectedResident.id,
      status: 'pending_update',
      verification_request_id: data?.id || null,
      barangay_id: selectedBarangayId || null,
    }));
    setProfileSaving(false);
    setProfileEditing(false);
    setProfileSaveInfo('Update submitted. Please wait for admin confirmation.');
  }

  async function handleUpdateAccount(event, currentPassword) {
    event.preventDefault();
    if (!session?.user) return;
    setAccountError('');
    setAccountInfo('');
    if (!accountPassword) {
      setAccountInfo('Enter a new password to update your account.');
      return false;
    }
    if (!currentPassword) {
      setAccountError('Enter your current password to continue.');
      return false;
    }
    setAccountSaving(true);
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });
    if (reauthError) {
      setAccountError('Current password is incorrect.');
      setAccountSaving(false);
      return false;
    }
    const { error } = await supabase.auth.updateUser({ password: accountPassword });
    if (error) {
      setAccountError(error.message);
      setAccountSaving(false);
      return false;
    }
    setAccountPassword('');
    setAccountShowPassword(false);
    setAccountSaving(false);
    setAccountInfo('Password updated successfully.');
    return true;
  }

  function handleStartProfileEdit() {
    if (selectedResident) {
      setProfileForm({
        firstName: selectedResident.first_name || '',
        lastName: selectedResident.last_name || '',
        middleName: selectedResident.middle_name || '',
        sex: selectedResident.sex || '',
        civilStatus: selectedResident.civil_status || '',
        birthday: selectedResident.birthday || '',
        birthplace: selectedResident.birthplace || '',
        address: selectedResident.address || '',
        zone: extractZoneFromAddress(selectedResident.address || ''),
        occupation: selectedResident.occupation || '',
        education: selectedResident.education || '',
        religion: selectedResident.religion || '',
        email: selectedResident.email || '',
        telephone: selectedResident.telephone || '',
      });
    }
    setProfileSaveError('');
    setProfileSaveInfo('');
    setProfileEditing(true);
  }

  function handleCancelProfileEdit() {
    setProfileSaveError('');
    setProfileSaveInfo('');
    setProfileEditing(false);
  }

  async function generateReferenceNumber() {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const random = String(Math.floor(1000 + Math.random() * 9000));
      const ref = `REQ-${datePart}-${random}`;
      const { count } = await supabase
        .from(REQUESTS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('reference_number', ref);
      if (!count) return ref;
    }
    return `REQ-${datePart}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  }

  async function handleSubmitRequest(event) {
    event.preventDefault();
    setRequestError('');
    setRequestSuccessModal({ open: false, message: '', reference: '', price: null, document: '' });
    if (!selectedBarangayId) {
      setRequestError('Select your barangay before submitting.');
      return;
    }
    if (!selectedResident?.id) {
      setRequestError('Link your resident record before submitting.');
      return;
    }
    if (!requestForm.document || !requestForm.purpose.trim()) {
      setRequestError('Document type and purpose are required.');
      return;
    }
    setRequestSaving(true);
    const selectedDocument = requestForm.document;
    const basePrice = pricingInfo?.prices?.[selectedDocument];
    const serviceFee = pricingInfo?.serviceFee || 0;
    const smsFee = pricingInfo?.smsFee || 0;
    const totalPrice = (basePrice ?? 0) + serviceFee + smsFee;
    const hasPrice = basePrice !== undefined && basePrice !== null;

    const zoneValue = selectedResident.zone || extractZoneFromAddress(selectedResident.address || '');
    const payload = {
      resident_id: selectedResident.id,
      barangay_id: selectedBarangayId || null,
      first_name: selectedResident.first_name || null,
      last_name: selectedResident.last_name || null,
      middle_name: selectedResident.middle_name || null,
      sex: selectedResident.sex || null,
      civil_status: selectedResident.civil_status || null,
      birthday: selectedResident.birthday || null,
      birthplace: selectedResident.birthplace || null,
      address: selectedResident.address || null,
      zone: zoneValue || null,
      occupation: selectedResident.occupation || null,
      education: selectedResident.education || '',
      religion: selectedResident.religion || null,
      telephone: selectedResident.telephone || null,
      email: selectedResident.email || null,
      document: requestForm.document,
      purpose: requestForm.purpose.trim(),
      ctc_number: requestForm.ctcNumber?.trim() || null,
      ctc_date: requestForm.ctcDate || null,
      status: 'pending',
      request_source: 'remote',
    };

    // Generate unique reference number
    const referenceNumber = await generateReferenceNumber();
    payload.reference_number = referenceNumber;

    const { error } = await supabase
      .from(REQUESTS_TABLE)
      .insert(payload);
    if (error) {
      setRequestError(error.message);
      setRequestSaving(false);
      return;
    }

    setRequestSaving(false);
    setRequestForm({ document: '', purpose: '', ctcNumber: '', ctcDate: '' });
    setRequestSuccessModal({
      open: true,
      message: 'Request submitted',
      reference: referenceNumber,
      price: hasPrice ? totalPrice : null,
      document: selectedDocument,
    });
  }

  function closeRequestSuccessModal() {
    setRequestSuccessModal({ open: false, message: '', reference: '', price: null, document: '' });
  }

  async function handleCancelRequest(requestId) {
    if (!requestId || !session?.user?.id) return;
    const { error } = await supabase
      .from(REQUESTS_TABLE)
      .update({ status: 'cancelled', cancelled_by: 'resident', cancelled_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('status', 'pending');
    if (error) {
      addToast(error.message || 'Failed to cancel request.', 'error');
      return;
    }
    setRequests(prev => prev.filter(r => r.id !== requestId));
    addToast('Request cancelled.', 'success');
  }

  async function handleSubmitFeedback(releaseLogId, rating, comment) {
    if (!releaseLogId || !selectedResident?.id || !selectedBarangayId) return;
    const { error } = await supabase
      .from('resident_feedback')
      .insert({
        release_log_id: releaseLogId,
        resident_id: selectedResident.id,
        barangay_id: selectedBarangayId,
        rating,
        comment: (comment || '').trim(),
      });
    if (error) {
      if (error.code === '23505') {
        addToast('You already submitted feedback for this request.', 'info');
        return;
      }
      addToast(error.message || 'Failed to submit feedback.', 'error');
      return;
    }
    addToast('Thank you for your feedback!', 'success');
  }

  return (
    <div className="resident-shell">
      <div className="resident-frame">
        <header className="resident-header">
          <div>
            <p className="resident-subhead">Secure Resident Access</p>
            <h1 className="resident-title">{`${selectedBarangayName || 'Barangay'} Document Request Portal`}</h1>
            <p className="resident-body">
              {session
                ? 'Request barangay documents, check your request status, and manage your profile — all from your device.'
                : authMode === 'signup'
                  ? 'Create your account to submit barangay document requests online.'
                  : 'Sign in to submit barangay document requests online.'}
            </p>
          </div>
        </header>

        {recoveryMode ? (
          <section className="resident-card">
            <div className="resident-card-head">
              <h2>Set new password</h2>
              <p>Choose a new password for your remote portal account.</p>
            </div>
            <form className="resident-form" onSubmit={handleRecoveryPasswordUpdate}>
              <label className="resident-field">
                <span>New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="resident-field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>
              {authError ? <p className="resident-note resident-note--error">{authError}</p> : null}
              {authInfo ? <p className="resident-note resident-note--info">{authInfo}</p> : null}
              <button className="resident-submit" type="submit" disabled={recoverySaving}>
                {recoverySaving ? 'Updating...' : 'Update password'}
              </button>
              <button
                type="button"
                className="resident-link"
                onClick={() => {
                  setRecoveryMode(false);
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                Back to sign in
              </button>
            </form>
          </section>
        ) : null}

        {recoveryCompleted && !otpMode ? (
          <section className="resident-card">
            <div className="resident-card-head">
              <h2>Password updated</h2>
              <p>Your password has been changed successfully.</p>
            </div>
            <button
              className="resident-submit"
              type="button"
              onClick={() => {
                setRecoveryCompleted(false);
                setAuthInfo('');
                setAuthError('');
              }}
            >
              Continue to sign in
            </button>
          </section>
        ) : null}

        {otpMode && !session && !authLoading ? (
          <section className="resident-card">
            <div className="resident-card-head">
              <h2>Reset password via OTP</h2>
              <p>Enter the 6-digit code sent to {otpMaskedPhone || 'your phone'}.</p>
            </div>
            <form className="resident-form" onSubmit={handleVerifyOtpAndReset}>
              <label className="resident-field">
                <span>OTP Code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={event => setOtpCode(event.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  required
                />
              </label>
              <label className="resident-field">
                <span>New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  required
                />
              </label>
              <label className="resident-field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>
              {authError ? <p className="resident-note resident-note--error">{authError}</p> : null}
              {authInfo ? <p className="resident-note resident-note--info">{authInfo}</p> : null}
              <button className="resident-submit" type="submit" disabled={otpVerifying}>
                {otpVerifying ? 'Verifying...' : 'Reset password'}
              </button>
              <button
                type="button"
                className="resident-link"
                onClick={() => {
                  setOtpMode(false);
                  setOtpCode('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setAuthError('');
                  setAuthInfo('');
                }}
              >
                Back to sign in
              </button>
            </form>
          </section>
        ) : null}

        {!recoveryMode && !recoveryCompleted && !otpMode && !session && !authLoading ? (
          <section className="resident-card">
            <div className="resident-card-head">
              <h2>{authMode === 'signup' ? 'Create account' : 'Resident login'}</h2>
              <p>
                {authMode === 'signup'
                  ? 'Set up your account to continue.'
                  : 'Use your email and password to access remote requests.'}
              </p>
            </div>
            <form
              className="resident-form"
              onSubmit={authMode === 'signin' ? handleSignIn : handleSignUp}
            >
              <label className="resident-field">
                <span>Barangay</span>
                <select
                  value={selectedBarangayId}
                  onChange={handleBarangaySelect}
                  required
                >
                  <option value="">Select your barangay</option>
                  {barangays.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.code ? `${item.name} (${item.code})` : item.name}
                    </option>
                  ))}
                </select>
              </label>
              {barangayLoading ? (
                <p className="resident-note">Loading barangays...</p>
              ) : null}
              {barangayError ? (
                <p className="resident-note resident-note--error">{barangayError}</p>
              ) : null}
              <label className="resident-field">
                <span>Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>
              <label className="resident-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  required
                />
              </label>
              {authMode === 'signup' ? (
                <label className="resident-field">
                  <span>Phone number</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={event => setPhone(event.target.value)}
                    placeholder="09XX-XXX-XXXX"
                    required
                  />
                </label>
              ) : null}
              {authError ? <p className="resident-note resident-note--error">{authError}</p> : null}
              {authInfo ? <p className="resident-note resident-note--info">{authInfo}</p> : null}
              <button className="resident-submit" type="submit" disabled={!canSubmitAuth}>
                {authMode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
              {authMode === 'signin' ? (
                <button
                  type="button"
                  className="resident-link"
                  onClick={handleForgotPassword}
                  disabled={forgotLoading}
                >
                  {forgotLoading ? 'Sending OTP...' : 'Forgot password?'}
                </button>
              ) : null}
              <button
                type="button"
                className="resident-link"
                onClick={() => setAuthMode(prev => (prev === 'signin' ? 'signup' : 'signin'))}
              >
                {authMode === 'signin' ? 'Create an account' : 'Already have an account? Sign in'}
              </button>
            </form>
          </section>
        ) : !recoveryMode && profileLoading ? (
          <section className="resident-card">
            <p className="resident-note">Loading your profile...</p>
          </section>
        ) : !recoveryMode && profileError ? (
          <section className="resident-card">
            <p className="resident-note resident-note--error">{profileError}</p>
          </section>
        ) : !recoveryMode && canAccessTabs ? (
          <ResidentPortalTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            verificationStatus={verificationStatus}
            requestCounts={requestCounts}
            requestsLoading={requestsLoading}
            requests={requests}
            releaseLogs={releaseLogs}
            releaseLogsLoading={releaseLogsLoading}
            announcements={announcements}
            requestForm={requestForm}
            setRequestForm={setRequestForm}
            requestError={requestError}
            requestSaving={requestSaving}
            requestSuccessModalOpen={requestSuccessModal.open}
            requestSuccessModalMessage={requestSuccessModal.message}
            requestSuccessDetails={requestSuccessModal}
            onCloseRequestSuccessModal={closeRequestSuccessModal}
            onSubmitRequest={handleSubmitRequest}
            pricingInfo={pricingInfo}
            profileSaveError={profileSaveError}
            profileSaveInfo={profileSaveInfo}
            profileEditing={profileEditing}
            selectedResident={selectedResident}
            profileForm={profileForm}
            onProfileChange={handleProfileChange}
            onSubmitProfileUpdate={handleSubmitProfileUpdate}
            onStartProfileEdit={handleStartProfileEdit}
            onCancelProfileEdit={handleCancelProfileEdit}
            zoneCount={zoneCount}
            profileSaving={profileSaving}
            documentOptions={documentOptions}
            sexOptions={SEX_OPTIONS}
            civilStatuses={CIVIL_STATUSES}
            educationLevels={EDUCATION_LEVELS}
            extractZoneFromAddress={extractZoneFromAddress}
            accountEmail={session?.user?.email || ''}
            accountPassword={accountPassword}
            setAccountPassword={setAccountPassword}
            accountShowPassword={accountShowPassword}
            setAccountShowPassword={setAccountShowPassword}
            accountSaving={accountSaving}
            accountError={accountError}
            accountInfo={accountInfo}
            onUpdateAccount={handleUpdateAccount}
            onSignOut={handleSignOut}
            onCancelRequest={handleCancelRequest}
            onSubmitFeedback={handleSubmitFeedback}
            supabase={supabase}
            sessionUserId={sessionUserId}
            barangayId={selectedBarangayId}
          />
        ) : !recoveryMode && !recoveryCompleted && !otpMode && !authLoading ? (
          <>
          <section className="resident-card">
            <div className="resident-card-head">
              <h2>Get verified</h2>
              <p>Submit your details for admin verification.</p>
            </div>

            {
              profile?.status === 'pending' && profile?.verification_request_id ? (
                <div className="resident-banner">
                  Your information is pending verification. Please wait for admin confirmation.
                </div>
              ) : (
                <form className="resident-form" onSubmit={handleSubmitNewApplicant}>
                  {newApplicantError ? <p className="resident-note resident-note--error">{newApplicantError}</p> : null}
                  {newApplicantInfo ? <p className="resident-note resident-note--info">{newApplicantInfo}</p> : null}
                  <div className="resident-form-grid">
                    <label className="resident-field">
                      <span>First name</span>
                      <input name="firstName" value={newApplicantForm.firstName} onChange={handleNewApplicantChange} />
                    </label>
                    <label className="resident-field">
                      <span>Last name</span>
                      <input name="lastName" value={newApplicantForm.lastName} onChange={handleNewApplicantChange} />
                    </label>
                    <label className="resident-field">
                      <span>Middle name</span>
                      <input name="middleName" value={newApplicantForm.middleName} onChange={handleNewApplicantChange} />
                    </label>
                    <label className="resident-field">
                      <span>Sex</span>
                      <select name="sex" value={newApplicantForm.sex} onChange={handleNewApplicantChange}>
                        <option value="">Select</option>
                        {SEX_OPTIONS.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="resident-field">
                      <span>Civil status</span>
                      <select name="civilStatus" value={newApplicantForm.civilStatus} onChange={handleNewApplicantChange}>
                        <option value="">Select</option>
                        {CIVIL_STATUSES.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="resident-field">
                      <span>Birthday</span>
                      <input type="date" name="birthday" value={newApplicantForm.birthday} onChange={handleNewApplicantChange} />
                    </label>
                    <label className="resident-field">
                      <span>Birthplace</span>
                      <input name="birthplace" value={newApplicantForm.birthplace} onChange={handleNewApplicantChange} />
                    </label>
                    <label className="resident-field">
                      <span>Address</span>
                      <input name="address" value={newApplicantForm.address} onChange={handleNewApplicantChange} />
                    </label>
                    <label className="resident-field">
                      <span>Zone</span>
                      <select name="zone" value={newApplicantForm.zone} onChange={handleNewApplicantChange}>
                        <option value="">Select</option>
                        {Array.from({ length: zoneCount }, (_, index) => index + 1).map(option => (
                          <option key={option} value={String(option)}>
                            Zone {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="resident-field">
                      <span>Occupation</span>
                      <input name="occupation" value={newApplicantForm.occupation} onChange={handleNewApplicantChange} />
                    </label>
                    <label className="resident-field">
                      <span>Education</span>
                      <select name="education" value={newApplicantForm.education} onChange={handleNewApplicantChange}>
                        <option value="">Select</option>
                        {EDUCATION_LEVELS.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="resident-field">
                      <span>Religion</span>
                      <input name="religion" value={newApplicantForm.religion} onChange={handleNewApplicantChange} />
                    </label>
                    <label className="resident-field">
                      <span>Email</span>
                      <input type="email" name="email" value={newApplicantForm.email} onChange={handleNewApplicantChange} />
                    </label>
                    <label className="resident-field">
                      <span>Telephone</span>
                      <input name="telephone" type="tel" inputMode="numeric" maxLength={11} value={newApplicantForm.telephone} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 11); setNewApplicantForm(prev => ({ ...prev, telephone: v })); }} placeholder="09171234567" />
                      {newApplicantForm.telephone && normalizePhoneDigits(newApplicantForm.telephone).length !== 11 && (
                        <span style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>Must be 11 digits (e.g. 09171234567)</span>
                      )}
                    </label>
                  </div>
                  <div style={{ margin: '1rem 0', padding: '1rem', background: '#f8f9fa', borderRadius: '0.75rem', border: '1px solid #e2e8f0', fontSize: '0.8rem', lineHeight: '1.5', color: '#475569' }}>
                    <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#1e293b', fontSize: '0.85rem' }}>Data Privacy Consent</p>
                    <p style={{ marginBottom: '0.75rem' }}>
                      In accordance with the <strong>Data Privacy Act of 2012 (Republic Act No. 10173)</strong>, I hereby give my free, voluntary, and informed consent to the collection, processing, and storage of my personal information provided in this form.
                    </p>
                    <p style={{ marginBottom: '0.75rem' }}>
                      I understand that my data will be used solely for the purpose of verifying my identity as a resident and processing barangay document requests. My information will be handled with strict confidentiality and will not be shared with unauthorized third parties.
                    </p>
                    <p>
                      I am aware that I may withdraw my consent at any time by contacting the barangay office, subject to applicable legal obligations.
                    </p>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.75rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, color: '#1e293b' }}>
                      <input
                        type="checkbox"
                        checked={privacyConsent}
                        onChange={e => setPrivacyConsent(e.target.checked)}
                        style={{ marginTop: '0.2rem', accentColor: '#2563eb', width: '1rem', height: '1rem', flexShrink: 0 }}
                      />
                      <span>I have read and agree to the terms above.</span>
                    </label>
                  </div>
                  <button className="resident-submit" type="submit" disabled={newApplicantSaving || !privacyConsent}>
                    {newApplicantSaving ? 'Submitting...' : 'Submit for verification'}
                  </button>
                </form>
              )
            }
          </section>
          <button
            type="button"
            className="resident-submit"
            style={{ marginTop: '1rem', background: '#e74c3c', width: '100%', maxWidth: '200px', alignSelf: 'center' }}
            onClick={handleSignOut}
          >
            Log out
          </button>
          </>
        ) : null}
      </div>
      {authLoading ? (
        <section className="resident-card">
          <p className="resident-note" style={{ textAlign: 'center' }}>Checking session...</p>
        </section>
      ) : null}
    </div>
  );
}

export default ResidentPortalShell;
