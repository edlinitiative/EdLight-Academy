/**
 * StudyPlan Page
 * ──────────────
 * Full-screen study plan UI with:
 *   • Auto-generation on first visit (if track is set & no plan exists)
 *   • Today's tasks list with SRS due dates
 *   • Subject mastery radar / bar chart
 *   • Upcoming week preview
 *   • Plan tips from AI
 *   • Progress overview (mastered / total)
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Lock, GraduationCap, ClipboardList, Sparkles, CalendarDays, CalendarRange,
  Timer, Trophy, Lightbulb, Target, CheckCircle2, BarChart3, RefreshCw, Trash2,
  FileText, Pencil, Video, Clock, Hash, ChevronRight,
} from 'lucide-react';
import useStore from '../contexts/store';
import { useStudyPlan, useExamResultsForPlan } from '../hooks/useStudyPlan';
import { useAppData } from '../hooks/useData';
import { TRACK_COEFFICIENTS, TRACK_BY_CODE } from '../config/trackConfig';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { normalizeSubject, subjectColor } from '../utils/examUtils';
import { auth } from '../services/firebase';

// ─── Local exam catalog hook (same pattern as ExamBrowser) ──────────────────

function useExamCatalog() {
  return useQuery({
    queryKey: ['exam-catalog'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog.json');
      if (!res.ok) throw new Error('Failed to load exam catalog');
      const data = await res.json();
      return normalizeExamCatalog(data);
    },
    staleTime: Infinity,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

function difficultyLabel(d) {
  const labels = { 1: 'Très facile', 2: 'Facile', 3: 'Moyen', 4: 'Difficile', 5: 'Très difficile' };
  return labels[d] || 'Moyen';
}

function difficultyColor(d) {
  const colors = { 1: '#10b981', 2: '#34d399', 3: '#f59e0b', 4: '#f97316', 5: '#ef4444' };
  return colors[d] || '#f59e0b';
}

const URL_LEVEL_MAP = {
  baccalaureat: 'terminale',
  '9eme_af': '9e',
  universite: 'university',
};

// ═══════════════════════════════════════════════════════════════════════════════

export default function StudyPlan() {
  const navigate = useNavigate();
  const { user, track, isAuthenticated, language } = useStore();
  const isCreole = language === 'ht';

  const {
    plan,
    isLoading: planLoading,
    hasPlan,
    todayTasks,
    upcomingTasks,
    mastery,
    totalTasks,
    masteredCount,
    progressPct,
    generatePlan,
    isGenerating,
    archivePlan,
    deletePlan,
  } = useStudyPlan();

  const { data: allExams, isLoading: examsLoading } = useExamCatalog();
  const { data: existingResults = {}, isLoading: resultsLoading } = useExamResultsForPlan();
  const { data: appData, isLoading: appDataLoading } = useAppData();

  const quizBankIndex = appData?.quizBank || null;
  const courses = appData?.courses || [];

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const trackInfo = TRACK_BY_CODE[track] || null;
  const coefficients = TRACK_COEFFICIENTS[track] || {};

  // ── Filter exams for the user's track ─────────────────────────────
  const trackExams = useMemo(() => {
    if (!allExams || !track) return [];
    return allExams.filter((e) => {
      const subj = normalizeSubject(e.subject);
      return coefficients[subj] !== undefined;
    });
  }, [allExams, track, coefficients]);

  // ── Auto-generate on first visit ──────────────────────────────────
  const shouldAutoGenerate =
    isAuthenticated && track && !hasPlan && !planLoading && !generating && !examsLoading && trackExams.length > 0;

  useEffect(() => {
    if (shouldAutoGenerate) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoGenerate]);

  // ── Generate plan handler ─────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!track || !trackExams.length) return;
    setGenerating(true);
    setGenError('');

    try {
      // Try AI-assisted plan generation
      let aiPlan = null;
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          const resp = await fetch('/api/generate-plan', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              track,
              subjects: Object.keys(coefficients),
              performance: buildPerformanceSummary(existingResults, allExams),
              examCount: Math.min(trackExams.length, 40),
              preferences: { dailyMinutes: 90, weeks: 8 },
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            aiPlan = data.plan;
          }
        }
      } catch {
        // AI generation failed — proceed with local-only plan
        console.warn('AI plan generation unavailable, using local algorithm');
      }

      // Select a manageable subset of exams (up to 40), prioritising
      // high-coefficient subjects and varying difficulties
      const selected = selectExamsForPlan(trackExams, coefficients, 40);

      await generatePlan({
        exams: selected,
        coefficients,
        existingResults,
        aiPlan,
        quizBankIndex,
        courses,
      });
    } catch (err) {
      console.error('Plan generation failed:', err);
      setGenError('Erreur lors de la génération du plan. Réessayez.');
    } finally {
      setGenerating(false);
    }
  }, [track, trackExams, coefficients, existingResults, allExams, generatePlan, quizBankIndex, courses]);

  // ── Not authenticated ─────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="study-plan-page">
        <div className="study-plan-empty">
          <span className="study-plan-empty__icon"><Lock size={40} /></span>
          <h2>{isCreole ? 'Konekte pou wè plan ou' : 'Connectez-vous pour voir votre plan'}</h2>
          <p>
            {isCreole
              ? 'Ou bezwen konekte pou kreye yon plan etid pèsonalize.'
              : 'Vous devez être connecté pour créer un plan d\'étude personnalisé.'}
          </p>
        </div>
      </div>
    );
  }

  // ── No track selected ────────────────────────────────────────────
  if (!track) {
    return (
      <div className="study-plan-page">
        <div className="study-plan-empty">
          <span className="study-plan-empty__icon"><GraduationCap size={40} /></span>
          <h2>{isCreole ? 'Chwazi filiyè ou anvan' : 'Choisissez votre filière d\'abord'}</h2>
          <p>
            {isCreole
              ? 'Ale nan paj egzamen Terminale pou chwazi filiyè ou.'
              : 'Rendez-vous sur la page des examens Terminale pour choisir votre filière.'}
          </p>
          <button
            className="btn btn--primary"
            onClick={() => navigate('/exams/terminale')}
          >
            {isCreole ? 'Ale nan Egzamen' : 'Aller aux Examens'}
          </button>
        </div>
      </div>
    );
  }

  // ── Loading states ────────────────────────────────────────────────
  if (planLoading || examsLoading || resultsLoading || appDataLoading) {
    return (
      <div className="study-plan-page">
        <div className="study-plan-loading">
          <div className="spinner" />
          <p>{isCreole ? 'Chajman...' : 'Chargement du plan d\'étude...'}</p>
        </div>
      </div>
    );
  }

  // ── Generating state ──────────────────────────────────────────────
  if (generating || isGenerating) {
    return (
      <div className="study-plan-page">
        <div className="study-plan-loading">
          <div className="spinner" />
          <h2 className="study-plan-loading__title"><Sparkles size={20} /> {isCreole ? 'Kreye plan etid ou...' : 'Création de votre plan d\'étude...'}</h2>
          <p>{isCreole ? 'Sa ap pran kèk segonn.' : 'Cela prendra quelques secondes.'}</p>
        </div>
      </div>
    );
  }

  // ── No plan yet (auto-gen didn't trigger) ─────────────────────────
  if (!hasPlan) {
    return (
      <div className="study-plan-page">
        <div className="study-plan-empty">
          <span className="study-plan-empty__icon"><ClipboardList size={40} /></span>
          <h2>{isCreole ? 'Pa gen plan etid ankò' : 'Pas encore de plan d\'étude'}</h2>
          <p>
            {isCreole
              ? 'Kreye yon plan pèsonalize baze sou filiyè ou ak pèfòmans ou.'
              : 'Créez un plan personnalisé basé sur votre filière et vos performances.'}
          </p>
          {genError && <p className="study-plan-error">{genError}</p>}
          <button className="btn btn--primary" onClick={handleGenerate}>
            {isCreole ? 'Kreye Plan' : 'Créer mon Plan'}
          </button>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // Main plan view
  // ═════════════════════════════════════════════════════════════════════

  return (
    <div className="study-plan-page">
      {/* Header */}
      <header className="study-plan-header">
        <div className="study-plan-header__top">
          <div>
            <h1 className="study-plan-header__title">
              {plan.title || (isCreole ? 'Plan Etid' : 'Plan d\'Étude')}
            </h1>
            {plan.description && (
              <p className="study-plan-header__desc">{plan.description}</p>
            )}
          </div>
          {trackInfo && (
            <span
              className="study-plan-header__badge"
              style={{ backgroundColor: trackInfo.color }}
            >
              {trackInfo.shortLabel}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="study-plan-progress">
          <div className="study-plan-progress__bar">
            <div
              className="study-plan-progress__fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="study-plan-progress__text">
            {masteredCount}/{totalTasks}{' '}
            {isCreole ? 'metrize' : 'maîtrisés'} ({progressPct}%)
          </span>
        </div>
      </header>

      {/* Stats cards */}
      <div className="study-plan-stats">
        <div className="study-plan-stat-card">
          <span className="study-plan-stat-card__icon"><CalendarDays size={22} /></span>
          <span className="study-plan-stat-card__value">{todayTasks.length}</span>
          <span className="study-plan-stat-card__label">
            {isCreole ? 'Jodi a' : 'Aujourd\'hui'}
          </span>
        </div>
        <div className="study-plan-stat-card">
          <span className="study-plan-stat-card__icon"><CalendarRange size={22} /></span>
          <span className="study-plan-stat-card__value">{upcomingTasks.length}</span>
          <span className="study-plan-stat-card__label">
            {isCreole ? '7 jou kap vini' : '7 prochains jours'}
          </span>
        </div>
        <div className="study-plan-stat-card">
          <span className="study-plan-stat-card__icon"><Timer size={22} /></span>
          <span className="study-plan-stat-card__value">
            {plan.dailyTargetMinutes || 90}
          </span>
          <span className="study-plan-stat-card__label">
            {isCreole ? 'min/jou' : 'min/jour'}
          </span>
        </div>
        <div className="study-plan-stat-card">
          <span className="study-plan-stat-card__icon"><Trophy size={22} /></span>
          <span className="study-plan-stat-card__value">{masteredCount}</span>
          <span className="study-plan-stat-card__label">
            {isCreole ? 'Metrize' : 'Maîtrisés'}
          </span>
        </div>
      </div>

      {/* Tips */}
      {plan.tips?.length > 0 && (
        <section className="study-plan-tips">
          <h3><Lightbulb size={18} className="inline-icon" /> {isCreole ? 'Konsèy' : 'Conseils'}</h3>
          <ul>
            {plan.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Today's Tasks */}
      <section className="study-plan-section">
        <h2>
          <Target size={20} className="inline-icon" /> {isCreole ? 'Travay jodi a' : 'Travail du jour'}
          {todayTasks.length > 0 && (
            <span className="study-plan-section__count">{todayTasks.length}</span>
          )}
        </h2>
        {todayTasks.length === 0 ? (
          <div className="study-plan-empty-section">
            <p>
              <CheckCircle2 size={16} className="inline-icon" /> {isCreole
                ? 'Ou ajou! Pa gen anyen pou jodi a.'
                : 'Vous êtes à jour ! Rien de prévu pour aujourd\'hui.'}
            </p>
          </div>
        ) : (
          <div className="study-plan-task-list">
            {todayTasks.map((task) => (
              <TaskCard
                key={task.examId || task.taskId}
                task={task}
                isCreole={isCreole}
                onNavigate={() => navigateToTask(task, navigate)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming */}
      {upcomingTasks.length > 0 && (
        <section className="study-plan-section">
          <h2>
            <CalendarRange size={20} className="inline-icon" /> {isCreole ? 'Semèn kap vini an' : 'Semaine à venir'}
            <span className="study-plan-section__count">{upcomingTasks.length}</span>
          </h2>
          <div className="study-plan-task-list study-plan-task-list--compact">
            {upcomingTasks.slice(0, 10).map((task) => (
              <TaskCard
                key={task.examId || task.taskId}
                task={task}
                isCreole={isCreole}
                compact
                onNavigate={() => navigateToTask(task, navigate)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Subject Mastery */}
      {Object.keys(mastery).length > 0 && (
        <section className="study-plan-section">
          <h2><BarChart3 size={20} className="inline-icon" /> {isCreole ? 'Metrize pa Matyè' : 'Maîtrise par Matière'}</h2>
          <div className="study-plan-mastery-grid">
            {Object.entries(mastery)
              .sort((a, b) => (coefficients[b[0]] || 1) - (coefficients[a[0]] || 1))
              .map(([subject, data]) => (
                <MasteryBar
                  key={subject}
                  subject={subject}
                  data={data}
                  coefficient={coefficients[subject] || 1}
                />
              ))}
          </div>
        </section>
      )}

      {/* Actions */}
      <section className="study-plan-actions">
        <button className="btn btn--outline" onClick={handleGenerate}>
          <RefreshCw size={16} className="inline-icon" /> {isCreole ? 'Rejenere Plan' : 'Régénérer le Plan'}
        </button>
        <button
          className="btn btn--outline btn--danger"
          onClick={() => setShowConfirmDelete(true)}
        >
          <Trash2 size={16} className="inline-icon" /> {isCreole ? 'Siprime Plan' : 'Supprimer le Plan'}
        </button>
      </section>

      {/* Delete confirmation */}
      {showConfirmDelete && (
        <div className="study-plan-modal-overlay" onClick={() => setShowConfirmDelete(false)}>
          <div className="study-plan-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{isCreole ? 'Siprime plan sa a?' : 'Supprimer ce plan ?'}</h3>
            <p>
              {isCreole
                ? 'Aksyon sa a pa ka defèt.'
                : 'Cette action est irréversible.'}
            </p>
            <div className="study-plan-modal__actions">
              <button
                className="btn btn--outline"
                onClick={() => setShowConfirmDelete(false)}
              >
                {isCreole ? 'Anile' : 'Annuler'}
              </button>
              <button
                className="btn btn--danger"
                onClick={async () => {
                  await deletePlan();
                  setShowConfirmDelete(false);
                }}
              >
                {isCreole ? 'Siprime' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Route to the correct page based on task type */
function navigateToTask(task, navigate) {
  const type = task.type || 'exam';
  if (type === 'practice') {
    // Navigate to quiz practice page with subject code pre-filled
    const code = task.subjectCode || '';
    const unitId = task.unitId || '';
    const params = new URLSearchParams();
    if (code) params.set('course', code);
    if (unitId) params.set('unit', unitId);
    navigate(`/quizzes?${params.toString()}`);
  } else if (type === 'video') {
    // Navigate to course detail or open video directly
    const courseCode = task.courseCode || '';
    if (courseCode) {
      navigate(`/courses/${courseCode}`);
    } else if (task.videoUrl) {
      window.open(task.videoUrl, '_blank', 'noopener');
    }
  } else {
    // Default: exam
    const urlLevel = URL_LEVEL_MAP[task.level] || 'terminale';
    navigate(`/exams/${urlLevel}/${task.examId}`);
  }
}

/** Icon components per task type */
const TASK_TYPE_META = {
  exam:     { Icon: FileText, label: 'Examen',   labelHt: 'Egzamen', color: '#ef4444' },
  practice: { Icon: Pencil,   label: 'Exercice', labelHt: 'Egzèsis', color: '#3b82f6' },
  video:    { Icon: Video,    label: 'Vidéo',    labelHt: 'Videyo',  color: '#8b5cf6' },
};

function TaskCard({ task, isCreole, compact, onNavigate }) {
  const overdue = task.nextReviewMs && task.nextReviewMs < Date.now();
  const lastScore =
    task.history?.length > 0 ? task.history[task.history.length - 1].scorePct : null;
  const taskType = task.type || 'exam';
  const meta = TASK_TYPE_META[taskType] || TASK_TYPE_META.exam;
  const TypeIcon = meta.Icon;

  // Build display title based on task type
  let displayTitle;
  if (taskType === 'practice') {
    displayTitle = task.unitTitle
      ? `${task.unitTitle} (${task.questionCount || '?'} questions)`
      : `${task.subjectCode || task.subject} — ${task.questionCount || '?'} questions`;
  } else if (taskType === 'video') {
    displayTitle = task.videoTitle || task.courseTitle || 'Vidéo';
  } else {
    displayTitle = task.examTitle || task.examId;
  }

  return (
    <div
      className={`study-plan-task ${compact ? 'study-plan-task--compact' : ''} ${overdue ? 'study-plan-task--overdue' : ''}`}
      onClick={onNavigate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate()}
    >
      <div className="study-plan-task__left">
        <div className="study-plan-task__type-row">
          <span
            className="study-plan-task__type-badge"
            style={{ backgroundColor: meta.color + '14', color: meta.color, borderColor: meta.color + '30' }}
          >
            <TypeIcon size={13} /> {isCreole ? meta.labelHt : meta.label}
          </span>
          <span
            className="study-plan-task__subject"
            style={{ color: subjectColor(task.subject) }}
          >
            {task.subject}
          </span>
        </div>
        <span className="study-plan-task__title">
          {displayTitle}
        </span>
        {task.aiFocusArea && (
          <span className="study-plan-task__focus">{task.aiFocusArea}</span>
        )}
      </div>
      <div className="study-plan-task__right">
        {taskType === 'exam' && (
          <span
            className="study-plan-task__difficulty"
            style={{ color: difficultyColor(task.difficulty) }}
            title={difficultyLabel(task.difficulty)}
          >
            {'★'.repeat(task.difficulty)}{'☆'.repeat(5 - task.difficulty)}
          </span>
        )}
        {taskType === 'video' && task.duration && (
          <span className="study-plan-task__duration">
            <Clock size={13} className="inline-icon" /> {task.duration} min
          </span>
        )}
        {taskType === 'practice' && task.questionCount && (
          <span className="study-plan-task__qcount">
            <Hash size={13} className="inline-icon" /> {task.questionCount}
          </span>
        )}
        {lastScore !== null && (
          <span className="study-plan-task__score">
            {lastScore}%
          </span>
        )}
        <span className="study-plan-task__date">
          {overdue
            ? (isCreole ? 'Anreta!' : 'En retard !')
            : formatDate(task.nextReviewMs)}
        </span>
        <ChevronRight size={16} className="study-plan-task__chevron" />
      </div>
    </div>
  );
}

function MasteryBar({ subject, data, coefficient }) {
  return (
    <div className="study-plan-mastery">
      <div className="study-plan-mastery__header">
        <span
          className="study-plan-mastery__subject"
          style={{ color: subjectColor(subject) }}
        >
          {subject}
        </span>
        <span className="study-plan-mastery__coeff" title="Coefficient Bac">
          ×{coefficient}
        </span>
      </div>
      <div className="study-plan-mastery__bar-wrap">
        <div
          className="study-plan-mastery__bar"
          style={{ width: `${data.masteredPct || 0}%` }}
        />
      </div>
      <div className="study-plan-mastery__stats">
        <span>
          {data.mastered}/{data.total} maîtrisés
        </span>
        {data.attempts > 0 && <span>·  Moy. {data.pct}%</span>}
      </div>
    </div>
  );
}

// ─── Exam selection for plan generation ─────────────────────────────────────

/**
 * Select a balanced subset of exams for the plan, weighted by coefficient.
 */
function selectExamsForPlan(exams, coefficients, maxCount = 40) {
  // Group by subject
  const bySubject = {};
  for (const e of exams) {
    const s = normalizeSubject(e.subject);
    if (!bySubject[s]) bySubject[s] = [];
    bySubject[s].push(e);
  }

  // Allocate slots proportional to coefficient
  const totalCoeff = Object.values(coefficients).reduce((s, v) => s + v, 0) || 1;
  const selected = [];

  for (const [subj, pool] of Object.entries(bySubject)) {
    const coeff = coefficients[subj] || 1;
    const slots = Math.max(1, Math.round((coeff / totalCoeff) * maxCount));

    // Sort pool: mix difficulties (1,3,5,2,4 pattern for variety)
    const sorted = [...pool].sort((a, b) => {
      const da = a.difficulty || 3;
      const db = b.difficulty || 3;
      // Zigzag: easy-medium-hard interleaved
      return da - db;
    });

    selected.push(...sorted.slice(0, slots));
  }

  // If over budget, trim lowest-priority items
  if (selected.length > maxCount) {
    selected.sort(
      (a, b) =>
        (coefficients[normalizeSubject(b.subject)] || 1) -
        (coefficients[normalizeSubject(a.subject)] || 1),
    );
    return selected.slice(0, maxCount);
  }

  return selected;
}

/**
 * Build a performance summary from exam results for AI prompt.
 */
function buildPerformanceSummary(results, exams) {
  if (!results || !exams) return {};

  const bySubject = {};
  for (const [examId, result] of Object.entries(results)) {
    const exam = exams.find((e) => (e.exam_id || e.id) === examId);
    if (!exam) continue;
    const subj = normalizeSubject(exam.subject);
    if (!bySubject[subj]) bySubject[subj] = { scores: [], attempts: 0 };
    bySubject[subj].scores.push(result.scorePct || 0);
    bySubject[subj].attempts += 1;
  }

  const summary = {};
  for (const [subj, data] of Object.entries(bySubject)) {
    const avg = data.scores.reduce((s, v) => s + v, 0) / data.scores.length;
    summary[subj] = { avgScore: Math.round(avg), attempts: data.attempts };
  }
  return summary;
}
