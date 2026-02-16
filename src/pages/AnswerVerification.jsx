import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useKatex, renderWithKatex } from '../utils/shared';
import {
  normalizeSubject,
  subjectColor,
  QUESTION_TYPE_META,
} from '../utils/examUtils';

/* ═══════════════════════════════════════════════════════════════════════════
   Answer Verification — Admin tool for reviewing & correcting AI answers
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Render text with inline KaTeX math */
function MathText({ text }) {
  const katexReady = useKatex();
  if (!text) return null;
  if (!/\$/.test(text) && !/\\\(/.test(text)) return <>{text}</>;
  return <span dangerouslySetInnerHTML={renderWithKatex(text, katexReady)} />;
}

/** Flatten catalog into a flat list of { exam, section, question, path } for review */
function flattenForReview(catalog) {
  const items = [];
  if (!catalog) return items;
  catalog.forEach((exam, examIdx) => {
    (exam.sections || []).forEach((section, secIdx) => {
      (section.questions || []).forEach((q, qIdx) => {
        if (q.model_answer) {
          items.push({
            examIdx, secIdx, qIdx, subIdx: null,
            exam, section, question: q,
            id: `${examIdx}-${secIdx}-${qIdx}`,
          });
        }
        (q.sub_questions || []).forEach((sq, sIdx) => {
          if (sq.model_answer) {
            items.push({
              examIdx, secIdx, qIdx, subIdx: sIdx,
              exam, section, question: sq,
              parentQuestion: q,
              id: `${examIdx}-${secIdx}-${qIdx}-${sIdx}`,
            });
          }
        });
      });
    });
  });
  return items;
}

/** Compute review stats from flat list */
function reviewStats(items) {
  let verified = 0, rejected = 0, pending = 0;
  for (const item of items) {
    if (item.question.verified === true) verified++;
    else if (item.question.verified === 'rejected') rejected++;
    else pending++;
  }
  return { total: items.length, verified, rejected, pending };
}

// ─── Filter / subject selector component ────────────────────────────────────

function FilterBar({ stats, filters, onFilterChange, subjects, examItems }) {
  return (
    <div className="av-filter-bar">
      <div className="av-filter-bar__stats">
        <span className="av-stat av-stat--verified">✓ {stats.verified} verified</span>
        <span className="av-stat av-stat--pending">◌ {stats.pending} pending</span>
        <span className="av-stat av-stat--rejected">✗ {stats.rejected} rejected</span>
        <span className="av-stat av-stat--total">{stats.total} total</span>
      </div>
      <div className="av-filter-bar__controls">
        <select
          className="av-select"
          value={filters.status}
          onChange={e => onFilterChange({ ...filters, status: e.target.value })}
        >
          <option value="pending">Pending review</option>
          <option value="verified">Verified ✓</option>
          <option value="rejected">Rejected ✗</option>
          <option value="all">All questions</option>
        </select>
        <select
          className="av-select"
          value={filters.subject}
          onChange={e => onFilterChange({ ...filters, subject: e.target.value })}
        >
          <option value="">All subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          className="av-select"
          value={filters.type}
          onChange={e => onFilterChange({ ...filters, type: e.target.value })}
        >
          <option value="">All types</option>
          <option value="proof">Proof / Démonstration</option>
          <option value="calculation">Calculation</option>
          <option value="fill_blank">Fill in blank</option>
          <option value="short_answer">Short answer</option>
          <option value="essay">Essay / Long answer</option>
        </select>
      </div>
    </div>
  );
}

// ─── Answer Part Editor (for editing alternatives) ──────────────────────────

function AnswerPartEditor({ part, partIndex, onChange }) {
  const [editing, setEditing] = useState(false);
  const [localAnswer, setLocalAnswer] = useState(part.answer || '');
  const [localAlts, setLocalAlts] = useState((part.alternatives || []).join('\n'));

  useEffect(() => {
    setLocalAnswer(part.answer || '');
    setLocalAlts((part.alternatives || []).join('\n'));
  }, [part]);

  const handleSave = () => {
    const newAlts = localAlts
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    onChange(partIndex, { ...part, answer: localAnswer.trim(), alternatives: newAlts });
    setEditing(false);
  };

  const handleCancel = () => {
    setLocalAnswer(part.answer || '');
    setLocalAlts((part.alternatives || []).join('\n'));
    setEditing(false);
  };

  return (
    <div className={`av-part ${editing ? 'av-part--editing' : ''}`}>
      <div className="av-part__header">
        <span className="av-part__label">{part.label || `Part ${partIndex + 1}`}</span>
        {!editing && (
          <button className="av-btn av-btn--sm av-btn--ghost" onClick={() => setEditing(true)}>
            ✏️ Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="av-part__edit-form">
          <label className="av-label">Primary answer</label>
          <input
            className="av-input"
            value={localAnswer}
            onChange={e => setLocalAnswer(e.target.value)}
            placeholder="Correct answer"
          />

          <label className="av-label" style={{ marginTop: '0.5rem' }}>
            Alternatives (one per line)
          </label>
          <textarea
            className="av-textarea"
            value={localAlts}
            onChange={e => setLocalAlts(e.target.value)}
            placeholder="Alternative accepted answers, one per line"
            rows={Math.max(3, (part.alternatives || []).length + 1)}
          />

          <div className="av-part__edit-actions">
            <button className="av-btn av-btn--sm av-btn--primary" onClick={handleSave}>Save</button>
            <button className="av-btn av-btn--sm av-btn--ghost" onClick={handleCancel}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="av-part__display">
          <div className="av-part__answer">
            <strong>Answer:</strong> <MathText text={part.answer} />
          </div>
          {part.alternatives && part.alternatives.length > 0 && (
            <div className="av-part__alts">
              <span className="av-part__alts-label">Also accepts:</span>
              {part.alternatives.map((alt, i) => (
                <span key={i} className="av-part__alt-chip"><MathText text={alt} /></span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Approach viewer ────────────────────────────────────────────────────────

function ApproachViewer({ approaches }) {
  const [expanded, setExpanded] = useState(null);

  if (!approaches || approaches.length === 0) return null;

  return (
    <div className="av-approaches">
      <h4 className="av-approaches__title">Solution Approaches ({approaches.length})</h4>
      {approaches.map((approach, i) => (
        <div key={i} className="av-approach">
          <button
            className="av-approach__toggle"
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <span className="av-approach__name">
              {expanded === i ? '▾' : '▸'} {approach.name || `Approach ${i + 1}`}
            </span>
            <span className="av-approach__step-count">{(approach.steps || []).length} steps</span>
          </button>
          {expanded === i && (
            <ol className="av-approach__steps">
              {(approach.steps || []).map((step, j) => (
                <li key={j} className="av-approach__step">
                  <MathText text={step} />
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Single question review card ────────────────────────────────────────────

function ReviewCard({ item, onAction, currentIndex, totalFiltered }) {
  const q = item.question;
  const exam = item.exam;
  const section = item.section;
  const subject = normalizeSubject(exam.subject || '');
  const color = subjectColor(subject);
  const typeMeta = QUESTION_TYPE_META[q.type] || { icon: '❓', label: q.type };

  // Local editable state for answer_parts
  const [editedParts, setEditedParts] = useState(null);
  const [editedFinalAnswer, setEditedFinalAnswer] = useState(null);
  const [showModelAnswer, setShowModelAnswer] = useState(false);

  // Reset edits when the item changes
  useEffect(() => {
    setEditedParts(null);
    setEditedFinalAnswer(null);
    setShowModelAnswer(false);
  }, [item.id]);

  const parts = editedParts || q.answer_parts || [];
  const finalAnswer = editedFinalAnswer !== null ? editedFinalAnswer : (q.final_answer || '');
  const hasEdits = editedParts !== null || editedFinalAnswer !== null;

  const handlePartChange = (idx, newPart) => {
    const updated = [...parts];
    updated[idx] = newPart;
    setEditedParts(updated);
  };

  const handleApprove = () => {
    onAction('approve', {
      answer_parts: hasEdits ? parts : undefined,
      final_answer: editedFinalAnswer !== null ? editedFinalAnswer : undefined,
    });
  };

  const handleReject = () => {
    onAction('reject', {});
  };

  return (
    <div className="av-card">
      {/* Header */}
      <div className="av-card__header">
        <div className="av-card__meta">
          <span className="av-card__badge" style={{ backgroundColor: color + '22', color: color, borderColor: color + '44' }}>
            {subject}
          </span>
          <span className="av-card__type">
            {typeMeta.icon} {typeMeta.label}
          </span>
          <span className="av-card__exam-title" title={exam.title}>
            {exam.title?.substring(0, 60)}{exam.title?.length > 60 ? '…' : ''}
          </span>
        </div>
        <div className="av-card__nav-info">
          {currentIndex + 1} / {totalFiltered}
        </div>
      </div>

      {/* Section context */}
      {section?.instructions && (
        <div className="av-card__context">
          <strong>Section:</strong> {section.title || 'Untitled'}
          <details className="av-card__instructions">
            <summary>Section instructions</summary>
            <MathText text={section.instructions} />
          </details>
        </div>
      )}

      {/* Parent question (for sub_questions) */}
      {item.parentQuestion && (
        <div className="av-card__parent">
          <span className="av-card__parent-label">Parent question:</span>
          <MathText text={item.parentQuestion.question} />
        </div>
      )}

      {/* Question text */}
      <div className="av-card__question">
        <h3 className="av-card__question-text">
          <MathText text={q.question || q.text || '(no question text)'} />
        </h3>
        {q.figure_description && (
          <div className="av-card__figure">
            <span className="av-card__figure-label">📊 Figure:</span>
            <span className="av-card__figure-text">{q.figure_description.substring(0, 200)}</span>
          </div>
        )}
      </div>

      {/* Model answer (full text, collapsible) */}
      <div className="av-card__model-answer">
        <button
          className="av-btn av-btn--ghost"
          onClick={() => setShowModelAnswer(!showModelAnswer)}
        >
          {showModelAnswer ? '▾ Hide' : '▸ Show'} full model answer
        </button>
        {showModelAnswer && (
          <div className="av-card__model-answer-text">
            <MathText text={q.model_answer} />
          </div>
        )}
      </div>

      {/* Approaches */}
      <ApproachViewer approaches={q.approaches} />

      {/* Answer parts (the graded blanks) */}
      {parts.length > 0 && (
        <div className="av-card__parts">
          <h4 className="av-card__parts-title">
            Graded Answer Parts ({parts.length} blank{parts.length !== 1 ? 's' : ''})
          </h4>
          {parts.map((part, i) => (
            <AnswerPartEditor
              key={i}
              part={part}
              partIndex={i}
              onChange={handlePartChange}
            />
          ))}
        </div>
      )}

      {/* Final answer */}
      {(q.final_answer || editedFinalAnswer !== null) && (
        <div className="av-card__final-answer">
          <label className="av-label">Final Answer</label>
          <div className="av-card__final-answer-row">
            <input
              className="av-input"
              value={finalAnswer}
              onChange={e => setEditedFinalAnswer(e.target.value)}
              placeholder="Final answer"
            />
          </div>
        </div>
      )}

      {/* Scaffold preview */}
      {q.scaffold_text && (
        <details className="av-card__scaffold-preview">
          <summary>Preview scaffold (student view)</summary>
          <div className="av-card__scaffold-text">
            <MathText text={q.scaffold_text.replace(/\{\{(\d+)\}\}/g, (_, n) => {
              const p = parts[parseInt(n, 10)];
              return p ? `[___${p.label ? ' ' + p.label : ''}___]` : '[___]';
            })} />
          </div>
        </details>
      )}

      {/* Action bar */}
      <div className="av-card__actions">
        <button
          className="av-btn av-btn--success av-btn--lg"
          onClick={handleApprove}
          title="Mark as verified (correct)"
        >
          ✓ {hasEdits ? 'Save & Approve' : 'Approve'}
        </button>
        <button
          className="av-btn av-btn--danger av-btn--lg"
          onClick={handleReject}
          title="Mark as rejected (needs regeneration)"
        >
          ✗ Reject
        </button>
      </div>

      {/* Edit indicator */}
      {hasEdits && (
        <div className="av-card__edit-notice">
          ⚠️ You have unsaved edits. Click "Save &amp; Approve" to apply changes.
        </div>
      )}
    </div>
  );
}

// ─── Main page component ────────────────────────────────────────────────────

export default function AnswerVerification() {
  const queryClient = useQueryClient();

  // Load catalog
  const { data: catalog, isLoading, error } = useQuery({
    queryKey: ['exam-catalog'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog.json');
      if (!res.ok) throw new Error('Failed to load exam catalog');
      return res.json();
    },
    staleTime: Infinity,
  });

  // Working copy of catalog (mutated in-memory)
  const [workingCatalog, setWorkingCatalog] = useState(null);
  useEffect(() => {
    if (catalog && !workingCatalog) {
      // Deep clone to avoid mutating react-query cache
      setWorkingCatalog(JSON.parse(JSON.stringify(catalog)));
    }
  }, [catalog, workingCatalog]);

  // Filters
  const [filters, setFilters] = useState({ status: 'pending', subject: '', type: '' });
  const [currentIndex, setCurrentIndex] = useState(0);

  // Saving state
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null
  const pendingChanges = useRef(0);

  // Flatten items
  const allItems = useMemo(() => flattenForReview(workingCatalog), [workingCatalog]);

  // Unique subjects
  const subjects = useMemo(() => {
    const s = new Set();
    for (const item of allItems) {
      const subj = normalizeSubject(item.exam.subject || '');
      if (subj) s.add(subj);
    }
    return [...s].sort();
  }, [allItems]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return allItems.filter(item => {
      // Status filter
      if (filters.status === 'pending' && item.question.verified) return false;
      if (filters.status === 'verified' && item.question.verified !== true) return false;
      if (filters.status === 'rejected' && item.question.verified !== 'rejected') return false;
      // Subject filter
      if (filters.subject && normalizeSubject(item.exam.subject || '') !== filters.subject) return false;
      // Type filter
      if (filters.type && item.question.type !== filters.type) return false;
      return true;
    });
  }, [allItems, filters]);

  // Stats
  const stats = useMemo(() => reviewStats(allItems), [allItems]);

  // Clamp current index
  useEffect(() => {
    if (currentIndex >= filteredItems.length && filteredItems.length > 0) {
      setCurrentIndex(filteredItems.length - 1);
    }
  }, [filteredItems, currentIndex]);

  const currentItem = filteredItems[currentIndex] || null;

  // Navigate
  const goNext = useCallback(() => {
    if (currentIndex < filteredItems.length - 1) setCurrentIndex(i => i + 1);
  }, [currentIndex, filteredItems.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'j') goNext();
      if (e.key === 'ArrowLeft' || e.key === 'k') goPrev();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev]);

  // Apply action to the question in the working catalog
  const handleAction = useCallback((action, edits) => {
    if (!currentItem || !workingCatalog) return;

    const { examIdx, secIdx, qIdx, subIdx } = currentItem;
    const newCatalog = [...workingCatalog];
    const targetQ = subIdx !== null
      ? newCatalog[examIdx].sections[secIdx].questions[qIdx].sub_questions[subIdx]
      : newCatalog[examIdx].sections[secIdx].questions[qIdx];

    if (action === 'approve') {
      targetQ.verified = true;
      if (edits.answer_parts) targetQ.answer_parts = edits.answer_parts;
      if (edits.final_answer !== undefined) targetQ.final_answer = edits.final_answer;

      // If answer_parts were edited, rebuild scaffold_text with updated content
      if (edits.answer_parts && targetQ.scaffold_text) {
        // The scaffold_text structure stays the same — blanks are {{n}} placeholders
        // No need to rebuild, the scaffold references parts by index
      }
    } else if (action === 'reject') {
      targetQ.verified = 'rejected';
    }

    setWorkingCatalog(newCatalog);
    pendingChanges.current++;

    // Auto-advance to next question in filtered list
    // Since approved/rejected items leave the "pending" filter, the next item
    // appears at the same index automatically
    if (filters.status === 'pending') {
      // Don't increment — the current index now points to the next pending item
      // But if we're at the end, go back
      setCurrentIndex(i => Math.min(i, Math.max(0, filteredItems.length - 2)));
    } else {
      goNext();
    }
  }, [currentItem, workingCatalog, filters.status, filteredItems.length, goNext]);

  // Save catalog to disk (download as file)
  const handleSave = useCallback(async () => {
    if (!workingCatalog) return;
    setSaving(true);
    setSaveStatus(null);

    try {
      // Create a downloadable JSON blob
      const blob = new Blob([JSON.stringify(workingCatalog, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'exam_catalog.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      pendingChanges.current = 0;
      setSaveStatus('success');

      // Also update the react-query cache so other pages see the changes
      queryClient.setQueryData(['exam-catalog'], workingCatalog);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }, [workingCatalog, queryClient]);

  // ─── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="container av-page">
        <div className="loading-spinner" />
        <p className="text-muted" style={{ textAlign: 'center' }}>Loading exam catalog…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container av-page">
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <h2>Failed to load catalog</h2>
          <p className="text-muted">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container av-page">
      {/* Page header */}
      <div className="av-header">
        <div>
          <span className="page-header__eyebrow">Admin</span>
          <h1>Answer Verification</h1>
          <p className="text-muted">Review and approve AI-generated answers for exam questions</p>
        </div>
        <div className="av-header__actions">
          <button
            className={`av-btn av-btn--primary ${saving ? 'av-btn--loading' : ''}`}
            onClick={handleSave}
            disabled={saving || pendingChanges.current === 0}
          >
            {saving ? 'Saving…' : `💾 Save Catalog (${pendingChanges.current} changes)`}
          </button>
          {saveStatus === 'success' && (
            <span className="av-save-status av-save-status--success">✓ Downloaded! Replace public/exam_catalog.json with the downloaded file.</span>
          )}
          {saveStatus === 'error' && (
            <span className="av-save-status av-save-status--error">✗ Save failed</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="av-progress-bar">
        <div
          className="av-progress-bar__fill"
          style={{ width: `${stats.total ? (stats.verified / stats.total) * 100 : 0}%` }}
        />
        <span className="av-progress-bar__label">
          {stats.verified} / {stats.total} verified ({stats.total ? Math.round((stats.verified / stats.total) * 100) : 0}%)
        </span>
      </div>

      {/* Filters */}
      <FilterBar
        stats={stats}
        filters={filters}
        onFilterChange={(f) => { setFilters(f); setCurrentIndex(0); }}
        subjects={subjects}
        examItems={allItems}
      />

      {/* Navigation bar */}
      <div className="av-nav">
        <button className="av-btn av-btn--ghost" onClick={goPrev} disabled={currentIndex <= 0}>
          ← Prev
        </button>
        <span className="av-nav__position">
          {filteredItems.length > 0
            ? `Question ${currentIndex + 1} of ${filteredItems.length}`
            : 'No questions match filters'}
        </span>
        <button className="av-btn av-btn--ghost" onClick={goNext} disabled={currentIndex >= filteredItems.length - 1}>
          Next →
        </button>
      </div>

      {/* Current review card */}
      {currentItem ? (
        <ReviewCard
          key={currentItem.id}
          item={currentItem}
          onAction={handleAction}
          currentIndex={currentIndex}
          totalFiltered={filteredItems.length}
        />
      ) : (
        <div className="av-empty">
          <div className="av-empty__icon">🎉</div>
          <h3>All caught up!</h3>
          <p className="text-muted">
            {filters.status === 'pending'
              ? 'No more questions pending review with the current filters.'
              : 'No questions match the current filters.'}
          </p>
          {stats.pending === 0 && stats.total > 0 && (
            <p className="text-muted">All {stats.total} answers have been reviewed.</p>
          )}
        </div>
      )}

      {/* Keyboard shortcuts help */}
      <div className="av-shortcuts">
        <span>Keyboard: <kbd>←</kbd> / <kbd>k</kbd> prev · <kbd>→</kbd> / <kbd>j</kbd> next</span>
      </div>
    </div>
  );
}
