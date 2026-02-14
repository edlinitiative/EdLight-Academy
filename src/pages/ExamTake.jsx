import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import FigureRenderer from '../components/FigureRenderer';
import InstructionRenderer from '../components/InstructionRenderer';
import {
  flattenQuestions,
  gradeExam,
  questionTypeMeta,
  normalizeSubject,
  normalizeLevel,
  normalizeExamTitle,
  subjectColor,
  parseConsignes,
} from '../utils/examUtils';

/** Format hierarchical question number for display (e.g. "A.1" → "A.1", "5" → "5") */
function formatQuestionLabel(q, globalIndex) {
  const num = q._displayNumber;
  if (num) return num;
  return String(globalIndex + 1);
}

/** Abbreviate question label for sidebar nav buttons (keep short) */
function formatNavLabel(q, globalIndex) {
  const num = q._displayNumber;
  if (!num) return String(globalIndex + 1);
  // If already short enough, use as-is
  if (num.length <= 6) return num;
  // Try to extract a short code: "A- COMPREHENSION 1" → "A-1", "B- Grammar section 2" → "B-2"
  const m = num.match(/^([A-Z]+[\-.]?)\s*.*?(\d+)$/i);
  if (m) return m[1] + m[2];
  // Truncate with ellipsis
  return num.slice(0, 5) + '…';
}

/** Regex that matches blank placeholders: 4+ underscores OR 4+ dots */
const BLANK_RE = /_{4,}|\.{4,}/g;

/** Does the question text contain inline blank placeholders? (uses fresh regex to avoid lastIndex issues) */
function hasInlineBlanks(text) {
  return /_{4,}|\.{4,}/.test(text);
}

/** Shared catalog query — same queryKey so it shares cache with ExamBrowser */
function useExamCatalog() {
  return useQuery({
    queryKey: ['exam-catalog'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog.json');
      if (!res.ok) throw new Error('Failed to load exam catalog');
      return res.json();
    },
    staleTime: Infinity,
  });
}

const ExamTake = () => {
  const { examIndex } = useParams();
  const navigate = useNavigate();

  const { data: rawExams, isLoading, error } = useExamCatalog();

  const idx = parseInt(examIndex, 10);
  const exam = rawExams?.[idx];
  const questions = useMemo(() => (exam ? flattenQuestions(exam) : []), [exam]);

  const sectionGroups = useMemo(() => {
    const groups = [];
    for (let i = 0; i < questions.length; i++) {
      const title = String(questions[i]?.sectionTitle || '').trim() || 'Questions';
      const instructions = String(questions[i]?.sectionInstructions || '').trim();
      const last = groups[groups.length - 1];
      if (!last || last.title !== title || last.instructions !== instructions) {
        groups.push({ title, instructions, start: i, end: i });
      } else {
        last.end = i;
      }
    }
    return groups.map((g) => ({ ...g, count: g.end - g.start + 1 }));
  }, [questions]);

  // ── Exam intro / consignes extraction ─────────────────────────────────────
  const [examStarted, setExamStarted] = useState(false);

  const examInfo = useMemo(() => {
    if (!exam) return null;
    // Collect all consignes from all sections and strip them from instructions
    let allRules = [];
    const cleanedSections = (exam.sections || []).map((sec) => {
      const raw = (sec.instructions || '').trim();
      const { rules, cleanedText } = parseConsignes(raw);
      if (rules.length) allRules.push(...rules);
      // Use null when no raw text existed; keep '' when all content was rules
      // (so '' means "rules were stripped, nothing left" — don't fall back)
      return { ...sec, _cleanInstructions: raw ? cleanedText : null, _hadRules: rules.length > 0 };
    });
    // Deduplicate rules (same rules often repeat across sections)
    const seen = new Set();
    const uniqueRules = allRules.filter((r) => {
      const key = r.toLowerCase().replace(/[^a-zà-ÿ0-9]/gi, '').slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { rules: uniqueRules, cleanedSections };
  }, [exam]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Timer
  const durationMin = exam?.duration_minutes || 0;
  const [secondsLeft, setSecondsLeft] = useState(durationMin * 60);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!durationMin || submitted) return;
    setSecondsLeft(durationMin * 60);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [durationMin, submitted]);

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (durationMin && secondsLeft === 0 && !submitted) {
      handleSubmit();
    }
  }, [secondsLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ── Answer handling ────────────────────────────────────────────────────────
  const setAnswer = useCallback((qIndex, value) => {
    setAnswers((prev) => ({ ...prev, [qIndex]: value }));
  }, []);

  const answeredCount = Object.keys(answers).filter((k) => answers[k] !== '' && answers[k] != null).length;
  const progressPct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentQ((p) => Math.min(p + 1, questions.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentQ((p) => Math.max(p - 1, 0));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [questions.length]);

  // Scroll question content into view on question change
  const contentRef = useRef(null);
  useEffect(() => {
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentQ]);

  // Passage panel state (for comprehension sections)
  const [showPassage, setShowPassage] = useState(false);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    clearInterval(timerRef.current);
    setSubmitted(true);

    const result = gradeExam(questions, answers);

    // Store in sessionStorage for ExamResults page
    sessionStorage.setItem(
      `exam-result-${idx}`,
      JSON.stringify({
        examIndex: idx,
        examTitle: normalizeExamTitle(exam),
        subject: normalizeSubject(exam.subject),
        level: normalizeLevel(exam.level),
        result,
        timestamp: Date.now(),
      })
    );

    navigate(`/exams/${idx}/results`);
  }, [questions, answers, idx, exam, navigate]);

  // ── Render gates ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <section className="section">
        <div className="container">
          <div className="card card--centered card--loading">
            <div className="loading-spinner" />
          </div>
        </div>
      </section>
    );
  }

  if (error || !exam) {
    return (
      <section className="section">
        <div className="container">
          <div className="card card--message">
            <p>Examen introuvable.</p>
            <button className="button button--primary" onClick={() => navigate('/exams')}>
              ← Retour aux examens
            </button>
          </div>
        </div>
      </section>
    );
  }

  const subject = normalizeSubject(exam.subject);
  const color = subjectColor(subject);

  // ── Exam Intro splash ───────────────────────────────────────────────────
  if (!examStarted) {
    const sectionSummary = (exam.sections || []).map((sec, i) => ({
      title: sec.section_title || `Section ${i + 1}`,
      qCount: (sec.questions || []).length,
    }));
    const totalQ = sectionSummary.reduce((s, x) => s + x.qCount, 0);

    const ruleIcon = (rule) => {
      const r = rule.toLowerCase();
      if (r.includes('interdit')) return '🚫';
      if (r.includes('silence')) return '🤫';
      if (r.includes('obligatoire')) return '⚠️';
      if (r.includes('durée') || r.includes('heure')) return '⏰';
      if (r.includes('coefficient')) return '📊';
      return 'ℹ️';
    };

    return (
      <section className="exam-cover" style={{ '--cover-accent': color }}>
        {/* Decorative background shapes */}
        <div className="exam-cover__bg">
          <div className="exam-cover__orb exam-cover__orb--1" />
          <div className="exam-cover__orb exam-cover__orb--2" />
          <div className="exam-cover__orb exam-cover__orb--3" />
          <div className="exam-cover__grid" />
        </div>

        <div className="exam-cover__inner">
          {/* Navigation */}
          <nav className="exam-cover__nav">
            <button className="exam-cover__back" onClick={() => navigate('/exams')}>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Retour
            </button>
            <div className="exam-cover__brand">
              <span className="exam-cover__brand-icon">🎓</span>
              <span>EdLight Academy</span>
            </div>
          </nav>

          {/* Hero card */}
          <div className="exam-cover__hero">
            <div className="exam-cover__badge" style={{ background: color, color: '#fff' }}>
              {subject}
            </div>
            <h1 className="exam-cover__title">{normalizeExamTitle(exam)}</h1>
            {exam.year && <p className="exam-cover__year">{exam.year}</p>}

            {/* Stats row */}
            <div className="exam-cover__stats">
              {durationMin > 0 && (
                <div className="exam-cover__stat">
                  <span className="exam-cover__stat-value">{durationMin}</span>
                  <span className="exam-cover__stat-label">minutes</span>
                </div>
              )}
              {exam.total_points > 0 && (
                <div className="exam-cover__stat">
                  <span className="exam-cover__stat-value">{exam.total_points}</span>
                  <span className="exam-cover__stat-label">points</span>
                </div>
              )}
              <div className="exam-cover__stat">
                <span className="exam-cover__stat-value">{totalQ}</span>
                <span className="exam-cover__stat-label">questions</span>
              </div>
              <div className="exam-cover__stat">
                <span className="exam-cover__stat-value">{sectionSummary.length}</span>
                <span className="exam-cover__stat-label">{sectionSummary.length > 1 ? 'sections' : 'section'}</span>
              </div>
            </div>
          </div>

          {/* Two-column body */}
          <div className="exam-cover__body">
            {/* Sections panel */}
            <div className="exam-cover__panel exam-cover__panel--sections">
              <h2 className="exam-cover__panel-heading">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Structure
              </h2>
              <ol className="exam-cover__section-list">
                {sectionSummary.map((sec, i) => (
                  <li key={i} className="exam-cover__section-row">
                    <span className="exam-cover__section-dot" style={{ background: color }} />
                    <span className="exam-cover__section-name">{sec.title}</span>
                    <span className="exam-cover__section-qty">{sec.qCount}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Rules panel */}
            {examInfo?.rules?.length > 0 && (
              <div className="exam-cover__panel exam-cover__panel--rules">
                <h2 className="exam-cover__panel-heading">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Consignes
                </h2>
                <ul className="exam-cover__rules-list">
                  {examInfo.rules.map((rule, i) => (
                    <li key={i} className="exam-cover__rule-item">
                      <span className="exam-cover__rule-icon">{ruleIcon(rule)}</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="exam-cover__cta">
            <button
              className="exam-cover__start-btn"
              style={{ background: color }}
              onClick={() => setExamStarted(true)}
            >
              <span>Commencer l'examen</span>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </button>
            <p className="exam-cover__cta-hint">Bonne chance ! 🍀</p>
          </div>
        </div>
      </section>
    );
  }

  // ── Active exam ────────────────────────────────────────────────────────────
  const question = questions[currentQ];
  if (!question) return null;

  const meta = questionTypeMeta(question.type);
  const isTimerWarning = durationMin && secondsLeft < 300; // < 5 min

  // Get cleaned instructions (consignes stripped) for current question's section
  const currentSectionIdx = (exam.sections || []).findIndex(
    (s) => s.section_title === question.sectionTitle
  );
  // Use cleaned instructions when available; only fall back to raw if no rules
  // were extracted (i.e. cleaning wasn't applied). When rules WERE extracted and
  // cleanedText is '' it means ALL text was consignes — don't show anything.
  const cleanedEntry = examInfo?.cleanedSections?.[currentSectionIdx];
  const cleanInstructions = cleanedEntry?._hadRules
    ? (cleanedEntry._cleanInstructions || '')
    : (question.sectionInstructions || '');

  return (
    <section className="section exam-take">
      <div className="container">
        {/* Top bar */}
        <div className="exam-take__topbar">
          <div className="exam-take__topbar-left">
            <button className="button button--ghost button--sm" onClick={() => navigate('/exams')}>
              ← Examens
            </button>
            <div className="exam-take__exam-info">
              <span className="exam-take__subject" style={{ color }}>{subject}</span>
              <span className="exam-take__title-short">{normalizeExamTitle(exam)}</span>
            </div>
          </div>

          <div className="exam-take__topbar-right">
            <span className="exam-take__progress">
              {answeredCount}/{questions.length}
            </span>
            {durationMin > 0 && (
              <span className={`exam-take__timer ${isTimerWarning ? 'exam-take__timer--warning' : ''}`} aria-live="polite" aria-label={`Temps restant: ${formatTime(secondsLeft)}`}>
                <span aria-hidden="true">⏱</span> {formatTime(secondsLeft)}
              </span>
            )}
            <button
              className="button button--primary button--sm"
              onClick={() => setShowConfirm(true)}
            >
              Soumettre
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="exam-take__progress-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <div className="exam-take__progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Main area: sidebar + question */}
        <div className="exam-take__body">
          {/* Question navigation sidebar */}
          <aside className="exam-take__nav">
            <div className="exam-take__nav-header">Sections</div>
            <div className="exam-take__nav-sections" role="navigation" aria-label="Navigation des questions par section">
              {sectionGroups.map((sec) => {
                const isCurrentSection = currentQ >= sec.start && currentQ <= sec.end;
                return (
                  <div key={`${sec.start}-${sec.end}-${sec.title}`} className="exam-take__nav-section">
                    <div className={`exam-take__nav-section-title ${isCurrentSection ? 'exam-take__nav-section-title--current' : ''}`}>
                      <span className="exam-take__nav-section-name">{sec.title}</span>
                      <span className="exam-take__nav-section-count">{sec.count}</span>
                    </div>
                    <div className="exam-take__nav-section-grid">
                      {Array.from({ length: sec.count }).map((_, offset) => {
                        const i = sec.start + offset;
                        const q = questions[i];
                        const hasAnswer = answers[i] != null && answers[i] !== '';
                        const isCurrent = i === currentQ;
                        let cls = 'exam-take__nav-btn';
                        if (isCurrent) cls += ' exam-take__nav-btn--current';
                        else if (hasAnswer) cls += ' exam-take__nav-btn--answered';
                        const label = formatNavLabel(q, i);
                        return (
                          <button
                            key={i}
                            className={cls}
                            onClick={() => setCurrentQ(i)}
                            title={`Question ${formatQuestionLabel(q, i)}`}
                            type="button"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Question content */}
          <div className="exam-take__content" ref={contentRef}>
          {/* Section context — collapsible instructions (consignes stripped) */}
          {question.sectionTitle && (
            <SectionHeader
              title={question.sectionTitle}
              instructions={cleanInstructions}
            />
          )}

          {/* Floating "Show passage" button for comprehension sections */}
          {cleanInstructions && cleanInstructions.length > 200 && (
            <button
              className="exam-take__passage-btn"
              onClick={() => setShowPassage(true)}
              type="button"
            >
              📖 Voir le texte
            </button>
          )}

          {/* Sub-exercise directive header (e.g. "A. Write the correct form of the verbs...") */}
          {question._subExFirstInGroup && question._subExDirective && (
            <div className="exam-take__subex-header">
              <span className="exam-take__subex-label">{question._subExGroup}.</span>
              <span className="exam-take__subex-directive">{question._subExDirective.replace(/^[A-Z][.\-)\s]+/, '')}</span>
            </div>
          )}

          {/* Word pool callout — shown once per group */}
          {question._wordPool && question._subExFirstInGroup && (
            <div className="exam-take__word-pool">
              <span className="exam-take__word-pool-label">Banque de mots :</span>{' '}
              <span className="exam-take__word-pool-words">{question._wordPool}</span>
            </div>
          )}
          {/* Show word pool inline if not first-in-group but has one */}
          {question._wordPool && !question._subExFirstInGroup && (
            <div className="exam-take__word-pool exam-take__word-pool--compact">
              <span className="exam-take__word-pool-words">{question._wordPool}</span>
            </div>
          )}

          <div className="card exam-take__question-card">
            <div className="exam-take__question-header">
              <span className="exam-take__question-number">
                <span className="exam-take__question-num-label">{formatQuestionLabel(question, currentQ)}</span>
                <span className="exam-take__question-num-total"> / {questions.length}</span>
              </span>
              <span className="exam-take__question-type" style={{ background: color + '18', color }}>
                {meta.icon} {meta.label}
              </span>
              {question.points && (
                <span className="exam-take__question-points">
                  {question.points} pt{question.points !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Figure — rendered from description */}
            {question.has_figure && question.figure_description && (
              <FigureRenderer description={question.figure_description} />
            )}

            {/* Question text — inline blanks for fill_blank, normal renderer otherwise */}
            {question.type === 'fill_blank' && hasInlineBlanks(question._displayText || question.question) ? (
              <div className="exam-take__question-text">
                <FillBlankText
                  text={question._displayText || question.question}
                  index={currentQ}
                  value={answers[currentQ] ?? ''}
                  onChange={setAnswer}
                />
              </div>
            ) : (
              <>
                <div className="exam-take__question-text">
                  <InstructionRenderer text={question._displayText || question.question} />
                </div>
                <div className="exam-take__answer-area">
                  <QuestionInput
                    question={question}
                    index={currentQ}
                    value={answers[currentQ] ?? ''}
                    onChange={setAnswer}
                  />
                </div>
              </>
            )}
          </div>

          {/* Navigation */}
          <div className="exam-take__question-nav">
            <button
              className="button button--ghost"
              disabled={currentQ === 0}
              onClick={() => setCurrentQ((p) => p - 1)}
            >
              ← Précédent
            </button>
            {currentQ < questions.length - 1 ? (
              <button
                className="button button--primary"
                onClick={() => setCurrentQ((p) => p + 1)}
              >
                Suivant →
              </button>
            ) : (
              <button
                className="button button--primary"
                onClick={() => setShowConfirm(true)}
              >
                Terminer l'examen
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="exam-take__overlay" onClick={() => setShowConfirm(false)}>
          <div className="exam-take__modal card" onClick={(e) => e.stopPropagation()}>
            <h3>Soumettre l'examen ?</h3>
            <p>
              Vous avez répondu à <strong>{answeredCount}</strong> sur{' '}
              <strong>{questions.length}</strong> questions.
              {answeredCount < questions.length && (
                <span className="exam-take__modal-warning">
                  {' '}⚠️ {questions.length - answeredCount} question{questions.length - answeredCount > 1 ? 's' : ''} sans réponse.
                </span>
              )}
            </p>
            <div className="exam-take__modal-actions">
              <button className="button button--ghost" onClick={() => setShowConfirm(false)}>
                Continuer l'examen
              </button>
              <button className="button button--primary" onClick={handleSubmit}>
                Soumettre maintenant
              </button>
              </div>
            </div>
          </div>
      )}

      {/* Passage slide-over panel */}
      {showPassage && (
        <div className="exam-take__overlay" onClick={() => setShowPassage(false)}>
          <div className="exam-take__passage-panel" onClick={(e) => e.stopPropagation()}>
            <div className="exam-take__passage-panel-header">
              <h3>📖 Texte de référence</h3>
              <button className="exam-take__passage-panel-close" onClick={() => setShowPassage(false)} type="button">✕</button>
            </div>
            <div className="exam-take__passage-panel-body">
              <InstructionRenderer text={cleanInstructions} />
            </div>
          </div>
        </div>
      )}
      </div>
      </section>
  );
};

// ── Section Header (collapsible instructions) ───────────────────────────────

function SectionHeader({ title, instructions }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasInstructions = !!instructions?.trim();

  return (
    <div className="exam-take__section-header">
      <div
        className="exam-take__section-header-top"
        onClick={() => hasInstructions && setCollapsed((c) => !c)}
        role={hasInstructions ? 'button' : undefined}
        tabIndex={hasInstructions ? 0 : undefined}
        onKeyDown={(e) => { if (hasInstructions && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setCollapsed((c) => !c); } }}
      >
        <h3>{title}</h3>
        {hasInstructions && (
          <button
            className="exam-take__section-toggle"
            type="button"
            aria-label={collapsed ? 'Afficher les instructions' : 'Masquer les instructions'}
            tabIndex={-1}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        )}
      </div>
      {hasInstructions && !collapsed && (
        <InstructionRenderer text={instructions} />
      )}
    </div>
  );
}

// ── Fill-in-the-blank inline renderer ────────────────────────────────────────

/**
 * Renders question text with inline <input> fields replacing blank placeholders.
 * Supports single and multiple blanks. Values stored as pipe-separated string.
 * Parenthetical hints like (plan) are shown as subtle labels above the input.
 */
function FillBlankText({ text, index, value, onChange }) {
  // Split text on blank placeholders, keeping surrounding text
  const parts = text.split(BLANK_RE);
  const blankCount = parts.length - 1;

  // For multiple blanks, store values pipe-separated: "val1|val2|val3"
  const values = blankCount > 1
    ? (value || '').split('|').concat(Array(blankCount).fill('')).slice(0, blankCount)
    : [value || ''];

  const handleChange = (blankIdx, newVal) => {
    if (blankCount <= 1) {
      onChange(index, newVal);
    } else {
      const updated = [...values];
      updated[blankIdx] = newVal;
      onChange(index, updated.join('|'));
    }
  };

  // Detect parenthetical hint right after a blank, e.g. " (plan)"
  const hintRe = /^\s*\(([^)]+)\)/;

  return (
    <div className="exam-take__fill-blank-text">
      {parts.map((segment, i) => {
        // Check if this segment starts with a parenthetical hint for the PREVIOUS blank
        let hint = '';
        let cleanSegment = segment;
        if (i > 0) {
          const hintMatch = segment.match(hintRe);
          if (hintMatch) {
            hint = hintMatch[1];
            cleanSegment = segment.slice(hintMatch[0].length);
          }
        }

        return (
          <React.Fragment key={i}>
            {/* Inline blank input (before this text segment, except for first) */}
            {i > 0 && (
              <span className="exam-take__inline-blank-wrap">
                {hint && <span className="exam-take__inline-blank-hint">{hint}</span>}
                <input
                  type="text"
                  className="exam-take__inline-blank"
                  value={values[i - 1]}
                  onChange={(e) => handleChange(i - 1, e.target.value)}
                  placeholder={hint || '…'}
                  autoComplete="off"
                  spellCheck="false"
                  style={hint ? { minWidth: `${Math.max(hint.length * 0.6 + 2, 5)}em` } : undefined}
                />
              </span>
            )}
            {/* Text segment */}
            {cleanSegment && <span>{cleanSegment}</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Question Input Components ────────────────────────────────────────────────

function QuestionInput({ question, index, value, onChange }) {
  const type = question.type || 'unknown';

  switch (type) {
    case 'multiple_choice':
      return <MCQInput question={question} index={index} value={value} onChange={onChange} />;
    case 'true_false':
      return <TrueFalseInput index={index} value={value} onChange={onChange} />;
    case 'fill_blank':
    case 'calculation':
    case 'short_answer':
      return <TextInput type={type} index={index} value={value} onChange={onChange} />;
    case 'essay':
      return <EssayInput index={index} value={value} onChange={onChange} />;
    case 'matching':
      return <MatchingInput question={question} index={index} value={value} onChange={onChange} />;
    default:
      return <TextInput type={type} index={index} value={value} onChange={onChange} />;
  }
}

function MCQInput({ question, index, value, onChange }) {
  const options = question.options || {};
  const entries = Object.entries(options);

  if (entries.length === 0) {
    return (
      <div className="exam-take__no-options">
        <p>Options non disponibles pour cette question. Tapez votre réponse :</p>
        <input
          className="exam-take__text-input"
          type="text"
          value={value}
          onChange={(e) => onChange(index, e.target.value)}
          placeholder="Votre réponse…"
        />
      </div>
    );
  }

  return (
    <div className="exam-take__mcq-options">
      {entries.map(([key, text]) => {
        const isSelected = value === key;
        return (
          <label
            key={key}
            className={`exam-take__mcq-option ${isSelected ? 'exam-take__mcq-option--selected' : ''}`}
          >
            <input
              type="radio"
              name={`q-${index}`}
              value={key}
              checked={isSelected}
              onChange={() => onChange(index, key)}
              className="exam-take__mcq-radio"
            />
            <span className="exam-take__mcq-key">{key.toUpperCase()}</span>
            <span className="exam-take__mcq-text">{text}</span>
          </label>
        );
      })}
    </div>
  );
}

function TrueFalseInput({ index, value, onChange }) {
  return (
    <div className="exam-take__tf-options">
      {[
        { key: 'vrai', label: '✅ Vrai' },
        { key: 'faux', label: '❌ Faux' },
      ].map(({ key, label }) => {
        const isSelected = value === key;
        return (
          <label
            key={key}
            className={`exam-take__tf-option ${isSelected ? 'exam-take__tf-option--selected' : ''}`}
          >
            <input
              type="radio"
              name={`q-${index}`}
              value={key}
              checked={isSelected}
              onChange={() => onChange(index, key)}
              className="exam-take__tf-radio"
            />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

function TextInput({ type, index, value, onChange }) {
  const placeholders = {
    fill_blank: 'Complétez le blanc…',
    calculation: 'Entrez votre résultat…',
    short_answer: 'Votre réponse…',
  };

  return (
    <input
      className="exam-take__text-input"
      type="text"
      value={value}
      onChange={(e) => onChange(index, e.target.value)}
      placeholder={placeholders[type] || 'Votre réponse…'}
    />
  );
}

function EssayInput({ index, value, onChange }) {
  return (
    <textarea
      className="exam-take__essay-input"
      value={value}
      onChange={(e) => onChange(index, e.target.value)}
      placeholder="Rédigez votre réponse ici…"
      rows={8}
    />
  );
}

function MatchingInput({ question, index, value, onChange }) {
  // For matching, store as JSON string of pairs
  // Simple fallback: just a text area
  return (
    <div className="exam-take__matching">
      <p className="exam-take__matching-hint">
        Entrez vos correspondances (ex: 1-B, 2-A, 3-C)
      </p>
      <input
        className="exam-take__text-input"
        type="text"
        value={value}
        onChange={(e) => onChange(index, e.target.value)}
        placeholder="1-B, 2-A, 3-C…"
      />
    </div>
  );
}

export default ExamTake;
