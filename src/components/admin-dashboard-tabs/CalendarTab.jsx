import { useCallback, useEffect, useMemo, useState } from 'react';
import Calendar from 'react-calendar';
import Holidays from 'date-holidays';
import { supabase } from '../../supabaseClient';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import AddEventModal from './AddEventModal';
import 'react-calendar/dist/Calendar.css';
import './calendarStyles.css';

const STORAGE_KEY_PREFIX = 'sbk-admin-events';
const HOLIDAY_REGION = import.meta.env.VITE_HOLIDAY_REGION || 'PH';
const HOLIDAY_TYPES = ['public', 'bank', 'school', 'observance'];

const TYPE_STYLES = {
  Holiday: 'bg-amber-50 text-amber-700 border border-amber-200',
  Admin: 'bg-blue-50 text-blue-700 border border-blue-200',
};

const LEGEND_SWATCH = {
  Holiday: 'bg-amber-400',
  Admin: 'bg-blue-500',
};

const MARKER_CLASS = {
  Holiday: 'sbk-holiday-dot',
  Admin: 'sbk-admin-dot',
};

const RANGE_LABEL_OPTIONS = { month: 'short', day: 'numeric', year: 'numeric' };

function formatDateParts(year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function formatDateFromDate(date) {
  return formatDateParts(date.getFullYear(), date.getMonth(), date.getDate());
}

function normalizeHolidayDate(value) {
  if (!value) return '';
  if (value.includes('T')) return value.slice(0, 10);
  if (value.includes(' ')) return value.split(' ')[0];
  return value.slice(0, 10);
}

function getMonthLabel(date) {
  return date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

function getHolidayEventsForYear(year) {
  try {
    const engine = new Holidays(HOLIDAY_REGION);
    return (engine.getHolidays(year) || [])
      .filter(item => HOLIDAY_TYPES.includes(item.type))
      .map(item => {
        const dateValue = normalizeHolidayDate(item.date);
        if (!dateValue) return null;
        return {
          id: `holiday-${item.name}-${dateValue}`,
          title: item.name,
          date: dateValue,
          startDate: dateValue,
          endDate: dateValue,
          description: item.note || (item.substitute ? 'Special non-working day' : item.type),
          type: 'Holiday',
          fixed: true,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error('Holiday generation failed:', error);
    return [];
  }
}

function buildRecurringEvents(centerYear) {
  const spread = [-1, 0, 1];
  return spread.flatMap(offset => getHolidayEventsForYear(centerYear + offset));
}

function normalizeCustomEvent(record) {
  const startDate = record.startDate || record.start_date || record.date || '';
  const endDate = record.endDate || record.end_date || startDate;
  const fallbackId = record.id || record.uuid || `admin-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: fallbackId,
    title: record.title || 'Untitled event',
    startDate,
    endDate,
    description: record.description || '',
    type: record.type || 'Admin',
    fixed: Boolean(record.fixed),
    date: startDate,
    createdAt: record.createdAt || record.created_at || null,
    updatedAt: record.updatedAt || record.updated_at || null,
  };
}

function sanitizeText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function mapEventToSupabase(values) {
  return {
    title: values.title.trim(),
    start_date: values.startDate,
    end_date: values.endDate || values.startDate,
    description: sanitizeText(values.description),
  };
}

function getStartKey(event) {
  return event.startDate || event.date || '';
}

function getEndKey(event) {
  return event.endDate || event.startDate || event.date || '';
}

function ensureRange(startValue, endValue) {
  if (!startValue) return null;
  const start = new Date(startValue);
  const end = new Date(endValue || startValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return end >= start ? [start, end] : [end, start];
}

function expandEventDates(event) {
  const range = ensureRange(getStartKey(event), getEndKey(event));
  if (!range) return [];
  const [start, end] = range;
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatDateFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function formatRangeLabel(startValue, endValue) {
  const range = ensureRange(startValue, endValue);
  if (!range) return 'Unscheduled';
  const [start, end] = range;
  const startLabel = start.toLocaleDateString('en-PH', RANGE_LABEL_OPTIONS);
  const endLabel = end.toLocaleDateString('en-PH', RANGE_LABEL_OPTIONS);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

export default function CalendarTab({ barangayId }) {
  const { addToast } = useToast();
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatDateFromDate(today), [today]);
  const [activeStartDate, setActiveStartDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => today);
  const [customEvents, setCustomEvents] = useState([]);
  const [modalState, setModalState] = useState({ open: false, mode: 'create', target: null });
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showAdminList, setShowAdminList] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!barangayId) return;
    const key = barangayId ? `${STORAGE_KEY_PREFIX}-${barangayId}` : STORAGE_KEY_PREFIX;
    localStorage.setItem(key, JSON.stringify(customEvents));
  }, [customEvents, barangayId]);

  const loadAdminEvents = useCallback(async () => {
    if (!barangayId) return;
    setEventsLoading(true);
    setEventsError(null);
    const { data, error } = await supabase
      .from('admin_events')
      .select('*')
      .eq('barangay_id', barangayId)
      .order('start_date', { ascending: true });
    if (error) {
      setEventsError(error.message);
    } else {
      setCustomEvents((data || []).map(normalizeCustomEvent));
    }
    setEventsLoading(false);
  }, [barangayId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadAdminEvents();
    }, 0);
    return () => clearTimeout(timeout);
  }, [loadAdminEvents]);

  const recurringEvents = useMemo(() => buildRecurringEvents(activeStartDate.getFullYear()), [activeStartDate]);

  const allEvents = useMemo(() => {
    return [...recurringEvents, ...customEvents].sort((a, b) => getStartKey(a).localeCompare(getStartKey(b)));
  }, [recurringEvents, customEvents]);

  const eventsByDate = useMemo(() => {
    const map = new Map();
    allEvents.forEach(event => {
      const keys = expandEventDates(event);
      keys.forEach(key => {
        const entry = map.get(key) || [];
        entry.push(event);
        map.set(key, entry);
      });
    });
    return map;
  }, [allEvents]);

  const selectedDateKey = useMemo(() => formatDateFromDate(selectedDate), [selectedDate]);
  const selectedDayEvents = eventsByDate.get(selectedDateKey) || [];

  const adminEvents = useMemo(() => {
    return customEvents.slice().sort((a, b) => getStartKey(a).localeCompare(getStartKey(b)));
  }, [customEvents]);

  const upcomingEvents = useMemo(() => {
    return allEvents
      .filter(event => getEndKey(event) >= todayKey)
      .slice(0, 6);
  }, [allEvents, todayKey]);

  function handleMonthShift(offset) {
    setActiveStartDate(prev => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + offset);
      return next;
    });
  }

  function handleDaySelect(value) {
    const nextValue = Array.isArray(value) ? value[0] : value;
    setSelectedDate(nextValue);
    setActiveStartDate(new Date(nextValue.getFullYear(), nextValue.getMonth(), 1));
  }

  function requestRemoveEvent(event) {
    if (event.type !== 'Admin') return;
    setPendingDelete(event);
  }

  async function confirmRemoveEvent() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    const { error } = await supabase.from('admin_events').delete().eq('id', pendingDelete.id);
    setDeleteBusy(false);
    if (error) {
      addToast(`Failed to delete event: ${error.message}`, 'error');
      return;
    }
    setCustomEvents(prev => prev.filter(event => event.id !== pendingDelete.id));
    setPendingDelete(null);
    addToast('Event deleted successfully.', 'success');
  }

  function openEventModal(target = null) {
    setModalState({ open: true, mode: target ? 'edit' : 'create', target });
  }

  function closeEventModal() {
    setModalState({ open: false, mode: 'create', target: null });
  }

  async function handleModalSave(payload) {
    if (modalState.mode === 'edit' && modalState.target) {
      const { data, error } = await supabase
        .from('admin_events')
        .update(mapEventToSupabase(payload))
        .eq('id', modalState.target.id)
        .select()
        .single();
      if (error) {
        addToast(`Failed to save changes: ${error.message}`, 'error');
        return;
      }
      setCustomEvents(prev => prev.map(event => (event.id === modalState.target.id ? normalizeCustomEvent(data) : event)));
      addToast('Event updated successfully.', 'success');
    } else {
      const { data, error } = await supabase
        .from('admin_events')
        .insert({ ...mapEventToSupabase(payload), barangay_id: barangayId })
        .select()
        .single();
      if (error) {
        addToast(`Failed to add event: ${error.message}`, 'error');
        return;
      }
      setCustomEvents(prev => [...prev, normalizeCustomEvent(data)]);
      addToast('Event added successfully.', 'success');
    }
    setShowAdminList(true);
    closeEventModal();
  }

  function tileContent({ date, view }) {
    if (view !== 'month') return null;
    const key = formatDateFromDate(date);
    const events = eventsByDate.get(key);
    if (!events?.length) return null;
    return (
      <div className="sbk-tile-chips">
        {events.slice(0, 2).map(event => (
          <span key={event.id} className={`sbk-event-dot ${MARKER_CLASS[event.type] || MARKER_CLASS.Admin}`} />
        ))}
        {events.length > 2 && <span className="sbk-event-dot sbk-event-dot-more">+{events.length - 2}</span>}
      </div>
    );
  }

  function tileClassName({ date, view }) {
    if (view !== 'month') return '';
    const key = formatDateFromDate(date);
    const classes = [];
    if (eventsByDate.has(key)) classes.push('sbk-day-has-event');
    if (key === todayKey) classes.push('sbk-day-today');
    if (key === selectedDateKey) classes.push('sbk-day-selected');
    return classes.join(' ');
  }

  const displayMonthLabel = getMonthLabel(activeStartDate);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">Community Calendar</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Calendar</h2>
          <p className="mt-2 text-sm text-slate-600">
            Track public holidays and barangay events alongside admin-created schedules.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-full border border-slate-200 p-3 text-slate-600 hover:bg-slate-50"
            onClick={() => handleMonthShift(-1)}
            aria-label="Previous month"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-lg font-semibold text-slate-900">{displayMonthLabel}</div>
          <button
            type="button"
            className="rounded-full border border-slate-200 p-3 text-slate-600 hover:bg-slate-50"
            onClick={() => handleMonthShift(1)}
            aria-label="Next month"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className="ml-auto rounded-full bg-(--sbk-accent) px-5 py-2 text-sm font-semibold text-white shadow hover:bg-(--sbk-accent-strong)"
          onClick={() => openEventModal()}
        >
          + Add Admin Event
        </button>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <section className="bg-white border border-gray-100 rounded-3xl shadow-lg p-6">
            <Calendar
              className="sbk-calendar"
              value={selectedDate}
              onChange={handleDaySelect}
              activeStartDate={activeStartDate}
              onActiveStartDateChange={({ activeStartDate }) => {
                if (activeStartDate) setActiveStartDate(activeStartDate);
              }}
              calendarType="gregory"
              showNavigation={false}
              tileContent={tileContent}
              tileClassName={tileClassName}
            />
          </section>
          <section className="bg-white border border-gray-100 rounded-3xl shadow-lg p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-2xl border border-blue-100 px-4 py-3 text-left text-sm font-semibold text-blue-900"
              onClick={() => setShowAdminList(prev => !prev)}
              aria-expanded={showAdminList}
            >
              <span>Admin events list ({adminEvents.length})</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 transition-transform ${showAdminList ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showAdminList && (
              eventsLoading ? (
                <p className="mt-4 text-xs text-gray-500">Loading admin schedules…</p>
              ) : eventsError ? (
                <div className="mt-4 space-y-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
                  <p>Unable to load admin schedules.</p>
                  <p>{eventsError}</p>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full border border-red-200 px-3 py-1 font-semibold text-red-700 hover:bg-red-100"
                    onClick={loadAdminEvents}
                  >
                    Retry
                  </button>
                </div>
              ) : adminEvents.length ? (
                <ul className="mt-4 space-y-3">
                  {adminEvents.map(event => (
                    <li key={event.id} className="rounded-2xl border border-gray-100 p-3 text-left">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-gray-900 wrap-break-word">{event.title}</p>
                          <p className="text-xs text-gray-500">{formatRangeLabel(event.startDate, event.endDate)}</p>
                          {event.description && <p className="text-xs text-gray-500 mt-1 wrap-break-word">{event.description}</p>}
                        </div>
                        <span className="text-[10px] rounded-full bg-blue-50 px-2 py-0.5 text-blue-600 border border-blue-100 self-start">
                          Admin
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-[11px] font-semibold">
                        <button className="text-blue-600 hover:text-blue-700" onClick={() => openEventModal(event)}>
                          Edit
                        </button>
                        <button className="text-red-500 hover:text-red-600" onClick={() => requestRemoveEvent(event)}>
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-xs text-gray-500">No admin-created schedules yet.</p>
              )
            )}
          </section>
        </div>

        <section className="space-y-6">
          <div className="bg-white border border-gray-100 rounded-3xl shadow-lg p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 text-left">
              <div>
                <p className="text-xs uppercase tracking-widest text-blue-500 font-semibold">
                  {selectedDate.toLocaleDateString('en-PH', { weekday: 'long' })}
                </p>
                <h3 className="text-xl font-bold text-gray-900">
                  {selectedDate.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                </h3>
              </div>
              <button
                type="button"
                className="self-start text-sm font-semibold text-blue-600 hover:text-blue-700"
                onClick={() => openEventModal()}
              >
                Add Event
              </button>
            </div>
            {!selectedDayEvents.length ? (
              <p className="text-sm text-gray-500">No events tracked for this date yet.</p>
            ) : (
              <ul className="space-y-3">
                {selectedDayEvents.map(event => (
                  <li
                    key={`${event.id}-${selectedDateKey}`}
                    className="border border-gray-100 rounded-2xl p-3 bg-gray-50/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-left wrap-break-word">
                        <p className="font-semibold text-gray-900 wrap-break-word">{event.title}</p>
                        <p className="text-[11px] text-gray-500">{formatRangeLabel(event.startDate, event.endDate)}</p>
                        {event.description && <p className="text-xs text-gray-500 wrap-break-word">{event.description}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`inline-flex text-[10px] px-2 py-0.5 rounded-full ${
                            TYPE_STYLES[event.type] || 'border border-gray-200 text-gray-600'
                          }`}
                        >
                          {event.type}
                        </span>
                        {event.type === 'Admin' && (
                          <div className="flex gap-3 text-[11px] font-semibold">
                            <button className="text-blue-600 hover:text-blue-700" onClick={() => openEventModal(event)}>
                              Edit
                            </button>
                            <button className="text-red-500 hover:text-red-600" onClick={() => requestRemoveEvent(event)}>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-3xl shadow-lg p-6 text-left">
            <div className="mb-4 flex flex-col gap-1">
              <p className="text-xs uppercase tracking-widest text-blue-500 font-semibold">Upcoming</p>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-gray-900">Next on Deck</h3>
                <span className="text-xs text-gray-400">{upcomingEvents.length} items</span>
              </div>
            </div>
            {!upcomingEvents.length ? (
              <p className="text-sm text-gray-500">Nothing scheduled after today. Time to plan!</p>
            ) : (
              <ul className="space-y-4">
                {upcomingEvents.map(event => (
                  <li
                    key={event.id}
                    className="border border-gray-100 rounded-2xl p-3 bg-white/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-left wrap-break-word">
                        <p className="font-semibold text-gray-900 wrap-break-word">{event.title}</p>
                        <p className="text-xs text-gray-500">{formatRangeLabel(event.startDate, event.endDate)}</p>
                        {event.description && (
                          <p className="text-xs text-gray-500 mt-1 wrap-break-word">{event.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`text-[10px] px-2 py-1 rounded-full ${
                            TYPE_STYLES[event.type] || 'border border-gray-200 text-gray-600'
                          }`}
                        >
                          {event.type}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-gray-100 rounded-3xl shadow-lg p-6 text-left">
            <p className="text-xs uppercase tracking-widest text-blue-500 font-semibold">Legend</p>
            <div className="mt-4 space-y-3">
              {['Holiday', 'Admin'].map(key => (
                <div key={key} className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${LEGEND_SWATCH[key]}`}></span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {key === 'Holiday' ? 'Holidays (PH)' : 'Admin Schedules'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {key === 'Holiday'
                        ? 'Powered by date-holidays for the Philippines.'
                        : 'Meetings and on-ground tasks added by admins.'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <AddEventModal
        open={modalState.open}
        mode={modalState.mode}
        initialData={modalState.target}
        onClose={closeEventModal}
        onSave={handleModalSave}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove event?"
        description={pendingDelete ? `"${pendingDelete.title}" scheduled ${formatRangeLabel(pendingDelete.startDate, pendingDelete.endDate)} will be deleted.` : ''}
        confirmLabel="Delete"
        tone="danger"
        loading={deleteBusy}
        onConfirm={confirmRemoveEvent}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
