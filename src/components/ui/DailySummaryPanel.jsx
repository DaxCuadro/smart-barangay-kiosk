import { useEffect, useMemo, useState } from 'react';

/* ── helpers ────────────────────────────────────────────────────── */
function toDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatLabel(d) {
  return d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function startOfDay(dateStr) {
  return `${dateStr}T00:00:00`;
}

function endOfDay(dateStr) {
  return `${dateStr}T23:59:59.999999`;
}

function docLabel(doc) {
  if (!doc) return 'Unknown';
  return doc.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ── CSV export ─────────────────────────────────────────────────── */
function buildCsv(date, stats, byDoc, bySource, released, allReleasedToday, cancelled) {
  const label = formatLabel(date);
  const rows = [
    ['Daily Request Summary', label],
    [],
    ['Metric', 'Count'],
    ['Total Requested', stats.total],
    ['Pending', stats.pending],
    ['In Progress', stats.current],
    ['Ready for Pickup', stats.done],
    ['Released (same-day)', stats.sameDayReleased],
    ['Total Released Today', allReleasedToday.length],
    ['Cancelled', stats.cancelled],
    [],
    ['Breakdown by Document Type', 'Count'],
    ...Object.entries(byDoc).sort((a, b) => b[1] - a[1]).map(([k, v]) => [docLabel(k), v]),
    [],
    ['Breakdown by Source', 'Count'],
    ...Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k || 'unknown', v]),
    [],
    ['All Documents Released Today', ''],
    ['Resident', 'Document', 'Requested', 'Released At'],
    ...allReleasedToday.map(r => [r.resident_name, r.document, r.requested_at || '', r.released_at]),
    [],
    ['Cancelled Requests', ''],
    ['Resident', 'Document', 'Cancelled At', 'Cancelled By'],
    ...cancelled.map(r => [`${r.first_name || ''} ${r.last_name || ''}`.trim(), r.document, r.cancelled_at, r.cancelled_by]),
  ];
  return rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

function downloadCsv(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── mini calendar ──────────────────────────────────────────────── */
function MiniCalendar({ selected, onSelect, onClose }) {
  const [viewDate, setViewDate] = useState(() => new Date(selected));
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = toDateString(new Date());

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          className="rounded-full p-1 hover:bg-gray-100 text-gray-600"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className="text-sm font-semibold text-gray-800">
          {viewDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          className="rounded-full p-1 hover:bg-gray-100 text-gray-600"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-gray-400 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {cells.map((day, idx) => {
          if (!day) return <span key={`e-${idx}`} />;
          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSel = ds === toDateString(selected);
          const isToday = ds === today;
          return (
            <button
              key={ds}
              type="button"
              onClick={() => { onSelect(new Date(year, month, day)); onClose(); }}
              className={`rounded-full w-8 h-8 flex items-center justify-center transition text-sm ${
                isSel
                  ? 'bg-blue-600 text-white font-bold'
                  : isToday
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="mt-2 border-t pt-2 flex justify-between">
        <button
          type="button"
          className="text-xs text-blue-600 hover:text-blue-500 font-semibold"
          onClick={() => { onSelect(new Date()); onClose(); }}
        >
          Today
        </button>
        <button
          type="button"
          className="text-xs text-gray-500 hover:text-gray-700 font-semibold"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* ── stat card ──────────────────────────────────────────────────── */
function StatCard({ label, value, accent = 'text-gray-900', sub }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

/* ── main component ─────────────────────────────────────────────── */
/**
 * DailySummaryPanel — daily request monitoring with calendar nav & CSV export.
 *
 * Props:
 *  - supabase      Supabase client
 *  - barangayId    UUID | null — if null, aggregates all barangays (superadmin)
 *  - barangayName  optional display name
 */
export default function DailySummaryPanel({ supabase, barangayId, barangayName }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data
  const [requests, setRequests] = useState([]);
  const [released, setReleased] = useState([]);
  const [allReleasedToday, setAllReleasedToday] = useState([]);
  const [cancelled, setCancelled] = useState([]);

  const dateStr = useMemo(() => toDateString(selectedDate), [selectedDate]);
  const isToday = dateStr === toDateString(new Date());

  useEffect(() => {
    let ignore = false;
    async function run() {
      setLoading(true);
      const rangeStart = startOfDay(dateStr);
      const rangeEnd = endOfDay(dateStr);

      let reqQuery = supabase
        .from('resident_intake_requests')
        .select('id, status, document, request_source, first_name, last_name, created_at, cancelled_at, cancelled_by')
        .gte('created_at', rangeStart)
        .lte('created_at', rangeEnd);
      if (barangayId) reqQuery = reqQuery.eq('barangay_id', barangayId);

      // Releases where the original request was filed on this date
      let relQuery = supabase
        .from('release_logs')
        .select('id, resident_name, document, released_at, requested_at, source')
        .gte('requested_at', rangeStart)
        .lte('requested_at', rangeEnd);
      if (barangayId) relQuery = relQuery.eq('barangay_id', barangayId);

      // All releases that happened on this date (regardless of when requested)
      let allRelQuery = supabase
        .from('release_logs')
        .select('id, resident_name, document, released_at, requested_at, source')
        .gte('released_at', rangeStart)
        .lte('released_at', rangeEnd);
      if (barangayId) allRelQuery = allRelQuery.eq('barangay_id', barangayId);

      const [reqRes, relRes, allRelRes] = await Promise.all([reqQuery, relQuery, allRelQuery]);
      if (ignore) return;

      if (reqRes.error) console.error('Daily summary: requests error', reqRes.error);
      if (relRes.error) console.error('Daily summary: releases error', relRes.error);
      if (allRelRes.error) console.error('Daily summary: all released error', allRelRes.error);

      const reqData = reqRes.data || [];
      const relData = relRes.data || [];
      const allRelData = allRelRes.data || [];
      const active = reqData.filter(r => r.status !== 'cancelled');
      const cancelledRows = reqData.filter(r => r.status === 'cancelled');

      setRequests(active);
      setReleased(relData);
      setAllReleasedToday(allRelData);
      setCancelled(cancelledRows);
      setLoading(false);
    }
    run();
    return () => { ignore = true; };
  }, [supabase, barangayId, dateStr]);

  // Computed stats — all counts attributed to the selected date
  const stats = useMemo(() => {
    const pending = requests.filter(r => r.status === 'pending').length;
    const current = requests.filter(r => r.status === 'current').length;
    const done = requests.filter(r => r.status === 'done').length;
    // Same-day = released on the same date they were requested
    const sameDayReleased = released.filter(r => {
      if (!r.released_at || !r.requested_at) return false;
      return toDateString(new Date(r.released_at)) === toDateString(new Date(r.requested_at));
    }).length;
    const total = requests.length + released.length + cancelled.length;
    return { total, pending, current, done, released: released.length, sameDayReleased, totalReleasedToday: allReleasedToday.length, cancelled: cancelled.length };
  }, [requests, released, allReleasedToday, cancelled]);

  const byDoc = useMemo(() => {
    const map = {};
    [...requests, ...cancelled].forEach(r => { map[r.document] = (map[r.document] || 0) + 1; });
    released.forEach(r => { map[r.document] = (map[r.document] || 0) + 1; });
    return map;
  }, [requests, released, cancelled]);

  const bySource = useMemo(() => {
    const map = {};
    [...requests, ...cancelled].forEach(r => {
      const src = r.request_source || 'unknown';
      map[src] = (map[src] || 0) + 1;
    });
    released.forEach(r => {
      const src = r.source || 'unknown';
      map[src] = (map[src] || 0) + 1;
    });
    return map;
  }, [requests, released, cancelled]);

  function handleExport() {
    const csv = buildCsv(selectedDate, stats, byDoc, bySource, released, allReleasedToday, cancelled);
    const name = `daily-summary-${dateStr}${barangayName ? `-${barangayName.replace(/\s+/g, '-').toLowerCase()}` : ''}.csv`;
    downloadCsv(csv, name);
  }

  function prevDay() { setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; }); }
  function nextDay() { if (!isToday) setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; }); }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-indigo-500 font-semibold">Daily Summary</p>
          <h3 className="text-lg font-bold text-gray-900">{formatLabel(selectedDate)}</h3>
          {barangayName && <p className="text-xs text-gray-500">{barangayName}</p>}
        </div>

        <div className="flex items-center gap-2 relative">
          {/* prev / next */}
          <button type="button" onClick={prevDay} className="rounded-full border border-gray-200 p-1.5 hover:bg-gray-100 text-gray-600" aria-label="Previous day">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button type="button" disabled={isToday} onClick={nextDay} className="rounded-full border border-gray-200 p-1.5 hover:bg-gray-100 text-gray-600 disabled:opacity-30" aria-label="Next day">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
          </button>

          {/* calendar button */}
          <button
            type="button"
            onClick={() => setCalendarOpen(o => !o)}
            className="rounded-full border border-gray-200 p-1.5 hover:bg-gray-100 text-gray-600"
            aria-label="Pick a date"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>

          {calendarOpen && (
            <MiniCalendar selected={selectedDate} onSelect={setSelectedDate} onClose={() => setCalendarOpen(false)} />
          )}

          {/* export */}
          <button
            type="button"
            onClick={handleExport}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white p-4 animate-pulse">
              <div className="h-2 w-16 rounded bg-gray-200" />
              <div className="mt-3 h-6 w-10 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <StatCard label="Total Filed" value={stats.total} accent="text-indigo-700" />
            <StatCard label="Pending" value={stats.pending} accent="text-amber-600" />
            <StatCard label="In Progress" value={stats.current} accent="text-blue-600" />
            <StatCard label="Ready" value={stats.done} accent="text-emerald-600" />
            <StatCard label="Same-day Released" value={stats.sameDayReleased} accent="text-green-700" sub="requested & released today" />
            <StatCard label="Total Released" value={stats.totalReleasedToday} accent="text-teal-700" sub="all released today" />
            <StatCard label="Cancelled" value={stats.cancelled} accent="text-red-500" />
          </div>

          {/* Breakdown tables */}
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* By document type */}
            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">By Document Type</p>
              {Object.keys(byDoc).length === 0 ? (
                <p className="text-sm text-gray-400">No requests filed.</p>
              ) : (
                <ul className="space-y-1">
                  {Object.entries(byDoc)
                    .sort((a, b) => b[1] - a[1])
                    .map(([doc, count]) => (
                      <li key={doc} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{docLabel(doc)}</span>
                        <span className="font-semibold text-gray-900">{count}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {/* By source */}
            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-2">By Source</p>
              {Object.keys(bySource).length === 0 ? (
                <p className="text-sm text-gray-400">No requests filed.</p>
              ) : (
                <ul className="space-y-1">
                  {Object.entries(bySource)
                    .sort((a, b) => b[1] - a[1])
                    .map(([src, count]) => (
                      <li key={src} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 capitalize">{src}</span>
                        <span className="font-semibold text-gray-900">{count}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>

          {/* Released detail — all documents released on this date */}
          {allReleasedToday.length > 0 && (
            <div className="mt-4 rounded-2xl border border-green-100 bg-green-50/40 p-4">
              <p className="text-[11px] uppercase tracking-widest text-green-600 font-semibold mb-2">Documents Released Today ({allReleasedToday.length})</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-gray-400">
                      <th className="pb-1 pr-4 font-semibold">Resident</th>
                      <th className="pb-1 pr-4 font-semibold">Document</th>
                      <th className="pb-1 pr-4 font-semibold">Requested</th>
                      <th className="pb-1 font-semibold">Released</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-100">
                    {allReleasedToday.map(r => {
                      const sameDay = r.requested_at && toDateString(new Date(r.released_at)) === toDateString(new Date(r.requested_at));
                      return (
                        <tr key={r.id}>
                          <td className="py-1.5 pr-4 text-gray-800">{r.resident_name}</td>
                          <td className="py-1.5 pr-4 text-gray-600">{docLabel(r.document)}</td>
                          <td className="py-1.5 pr-4 text-gray-500 text-xs">
                            {r.requested_at ? new Date(r.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                            {sameDay && <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">same-day</span>}
                          </td>
                          <td className="py-1.5 text-gray-500 text-xs">
                            {new Date(r.released_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cancelled detail */}
          {cancelled.length > 0 && (
            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/40 p-4">
              <p className="text-[11px] uppercase tracking-widest text-red-500 font-semibold mb-2">Cancelled Requests ({cancelled.length})</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-gray-400">
                      <th className="pb-1 pr-4 font-semibold">Resident</th>
                      <th className="pb-1 pr-4 font-semibold">Document</th>
                      <th className="pb-1 pr-4 font-semibold">By</th>
                      <th className="pb-1 font-semibold">Cancelled</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {cancelled.map(r => (
                      <tr key={r.id}>
                        <td className="py-1.5 pr-4 text-gray-800">{`${r.first_name || ''} ${r.last_name || ''}`.trim() || 'N/A'}</td>
                        <td className="py-1.5 pr-4 text-gray-600">{docLabel(r.document)}</td>
                        <td className="py-1.5 pr-4 text-gray-500 capitalize">{r.cancelled_by || '—'}</td>
                        <td className="py-1.5 text-gray-500 text-xs">
                          {r.cancelled_at ? new Date(r.cancelled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {stats.total === 0 && (
            <div className="mt-6 text-center py-8">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-gray-300">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p className="mt-2 text-sm text-gray-400">No requests were filed on this date.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
