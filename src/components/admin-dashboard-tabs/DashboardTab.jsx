import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { SkeletonLine } from '../ui/Skeleton';

const ANNOUNCEMENT_STATUS_META = {
  upcoming: { label: 'Upcoming', pill: 'bg-amber-100 text-amber-700 border border-amber-200' },
  ongoing: { label: 'Live now', pill: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
};

const OFFICIAL_GROUPS = [
  { key: 'punong', label: 'Punong Barangay' },
  { key: 'sk', label: 'SK Chairperson' },
  { key: 'kagawad', label: 'Sangguniang Barangay Members' },
  { key: 'treasurer', label: 'Barangay Treasurer' },
  { key: 'secretary', label: 'Barangay Secretary' },
];

const OFFICIAL_COLUMNS = [
  ['punong', 'treasurer'],
  ['sk', 'secretary'],
  ['kagawad'],
];

function normalizeAnnouncement(record) {
  return {
    id: record.id,
    title: record.title || 'Untitled announcement',
    description: record.description || '',
    startDate: record.start_date,
    endDate: record.end_date,
    image: record.image_data || null,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function normalizeEvent(record) {
  return {
    id: record.id,
    title: record.title || 'Untitled event',
    startDate: record.start_date,
    endDate: record.end_date || record.start_date,
    description: record.description || '',
  };
}

function normalizeOfficial(record) {
  return {
    id: record.id,
    role: (record.role || '').toLowerCase(),
    name: record.name || '',
    email: record.email || '',
    contactNumber: record.contact_number || '',
  };
}

function resolveAnnouncementStatus(item, today) {
  const start = item.startDate ? new Date(item.startDate) : null;
  const end = item.endDate ? new Date(item.endDate) : null;
  if (!start || !end) return 'upcoming';
  if (today < start) return 'upcoming';
  if (today > end) return 'ended';
  return 'ongoing';
}

function describeRange(startDate, endDate) {
  if (!startDate || !endDate) return 'Unscheduled';
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  const startLabel = new Date(startDate).toLocaleDateString('en-PH', options);
  const endLabel = new Date(endDate).toLocaleDateString('en-PH', options);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

function computeAge(birthday) {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function formatDateLabel(date) {
  return date.toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function groupOfficials(entries) {
  return entries.reduce((acc, item) => {
    const key = item.role || 'others';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

export default function DashboardTab({ barangayId }) {
  const today = useMemo(() => {
    const now = new Date();
    return startOfDay(now);
  }, []);

  const refreshMs = 15000;

  const [announcements, setAnnouncements] = useState([]);
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);

  const [residentStats, setResidentStats] = useState({ total: 0, minors: 0, adults: 0, seniors: 0 });
  const [residentsLoading, setResidentsLoading] = useState(true);

  const [todayEvents, setTodayEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const [officialGroups, setOfficialGroups] = useState({});
  const [officialsLoading, setOfficialsLoading] = useState(true);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [inProgressRequestsCount, setInProgressRequestsCount] = useState(0);
  const [readyRequestsCount, setReadyRequestsCount] = useState(0);
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);
  const [descriptionModalText, setDescriptionModalText] = useState('');
  const officialColumns = useMemo(() => {
    const base = OFFICIAL_COLUMNS.map(column => [...column]);
    const knownKeys = new Set(base.flat());
    const extras = OFFICIAL_GROUPS.map(group => group.key).filter(key => !knownKeys.has(key));
    if (extras.length) {
      base[base.length - 1] = [...base[base.length - 1], ...extras];
    }
    return base;
  }, []);

  useEffect(() => {
    if (!barangayId) return;
    let ignore = false;
    async function loadAnnouncements() {
      setAnnouncementsLoading(true);
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('barangay_id', barangayId)
        .order('start_date', { ascending: true })
        .limit(10);
      if (ignore) return;
      if (error) {
        console.error('Failed to load announcements for dashboard', error);
        setAnnouncements([]);
      } else {
        setAnnouncements((data || []).map(normalizeAnnouncement));
        setAnnouncementIndex(0);
      }
      setAnnouncementsLoading(false);
    }
    loadAnnouncements();
    return () => {
      ignore = true;
    };
  }, [barangayId]);

  useEffect(() => {
    if (!barangayId) return;
    let ignore = false;
    async function loadResidents() {
      setResidentsLoading(true);
      const { data, error } = await supabase.from('residents').select('id, birthday').eq('barangay_id', barangayId);
      if (ignore) return;
      if (error) {
        console.error('Failed to load residents for dashboard', error);
        setResidentStats({ total: 0, minors: 0, adults: 0, seniors: 0 });
      } else {
        let minors = 0;
        let adults = 0;
        let seniors = 0;
        (data || []).forEach(record => {
          const age = computeAge(record.birthday);
          if (age === null) return;
          if (age < 18) minors += 1;
          else if (age >= 60) seniors += 1;
          else adults += 1;
        });
        setResidentStats({ total: data?.length || 0, minors, adults, seniors });
      }
      setResidentsLoading(false);
    }
    loadResidents();
    return () => {
      ignore = true;
    };
  }, [barangayId]);

  useEffect(() => {
    if (!barangayId) return;
    let ignore = false;
    async function loadEvents() {
      setEventsLoading(true);
      const { data, error } = await supabase
        .from('admin_events')
        .select('id, title, start_date, end_date, description')
        .eq('barangay_id', barangayId);
      if (ignore) return;
      if (error) {
        console.error('Failed to load events for dashboard', error);
        setTodayEvents([]);
      } else {
        const filtered = (data || [])
          .map(normalizeEvent)
          .filter(event => {
            const rawStart = event.startDate ? new Date(event.startDate) : null;
            if (!rawStart) return false;
            const start = startOfDay(rawStart);
            const rawEnd = event.endDate ? new Date(event.endDate) : rawStart;
            const end = endOfDay(rawEnd);
            return start <= today && today <= end;
          });
        setTodayEvents(filtered);
      }
      setEventsLoading(false);
    }
    loadEvents();
    return () => {
      ignore = true;
    };
  }, [today, barangayId]);

  useEffect(() => {
    if (!barangayId) return;
    let ignore = false;
    async function loadOfficials() {
      setOfficialsLoading(true);
      const { data, error } = await supabase
        .from('barangay_officials')
        .select('id, role, name, email, contact_number')
        .eq('barangay_id', barangayId);
      if (ignore) return;
      if (error) {
        console.error('Failed to load officials for dashboard', error);
        setOfficialGroups({});
      } else {
        const grouped = groupOfficials((data || []).map(normalizeOfficial));
        setOfficialGroups(grouped);
      }
      setOfficialsLoading(false);
    }
    loadOfficials();
    return () => {
      ignore = true;
    };
  }, [barangayId]);

  useEffect(() => {
    if (!barangayId) return;
    let ignore = false;
    async function loadPendingRequests() {
      const [pendingResponse, currentResponse, doneResponse] = await Promise.all([
        supabase
          .from('resident_intake_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .eq('barangay_id', barangayId),
        supabase
          .from('resident_intake_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'current')
          .eq('barangay_id', barangayId),
        supabase
          .from('resident_intake_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'done')
          .eq('barangay_id', barangayId),
      ]);
      if (ignore) return;
      if (pendingResponse.error || currentResponse.error || doneResponse.error) {
        console.error('Failed to load request counts', pendingResponse.error || currentResponse.error || doneResponse.error);
        setPendingRequestsCount(0);
        setInProgressRequestsCount(0);
        setReadyRequestsCount(0);
      } else {
        setPendingRequestsCount(pendingResponse.count || 0);
        setInProgressRequestsCount(currentResponse.count || 0);
        setReadyRequestsCount(doneResponse.count || 0);
      }
    }
    loadPendingRequests();
    const intervalId = setInterval(() => {
      loadPendingRequests();
    }, refreshMs);
    return () => {
      ignore = true;
      clearInterval(intervalId);
    };
  }, [barangayId]);

  const activeAnnouncements = useMemo(() => {
    if (!announcements.length) return [];
    return announcements
      .map(item => ({
        ...item,
        status: resolveAnnouncementStatus(item, today),
      }))
      .filter(item => item.status !== 'ended');
  }, [announcements, today]);

  const currentSlide = activeAnnouncements.length
    ? activeAnnouncements[announcementIndex % activeAnnouncements.length]
    : null;

  function renderOfficialCard(group) {
    const entries = officialGroups[group.key] || [];
    return (
      <div key={group.key} className="rounded-2xl border border-gray-100 bg-white/80 p-4">
        <p className="text-sm font-semibold text-gray-900">{group.label}</p>
        {!entries.length ? (
          <p className="mt-2 text-xs text-gray-500">No record yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 text-sm text-gray-700">
            {entries.map(entry => (
              <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold text-gray-900">{entry.name || 'Unnamed'}</p>
                {entry.email && <p className="text-xs text-gray-500">{entry.email}</p>}
                {entry.contactNumber && <p className="text-[11px] text-gray-400">{entry.contactNumber}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  function handlePrevSlide() {
    if (!activeAnnouncements.length) return;
    setAnnouncementIndex(prev => (prev - 1 + activeAnnouncements.length) % activeAnnouncements.length);
  }

  function handleNextSlide() {
    if (!activeAnnouncements.length) return;
    setAnnouncementIndex(prev => (prev + 1) % activeAnnouncements.length);
  }

  function openDescriptionModal(text) {
    setDescriptionModalText(text || 'No details provided.');
    setDescriptionModalOpen(true);
  }

  function closeDescriptionModal() {
    setDescriptionModalOpen(false);
  }

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[3fr,2fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
          {announcementsLoading ? (
            <div className="flex h-full flex-col gap-4 p-2">
              <div className="skeleton h-3 w-32" />
              <div className="skeleton h-7 w-3/4" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-40 w-full max-w-xs rounded-2xl" />
            </div>
          ) : currentSlide ? (
            <div className="flex h-full flex-col gap-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Featured Announcement</p>
                  <h2 className="text-3xl font-semibold text-slate-900">{currentSlide.title}</h2>
                  <p
                    className="text-sm text-slate-600 max-w-2xl"
                    style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {currentSlide.description || 'No details provided.'}
                  </p>
                  {currentSlide.description && currentSlide.description.length > 160 && (
                    <button
                      type="button"
                      className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-500"
                      onClick={() => openDescriptionModal(currentSlide.description)}
                    >
                      Show more
                    </button>
                  )}
                </div>
                {activeAnnouncements.length > 1 && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                      onClick={handlePrevSlide}
                      aria-label="Previous announcement"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                      onClick={handleNextSlide}
                      aria-label="Next announcement"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
              {currentSlide.image && (
                <div
                  className="mx-auto w-full max-w-xs rounded-2xl border border-slate-100 bg-slate-50 flex items-center justify-center"
                  style={{ aspectRatio: '1 / 1' }}
                >
                  <img
                    src={currentSlide.image}
                    alt={currentSlide.title}
                    className="h-full w-full object-contain"
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1 font-semibold text-slate-700">
                  {describeRange(currentSlide.startDate, currentSlide.endDate)}
                </span>
                {currentSlide.status !== 'ended' && (
                  <span className={`rounded-full px-4 py-1 font-semibold ${ANNOUNCEMENT_STATUS_META[currentSlide.status]?.pill || 'border border-slate-200 bg-slate-50 text-slate-600'}`}>
                    {ANNOUNCEMENT_STATUS_META[currentSlide.status]?.label || 'Upcoming'}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Announcements</p>
              <h2 className="text-3xl font-semibold text-slate-900">No active announcements yet</h2>
              <p className="text-sm text-slate-600 max-w-xl">
                Publish your first announcement to showcase it on the dashboard. Items created in the Announcements tab
                that are scheduled for today or later will automatically appear here.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4 xl:col-start-2 xl:flex xl:flex-col xl:gap-3 xl:space-y-0">
          <div className="rounded-3xl border border-gray-100 bg-white p-5 xl:p-4 shadow-sm flex flex-col xl:flex-1">
            <p className="text-xs uppercase tracking-widest text-emerald-500 font-semibold">Today</p>
            <h3 className="text-base font-bold text-gray-900">{formatDateLabel(today)}</h3>
            {eventsLoading ? (
              <div className="mt-3 space-y-2"><SkeletonLine className="w-3/4" /><SkeletonLine className="w-1/2" /></div>
            ) : todayEvents.length ? (
              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Active Event</p>
                <p className="mt-1 text-base font-semibold text-gray-900">{todayEvents[0].title}</p>
                <p className="text-xs text-gray-500">{describeRange(todayEvents[0].startDate, todayEvents[0].endDate)}</p>
                {todayEvents[0].description && <p className="mt-2 text-sm text-gray-700">{todayEvents[0].description}</p>}
                {todayEvents.length > 1 && (
                  <p className="mt-2 text-[11px] text-gray-500">+{todayEvents.length - 1} more happening today</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No events scheduled for today.</p>
            )}
          </div>

          <div className="rounded-3xl border border-gray-100 bg-white p-5 xl:p-4 shadow-sm flex flex-col xl:flex-1">
            <p className="text-xs uppercase tracking-widest text-purple-500 font-semibold">Pending Requests</p>
            <div className="mt-3 text-xs text-gray-600 space-y-1">
              <p>Pending: <span className="font-semibold text-gray-900">{pendingRequestsCount}</span></p>
              <p>In Progress: <span className="font-semibold text-gray-900">{inProgressRequestsCount}</span></p>
              <p>Ready for Pickup: <span className="font-semibold text-gray-900">{readyRequestsCount}</span></p>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-100 bg-white p-5 xl:p-4 shadow-sm flex flex-col xl:flex-1">
            <p className="text-xs uppercase tracking-widest text-blue-500 font-semibold">Residents Snapshot</p>
            {residentsLoading ? (
              <div className="mt-4 grid grid-cols-2 gap-4"><div className="space-y-2"><div className="skeleton h-8 w-16" /><div className="skeleton h-3 w-20" /></div><div className="space-y-2"><SkeletonLine className="w-3/4" /><SkeletonLine className="w-3/4" /><SkeletonLine className="w-3/4" /></div></div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-3xl font-bold text-gray-900">{residentStats.total}</p>
                  <p className="text-xs text-gray-500">Total records</p>
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>Minors: <span className="font-semibold">{residentStats.minors}</span></p>
                  <p>Adults: <span className="font-semibold">{residentStats.adults}</span></p>
                  <p>Seniors: <span className="font-semibold">{residentStats.seniors}</span></p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-lg">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-left">
            <p className="text-xs uppercase tracking-widest text-purple-500 font-semibold">Barangay Officials</p>
            <h3 className="text-xl font-bold text-gray-900">Leadership Roster</h3>
            <p className="text-sm text-gray-500">Mirrors the Barangay Info tab for quick reference.</p>
          </div>
        </div>
        {officialsLoading ? (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => (<div key={i} className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3"><div className="skeleton h-3 w-24" /><SkeletonLine className="w-full" /><SkeletonLine className="w-2/3" /></div>))}</div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {officialColumns.map((columnKeys, columnIndex) => (
              <div key={`official-column-${columnIndex}`} className="space-y-4">
                {columnKeys.map(key => {
                  const groupMeta = OFFICIAL_GROUPS.find(group => group.key === key);
                  return groupMeta ? renderOfficialCard(groupMeta) : null;
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      {descriptionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl pr-2">
              <div className="max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">Announcement</p>
                    <h2 className="text-xl font-bold text-gray-900">Full Description</h2>
                  </div>
                  <button
                    type="button"
                    className="rounded-full p-2 text-gray-400 hover:bg-gray-100"
                    onClick={closeDescriptionModal}
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
                <div className="px-6 py-6 text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                  {descriptionModalText}
                </div>
              </div>
            </div>
          </div>
      )}
    </div>
  );
}
