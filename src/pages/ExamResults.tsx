import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Trophy, ThumbsUp, Dumbbell, BarChart3, Clock, Lightbulb, RefreshCw, PenLine, Target, Check, X, Eye } from 'lucide-react';
import useStore from '../contexts/store';
import FigureRenderer from '../components/FigureRenderer';
import InstructionRenderer from '../components/InstructionRenderer';
import Icon from '../components/Icon';
import { useKatex, renderWithKatex } from '../utils/shared';
import { checkWithCAS } from '../utils/mathCAS';
import ReviewSession from '../components/ReviewSession';
import { TRACK_BY_CODE } from '../config/trackConfig';
import { isNumericId, fetchSingleExam } from '../utils/examCatalog';
import { loadExamResult } from '../services/examResults';
import {
  flattenQuestions,
  gradeExam,
  normalizeExamTitle,
  normalizeLevel,
  normalizeSubject,
  questionTypeMeta,
  subjectColor,
  QUESTION_TYPE_META,
} from '../utils/examUtils';

// Statuses that mean the student has NOT yet mastered the question.
const NEEDS_REVIEW = new Set(['incorrect', 'partial', 'unanswered']);
const MASTERED = new Set(['correct', 'scaffold-complete']);

/**
 * Group graded results by a key (section title or competency) and compute a
 * points-weighted mastery ratio for each group. Returns sorted groups
 * (weakest first) so students immediately see where to focus.
 */
function computeMastery(results, keyFn) {
  const groups = new Map();
  for (const r of results) {
    const key = keyFn(r) || '—';
    const g = groups.get(key) || { key, earned: 0, total: 0, count: 0, review: 0 };
    g.earned += r.result?.awarded || 0;
    g.total += r.result?.maxPoints || 0;
    g.count += 1;
    if (NEEDS_REVIEW.has(r.status)) g.review += 1;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, pct: g.total > 0 ? Math.round((g.earned / g.total) * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct);
}

/** A single labelled mastery progress bar. */
function MasteryBar({ label, pct, count, review }) {
  const tone = pct >= 75 ? 'good' : pct >= 50 ? 'mid' : 'low';
  return (
    <div className="exam-results__mastery-row">
      <div className="exam-results__mastery-head">
        <span className="exam-results__mastery-label" title={label}>{label}</span>
        <span className={`exam-results__mastery-pct exam-results__mastery-pct--${tone}`}>{pct}%</span>
      </div>
      <div className="exam-results__mastery-track">
        <div className={`exam-results__mastery-fill exam-results__mastery-fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="exam-results__mastery-meta">
        {count} question{count !== 1 ? 's' : ''}
        {review > 0 && <> · <strong>{review} à revoir</strong></>}
      </span>
    </div>
  );
}

/** Renders scaffold blank answers in the results view with per-blank grading */
function ScaffoldResultDisplay({ answer, blanks, blankResults, modelAnswer }) {  let values = [];
  try {
    const parsed = JSON.parse(answer);
    if (parsed && parsed.scaffold) values = parsed.scaffold;
  } catch { /* not scaffold JSON */ }

  if (!values.length) return <span>{answer}</span>;

  return (
    <div className="scaffold-result">
      {(blanks || []).map((blank, i) => {
        const br = blankResults?.[i];
        const isCorrect = br?.correct;
        const hasGrading = !!br;
        return (
          <div key={i} className={`scaffold-result__item ${hasGrading ? (isCorrect ? 'scaffold-result__item--correct' : 'scaffold-result__item--incorrect') : ''}`}>
            <span className="scaffold-result__label">{blank.label || `#${i + 1}`} :</span>
            <span className={`scaffold-result__value ${hasGrading ? (isCorrect ? 'scaffold-result__value--correct' : 'scaffold-result__value--incorrect') : ''}`}>
              {hasGrading && (isCorrect ? <Check size={14} /> : <X size={14} />)}{' '}
              {values[i] || '—'}
            </span>
            {hasGrading && !isCorrect && br.expectedAnswer && (
              <span className="scaffold-result__expected">
                → {br.expectedAnswer}
              </span>
            )}
          </div>
        );
      })}
      {/* Show model answer (full solution) when available */}
      {modelAnswer && (
        <details className="scaffold-result__solution">
          <summary className="scaffold-result__solution-toggle"><BookOpen size={14} /> Voir la solution complète</summary>
          <div className="scaffold-result__solution-body">
            <InstructionRenderer text={modelAnswer} />
          </div>
        </details>
      )}
    </div>
  );
}

const ExamResults = () => {
  const { level, examId } = useParams();
  const navigate = useNavigate();
  const userId = useStore((s) => s.user?.uid);

  // Fetch ONLY this exam (a few KB) instead of the full 27 MB catalog.
  const { data: exam } = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => fetchSingleExam(examId),
    enabled: examId != null,
    staleTime: Infinity,
  });

  // Legacy numeric routes still resolve to the saved result index.
  const idx = useMemo(() => (isNumericId(examId) ? parseInt(examId, 10) : null), [examId]);
  const examKey = exam?.exam_id || (Number.isFinite(idx) ? String(idx) : null);

  const [stored, setStored] = useState(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  // Detail list filter: 'all' | 'review' (mistakes) | 'mastered'
  const [reviewFilter, setReviewFilter] = useState('all');
  // Practice-your-mistakes session modal
  const [practiceOpen, setPracticeOpen] = useState(false);

  // Prefer sessionStorage (fast), fallback to Firestore (cross-device)
  useEffect(() => {
    // 1) sessionStorage: try a few keys for backward compatibility
    const tryKeys = [];
    if (examId) tryKeys.push(`exam-result-${examId}`);
    if (examKey && examKey !== examId) tryKeys.push(`exam-result-${examKey}`);
    if (Number.isFinite(idx)) tryKeys.push(`exam-result-${idx}`);

    for (const key of tryKeys) {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        setStored(parsed);
        return;
      } catch {
        // keep trying
      }
    }

    // 2) Firestore fallback
    if (!userId || !examKey || !exam) return;
    let cancelled = false;
    setRemoteLoading(true);
    (async () => {
      try {
        const docData = await loadExamResult(userId, examKey);
        if (cancelled) return;
        if (!docData) return;

        const questions = flattenQuestions(exam);
        const answers = docData.answers || {};
        const pre = docData.preGradedResults || {};

        const track = docData.track || '';
        const subject = normalizeSubject(exam.subject);
        const result = gradeExam(questions, answers, pre, { track, subject });

        // Ensure every row has the question object (pre-graded entries omit it)
        const mergedResults = (result.results || []).map((r, i) => {
          if (r && r.question) return r;
          return {
            ...r,
            question: questions[i],
            userAnswer: r?.userAnswer ?? answers[i] ?? null,
          };
        });

        setStored({
          examIndex: idx,
          examId: examKey,
          examTitle: docData.exam_title || normalizeExamTitle(exam),
          subject,
          level: normalizeLevel(exam.level),
          track,
          result: { ...result, results: mergedResults },
          timestamp: docData.submitted_at_ms || Date.now(),
        });
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [examId, examKey, idx, userId, exam]);

  if (!stored) {
    return (
      <section className="section">
        <div className="container">
          <div className="card card--message">
            <p>
              {remoteLoading ? 'Chargement des résultats…' : 'Aucun résultat trouvé pour cet examen.'}
            </p>
            <button className="button button--primary" onClick={() => navigate(`/exams/${level || ''}`)} type="button">
              ← Retour aux examens
            </button>
          </div>
        </div>
      </section>
    );
  }

  const { result, examTitle, subject, level: storedLevel, track: examTrack } = stored;
  const { summary, results } = result;
  const color = subjectColor(subject);
  const trackInfo = examTrack ? TRACK_BY_CODE[examTrack] : null;

  // Score ring percentage
  const pct = summary.percentage;
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference - (circumference * pct) / 100;

  // Grade label
  const gradeLabel = pct >= 80 ? 'Excellent !' : pct >= 60 ? 'Bien' : pct >= 40 ? 'Passable' : 'À améliorer';
  const GradeIcon = pct >= 80 ? Trophy : pct >= 60 ? ThumbsUp : pct >= 40 ? BookOpen : Dumbbell;

  const ringColor = pct >= 60 ? 'var(--success-500)' : pct >= 40 ? 'var(--warning-500)' : 'var(--danger-500)';

  // ── Mastery breakdown (where to focus) ────────────────────────────────────
  const masteryBySection = computeMastery(results, (r) => r.question.sectionTitle || 'Questions');
  const masteryByType = computeMastery(results, (r) => questionTypeMeta(r.question.type).label);
  const showSectionMastery = masteryBySection.length > 1;

  // ── Review focus filter ───────────────────────────────────────────────────
  const indexedResults = results.map((r, i) => ({ r, i }));
  const reviewCount = results.filter((r) => NEEDS_REVIEW.has(r.status)).length;
  const masteredCount = results.filter((r) => MASTERED.has(r.status)).length;
  const filteredResults = indexedResults.filter(({ r }) => {
    if (reviewFilter === 'review') return NEEDS_REVIEW.has(r.status);
    if (reviewFilter === 'mastered') return MASTERED.has(r.status);
    return true;
  });

  // Questions to re-practise (the ones not yet mastered)
  const practiceItems = results.filter((r) => NEEDS_REVIEW.has(r.status) && r.question);

  const focusOnMistakes = () => {
    setReviewFilter('review');
    setTimeout(() => {
      document.querySelector('.exam-results__details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <section className="section exam-results">
      <div className="container">
        {/* Header */}
        <div className="page-header exam-results__header">
          <button className="button button--ghost button--sm" onClick={() => navigate(`/exams/${level || ''}`)} type="button">
            ← Retour aux examens
          </button>
          <h1 className="page-header__title">Résultats</h1>
          <p className="page-header__subtitle" style={{ color }}>
            {subject}, {examTitle || 'Examen'} {storedLevel && `(${storedLevel})`}
          </p>
        </div>

      {/* Score overview */}
      <div className="exam-results__overview" aria-label={`Score: ${pct}%`}>
        {/* Score ring */}
        <div className="exam-results__score-ring">
          <svg viewBox="0 0 120 120" className="exam-results__ring-svg">
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="8" />
            <circle
              cx="60" cy="60" r="54" fill="none"
              stroke={ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 60 60)"
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className="exam-results__score-text">
            <span className="exam-results__score-pct">{pct}%</span>
            <span className="exam-results__score-label"><GradeIcon size={16} /> {gradeLabel}</span>
          </div>
        </div>

        {/* Stats cards */}
        <div className="exam-results__stats-grid">
          <div className="exam-results__stat-card">
            <span className="exam-results__stat-number">{summary.earnedPoints}</span>
            <span className="exam-results__stat-label">Points obtenus / {summary.totalPoints}</span>
          </div>
          <div className="exam-results__stat-card exam-results__stat-card--correct">
            <span className="exam-results__stat-number">{summary.correctCount}</span>
            <span className="exam-results__stat-label">Réponses correctes</span>
          </div>
          <div className="exam-results__stat-card exam-results__stat-card--incorrect">
            <span className="exam-results__stat-number">{summary.incorrectCount}</span>
            <span className="exam-results__stat-label">Réponses incorrectes</span>
          </div>
          <div className="exam-results__stat-card">
            <span className="exam-results__stat-number">{summary.unanswered}</span>
            <span className="exam-results__stat-label">Sans réponse</span>
          </div>
          {summary.manualReview > 0 && (
            <div className="exam-results__stat-card exam-results__stat-card--manual">
              <span className="exam-results__stat-number">{summary.manualReview}</span>
              <span className="exam-results__stat-label">Correction manuelle</span>
            </div>
          )}
          <div className="exam-results__stat-card">
            <span className="exam-results__stat-number">{summary.autoGraded}</span>
            <span className="exam-results__stat-label">Auto-corrigées</span>
          </div>
        </div>

        {/* Coefficient-weighted score (when track is set) */}
        {summary.coefficient && summary.coefficient > 1 && trackInfo && (
          <div className="exam-results__weighted">
            <h3 className="exam-results__weighted-title">
              <BarChart3 size={16} /> Score pondéré, Filière {trackInfo.icon} {trackInfo.shortLabel}
            </h3>
            <div className="exam-results__weighted-row">
              <span>Coefficient {subject}</span>
              <span className="exam-results__coeff-badge">×{summary.coefficient}</span>
            </div>
            <div className="exam-results__weighted-row">
              <span>Points pondérés</span>
              <span className="exam-results__weighted-value">
                {summary.weightedEarned} / {summary.weightedTotal}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Mastery breakdown — where to focus next */}
      <div className="exam-results__mastery">
        <div className="exam-results__mastery-col">
          <h2 className="exam-results__mastery-title">
            <Target size={18} /> Maîtrise par compétence
          </h2>
          {masteryByType.map((g) => (
            <MasteryBar key={g.key} label={g.key} pct={g.pct} count={g.count} review={g.review} />
          ))}
        </div>
        {showSectionMastery && (
          <div className="exam-results__mastery-col">
            <h2 className="exam-results__mastery-title">
              <BarChart3 size={18} /> Maîtrise par section
            </h2>
            {masteryBySection.map((g) => (
              <MasteryBar key={g.key} label={g.key} pct={g.pct} count={g.count} review={g.review} />
            ))}
          </div>
        )}
        {reviewCount > 0 && (
          <div className="exam-results__focus-cta">
            <div className="exam-results__focus-text">
              <strong>{reviewCount} question{reviewCount !== 1 ? 's' : ''} à revoir.</strong>{' '}
              Concentrez-vous sur vos erreurs pour progresser plus vite.
            </div>
            <div className="exam-results__focus-actions">
              <button className="button button--primary button--sm" onClick={() => setPracticeOpen(true)} type="button">
                <Target size={15} /> M'entraîner ({reviewCount})
              </button>
              <button className="button button--ghost button--sm" onClick={focusOnMistakes} type="button">
                <Eye size={15} /> Voir mes erreurs
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detailed results */}
      <div className="exam-results__details">
        <div className="exam-results__details-head">
          <h2 className="exam-results__details-title">Détails par question</h2>
          <div className="exam-results__filter-chips" role="tablist" aria-label="Filtrer les questions">
            <button
              type="button"
              role="tab"
              aria-selected={reviewFilter === 'all'}
              className={`exam-results__filter-chip ${reviewFilter === 'all' ? 'exam-results__filter-chip--active' : ''}`}
              onClick={() => setReviewFilter('all')}
            >
              Toutes ({results.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={reviewFilter === 'review'}
              className={`exam-results__filter-chip exam-results__filter-chip--review ${reviewFilter === 'review' ? 'exam-results__filter-chip--active' : ''}`}
              onClick={() => setReviewFilter('review')}
              disabled={reviewCount === 0}
            >
              À revoir ({reviewCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={reviewFilter === 'mastered'}
              className={`exam-results__filter-chip exam-results__filter-chip--mastered ${reviewFilter === 'mastered' ? 'exam-results__filter-chip--active' : ''}`}
              onClick={() => setReviewFilter('mastered')}
              disabled={masteredCount === 0}
            >
              Réussies ({masteredCount})
            </button>
          </div>
        </div>

        {filteredResults.length === 0 && (
          <div className="card card--message exam-results__filter-empty">
            <p>Aucune question dans cette catégorie.</p>
          </div>
        )}

        {filteredResults.map(({ r, i }) => {
          const meta = questionTypeMeta(r.question.type);
          return (
            <div key={i} className={`card exam-results__item exam-results__item--${r.status}`}>
              <div className="exam-results__item-header">
                <span className="exam-results__item-number">{r.question._displayNumber || `Q${i + 1}`}</span>
                <span className="exam-results__item-type">
                  <Icon name={meta.icon} size={14} /> {meta.label}
                </span>
                <StatusBadge status={r.status} />
                {r.result.maxPoints > 0 && (
                  <span className="exam-results__item-points">
                    {r.result.awarded}/{r.result.maxPoints} pt{r.result.maxPoints !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="exam-results__item-question">
                <InstructionRenderer text={r.question._displayText || r.question.question} />
              </div>

              {/* Figure */}
              {r.question.has_figure && r.question.figure_description && (
                <FigureRenderer description={r.question.figure_description} compact />
              )}

              {/* Temporal context note */}
              {r.question.temporal_note && (
                <div className="exam-take__temporal-note" style={{ margin: '0.5rem 0' }}>
                  <span className="exam-take__temporal-note-icon"><Clock size={14} /></span>
                  <span className="exam-take__temporal-note-text">{r.question.temporal_note}</span>
                </div>
              )}

              {/* User answer */}
              {r.userAnswer && (
                <div className="exam-results__item-answer">
                  <strong>Votre réponse :</strong>{' '}
                  {r.status === 'scaffold-complete' || r.status === 'partial' || (r.userAnswer.startsWith('{') && r.userAnswer.includes('"scaffold"'))
                    ? <ScaffoldResultDisplay
                        answer={r.userAnswer}
                        blanks={r.question.scaffold_blanks}
                        blankResults={r.result?.blankResults}
                        modelAnswer={r.question.model_answer}
                      />
                    : r.question.type === 'multiple_choice' && r.question.options
                      ? <span>{r.userAnswer.toUpperCase()}) <InstructionRenderer text={r.question.options[r.userAnswer] || r.userAnswer} inline /></span>
                      : <ProofOrPlainAnswer answer={r.userAnswer} correctAnswer={r.question.correct || r.question.final_answer} />
                  }
                </div>
              )}

              {/* Correct answer */}
              {(r.question.correct || r.question.final_answer) && (
                <div className="exam-results__item-correct">
                  <strong>Réponse correcte :</strong>{' '}
                  {r.question.type === 'multiple_choice' && r.question.options
                    ? <span>{(r.question.correct || '').toUpperCase()}) <InstructionRenderer text={r.question.options[r.question.correct] || r.question.correct} inline /></span>
                    : <InstructionRenderer text={String(r.question.correct || r.question.final_answer)} inline />
                  }
                </div>
              )}

              {/* Model answer — show full solution for questions with answer_parts */}
              {!r.question.correct && r.question.model_answer && r.status !== 'scaffold-complete' && r.status !== 'partial' && (
                <details className="exam-results__item-solution">
                  <summary><BookOpen size={14} /> Voir la solution complète</summary>
                  <div className="exam-results__item-solution-body">
                    <InstructionRenderer text={r.question.model_answer} />
                  </div>
                </details>
              )}

              {/* Multiple approaches for proofs/calculations */}
              {r.question.approaches && r.question.approaches.length > 1 && (
                <details className="exam-results__item-approaches">
                  <summary><RefreshCw size={14} /> Approches alternatives ({r.question.approaches.length})</summary>
                  <div className="exam-results__item-approaches-body">
                    {r.question.approaches.map((approach, ai) => (
                      <div key={ai} className="exam-results__approach">
                        <strong>{approach.name}</strong>
                        <ol>
                          {(approach.steps || []).map((step, si) => (
                            <li key={si}><InstructionRenderer text={step} /></li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Explanation */}
              {r.question.explanation && (
                <div className="exam-results__item-explanation">
                  <Lightbulb size={14} /> <InstructionRenderer text={r.question.explanation} inline />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="exam-results__actions">
        <button
          className="button button--primary"
          onClick={() => navigate(`/exams/${level}/${examId}`)}
          type="button"
        >
          <RefreshCw size={16} /> Recommencer cet examen
        </button>
        {reviewCount > 0 && (
          <button className="button button--secondary" onClick={() => setPracticeOpen(true)} type="button">
            <Target size={16} /> M'entraîner sur mes {reviewCount} erreur{reviewCount !== 1 ? 's' : ''}
          </button>
        )}
        <button className="button button--ghost" onClick={() => navigate(`/exams/${level || ''}`)} type="button">
          <PenLine size={16} /> Choisir un autre examen
        </button>
      </div>
      </div>

      {/* Practice-your-mistakes session */}
      {practiceOpen && practiceItems.length > 0 && (
        <ReviewSession
          items={practiceItems}
          color={color}
          subject={subject}
          onClose={() => setPracticeOpen(false)}
        />
      )}
    </section>
  );
};

/**
 * Renders a user answer — if it's proof JSON, render steps + final answer
 * with CAS verification in a clean Khan Academy-style layout.
 */
function ProofOrPlainAnswer({ answer, correctAnswer }) {
  const katexReady = useKatex();

  // Try to parse as proof JSON
  let proofData = null;
  if (typeof answer === 'string' && (answer.startsWith('{') || answer.startsWith('['))) {
    try {
      const parsed = JSON.parse(answer);
      if (parsed && parsed.steps && Array.isArray(parsed.steps)) {
        proofData = { steps: parsed.steps, finalAnswer: parsed.finalAnswer || '' };
      } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].math !== undefined) {
        proofData = { steps: parsed, finalAnswer: '' };
      }
    } catch { /* not proof JSON */ }
  }

  if (!proofData) return <>{String(answer)}</>;

  // CAS-check the final answer
  let casVerdict = null;
  if (proofData.finalAnswer && correctAnswer) {
    casVerdict = checkWithCAS(proofData.finalAnswer, correctAnswer);
  }

  const filledSteps = proofData.steps.filter(s => s.math?.trim());

  return (
    <div className="ka-results">
      {/* Steps timeline */}
      <div className="ka-results__steps">
        {proofData.steps.map((step, i) => {
          const filled = !!step.math?.trim();
          return (
            <div key={i} className={`ka-results__step ${filled ? 'ka-results__step--done' : 'ka-results__step--empty'}`}>
              <div className="ka-results__step-dot">
                {filled ? (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <div className="ka-results__step-body">
                <div className="ka-results__step-math">
                  {step.math && (/\$/.test(step.math) || /\\[a-zA-Z]/.test(step.math))
                    ? <span dangerouslySetInnerHTML={renderWithKatex(step.math, katexReady)} />
                    : step.math || <span className="ka-results__empty">—</span>
                  }
                </div>
                {step.justification && (
                  <div className="ka-results__step-reason">↳ {step.justification}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Final answer with CAS badge */}
      {proofData.finalAnswer && (
        <div className={`ka-results__answer ${casVerdict ? (casVerdict.correct ? 'ka-results__answer--correct' : 'ka-results__answer--incorrect') : ''}`}>
          <div className="ka-results__answer-row">
            <span className="ka-results__answer-label"><Target size={14} /> Résultat final</span>
            {casVerdict && (
              <span className={`ka-results__cas ${casVerdict.correct ? 'ka-results__cas--correct' : 'ka-results__cas--incorrect'}`}>
                {casVerdict.correct ? <><Check size={14} /> Correct</> : <><X size={14} /> Incorrect</>}
              </span>
            )}
          </div>
          <div className="ka-results__answer-value">
            {(/\$/.test(proofData.finalAnswer) || /\\[a-zA-Z]/.test(proofData.finalAnswer))
              ? <span dangerouslySetInnerHTML={renderWithKatex(proofData.finalAnswer, katexReady)} />
              : proofData.finalAnswer
            }
          </div>
          {casVerdict && casVerdict.method === 'cas' && casVerdict.details?.valueA != null && (
            <div className="ka-results__cas-detail">
              ≈ {casVerdict.details.valueA.toFixed(4)}
              {!casVerdict.correct && casVerdict.details.valueB != null && ` ≠ ${casVerdict.details.valueB.toFixed(4)}`}
            </div>
          )}
        </div>
      )}

      {/* Summary line */}
      <div className="ka-results__summary">
        {filledSteps.length} étape{filledSteps.length !== 1 ? 's' : ''} complétée{filledSteps.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    correct:            { label: <><Check size={12} /> Correct</>, cls: 'exam-results__badge--correct' },
    incorrect:          { label: <><X size={12} /> Incorrect</>, cls: 'exam-results__badge--incorrect' },
    partial:            { label: '◐ Partiel', cls: 'exam-results__badge--partial' },
    manual:             { label: <><Eye size={12} /> Révision</>, cls: 'exam-results__badge--manual' },
    unanswered:         { label: '— Vide', cls: 'exam-results__badge--unanswered' },
    'scaffold-complete': { label: <><PenLine size={12} /> Complété</>, cls: 'exam-results__badge--correct' },
  };
  const m = map[status] || map.unanswered;
  return <span className={`exam-results__badge ${m.cls}`}>{m.label}</span>;
}

export default ExamResults;
