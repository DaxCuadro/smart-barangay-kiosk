import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import ResidentModal from './ResidentModal';

const AGE_FILTER_OPTIONS = [
  { value: 'all', label: 'All ages' },
  { value: 'minor', label: 'Minor (under 18)' },
  { value: 'adult', label: 'Adult (18-59)' },
  { value: 'senior', label: 'Senior (60+)' },
];

const AGE_SEGMENTS = [
  { key: 'child', label: 'Children (0-12)', min: 0, max: 12, accent: 'bg-amber-400' },
  { key: 'teen', label: 'Teens (13-17)', min: 13, max: 17, accent: 'bg-orange-400' },
  { key: 'adult', label: 'Working-age (18-59)', min: 18, max: 59, accent: 'bg-blue-500' },
  { key: 'senior', label: 'Senior (60+)', min: 60, max: 150, accent: 'bg-emerald-500' },
];

const ZONE_SETTINGS_TABLE = 'barangay_zone_settings';

function toFormValue(value) {
  if (value === null || value === undefined) return '';
  return value;
}

function toNullableText(value) {
  if (value === null || value === undefined) return null;
  const trimmed = typeof value === 'string' ? value.trim() : value;
  return trimmed === '' ? null : trimmed;
}

function mapFromSupabase(record) {
  return {
    id: record.id,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    lastName: toFormValue(record.last_name),
    firstName: toFormValue(record.first_name),
    middleName: toFormValue(record.middle_name),
    sex: toFormValue(record.sex),
    civilStatus: toFormValue(record.civil_status),
    birthday: toFormValue(record.birthday),
    birthplace: toFormValue(record.birthplace),
    address: toFormValue(record.address),
    occupation: toFormValue(record.occupation),
    education: toFormValue(record.education),
    religion: toFormValue(record.religion),
    email: toFormValue(record.email),
    telephone: toFormValue(record.telephone),
    zone: normalizeZoneValue(record.zone ?? record.purok ?? extractZoneFromAddress(record.address)),
  };
}

function mapToSupabase(values) {
  return {
    last_name: toNullableText(values.lastName),
    first_name: toNullableText(values.firstName),
    middle_name: toNullableText(values.middleName),
    sex: toNullableText(values.sex),
    civil_status: toNullableText(values.civilStatus),
    birthday: values.birthday || null,
    birthplace: toNullableText(values.birthplace),
    address: toNullableText(values.address),
    occupation: toNullableText(values.occupation),
    education: toNullableText(values.education),
    religion: toNullableText(values.religion),
    email: toNullableText(values.email),
    telephone: toNullableText(values.telephone),
  };
}

function computeAge(birthday) {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function ageMatchesFilter(age, filter) {
  if (filter === 'all') return true;
  if (age === null) return false;
  if (filter === 'minor') return age < 18;
  if (filter === 'adult') return age >= 18 && age <= 59;
  if (filter === 'senior') return age >= 60;
  return true;
}

function formatFullName(resident) {
  const middleInitial = resident.middleName ? ` ${resident.middleName[0].toUpperCase()}.` : '';
  return `${resident.lastName}, ${resident.firstName}${middleInitial}`.trim();
}

function formatBirthday(date) {
  if (!date) return 'N/A';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeCsv(value) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function extractZoneFromAddress(value) {
  if (typeof value !== 'string') return '';
  const match = value.match(/(?:zone|purok)\s+(\d+)/i);
  return match ? match[1] : '';
}

function normalizeZoneValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return text;
}

export default function ResidentsTab({ barangayId }) {
  const supabase = useSupabase();
  const { addToast } = useToast();
  const [residents, setResidents] = useState([]);
  const [searchValue, setSearchValue] = useState('');
  const [modalState, setModalState] = useState({ open: false, mode: 'create', target: null });
  const [ageFilter, setAgeFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [zoneFilter, setZoneFilter] = useState('all');
  const [zoneCount, setZoneCount] = useState(1);
  const demographicsRef = useRef(null);

  const applyZoneCount = useCallback(nextValue => {
    setZoneCount(nextValue);
    setZoneFilter(prev => {
      if (prev === 'all') return prev;
      const numeric = Number(prev);
      return Number.isFinite(numeric) && numeric <= nextValue ? prev : 'all';
    });
  }, []);

  const loadResidents = useCallback(async () => {
    if (!barangayId) return;
    setLoading(true);
    setError(null);
    const [residentsResponse, zoneResponse] = await Promise.all([
      supabase
        .from('residents')
        .select('*')
        .eq('barangay_id', barangayId)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true }),
      supabase
        .from(ZONE_SETTINGS_TABLE)
        .select('zones_count')
        .eq('barangay_id', barangayId)
        .order('id', { ascending: false })
        .limit(1),
    ]);

    if (residentsResponse.error) {
      setError(residentsResponse.error.message);
      setResidents([]);
    } else {
      setResidents((residentsResponse.data || []).map(mapFromSupabase));
    }

    if (zoneResponse.error) {
      console.warn('Unable to load zone count, defaulting to 1.', zoneResponse.error);
      applyZoneCount(1);
    } else {
      const record = Array.isArray(zoneResponse.data) ? zoneResponse.data[0] : zoneResponse.data;
      const numeric = Number(record?.zones_count);
      applyZoneCount(Number.isFinite(numeric) && numeric > 0 ? numeric : 1);
    }

    setLoading(false);
  }, [supabase, applyZoneCount, barangayId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadResidents();
    }, 0);
    return () => clearTimeout(timeout);
  }, [loadResidents]);

  const filteredResidents = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return residents
      .filter(resident => {
        if (!query) return true;
        const haystack = [
          resident.firstName,
          resident.lastName,
          resident.middleName,
          resident.address,
          resident.occupation,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .filter(resident => ageMatchesFilter(computeAge(resident.birthday), ageFilter))
      .filter(resident => (zoneFilter === 'all' ? true : resident.zone === zoneFilter))
      .sort((a, b) => {
        const last = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' });
        if (last !== 0) return last;
        return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
      });
  }, [residents, searchValue, ageFilter, zoneFilter]);

  const stats = useMemo(() => {
    const total = residents.length;
    const male = residents.filter(resident => resident.sex === 'Male').length;
    const female = residents.filter(resident => resident.sex === 'Female').length;
    const averageAge = residents.length
      ? Math.round(
          residents.reduce((sum, resident) => {
            const age = computeAge(resident.birthday);
            return sum + (typeof age === 'number' ? age : 0);
          }, 0) / residents.length,
        )
      : 0;
    return { total, male, female, averageAge: Number.isNaN(averageAge) ? 0 : averageAge };
  }, [residents]);

  const ageDistribution = useMemo(() => {
    const template = AGE_SEGMENTS.map(segment => ({ ...segment, count: 0, percent: 0 }));
    let known = 0;
    residents.forEach(resident => {
      const age = computeAge(resident.birthday);
      if (typeof age !== 'number') return;
      if (age < 0) return;
      known += 1;
      const target = template.find(segment => age >= segment.min && age <= segment.max);
      if (target) {
        target.count += 1;
      }
    });
    template.forEach(segment => {
      segment.percent = known ? Math.round((segment.count / known) * 100) : 0;
    });
    return {
      segments: template,
      known,
      unknown: residents.length - known,
    };
  }, [residents]);

  function closeModal() {
    setModalState({ open: false, mode: 'create', target: null });
  }

  function handleCreate() {
    setModalState({ open: true, mode: 'create', target: null });
  }

  function handleEdit(resident) {
    setModalState({ open: true, mode: 'edit', target: resident });
  }

  function handleDeleteRequest(resident) {
    setPendingDelete({ id: resident.id, name: formatFullName(resident) });
  }

  async function confirmResidentDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    let linkedUserId = null;
    const { data: profileRow, error: profileLookupError } = await supabase
      .from('resident_profiles')
      .select('user_id')
      .eq('resident_id', pendingDelete.id)
      .maybeSingle();
    if (profileLookupError) {
      setDeleteBusy(false);
      addToast(`Failed to locate linked account: ${profileLookupError.message}`, 'error');
      return;
    }
    if (profileRow?.user_id) {
      linkedUserId = profileRow.user_id;
    }

    if (!linkedUserId) {
      const { data: verificationRow } = await supabase
        .from('resident_verification_requests')
        .select('user_id')
        .eq('resident_id', pendingDelete.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      linkedUserId = verificationRow?.user_id || null;
    }

    if (linkedUserId) {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || '';
      if (sessionError || !accessToken) {
        setDeleteBusy(false);
        addToast('Failed to delete auth account: Admin session not found.', 'error');
        return;
      }

      const { error: deleteUserError } = await supabase.functions.invoke('delete_user', {
        body: { user_id: linkedUserId },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (deleteUserError) {
        setDeleteBusy(false);
        const extra = deleteUserError.context ? ` (${JSON.stringify(deleteUserError.context)})` : '';
        addToast(`Failed to delete auth account: ${deleteUserError.message}${extra}`, 'error');
        return;
      }
    }

    const { error: profileDeleteError } = await supabase
      .from('resident_profiles')
      .delete()
      .eq('resident_id', pendingDelete.id);
    if (profileDeleteError) {
      setDeleteBusy(false);
      addToast(`Failed to delete linked account: ${profileDeleteError.message}`, 'error');
      return;
    }

    const { error: verificationDeleteError } = await supabase
      .from('resident_verification_requests')
      .delete()
      .eq('resident_id', pendingDelete.id);
    if (verificationDeleteError) {
      setDeleteBusy(false);
      addToast(`Failed to delete verification requests: ${verificationDeleteError.message}`, 'error');
      return;
    }

    const { error: deleteError } = await supabase.from('residents').delete().eq('id', pendingDelete.id);
    setDeleteBusy(false);
    if (deleteError) {
      addToast(`Failed to delete resident: ${deleteError.message}`, 'error');
      return;
    }
    setResidents(prev => prev.filter(resident => resident.id !== pendingDelete.id));
    setPendingDelete(null);
    addToast('Resident deleted successfully.', 'success');
  }

  async function handleSave(values) {
    if (modalState.mode === 'edit' && modalState.target) {
      const { data, error: updateError } = await supabase
        .from('residents')
        .update(mapToSupabase(values))
        .eq('id', modalState.target.id)
        .select()
        .single();
      if (updateError) {
        addToast(`Failed to save changes: ${updateError.message}`, 'error');
        return;
      }
      setResidents(prev =>
        prev.map(resident => (resident.id === modalState.target.id ? mapFromSupabase(data) : resident)),
      );
      addToast('Resident updated successfully.', 'success');
    } else {
      const { data, error: insertError } = await supabase
        .from('residents')
        .insert({ ...mapToSupabase(values), barangay_id: barangayId })
        .select()
        .single();
      if (insertError) {
        addToast(`Failed to add resident: ${insertError.message}`, 'error');
        return;
      }
      setResidents(prev => [...prev, mapFromSupabase(data)]);
      addToast('Resident added successfully.', 'success');
    }
    closeModal();
  }

  function toggleExpanded(id) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  function handleDemographicsReveal() {
    const target = demographicsRef.current;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleExportCsv() {
    const rows = [
      [
        'Last Name',
        'First Name',
        'Middle Name',
        'Sex',
        'Civil Status',
        'Birthday',
        'Age',
        'Birthplace',
        'Address',
        'Zone',
        'Occupation',
        'Education',
        'Religion',
        'Email',
        'Telephone',
      ],
      ...filteredResidents.map(resident => {
        const age = computeAge(resident.birthday);
        return [
          resident.lastName,
          resident.firstName,
          resident.middleName,
          resident.sex,
          resident.civilStatus,
          resident.birthday,
          age === null ? '' : age,
          resident.birthplace,
          resident.address,
          resident.zone,
          resident.occupation,
          resident.education,
          resident.religion,
          resident.email,
          resident.telephone,
        ];
      }),
    ];

    const csv = `\uFEFF${rows.map(row => row.map(escapeCsv).join(',')).join('\n')}`;
    downloadTextFile('residents-export.csv', csv, 'text/csv;charset=utf-8');
    addToast('CSV export generated.', 'success');
  }

  function handleExportExcel() {
    const rows = [
      [
        'Last Name',
        'First Name',
        'Middle Name',
        'Sex',
        'Civil Status',
        'Birthday',
        'Age',
        'Birthplace',
        'Address',
        'Zone',
        'Occupation',
        'Education',
        'Religion',
        'Email',
        'Telephone',
      ],
      ...filteredResidents.map(resident => {
        const age = computeAge(resident.birthday);
        return [
          resident.lastName,
          resident.firstName,
          resident.middleName,
          resident.sex,
          resident.civilStatus,
          resident.birthday,
          age === null ? '' : age,
          resident.birthplace,
          resident.address,
          resident.zone,
          resident.occupation,
          resident.education,
          resident.religion,
          resident.email,
          resident.telephone,
        ];
      }),
    ];

    const tabSeparated = `\uFEFF${rows.map(row => row.map(value => value ?? '').join('\t')).join('\n')}`;
    downloadTextFile('residents-export.xls', tabSeparated, 'application/vnd.ms-excel;charset=utf-8');
    addToast('Excel-compatible export generated.', 'success');
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">Resident Directory</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Manage Residents</h2>
          <p className="mt-2 text-sm text-slate-600">
            Maintain verified resident records and keep household details ready for kiosk and remote services.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 whitespace-nowrap">
          Total Records: <span className="ml-1 text-slate-900">{stats.total}</span>
        </div>
        <button
          type="button"
          className="rounded-full bg-(--sbk-accent) px-5 py-2 text-sm font-semibold text-white shadow hover:bg-(--sbk-accent-strong)"
          onClick={handleCreate}
        >
          + Add Resident
        </button>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-6">
        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg space-y-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-blue-500 font-semibold">{/*Directory*/}</p>
                <h3 className="text-xl font-semibold text-gray-900">Registered Residents</h3>
              </div>
              <div className="flex flex-wrap items-center gap-3 lg:gap-4">
                <input
                  type="search"
                  value={searchValue}
                  onChange={event => setSearchValue(event.target.value)}
                  placeholder="Search by name"
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                />
                <select
                  value={ageFilter}
                  onChange={event => setAgeFilter(event.target.value)}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  {AGE_FILTER_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={zoneFilter}
                  onChange={event => setZoneFilter(event.target.value)}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  <option value="all">All zones</option>
                  {Array.from({ length: zoneCount }, (_, index) => String(index + 1)).map(option => (
                    <option key={option} value={option}>
                      Zone {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button
                type="button"
                className="rounded-full border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                onClick={handleDemographicsReveal}
              >
                View demographics
              </button>
              <button
                type="button"
                className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                onClick={handleExportCsv}
              >
                Export CSV
              </button>
              <button
                type="button"
                className="rounded-full border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                onClick={handleExportExcel}
              >
                Export Excel
              </button>
            </div>
          </div>

          {loading ? (
            <p className="rounded-2xl border border-gray-100 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
              Loading residents…
            </p>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-6 text-sm text-red-700 space-y-3">
              <p className="font-semibold">Unable to load residents.</p>
              <p>{error}</p>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                onClick={loadResidents}
              >
                Retry
              </button>
            </div>
          ) : !filteredResidents.length ? (
            <p className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
              No resident records yet. Start by adding your first profile.
            </p>
          ) : (
            <div className="rounded-2xl border border-gray-100">
              <div className="max-h-130 overflow-y-auto pr-2">
                <ul className="divide-y divide-gray-100">
                  {filteredResidents.map(resident => {
                    const age = computeAge(resident.birthday);
                    const isExpanded = expandedId === resident.id;
                    return (
                      <li key={resident.id} className="py-4 px-2">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-semibold text-gray-900">{formatFullName(resident)}</h4>
                            {resident.sex && (
                              <span
                                className={`text-[11px] rounded-full border px-3 py-0.5 ${
                                  resident.sex === 'Female'
                                    ? 'border-red-200 bg-red-50 text-red-700'
                                    : resident.sex === 'Male'
                                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                                      : 'border-gray-200 bg-gray-50 text-gray-600'
                                }`}
                              >
                                {resident.sex}
                              </span>
                            )}
                            {age !== null && (
                              <span className="text-[11px] rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-emerald-700">
                                {age} yrs
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                            <button
                              type="button"
                              className="rounded-full border border-gray-200 px-3 py-1 text-gray-600 hover:bg-gray-50"
                              onClick={() => toggleExpanded(resident.id)}
                              aria-label={`${isExpanded ? 'Hide' : 'Expand'} details for ${formatFullName(resident)}`}
                            >
                              {isExpanded ? 'Hide details' : 'Expand'}
                            </button>
                            <button
                              type="button"
                              className="text-blue-600 hover:text-blue-700"
                              onClick={() => handleEdit(resident)}
                              aria-label={`Edit ${formatFullName(resident)}`}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => handleDeleteRequest(resident)}
                              aria-label={`Delete ${formatFullName(resident)}`}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="mt-3 border-t border-gray-100 pt-3">
                            <div className="grid gap-4 md:grid-cols-3 text-sm">
                              <div className="space-y-1 border-b border-gray-100 pb-3 md:border-none md:pb-0">
                                <p className="text-xs uppercase tracking-wide text-gray-400">Birthday / Age</p>
                                <p className="text-gray-700">
                                  {formatBirthday(resident.birthday)}{' '}
                                  {age !== null && <span className="text-gray-500">({age})</span>}
                                </p>
                              </div>
                              <div className="space-y-1 border-b border-gray-100 pb-3 md:border-none md:pb-0">
                                <p className="text-xs uppercase tracking-wide text-gray-400">Zone / Address</p>
                                <p className="text-gray-700">{resident.address || 'N/A'}</p>
                              </div>
                              <div className="space-y-1 border-b border-gray-100 pb-3 md:border-none md:pb-0">
                                <p className="text-xs uppercase tracking-wide text-gray-400">Birthplace</p>
                                <p className="text-gray-700">{resident.birthplace || 'N/A'}</p>
                              </div>
                              <div className="space-y-1 border-b border-gray-100 pb-3 md:border-none md:pb-0">
                                <p className="text-xs uppercase tracking-wide text-gray-400">Occupation</p>
                                <p className="text-gray-700">{resident.occupation || 'N/A'}</p>
                              </div>
                              <div className="space-y-1 border-b border-gray-100 pb-3 md:border-none md:pb-0">
                                <p className="text-xs uppercase tracking-wide text-gray-400">Education</p>
                                <p className="text-gray-700">{resident.education || 'N/A'}</p>
                              </div>
                              <div className="space-y-1 border-b border-gray-100 pb-3 md:border-none md:pb-0">
                                <p className="text-xs uppercase tracking-wide text-gray-400">Religion</p>
                                <p className="text-gray-700">{resident.religion || 'N/A'}</p>
                              </div>
                              <div className="space-y-1 border-b border-gray-100 pb-3 md:border-none md:pb-0">
                                <p className="text-xs uppercase tracking-wide text-gray-400">Email Address</p>
                                <p className="text-gray-700 break-all">
                                  {resident.email ? (
                                    <a href={`mailto:${resident.email}`} className="text-blue-600 hover:underline">
                                      {resident.email}
                                    </a>
                                  ) : (
                                    'N/A'
                                  )}
                                </p>
                              </div>
                              <div className="space-y-1 border-b border-gray-100 pb-3 md:border-none md:pb-0">
                                <p className="text-xs uppercase tracking-wide text-gray-400">Telephone Number</p>
                                <p className="text-gray-700">{resident.telephone || 'N/A'}</p>
                              </div>
                              <div className="space-y-1 border-b border-gray-100 pb-3 md:border-none md:pb-0">
                                <p className="text-xs uppercase tracking-wide text-gray-400">Civil Status</p>
                                <p className="text-gray-700">{resident.civilStatus || 'N/A'}</p>
                              </div>
                            </div>
                            <p className="mt-3 text-xs text-gray-400">
                              Updated{' '}
                              {resident.updatedAt
                                ? new Date(resident.updatedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                                : 'N/A'}
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </section>

        <section ref={demographicsRef} className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg space-y-5">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">{/*Snapshot*/}</p>
            <h3 className="text-xl font-bold text-gray-900">Demographics</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-xs text-gray-500">Average age</p>
                <p className="text-2xl font-bold text-gray-900">{stats.averageAge || '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Male</p>
                <p className="text-lg font-semibold text-blue-600">{stats.male}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Female</p>
                <p className="text-lg font-semibold text-pink-500">{stats.female}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                <span>Age mix</span>
                <span>{ageDistribution.known} with birthday</span>
              </div>
              <div className="space-y-3">
                {ageDistribution.segments.map(segment => {
                  const width = segment.percent > 0 ? segment.percent : segment.count > 0 ? 4 : 0;
                  return (
                    <div key={segment.key} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600">
                        <span>{segment.label}</span>
                        <span>
                          {segment.count}{' '}
                          <span className="text-gray-400">({segment.percent}%)</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full ${segment.accent}`}
                          style={{ width: `${Math.min(width, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {ageDistribution.unknown > 0 && (
                <p className="text-[11px] text-gray-400">
                  {ageDistribution.unknown} record{ageDistribution.unknown === 1 ? '' : 's'} missing birthday.
                </p>
              )}
            </div>

            <p className="text-xs text-gray-500">
              These metrics refresh automatically whenever you add, edit, or delete records from the directory.
            </p>
          </div>
        </section>
      </div>

      {modalState.open && (
        <ResidentModal
          key={modalState.target?.id || 'new-resident'}
          mode={modalState.mode}
          initialData={modalState.target}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove resident record?"
        description={pendingDelete ? `${pendingDelete.name} will be permanently removed from the resident record.` : ''}
        confirmLabel="Delete"
        tone="danger"
        loading={deleteBusy}
        onConfirm={confirmResidentDelete}
        onCancel={() => (deleteBusy ? null : setPendingDelete(null))}
      />
    </div>
  );
}
