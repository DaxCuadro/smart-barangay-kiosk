import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import { BARANGAY_INFO_STORAGE_KEY } from '../../utils/barangayInfoStorage';
import { useSupabase } from '../../contexts/SupabaseContext';
import useModalA11y from '../../hooks/useModalA11y';

const OFFICIAL_GROUPS = [
  { key: 'punong', label: 'Punong Barangay', limit: 1, blurb: 'Chief executive of the barangay' },
  { key: 'kagawad', label: 'Sangguniang Barangay Members', limit: 7, blurb: 'Legislative council (7 kagawad slots)' },
  { key: 'sk', label: 'SK Chairperson', limit: 1, blurb: 'Youth council representative' },
  { key: 'treasurer', label: 'Barangay Treasurer', limit: 1, blurb: 'Handles finances and collections' },
  { key: 'secretary', label: 'Barangay Secretary', limit: 1, blurb: 'Records, correspondences, and minutes' },
];

const OFFICIALS_TABLE = 'barangay_officials';
const ZONE_SETTINGS_TABLE = 'barangay_zone_settings';
const DEFAULT_ZONES_COUNT = 1;

function createEmptyOfficials() {
  return OFFICIAL_GROUPS.reduce((acc, group) => {
    acc[group.key] = [];
    return acc;
  }, {});
}

function loadInitialState() {
  if (typeof window === 'undefined') {
    return { zonesCount: DEFAULT_ZONES_COUNT, officials: createEmptyOfficials() };
  }
  try {
    const stored = window.localStorage.getItem(BARANGAY_INFO_STORAGE_KEY);
    if (!stored) {
      return { zonesCount: DEFAULT_ZONES_COUNT, officials: createEmptyOfficials() };
    }
    const parsed = JSON.parse(stored);
    return {
      zonesCount: parsed.zonesCount || DEFAULT_ZONES_COUNT,
      officials: { ...createEmptyOfficials(), ...(parsed.officials || {}) },
    };
  } catch {
    return { zonesCount: DEFAULT_ZONES_COUNT, officials: createEmptyOfficials() };
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `official-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function resolveGroupKey(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  const byKey = OFFICIAL_GROUPS.find(group => group.key === normalized);
  if (byKey) return byKey.key;
  const byLabel = OFFICIAL_GROUPS.find(group => group.label.toLowerCase() === normalized);
  if (byLabel) return byLabel.key;
  return null;
}

function normalizeOfficialRecord(record, fallbackGroupKey) {
  if (!record) return null;
  const groupKey =
    record.role_key || record.group_key || resolveGroupKey(record.role) || fallbackGroupKey || null;
  if (!groupKey) return null;
  return {
    groupKey,
    entry: {
      id: record.id || generateId(),
      name: record.name || '',
      email: record.email || '',
      contactNumber: record.contact_number || record.contact || record.contactNumber || '',
      alternateTitle: record.alternate_title || record.alternateTitle || '',
    },
  };
}

function mapSupabaseOfficials(rows) {
  const grouped = createEmptyOfficials();
  if (!Array.isArray(rows)) {
    return grouped;
  }
  rows.forEach(row => {
    const normalized = normalizeOfficialRecord(row);
    if (!normalized) return;
    if (!grouped[normalized.groupKey]) {
      grouped[normalized.groupKey] = [];
    }
    grouped[normalized.groupKey].push(normalized.entry);
  });
  return grouped;
}

function extractZonesCount(record) {
  if (!record) return DEFAULT_ZONES_COUNT;
  const numeric = Number(record.zones_count ?? record.zone_count ?? record.zonesCount ?? record.count);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_ZONES_COUNT;
}

function OfficialModal({ open, group, initialData, onClose, onSave, loading }) {
  const containerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [form, setForm] = useState({ name: '', email: '', contactNumber: '', alternateTitle: '' });
  const isEdit = Boolean(initialData);

  useEffect(() => {
    if (!open) return undefined;
    const payload = {
      name: initialData?.name || '',
      email: initialData?.email || '',
      contactNumber: initialData?.contactNumber || initialData?.contact || '',
      alternateTitle: initialData?.alternateTitle || '',
    };
    const timeout = setTimeout(() => setForm(payload), 0);
    return () => clearTimeout(timeout);
  }, [open, initialData]);

  useModalA11y({
    open,
    containerRef,
    onClose: loading ? undefined : onClose,
    focusOnOpenRef: closeButtonRef,
  });

  if (!open || !group) return null;

  function handleChange(event) {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (loading) {
      return;
    }
    if (!form.name.trim()) {
      return;
    }
    onSave({
      name: form.name.trim(),
      email: form.email.trim(),
      contactNumber: form.contactNumber.trim(),
      alternateTitle: form.alternateTitle.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" role="presentation">
      <div
        ref={containerRef}
        className="w-full max-w-lg rounded-3xl bg-white shadow-2xl pr-2"
        role="dialog"
        aria-modal="true"
        aria-labelledby="official-modal-title"
        tabIndex={-1}
      >
        <div className="max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-500 font-semibold">Barangay Info</p>
              <h2 id="official-modal-title" className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit' : 'Add'} {group.label}</h2>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="rounded-full p-2 text-gray-400 hover:bg-gray-100"
              onClick={onClose}
              aria-label="Close modal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
          <form className="px-6 py-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-semibold text-gray-700">Full name</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              placeholder="e.g., Juan D. Dela Cruz"
              maxLength={120}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Email address</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              placeholder="official@barangay.gov.ph"
              maxLength={120}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Contact number</label>
            <input
              type="text"
              name="contactNumber"
              value={form.contactNumber}
              onChange={handleChange}
              className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              placeholder="0917 000 0000"
              maxLength={40}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Alternate title / Committee</label>
            <input
              type="text"
              name="alternateTitle"
              value={form.alternateTitle}
              onChange={handleChange}
              className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              placeholder="e.g., Comm. on Appropriation"
              maxLength={150}
            />
            <p className="mt-1 text-[11px] text-gray-400">Optional. Used in official documents and the PDF sidebar.</p>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-full border border-gray-200 px-6 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              onClick={loading ? undefined : onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-400"
              disabled={loading}
            >
              {loading ? 'Saving...' : isEdit ? 'Save changes' : 'Add official'}
            </button>
          </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function BarangayInfoTab({ onLogout, barangayId, barangayName }) {
  const supabase = useSupabase();
  const { addToast } = useToast();
  const initialState = useMemo(() => loadInitialState(), []);
  const [data, setData] = useState(initialState);
  const [zoneInput, setZoneInput] = useState(() => String(initialState.zonesCount || DEFAULT_ZONES_COUNT));
  const [modalState, setModalState] = useState({ open: false, groupKey: null, targetId: null });
  const [pendingDelete, setPendingDelete] = useState(null);
  const [zoneSettingsId, setZoneSettingsId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [savingOfficial, setSavingOfficial] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [zoneSaving, setZoneSaving] = useState(false);
  const [secretaryPresent, setSecretaryPresent] = useState(true);
  const [secretarySaving, setSecretarySaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);

  const currentGroup = OFFICIAL_GROUPS.find(group => group.key === modalState.groupKey) || null;
  const officials = data.officials;
  const zonesCount = data.zonesCount || 1;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(BARANGAY_INFO_STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    setZoneInput(current => {
      const normalized = String(data.zonesCount || DEFAULT_ZONES_COUNT);
      return current === normalized ? current : normalized;
    });
  }, [data.zonesCount]);

  const fetchFromSupabase = useCallback(async () => {
    if (!barangayId) return;
    const { data: officialsData, error: officialsError } = await supabase
      .from(OFFICIALS_TABLE)
      .select('id, role, name, email, contact_number, alternate_title')
      .eq('barangay_id', barangayId);
    if (officialsError) {
      throw officialsError;
    }

    const zoneQuery = await supabase
      .from(ZONE_SETTINGS_TABLE)
      .select('id, zones_count, secretary_present')
      .eq('barangay_id', barangayId)
      .order('id', { ascending: false })
      .limit(1);

    if (zoneQuery.error) {
      console.warn('Unable to load zone settings, using default count.', zoneQuery.error);
    }

    const zoneRecord = Array.isArray(zoneQuery.data) ? zoneQuery.data[0] : zoneQuery.data || null;
    const groupedOfficials = mapSupabaseOfficials(officialsData || []);

    setZoneSettingsId(zoneRecord?.id || null);
    setSecretaryPresent(typeof zoneRecord?.secretary_present === 'boolean' ? zoneRecord.secretary_present : true);
    setData(prev => ({
      ...prev,
      zonesCount: extractZonesCount(zoneRecord),
      officials: groupedOfficials,
    }));
  }, [supabase, barangayId]);

  useEffect(() => {
    let ignore = false;
    async function bootstrap() {
      setLoading(true);
      setErrorMessage('');
      try {
        await fetchFromSupabase();
      } catch (error) {
        if (ignore) return;
        console.error('Failed to load barangay info', error);
        setErrorMessage('Unable to load barangay info from Supabase. Please try again.');
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    bootstrap();
    return () => {
      ignore = true;
    };
  }, [fetchFromSupabase]);

  async function handleRetry() {
    setLoading(true);
    setErrorMessage('');
    try {
      await fetchFromSupabase();
    } catch (error) {
      console.error('Retry failed', error);
      setErrorMessage('Unable to load barangay info from Supabase. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function persistZonesCount(nextValue) {
    setZoneSaving(true);
    try {
      if (zoneSettingsId) {
        const { error } = await supabase
          .from(ZONE_SETTINGS_TABLE)
          .update({ zones_count: nextValue })
          .eq('id', zoneSettingsId);
        if (error) throw error;
      } else {
        const { data: insertedRow, error } = await supabase
          .from(ZONE_SETTINGS_TABLE)
          .insert({ zones_count: nextValue, barangay_id: barangayId })
          .select()
          .single();
        if (error) throw error;
        setZoneSettingsId(insertedRow?.id || null);
      }
    } catch (error) {
      console.error('Failed to save zones count', error);
      addToast('Saving the zone count failed. Please try again.', 'error');
    } finally {
      setZoneSaving(false);
    }
  }

  function applyZoneCount(nextValue) {
    setData(prev => ({ ...prev, zonesCount: nextValue }));
    persistZonesCount(nextValue);
  }

  async function persistSecretaryPresence(nextValue) {
    if (!barangayId) return;
    setSecretarySaving(true);
    try {
      if (zoneSettingsId) {
        const { error } = await supabase
          .from(ZONE_SETTINGS_TABLE)
          .update({ secretary_present: nextValue })
          .eq('id', zoneSettingsId);
        if (error) throw error;
      } else {
        const { data: insertedRow, error } = await supabase
          .from(ZONE_SETTINGS_TABLE)
          .insert({
            zones_count: zonesCount,
            secretary_present: nextValue,
            barangay_id: barangayId,
          })
          .select('id')
          .single();
        if (error) throw error;
        setZoneSettingsId(insertedRow?.id || null);
      }
      setSecretaryPresent(nextValue);
      addToast(`Secretary marked as ${nextValue ? 'present' : 'absent'}.`, 'success');
    } catch (error) {
      console.error('Failed to save secretary status', error);
      addToast('Unable to update secretary availability right now.', 'error');
    } finally {
      setSecretarySaving(false);
    }
  }

  function handleZoneInputChange(event) {
    const nextValue = event.target.value;
    if (!/^[0-9]*$/.test(nextValue)) {
      return;
    }
    setZoneInput(nextValue);
    if (!nextValue) {
      return;
    }
    const numeric = Number(nextValue);
    if (Number.isFinite(numeric) && numeric > 0) {
      applyZoneCount(Math.floor(numeric));
    }
  }

  function handleZoneInputBlur() {
    if (!zoneInput) {
      setZoneInput(String(DEFAULT_ZONES_COUNT));
      if (data.zonesCount !== DEFAULT_ZONES_COUNT) {
        applyZoneCount(DEFAULT_ZONES_COUNT);
      }
      return;
    }
    const numeric = Number(zoneInput);
    const fallback = Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : DEFAULT_ZONES_COUNT;
    const normalized = String(fallback);
    setZoneInput(normalized);
    if (data.zonesCount !== fallback) {
      applyZoneCount(fallback);
    }
  }

  function openAddModal(groupKey) {
    setModalState({ open: true, groupKey, targetId: null });
  }

  function openEditModal(groupKey, officialId) {
    setModalState({ open: true, groupKey, targetId: officialId });
  }

  function closeModal() {
    setModalState({ open: false, groupKey: null, targetId: null });
  }

  async function handleSaveOfficial(payload) {
    if (!currentGroup) return;
    if (!modalState.targetId) {
      const existingCount = (officials[currentGroup.key] || []).length;
      if (existingCount >= currentGroup.limit) {
        addToast(`All ${currentGroup.limit} slot(s) for ${currentGroup.label} are already filled.`, 'warning');
        return;
      }
    }

    setSavingOfficial(true);
    try {
      if (modalState.targetId) {
        const { data: updatedRow, error } = await supabase
          .from(OFFICIALS_TABLE)
          .update({
            name: payload.name,
            email: payload.email || null,
            contact_number: payload.contactNumber || null,
            alternate_title: payload.alternateTitle || null,
          })
          .eq('id', modalState.targetId)
          .select()
          .single();
        if (error) throw error;
        const normalized = normalizeOfficialRecord(updatedRow, currentGroup.key);
        if (normalized) {
          setData(prev => {
            const nextOfficials = { ...prev.officials };
            const currentList = nextOfficials[currentGroup.key] || [];
            nextOfficials[currentGroup.key] = currentList.map(entry =>
              entry.id === modalState.targetId ? normalized.entry : entry,
            );
            return { ...prev, officials: nextOfficials };
          });
        }
      } else {
        const { data: insertedRow, error } = await supabase
          .from(OFFICIALS_TABLE)
          .insert({
            role: currentGroup.key,
            name: payload.name,
            email: payload.email || null,
            contact_number: payload.contactNumber || null,
            alternate_title: payload.alternateTitle || null,
            barangay_id: barangayId,
          })
          .select()
          .single();
        if (error) throw error;
        const normalized = normalizeOfficialRecord(insertedRow, currentGroup.key);
        if (normalized) {
          setData(prev => {
            const nextOfficials = { ...prev.officials };
            const currentList = nextOfficials[currentGroup.key] || [];
            nextOfficials[currentGroup.key] = [...currentList, normalized.entry];
            return { ...prev, officials: nextOfficials };
          });
        }
      }
      closeModal();
      addToast('Official saved successfully.', 'success');
    } catch (error) {
      console.error('Failed to save official', error);
      addToast('Unable to save the official record. Please try again.', 'error');
    } finally {
      setSavingOfficial(false);
    }
  }

  function requestDelete(groupKey, entry) {
    setPendingDelete({ groupKey, entry });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase
        .from(OFFICIALS_TABLE)
        .delete()
        .eq('id', pendingDelete.entry.id);
      if (error) throw error;
      setData(prev => {
        const nextOfficials = { ...prev.officials };
        const items = nextOfficials[pendingDelete.groupKey] || [];
        nextOfficials[pendingDelete.groupKey] = items.filter(item => item.id !== pendingDelete.entry.id);
        return { ...prev, officials: nextOfficials };
      });
      setPendingDelete(null);
      addToast('Official deleted successfully.', 'success');
    } catch (error) {
      console.error('Failed to delete official', error);
      addToast('Unable to delete this official right now. Please try again.', 'error');
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault();
    const trimmedPassword = passwordForm.newPassword.trim();

    if (trimmedPassword.length < 8) {
      addToast('New password must be at least 8 characters.', 'warning');
      return;
    }
    if (trimmedPassword !== passwordForm.confirmPassword.trim()) {
      addToast('Password confirmation does not match.', 'warning');
      return;
    }

    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: trimmedPassword });
    setPasswordSaving(false);

    if (error) {
      addToast(`Password update failed: ${error.message}`, 'error');
      return;
    }

    setPasswordForm({ newPassword: '', confirmPassword: '' });
    addToast('Password updated successfully.', 'success');
  }

  const editingRecord = modalState.targetId
    ? officials[modalState.groupKey]?.find(item => item.id === modalState.targetId)
    : null;

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg flex flex-col gap-4">
        <div className="text-left">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">Barangay Records</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">{barangayName ? `Barangay ${barangayName}` : 'Barangay Information'}</h2>
          <p className="mt-2 text-sm text-slate-600">
            Keep officials and zone settings current for forms, dashboards, and resident records.
          </p>
        </div>
      </section>

      {errorMessage && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            className="rounded-full border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed"
            onClick={handleRetry}
            disabled={loading}
          >
            {loading ? 'Syncing...' : 'Retry sync'}
          </button>
        </div>
      )}

      <div className="space-y-6">
        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-left">
            <p className="text-xs uppercase tracking-widest text-purple-500 font-semibold">Kiosk Queue</p>
            <h3 className="text-lg font-bold text-gray-900">Secretary desk status</h3>
            <p className="text-[12px] text-gray-500">
              {secretaryPresent
                ? 'Kiosk will show queue numbers and route residents to the secretary desk.'
                : 'Kiosk will skip queue numbers and ask residents to wait for text updates.'}
            </p>
          </div>
          <button
            type="button"
            className={`rounded-full px-5 py-2 text-sm font-semibold shadow-sm ${secretaryPresent ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-amber-500 text-white hover:bg-amber-400'} disabled:cursor-not-allowed disabled:opacity-70`}
            onClick={() => persistSecretaryPresence(!secretaryPresent)}
            disabled={secretarySaving || loading}
          >
            {secretarySaving ? 'Saving...' : secretaryPresent ? 'Secretary: Present' : 'Secretary: Absent'}
          </button>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-6">
          <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg space-y-6">
            <div className="text-left">
              <p className="text-xs uppercase tracking-widest text-purple-500 font-semibold">Officials</p>
              <h3 className="text-xl font-bold text-gray-900">Barangay Leadership Roster</h3>
              {loading && <p className="text-xs text-gray-500">Syncing with Supabase...</p>}
            </div>

          <div className="space-y-5">
            {OFFICIAL_GROUPS.map(group => {
              const entries = officials[group.key] || [];
              const remaining = group.limit - entries.length;
              const isAtLimit = remaining <= 0;
              return (
                <div key={group.key} className="rounded-2xl border border-gray-100 p-5 bg-white shadow-sm space-y-2">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900">{group.label}</p>
                      <p className="text-xs text-gray-500">{group.blurb}</p>
                    </div>
                    <button
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm ${isAtLimit ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-500'} ${loading ? 'opacity-70' : ''}`}
                      onClick={() => (isAtLimit || loading ? null : openAddModal(group.key))}
                      disabled={isAtLimit || loading}
                    >
                      {isAtLimit ? 'Slots filled' : 'Add official'}
                    </button>
                  </div>
                  {!entries.length ? (
                    <p className="text-sm text-gray-500">
                      No records yet. Use the button above to add {group.limit === 1 ? 'the' : 'a'} {group.label.toLowerCase()}.
                    </p>
                  ) : (
                    <ul className="mt-2 divide-y divide-gray-100">
                      {entries.map(entry => (
                        <li key={entry.id} className="py-3 text-left">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{entry.name}</p>
                              {entry.alternateTitle && (
                                <p className="text-xs text-purple-600 font-medium">{entry.alternateTitle}</p>
                              )}
                              {entry.email && <p className="text-xs text-gray-500">{entry.email}</p>}
                              {(entry.contactNumber || entry.contact) && (
                                <p className="text-[11px] text-gray-400">{entry.contactNumber || entry.contact}</p>
                              )}
                            </div>
                            <div className="flex gap-3 text-xs font-semibold self-start md:self-auto">
                              <button
                                type="button"
                                className="text-blue-600 hover:text-blue-700"
                                onClick={() => openEditModal(group.key, entry.id)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="text-red-500 hover:text-red-600"
                                onClick={() => requestDelete(group.key, entry)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>

          <section className="space-y-6">
          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg space-y-4">
            <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Profile</p>
            <h3 className="text-lg font-bold text-gray-900">Security settings</h3>
            <p className="text-sm text-gray-600">Update your admin password from inside the dashboard.</p>
            <form className="space-y-3" onSubmit={handlePasswordUpdate}>
              <label className="block text-sm font-semibold text-gray-700">
                New password
                <input
                  type="password"
                  className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                  value={passwordForm.newPassword}
                  onChange={event => setPasswordForm(prev => ({ ...prev, newPassword: event.target.value }))}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <label className="block text-sm font-semibold text-gray-700">
                Confirm new password
                <input
                  type="password"
                  className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                  value={passwordForm.confirmPassword}
                  onChange={event => setPasswordForm(prev => ({ ...prev, confirmPassword: event.target.value }))}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={passwordSaving}
              >
                {passwordSaving ? 'Updating password...' : 'Update password'}
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg space-y-4">
            <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Session</p>
            <h3 className="text-lg font-bold text-gray-900">Sign out admin access</h3>
            <p className="text-sm text-gray-600">Moving to a different workstation? Log out here to keep the kiosk secure.</p>
            <button
              type="button"
              className="w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-red-500"
              onClick={onLogout}
            >
              Logout of admin mode
            </button>
          </div>
          </section>
        </div>
      </div>

      <OfficialModal
        open={modalState.open}
        group={currentGroup}
        initialData={editingRecord}
        onClose={closeModal}
        onSave={handleSaveOfficial}
        loading={savingOfficial}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove official?"
        description={pendingDelete ? `${pendingDelete.entry.name} will be removed from ${
          OFFICIAL_GROUPS.find(group => group.key === pendingDelete.groupKey)?.label || 'this list'
        }.` : ''}
        confirmLabel="Delete"
        tone="danger"
        loading={deleteLoading}
        onConfirm={confirmDelete}
        onCancel={() => (deleteLoading ? null : setPendingDelete(null))}
      />
    </div>
  );
}
