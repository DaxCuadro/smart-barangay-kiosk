import { useEffect, useMemo, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import { generateClearancePdf } from '../../utils/generateClearancePdf';

const INTAKE_REQUESTS_TABLE = 'resident_intake_requests';
const RELEASE_LOGS_TABLE = 'release_logs';
const INTAKE_NOTE = 'New application (awaiting resident verification)';

const STATUS_TABS = [
  {
    key: 'pending',
    label: 'New Submissions',
    description: 'Fresh submissions awaiting validation and fee review.',
    badge: 'bg-amber-100 text-amber-700 border border-amber-200',
  },
  {
    key: 'current',
    label: 'In Progress',
    description: 'Documents being drafted, printed, or queued for SMS alerts.',
    badge: 'bg-blue-100 text-blue-700 border border-blue-200',
  },
  {
    key: 'done',
    label: 'Ready for Pickup',
    description: 'Ready for pickup; awaiting payment confirmation and log entry.',
    badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  },
];

const STATUS_ACTIONS = {
  pending: {
    label: 'Move to In Progress',
    helper: 'Validates requirements and starts document processing.',
  },
  current: {
    label: 'Mark paperwork done',
    helper: 'Signals that printing/notarizing is finished and SMS can be sent.',
  },
  done: {
    label: 'Confirm release & log payment',
    helper: 'Marks the request as released, paid, and archived in logs.',
  },
};

const EMPTY_STATE_COPY = {
  pending: 'No new submissions yet. Incoming requests from kiosks and mobile will show up here.',
  current: 'Nothing in progress. Move a submission here once processing starts.',
  done: 'No requests ready for pickup yet. Confirm releases to populate this list.',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REFRESH_MS = 15000;

function groupRequestsByStatus(items) {
  return items.reduce((acc, request) => {
    const bucket = request.status || 'pending';
    if (!acc[bucket]) acc[bucket] = [];
    acc[bucket].push(request);
    return acc;
  }, {});
}

function formatDateTime(value) {
  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatResidentName(record) {
  const middleInitial = record.middle_name ? ` ${record.middle_name[0].toUpperCase()}.` : '';
  return `${record.last_name || ''}, ${record.first_name || ''}${middleInitial}`.trim();
}

function extractZoneFromAddress(value) {
  if (typeof value !== 'string') return '';
  const match = value.match(/(?:zone|purok)\s*(\d+)/i);
  return match ? match[1] : '';
}

function formatZoneLabel(zoneValue, address) {
  const resolved = zoneValue || extractZoneFromAddress(address);
  return resolved ? `Zone ${resolved}` : 'Zone N/A';
}

function appendZoneToAddress(address, zoneValue) {
  const normalized = typeof address === 'string' ? address.trim() : '';
  if (!zoneValue) return normalized;
  if (extractZoneFromAddress(normalized)) return normalized;
  return normalized ? `${normalized}, Zone ${zoneValue}` : `Zone ${zoneValue}`;
}

function formatBirthday(date) {
  if (!date) return 'N/A';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toLogItem(record) {
  return {
    id: record.id,
    requestId: record.request_id,
    reference: record.reference_number || (record.request_id ? `INTAKE-${String(record.request_id).slice(0, 8).toUpperCase()}` : 'N/A'),
    resident: record.resident_name || 'N/A',
    document: record.document || 'Document',
    contact: record.contact || 'N/A',
    zone: record.zone || 'Zone N/A',
    source: record.source || '',
    releasedAt: record.released_at || new Date().toISOString(),
  };
}

function mapRequestToResident(request) {
  const addressWithZone = appendZoneToAddress(request.address, request.zone);
  return {
    last_name: request.last_name || null,
    first_name: request.first_name || null,
    middle_name: request.middle_name || null,
    sex: request.sex || null,
    civil_status: request.civil_status || null,
    birthday: request.birthday || null,
    birthplace: request.birthplace || null,
    address: addressWithZone || null,
    occupation: request.occupation || null,
    education: request.education || null,
    religion: request.religion || null,
    email: request.email || null,
    telephone: request.telephone || null,
  };
}

function toRequestItem(record) {
  const contact = record.telephone || record.email || 'N/A';
  const zoneLabel = formatZoneLabel(record.zone, record.address);
  const status = record.status || 'pending';
  const isNewApplicant = !record.resident_id;
  const source = record.request_source || '';
  return {
    id: record.id,
    residentId: record.resident_id,
    isNewApplicant,
    raw: record,
    resident: formatResidentName(record),
    zone: zoneLabel,
    document: record.document || 'Document request',
    purpose: record.purpose || '',
    submittedAt: record.created_at || new Date().toISOString(),
    reference: record.reference_number || `INTAKE-${String(record.id).slice(0, 8).toUpperCase()}`,
    queueNumber: record.queue_number || null,
    attachments: 0,
    contact,
    status,
    note: status === 'pending' && isNewApplicant ? INTAKE_NOTE : '',
    source,
    address: record.address || '',
    sex: record.sex || '',
    civilStatus: record.civil_status || '',
    birthday: record.birthday || '',
    birthplace: record.birthplace || '',
    occupation: record.occupation || '',
    education: record.education || '',
    religion: record.religion || '',
    email: record.email || '',
    telephone: record.telephone || '',
  };
}

export default function RequestsTab({ barangayId }) {
  const supabase = useSupabase();
  const { addToast } = useToast();
  const [activeStatus, setActiveStatus] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [confirmState, setConfirmState] = useState({ open: false, request: null });
  const [cancelState, setCancelState] = useState({ open: false, request: null });
  const [cancelingId, setCancelingId] = useState(null);
  const [loggingRequestId, setLoggingRequestId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeLogMonth, setActiveLogMonth] = useState(() => new Date().getMonth());
  const [activeLogYear, setActiveLogYear] = useState(() => new Date().getFullYear());
  const [authSession, setAuthSession] = useState(null);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [generatingPdfId, setGeneratingPdfId] = useState(null);
  const [cancelledRequests, setCancelledRequests] = useState([]);

  useEffect(() => {
    if (!barangayId) return;
    let isActive = true;

    async function loadRequests({ silent = false } = {}) {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      const { data, error: fetchError } = await supabase
        .from(INTAKE_REQUESTS_TABLE)
        .select(
          'id, created_at, status, resident_id, request_source, first_name, last_name, middle_name, sex, civil_status, birthday, birthplace, address, zone, occupation, education, religion, telephone, email, document, purpose, reference_number, queue_number',
        )
        .eq('barangay_id', barangayId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (!isActive) return;

      if (fetchError) {
        setError(fetchError.message);
        setRequests([]);
      } else {
        setRequests((data || []).map(toRequestItem));
      }

      if (!silent) {
        setLoading(false);
      }
    }

    loadRequests();
    const intervalId = setInterval(() => {
      loadRequests({ silent: true });
    }, REFRESH_MS);
    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [supabase, barangayId]);

  useEffect(() => {
    let isActive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isActive) {
        setAuthSession(data?.session ?? null);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isActive) {
        setAuthSession(session ?? null);
      }
    });

    return () => {
      isActive = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase.auth]);

  useEffect(() => {
    let isActive = true;

    async function loadLogs() {
      if (!authSession || !barangayId) return;
      const { data, error: fetchError } = await supabase
        .from(RELEASE_LOGS_TABLE)
        .select('id, request_id, released_at, resident_name, document, contact, source, zone, reference_number')
        .eq('barangay_id', barangayId)
        .order('released_at', { ascending: false });

      if (!isActive) return;

      if (fetchError) {
        setError(fetchError.message);
        setLogs([]);
      } else {
        setLogs((data || []).map(toLogItem));
      }
    }

    async function loadCancelledRequests() {
      if (!authSession || !barangayId) return;
      const { data, error: fetchError } = await supabase
        .from(INTAKE_REQUESTS_TABLE)
        .select('id, first_name, last_name, middle_name, document, telephone, email, zone, address, request_source, reference_number, cancelled_by, cancelled_at')
        .eq('barangay_id', barangayId)
        .eq('status', 'cancelled')
        .order('cancelled_at', { ascending: false });

      if (!isActive) return;

      if (fetchError) {
        setCancelledRequests([]);
      } else {
        setCancelledRequests((data || []).map(record => ({
          id: record.id,
          resident: formatResidentName(record),
          document: record.document || 'Document',
          contact: record.telephone || record.email || 'N/A',
          zone: formatZoneLabel(record.zone, record.address),
          source: record.request_source || '',
          reference: record.reference_number || 'N/A',
          cancelledAt: record.cancelled_at || new Date().toISOString(),
          cancelledBy: record.cancelled_by || 'unknown',
        })));
      }
    }

    loadLogs();
    loadCancelledRequests();
    const intervalId = setInterval(() => {
      loadLogs();
      loadCancelledRequests();
    }, REFRESH_MS);
    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [supabase, authSession, barangayId]);

  const groupedRequests = useMemo(() => groupRequestsByStatus(requests), [requests]);
  const visibleRequests = useMemo(() => {
    const items = groupedRequests[activeStatus] || [];
    return items
      .slice()
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [groupedRequests, activeStatus]);
  const stats = STATUS_TABS.map(tab => ({
    ...tab,
    count: (groupedRequests[tab.key] || []).length,
  }));
  const logYears = useMemo(() => {
    const releaseDates = logs.map(entry => new Date(entry.releasedAt).getFullYear());
    const cancelDates = cancelledRequests.map(entry => new Date(entry.cancelledAt).getFullYear());
    const currentYear = new Date().getFullYear();
    return Array.from(new Set([...releaseDates, ...cancelDates, currentYear])).sort((a, b) => b - a);
  }, [logs, cancelledRequests]);
  const filteredLogs = useMemo(() => {
    const released = logs
      .filter(entry => {
        const date = new Date(entry.releasedAt);
        return date.getFullYear() === activeLogYear && date.getMonth() === activeLogMonth;
      })
      .map(entry => ({ ...entry, logType: 'released' }));
    const cancelled = cancelledRequests
      .filter(entry => {
        const date = new Date(entry.cancelledAt);
        return date.getFullYear() === activeLogYear && date.getMonth() === activeLogMonth;
      })
      .map(entry => ({
        ...entry,
        logType: 'cancelled',
        releasedAt: entry.cancelledAt,
      }));
    return [...released, ...cancelled].sort((a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime());
  }, [logs, cancelledRequests, activeLogMonth, activeLogYear]);
  const loggedRequestIds = useMemo(
    () => new Set(logs.map(entry => entry.requestId)),
    [logs],
  );

  function toggleLogExpanded(id) {
    setExpandedLogId(prev => (prev === id ? null : id));
  }

  async function handleGeneratePdf(request) {
    if (generatingPdfId) return;
    setGeneratingPdfId(request.id);
    try {
      // Fetch barangay info (with new columns)
      const { data: brgy } = await supabase
        .from('barangays')
        .select('id, name, code, province, municipality, barangay_address, barangay_email, seal_url')
        .eq('id', barangayId)
        .single();

      // Fetch officials
      const { data: officialsRows } = await supabase
        .from('barangay_officials')
        .select('id, role, name, email, contact_number, alternate_title')
        .eq('barangay_id', barangayId);

      const ROLE_KEYS = ['punong', 'kagawad', 'sk', 'treasurer', 'secretary'];
      const grouped = ROLE_KEYS.reduce((acc, k) => { acc[k] = []; return acc; }, {});
      for (const row of (officialsRows || [])) {
        const key = (row.role || '').toLowerCase();
        if (grouped[key]) {
          grouped[key].push({ name: row.name || '', alternateTitle: row.alternate_title || '' });
        }
      }

      const doc = await generateClearancePdf({
        request,
        barangay: brgy || {},
        officials: grouped,
        amount: null,
      });

      const safeName = (request.resident || 'document').replace(/[^a-zA-Z0-9]/g, '_');
      doc.save(`Barangay_Clearance_${safeName}.pdf`);
      addToast('PDF generated successfully.', 'success');
    } catch (err) {
      console.error('PDF generation failed', err);
      addToast('Failed to generate PDF. Check console for details.', 'error');
    } finally {
      setGeneratingPdfId(null);
    }
  }

  async function handleAdvanceStatus(request) {
    if (statusUpdatingId) return;
    const nextStatus = request.status === 'pending' ? 'current' : request.status === 'current' ? 'done' : null;
    if (!nextStatus) return;

    setStatusUpdatingId(request.id);
    setError(null);
    const { error: updateError } = await supabase
      .from(INTAKE_REQUESTS_TABLE)
      .update({ status: nextStatus })
      .eq('id', request.id);

    if (updateError) {
      addToast(updateError.message, 'error');
      setStatusUpdatingId(null);
      return;
    }

    // Send SMS notification when document is ready for pickup
    if (nextStatus === 'done' && request.telephone) {
      try {
        await supabase.functions.invoke('send_sms', {
          body: {
            phone: request.telephone,
            message: `Your ${request.document || 'document'} (Ref: ${request.reference}) is ready for pickup at the barangay hall. Please bring a valid ID.`,
          },
        });
        addToast('SMS notification sent to resident.', 'success');
      } catch {
        addToast('Document marked ready, but SMS notification failed.', 'warning');
      }
    }

    setRequests(prev =>
      prev.map(item => (item.id === request.id ? { ...item, status: nextStatus, note: '' } : item)),
    );
    setStatusUpdatingId(null);
  }

  function handleAdvanceRequest(request) {
    if (request.status === 'pending' && request.isNewApplicant) {
      setConfirmState({ open: true, request });
      return;
    }
    handleAdvanceStatus(request);
  }

  function closeConfirm() {
    setConfirmState({ open: false, request: null });
  }

  function openCancel(request) {
    setCancelState({ open: true, request });
  }

  function closeCancel() {
    if (cancelingId) return;
    setCancelState({ open: false, request: null });
  }

  async function confirmCancel() {
    if (!cancelState.request) return;
    setCancelingId(cancelState.request.id);
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from(INTAKE_REQUESTS_TABLE)
      .update({ status: 'cancelled', cancelled_by: 'admin', cancelled_at: now })
      .eq('id', cancelState.request.id);

    if (updateError) {
      addToast(updateError.message, 'error');
      setCancelingId(null);
      return;
    }

    const cancelled = cancelState.request;
    setRequests(prev => prev.filter(item => item.id !== cancelled.id));
    setCancelledRequests(prev => [
      {
        id: cancelled.id,
        resident: cancelled.resident,
        document: cancelled.document,
        contact: cancelled.contact,
        zone: cancelled.zone,
        source: cancelled.source || '',
        reference: cancelled.reference,
        cancelledAt: now,
        cancelledBy: 'admin',
      },
      ...prev,
    ]);
    setCancelingId(null);
    setCancelState({ open: false, request: null });
    addToast('Request cancelled.', 'success');
  }

  async function confirmAdvance() {
    if (!confirmState.request) return;
    const { request } = confirmState;
    let nextRequest = request;
    if (request.isNewApplicant) {
      const { data, error: insertError } = await supabase
        .from('residents')
        .insert({ ...mapRequestToResident(request.raw), barangay_id: barangayId })
        .select('id')
        .single();
      if (insertError) {
        addToast(insertError.message, 'error');
        closeConfirm();
        return;
      }
      const residentId = data?.id || null;

      // Log to verification history as approved so it appears in the Verification tab
      const raw = request.raw;
      const { data: sessionData } = await supabase.auth.getSession();
      const adminUserId = sessionData?.session?.user?.id || null;
      await supabase.from('resident_verification_requests').insert({
        barangay_id: barangayId,
        resident_id: residentId,
        user_id: adminUserId,
        request_type: 'new',
        status: 'approved',
        first_name: raw.first_name || null,
        last_name: raw.last_name || null,
        middle_name: raw.middle_name || null,
        sex: raw.sex || null,
        civil_status: raw.civil_status || null,
        birthday: raw.birthday || null,
        birthplace: raw.birthplace || null,
        address: raw.address || null,
        zone: raw.zone || null,
        occupation: raw.occupation || null,
        education: raw.education || null,
        religion: raw.religion || null,
        email: raw.email || null,
        telephone: raw.telephone || null,
      });

      nextRequest = {
        ...request,
        residentId,
        isNewApplicant: false,
        raw: { ...request.raw, resident_id: residentId },
      };
      setRequests(prev =>
        prev.map(item => (item.id === nextRequest.id ? { ...item, residentId, isNewApplicant: false } : item)),
      );
    }
    await handleAdvanceStatus(nextRequest);
    closeConfirm();
  }

  function toggleExpanded(id) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  async function handleLogRelease(request) {
    if (loggedRequestIds.has(request.id) || loggingRequestId === request.id) return;
    setLoggingRequestId(request.id);
    const payload = {
      request_id: request.id,
      resident_id: request.residentId || null,
      resident_name: request.resident,
      document: request.document,
      contact: request.contact,
      zone: request.zone,
      source: request.source || null,
      barangay_id: barangayId,
      reference_number: request.reference || null,
    };

    const { data, error: insertError } = await supabase
      .from(RELEASE_LOGS_TABLE)
      .insert(payload)
      .select('id, request_id, released_at, resident_name, document, contact, source, zone, reference_number')
      .single();

    if (insertError) {
      addToast(insertError.message, 'error');
      setLoggingRequestId(null);
      return;
    }
    if (data) {
      setLogs(prev => [toLogItem(data), ...prev]);
    }

    const { error: deleteError } = await supabase
      .from(INTAKE_REQUESTS_TABLE)
      .delete()
      .eq('id', request.id);

    if (deleteError) {
      addToast(deleteError.message, 'error');
      setLoggingRequestId(null);
      return;
    }

    setRequests(prev => prev.filter(item => item.id !== request.id));
    setLoggingRequestId(null);
    addToast('Release logged successfully.', 'success');
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg flex flex-col gap-4">
        <div className="text-left">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">Request Queue</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Requests</h2>
          <p className="mt-2 text-sm text-slate-600">
            Monitor new submissions, move them through processing, and log releases for pickup and payment tracking.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 font-semibold tracking-wide text-slate-600">Offline-first ready</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 font-semibold tracking-wide text-slate-600">Resident portal sync coming soon</span>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map(stat => (
          <div key={stat.key} className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{stat.count}</p>
            <p className="mt-1 text-xs text-gray-500">{stat.description}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-left">
            <p className="text-xs uppercase tracking-widest text-blue-500 font-semibold">Queues</p>
            <h3 className="text-xl font-bold text-gray-900">{STATUS_TABS.find(tab => tab.key === activeStatus)?.label}</h3>
            <p className="text-sm text-gray-500">
              {STATUS_TABS.find(tab => tab.key === activeStatus)?.description}
            </p>
            {activeStatus === 'current' && (
              <span className="mt-2 inline-flex text-[11px] rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-blue-600">
                SMS reminder stage
              </span>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold border transition ${
                  activeStatus === tab.key ? 'bg-blue-600 text-white border-blue-600 shadow' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                onClick={() => setActiveStatus(tab.key)}
              >
                <span className="flex items-center gap-2">
                  {tab.label}
                  {(groupedRequests[tab.key] || []).length > 0 && (
                    <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {(groupedRequests[tab.key] || []).length}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
            Loading requests...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center text-sm text-red-600">
            Unable to load requests. {error}
          </div>
        ) : !visibleRequests.length ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
            {EMPTY_STATE_COPY[activeStatus] || 'No requests yet.'}
          </div>
        ) : (
          <ul className="space-y-4">
            {visibleRequests.map(request => {
              const isLogged = loggedRequestIds.has(request.id);
              return (
              <li key={request.id} className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-gray-900">{request.document}</p>
                    <p className="text-sm text-gray-500">
                      {request.resident} • {request.zone}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${STATUS_TABS.find(tab => tab.key === request.status)?.badge || ''}`}>
                      {STATUS_TABS.find(tab => tab.key === request.status)?.label || 'Request'}
                    </span>
                    {request.isNewApplicant && (
                      <span className="text-[11px] font-semibold px-3 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
                        New applicant
                      </span>
                    )}
                    {request.source && (
                      <span className="text-[11px] font-semibold px-3 py-1 rounded-full border border-blue-100 bg-blue-50 text-blue-600">
                        {request.source === 'kiosk' ? 'Kiosk request' : 'Remote request'}
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Submitted {formatDateTime(request.submittedAt)} · Ref {request.reference}
                  {request.queueNumber ? ` · Queue #${request.queueNumber}` : ''}
                </p>
                {request.purpose && <p className="mt-2 text-sm text-gray-700">{request.purpose}</p>}
                {request.note && (
                  <p className="mt-2 text-xs font-semibold text-amber-600">
                    {request.note}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-gray-500">
                  <span>Contact: {request.contact}</span>
                  <button
                    type="button"
                    className="text-blue-600 hover:text-blue-700"
                    onClick={() => toggleExpanded(request.id)}
                  >
                    {expandedId === request.id ? 'Hide information' : 'Show information'}
                  </button>
                </div>
                {expandedId === request.id && (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Address</p>
                        <p className="text-gray-700">{request.address || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Birthday</p>
                        <p className="text-gray-700">{formatBirthday(request.birthday)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Sex</p>
                        <p className="text-gray-700">{request.sex || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Civil status</p>
                        <p className="text-gray-700">{request.civilStatus || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Occupation</p>
                        <p className="text-gray-700">{request.occupation || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Education</p>
                        <p className="text-gray-700">{request.education || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Religion</p>
                        <p className="text-gray-700">{request.religion || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Birthplace</p>
                        <p className="text-gray-700">{request.birthplace || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Email</p>
                        <p className="text-gray-700">{request.email || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Telephone</p>
                        <p className="text-gray-700">{request.telephone || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="pt-3 border-t border-gray-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[11px] text-gray-500">
                    {STATUS_ACTIONS[activeStatus]?.helper || 'Workflow action coming soon.'}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {request.document && request.document.toLowerCase().includes('clearance') && (
                      <button
                        type="button"
                        className="rounded-full border border-purple-200 px-4 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-50"
                        onClick={() => handleGeneratePdf(request)}
                        disabled={generatingPdfId === request.id}
                      >
                        {generatingPdfId === request.id ? 'Generating…' : 'Generate PDF'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                      onClick={() => openCancel(request)}
                    >
                      Cancel request
                    </button>
                    <button
                      type="button"
                      disabled={(request.status === 'done' && isLogged) || statusUpdatingId === request.id || loggingRequestId === request.id}
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        (request.status === 'done' && isLogged) || statusUpdatingId === request.id || loggingRequestId === request.id
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-500'
                      }`}
                      onClick={() => (request.status === 'done' ? handleLogRelease(request) : handleAdvanceRequest(request))}
                    >
                      {statusUpdatingId === request.id
                        ? 'Updating...'
                        : loggingRequestId === request.id
                          ? 'Logging...'
                        : request.status === 'done'
                          ? isLogged
                            ? 'Logged'
                            : 'Confirm release & log payment'
                          : request.status === 'pending' && request.isNewApplicant
                            ? 'Confirm & move to In Progress'
                            : STATUS_ACTIONS[activeStatus]?.label || 'Action coming soon'}
                    </button>
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmState.open}
        title="Confirm new applicant request?"
        description={confirmState.request ? `${confirmState.request.resident} will be added to Manage Residents and moved to In Progress.` : ''}
        confirmLabel="Confirm & move"
        tone="primary"
        loading={statusUpdatingId === confirmState.request?.id}
        onConfirm={confirmAdvance}
        onCancel={closeConfirm}
      />

      <ConfirmDialog
        open={cancelState.open}
        title="Cancel this request?"
        description={cancelState.request ? `${cancelState.request.resident}'s request will be cancelled and recorded in the monthly release history.` : ''}
        confirmLabel="Cancel request"
        tone="danger"
        loading={cancelingId === cancelState.request?.id}
        onConfirm={confirmCancel}
        onCancel={closeCancel}
      />

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg space-y-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Release Logs</p>
            <h3 className="text-lg font-bold text-gray-900">Monthly release history</h3>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {MONTHS.map((label, index) => (
            <button
              key={label}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
                activeLogMonth === index ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
              onClick={() => setActiveLogMonth(index)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {logYears.map(year => (
            <button
              key={year}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
                activeLogYear === year ? 'bg-slate-900 text-white border-slate-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
              onClick={() => setActiveLogYear(year)}
            >
              {year}
            </button>
          ))}
        </div>
        <div className="max-h-72 overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50">
          {filteredLogs.length ? (
            <ul className="divide-y divide-gray-100">
              {filteredLogs.map(entry => (
                <li key={`${entry.logType}-${entry.id}`} className="p-4 text-sm text-gray-700">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{entry.document}</p>
                      <p className="text-xs text-gray-500">{entry.resident} • {entry.zone}</p>
                    </div>
                    {entry.logType === 'cancelled' ? (
                      <span className="text-[11px] rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-700">
                        Cancelled by {entry.cancelledBy} · {formatDateTime(entry.cancelledAt)}
                      </span>
                    ) : (
                      <span className="text-[11px] rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                        Logged {formatDateTime(entry.releasedAt)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-500">
                    <span>Ref {entry.reference}</span>
                    <span>Contact: {entry.contact}</span>
                    {entry.source && (
                      <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-blue-600">
                        {entry.source === 'kiosk' ? 'Kiosk request' : 'Remote request'}
                      </span>
                    )}
                    <button
                      type="button"
                      className="text-blue-600 hover:text-blue-700"
                      onClick={() => toggleLogExpanded(`${entry.logType}-${entry.id}`)}
                    >
                      {expandedLogId === `${entry.logType}-${entry.id}` ? 'Hide info' : 'View info'}
                    </button>
                  </div>
                  {expandedLogId === `${entry.logType}-${entry.id}` ? (
                    <div className="mt-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-600">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">Resident</p>
                          <p className="text-gray-700">{entry.resident || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">Document</p>
                          <p className="text-gray-700">{entry.document || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">Zone</p>
                          <p className="text-gray-700">{entry.zone || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">Contact</p>
                          <p className="text-gray-700">{entry.contact || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">Reference</p>
                          <p className="text-gray-700">{entry.reference || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-gray-400">Source</p>
                          <p className="text-gray-700">{entry.source || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No release logs or cancellations for {MONTHS[activeLogMonth]} {activeLogYear}.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
