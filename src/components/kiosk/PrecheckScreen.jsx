import { useEffect, useMemo, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import { BARANGAY_INFO_STORAGE_KEY, getBarangayZonesCount, getSelectedBarangayName, setBarangayInfo } from '../../utils/barangayInfoStorage';
import { isPrinterConnected, printReceipt } from '../../utils/thermalPrinter';

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
  document: '',
  purpose: '',
};

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
const MORE_DOCS_VALUE = '__more_documents__';
const MORE_DOCS_NOTICE = 'Other document types are not yet available in this version of the system.';
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
  return value.replace(/\b([A-Za-z])([A-Za-z]*)/g, (_match, first, rest) => {
    return `${first.toUpperCase()}${rest.toLowerCase()}`;
  });
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

export default function PrecheckScreen({ onClose, barangayId }) {
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
  const [requestForm, setRequestForm] = useState({ document: '', purpose: '' });
  const [requestError, setRequestError] = useState('');
  const [requestSaving, setRequestSaving] = useState(false);
  const [pricingInfo, setPricingInfo] = useState({ prices: {}, serviceFee: 0, smsFee: 0 });
  const [secretaryPresent, setSecretaryPresent] = useState(true);
  const [successNotice, setSuccessNotice] = useState({ open: false, title: '', message: '', queueNumber: null, reference: '', printStatus: '' });
  const [moreDocsNotice, setMoreDocsNotice] = useState(false);

  const safeZoneValue = useMemo(
    () => clampZoneValue(intakeForm.zone, zoneCount),
    [intakeForm.zone, zoneCount],
  );
  const age = useMemo(() => computeAge(intakeForm.birthday), [intakeForm.birthday]);
  const selectedPrice = pricingInfo.prices?.[requestForm.document] ?? null;
  const serviceFee = pricingInfo.serviceFee || 0;
  const smsFee = pricingInfo.smsFee || 0;
  const totalPrice = selectedPrice !== null ? selectedPrice + serviceFee + smsFee : null;
  const intakeSelectedPrice = pricingInfo.prices?.[intakeForm.document] ?? null;
  const intakeTotalPrice = intakeSelectedPrice !== null ? intakeSelectedPrice + serviceFee + smsFee : null;
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
      if (error) return;
      const record = Array.isArray(data) ? data[0] : data;
      const numeric = Number(record?.zones_count);
      if (Number.isFinite(numeric) && numeric > 0) {
        setZoneCount(numeric);
        setBarangayInfo({ zonesCount: numeric });
      }
      setSecretaryPresent(typeof record?.secretary_present === 'boolean' ? record.secretary_present : true);
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
    setRequestForm({ document: '', purpose: '' });
    setRequestError('');
    setRequestSaving(false);
  }

  function closeSuccessNotice() {
    setSuccessNotice({ open: false, title: '', message: '', queueNumber: null, reference: '', printStatus: '' });
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

  async function tryPrintReceipt({ residentName, document, purpose, referenceNumber, queueNumber, docPrice }) {
    if (!isPrinterConnected()) return 'no-printer';
    try {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      await printReceipt({
        barangayName: getSelectedBarangayName() || 'Barangay',
        date: dateStr,
        reference: referenceNumber,
        queueNumber,
        residentName,
        document,
        purpose,
        documentFee: docPrice,
        serviceFee,
        smsFee,
        total: docPrice !== null && docPrice !== undefined ? docPrice + serviceFee + smsFee : null,
        message: secretaryPresent ? 'Please proceed to the secretary desk.' : '',
      });
      return 'printed';
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
      document: toNullableText(intakeForm.document),
      purpose: toNullableText(intakeForm.purpose),
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

    if (!intakeForm.document || !intakeForm.purpose.trim()) {
      setIntakeError('Document type and purpose are required.');
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
      document: intakeForm.document,
      purpose: intakeForm.purpose,
    });
    setIntakeReviewOpen(true);
  }

  async function handleConfirmIntake() {
    setIntakeSaving(true);
    const referenceNumber = await generateReferenceNumber();
    const queueNumber = secretaryPresent ? await getNextQueueNumber() : null;
    const payload = {
      ...buildIntakePayload(),
      reference_number: referenceNumber,
      queue_number: queueNumber,
    };
    const { error: saveError } = await supabase.from(INTAKE_REQUESTS_TABLE).insert(payload);

    if (saveError) {
      setIntakeError(saveError.message);
      setIntakeSaving(false);
      setIntakeReviewOpen(false);
      return;
    }

    setIntakeSaving(false);
    setIntakeReviewOpen(false);
    setIntakeOpen(false);

    const residentName = [intakeForm.firstName, intakeForm.middleName, intakeForm.lastName].filter(Boolean).join(' ');
    const docPrice = pricingInfo.prices?.[intakeForm.document] ?? null;
    const printStatus = await tryPrintReceipt({
      residentName,
      document: intakeForm.document,
      purpose: intakeForm.purpose,
      referenceNumber,
      queueNumber,
      docPrice,
    });

    setSuccessNotice({
      open: true,
      title: secretaryPresent ? 'Request submitted' : 'Request submitted successfully',
      message: secretaryPresent
        ? 'Please proceed to the secretary desk.'
        : 'Please wait for the text message from the secretary.',
      queueNumber,
      reference: referenceNumber,
      printStatus,
    });
    setIntakeForm(INITIAL_FORM);
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

    const baseQuery = supabase
      .from('residents')
      .select(
        'id, first_name, last_name, middle_name, sex, civil_status, birthday, birthplace, address, occupation, education, religion, telephone, email',
      )
      .limit(10);

    const { data, error: fetchError } = parsed.lastName && parsed.firstName
      ? await baseQuery
          .ilike('last_name', `%${parsed.lastName}%`)
          .ilike('first_name', `%${parsed.firstName}%`)
      : await baseQuery.or(`last_name.ilike.%${safeQuery}%,first_name.ilike.%${safeQuery}%`);

    if (fetchError) {
      setError(fetchError.message);
      setResults([]);
    } else {
      setResults(data || []);
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

    if (!requestForm.document || !requestForm.purpose.trim()) {
      setRequestError('Document type and purpose are required.');
      return;
    }

    setRequestSaving(true);
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
      document: requestForm.document,
      purpose: requestForm.purpose.trim(),
      status: 'pending',
      request_source: 'kiosk',
      barangay_id: barangayId || null,
    };

    const referenceNumber = await generateReferenceNumber();
    const queueNumber = secretaryPresent ? await getNextQueueNumber() : null;
    payload.reference_number = referenceNumber;
    payload.queue_number = queueNumber;

    const { error: saveError } = await supabase
      .from(INTAKE_REQUESTS_TABLE)
      .insert(payload);
    if (saveError) {
      setRequestError(saveError.message);
      setRequestSaving(false);
      return;
    }

    setRequestSaving(false);
    setRequestOpen(false);

    const residentName = formatFullName(selectedResident);
    const docPrice = pricingInfo.prices?.[requestForm.document] ?? null;
    const printStatus = await tryPrintReceipt({
      residentName,
      document: requestForm.document,
      purpose: requestForm.purpose.trim(),
      referenceNumber,
      queueNumber,
      docPrice,
    });

    setSuccessNotice({
      open: true,
      title: secretaryPresent ? 'Request submitted' : 'Request submitted successfully',
      message: secretaryPresent
        ? 'Please proceed to the secretary desk.'
        : 'Please wait for the text message from the secretary.',
      queueNumber,
      reference: referenceNumber,
      printStatus,
    });
    setRequestForm({ document: '', purpose: '' });
  }

  const successNoticeModal = successNotice.open ? (
    <div className="kiosk-confirm-modal" role="dialog" aria-modal="true">
      <div className="kiosk-confirm-card" onClick={(event) => event.stopPropagation()}>
        <h3 className="kiosk-confirm-title">{successNotice.title || 'Submission received'}</h3>
        {successNotice.queueNumber ? (
          <div className="kiosk-queue-card" aria-live="polite">
            <span>Your queue number</span>
            <strong>#{successNotice.queueNumber}</strong>
          </div>
        ) : null}
        {successNotice.reference ? (
          <p className="kiosk-confirm-subtitle" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
            Reference: {successNotice.reference}
          </p>
        ) : null}
        <p className="kiosk-confirm-subtitle">{successNotice.message}</p>
        {successNotice.printStatus === 'printed' ? (
          <p className="kiosk-print-notice kiosk-print-notice--success">Receipt printed successfully.</p>
        ) : successNotice.printStatus === 'error' ? (
          <p className="kiosk-print-notice kiosk-print-notice--warn">Receipt could not be printed. Please ask at the desk.</p>
        ) : successNotice.printStatus === 'no-printer' ? (
          <p className="kiosk-print-notice kiosk-print-notice--warn">No printer connected. Receipt was not printed.</p>
        ) : null}
        <div className="kiosk-confirm-actions">
          <button type="button" className="kiosk-intake-submit" onClick={() => { closeSuccessNotice(); handleCloseIntake(); }}>Done</button>
        </div>
      </div>
    </div>
  ) : null;

  const moreDocsModal = moreDocsNotice ? (
    <div className="kiosk-confirm-modal" role="dialog" aria-modal="true" style={{ zIndex: 9999 }}>
      <div className="kiosk-confirm-card" onClick={(event) => event.stopPropagation()}>
        <h3 className="kiosk-confirm-title">Not available</h3>
        <p className="kiosk-confirm-subtitle">{MORE_DOCS_NOTICE}</p>
        <div className="kiosk-confirm-actions">
          <button type="button" className="kiosk-intake-submit" onClick={() => setMoreDocsNotice(false)}>OK</button>
        </div>
      </div>
    </div>
  ) : null;

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
                    <input type="text" name="telephone" value={intakeForm.telephone} onChange={handleIntakeChange} className="kiosk-intake-input" placeholder="0917 000 0000" />
                  </label>
                </div>

                <div className="kiosk-intake-grid kiosk-intake-grid--two">
                  <label className="kiosk-intake-field">
                    <span>Requested Document *</span>
                    <select
                      name="document"
                      value={intakeForm.document}
                      onChange={event => {
                        if (event.target.value === MORE_DOCS_VALUE) {
                          setMoreDocsNotice(true);
                          return;
                        }
                        handleIntakeChange(event);
                      }}
                      required
                      className="kiosk-intake-select"
                    >
                      <option value="">Select</option>
                      {documentOptions.map(option => <option key={option} value={option}>{option}</option>)}
                      <option value={MORE_DOCS_VALUE}>Other documents...</option>
                    </select>
                  </label>
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

                {intakeForm.document ? (
                  <div className="kiosk-intake-note kiosk-intake-note--info">
                    <strong>Price review</strong>
                    <div className="kiosk-price-lines">
                      <div><span>Document: </span><span>{intakeSelectedPrice !== null ? formatCurrency(intakeSelectedPrice) : 'Not set'}</span></div>
                      <div><span>Service fee: </span><span>{formatCurrency(serviceFee)}</span></div>
                      <div><span>SMS fee: </span><span>{formatCurrency(smsFee)}</span></div>
                      <div><span>Total: </span><span>{intakeTotalPrice !== null ? formatCurrency(intakeTotalPrice) : 'Not set'}</span></div>
                    </div>
                  </div>
                ) : null}

                <div className="kiosk-intake-actions">
                  <button type="button" className="kiosk-intake-cancel" onClick={handleCloseIntake}>Cancel</button>
                  <button type="submit" className="kiosk-intake-submit" disabled={intakeSaving}>
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
                <div><span>Document</span><strong>{intakeReviewData?.document || '—'}</strong></div>
                <div><span>Purpose</span><strong>{intakeReviewData?.purpose || '—'}</strong></div>
              </div>
              {intakeForm.document ? (
                <div className="kiosk-intake-note kiosk-intake-note--info" style={{ marginTop: '1rem' }}>
                  <strong>Price review</strong>
                  <div className="kiosk-price-lines">
                    <div><span>Document: </span><span>{intakeSelectedPrice !== null ? formatCurrency(intakeSelectedPrice) : 'Not set'}</span></div>
                    <div><span>Service fee: </span><span>{formatCurrency(serviceFee)}</span></div>
                    <div><span>SMS fee: </span><span>{formatCurrency(smsFee)}</span></div>
                    <div><span>Total: </span><span>{intakeTotalPrice !== null ? formatCurrency(intakeTotalPrice) : 'Not set'}</span></div>
                  </div>
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
                  <label className="kiosk-intake-field">
                    <span>Requested Document *</span>
                    <select
                      name="document"
                      value={requestForm.document}
                      onChange={event => {
                        if (event.target.value === MORE_DOCS_VALUE) {
                          setMoreDocsNotice(true);
                          return;
                        }
                        setRequestForm(prev => ({ ...prev, document: event.target.value }));
                      }}
                      required
                      className="kiosk-intake-select"
                    >
                      <option value="">Select</option>
                      {documentOptions.map(option => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                      <option value={MORE_DOCS_VALUE}>Other documents...</option>
                    </select>
                  </label>
                    {requestForm.document ? (
                      <div className="kiosk-intake-note kiosk-intake-note--info">
                        <strong>Price review</strong>
                        <div className="kiosk-price-lines">
                          <div><span>Document: </span><span>{selectedPrice !== null ? formatCurrency(selectedPrice) : 'Not set'}</span></div>
                          <div><span>Service fee: </span><span>{formatCurrency(serviceFee)}</span></div>
                          <div><span>SMS fee: </span><span>{formatCurrency(smsFee)}</span></div>
                          <div><span>Total: </span><span>{totalPrice !== null ? formatCurrency(totalPrice) : 'Not set'}</span></div>
                        </div>
                      </div>
                    ) : null}
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
                  <div className="kiosk-intake-actions">
                    <button type="button" className="kiosk-intake-cancel" onClick={handleCloseRequest}>
                      Cancel
                    </button>
                    <button type="submit" className="kiosk-intake-submit" disabled={requestSaving}>
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
    </div>
  );
}
