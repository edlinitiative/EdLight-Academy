import React, { useEffect, useMemo, useState } from 'react';
import './ExamResults.css';
import './examPremium.css';
import './examResultsPremium.css';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, BarChart3, Clock, Lightbulb, RefreshCw, PenLine, Target, Check, X, Eye, ChevronLeft } from '../components/icons';
import useStore from '../contexts/store';
import FigureRenderer from '../components/FigureRenderer';
import InstructionRenderer from '../components/InstructionRenderer';
import Icon from '../components/Icon';
import { useKatex, renderWithKatex } from '../utils/shared';
import { checkWithCAS } from '../utils/mathCAS';
import ReviewSession from '../components/ReviewSession';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { EmptyState } from '../components/StateViews';
import { TRACK_BY_CODE } from '../config/trackConfig';
import { isNumericId, fetchSingleExam } from '../utils/examCatalog';
import { loadExamResult } from '../services/examResults';
import { loadDueReviewIds } from '../services/reviewService';
import { gradeEssaysNow } from '../services/essayRegrade';
import { needsEssayGrade, type EssayGradingOutcome } from '../../shared/essayRegrade';
import { classifyEssayResponse } from '../../shared/essayGradeCore';
import { examQuestionContext } from '../../shared/explainContext';
import { ExplainWithSandra } from '../components/SandraWidget';
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

// Statuses that mean the student did NOT get full credit on the question.
const NEEDS_REVIEW = new Set(['incorrect', 'partial', 'unanswered']);
const MASTERED = new Set(['correct', 'scaffold-complete']);

/**
 * WHERE EVERY NUMBER ON THIS PAGE COMES FROM
 * ──────────────────────────────────────────
 * (Redesign plan §6.6: "Define the source and meaning of each displayed
 * number." Anything not traceable to one of these is not displayed.)
 *
 *   summary.*           `gradeExam()` in shared/examUtils.ts. Computed at
 *                       SUBMIT time and stored on
 *                       users/{uid}/examResults/{examId}. The loader below
 *                       prefers that stored summary over a fresh re-grade —
 *                       see its comment for why.
 *   summary.percentage  round(earnedPoints / totalPoints × 100). THE score,
 *                       and the only percentage this page calls a score.
 *   summary.earnedPoints / summary.totalPoints
 *                       Points awarded / points on the paper. Shown because
 *                       they are the two numbers the percentage divides.
 *   summary.coefficient / weightedEarned / weightedTotal
 *                       The filière coefficient for this subject
 *                       (config/trackConfig) applied to the same points.
 *   results[i].status   One verdict per question: correct | partial |
 *                       incorrect | unanswered | manual | scaffold-complete |
 *                       ungraded (an AI-gradable answer whose grading has
 *                       not succeeded: left OUT of totalPoints, offered
 *                       "Corriger maintenant", never shown as 0).
 *   results[i].result.awarded / .maxPoints
 *                       Per-question points, which is what the per-group
 *                       percentages below are built from.
 *   dueCount            `loadDueReviewIds` → users/{uid}/mastery/review, the
 *                       ONE shared review doc mobile also writes. These are
 *                       QUIZ-BANK questions missed in EXERCISES — exam
 *                       questions are never written there — so the copy that
 *                       shows it always names that source. Signed out it is
 *                       not fetched at all and nothing about it is claimed.
 *
 * DELIBERATELY NOT SHOWN
 *   summary.correctCount / summary.incorrectCount — `correctCount` is a
 *     partial-credit SUM, not a count: shared/examUtils.ts does
 *     `correctCount += awarded / pts` for every partial answer, so it can be
 *     2.3333 and the four "counts" never add up to the number of questions.
 *     This page counts statuses instead (`statusTally`): integers that always
 *     sum to results.length.
 *   summary.autoGraded — how many questions the grading pipeline could handle
 *     by itself. A pipeline detail with no meaning for a student
 *     (§13, "metrics without clear meaning"). `summary.manualReview` survives
 *     as a sentence rather than a figure, because it is the one thing there
 *     that a student needs: it explains why the score may still move.
 *
 * WHAT THIS PAGE DOES NOT CLAIM: mastery, or readiness.
 *   Durable mastery lives in ONE shared document —
 *   users/{uid}/mastery/lessons (services/masteryService.ts, the same doc the
 *   mobile app writes) — keyed by LESSON id and promoted by the lesson ladder.
 *   Exam questions are not lesson-keyed and nothing here writes that doc, so
 *   the per-group percentages below are labelled as points earned on THIS
 *   paper. Readiness (services/readinessService.ts) is a separate
 *   coefficient-weighted blend of exam results and study-plan mastery; this
 *   page links to where it is displayed instead of restating it.
 */

/**
 * Count the per-question verdicts. Integers, one per question, always summing
 * to `results.length` — which is exactly what `summary.correctCount` cannot
 * promise (see the note above).
 *
 * An unrecognised status lands in `pending` rather than `blank`: "we cannot
 * score this yet" is the honest fallback, "you left it empty" is an accusation.
 *
 * Exported for the regression test in __tests__/examResultsTally.test.ts.
 */
export function statusTally(results) {
  const tally = { right: 0, partial: 0, wrong: 0, blank: 0, pending: 0, total: 0 };
  for (const r of results || []) {
    tally.total += 1;
    switch (r?.status) {
      case 'correct':
      case 'scaffold-complete': tally.right += 1; break;
      case 'partial': tally.partial += 1; break;
      case 'incorrect': tally.wrong += 1; break;
      case 'unanswered': tally.blank += 1; break;
      default: tally.pending += 1; break;
    }
  }
  return tally;
}

/**
 * A per-group percentage is only worth pointing at if enough of the paper sits
 * in that group. One question worth one point at 0% is noise, not a weakness,
 * and §13 forbids "metrics without ... supporting evidence".
 */
export const FOCUS_MIN_QUESTIONS = 2;

// Canonical exam subject → the course/quiz subject code used by the catalog.
// Only the four taught subjects have a practice bank today; this lets us close
// the loop by deep-linking a weak mock-exam subject straight to its drills.
const SUBJECT_TO_COURSE_CODE = {
  'Mathématiques': 'MATH',
  'Physique': 'PHYS',
  'Chimie': 'CHEM',
  'Économie': 'ECON',
};

/**
 * Group graded results by a key (question type or exam section) and compute
 * each group's share of the points it was worth ON THIS PAPER. Returns groups
 * sorted weakest first, so the gap to attack is element [0].
 *
 * `pct` = awarded points ÷ possible points inside the group. It is a result,
 * not a mastery estimate: it comes from one sitting of one exam and is never
 * written to the mastery document. The UI labels it accordingly.
 */
function computeGroupScores(results, keyFn) {
  const groups = new Map();
  for (const r of results) {
    // Not graded yet: it is out of the score, so it is out of the groups too.
    if (r?.status === 'ungraded') continue;
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

/**
 * One group's score on this paper, as a labelled bar.
 *
 * The `exam-results__mastery-*` class names are historical (they live in
 * src/index.css, which this change does not own). The copy no longer says
 * "maîtrise", because a single exam does not establish mastery — only the
 * shared mastery document does, and nothing here writes it.
 */
function GroupScoreBar({ label, pct, earned, total, count, review }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);
  const tone = pct >= 75 ? 'good' : pct >= 50 ? 'mid' : 'low';
  return (
    <div className="exam-results__mastery-row">
      <div className="exam-results__mastery-head">
        <span className="exam-results__mastery-label" title={label}>{label}</span>
        <span className={`exam-results__mastery-pct exam-results__mastery-pct--${tone}`}>{pct}%</span>
      </div>
      <div
        className="exam-results__mastery-track"
        role="img"
        aria-label={`${label}: ${earned}/${total} ${t('points', 'pwen')}`}
      >
        <div className={`exam-results__mastery-fill exam-results__mastery-fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="exam-results__mastery-meta">
        {earned}/{total} {t('points sur', 'pwen sou')} {count} {t('question', 'kesyon')}{count !== 1 ? t('s', '') : ''}
        {review > 0 && <> · <strong>{review} {t('à revoir', 'pou revize')}</strong></>}
      </span>
    </div>
  );
}

/** Renders scaffold blank answers in the results view with per-blank grading */
function ScaffoldResultDisplay({ answer, blanks, blankResults, modelAnswer }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);
  let values = [];
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
          <summary className="scaffold-result__solution-toggle"><BookOpen size={14} /> {t('Voir la solution complète', 'Wè solisyon konplè a')}</summary>
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
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

  // Fetch ONLY this exam (a few KB) instead of the full 27 MB catalog.
  const { data: exam } = useQuery({
    queryKey: ['exam', examId],
    queryFn: () => fetchSingleExam(examId),
    enabled: examId != null,
    staleTime: Infinity,
  });

  /*
   * QUIZ-BANK QUESTIONS STILL DUE, from the ONE shared review document
   * (users/{uid}/mastery/review — the same doc mobile writes). Used for a
   * single purpose: when this paper leaves nothing to review, the honest best
   * next action is the mistakes the student already has on file. The copy
   * always names that source ("dans vos exercices"), because these are NOT
   * exam questions — nothing writes exam mistakes to that document.
   *
   * Same query key as /exams/resultats and the Practice hub, so all three
   * share one cached answer and can never quote different totals.
   */
  const { data: dueIds = [] } = useQuery({
    queryKey: ['due-review-ids', userId],
    queryFn: () => loadDueReviewIds(userId!),
    enabled: !!userId,
  });

  // Legacy numeric routes still resolve to the saved result index.
  const idx = useMemo(() => (isNumericId(examId) ? parseInt(examId, 10) : null), [examId]);
  const examKey = exam?.exam_id || (Number.isFinite(idx) ? String(idx) : null);

  const [stored, setStored] = useState(null);
  // Start as true so we show "Chargement…" on first render rather than
  // "Aucun résultat trouvé" before the sessionStorage/Firestore check runs.
  const [remoteLoading, setRemoteLoading] = useState(true);
  /*
   * A FAILED READ IS NOT AN ABSENT RESULT (§8: an error says what happened
   * and offers a safe recovery). The Firestore read below used to sit in a
   * try/finally with no catch: a dropped connection left `stored` null and the
   * page answered "Aucun résultat trouvé pour cet examen" — telling a student
   * their correction did not exist because a request timed out. This is the
   * same failure ExamHistory was fixed for. `reloadKey` drives the retry.
   */
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Detail list filter: 'all' | 'review' (mistakes) | 'mastered'
  const [reviewFilter, setReviewFilter] = useState('all');
  // Practice-your-mistakes session modal
  const [practiceOpen, setPracticeOpen] = useState(false);
  // "Corriger maintenant": AI grading of essays that were not graded at submit.
  const [regrade, setRegrade] = useState<{ running: boolean; outcome: EssayGradingOutcome | null }>({ running: false, outcome: null });

  const runRegrade = async () => {
    if (!userId || !examKey || !exam || regrade.running) return;
    setRegrade({ running: true, outcome: null });
    const outcome = await gradeEssaysNow(userId, examKey, flattenQuestions(exam), {
      subject: normalizeSubject(exam.subject),
      level: normalizeLevel(exam.level),
    });
    setRegrade({ running: false, outcome });
    if (outcome.status === 'graded' || outcome.status === 'nothing' || outcome.status === 'stale') {
      // The account copy changed (or this tab's copy was older than it):
      // drop the tab copy and reload the regraded document.
      for (const key of [`exam-result-${examId}`, `exam-result-${examKey}`, `exam-result-${idx}`]) {
        try { sessionStorage.removeItem(key); } catch { /* storage unavailable */ }
      }
      setStored(null);
      setRemoteLoading(true);
      setReloadKey((k) => k + 1);
    }
  };

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
        setRemoteLoading(false);
        return;
      } catch {
        // keep trying
      }
    }

    // 2) Firestore fallback. If we can't run it (signed out, unknown exam, or
    // the exam JSON isn't loaded), stop the spinner instead of hanging forever
    // on a shared/anonymous link.
    if (!userId || !examKey || !exam) {
      setRemoteLoading(false);
      return;
    }
    let cancelled = false;
    setRemoteLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const docData = await loadExamResult(userId, examKey);
        if (cancelled) return;
        if (!docData) return;

        const questions = flattenQuestions(exam);
        const answers = docData.answers || {};
        const pre = { ...(docData.preGradedResults || {}) };
        // A paper submitted from the APP stores lean per-item verdicts in
        // `results` and no preGradedResults. Its AI-graded (or still pending)
        // essays live only there, so take those; everything else re-grades
        // locally exactly as before.
        if (!docData.preGradedResults && Array.isArray(docData.results)) {
          docData.results.forEach((r, i) => {
            const q = questions[i];
            if (!r || !q || (q.type !== 'essay' && q.type !== 'short_answer')) return;
            if (r.status !== 'ungraded' && !r.essayFeedback) return;
            pre[i] = { status: r.status, result: { awarded: r.awarded ?? 0, maxPoints: r.maxPoints ?? (q.points || 1) }, essayFeedback: r.essayFeedback };
          });
        }

        const track = docData.track || '';
        const subject = normalizeSubject(exam.subject);
        const result = gradeExam(questions, answers, pre, { track, subject });

        // Prefer the score computed at SUBMIT time (docData.summary). A cross-
        // device / post-refresh re-grade runs off preGradedResults, which can be
        // partial for AI-graded essays (grading failed at submit, or older doc
        // schema) — re-grading would then score those free-response questions 0
        // and show a LOWER score than the student actually earned.
        const summary = docData.summary || result.summary;

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
          result: { ...result, summary, results: mergedResults },
          timestamp: docData.submitted_at_ms || Date.now(),
        });
      } catch {
        // Offline, a Firestore rule refusal, or a corrupt stored document.
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [examId, examKey, idx, userId, exam, reloadKey]);

  if (!stored) {
    if (remoteLoading) {
      // Results-shaped skeleton: score ring + summary stats + detail rows, so
      // the page doesn't flash a spinner then reflow.
      return (
        <section className="section">
          <div className="container" aria-busy="true">
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.4rem', flexWrap: 'wrap' }}>
              <Skeleton variant="circle" width={132} height={132} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <SkeletonText lines={2} lastWidth="40%" />
                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} width={96} height={56} radius={12} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '0.6rem', marginTop: '1rem' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={64} radius={14} />
              ))}
            </div>
          </div>
        </section>
      );
    }
    if (loadError) {
      return (
        <section className="section">
          <div className="container">
            <EmptyState
              title={t('Correction indisponible pour le moment', 'Koreksyon an pa disponib kounye a')}
              message={t(
                'Votre correction n’a pas pu être chargée — souvent une connexion coupée. Elle n’est pas perdue : réessayez.',
                'Koreksyon ou a pa t ka chaje — anpil fwa se koneksyon an. Li pa pèdi : eseye ankò.',
              )}
              action={{
                label: t('Réessayer', 'Eseye ankò'),
                onClick: () => setReloadKey((k) => k + 1),
              }}
              secondaryAction={{
                label: t('Mes résultats', 'Rezilta mwen'),
                onClick: () => navigate('/exams/resultats'),
              }}
            />
          </div>
        </section>
      );
    }
    return (
      <section className="section">
        <div className="container">
          <EmptyState
            title={t('Aucun résultat trouvé', 'Nou pa jwenn okenn rezilta')}
            message={
              userId
                ? t('Aucune correction enregistrée pour cet examen. Passez-le pour voir votre correction détaillée ici.',
                  'Pa gen koreksyon anrejistre pou egzamen sa a. Pase li pou wè koreksyon detaye ou isit la.')
                : /*
                   * Signed out, the correction only ever lived in this tab's
                   * sessionStorage — so "nothing here" can simply mean a new
                   * tab. §8: explain why, then offer the action that fixes it.
                   */
                  t('Sans connexion, une correction reste dans l’onglet où vous avez passé l’examen. Connectez-vous pour retrouver vos corrections partout.',
                    'Si ou pa konekte, yon koreksyon rete nan onglè kote ou te fè egzamen an. Konekte pou jwenn koreksyon ou yo tout kote.')
            }
            action={
              userId
                ? {
                    label: t('Passer cet examen', 'Fè egzamen sa a'),
                    onClick: () => navigate(`/exams/${level || ''}/${examId}`),
                  }
                : {
                    label: t('Se connecter', 'Konekte'),
                    onClick: () => useStore.getState().toggleAuthModal(),
                  }
            }
            secondaryAction={{
              label: t('Retour aux examens', 'Retounen nan egzamen yo'),
              onClick: () => navigate(`/exams/${level || ''}`),
            }}
          />
        </div>
      </section>
    );
  }

  const { result, examTitle, subject, level: storedLevel, track: examTrack, aiGradeFailures = 0 } = stored;
  const { summary, results } = result;
  const color = subjectColor(subject);
  const trackInfo = examTrack ? TRACK_BY_CODE[examTrack] : null;

  const pct = summary.percentage;

  // ── Per-question verdicts (integers; see statusTally's note) ──────────────
  const tally = statusTally(results);

  // ── Where the points went on this paper ───────────────────────────────────
  const scoreBySection = computeGroupScores(results, (r) => r.question?.sectionTitle || 'Questions');
  const scoreByType = computeGroupScores(results, (r) => questionTypeMeta(r.question?.type).label);
  /*
   * A ONE-ROW BREAKDOWN IS THE SCORE SAID TWICE. Browser-verified on a real
   * paper whose five questions are all "réponse courte": the type column
   * printed a single bar reading 25%, 25/100 — character for character the
   * score already shown above it. §6.6 forbids exactly that ("avoid a wall of
   * equal-weight statistics"), so a grouping only appears when it actually
   * splits the paper into more than one group.
   */
  const showSectionScores = scoreBySection.length > 1;
  const showTypeScores = scoreByType.length > 1;
  const showBreakdown = showSectionScores || showTypeScores;

  // ── Review focus filter ───────────────────────────────────────────────────
  const indexedResults = results.map((r, i) => ({ r, i }));
  const reviewCount = results.filter((r) => NEEDS_REVIEW.has(r.status)).length;
  const masteredCount = results.filter((r) => MASTERED.has(r.status)).length;
  const filteredResults = indexedResults.filter(({ r }) => {
    if (reviewFilter === 'review') return NEEDS_REVIEW.has(r.status);
    if (reviewFilter === 'mastered') return MASTERED.has(r.status);
    return true;
  });

  // Questions to re-practise (everything that did not earn full credit)
  const practiceItems = results.filter((r) => NEEDS_REVIEW.has(r.status) && r.question);

  const focusOnMistakes = () => {
    setReviewFilter('review');
    setTimeout(() => {
      document.querySelector('.exam-results__details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  // ── Close the loop: weakest group on this paper → targeted practice ───────
  // `computeGroupScores` sorts weakest-first, so element [0] is the gap to
  // attack. Prefer the section breakdown when the exam has real sections.
  //
  // A group is only named as a weak point when at least FOCUS_MIN_QUESTIONS
  // questions sit in it; below that the paper simply does not say enough, and
  // the copy falls back to the subject instead of inventing a diagnosis.
  // When no grouping splits the paper (see `showBreakdown`), there is no weak
  // AREA to name — only a weak paper — and the copy must not pretend otherwise.
  const weakestGroup = showSectionScores
    ? scoreBySection[0]
    : showTypeScores ? scoreByType[0] : null;
  const focusGroup = weakestGroup && weakestGroup.count >= FOCUS_MIN_QUESTIONS && weakestGroup.pct < 80
    ? weakestGroup
    : null;
  const nothingLost = tally.total > 0 && reviewCount === 0;
  const courseCode = SUBJECT_TO_COURSE_CODE[subject] || null;
  const studyTarget = courseCode ? `/quizzes?course=${courseCode}` : '/courses';
  // Readiness is rendered on /exams (ExamLanding) and /profile — not on the
  // dashboard, which is where this button used to send people.
  const readinessTarget = '/exams';
  /*
   * THE READINESS CLAIM IS ONLY TRUE WHEN SIGNED IN. `useReadiness` feeds off
   * `listRecentExamResults`, i.e. users/{uid}/examResults — and
   * services/examResults.ts refuses to write without a Firebase session. A
   * signed-out correction lives in sessionStorage and contributes nothing, so
   * promising it "counts toward your Bac readiness" would be inventing student
   * activity (§3). Signed out, the device-local note below is the whole truth.
   */
  const showsReadiness = !!userId;
  // Exercise mistakes already on file — see the `dueIds` note above.
  const dueCount = dueIds.length;
  // Nothing left to review on this paper, but mistakes waiting elsewhere:
  // that queue is a better next action than another fresh drill.
  const offerDueReview = reviewCount === 0 && dueCount > 0;

  // Written answers the AI grader can still mark: `ungraded` (failed or
  // pending), old `manual` essays from the app, and old web essays whose
  // failed call was stored as 0. They never wait for a human, so they are
  // not part of the "correction humaine" sentence below.
  const regradable = results.filter((r) => r?.question && needsEssayGrade(r.question, r.userAnswer, r));
  const regradableCount = regradable.length;
  const regradablePending = regradable.filter((r) => r.status === 'ungraded' || r.status === 'manual').length;
  const humanPending = Math.max(0, tally.pending - regradablePending);
  const pendingPoints = Number(summary.pendingPoints) || 0;

  /** The one caveat that can move the score, as a sentence rather than a figure. */
  const pendingNote = humanPending > 0
    ? t(
        `${humanPending} question${humanPending !== 1 ? 's' : ''} attend${humanPending !== 1 ? 'ent' : ''} une correction humaine : votre score peut encore changer.`,
        `${humanPending} kesyon ap tann yon koreksyon moun fè : nòt ou a ka chanje toujou.`,
      )
    : null;

  const regradeMessage = (() => {
    const o = regrade.outcome;
    if (!o) return null;
    if (o.status === 'missing') {
      return t(
        'Votre copie n’est pas encore enregistrée sur votre compte. Réessayez une fois la connexion revenue.',
        'Kopi ou poko anrejistre sou kont ou. Eseye ankò lè koneksyon an tounen.',
      );
    }
    if (o.status !== 'failed') return null;
    if (o.rateLimited) {
      return t('Trop de corrections demandées pour l’instant. Réessayez dans une heure.', 'Twòp koreksyon mande pou kounye a. Eseye ankò nan inèdtan.');
    }
    if (o.offline) {
      return t('La correction n’a pas pu être lancée : vérifiez votre connexion et réessayez.', 'Koreksyon an pa t ka fèt : verifye koneksyon ou epi eseye ankò.');
    }
    return t('La correction automatique n’a pas abouti. Réessayez dans un moment.', 'Koreksyon otomatik la pa t mache. Eseye ankò talè.');
  })();

  return (
    <section className="section exam-results xp xp-res">
      <div className="container">
        {/*
          S11: the paper is the title, its status sits under it, and the score
          is a figure with its definition — no ring, no confetti, no grade
          adjective. The tally and the caveats below carry the nuance.
        */}
        <header className="exam-results__head">
          <button className="xp-back" onClick={() => navigate(`/exams/${level || ''}`)} type="button">
            <ChevronLeft size={16} aria-hidden /> {t('Examens', 'Egzamen')}
          </button>
          <p className="exam-results__context">
            {[subject, storedLevel].filter(Boolean).join(' · ')}
          </p>
          <h1 className="exam-results__title">{examTitle || t('Examen', 'Egzamen')}</h1>
          <p className={`exam-results__status${tally.pending > 0 || aiGradeFailures > 0 || regradableCount > 0 ? ' exam-results__status--provisional' : ''}`}>
            {tally.pending > 0 || aiGradeFailures > 0 || regradableCount > 0
              ? t('Correction provisoire', 'Koreksyon pwovizwa')
              : t('Correction terminée', 'Koreksyon fini')}
          </p>
        </header>

      {regradableCount > 0 && (
        <div className="exam-results__caveat exam-results__caveat--warn exam-results__regrade" role="status">
          <p>
            {regradableCount === 1
              ? t(
                'Une réponse rédigée n’est pas encore corrigée : elle ne compte pas encore dans votre score.',
                'Yon repons ekri poko korije : li poko konte nan nòt ou.',
              )
              : t(
                `${regradableCount} réponses rédigées ne sont pas encore corrigées : elles ne comptent pas encore dans votre score.`,
                `${regradableCount} repons ekri poko korije : yo poko konte nan nòt ou.`,
              )}
          </p>
          {userId ? (
            <button
              type="button"
              className="xp-btn xp-btn--tonal exam-results__regrade-btn"
              onClick={runRegrade}
              disabled={regrade.running}
              aria-busy={regrade.running}
            >
              <RefreshCw size={16} aria-hidden />{' '}
              {regrade.running ? t('Correction en cours…', 'N ap korije…') : t('Corriger maintenant', 'Korije kounye a')}
            </button>
          ) : (
            <p>{t('Connectez-vous pour lancer la correction.', 'Konekte pou lanse koreksyon an.')}</p>
          )}
          {regradeMessage && <p className="exam-results__regrade-msg">{regradeMessage}</p>}
        </div>
      )}

      {aiGradeFailures > 0 && regradableCount === 0 && (
        <p className="exam-results__caveat exam-results__caveat--warn" role="status">
          {t(
            'Certaines réponses libres n’ont pas pu être corrigées automatiquement. Votre score peut être incomplet.',
            'Kèk repons lib pa t ka korije otomatikman. Nòt ou a ka pa konplè.',
          )}
        </p>
      )}

      {/* Set by ExamTake when the account copy wasn't acknowledged in time
          (offline) or was refused. Never claim it is in the history yet. */}
      {(stored?.syncState === 'pending' || stored?.syncState === 'failed') && (
        <p className="exam-results__caveat exam-results__caveat--warn" role="status">
          {stored.syncState === 'pending'
            ? t(
              'Pas encore enregistré sur votre compte : la connexion est lente ou absente. Gardez l’application ouverte, le résultat sera envoyé dès le retour du réseau.',
              'Poko anrejistre sou kont ou : koneksyon an lan oswa li pa la. Kite aplikasyon an louvri, rezilta a ap voye depi rezo a tounen.',
            )
            : t(
              'Ce résultat n’a pas pu être enregistré sur votre compte. Vos réponses restent sur cet appareil : rouvrez l’examen pour le remettre à nouveau.',
              'Nou pa t ka anrejistre rezilta sa a sou kont ou. Repons ou yo rete sou aparèy sa a : relouvri egzamen an pou remèt li ankò.',
            )}
        </p>
      )}

      {/* Score overview */}
      <div className="exam-results__overview" aria-label={`${t('Score', 'Nòt')}: ${pct}%`}>
        <div className="exam-results__summary">
          <p className="exam-results__points">
            <span className="exam-results__points-value">{summary.earnedPoints}</span>
            <span className="exam-results__points-total">/ {summary.totalPoints}</span>
          </p>
          <p className="exam-results__points-label">
            {t(`points obtenus sur cette épreuve · ${pct} %`, `pwen ou genyen nan eprèv sa a · ${pct} %`)}
            {pendingPoints > 0 && (
              <> · {t(`${pendingPoints} pts en attente de correction`, `${pendingPoints} pwen ap tann koreksyon`)}</>
            )}
          </p>
          <div className="xp-bar xp-bar--8 exam-results__bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>

          <ul className="exam-results__tally" aria-label={t('Détail des réponses', 'Detay repons yo')}>
            <li className="exam-results__tally-item exam-results__tally-item--right xp-pill xp-pill--mint">
              <Check size={15} aria-hidden />
              <strong>{tally.right}</strong> {t('juste', 'kòrèk')}{tally.right !== 1 ? t('s', '') : ''}
            </li>
            {tally.partial > 0 && (
              <li className="exam-results__tally-item exam-results__tally-item--partial xp-pill xp-pill--amber">
                <span aria-hidden>◐</span>
                <strong>{tally.partial}</strong> {t('partielle', 'pasyèl')}{tally.partial !== 1 ? t('s', '') : ''}
              </li>
            )}
            <li className="exam-results__tally-item exam-results__tally-item--wrong xp-pill xp-pill--rose">
              <X size={15} aria-hidden />
              <strong>{tally.wrong}</strong> {t('fausse', 'fo')}{tally.wrong !== 1 ? t('s', '') : ''}
            </li>
            {tally.blank > 0 && (
              <li className="exam-results__tally-item xp-pill xp-pill--well">
                <span aria-hidden>—</span>
                <strong>{tally.blank}</strong> {t('sans réponse', 'san repons')}
              </li>
            )}
            {tally.pending > 0 && (
              <li className="exam-results__tally-item exam-results__tally-item--pending xp-pill">
                <Eye size={15} aria-hidden />
                <strong>{tally.pending}</strong> {t('à corriger', 'pou korije')}
              </li>
            )}
            <li className="exam-results__tally-total">
              {t('sur', 'sou')} {tally.total} {t('question', 'kesyon')}{tally.total !== 1 ? t('s', '') : ''}
            </li>
          </ul>

          {pendingNote && (
            <p className="exam-results__caveat" role="status">
              <Eye size={14} aria-hidden /> {pendingNote}
            </p>
          )}

          {/* Coefficient-weighted score — one row, not a titled sub-card. */}
          {summary.coefficient && summary.coefficient > 1 && trackInfo && (
            <p className="exam-results__weighted-line">
              <BarChart3 size={14} aria-hidden />
              {t('Filière', 'Filyè')} {trackInfo.shortLabel} · {t('coefficient', 'koyefisyan')}{' '}
              <span className="exam-results__coeff-badge">×{summary.coefficient}</span>{' '}
              <span className="exam-results__weighted-value">
                {summary.weightedEarned} / {summary.weightedTotal} {t('points pondérés', 'pwen pondere')}
              </span>
            </p>
          )}

          {/* Every number above, in plain language. §6.6: define each one. */}
          <details className="exam-results__how">
            <summary>{t('Comment ce score est calculé', 'Kijan yo kalkile nòt sa a')}</summary>
            <ul className="exam-results__how-list">
              <li>
                {t(
                  `Le pourcentage est vos points divisés par les points de l’épreuve : ${summary.earnedPoints} ÷ ${summary.totalPoints}.`,
                  `Pousantaj la se pwen ou yo divize pa pwen eprèv la : ${summary.earnedPoints} ÷ ${summary.totalPoints}.`,
                )}
              </li>
              <li>
                {t(
                  'Chaque question vaut ses propres points, et une réponse partiellement juste en reçoit une partie.',
                  'Chak kesyon gen pwen pa l, epi yon repons ki korèk an pati resevwa yon pati nan pwen yo.',
                )}
              </li>
              <li>
                {t(
                  'Le décompte des réponses vient du verdict de chaque question : les cinq chiffres font toujours le nombre de questions.',
                  'Kont repons yo soti nan vèdik chak kesyon : senk chif yo toujou fè kantite kesyon an.',
                )}
              </li>
              {summary.coefficient && summary.coefficient > 1 && (
                <li>
                  {t(
                    'Les points pondérés appliquent le coefficient de la matière dans votre filière. Ils ne changent pas le pourcentage ci-dessus.',
                    'Pwen pondere yo aplike koyefisyan matyè a nan filyè ou. Yo pa chanje pousantaj ki anwo a.',
                  )}
                </li>
              )}
              <li>
                {t(
                  'Cette page ne mesure pas votre maîtrise d’un chapitre : c’est le résultat d’une seule épreuve.',
                  'Paj sa a pa mezire metriz ou nan yon chapit : se rezilta yon sèl eprèv.',
                )}
              </li>
            </ul>
          </details>
        </div>
      </div>

      {/*
        2. WHAT DID I MISS? — where the points went on this paper.
        Titled "points perdus", never "maîtrise": these percentages are one
        sitting of one exam, and nothing here writes the shared mastery doc.
        The section prints its own source line so the numbers are legible to
        the student, not only to whoever reads this file.
      */}
      {showBreakdown && (
        <section className="exam-results__breakdown" aria-labelledby="exam-results-breakdown">
          <h2 id="exam-results-breakdown" className="exam-results__breakdown-title">
            <Target size={18} aria-hidden /> {t('Où vous avez perdu des points', 'Kote ou pèdi pwen')}
          </h2>
          <p className="exam-results__breakdown-source">
            {t(
              'Points obtenus ÷ points possibles, dans cette épreuve uniquement. Le classement va du plus faible au plus solide.',
              'Pwen ou genyen ÷ pwen ki te posib, nan eprèv sa a sèlman. Lis la kòmanse ak sa ki pi fèb.',
            )}
          </p>

          <div className="exam-results__breakdown-lists">
            {showTypeScores && (
              <div className="exam-results__breakdown-col">
                <h3 className="exam-results__breakdown-sub">
                  {t('Par type de question', 'Dapre kalite kesyon')}
                </h3>
                {scoreByType.map((g) => (
                  <GroupScoreBar key={g.key} label={g.key} pct={g.pct} earned={g.earned} total={g.total} count={g.count} review={g.review} />
                ))}
              </div>
            )}
            {showSectionScores && (
              <div className="exam-results__breakdown-col">
                <h3 className="exam-results__breakdown-sub">
                  {t('Par section de l’épreuve', 'Dapre seksyon eprèv la')}
                </h3>
                {scoreBySection.map((g) => (
                  <GroupScoreBar key={g.key} label={g.key} pct={g.pct} earned={g.earned} total={g.total} count={g.count} review={g.review} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/*
        3. WHAT NEXT? — ONE block, ONE primary action.
        This used to be two competing panels (a "next step" card and a "focus
        on your mistakes" card) with four buttons of similar weight, plus two
        more at the bottom of the page. §13: no "equally prominent competing
        calls to action". The block stays in the page body, NOT inside a
        component — it was pasted into GroupScoreBar once and cost 18 type
        errors.
      */}
      <div className="exam-results__next">
        <div className="exam-results__next-head">
          <div className="exam-results__next-copy">
            <h2 className="exam-results__next-title">{t('Et maintenant', 'E kounye a')}&nbsp;?</h2>
            <p className="exam-results__next-sub">
              {nothingLost ? (
                isCreole
                  ? <>Ou pran tout pwen yo nan eprèv sa a. Pran yon lòt eprèv <strong>{subject}</strong> oswa yon lòt matyè pou wè si sa kenbe.</>
                  : <>Vous avez pris tous les points de cette épreuve. Prenez une autre épreuve de <strong>{subject}</strong>, ou une autre matière, pour voir si ça tient.</>
              ) : focusGroup ? (
                isCreole
                  ? <>Se nan <strong>{focusGroup.key}</strong> ou pèdi plis pwen ({focusGroup.earned}/{focusGroup.total}). Kòmanse la : refè {reviewCount} kesyon ou pa fin reyisi yo.</>
                  : <>C’est en <strong>{focusGroup.key}</strong> que vous avez perdu le plus de points ({focusGroup.earned}/{focusGroup.total}). Commencez par là&nbsp;: reprenez les {reviewCount} questions non réussies.</>
              ) : reviewCount > 0 ? (
                isCreole
                  ? <>Gen <strong>{reviewCount} kesyon</strong> ou pa fin reyisi. Refè yo kounye a — se konsa ou pwogrese pi vit.</>
                  : <>Il reste <strong>{reviewCount} question{reviewCount !== 1 ? 's' : ''}</strong> non réussie{reviewCount !== 1 ? 's' : ''}. Reprenez-les maintenant — c’est ce qui fait progresser le plus vite.</>
              ) : offerDueReview ? (
                isCreole
                  ? <>Pa gen anyen pou revize nan eprèv sa a. Men gen <strong>{dueCount} kesyon</strong> ou rate nan egzèsis ou yo k ap tann.</>
                  : <>Rien à revoir sur cette épreuve. En revanche, <strong>{dueCount} question{dueCount !== 1 ? 's' : ''}</strong> ratée{dueCount !== 1 ? 's' : ''} dans vos exercices attend{dueCount !== 1 ? 'ent' : ''} encore.</>
              ) : (
                isCreole
                  ? <>Kontinye antrene nan <strong>{subject}</strong>.</>
                  : <>Continuez à vous entraîner en <strong>{subject}</strong>.</>
              )}
            </p>
            {showsReadiness && (
              <p className="exam-results__next-note">
                {t(
                  'Ce résultat compte dans votre score de préparation au Bac, sur la page Examens.',
                  'Rezilta sa a konte nan nòt preparasyon Bak ou, sou paj Egzamen an.',
                )}
              </p>
            )}
          </div>
        </div>
        <div className="exam-results__next-actions">
          {reviewCount > 0 ? (
            <>
              <button className="xp-btn" onClick={() => setPracticeOpen(true)} type="button">
                <Target size={16} aria-hidden />{' '}
                {isCreole
                  ? `Refè ${reviewCount} kesyon sa yo`
                  : `Reprendre ces ${reviewCount} question${reviewCount !== 1 ? 's' : ''}`}
              </button>
              <button className="xp-btn xp-btn--tonal" onClick={focusOnMistakes} type="button">
                <Eye size={16} aria-hidden /> {t('Voir la correction', 'Wè koreksyon an')}
              </button>
            </>
          ) : offerDueReview ? (
            <>
              {/* Labelled by source: these are exercise mistakes, not exam ones. */}
              <button className="xp-btn" onClick={() => navigate('/revision')} type="button">
                <Target size={16} aria-hidden />{' '}
                {isCreole
                  ? `Revize ${dueCount} erè egzèsis`
                  : `Revoir ${dueCount} erreur${dueCount !== 1 ? 's' : ''} d’exercices`}
              </button>
              <button className="xp-btn xp-btn--tonal" onClick={() => navigate(studyTarget)} type="button">
                {courseCode ? t(`S'entraîner en ${subject}`, `Antrene nan ${subject}`) : t('Réviser cette matière', 'Revize matyè sa a')}
              </button>
            </>
          ) : (
            <button className="xp-btn" onClick={() => navigate(studyTarget)} type="button">
              <Target size={16} aria-hidden />{' '}
              {courseCode ? t(`S'entraîner en ${subject}`, `Antrene nan ${subject}`) : t('Réviser cette matière', 'Revize matyè sa a')}
            </button>
          )}
          {showsReadiness && (
            <button className="xp-btn xp-btn--tonal" onClick={() => navigate(readinessTarget)} type="button">
              <BarChart3 size={16} aria-hidden /> {t('Voir ma préparation au Bac', 'Wè preparasyon Bak mwen')}
            </button>
          )}
        </div>
      </div>

      {!userId && (
        <p className="exam-results__local-note">
          {t(
            'Cette correction est enregistrée sur cet appareil seulement. Connectez-vous pour la retrouver ailleurs.',
            'Koreksyon sa a anrejistre sou aparèy sa a sèlman. Konekte pou jwenn li lòt kote.',
          )}
        </p>
      )}

      {/* Detailed results */}
      <div className="exam-results__details">
        <div className="exam-results__details-head">
          <h2 className="exam-results__details-title">{t('Détails par question', 'Detay dapre kesyon')}</h2>
          <div className="exam-results__filter-chips xp-seg" role="tablist" aria-label={t('Filtrer les questions', 'Filtre kesyon yo')}>
            <button
              type="button"
              role="tab"
              aria-selected={reviewFilter === 'all'}
              className={`exam-results__filter-chip ${reviewFilter === 'all' ? 'exam-results__filter-chip--active' : ''}`}
              onClick={() => setReviewFilter('all')}
            >
              {t('Toutes', 'Tout')} ({results.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={reviewFilter === 'review'}
              className={`exam-results__filter-chip exam-results__filter-chip--review ${reviewFilter === 'review' ? 'exam-results__filter-chip--active' : ''}`}
              onClick={() => setReviewFilter('review')}
              disabled={reviewCount === 0}
            >
              {t('À revoir', 'Pou revize')} ({reviewCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={reviewFilter === 'mastered'}
              className={`exam-results__filter-chip exam-results__filter-chip--mastered ${reviewFilter === 'mastered' ? 'exam-results__filter-chip--active' : ''}`}
              onClick={() => setReviewFilter('mastered')}
              disabled={masteredCount === 0}
            >
              {t('Réussies', 'Reyisi')} ({masteredCount})
            </button>
          </div>
        </div>

        {filteredResults.length === 0 && (
          <div className="card card--message exam-results__filter-empty">
            <p>{t('Aucune question dans cette catégorie.', 'Pa gen kesyon nan kategori sa a.')}</p>
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
                {r.result.maxPoints > 0 && r.status !== 'ungraded' && (
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
                  <strong>{t('Votre réponse :', 'Repons ou :')}</strong>{' '}
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
                  <strong>{t('Réponse correcte :', 'Bon repons :')}</strong>{' '}
                  {r.question.type === 'multiple_choice' && r.question.options
                    ? <span>{(r.question.correct || '').toUpperCase()}) <InstructionRenderer text={r.question.options[r.question.correct] || r.question.correct} inline /></span>
                    : <InstructionRenderer text={String(r.question.correct || r.question.final_answer)} inline />
                  }
                </div>
              )}

              {/* Model answer — show full solution for questions with answer_parts */}
              {!r.question.correct && r.question.model_answer && r.status !== 'scaffold-complete' && r.status !== 'partial' && (
                <details className="exam-results__item-solution">
                  <summary><BookOpen size={14} /> {t('Voir la solution complète', 'Wè solisyon konplè a')}</summary>
                  <div className="exam-results__item-solution-body">
                    <InstructionRenderer text={r.question.model_answer} />
                  </div>
                </details>
              )}

              {/* Multiple approaches for proofs/calculations */}
              {r.question.approaches && r.question.approaches.length > 1 && (
                <details className="exam-results__item-approaches">
                  <summary><RefreshCw size={14} /> {t('Approches alternatives', 'Lòt apwòch')} ({r.question.approaches.length})</summary>
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

              {/* AI grade of a written answer: an estimate, labelled as one */}
              {r.essayFeedback && classifyEssayResponse(r.essayFeedback) !== 'failed' && (
                <EssayFeedbackNote feedback={r.essayFeedback} />
              )}

              {/* Explique-moi: Sandra works through the missed question */}
              {(r.status === 'incorrect' || r.status === 'partial') && (() => {
                const ctx = examQuestionContext({
                  question: r.question,
                  answer: r.userAnswer,
                  status: r.status,
                  subject,
                  level: storedLevel,
                  examId: examKey || undefined,
                });
                return ctx ? <ExplainWithSandra context={ctx} /> : null;
              })()}
            </div>
          );
        })}
      </div>

      {/*
        Foot of the page: the two ways out. Both secondary — the primary action
        for this result is in "Et maintenant ?" above, and the duplicate
        "practise my mistakes" button that used to sit here is gone.
      */}
      <div className="exam-results__actions">
        <button
          className="xp-btn xp-btn--tonal"
          onClick={() => navigate(`/exams/${level}/${examId}/take`, { state: { autostart: true } })}
          type="button"
        >
          <RefreshCw size={16} aria-hidden /> {t('Refaire cet examen', 'Refè egzamen sa a')}
        </button>
        <button className="xp-btn xp-btn--tonal" onClick={() => navigate(`/exams/${level || ''}`)} type="button">
          <PenLine size={16} aria-hidden /> {t('Choisir un autre examen', 'Chwazi yon lòt egzamen')}
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
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

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
            <span className="ka-results__answer-label"><Target size={14} /> {t('Résultat final', 'Rezilta final')}</span>
            {casVerdict && (
              <span className={`ka-results__cas ${casVerdict.correct ? 'ka-results__cas--correct' : 'ka-results__cas--incorrect'}`}>
                {casVerdict.correct ? <><Check size={14} /> {t('Correct', 'Kòrèk')}</> : <><X size={14} /> {t('Incorrect', 'Pa kòrèk')}</>}
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
        {filledSteps.length} {t('étape', 'etap')}{filledSteps.length !== 1 ? t('s', '') : ''} {t('complétée', 'fini')}{filledSteps.length !== 1 ? t('s', '') : ''}
      </div>
    </div>
  );
}

/** The AI grade of a written answer, labelled as an estimate (never an official mark). */
function EssayFeedbackNote({ feedback }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);
  const strengths = Array.isArray(feedback?.strengths) ? feedback.strengths : [];
  const improvements = Array.isArray(feedback?.improvements) ? feedback.improvements : [];
  return (
    <div className="exam-results__essay">
      <p className="exam-results__essay-score">
        <strong>{t('Note IA (indicative) :', 'Nòt IA (endikatif) :')}</strong> {feedback.score}
      </p>
      {feedback.feedback && <p className="exam-results__essay-text">{feedback.feedback}</p>}
      {strengths.length > 0 && (
        <div className="exam-results__essay-list">
          <strong>{t('Points forts', 'Pwen fò')}</strong>
          <ul>{strengths.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
      {improvements.length > 0 && (
        <div className="exam-results__essay-list">
          <strong>{t('Pour progresser', 'Pou pwogrese')}</strong>
          <ul>{improvements.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);
  const map = {
    correct:            { label: <><Check size={12} /> {t('Correct', 'Kòrèk')}</>, cls: 'exam-results__badge--correct' },
    incorrect:          { label: <><X size={12} /> {t('Incorrect', 'Pa kòrèk')}</>, cls: 'exam-results__badge--incorrect' },
    partial:            { label: t('◐ Partiel', '◐ Pasyèl'), cls: 'exam-results__badge--partial' },
    manual:             { label: <><Eye size={12} /> {t('Révision', 'Revizyon')}</>, cls: 'exam-results__badge--manual' },
    ungraded:           { label: <><Eye size={12} /> {t('Pas encore corrigée', 'Poko korije')}</>, cls: 'exam-results__badge--manual' },
    unanswered:         { label: t('— Vide', '— Vid'), cls: 'exam-results__badge--unanswered' },
    'scaffold-complete': { label: <><PenLine size={12} /> {t('Complété', 'Fini')}</>, cls: 'exam-results__badge--correct' },
  };
  const m = map[status] || map.unanswered;
  return <span className={`exam-results__badge ${m.cls}`}>{m.label}</span>;
}

export default ExamResults;
