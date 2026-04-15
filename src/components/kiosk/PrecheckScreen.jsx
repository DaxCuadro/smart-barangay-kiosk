import { useEffect, useMemo, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import { BARANGAY_INFO_STORAGE_KEY, getBarangayZonesCount, getSelectedBarangayName, setBarangayInfo } from '../../utils/barangayInfoStorage';
import { printReceipt } from '../../utils/thermalPrinter';
import {
  cacheResidents,
  searchCachedResidents,
  cacheSetting,
  getCachedSetting,
  queuePendingRequest,
} from '../../utils/offlineStorage';
import SurveyModal from '../ui/SurveyModal';
import { PRE_SURVEY_QUESTIONS, POST_SURVEY_QUESTIONS } from '../../data/surveyQuestions';

const INITIAL_FORM = {
  lastName: '',
  firstName: '',
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
  documents: [],
  customDocument: '',
  purpose: '',
  ctcNumber: '',
  ctcDate: '',
};

const CLEARANCE_DOCUMENTS = ['Barangay Clearance', 'Business Clearance'];

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

const INTAKE_REQUESTS_TABLE = 'resident_intake_requests';
const OTHER_DOCUMENT_VALUE = 'Other';
const ZONE_SETTINGS_TABLE = 'barangay_zone_settings';

function formatFullName(record) {
  const middleInitial = record.middle_name ? ` ${record.middle_name[0].toUpperCase()}.` : '';
  return `${record.last_name || ''}, ${record.first_name || ''}${middleInitial}`.trim();
}

function sanitizeQuery(value) {
  return value.replace(/[%_]/g, '').replace(/,/g, ' ').trim();
}

function parseNameQuery(value) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return { lastName: '', firstName: '' };
  if (normalized.includes(',')) {
    const [first, last] = normalized.split(',');
    return { lastName: (last || '').trim(), firstName: first.trim() };
  }
  const parts = normalized.split(' ');
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    return { firstName, lastName };
  }
  return { lastName: '', firstName: normalized };
}

function toNullableText(value) {
  if (value === null || value === undefined) return null;
  const trimmed = typeof value === 'string' ? value.trim() : value;
  return trimmed === '' ? null : trimmed;
}

function clampZoneValue(value, maxZones) {
  if (!value) return '';
  const numericZone = Number(value);
  if (Number.isNaN(numericZone) || numericZone < 1) return '';
  if (numericZone > maxZones) return '';
  return String(numericZone);
}

function computeAge(dateString) {
  if (!dateString) return '';
  const birth = new Date(dateString);
  if (Number.isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : '';
}

function toTitleCase(value) {
  if (!value) return value;
  // Lowercase everything first, then capitalize the first letter of each word.
  // Uses [\s-] as word separators so ñ and accented chars inside a word stay lowercase.
  return value
    .toLowerCase()
    .replace(/(^|[\s-])\S/g, (match) => match.toUpperCase());
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

export default function PrecheckScreen({ onClose, barangayId, isOnline = true }) {
  const supabase = useSupabase();
  const [searchOpen, setSearchOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [intakeForm, setIntakeForm] = useState(INITIAL_FORM);
  const [intakeError, setIntakeError] = useState('');
  const [intakeSaving, setIntakeSaving] = useState(false);
  const [intakeSuccess, setIntakeSuccess] = useState('');
  const [zoneCount, setZoneCount] = useState(() => getBarangayZonesCount());
  const [documentOptions, setDocumentOptions] = useState(DEFAULT_DOCUMENT_OPTIONS);
  const [intakeReviewOpen, setIntakeReviewOpen] = useState(false);
  const [intakeReviewData, setIntakeReviewData] = useState(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [selectedResident, setSelectedResident] = useState(null);
  const [requestForm, setRequestForm] = useState({ documents: [], customDocument: '', purpose: '', ctcNumber: '', ctcDate: '' });
  const [requestError, setRequestError] = useState('');
  const [requestSaving, setRequestSaving] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [pricingInfo, setPricingInfo] = useState({ prices: {}, serviceFee: 0, smsFee: 0 });
  const [secretaryPresent, setSecretaryPresent] = useState(true);
  const [successNotice, setSuccessNotice] = useState({ open: false, title: '', message: '', queueNumber: null, reference: '', printStatus: '' });
  const [feedbackStep, setFeedbackStep] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [kioskSurveyType, setKioskSurveyType] = useState(null); // 'pre' | 'post' | null
  const [kioskSurveysDone, setKioskSurveysDone] = useState({ pre: false, post: false });


  const safeZoneValue = useMemo(
    () => clampZoneValue(intakeForm.zone, zoneCount),
    [intakeForm.zone, zoneCount],
  );
  const age = useMemo(() => computeAge(intakeForm.birthday), [intakeForm.birthday]);
  const serviceFee = pricingInfo.serviceFee || 0;
  const smsFee = pricingInfo.smsFee || 0;
  // Multi-doc price: sum of individual document prices (null items treated as 0 but flagged)
  const selectedDocsWithPrices = requestForm.documents.filter(d => d !== OTHER_DOCUMENT_VALUE).map(d => ({ doc: d, price: pricingInfo.prices?.[d] ?? null }));
  const selectedPriceSum = selectedDocsWithPrices.reduce((s, i) => s + toNumber(i.price, 0), 0);
  const anyRequestPriceUnset = selectedDocsWithPrices.some(i => i.price === null || i.price === undefined);
  const totalPrice = requestForm.documents.length > 0 ? selectedPriceSum + serviceFee + smsFee : null;
  const intakeDocsWithPrices = intakeForm.documents.filter(d => d !== OTHER_DOCUMENT_VALUE).map(d => ({ doc: d, price: pricingInfo.prices?.[d] ?? null }));
  const intakeSelectedPriceSum = intakeDocsWithPrices.reduce((s, i) => s + toNumber(i.price, 0), 0);
  const anyIntakePriceUnset = intakeDocsWithPrices.some(i => i.price === null || i.price === undefined);
  const intakeTotalPrice = intakeForm.documents.length > 0 ? intakeSelectedPriceSum + serviceFee + smsFee : null;
  const formatCurrency = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(value || 0);

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
    async function loadZoneCount() {
      if (!barangayId) return;
      const { data, error } = await supabase
        .from(ZONE_SETTINGS_TABLE)
        .select('zones_count, secretary_present')
        .eq('barangay_id', barangayId)
        .order('id', { ascending: false })
        .limit(1);
      if (!isActive) return;
      if (error) {
        // Fallback to cached zone settings
        try {
          const cached = await getCachedSetting(`zone_settings_${barangayId}`);
          if (cached) {
            const numeric = Number(cached.zones_count);
            if (Number.isFinite(numeric) && numeric > 0) {
              setZoneCount(numeric);
              setBarangayInfo({ zonesCount: numeric });
            }
            setSecretaryPresent(typeof cached.secretary_present === 'boolean' ? cached.secretary_present : true);
          }
        } catch { /* ignore */ }
        return;
      }
      const record = Array.isArray(data) ? data[0] : data;
      const numeric = Number(record?.zones_count);
      if (Number.isFinite(numeric) && numeric > 0) {
        setZoneCount(numeric);
        setBarangayInfo({ zonesCount: numeric });
      }
      setSecretaryPresent(typeof record?.secretary_present === 'boolean' ? record.secretary_present : true);
      // Cache for offline
      cacheSetting(`zone_settings_${barangayId}`, { zones_count: record?.zones_count, secretary_present: record?.secretary_present }).catch(() => {});
    }
    loadZoneCount();
    return () => {
      isActive = false;
    };
  }, [supabase, barangayId]);

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
        const opts = normalizeDocumentOptions(data.value);
        setDocumentOptions(opts);
        cacheSetting('document_options', opts).catch(() => {});
      } else {
        // Fallback to cached options
        try {
          const cached = await getCachedSetting('document_options');
          if (cached) {
            setDocumentOptions(cached);
            return;
          }
        } catch { /* ignore */ }
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
      if (!barangayId) {
        setPricingInfo({ prices: {}, serviceFee: 0, smsFee: 0 });
        return;
      }

      const pricingKey = `${PRICING_KEY_PREFIX}${barangayId}`;
      const keys = [SERVICE_FEE_KEY, SMS_FEE_KEY, pricingKey];
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', keys);

      if (!isActive) return;
      if (error) {
        // Fallback to cached pricing
        try {
          const cached = await getCachedSetting(`pricing_info_${barangayId}`);
          if (cached) {
            setPricingInfo(cached);
            return;
          }
        } catch { /* ignore */ }
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

      const info = {
        prices,
        serviceFee: toNumber(map.get(SERVICE_FEE_KEY), 0),
        smsFee: toNumber(map.get(SMS_FEE_KEY), 0),
      };
      setPricingInfo(info);
      // Cache for offline
      cacheSetting(`pricing_info_${barangayId}`, info).catch(() => {});
    }

    loadPricing();
    return () => {
      isActive = false;
    };
  }, [supabase, barangayId]);

  function resetSearchState() {
    setQuery('');
    setResults([]);
    setError('');
    setLoading(false);
    setHasSearched(false);
  }

  function handleCloseSearch() {
    resetSearchState();
    setSearchOpen(false);
  }

  function resetRequestState() {
    setRequestForm({ documents: [], customDocument: '', purpose: '', ctcNumber: '', ctcDate: '' });
    setRequestError('');
    setRequestSaving(false);
    setPrivacyConsent(false);
  }

  function closeSuccessNotice() {
    setSuccessNotice({ open: false, title: '', message: '', queueNumber: null, reference: '', printStatus: '' });
    setFeedbackStep(false);
    setFeedbackRating(0);
    setFeedbackComment('');
    setFeedbackSaving(false);
    setFeedbackDone(false);
    setKioskSurveyType(null);
    setKioskSurveysDone({ pre: false, post: false });
  }

  async function getNextQueueNumber() {
    if (!barangayId) return null;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from(INTAKE_REQUESTS_TABLE)
      .select('queue_number')
      .eq('barangay_id', barangayId)
      .gte('created_at', todayStart.toISOString())
      .not('queue_number', 'is', null)
      .order('queue_number', { ascending: false })
      .limit(1);
    if (error) return 1;
    const last = data?.[0]?.queue_number || 0;
    return last + 1;
  }

  async function generateReferenceNumber() {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const random = String(Math.floor(1000 + Math.random() * 9000));
      const ref = `REQ-${datePart}-${random}`;
      const { count } = await supabase
        .from(INTAKE_REQUESTS_TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('reference_number', ref);
      if (!count) return ref;
    }
    return `REQ-${datePart}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  }

  function tryPrintReceipt({ residentName, documents, purpose, referenceNumbers, queueNumber, docPrice }) {
    try {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const safeDocPrice = Number(docPrice) || 0;
      const result = printReceipt({
        barangayName: getSelectedBarangayName() || 'Barangay',
        date: dateStr,
        referenceNumbers,
        queueNumber,
        residentName,
        documents,
        purpose,
        total: safeDocPrice + serviceFee + smsFee,
        message: secretaryPresent ? 'Please proceed to the secretary desk.' : '',
      });
      return result;
    } catch {
      return 'error';
    }
  }

  function handleOpenRequest(resident) {
    resetRequestState();
    setSelectedResident(resident);
    setRequestOpen(true);
    setSearchOpen(false);
  }

  function handleCloseRequest() {
    resetRequestState();
    setRequestOpen(false);
    setSelectedResident(null);
  }

  function resetIntakeState() {
    setIntakeForm(INITIAL_FORM);
    setIntakeError('');
    setIntakeSuccess('');
    setIntakeSaving(false);
    setIntakeReviewOpen(false);
    setIntakeReviewData(null);
    setPrivacyConsent(false);
  }

  function handleCloseIntake() {
    resetIntakeState();
    setIntakeOpen(false);
  }

  function buildIntakePayload() {
    return {
      last_name: toNullableText(intakeForm.lastName),
      first_name: toNullableText(intakeForm.firstName),
      middle_name: toNullableText(intakeForm.middleName),
      sex: toNullableText(intakeForm.sex),
      civil_status: toNullableText(intakeForm.civilStatus),
      birthday: intakeForm.birthday || null,
      birthplace: toNullableText(intakeForm.birthplace),
      address: toNullableText(intakeForm.address),
      zone: safeZoneValue || null,
      occupation: toNullableText(intakeForm.occupation),
      education: toNullableText(intakeForm.education) || '',
      religion: toNullableText(intakeForm.religion),
      email: toNullableText(intakeForm.email),
      telephone: toNullableText(intakeForm.telephone),
      document: null, // set per-document in submission loop
      purpose: toNullableText(intakeForm.purpose),
      ctc_number: toNullableText(intakeForm.ctcNumber),
      ctc_date: intakeForm.ctcDate || null,
      status: 'pending',
      request_source: 'kiosk',
      barangay_id: barangayId || null,
    };
  }

  function handleIntakeChange(event) {
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
    setIntakeForm(prev => ({ ...prev, [name]: nextValue }));
  }

  async function handleIntakeSubmit(event) {
    event.preventDefault();
    setIntakeError('');
    setIntakeSuccess('');

    if (!intakeForm.firstName.trim() || !intakeForm.lastName.trim()) {
      setIntakeError('First name and last name are required.');
      return;
    }

    if (!intakeForm.sex || !intakeForm.civilStatus || !intakeForm.birthday) {
      setIntakeError('Sex, civil status, and birthday are required.');
      return;
    }

    if (!safeZoneValue) {
      setIntakeError('Zone is required.');
      return;
    }

    if (!intakeForm.documents.length || !intakeForm.purpose.trim()) {
      setIntakeError('At least one document and a purpose are required.');
      return;
    }

    if (intakeForm.documents.includes(OTHER_DOCUMENT_VALUE) && !intakeForm.customDocument.trim()) {
      setIntakeError('Please specify the document name.');
      return;
    }

    const resolvedDocuments = intakeForm.documents.map(doc =>
      doc === OTHER_DOCUMENT_VALUE && intakeForm.customDocument.trim()
        ? `Other - ${intakeForm.customDocument.trim()}`
        : doc
    );

    const phoneDigits = (intakeForm.telephone || '').replace(/\D/g, '');
    if (phoneDigits && phoneDigits.length !== 11) {
      setIntakeError('Phone number must be exactly 11 digits (e.g. 09171234567).');
      return;
    }

    setIntakeReviewData({
      fullName: `${intakeForm.firstName} ${intakeForm.middleName} ${intakeForm.lastName}`
        .replace(/\s+/g, ' ')
        .trim(),
      lastName: intakeForm.lastName,
      firstName: intakeForm.firstName,
      middleName: intakeForm.middleName,
      sex: intakeForm.sex,
      civilStatus: intakeForm.civilStatus,
      birthday: intakeForm.birthday,
      birthplace: intakeForm.birthplace,
      address: intakeForm.address,
      zone: safeZoneValue ? `Zone ${safeZoneValue}` : '',
      occupation: intakeForm.occupation,
      education: intakeForm.education,
      religion: intakeForm.religion,
      email: intakeForm.email,
      telephone: intakeForm.telephone,
      documents: resolvedDocuments,
      purpose: intakeForm.purpose,
      ctcNumber: intakeForm.ctcNumber,
      ctcDate: intakeForm.ctcDate,
    });
    setIntakeReviewOpen(true);
  }

  async function handleConfirmIntake() {
    setIntakeSaving(true);

    const resolvedDocuments = intakeReviewData?.documents || [];
    const referenceNumbers = [];
    let queueNumber = null;

    if (isOnline) {
      queueNumber = secretaryPresent ? await getNextQueueNumber() : null;

      for (const doc of resolvedDocuments) {
        const referenceNumber = await generateReferenceNumber();
        referenceNumbers.push(referenceNumber);
        const payload = {
          ...buildIntakePayload(),
          document: doc,
          reference_number: referenceNumber,
          queue_number: queueNumber,
        };
        const { data: insertedRow, error: saveError } = await supabase
          .from(INTAKE_REQUESTS_TABLE)
          .insert(payload)
          .select('id')
          .single();

        if (saveError) {
          setIntakeError(saveError.message);
          setIntakeSaving(false);
          setIntakeReviewOpen(false);
          return;
        }

        // Send system chat message for request received
        if (insertedRow?.id) {
          try {
            const { data: newConv } = await supabase
              .from('conversations')
              .insert({
                request_id: insertedRow.id,
                barangay_id: barangayId,
                resident_user_id: null,
              })
              .select('id')
              .single();
            if (newConv?.id) {
              await supabase.from('messages').insert({
                conversation_id: newConv.id,
                sender_role: 'system',
                sender_id: null,
                content: `Your request for ${doc} (Ref: ${referenceNumber}) has been received. Please wait for the barangay admin/secretary to review and process your request.`,
              });
            }
          } catch {
            // Non-critical — don't block the submission
          }
        }
      }
    } else {
      // Offline — generate local reference and queue
      const now = new Date();
      const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      for (const doc of resolvedDocuments) {
        const referenceNumber = `REQ-${datePart}-OFF${String(Math.floor(1000 + Math.random() * 9000))}`;
        referenceNumbers.push(referenceNumber);
        const payload = {
          ...buildIntakePayload(),
          document: doc,
          reference_number: referenceNumber,
          queue_number: null,
        };
        try {
          await queuePendingRequest(payload);
        } catch {
          setIntakeError('Failed to save offline. Please try again.');
          setIntakeSaving(false);
          setIntakeReviewOpen(false);
          return;
        }
      }
    }

    setIntakeSaving(false);
    setIntakeReviewOpen(false);
    setIntakeOpen(false);

    const residentName = [intakeForm.firstName, intakeForm.middleName, intakeForm.lastName].filter(Boolean).join(' ');
    const docPriceTotal = resolvedDocuments.reduce((sum, doc) => sum + toNumber(pricingInfo.prices?.[doc], 0), 0);
    const printStatus = await tryPrintReceipt({
      residentName,
      documents: resolvedDocuments,
      purpose: intakeForm.purpose,
      referenceNumbers,
      queueNumber,
      docPrice: docPriceTotal,
    });

    setSuccessNotice({
      open: true,
      title: isOnline
        ? (secretaryPresent ? 'Request submitted' : 'Request submitted successfully')
        : 'Request saved offline',
      message: isOnline
        ? (secretaryPresent
            ? 'Please proceed to the secretary desk.'
            : 'Please wait for the text message from the secretary.')
        : 'Your request was saved and will be submitted automatically when the internet connection returns.',
      queueNumber,
      references: referenceNumbers,
      documents: resolvedDocuments,
      residentName,
      printStatus,
    });
    setIntakeForm(INITIAL_FORM);
  }

  async function handleFeedbackSubmit() {
    if (!feedbackRating) return;
    setFeedbackSaving(true);
    try {
      await supabase.from('kiosk_feedback').insert({
        barangay_id: barangayId || null,
        resident_name: successNotice.residentName || '',
        document: (successNotice.documents || []).join(', '),
        rating: feedbackRating,
        comment: feedbackComment.trim(),
      });
    } catch { /* non-critical */ }
    setFeedbackSaving(false);
    setFeedbackDone(true);
  }

  async function handleKioskSurveySubmit(responses) {
    if (!responses) { // skipped
      setKioskSurveyType(null);
      return;
    }
    try {
      await supabase.from('survey_responses').insert({
        barangay_id: barangayId || null,
        survey_type: kioskSurveyType,
        source: 'kiosk',
        responses,
      });
    } catch { /* non-critical */ }
    setKioskSurveysDone(prev => ({ ...prev, [kioskSurveyType]: true }));
    setKioskSurveyType(null);
  }

  async function handleSearchSubmit(event) {
    event.preventDefault();
    const rawQuery = query.trim();
    const safeQuery = sanitizeQuery(rawQuery);
    const parsed = parseNameQuery(rawQuery);

    if (!safeQuery) {
      setError('Please enter your name. (eg., Juan Dela Cruz)');
      setResults([]);
      return;
    }

    setLoading(true);
    setError('');
    setHasSearched(true);

    // Try online search first
    if (isOnline) {
      const baseQuery = supabase
        .from('residents')
        .select(
          'id, first_name, last_name, middle_name, sex, civil_status, birthday, birthplace, address, occupation, education, religion, telephone, email',
        )
        .eq('barangay_id', barangayId)
        .limit(10);

      const { data, error: fetchError } = parsed.lastName && parsed.firstName
        ? await baseQuery
            .ilike('last_name', `%${parsed.lastName}%`)
            .ilike('first_name', `%${parsed.firstName}%`)
        : await baseQuery.or(`last_name.ilike.%${safeQuery}%,first_name.ilike.%${safeQuery}%`);

      if (fetchError) {
        // Network error — fall through to offline search
        try {
          const cached = await searchCachedResidents(barangayId, safeQuery);
          setResults(cached);
          if (cached.length === 0) setError('No cached results found. Connect to the internet to search.');
        } catch {
          setError(fetchError.message);
          setResults([]);
        }
      } else {
        setResults(data || []);
      }
    } else {
      // Fully offline — search local cache
      try {
        const cached = await searchCachedResidents(barangayId, safeQuery);
        setResults(cached);
        if (cached.length === 0) setError('No results in offline cache. Try again when online.');
      } catch {
        setError('Offline search failed.');
        setResults([]);
      }
    }

    setLoading(false);
  }

  async function handleRequestSubmit(event) {
    event.preventDefault();
    setRequestError('');

    if (!selectedResident) {
      setRequestError('Please select a resident record first.');
      return;
    }

    if (!requestForm.documents.length || !requestForm.purpose.trim()) {
      setRequestError('At least one document and a purpose are required.');
      return;
    }

    if (requestForm.documents.includes(OTHER_DOCUMENT_VALUE) && !requestForm.customDocument.trim()) {
      setRequestError('Please specify the document name.');
      return;
    }

    const resolvedDocuments = requestForm.documents.map(doc =>
      doc === OTHER_DOCUMENT_VALUE && requestForm.customDocument.trim()
        ? `Other - ${requestForm.customDocument.trim()}`
        : doc
    );

    setRequestSaving(true);
    const referenceNumbers = [];
    let queueNumber = null;

    // Look up resident auth UID once (used for conversation creation)
    let residentAuthUid = null;
    if (isOnline && selectedResident?.id) {
      try {
        const { data: profile } = await supabase
          .from('resident_profiles')
          .select('user_id')
          .eq('resident_id', selectedResident.id)
          .maybeSingle();
        residentAuthUid = profile?.user_id || null;
      } catch { /* ignore */ }
    }

    if (isOnline) {
      queueNumber = secretaryPresent ? await getNextQueueNumber() : null;

      for (const doc of resolvedDocuments) {
        const referenceNumber = await generateReferenceNumber();
        referenceNumbers.push(referenceNumber);
        const payload = {
          resident_id: selectedResident.id,
          first_name: selectedResident.first_name || null,
          last_name: selectedResident.last_name || null,
          middle_name: selectedResident.middle_name || null,
          sex: selectedResident.sex || null,
          civil_status: selectedResident.civil_status || null,
          birthday: selectedResident.birthday || null,
          birthplace: selectedResident.birthplace || null,
          address: selectedResident.address || null,
          zone: null,
          occupation: selectedResident.occupation || null,
          education: selectedResident.education || '',
          religion: selectedResident.religion || null,
          telephone: selectedResident.telephone || null,
          email: selectedResident.email || null,
          document: doc,
          purpose: requestForm.purpose.trim(),
          ctc_number: requestForm.ctcNumber?.trim() || null,
          ctc_date: requestForm.ctcDate || null,
          status: 'pending',
          request_source: 'kiosk',
          barangay_id: barangayId || null,
          reference_number: referenceNumber,
          queue_number: queueNumber,
        };

        const { data: insertedRow, error: saveError } = await supabase
          .from(INTAKE_REQUESTS_TABLE)
          .insert(payload)
          .select('id')
          .single();
        if (saveError) {
          setRequestError(saveError.message);
          setRequestSaving(false);
          return;
        }

        // Send system chat message for request received
        if (insertedRow?.id) {
          try {
            const { data: newConv } = await supabase
              .from('conversations')
              .insert({
                request_id: insertedRow.id,
                barangay_id: barangayId,
                resident_user_id: residentAuthUid,
              })
              .select('id')
              .single();
            if (newConv?.id) {
              await supabase.from('messages').insert({
                conversation_id: newConv.id,
                sender_role: 'system',
                sender_id: null,
                content: `Your request for ${doc} (Ref: ${referenceNumber}) has been received. Please wait for the barangay admin/secretary to review and process your request.`,
              });
            }
          } catch {
            // Non-critical — don't block the submission
          }
        }
      }
    } else {
      // Offline — generate local reference and queue
      const now = new Date();
      const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      for (const doc of resolvedDocuments) {
        const referenceNumber = `REQ-${datePart}-OFF${String(Math.floor(1000 + Math.random() * 9000))}`;
        referenceNumbers.push(referenceNumber);
        const payload = {
          resident_id: selectedResident.id,
          first_name: selectedResident.first_name || null,
          last_name: selectedResident.last_name || null,
          middle_name: selectedResident.middle_name || null,
          sex: selectedResident.sex || null,
          civil_status: selectedResident.civil_status || null,
          birthday: selectedResident.birthday || null,
          birthplace: selectedResident.birthplace || null,
          address: selectedResident.address || null,
          zone: null,
          occupation: selectedResident.occupation || null,
          education: selectedResident.education || '',
          religion: selectedResident.religion || null,
          telephone: selectedResident.telephone || null,
          email: selectedResident.email || null,
          document: doc,
          purpose: requestForm.purpose.trim(),
          ctc_number: requestForm.ctcNumber?.trim() || null,
          ctc_date: requestForm.ctcDate || null,
          status: 'pending',
          request_source: 'kiosk',
          barangay_id: barangayId || null,
          reference_number: referenceNumber,
          queue_number: null,
        };

        try {
          await queuePendingRequest(payload);
        } catch {
          setRequestError('Failed to save offline. Please try again.');
          setRequestSaving(false);
          return;
        }
      }
    }

    setRequestSaving(false);
    setRequestOpen(false);

    const residentName = formatFullName(selectedResident);
    const docPriceTotal = resolvedDocuments.reduce((sum, doc) => sum + toNumber(pricingInfo.prices?.[doc], 0), 0);
    const printStatus = await tryPrintReceipt({
      residentName,
      documents: resolvedDocuments,
      purpose: requestForm.purpose.trim(),
      referenceNumbers,
      queueNumber,
      docPrice: docPriceTotal,
    });

    setSuccessNotice({
      open: true,
      title: isOnline
        ? (secretaryPresent ? 'Request submitted' : 'Request submitted successfully')
        : 'Request saved offline',
      message: isOnline
        ? (secretaryPresent
            ? 'Please proceed to the secretary desk.'
            : 'Please wait for the text message from the secretary.')
        : 'Your request was saved and will be submitted automatically when the internet connection returns.',
      queueNumber,
      references: referenceNumbers,
      documents: resolvedDocuments,
      residentName,
      printStatus,
    });
    setRequestForm({ documents: [], customDocument: '', purpose: '', ctcNumber: '', ctcDate: '' });
  }

  const STAR_LABELS = ['', 'Very Poor', 'Poor', 'Average', 'Good', 'Excellent'];

  const successNoticeModal = successNotice.open ? (
    <div className="kiosk-confirm-modal" role="dialog" aria-modal="true">
      <div className="kiosk-confirm-card" onClick={(event) => event.stopPropagation()}>
        {!feedbackStep ? (
          <>
            <h3 className="kiosk-confirm-title">{successNotice.title || 'Submission received'}</h3>
            {successNotice.queueNumber ? (
              <div className="kiosk-queue-card" aria-live="polite">
                <span>Your queue number</span>
                <strong>#{successNotice.queueNumber}</strong>
              </div>
            ) : null}
            {successNotice.documents?.length > 0 ? (
              <div style={{ margin: '0.75rem 0', textAlign: 'left', fontSize: '0.85rem' }}>
                <strong style={{ display: 'block', marginBottom: '0.4rem' }}>Documents requested:</strong>
                {successNotice.documents.map((doc, idx) => (
                  <div key={idx} style={{ marginBottom: '0.25rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {idx + 1}. {doc}{successNotice.references?.[idx] ? ` — ${successNotice.references[idx]}` : ''}
                  </div>
                ))}
              </div>
            ) : successNotice.reference ? (
              <p className="kiosk-confirm-subtitle" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                Reference: {successNotice.reference}
              </p>
            ) : null}
            <p className="kiosk-confirm-subtitle">{successNotice.message}</p>
            {successNotice.printStatus === 'printed' ? (
              <p className="kiosk-print-notice kiosk-print-notice--success">Receipt sent to printer via RawBT.</p>
            ) : successNotice.printStatus === 'no-rawbt' ? (
              <p className="kiosk-print-notice kiosk-print-notice--warn">Could not send to printer. Make sure RawBT is installed and paired with the printer.</p>
            ) : successNotice.printStatus === 'error' ? (
              <p className="kiosk-print-notice kiosk-print-notice--warn">Receipt could not be printed. Please ask at the desk.</p>
            ) : null}
            <div className="kiosk-confirm-actions">
              <button type="button" className="kiosk-intake-submit" onClick={() => setFeedbackStep(true)}>Continue</button>
            </div>
          </>
        ) : feedbackDone ? (
          <>
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
              <h3 className="kiosk-confirm-title" style={{ marginBottom: '0.5rem' }}>Thank you for your feedback!</h3>
              <p className="kiosk-confirm-subtitle">Your rating helps us improve our services.</p>
            </div>
            <div style={{ margin: '0.75rem 0', padding: '0.75rem', background: '#f0f4ff', borderRadius: '1rem', textAlign: 'center' }}>
              <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.5rem', fontWeight: 500 }}>
                Would you like to answer a short survey? <em style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</em>
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={kioskSurveysDone.pre}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: kioskSurveysDone.pre ? '#94a3b8' : '#6366f1',
                    background: kioskSurveysDone.pre ? '#f1f5f9' : 'white',
                    border: kioskSurveysDone.pre ? '1.5px solid #e2e8f0' : '1.5px solid #c7d2fe',
                    borderRadius: '999px',
                    cursor: kioskSurveysDone.pre ? 'not-allowed' : 'pointer',
                    opacity: kioskSurveysDone.pre ? 0.7 : 1,
                  }}
                  onClick={() => !kioskSurveysDone.pre && setKioskSurveyType('pre')}
                >
                  {kioskSurveysDone.pre ? '✓ Pre-Usage Done' : '📋 Pre-Usage Survey'}
                </button>
                <button
                  type="button"
                  disabled={kioskSurveysDone.post}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: kioskSurveysDone.post ? '#94a3b8' : '#6366f1',
                    background: kioskSurveysDone.post ? '#f1f5f9' : 'white',
                    border: kioskSurveysDone.post ? '1.5px solid #e2e8f0' : '1.5px solid #c7d2fe',
                    borderRadius: '999px',
                    cursor: kioskSurveysDone.post ? 'not-allowed' : 'pointer',
                    opacity: kioskSurveysDone.post ? 0.7 : 1,
                  }}
                  onClick={() => !kioskSurveysDone.post && setKioskSurveyType('post')}
                >
                  {kioskSurveysDone.post ? '✓ Post-Usage Done' : '📝 Post-Usage Survey'}
                </button>
              </div>
            </div>
            <div className="kiosk-confirm-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="kiosk-intake-submit" onClick={() => { closeSuccessNotice(); handleCloseIntake(); }}>Done</button>
            </div>
          </>
        ) : (
          <>
            <h3 className="kiosk-confirm-title" style={{ textAlign: 'center' }}>Rate your experience</h3>
            <p className="kiosk-confirm-subtitle" style={{ textAlign: 'center' }}>
              How was your experience using the kiosk today?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setFeedbackRating(star)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '2.5rem',
                    color: star <= feedbackRating ? '#f59e0b' : '#d1d5db',
                    transition: 'color 0.15s, transform 0.15s',
                    transform: star <= feedbackRating ? 'scale(1.15)' : 'scale(1)',
                    padding: '0.15rem',
                    lineHeight: 1,
                  }}
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                >
                  ★
                </button>
              ))}
            </div>
            {feedbackRating > 0 ? (
              <p style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: '#f59e0b', margin: '0' }}>
                {STAR_LABELS[feedbackRating]}
              </p>
            ) : null}
            <label className="kiosk-intake-field" style={{ marginTop: '0.5rem' }}>
              <span>Comments or suggestions <em style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</em></span>
              <textarea
                value={feedbackComment}
                onChange={e => setFeedbackComment(e.target.value)}
                className="kiosk-intake-textarea"
                placeholder="Tell us what you think..."
                rows={3}
                maxLength={500}
              />
            </label>
            <div className="kiosk-confirm-actions">
              <button
                type="button"
                className="kiosk-intake-cancel"
                onClick={() => { closeSuccessNotice(); handleCloseIntake(); }}
              >
                Skip
              </button>
              <button
                type="button"
                className="kiosk-intake-submit"
                disabled={!feedbackRating || feedbackSaving}
                onClick={handleFeedbackSubmit}
              >
                {feedbackSaving ? 'Submitting...' : 'Submit Rating'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  const moreDocsModal = null;

  if (intakeOpen) {
    return (
      <div className="kiosk-shell">
        <div className="kiosk-frame kiosk-frame--single">
          <button className="kiosk-exit" type="button" onClick={handleCloseIntake} aria-label="Return to options">
            ×
          </button>
          <div className="kiosk-intake-page">
            <div className="kiosk-intake-page-scroll">
              <div className="kiosk-intake-header">
                <p className="kiosk-search-label">New Resident Form</p>
                <h2 className="kiosk-intake-title" style={{ fontSize: '1.6rem' }}>Provide your information</h2>
                <p className="kiosk-intake-subtitle">Fields marked with * are required.</p>
              </div>
              <form className="kiosk-intake-form" onSubmit={handleIntakeSubmit}>
                {intakeError ? <p className="kiosk-intake-note kiosk-intake-note--error">{intakeError}</p> : null}
                {intakeSuccess ? <p className="kiosk-intake-note kiosk-intake-note--success">{intakeSuccess}</p> : null}

                <div className="kiosk-intake-grid kiosk-intake-grid--three">
                  <label className="kiosk-intake-field">
                    <span>Last Name *</span>
                    <input type="text" name="lastName" value={intakeForm.lastName} onChange={handleIntakeChange} required className="kiosk-intake-input" placeholder="Dela Cruz" />
                  </label>
                  <label className="kiosk-intake-field">
                    <span>First Name *</span>
                    <input type="text" name="firstName" value={intakeForm.firstName} onChange={handleIntakeChange} required className="kiosk-intake-input" placeholder="Juan" />
                  </label>
                  <label className="kiosk-intake-field">
                    <span>Middle Name</span>
                    <input type="text" name="middleName" value={intakeForm.middleName} onChange={handleIntakeChange} className="kiosk-intake-input" placeholder="Santos" />
                  </label>
                </div>

                <div className="kiosk-intake-grid kiosk-intake-grid--three">
                  <label className="kiosk-intake-field">
                    <span>Sex *</span>
                    <select name="sex" value={intakeForm.sex} onChange={handleIntakeChange} required className="kiosk-intake-select">
                      <option value="">Select</option>
                      {SEX_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="kiosk-intake-field">
                    <span>Civil Status *</span>
                    <select name="civilStatus" value={intakeForm.civilStatus} onChange={handleIntakeChange} required className="kiosk-intake-select">
                      <option value="">Select</option>
                      {CIVIL_STATUSES.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="kiosk-intake-field">
                    <span>Birthday *</span>
                    <input type="date" name="birthday" value={intakeForm.birthday} onChange={handleIntakeChange} required className="kiosk-intake-input" />
                    {age !== '' ? <em>Age: {age}</em> : null}
                  </label>
                </div>

                <div className="kiosk-intake-grid kiosk-intake-grid--three">
                  <label className="kiosk-intake-field">
                    <span>Birthplace</span>
                    <input type="text" name="birthplace" value={intakeForm.birthplace} onChange={handleIntakeChange} className="kiosk-intake-input" placeholder="City / Province" />
                  </label>
                  <label className="kiosk-intake-field">
                    <span>Residential Address</span>
                    <input type="text" name="address" value={intakeForm.address} onChange={handleIntakeChange} className="kiosk-intake-input" placeholder="Street" />
                  </label>
                  <label className="kiosk-intake-field">
                    <span>Zone / Purok *</span>
                    <select name="zone" value={safeZoneValue} onChange={handleIntakeChange} required className="kiosk-intake-select">
                      <option value="">No zone</option>
                      {Array.from({ length: zoneCount }, (_, index) => index + 1).map(option => (
                        <option key={option} value={String(option)}>Zone {option}</option>
                      ))}
                    </select>
                    <em>Displayed as "Zone X" after the street.</em>
                  </label>
                </div>

                <div className="kiosk-intake-grid kiosk-intake-grid--three">
                  <label className="kiosk-intake-field">
                    <span>Occupation / Profession</span>
                    <input type="text" name="occupation" value={intakeForm.occupation} onChange={handleIntakeChange} className="kiosk-intake-input" placeholder="Teacher" />
                  </label>
                  <label className="kiosk-intake-field">
                    <span>Highest Education Attainment</span>
                    <select name="education" value={intakeForm.education} onChange={handleIntakeChange} className="kiosk-intake-select">
                      <option value="">Select</option>
                      {EDUCATION_LEVELS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="kiosk-intake-field">
                    <span>Religion</span>
                    <input type="text" name="religion" value={intakeForm.religion} onChange={handleIntakeChange} className="kiosk-intake-input" placeholder="Roman Catholic" />
                  </label>
                </div>

                <div className="kiosk-intake-grid kiosk-intake-grid--two">
                  <label className="kiosk-intake-field">
                    <span>Email Address</span>
                    <input type="email" name="email" value={intakeForm.email} onChange={handleIntakeChange} className="kiosk-intake-input" placeholder="juan@example.com" />
                  </label>
                  <label className="kiosk-intake-field">
                    <span>Telephone / Mobile Number</span>
                    <input type="tel" name="telephone" value={intakeForm.telephone} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 11); setIntakeForm(prev => ({ ...prev, telephone: v })); }} className="kiosk-intake-input" placeholder="09171234567" inputMode="numeric" maxLength={11} />
                    {intakeForm.telephone && intakeForm.telephone.replace(/\D/g, '').length !== 11 && (
                      <span style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>Must be 11 digits (e.g. 09171234567)</span>
                    )}
                  </label>
                </div>

                <div className="kiosk-intake-grid kiosk-intake-grid--two">
                  <div className="kiosk-intake-field">
                    <span>Requested Documents * <em style={{ fontWeight: 400, color: '#64748b' }}>(select one or more)</em></span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1rem', marginTop: '0.35rem' }}>
                      {documentOptions.map(option => (
                        <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            checked={intakeForm.documents.includes(option)}
                            onChange={() => {
                              setIntakeForm(prev => {
                                const next = prev.documents.includes(option)
                                  ? prev.documents.filter(d => d !== option)
                                  : [...prev.documents, option];
                                return { ...prev, documents: next };
                              });
                            }}
                            style={{ accentColor: '#2563eb', width: '1rem', height: '1rem', flexShrink: 0 }}
                          />
                          {option}
                        </label>
                      ))}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={intakeForm.documents.includes(OTHER_DOCUMENT_VALUE)}
                          onChange={() => {
                            setIntakeForm(prev => {
                              const has = prev.documents.includes(OTHER_DOCUMENT_VALUE);
                              const next = has
                                ? prev.documents.filter(d => d !== OTHER_DOCUMENT_VALUE)
                                : [...prev.documents, OTHER_DOCUMENT_VALUE];
                              return { ...prev, documents: next, customDocument: has ? '' : prev.customDocument };
                            });
                          }}
                          style={{ accentColor: '#2563eb', width: '1rem', height: '1rem', flexShrink: 0 }}
                        />
                        Other documents...
                      </label>
                    </div>
                    {intakeForm.documents.includes(OTHER_DOCUMENT_VALUE) && (
                      <input
                        type="text"
                        name="customDocument"
                        value={intakeForm.customDocument}
                        onChange={handleIntakeChange}
                        className="kiosk-intake-input"
                        placeholder="Enter document name (e.g. Certificate of Good Moral)"
                        style={{ marginTop: '0.5rem' }}
                        required
                      />
                    )}
                  </div>
                  <label className="kiosk-intake-field">
                    <span>Purpose *</span>
                    <textarea
                      name="purpose"
                      value={intakeForm.purpose}
                      onChange={handleIntakeChange}
                      required
                      className="kiosk-intake-textarea"
                      placeholder="Briefly describe why you need this document."
                      rows={3}
                    />
                  </label>
                </div>

                {intakeForm.documents.some(d => CLEARANCE_DOCUMENTS.includes(d)) && (
                  <div className="kiosk-intake-grid kiosk-intake-grid--two">
                    <label className="kiosk-intake-field">
                      <span>CTC / Cedula Number</span>
                      <input type="text" name="ctcNumber" value={intakeForm.ctcNumber} onChange={handleIntakeChange} className="kiosk-intake-input" placeholder="e.g. 12345678" />
                    </label>
                    <label className="kiosk-intake-field">
                      <span>CTC Date Issued</span>
                      <input type="date" name="ctcDate" value={intakeForm.ctcDate} onChange={handleIntakeChange} className="kiosk-intake-input" />
                    </label>
                  </div>
                )}

                {intakeForm.documents.length > 0 ? (
                  <div className="kiosk-intake-note kiosk-intake-note--info">
                    <strong>Price review</strong>
                    <div className="kiosk-price-lines">
                      {intakeDocsWithPrices.map(({ doc, price }) => (
                        <div key={doc}><span>{doc}: </span><span>{price !== null && price !== undefined ? formatCurrency(price) : 'Not set'}</span></div>
                      ))}
                      <div><span>Service fee: </span><span>{formatCurrency(serviceFee)}</span></div>
                      <div><span>SMS fee: </span><span>{formatCurrency(smsFee)}</span></div>
                      <div><span>Total: </span><span>{intakeTotalPrice !== null ? formatCurrency(intakeTotalPrice) : 'Not set'}{anyIntakePriceUnset ? ' *' : ''}</span></div>
                    </div>
                    {anyIntakePriceUnset ? <p style={{ fontSize: '0.7rem', color: '#b45309', marginTop: '0.25rem' }}>* Some document prices are not set.</p> : null}
                    <p style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: '#b45309', lineHeight: 1.4 }}>
                      <strong>Note:</strong> SMS notifications are currently available only for <strong>Globe</strong> and <strong>TM</strong> subscribers. Smart, TNT, and DITO numbers will not receive SMS.
                    </p>
                  </div>
                ) : null}

                <div style={{ margin: '0.75rem 0', padding: '0.75rem', background: '#f8f9fa', borderRadius: '0.75rem', border: '1px solid #e2e8f0', fontSize: '0.75rem', lineHeight: '1.5', color: '#475569' }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.4rem', color: '#1e293b', fontSize: '0.8rem' }}>Data Privacy Consent</p>
                  <p style={{ marginBottom: '0.5rem' }}>
                    In accordance with the <strong>Data Privacy Act of 2012 (Republic Act No. 10173)</strong>, I hereby give my free, voluntary, and informed consent to the collection, processing, and storage of my personal information provided in this form.
                  </p>
                  <p style={{ marginBottom: '0.5rem' }}>
                    I understand that my data will be used solely for the purpose of verifying my identity as a resident and processing barangay document requests. My information will be handled with strict confidentiality and will not be shared with unauthorized third parties.
                  </p>
                  <p>
                    I am aware that I may withdraw my consent at any time by contacting the barangay office, subject to applicable legal obligations.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.6rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, color: '#1e293b' }}>
                    <input
                      type="checkbox"
                      checked={privacyConsent}
                      onChange={e => setPrivacyConsent(e.target.checked)}
                      style={{ marginTop: '0.2rem', accentColor: '#2563eb', width: '1rem', height: '1rem', flexShrink: 0 }}
                    />
                    <span>I have read and agree to the terms above.</span>
                  </label>
                </div>

                <div className="kiosk-intake-actions">
                  <button type="button" className="kiosk-intake-cancel" onClick={handleCloseIntake}>Cancel</button>
                  <button type="submit" className="kiosk-intake-submit" disabled={intakeSaving || !privacyConsent}>
                    {intakeSaving ? 'Saving...' : 'Submit details'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {intakeReviewOpen ? (
          <div className="kiosk-confirm-modal" role="dialog" aria-modal="true" onClick={() => setIntakeReviewOpen(false)}>
            <div className="kiosk-confirm-card" onClick={(event) => event.stopPropagation()}>
              <h3 className="kiosk-confirm-title">Confirm your details</h3>
              <p className="kiosk-confirm-subtitle">Please review the summary below before submitting.</p>
              <div className="kiosk-confirm-grid">
                <div><span>Full name</span><strong>{intakeReviewData?.fullName || '—'}</strong></div>
                <div><span>Birthday</span><strong>{intakeReviewData?.birthday || '—'}</strong></div>
                <div><span>Sex</span><strong>{intakeReviewData?.sex || '—'}</strong></div>
                <div><span>Civil status</span><strong>{intakeReviewData?.civilStatus || '—'}</strong></div>
                <div><span>Birthplace</span><strong>{intakeReviewData?.birthplace || '—'}</strong></div>
                <div><span>Zone</span><strong>{intakeReviewData?.zone || '—'}</strong></div>
                <div><span>Address</span><strong>{intakeReviewData?.address || '—'}</strong></div>
                <div><span>Occupation</span><strong>{intakeReviewData?.occupation || '—'}</strong></div>
                <div><span>Education</span><strong>{intakeReviewData?.education || '—'}</strong></div>
                <div><span>Religion</span><strong>{intakeReviewData?.religion || '—'}</strong></div>
                <div><span>Email</span><strong>{intakeReviewData?.email || '—'}</strong></div>
                <div><span>Telephone</span><strong>{intakeReviewData?.telephone || '—'}</strong></div>
                <div><span>Documents</span><strong>{intakeReviewData?.documents?.join(', ') || '—'}</strong></div>
                <div><span>Purpose</span><strong>{intakeReviewData?.purpose || '—'}</strong></div>
                {intakeReviewData?.ctcNumber ? <div><span>CTC / Cedula No.</span><strong>{intakeReviewData.ctcNumber}</strong></div> : null}
                {intakeReviewData?.ctcDate ? <div><span>CTC Date Issued</span><strong>{intakeReviewData.ctcDate}</strong></div> : null}
              </div>
              {intakeForm.documents.length > 0 ? (
                <div className="kiosk-intake-note kiosk-intake-note--info" style={{ marginTop: '1rem' }}>
                  <strong>Price review</strong>
                  <div className="kiosk-price-lines">
                    {intakeDocsWithPrices.map(({ doc, price }) => (
                      <div key={doc}><span>{doc}: </span><span>{price !== null && price !== undefined ? formatCurrency(price) : 'Not set'}</span></div>
                    ))}
                    <div><span>Service fee: </span><span>{formatCurrency(serviceFee)}</span></div>
                    <div><span>SMS fee: </span><span>{formatCurrency(smsFee)}</span></div>
                    <div><span>Total: </span><span>{intakeTotalPrice !== null ? formatCurrency(intakeTotalPrice) : 'Not set'}{anyIntakePriceUnset ? ' *' : ''}</span></div>
                  </div>
                  {anyIntakePriceUnset ? <p style={{ fontSize: '0.7rem', color: '#b45309', marginTop: '0.25rem' }}>* Some document prices are not set.</p> : null}
                  <p style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: '#b45309', lineHeight: 1.4 }}>
                    <strong>Note:</strong> SMS notifications are currently available only for <strong>Globe</strong> and <strong>TM</strong> subscribers. Smart, TNT, and DITO numbers will not receive SMS.
                  </p>
                </div>
              ) : null}
              <div className="kiosk-confirm-actions">
                <button type="button" className="kiosk-intake-cancel" onClick={() => setIntakeReviewOpen(false)}>Go back</button>
                <button type="button" className="kiosk-intake-submit" onClick={handleConfirmIntake} disabled={intakeSaving}>
                  {intakeSaving ? 'Submitting...' : 'Confirm and submit'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {successNoticeModal}
        {moreDocsModal}
        {/* Kiosk survey modal (intake flow) */}
        <SurveyModal
          open={kioskSurveyType !== null}
          title={kioskSurveyType === 'pre' ? 'Pre-Usage Survey' : 'Post-Usage Survey'}
          subtitle={kioskSurveyType === 'pre'
            ? 'Please rate these statements about your current experience with barangay document requests.'
            : 'Please share your experience after using the Smart Barangay Kiosk System.'}
          questions={kioskSurveyType === 'pre' ? PRE_SURVEY_QUESTIONS : POST_SURVEY_QUESTIONS}
          onSubmit={handleKioskSurveySubmit}
          variant="kiosk"
          optional
        />
      </div>
    );
  }

  return (
    <div className="kiosk-shell">
      <div className="kiosk-frame kiosk-frame--single">
        <button className="kiosk-exit" type="button" onClick={onClose} aria-label="Return to welcome screen">
          ×
        </button>
        <div className="kiosk-panel kiosk-panel--cta kiosk-panel--precheck">
          <p className="kiosk-subhead">Next Step</p>
          <h1 className="kiosk-title">Select how you want to continue</h1>
          <p className="kiosk-body">
            If you already have a record, look yourself up to keep the queue moving. Otherwise, start a new
            application and our staff will confirm your details later.
          </p>
          <div className="kiosk-options">
            <button className="kiosk-option" type="button" onClick={() => setSearchOpen(true)}>
              <span className="kiosk-option-label">Identity Search</span>
              <span className="kiosk-option-body">Find your profile by searching your name.</span>
            </button>
            <button className="kiosk-option" type="button" onClick={() => setIntakeOpen(true)}>
              <span className="kiosk-option-label">I am not listed</span>
              <span className="kiosk-option-body">Add a new application here to capture your residency info.</span>
            </button>
          </div>

          {searchOpen ? (
            <div
              className="kiosk-search-modal"
              role="dialog"
              aria-modal="true"
            >
              <div className="kiosk-search-card" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="kiosk-search-close"
                  onClick={handleCloseSearch}
                  aria-label="Close identity search"
                >
                  ×
                </button>
                <form className="kiosk-search" onSubmit={handleSearchSubmit}>
                  <label className="kiosk-search-label" htmlFor="kiosk-search-input">
                    Search your record
                  </label>
                  <div className="kiosk-search-row">
                    <input
                      id="kiosk-search-input"
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search name"
                      className="kiosk-search-input"
                    />
                    <button type="submit" className="kiosk-search-button" disabled={loading}>
                      {loading ? 'Searching...' : 'Search'}
                    </button>
                  </div>
                  {error ? <p className="kiosk-search-note kiosk-search-note--error">{error}</p> : null}
                  {hasSearched && !loading && !error && results.length === 0 ? (
                    <p className="kiosk-search-note">No matches yet. Try another spelling.</p>
                  ) : null}
                  {results.length ? (
                    <div className="kiosk-search-results">
                      {results.map((resident) => (
                        <button
                          key={resident.id}
                          type="button"
                          className="kiosk-search-result"
                          onClick={() => handleOpenRequest(resident)}
                        >
                          <div>
                            <p className="kiosk-search-name">{formatFullName(resident)}</p>
                            <p className="kiosk-search-meta">{resident.address || 'Address not available'}</p>
                          </div>
                          <span className="kiosk-search-zone">Select</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </form>
              </div>
            </div>
          ) : null}

          {requestOpen ? (
            <div
              className="kiosk-request-modal"
              role="dialog"
              aria-modal="true"
            >
              <div className="kiosk-request-card" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="kiosk-request-close"
                  onClick={handleCloseRequest}
                  aria-label="Close request form"
                >
                  ×
                </button>
                <div className="kiosk-request-header">
                  <p className="kiosk-search-label">Request a document</p>
                  <h2 className="kiosk-intake-title">Confirm your request</h2>
                  <p className="kiosk-intake-subtitle">
                    Requesting for {formatFullName(selectedResident || {})}
                  </p>
                </div>
                <form className="kiosk-request-form" onSubmit={handleRequestSubmit}>
                  {requestError ? (
                    <p className="kiosk-intake-note kiosk-intake-note--error">{requestError}</p>
                  ) : null}
                  <div className="kiosk-request-summary">
                    <div>
                      <span>Address</span>
                      <strong>{selectedResident?.address || 'Address not available'}</strong>
                    </div>
                    <div>
                      <span>Contact</span>
                      <strong>{selectedResident?.telephone || selectedResident?.email || 'N/A'}</strong>
                    </div>
                  </div>
                  <div className="kiosk-intake-field">
                    <span>Requested Documents * <em style={{ fontWeight: 400, color: '#64748b' }}>(select one or more)</em></span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1rem', marginTop: '0.35rem' }}>
                      {documentOptions.map(option => (
                        <label key={option} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            checked={requestForm.documents.includes(option)}
                            onChange={() => {
                              setRequestForm(prev => {
                                const next = prev.documents.includes(option)
                                  ? prev.documents.filter(d => d !== option)
                                  : [...prev.documents, option];
                                return { ...prev, documents: next };
                              });
                            }}
                            style={{ accentColor: '#2563eb', width: '1rem', height: '1rem', flexShrink: 0 }}
                          />
                          {option}
                        </label>
                      ))}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={requestForm.documents.includes(OTHER_DOCUMENT_VALUE)}
                          onChange={() => {
                            setRequestForm(prev => {
                              const has = prev.documents.includes(OTHER_DOCUMENT_VALUE);
                              const next = has
                                ? prev.documents.filter(d => d !== OTHER_DOCUMENT_VALUE)
                                : [...prev.documents, OTHER_DOCUMENT_VALUE];
                              return { ...prev, documents: next, customDocument: has ? '' : prev.customDocument };
                            });
                          }}
                          style={{ accentColor: '#2563eb', width: '1rem', height: '1rem', flexShrink: 0 }}
                        />
                        Other documents...
                      </label>
                    </div>
                    {requestForm.documents.includes(OTHER_DOCUMENT_VALUE) && (
                      <input
                        type="text"
                        value={requestForm.customDocument}
                        onChange={event => setRequestForm(prev => ({ ...prev, customDocument: event.target.value }))}
                        className="kiosk-intake-input"
                        placeholder="Enter document name (e.g. Certificate of Good Moral)"
                        style={{ marginTop: '0.5rem' }}
                        required
                      />
                    )}
                  </div>
                    {requestForm.documents.length > 0 ? (
                      <div className="kiosk-intake-note kiosk-intake-note--info">
                        <strong>Price review</strong>
                        <div className="kiosk-price-lines">
                          {selectedDocsWithPrices.map(({ doc, price }) => (
                            <div key={doc}><span>{doc}: </span><span>{price !== null && price !== undefined ? formatCurrency(price) : 'Not set'}</span></div>
                          ))}
                          <div><span>Service fee: </span><span>{formatCurrency(serviceFee)}</span></div>
                          <div><span>SMS fee: </span><span>{formatCurrency(smsFee)}</span></div>
                          <div><span>Total: </span><span>{totalPrice !== null ? formatCurrency(totalPrice) : 'Not set'}{anyRequestPriceUnset ? ' *' : ''}</span></div>
                        </div>
                        {anyRequestPriceUnset ? <p style={{ fontSize: '0.7rem', color: '#b45309', marginTop: '0.25rem' }}>* Some document prices are not set.</p> : null}
                        <p style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: '#b45309', lineHeight: 1.4 }}>
                          <strong>Note:</strong> SMS notifications are currently available only for <strong>Globe</strong> and <strong>TM</strong> subscribers. Smart, TNT, and DITO numbers will not receive SMS.
                        </p>
                      </div>
                    ) : null}
                  {requestForm.documents.some(d => CLEARANCE_DOCUMENTS.includes(d)) && (
                    <div className="kiosk-intake-grid kiosk-intake-grid--two">
                      <label className="kiosk-intake-field">
                        <span>CTC / Cedula Number</span>
                        <input type="text" value={requestForm.ctcNumber} onChange={event => setRequestForm(prev => ({ ...prev, ctcNumber: event.target.value }))} className="kiosk-intake-input" placeholder="e.g. 12345678" />
                      </label>
                      <label className="kiosk-intake-field">
                        <span>CTC Date Issued</span>
                        <input type="date" value={requestForm.ctcDate} onChange={event => setRequestForm(prev => ({ ...prev, ctcDate: event.target.value }))} className="kiosk-intake-input" />
                      </label>
                    </div>
                  )}
                  <label className="kiosk-intake-field">
                    <span>Purpose *</span>
                    <textarea
                      name="purpose"
                      value={requestForm.purpose}
                      onChange={event => setRequestForm(prev => ({ ...prev, purpose: event.target.value }))}
                      required
                      className="kiosk-intake-textarea"
                      placeholder="Briefly describe why you need this document."
                      rows={3}
                    />
                  </label>
                  <div style={{ margin: '0.75rem 0', padding: '0.75rem', background: '#f8f9fa', borderRadius: '0.75rem', border: '1px solid #e2e8f0', fontSize: '0.75rem', lineHeight: '1.5', color: '#475569' }}>
                    <p style={{ fontWeight: 600, marginBottom: '0.4rem', color: '#1e293b', fontSize: '0.8rem' }}>Data Privacy Consent</p>
                    <p style={{ marginBottom: '0.5rem' }}>
                      In accordance with the <strong>Data Privacy Act of 2012 (Republic Act No. 10173)</strong>, I hereby give my free, voluntary, and informed consent to the collection, processing, and storage of my personal information provided in this form.
                    </p>
                    <p style={{ marginBottom: '0.5rem' }}>
                      I understand that my data will be used solely for the purpose of verifying my identity as a resident and processing barangay document requests. My information will be handled with strict confidentiality and will not be shared with unauthorized third parties.
                    </p>
                    <p>
                      I am aware that I may withdraw my consent at any time by contacting the barangay office, subject to applicable legal obligations.
                    </p>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.6rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, color: '#1e293b' }}>
                      <input
                        type="checkbox"
                        checked={privacyConsent}
                        onChange={e => setPrivacyConsent(e.target.checked)}
                        style={{ marginTop: '0.2rem', accentColor: '#2563eb', width: '1rem', height: '1rem', flexShrink: 0 }}
                      />
                      <span>I have read and agree to the terms above.</span>
                    </label>
                  </div>
                  <div className="kiosk-intake-actions">
                    <button type="button" className="kiosk-intake-cancel" onClick={handleCloseRequest}>
                      Cancel
                    </button>
                    <button type="submit" className="kiosk-intake-submit" disabled={requestSaving || !privacyConsent}>
                      {requestSaving ? 'Submitting...' : 'Submit request'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

        </div>
      </div>
      {successNoticeModal}
      {moreDocsModal}
      {/* Kiosk survey modal */}
      <SurveyModal
        open={kioskSurveyType !== null}
        title={kioskSurveyType === 'pre' ? 'Pre-Usage Survey' : 'Post-Usage Survey'}
        subtitle={kioskSurveyType === 'pre'
          ? 'Please rate these statements about your current experience with barangay document requests.'
          : 'Please share your experience after using the Smart Barangay Kiosk System.'}
        questions={kioskSurveyType === 'pre' ? PRE_SURVEY_QUESTIONS : POST_SURVEY_QUESTIONS}
        onSubmit={handleKioskSurveySubmit}
        variant="kiosk"
        optional
      />
    </div>
  );
}
