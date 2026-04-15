import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PRE_SURVEY_QUESTIONS, POST_SURVEY_QUESTIONS, ADMIN_PRE_SURVEY_QUESTIONS, ADMIN_POST_SURVEY_QUESTIONS, LIKERT_LABELS, getSurveyParts } from '../../data/surveyQuestions';

/**
 * Survey responses viewer for SuperAdmin dashboard.
 * Shows anonymous survey data with export capability.
 * No respondent info is collected or shown.
 */

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

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SurveyResponsesTab({ supabase, barangays, addToast }) {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [barangayFilter, setBarangayFilter] = useState('all');

  // Inline wizard state: walks through Pre → Post surveys in sequence
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState('pre'); // 'pre' | 'post' | 'done'
  const [wizardBarangayId, setWizardBarangayId] = useState('');
  const [wizardSource, setWizardSource] = useState('kiosk');
  const [wizardAnswers, setWizardAnswers] = useState({});
  const [wizardPart, setWizardPart] = useState(0);
  const [wizardSaving, setWizardSaving] = useState(false);
  const wizardScrollRef = useRef(null);

  const wizardIsAdmin = wizardSource === 'admin';
  const wizardQuestions = wizardStep === 'pre'
    ? (wizardIsAdmin ? ADMIN_PRE_SURVEY_QUESTIONS : PRE_SURVEY_QUESTIONS)
    : (wizardIsAdmin ? ADMIN_POST_SURVEY_QUESTIONS : POST_SURVEY_QUESTIONS);
  const wizardParts = useMemo(() => getSurveyParts(wizardQuestions), [wizardQuestions]);
  const wizardPartQuestions = useMemo(() => {
    if (!wizardParts[wizardPart]) return [];
    return wizardQuestions.filter(q => q.part === wizardParts[wizardPart].part);
  }, [wizardQuestions, wizardParts, wizardPart]);

  const wizardTotalAnswered = Object.keys(wizardAnswers).length;
  const wizardTotalQuestions = wizardQuestions.length;
  const wizardAllPartAnswered = wizardPartQuestions.every(q => wizardAnswers[q.id] !== undefined);
  const wizardAllAnswered = wizardTotalAnswered === wizardTotalQuestions;
  const wizardIsLastPart = wizardPart === wizardParts.length - 1;

  // Reset wizard answers when source changes (different question sets)
  const prevWizardSource = useRef(wizardSource);
  useEffect(() => {
    if (wizardOpen && prevWizardSource.current !== wizardSource) {
      setWizardAnswers({});
      setWizardPart(0);
    }
    prevWizardSource.current = wizardSource;
  }, [wizardSource, wizardOpen]);

  function startWizard() {
    setWizardOpen(true);
    setWizardStep('pre');
    setWizardAnswers({});
    setWizardPart(0);
    setWizardSaving(false);
  }

  function closeWizard() {
    setWizardOpen(false);
    setWizardStep('pre');
    setWizardAnswers({});
    setWizardPart(0);
    setWizardSaving(false);
  }

  async function submitWizardStep() {
    const targetBarangay = wizardBarangayId || (barangays?.length === 1 ? barangays[0].id : null);
    if (!targetBarangay) {
      addToast?.('Please select a barangay first.', 'error');
      return;
    }
    setWizardSaving(true);
    const { error } = await supabase.from('survey_responses').insert({
      barangay_id: targetBarangay,
      survey_type: wizardStep,
      source: wizardSource,
      responses: wizardAnswers,
    });
    setWizardSaving(false);
    if (error) {
      addToast?.('Failed to save: ' + error.message, 'error');
      return;
    }
    addToast?.(`${wizardStep === 'pre' ? 'Pre-Usage' : 'Post-Usage'} survey saved!`, 'success');
    loadResponses();
    if (wizardStep === 'pre') {
      setWizardStep('post');
      setWizardAnswers({});
      setWizardPart(0);
      wizardScrollRef.current?.scrollTo({ top: 0 });
    } else {
      setWizardStep('done');
    }
  }

  const loadResponses = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('survey_responses')
      .select('id, barangay_id, survey_type, source, responses, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!error && data) setResponses(data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadResponses();
  }, [loadResponses]);

  const filteredResponses = useMemo(() => {
    return responses.filter(r => {
      if (typeFilter !== 'all' && r.survey_type !== typeFilter) return false;
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
      if (barangayFilter !== 'all' && r.barangay_id !== barangayFilter) return false;
      return true;
    });
  }, [responses, typeFilter, sourceFilter, barangayFilter]);

  // Stats — computed from filteredResponses so they update with filters
  const stats = useMemo(() => {
    const pre = filteredResponses.filter(r => r.survey_type === 'pre').length;
    const post = filteredResponses.filter(r => r.survey_type === 'post').length;
    const kiosk = filteredResponses.filter(r => r.source === 'kiosk').length;
    const remote = filteredResponses.filter(r => r.source === 'remote').length;
    const admin = filteredResponses.filter(r => r.source === 'admin').length;
    return { total: filteredResponses.length, pre, post, kiosk, remote, admin };
  }, [filteredResponses]);

  // Overall average rating across all filtered survey responses
  const overallSurveyStats = useMemo(() => {
    if (!filteredResponses.length) return null;
    let sum = 0;
    let count = 0;
    const dist = [0, 0, 0, 0, 0]; // 1-5 star distribution
    filteredResponses.forEach(r => {
      const resp = r.responses || {};
      Object.values(resp).forEach(v => {
        const val = Number(v);
        if (val >= 1 && val <= 5) {
          sum += val;
          count++;
          dist[val - 1]++;
        }
      });
    });
    return {
      avg: count ? sum / count : 0,
      totalResponses: filteredResponses.length,
      totalRatings: count,
      distribution: dist,
    };
  }, [filteredResponses]);

  // Compute average per question for filtered responses
  const questionAverages = useMemo(() => {
    if (typeFilter === 'all' || !filteredResponses.length) return null;

    // Determine which question set to use based on source filter
    const isAdmin = sourceFilter === 'admin';
    const questions = typeFilter === 'post'
      ? (isAdmin ? ADMIN_POST_SURVEY_QUESTIONS : POST_SURVEY_QUESTIONS)
      : (isAdmin ? ADMIN_PRE_SURVEY_QUESTIONS : PRE_SURVEY_QUESTIONS);

    const sums = {};
    const counts = {};
    questions.forEach(q => { sums[q.id] = 0; counts[q.id] = 0; });

    filteredResponses
      .filter(r => r.survey_type === typeFilter)
      .filter(r => isAdmin ? r.source === 'admin' : r.source !== 'admin')
      .forEach(r => {
        const resp = r.responses || {};
        questions.forEach(q => {
          if (resp[q.id] !== undefined) {
            sums[q.id] += Number(resp[q.id]);
            counts[q.id] += 1;
          }
        });
      });

    return questions.map(q => ({
      ...q,
      avg: counts[q.id] ? (sums[q.id] / counts[q.id]).toFixed(2) : 'N/A',
      count: counts[q.id],
    }));
  }, [filteredResponses, typeFilter, sourceFilter]);

  function handleExport() {
    if (!filteredResponses.length) return;

    const rows = filteredResponses.map(r => {
      const barangayName = barangays?.find(b => b.id === r.barangay_id)?.name || 'Unknown';
      const resp = r.responses || {};
      const row = {
        date: formatTimestamp(r.created_at),
        survey_type: r.survey_type === 'pre' ? 'Pre-Usage' : 'Post-Usage',
        source: r.source === 'admin' ? 'Admin' : r.source === 'kiosk' ? 'Kiosk' : 'Remote',
        barangay: barangayName,
      };
      // Add each question response as a column (no personal info)
      const isAdmin = r.source === 'admin';
      const questions = r.survey_type === 'pre'
        ? (isAdmin ? ADMIN_PRE_SURVEY_QUESTIONS : PRE_SURVEY_QUESTIONS)
        : (isAdmin ? ADMIN_POST_SURVEY_QUESTIONS : POST_SURVEY_QUESTIONS);
      questions.forEach(q => {
        row[q.id] = resp[q.id] !== undefined ? resp[q.id] : '';
      });
      return row;
    });

    // Build headers — generic ones + question IDs
    const allQuestionIds = [...new Set(filteredResponses.flatMap(r => {
      const isA = r.source === 'admin';
      const questions = r.survey_type === 'pre'
        ? (isA ? ADMIN_PRE_SURVEY_QUESTIONS : PRE_SURVEY_QUESTIONS)
        : (isA ? ADMIN_POST_SURVEY_QUESTIONS : POST_SURVEY_QUESTIONS);
      return questions.map(q => q.id);
    }))];
    const headers = ['date', 'survey_type', 'source', 'barangay', ...allQuestionIds];

    downloadCSV(rows, headers, `survey_responses_export_${new Date().toISOString().slice(0, 10)}.csv`);
    addToast?.('Survey responses exported (anonymous).', 'success');
  }

  function handleExportSummary() {
    if (!questionAverages) return;
    const surveyLabel = typeFilter === 'pre' ? 'Pre-Usage' : 'Post-Usage';
    const rows = questionAverages.map(q => ({
      question_id: q.id,
      part: q.part,
      question: q.text,
      question_filipino: q.textFil,
      average_rating: q.avg,
      response_count: q.count,
    }));
    downloadCSV(rows, ['question_id', 'part', 'question', 'question_filipino', 'average_rating', 'response_count'], `survey_summary_${surveyLabel.toLowerCase().replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
    addToast?.(`${surveyLabel} summary exported.`, 'success');
  }

  return (
    <section className="rounded-3xl border border-indigo-100 bg-white p-6 shadow-lg">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold">Surveys</p>
          <h2 className="text-xl font-bold text-gray-900">Survey Responses</h2>
          <p className="text-sm text-gray-500">Anonymous pre-usage and post-usage survey responses from residents, kiosk users, and barangay officials/staff.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
            onClick={startWizard}
            disabled={wizardOpen}
          >
            📝 Answer Both Surveys
          </button>
          <button
            type="button"
            className="rounded-full border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            onClick={loadResponses}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          {filteredResponses.length ? (
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={handleExport}
            >
              Export Raw CSV
            </button>
          ) : null}
          {questionAverages ? (
            <button
              type="button"
              className="rounded-full border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
              onClick={handleExportSummary}
            >
              Export Summary CSV
            </button>
          ) : null}
        </div>
      </div>

      {/* Stats cards */}
      {filteredResponses.length > 0 ? (
        <div className="mt-4 space-y-3">
          {/* Overall average + distribution row */}
          {overallSurveyStats ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{overallSurveyStats.avg.toFixed(2)}</p>
                <p className="text-xs text-gray-500">Overall Avg Rating</p>
                <span style={{ letterSpacing: '2px' }}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <span key={s} style={{ color: s <= Math.round(overallSurveyStats.avg) ? '#f59e0b' : '#d1d5db' }}>★</span>
                  ))}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{overallSurveyStats.totalResponses}</p>
                <p className="text-xs text-gray-500">Total Responses</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center col-span-2">
                <p className="text-xs text-gray-500 mb-2">Likert Distribution (all answers)</p>
                <div className="space-y-1">
                  {[5, 4, 3, 2, 1].map(star => {
                    const count = overallSurveyStats.distribution[star - 1];
                    const pct = overallSurveyStats.totalRatings ? (count / overallSurveyStats.totalRatings) * 100 : 0;
                    const labels = { 5: 'SA', 4: 'A', 3: 'N', 2: 'D', 1: 'SD' };
                    return (
                      <div key={star} className="flex items-center gap-2 text-xs">
                        <span className="w-5 text-right font-semibold text-gray-700">{star}</span>
                        <span className="w-6 text-gray-400">{labels[star]}</span>
                        <div className="relative flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                          <div className="absolute inset-y-0 left-0 rounded-full bg-indigo-400 transition-all" style={{ width: `${Math.max(pct, 1)}%` }} />
                        </div>
                        <span className="w-10 text-right text-gray-500">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
          {/* Breakdown cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{stats.pre}</p>
              <p className="text-xs text-gray-500">Pre-Usage</p>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3 text-center">
              <p className="text-2xl font-bold text-violet-700">{stats.post}</p>
              <p className="text-xs text-gray-500">Post-Usage</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{stats.remote}</p>
              <p className="text-xs text-gray-500">Remote</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-center">
              <p className="text-2xl font-bold text-amber-700">{stats.kiosk}</p>
              <p className="text-xs text-gray-500">Kiosk</p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3 text-center">
              <p className="text-2xl font-bold text-indigo-700">{stats.admin}</p>
              <p className="text-xs text-gray-500">Admin / Official</p>
            </div>

          </div>
        </div>
      ) : null}

      {/* ─── Inline Survey Wizard ─── */}
      {wizardOpen ? (
        <div className="mt-4 rounded-2xl border-2 border-indigo-200 bg-linear-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm">
          {wizardStep === 'done' ? (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">🎉</p>
              <h3 className="text-lg font-bold text-gray-900">Both surveys completed!</h3>
              <p className="text-sm text-gray-500 mt-1">Pre-Usage and Post-Usage responses have been saved.</p>
              <button
                type="button"
                className="mt-4 rounded-full bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700 mr-2"
                onClick={startWizard}
              >
                Answer Again
              </button>
              <button
                type="button"
                className="mt-4 rounded-full border border-gray-200 px-6 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                onClick={closeWizard}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Wizard header */}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${
                      wizardStep === 'pre' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                    }`}>
                      {wizardStep === 'pre' ? 'Step 1 of 2 — Pre-Usage Survey' : 'Step 2 of 2 — Post-Usage Survey'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {wizardTotalAnswered}/{wizardTotalQuestions} answered
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {wizardStep === 'pre'
                      ? 'Rate these statements about the current experience with barangay document requests.'
                      : 'Rate these statements about the experience after using the Smart Barangay Kiosk System.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(barangays?.length > 1) ? (
                    <select
                      value={wizardBarangayId}
                      onChange={e => setWizardBarangayId(e.target.value)}
                      className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                    >
                      <option value="">Select barangay…</option>
                      {(barangays || []).map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  ) : null}
                  <select
                    value={wizardSource}
                    onChange={e => setWizardSource(e.target.value)}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                  >
                    <option value="kiosk">Source: Kiosk</option>
                    <option value="remote">Source: Remote</option>
                    <option value="admin">Source: Admin</option>
                  </select>
                  <button
                    type="button"
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
                    onClick={closeWizard}
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-gray-100 mb-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${wizardTotalQuestions ? (wizardTotalAnswered / wizardTotalQuestions) * 100 : 0}%` }}
                />
              </div>

              {/* Part tabs */}
              <div className="flex flex-wrap gap-1 mb-3">
                {wizardParts.map((p, idx) => {
                  const partQs = wizardQuestions.filter(q => q.part === p.part);
                  const partDone = partQs.every(q => wizardAnswers[q.id] !== undefined);
                  const isCurrent = idx === wizardPart;
                  return (
                    <button
                      key={p.part}
                      type="button"
                      onClick={() => { setWizardPart(idx); wizardScrollRef.current?.scrollTo({ top: 0 }); }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        isCurrent
                          ? 'bg-indigo-600 text-white'
                          : partDone
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {partDone && !isCurrent ? '✓ ' : ''}{p.part}
                    </button>
                  );
                })}
              </div>

              {/* Questions for current part */}
              <div ref={wizardScrollRef} className="max-h-105 overflow-y-auto space-y-3 pr-1">
                {wizardPartQuestions.map((q) => {
                  const globalIdx = wizardQuestions.findIndex(wq => wq.id === q.id) + 1;
                  return (
                    <div key={q.id} className="rounded-xl border border-gray-100 bg-white p-3">
                      <p className="text-sm text-gray-800 mb-0.5">
                        <span className="text-gray-400 font-mono text-xs mr-1.5">{globalIdx}.</span>
                        {q.text}
                      </p>
                      <p className="text-xs text-gray-400 italic mb-2">{q.textFil}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[1, 2, 3, 4, 5].map(val => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setWizardAnswers(prev => ({ ...prev, [q.id]: val }))}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                              wizardAnswers[q.id] === val
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                            }`}
                          >
                            {val} — {LIKERT_LABELS[val]}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  disabled={wizardPart === 0}
                  onClick={() => { setWizardPart(p => p - 1); wizardScrollRef.current?.scrollTo({ top: 0 }); }}
                  className="rounded-full border border-gray-200 px-4 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>
                <div className="flex gap-2">
                  {wizardIsLastPart && wizardAllAnswered ? (
                    <button
                      type="button"
                      disabled={wizardSaving}
                      onClick={submitWizardStep}
                      className="rounded-full bg-indigo-600 px-5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {wizardSaving ? 'Saving…' : wizardStep === 'pre' ? 'Submit Pre → Next: Post-Usage' : 'Submit Post-Usage ✓'}
                    </button>
                  ) : !wizardIsLastPart ? (
                    <button
                      type="button"
                      disabled={!wizardAllPartAnswered}
                      onClick={() => { setWizardPart(p => p + 1); wizardScrollRef.current?.scrollTo({ top: 0 }); }}
                      className="rounded-full bg-indigo-600 px-5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next Part →
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400 italic">Answer all questions to submit</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900"
        >
          <option value="all">All survey types</option>
          <option value="pre">Pre-Usage</option>
          <option value="post">Post-Usage</option>
        </select>
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900"
        >
          <option value="all">All sources</option>
          <option value="remote">Remote</option>
          <option value="kiosk">Kiosk</option>
          <option value="admin">Admin / Official</option>
        </select>
        <select
          value={barangayFilter}
          onChange={e => setBarangayFilter(e.target.value)}
          className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-900"
        >
          <option value="all">All barangays</option>
          {(barangays || []).map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Question averages table (when a specific type is filtered) */}
      {questionAverages ? (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-2">
            {sourceFilter === 'admin' ? 'Admin ' : ''}{typeFilter === 'pre' ? 'Pre-Usage' : 'Post-Usage'} Question Averages
            <span className="ml-2 text-gray-400 normal-case">
              ({filteredResponses.filter(r => r.survey_type === typeFilter && (sourceFilter === 'admin' ? r.source === 'admin' : r.source !== 'admin')).length} responses)
            </span>
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-semibold">#</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-semibold">Part</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-semibold">Statement</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-500 font-semibold">Avg</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-500 font-semibold">n</th>
                </tr>
              </thead>
              <tbody>
                {questionAverages.map((q, idx) => (
                  <tr key={q.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-3 py-2 text-gray-400 font-mono text-xs">{idx + 1}</td>
                    <td className="px-3 py-2 text-xs text-indigo-600 font-medium whitespace-nowrap">{q.part}</td>
                    <td className="px-3 py-2 text-gray-700">
                      <p className="text-sm">{q.text}</p>
                      <p className="text-xs text-gray-400 italic">{q.textFil}</p>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-sm font-bold ${
                        q.avg === 'N/A' ? 'bg-gray-100 text-gray-400'
                        : Number(q.avg) >= 4 ? 'bg-emerald-100 text-emerald-700'
                        : Number(q.avg) >= 3 ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                      }`}>
                        {q.avg}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-gray-400 text-xs">{q.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Raw response list */}
      {loading ? (
        <p className="mt-4 text-sm text-gray-400">Loading survey responses…</p>
      ) : filteredResponses.length ? (
        <div className="mt-4">
          <p className="text-xs text-gray-500 mb-2">Showing {filteredResponses.length} response{filteredResponses.length !== 1 ? 's' : ''}</p>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredResponses.map(r => {
              const brgyName = barangays?.find(b => b.id === r.barangay_id)?.name || 'Unknown';
              const isAdmin = r.source === 'admin';
              const questions = r.survey_type === 'pre'
                ? (isAdmin ? ADMIN_PRE_SURVEY_QUESTIONS : PRE_SURVEY_QUESTIONS)
                : (isAdmin ? ADMIN_POST_SURVEY_QUESTIONS : POST_SURVEY_QUESTIONS);
              const resp = r.responses || {};
              const answeredCount = Object.keys(resp).length;
              const sumValues = Object.values(resp).reduce((s, v) => s + Number(v), 0);
              const avg = answeredCount ? (sumValues / answeredCount).toFixed(1) : 'N/A';

              return (
                <details key={r.id} className="rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden">
                  <summary className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="inline-flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        r.survey_type === 'pre' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                      }`}>
                        {r.survey_type === 'pre' ? 'Pre-Usage' : 'Post-Usage'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        r.source === 'admin' ? 'bg-indigo-100 text-indigo-700' : r.source === 'kiosk' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {r.source === 'admin' ? 'Admin' : r.source === 'kiosk' ? 'Kiosk' : 'Remote'}
                      </span>
                      <span className="text-xs text-gray-500">{brgyName}</span>
                      <span className="text-xs text-gray-400">{formatTimestamp(r.created_at)}</span>
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                        Avg: {avg}
                      </span>
                      <span className="text-[11px] text-gray-400">{answeredCount}/{questions.length} answered</span>
                    </div>
                  </summary>
                  <div className="px-4 py-3 border-t border-gray-100 bg-white">
                    <div className="space-y-1">
                      {questions.map((q, i) => (
                        <div key={q.id} className="flex items-start gap-2 text-xs">
                          <span className="text-gray-400 font-mono w-6 text-right shrink-0">{i + 1}.</span>
                          <span className="flex-1 text-gray-600">{q.text}</span>
                          <span className={`font-bold shrink-0 ${
                            resp[q.id] !== undefined
                              ? resp[q.id] >= 4 ? 'text-emerald-600' : resp[q.id] >= 3 ? 'text-amber-600' : 'text-red-600'
                              : 'text-gray-300'
                          }`}>
                            {resp[q.id] !== undefined ? `${resp[q.id]} — ${LIKERT_LABELS[resp[q.id]]}` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      ) : responses.length ? (
        <p className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
          No responses match your filter.
        </p>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">
          No survey responses received yet. Surveys appear when residents use the kiosk or remote portal.
        </p>
      )}
    </section>
  );
}
