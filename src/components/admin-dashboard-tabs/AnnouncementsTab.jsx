import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import AnnouncementModal from './AnnouncementModal';

const STORAGE_KEY_PREFIX = 'sbk-announcements-v1';

function getStorageKey(barangayId) {
  return barangayId ? `${STORAGE_KEY_PREFIX}-${barangayId}` : STORAGE_KEY_PREFIX;
}

const STATUS_META = {
  upcoming: { label: 'Upcoming', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  ongoing: { label: 'Live now', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  ended: { label: 'Ended', className: 'bg-gray-100 text-gray-600 border border-gray-200' },
};

function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function mapFromSupabase(record) {
  return {
    id: record.id,
    title: record.title || '',
    description: record.description || '',
    startDate: record.start_date,
    endDate: record.end_date,
    imageData: record.image_data ?? null,
    hasImage: record.has_image ?? Boolean(record.image_data),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function mapToSupabase(values) {
  return {
    title: values.title?.trim() || '',
    start_date: values.startDate,
    end_date: values.endDate,
    description: normalizeText(values.description),
    image_data: values.imageData || null,
  };
}

function normalizeDate(value) {
  if (!value) return null;
  const reference = new Date(value);
  return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
}

function describeRange(startDate, endDate) {
  if (!startDate || !endDate) return 'Unscheduled';
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  const startLabel = new Date(startDate).toLocaleDateString('en-PH', options);
  const endLabel = new Date(endDate).toLocaleDateString('en-PH', options);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

function resolveStatus(announcement, today) {
  const start = normalizeDate(announcement.startDate);
  const end = normalizeDate(announcement.endDate);
  if (!start || !end) return 'upcoming';
  if (today < start) return 'upcoming';
  if (today > end) return 'ended';
  return 'ongoing';
}

export default function AnnouncementsTab({ barangayId }) {
  const supabase = useSupabase();
  const { addToast } = useToast();
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const [announcements, setAnnouncements] = useState([]);

  const [modalState, setModalState] = useState({ open: false, mode: 'create', target: null });
  const [pendingDelete, setPendingDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    if (!barangayId) return;
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('announcements')
      .select('id, title, description, start_date, end_date, created_at, updated_at')
      .eq('barangay_id', barangayId)
      .order('start_date', { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setAnnouncements((data || []).map(row => ({
        ...mapFromSupabase(row),
        imageData: null,
        hasImage: false,
      })));
    }
    setLoading(false);
  }, [supabase, barangayId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadAnnouncements();
    }, 0);
    return () => clearTimeout(timeout);
  }, [loadAnnouncements]);

  useEffect(() => {
    if (!barangayId) return;
    const key = getStorageKey(barangayId);
    window.localStorage.setItem(key, JSON.stringify(announcements));
  }, [announcements, barangayId]);

  const decoratedAnnouncements = useMemo(() => {
    return announcements.map(item => ({ ...item, status: resolveStatus(item, today) }));
  }, [announcements, today]);

  const upcomingFeed = useMemo(() => {
    return decoratedAnnouncements
      .filter(item => item.status !== 'ended')
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }, [decoratedAnnouncements]);

  const endedLog = useMemo(() => {
    return decoratedAnnouncements
      .filter(item => item.status === 'ended')
      .sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
  }, [decoratedAnnouncements]);

  const liveCount = upcomingFeed.filter(item => item.status === 'ongoing').length;

  function closeModal() {
    setModalState({ open: false, mode: 'create', target: null });
  }

  function handleCreate() {
    setModalState({ open: true, mode: 'create', target: null });
  }

  async function handleEdit(announcement) {
    // Lazy-load image_data only when editing a single announcement
    let target = announcement;
    if (!announcement.imageData) {
      const { data } = await supabase
        .from('announcements')
        .select('image_data')
        .eq('id', announcement.id)
        .single();
      if (data?.image_data) {
        target = { ...announcement, imageData: data.image_data, hasImage: true };
        setAnnouncements(prev =>
          prev.map(item => (item.id === announcement.id ? { ...item, imageData: data.image_data, hasImage: true } : item)),
        );
      }
    }
    setModalState({ open: true, mode: 'edit', target });
  }

  function requestDelete(announcement) {
    setPendingDelete({ id: announcement.id, title: announcement.title });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    const { error: deleteError } = await supabase
      .from('announcements')
      .delete()
      .eq('id', pendingDelete.id);
    setDeleteBusy(false);
    if (deleteError) {
      addToast(`Failed to remove announcement: ${deleteError.message}`, 'error');
      return;
    }
    setAnnouncements(prev => prev.filter(item => item.id !== pendingDelete.id));
    setPendingDelete(null);
    addToast('Announcement deleted.', 'success');
  }

  async function handleSave(formValues) {
    if (modalState.mode === 'edit' && modalState.target) {
      const { data, error: updateError } = await supabase
        .from('announcements')
        .update(mapToSupabase(formValues))
        .eq('id', modalState.target.id)
        .select()
        .single();
      if (updateError) {
        addToast(`Failed to save changes: ${updateError.message}`, 'error');
        throw updateError;
      }
      setAnnouncements(prev =>
        prev.map(item => (item.id === modalState.target.id ? mapFromSupabase(data) : item)),
      );
      addToast('Announcement updated.', 'success');
    } else {
      const { data, error: insertError } = await supabase
        .from('announcements')
        .insert({ ...mapToSupabase(formValues), barangay_id: barangayId })
        .select()
        .single();
      if (insertError) {
        addToast(`Failed to add announcement: ${insertError.message}`, 'error');
        throw insertError;
      }
      setAnnouncements(prev => [...prev, mapFromSupabase(data)]);
      addToast('Announcement created.', 'success');
    }
    closeModal();
  }

  function renderAnnouncementCard(item) {
    const meta = STATUS_META[item.status];
    return (
      <li
        key={item.id}
        className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
            {item.imageData ? (
              <img src={item.imageData} alt={item.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-center text-[11px] text-gray-400 px-2">
                No image
              </div>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-blue-500 font-semibold">{describeRange(item.startDate, item.endDate)}</p>
                <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
              </div>
              {meta && (
                <span className={`text-[11px] px-3 py-1 rounded-full font-semibold ${meta.className}`}>
                  {meta.label}
                </span>
              )}
            </div>
            {item.description && <p className="text-sm text-gray-600">{item.description}</p>}
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
              <button className="font-semibold text-blue-600 hover:text-blue-700" onClick={() => handleEdit(item)}>
                Edit
              </button>
              <button className="font-semibold text-red-500 hover:text-red-600" onClick={() => requestDelete(item)}>
                Delete
              </button>
              <span className="text-gray-400">Updated {new Date(item.updatedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">Community Updates</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Announcements</h2>
          <p className="mt-2 text-sm text-slate-600">
            Publish time-bound notices, manage active schedules, and archive completed campaigns.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600 whitespace-nowrap">
          Live now: <span className="ml-1 text-slate-900">{liveCount}</span>
        </div>
        <button
          type="button"
          className="rounded-full bg-(--sbk-accent) px-5 py-2 text-sm font-semibold text-white shadow hover:bg-(--sbk-accent-strong)"
          onClick={handleCreate}
        >
          + Add Announcement
        </button>
      </section>

      {loading ? (
        <p className="rounded-3xl border border-gray-100 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
          Loading announcements…
        </p>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 space-y-3">
          <p className="font-semibold">Unable to load announcements.</p>
          <p>{error}</p>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
            onClick={loadAnnouncements}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-6">
          <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="text-left">
                <p className="text-xs uppercase tracking-widest text-amber-500 font-semibold">Upcoming & Active</p>
                <h3 className="text-xl font-bold text-gray-900">Currently Scheduled</h3>
              </div>
              <span className="text-xs text-gray-400">{upcomingFeed.length} items</span>
            </div>
            {!upcomingFeed.length ? (
              <p className="mt-8 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
                Nothing on the calendar yet. Launch your first announcement to populate this feed.
              </p>
            ) : (
              <ul className="mt-6 space-y-4">{upcomingFeed.map(renderAnnouncementCard)}</ul>
            )}
          </section>

          <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="text-left">
                <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Log & Archives</p>
                <h3 className="text-xl font-bold text-gray-900">Already Ended</h3>
              </div>
              <span className="text-xs text-gray-400">{endedLog.length} records</span>
            </div>
            {!endedLog.length ? (
              <p className="mt-6 text-sm text-gray-500">Ended announcements will appear here automatically.</p>
            ) : (
              <ul className="mt-6 space-y-4">
                {endedLog.map(item => (
                  <li key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <p className="font-semibold text-gray-800">{item.title}</p>
                      <span className="text-xs text-gray-500">Ended {new Date(item.endDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <p className="text-xs text-gray-500">{describeRange(item.startDate, item.endDate)}</p>
                    {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                    <div className="flex gap-3 text-[11px] text-blue-600">
                      <button className="hover:underline" onClick={() => handleEdit(item)}>Re-run / Edit</button>
                      <button className="text-red-500 hover:underline" onClick={() => requestDelete(item)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <AnnouncementModal
        open={modalState.open}
        mode={modalState.mode}
        initialData={modalState.target}
        onClose={closeModal}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove announcement?"
        description={pendingDelete ? `"${pendingDelete.title}" will be permanently deleted.` : ''}
        confirmLabel="Delete"
        tone="danger"
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
