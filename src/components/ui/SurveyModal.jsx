import { useState, useMemo, useEffect, useRef } from 'react';
import { LIKERT_LABELS, getSurveyParts } from '../../data/surveyQuestions';

/**
 * Reusable survey modal for both pre-usage and post-usage surveys.
 * Works in both kiosk and remote portal contexts.
 *
 * Props:
 *  - open: boolean
 *  - title: string
 *  - subtitle: string (optional)
 *  - questions: array of { id, part, partFil, text, textFil }
 *  - onSubmit: (responses: Record<string, number>) => void|Promise
 *  - onDismiss: () => void (temporary dismiss — for "Answer later")
 *  - variant: 'remote' | 'kiosk' (styling variant)
 *  - optional: boolean (if true, shows a "Skip survey" link)
 */
export default function SurveyModal({
  open,
  title,
  subtitle,
  questions,
  onSubmit,
  onDismiss,
  variant = 'remote',
  optional = false,
}) {
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [currentPart, setCurrentPart] = useState(0);
  const prevOpenRef = useRef(false);
  const scrollRef = useRef(null);

  // Reset all internal state when the modal opens (or questions change while open)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setAnswers({});
      setCurrentPart(0);
      setSaving(false);
    }
    prevOpenRef.current = open;
  }, [open]);

  // Also reset if questions array identity changes while open
  const questionsKey = questions?.length ? questions[0].id + '-' + questions.length : '';
  useEffect(() => {
    if (open) {
      setAnswers({});
      setCurrentPart(0);
      setSaving(false);
    }
  }, [questionsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const parts = useMemo(() => getSurveyParts(questions), [questions]);

  const partQuestions = useMemo(() => {
    if (!parts[currentPart]) return [];
    return questions.filter(q => q.part === parts[currentPart].part);
  }, [questions, parts, currentPart]);

  const allAnswered = useMemo(() => {
    return partQuestions.every(q => answers[q.id] !== undefined);
  }, [partQuestions, answers]);

  const totalAnswered = useMemo(() => Object.keys(answers).length, [answers]);
  const progress = questions.length ? Math.round((totalAnswered / questions.length) * 100) : 0;

  if (!open) return null;

  function handleSelect(questionId, value) {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  }

  async function handleNext() {
    if (currentPart < parts.length - 1) {
      setCurrentPart(prev => prev + 1);
      scrollRef.current?.scrollTo({ top: 0 });
    } else {
      // Submit
      setSaving(true);
      try {
        await onSubmit(answers);
      } catch { /* non-critical */ }
      setSaving(false);
    }
  }

  function handlePrev() {
    if (currentPart > 0) {
      setCurrentPart(prev => prev - 1);
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }

  const isKiosk = variant === 'kiosk';
  const isLastPart = currentPart === parts.length - 1;

  return (
    <div
      className={isKiosk ? 'kiosk-confirm-modal' : undefined}
      role="dialog"
      aria-modal="true"
      style={isKiosk ? {} : {
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        zIndex: 9999,
      }}
    >
      <div
        className={isKiosk ? 'kiosk-confirm-card' : undefined}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: isKiosk ? '720px' : '600px',
          width: '95%',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          ...(!isKiosk ? {
            background: '#fff',
            borderRadius: '24px',
            border: '1px solid rgba(226, 232, 240, 0.9)',
            boxShadow: '0 30px 80px rgba(15, 23, 42, 0.25)',
          } : {}),
        }}
      >
        {/* Header */}
        <div style={{ padding: isKiosk ? '1.25rem 1.25rem 0.5rem' : '1.25rem 1.5rem 0.5rem', flexShrink: 0 }}>
          <h3
            style={{
              fontSize: isKiosk ? '1.3rem' : '1.1rem',
              fontWeight: 700,
              color: '#1e293b',
              marginBottom: '0.25rem',
              textAlign: 'center',
            }}
          >
            {title}
          </h3>
          {subtitle ? (
            <p style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center', marginBottom: '0.5rem' }}>{subtitle}</p>
          ) : null}

          {/* Progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#e2e8f0', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {totalAnswered}/{questions.length}
            </span>
          </div>

          {/* Part indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {parts.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setCurrentPart(i); scrollRef.current?.scrollTo({ top: 0 }); }}
                style={{
                  fontSize: '0.7rem',
                  fontWeight: i === currentPart ? 700 : 500,
                  color: i === currentPart ? '#6366f1' : '#94a3b8',
                  background: i === currentPart ? '#eef2ff' : 'transparent',
                  border: i === currentPart ? '1px solid #c7d2fe' : '1px solid transparent',
                  borderRadius: '999px',
                  padding: '0.2rem 0.6rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                Part {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Part title */}
        <div style={{ padding: '0.5rem 1.5rem 0', flexShrink: 0 }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Part {currentPart + 1}: {parts[currentPart]?.part}
          </p>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
            {parts[currentPart]?.partFil}
          </p>
        </div>

        {/* Questions */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: isKiosk ? '0 1.25rem' : '0 1.5rem' }}>
          {/* Likert scale legend — sticky with shadow to clip scrolled content */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr repeat(5, 48px)',
            gap: '0.25rem',
            fontSize: '0.65rem',
            color: '#94a3b8',
            fontWeight: 600,
            textAlign: 'center',
            position: 'sticky',
            top: 0,
            background: 'white',
            padding: '0.5rem 0 0.35rem',
            zIndex: 2,
            boxShadow: '0 2px 4px rgba(255,255,255,0.95), 0 4px 0 -1px white',
            borderBottom: '1px solid #f1f5f9',
          }}>
            <span />
            {[1, 2, 3, 4, 5].map(v => (
              <span key={v} style={{ lineHeight: 1.2 }}>
                {v}<br />{LIKERT_LABELS[v].split(' ').pop()}
              </span>
            ))}
          </div>

          {partQuestions.map((q, idx) => {
            const globalIdx = questions.findIndex(qi => qi.id === q.id) + 1;
            return (
              <div
                key={q.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr repeat(5, 48px)',
                  gap: '0.25rem',
                  alignItems: 'center',
                  padding: '0.6rem 0',
                  borderBottom: idx < partQuestions.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}
              >
                <div style={{ paddingRight: '0.5rem' }}>
                  <p style={{ fontSize: isKiosk ? '0.85rem' : '0.8rem', color: '#334155', margin: 0, lineHeight: 1.4 }}>
                    <strong style={{ color: '#6366f1' }}>{globalIdx}.</strong> {q.text}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic', margin: '0.15rem 0 0' }}>
                    {q.textFil}
                  </p>
                </div>
                {[1, 2, 3, 4, 5].map(value => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleSelect(q.id, value)}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      border: answers[q.id] === value ? '2px solid #6366f1' : '2px solid #e2e8f0',
                      background: answers[q.id] === value ? '#6366f1' : 'white',
                      color: answers[q.id] === value ? 'white' : '#64748b',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto',
                      transition: 'all 0.15s',
                    }}
                    aria-label={`${LIKERT_LABELS[value]} for question ${globalIdx}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: isKiosk ? '0.75rem 1.25rem' : '0.75rem 1.5rem',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.8rem',
                  color: '#94a3b8',
                  background: 'none',
                  border: '1px solid #e2e8f0',
                  borderRadius: '999px',
                  cursor: 'pointer',
                }}
              >
                Answer later
              </button>
            ) : null}
            {optional ? (
              <button
                type="button"
                onClick={() => onSubmit(null)}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.8rem',
                  color: '#94a3b8',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Skip survey
              </button>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {currentPart > 0 ? (
              <button
                type="button"
                onClick={handlePrev}
                style={{
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#6366f1',
                  background: '#eef2ff',
                  border: '1px solid #c7d2fe',
                  borderRadius: '999px',
                  cursor: 'pointer',
                }}
              >
                ← Previous
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleNext}
              disabled={!allAnswered || saving}
              style={{
                padding: '0.5rem 1.5rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'white',
                background: allAnswered ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#cbd5e1',
                border: 'none',
                borderRadius: '999px',
                cursor: allAnswered && !saving ? 'pointer' : 'not-allowed',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Submitting…' : isLastPart ? 'Submit Survey' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
