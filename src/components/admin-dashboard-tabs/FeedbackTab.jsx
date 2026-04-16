import { useEffect, useMemo, useState } from 'react';
import { useSupabase } from '../../contexts/SupabaseContext';

const STAR_LABELS = ['', 'Very Poor', 'Poor', 'Average', 'Good', 'Excellent'];

function StarDisplay({ rating }) {
  return (
    <span style={{ letterSpacing: '2px' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{ color: s <= rating ? '#f59e0b' : '#d1d5db' }}>★</span>
      ))}
    </span>
  );
}

function formatDate(value) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function downloadCSV(rows, headers, filename) {
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FeedbackTab({ barangayId }) {
  const supabase = useSupabase();
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  useEffect(() => {
    let isActive = true;
    async function loadFeedback() {
      if (!barangayId) { setLoading(false); return; }
      setLoading(true);

      // Fetch both resident_feedback and kiosk_feedback in parallel
      const [residentResult, kioskResult] = await Promise.all([
        supabase
          .from('resident_feedback')
          .select(`
            id,
            rating,
            comment,
            created_at,
            release_log_id,
            resident_id,
            source,
            release_logs!inner ( document, resident_name, released_at )
          `)
          .eq('barangay_id', barangayId)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('kiosk_feedback')
          .select('id, rating, comment, created_at, resident_name, document, source')
          .eq('barangay_id', barangayId)
          .order('created_at', { ascending: false })
          .limit(200),
      ]);
      if (!isActive) return;

      const residentRows = (residentResult.data || []).map(item => ({
        ...item,
        _source: 'release',
        _manual: item.source === 'manual',
        _name: item.release_logs?.resident_name || 'Resident',
        _document: item.release_logs?.document || 'Document',
      }));
      const kioskRows = (kioskResult.data || []).map(item => ({
        ...item,
        _source: 'kiosk',
        _manual: item.source === 'manual',
        _name: item.resident_name || 'Walk-in',
        _document: item.document || 'N/A',
      }));
      const merged = [...residentRows, ...kioskRows].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setFeedback(merged);
      setLoading(false);
    }
    loadFeedback();

    // Real-time updates
    const ch1 = supabase
      .channel(`admin-feedback-${barangayId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'resident_feedback',
        filter: `barangay_id=eq.${barangayId}`,
      }, () => { loadFeedback(); })
      .subscribe();
    const ch2 = supabase
      .channel(`admin-kiosk-feedback-${barangayId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'kiosk_feedback',
        filter: `barangay_id=eq.${barangayId}`,
      }, () => { loadFeedback(); })
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [supabase, barangayId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return feedback.filter(item => {
      if (ratingFilter !== 'all' && String(item.rating) !== ratingFilter) return false;
      if (sourceFilter === 'release') { if (item._source !== 'release' || item._manual) return false; }
      else if (sourceFilter === 'kiosk') { if (item._source !== 'kiosk' || item._manual) return false; }
      else if (sourceFilter === 'manual') { if (!item._manual) return false; }
      if (!q) return true;
      const haystack = [item._document, item._name, item.comment].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [feedback, search, ratingFilter, sourceFilter]);

  const stats = useMemo(() => {
    if (!feedback.length) return { avg: 0, total: 0, organic: 0, manual: 0, distribution: [0, 0, 0, 0, 0] };
    const dist = [0, 0, 0, 0, 0];
    let sum = 0;
    feedback.forEach(item => {
      sum += item.rating;
      dist[item.rating - 1] += 1;
    });
    const organic = feedback.filter(i => !i._manual).length;
    const manual = feedback.filter(i => i._manual).length;
    return { avg: sum / feedback.length, total: feedback.length, organic, manual, distribution: dist };
  }, [feedback]);

  const handleExport = () => {
    const rows = feedback.map(item => ({
      date: formatDate(item.created_at),
      source: item._manual ? 'Manual' : item._source === 'kiosk' ? 'Kiosk' : 'Release',
      resident: item._name,
      document: item._document,
      rating: item.rating,
      label: STAR_LABELS[item.rating] || '',
      comment: item.comment || '',
    }));
    downloadCSV(rows, ['date', 'source', 'resident', 'document', 'rating', 'label', 'comment'], 'feedback_export.csv');
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-600 font-semibold">Feedback</p>
            <h2 className="text-xl font-bold text-gray-900">Resident Feedback & Ratings</h2>
            <p className="text-sm text-gray-500">Ratings submitted by residents after claiming documents and from kiosk walk-ins.</p>
          </div>
          {feedback.length > 0 ? (
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={handleExport}
            >
              Export CSV
            </button>
          ) : null}
        </div>

        {/* Summary stats */}
        {feedback.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.avg.toFixed(1)}</p>
              <p className="text-xs text-gray-500">Average Rating</p>
              <StarDisplay rating={Math.round(stats.avg)} />
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Total Reviews</p>
              {stats.manual > 0 ? (
                <p className="text-[11px] text-gray-400 mt-1">
                  {stats.organic} organic · {stats.manual} manual
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center col-span-2">
              <p className="text-xs text-gray-500 mb-2">Rating Distribution</p>
              <div className="space-y-1">
                {[5, 4, 3, 2, 1].map(star => {
                  const count = stats.distribution[star - 1];
                  const pct = stats.total ? (count / stats.total) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-4 text-right font-semibold text-gray-700">{star}</span>
                      <span style={{ color: '#f59e0b' }}>★</span>
                      <div className="relative flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-all"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-gray-500">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {/* Filters */}
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, document, comment..."
            className="w-full max-w-xs rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400"
          />
          <select
            value={ratingFilter}
            onChange={e => setRatingFilter(e.target.value)}
            className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900"
          >
            <option value="all">All ratings</option>
            {[5, 4, 3, 2, 1].map(r => (
              <option key={r} value={String(r)}>{r} star{r > 1 ? 's' : ''}</option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900"
          >
            <option value="all">All sources</option>
            <option value="release">Remote (organic)</option>
            <option value="kiosk">Kiosk (organic)</option>
            <option value="manual">Manual (by admin)</option>
          </select>
        </div>

        {/* Feedback list */}
        {loading ? (
          <p className="mt-4 text-sm text-gray-400">Loading feedback...</p>
        ) : filtered.length ? (
          <div className="mt-4 max-h-130 overflow-y-auto space-y-2">
            {filtered.map(item => {
              return (
                <div key={`${item._source}-${item.id}`} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <StarDisplay rating={item.rating} />
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                          {STAR_LABELS[item.rating]}
                        </span>
                        {item._source === 'kiosk' ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">Kiosk</span>
                        ) : null}
                        {item._manual ? (
                          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-bold text-gray-600">Manual</span>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold text-gray-900">
                        {item._name} — {item._document}
                      </p>
                      {item.comment ? (
                        <p className="text-sm text-gray-600 mt-1">"{item.comment}"</p>
                      ) : null}
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(item.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : feedback.length ? (
          <p className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
            No feedback matches your filter.
          </p>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
            No feedback received yet. Residents can rate their experience after claiming a document.
          </p>
        )}
      </div>
    </section>
  );
}
