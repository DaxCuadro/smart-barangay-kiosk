import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../../hooks/useToast';

const VERIFICATION_TABLE = 'resident_verification_requests';
const PROFILE_TABLE = 'resident_profiles';
const RESIDENTS_TABLE = 'residents';

const STATUS_META = {
  pending: { label: 'Pending', badge: 'bg-amber-100 text-amber-700 border border-amber-200' },
  approved: { label: 'Approved', badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  rejected: { label: 'Rejected', badge: 'bg-rose-100 text-rose-700 border border-rose-200' },
};

function extractZoneFromAddress(value) {
  if (typeof value !== 'string') return '';
  const match = value.match(/(?:zone|purok)\s*(\d+)/i);
  return match ? match[1] : '';
}

function appendZoneToAddress(address, zoneValue) {
  const normalized = typeof address === 'string' ? address.trim() : '';
  if (!zoneValue) return normalized;
  if (extractZoneFromAddress(normalized)) return normalized;
  return normalized ? `${normalized}, Zone ${zoneValue}` : `Zone ${zoneValue}`;
}

function formatDate(value) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toResidentPayload(entry) {
  const addressWithZone = appendZoneToAddress(entry.address || '', entry.zone || '');
  return {
    last_name: entry.last_name || null,
    first_name: entry.first_name || null,
    middle_name: entry.middle_name || null,
    sex: entry.sex || null,
    civil_status: entry.civil_status || null,
    birthday: entry.birthday || null,
    birthplace: entry.birthplace || null,
    address: addressWithZone || null,
    occupation: entry.occupation || null,
    education: entry.education || null,
    religion: entry.religion || null,
    email: entry.email || null,
    telephone: entry.telephone || null,
  };
}

export default function VerificationTab({ barangayId }) {
  const [requests, setRequests] = useState([]);
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmState, setConfirmState] = useState({ open: false, type: '', entry: null });
  const [savingId, setSavingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);

  useEffect(() => {
    if (!barangayId) return;
    let isActive = true;

    async function loadRequests() {
      setLoading(true);
      setError('');
      const { data, error: fetchError } = await supabase
        .from(VERIFICATION_TABLE)
        .select('id, user_id, resident_id, request_type, status, first_name, last_name, middle_name, sex, civil_status, birthday, birthplace, address, zone, occupation, education, religion, email, telephone, created_at')
        .eq('barangay_id', barangayId)
        .order('created_at', { ascending: false });

      if (!isActive) return;

      if (fetchError) {
        setError(fetchError.message);
        setRequests([]);
      } else {
        setRequests(data || []);
      }
      setLoading(false);
    }

    loadRequests();
    return () => {
      isActive = false;
    };
  }, [barangayId]);

  const pendingRequests = useMemo(
    () => requests.filter(item => item.status === 'pending'),
    [requests],
  );

  const historyRequests = useMemo(
    () => requests.filter(item => item.status !== 'pending').slice(0, 10),
    [requests],
  );

  function openConfirm(entry, type) {
    setConfirmState({ open: true, type, entry });
  }

  function closeConfirm() {
    if (savingId) return;
    setConfirmState({ open: false, type: '', entry: null });
  }

  function toggleExpanded(id) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  function toggleHistoryExpanded(id) {
    setExpandedHistoryId(prev => (prev === id ? null : id));
  }

  async function handleApprove(entry) {
    setSavingId(entry.id);
    setError('');

    let residentId = entry.resident_id || null;

    if (entry.request_type === 'new') {
      const { data: insertData, error: insertError } = await supabase
        .from(RESIDENTS_TABLE)
        .insert({ ...toResidentPayload(entry), barangay_id: barangayId })
        .select('id')
        .single();

      if (insertError) {
        setError(insertError.message);
        setSavingId(null);
        return;
      }
      residentId = insertData?.id || null;
    } else if (entry.request_type === 'update' && entry.resident_id) {
      const { error: updateError } = await supabase
        .from(RESIDENTS_TABLE)
        .update(toResidentPayload(entry))
        .eq('id', entry.resident_id);

      if (updateError) {
        setError(updateError.message);
        setSavingId(null);
        return;
      }
    }

    const { error: verificationError } = await supabase
      .from(VERIFICATION_TABLE)
      .update({ status: 'approved', resident_id: residentId })
      .eq('id', entry.id);

    if (verificationError) {
      setError(verificationError.message);
      setSavingId(null);
      return;
    }

    await supabase
      .from(PROFILE_TABLE)
      .upsert(
        {
          user_id: entry.user_id,
          resident_id: residentId,
          status: 'verified',
          verification_request_id: null,
          barangay_id: barangayId,
        },
        { onConflict: 'user_id' },
      );

    setRequests(prev =>
      prev.map(item => (item.id === entry.id ? { ...item, status: 'approved', resident_id: residentId } : item)),
    );
    setSavingId(null);
    closeConfirm();
    addToast('Verification approved.', 'success');
  }

  async function handleReject(entry) {
    setSavingId(entry.id);
    setError('');

    const { error: verificationError } = await supabase
      .from(VERIFICATION_TABLE)
      .update({ status: 'rejected' })
      .eq('id', entry.id);

    if (verificationError) {
      setError(verificationError.message);
      setSavingId(null);
      return;
    }

    const profileStatus = entry.request_type === 'update' ? 'verified' : 'rejected';
    await supabase
      .from(PROFILE_TABLE)
      .upsert(
        {
          user_id: entry.user_id,
          resident_id: entry.resident_id || null,
          status: profileStatus,
          verification_request_id: null,
          barangay_id: barangayId,
        },
        { onConflict: 'user_id' },
      );

    setRequests(prev => prev.map(item => (item.id === entry.id ? { ...item, status: 'rejected' } : item)));
    setSavingId(null);
    closeConfirm();
    addToast('Verification rejected.', 'info');
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">Identity Verification</p>
        <h2 className="text-2xl font-semibold text-slate-900">Verification Requests</h2>
        <p className="text-sm text-slate-600">
          Review new and updated resident profiles before granting portal access.
        </p>
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-500 font-semibold">Pending</p>
            <h3 className="text-lg font-bold text-gray-900">Awaiting review</h3>
          </div>
          {pendingRequests.length > 0 && (
            <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white">
              {pendingRequests.length} pending
            </span>
          )}
        </div>

        {loading ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
            Loading requests...
          </div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-8 text-center text-sm text-rose-600">
            {error}
          </div>
        ) : pendingRequests.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
            No pending verification requests.
          </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {pendingRequests.map(entry => (
              <li key={entry.id} className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-gray-900">
                      {entry.last_name}, {entry.first_name}
                    </p>
                    <p className="text-sm text-gray-500">Submitted {formatDate(entry.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold px-3 py-1 rounded-full border border-blue-100 bg-blue-50 text-blue-600">
                      {entry.request_type === 'update' ? 'Profile update' : 'New resident'}
                    </span>
                    <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${STATUS_META[entry.status]?.badge || ''}`}>
                      {STATUS_META[entry.status]?.label || 'Pending'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs text-gray-600">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Address</p>
                    <p className="text-gray-700">{entry.address || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Zone</p>
                    <p className="text-gray-700">{entry.zone || extractZoneFromAddress(entry.address || '') || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Birthday</p>
                    <p className="text-gray-700">{formatDate(entry.birthday)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Contact</p>
                    <p className="text-gray-700">{entry.telephone || entry.email || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>Resident details</span>
                  <button
                    type="button"
                    className="text-blue-600 hover:text-blue-700"
                    onClick={() => toggleExpanded(entry.id)}
                  >
                    {expandedId === entry.id ? 'Hide full review' : 'Show full review'}
                  </button>
                </div>
                {expandedId === entry.id ? (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Sex</p>
                        <p className="text-gray-700">{entry.sex || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Civil status</p>
                        <p className="text-gray-700">{entry.civil_status || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Birthplace</p>
                        <p className="text-gray-700">{entry.birthplace || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Occupation</p>
                        <p className="text-gray-700">{entry.occupation || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Education</p>
                        <p className="text-gray-700">{entry.education || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Religion</p>
                        <p className="text-gray-700">{entry.religion || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Email</p>
                        <p className="text-gray-700">{entry.email || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Telephone</p>
                        <p className="text-gray-700">{entry.telephone || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    onClick={() => openConfirm(entry, 'approve')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    onClick={() => openConfirm(entry, 'reject')}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold">History</p>
            <h3 className="text-lg font-bold text-gray-900">Recently reviewed</h3>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {historyRequests.length ? (
            historyRequests.map(entry => (
              <div key={entry.id} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{entry.last_name}, {entry.first_name}</span>
                  <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${STATUS_META[entry.status]?.badge || ''}`}>
                    {STATUS_META[entry.status]?.label || entry.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{entry.request_type === 'update' ? 'Profile update' : 'New resident'} • {formatDate(entry.created_at)}</p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  onClick={() => toggleHistoryExpanded(entry.id)}
                >
                  {expandedHistoryId === entry.id ? 'Hide info' : 'View info'}
                </button>
                {expandedHistoryId === entry.id ? (
                  <div className="mt-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-600">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Full name</p>
                        <p className="text-gray-700">
                          {entry.last_name || 'N/A'}, {entry.first_name || ''} {entry.middle_name || ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Sex</p>
                        <p className="text-gray-700">{entry.sex || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Civil status</p>
                        <p className="text-gray-700">{entry.civil_status || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Address</p>
                        <p className="text-gray-700">{entry.address || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Zone</p>
                        <p className="text-gray-700">{entry.zone || extractZoneFromAddress(entry.address || '') || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Birthday</p>
                        <p className="text-gray-700">{formatDate(entry.birthday)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Birthplace</p>
                        <p className="text-gray-700">{entry.birthplace || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Contact</p>
                        <p className="text-gray-700">{entry.telephone || entry.email || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Email</p>
                        <p className="text-gray-700">{entry.email || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Telephone</p>
                        <p className="text-gray-700">{entry.telephone || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Occupation</p>
                        <p className="text-gray-700">{entry.occupation || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Education</p>
                        <p className="text-gray-700">{entry.education || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Religion</p>
                        <p className="text-gray-700">{entry.religion || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">No reviewed requests yet.</p>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={confirmState.open && confirmState.type === 'approve'}
        title="Approve this resident?"
        description={confirmState.entry ? `This will ${confirmState.entry.request_type === 'update' ? 'apply the profile update' : 'create a new resident record'} and verify the account.` : ''}
        confirmLabel="Approve"
        tone="primary"
        loading={savingId === confirmState.entry?.id}
        onConfirm={() => handleApprove(confirmState.entry)}
        onCancel={closeConfirm}
      />

      <ConfirmDialog
        open={confirmState.open && confirmState.type === 'reject'}
        title="Reject this request?"
        description="The resident will be notified to wait or submit again."
        confirmLabel="Reject"
        tone="danger"
        loading={savingId === confirmState.entry?.id}
        onConfirm={() => handleReject(confirmState.entry)}
        onCancel={closeConfirm}
      />
    </div>
  );
}
