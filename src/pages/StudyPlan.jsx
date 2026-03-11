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
  Timer, Lightbulb, Target, CheckCircle2, BarChart3, RefreshCw, Trash2,
  FileText, Pencil, Video, ChevronRight, ChevronDown, Flame, Play,
} from 'lucide-react';
import useStore from '../contexts/store';
import { useStudyPlan, useExamResultsForPlan } from '../hooks/useStudyPlan';
import { useAppData } from '../hooks/useData';
import { useStreak } from '../hooks/useStreak';
import { StreakWidget } from '../components/Streak';
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

function formatDate(ms, isCreole) {
  if (!ms) return '—';
  const d = new Date(ms);
  if (isCreole) {
    const months = ['jan','fev','mas','avr','me','jen','jiy','out','sep','okt','nov','des'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function difficultyLabel(d, isCreole) {
  if (isCreole) {
    const labels = { 1: 'Trè fasil', 2: 'Fasil', 3: 'Mwayen', 4: 'Difisil', 5: 'Trè difisil' };
    return labels[d] || 'Mwayen';
  }
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
  const { recordActivity: recordStreakActivity } = useStreak();

  const quizBankIndex = appData?.quizBank || null;
  const courses = appData?.courses || [];

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState('today');
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showAllMastery, setShowAllMastery] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  // Record streak when viewing the study plan (user is actively studying)
  useEffect(() => {
    if (isAuthenticated && hasPlan) {
      recordStreakActivity();
    }
  }, [isAuthenticated, hasPlan, recordStreakActivity]);

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
      <div className="sp">
        <div className="sp-empty">
          <span className="sp-empty__icon"><Lock size={40} /></span>
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
      <div className="sp">
        <div className="sp-empty">
          <span className="sp-empty__icon"><GraduationCap size={40} /></span>
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
      <div className="sp">
        <div className="sp-loading">
          <div className="spinner" />
          <p>{isCreole ? 'Chajman...' : 'Chargement du plan d\'étude...'}</p>
        </div>
      </div>
    );
  }

  // ── Generating state ──────────────────────────────────────────────
  if (generating || isGenerating) {
    return (
      <div className="sp">
        <div className="sp-loading">
          <div className="spinner" />
          <h2 className="sp-loading__title"><Sparkles size={20} /> {isCreole ? 'Kreye plan etid ou...' : 'Création de votre plan d\'étude...'}</h2>
          <p>{isCreole ? 'Sa ap pran kèk segonn.' : 'Cela prendra quelques secondes.'}</p>
        </div>
      </div>
    );
  }

  // ── No plan yet (auto-gen didn't trigger) ─────────────────────────
  if (!hasPlan) {
    return (
      <div className="sp">
        <div className="sp-empty">
          <span className="sp-empty__icon"><ClipboardList size={40} /></span>
          <h2>{isCreole ? 'Pa gen plan etid ankò' : 'Pas encore de plan d\'étude'}</h2>
          <p>
            {isCreole
              ? 'Kreye yon plan pèsonalize baze sou filiyè ou ak pèfòmans ou.'
              : 'Créez un plan personnalisé basé sur votre filière et vos performances.'}
          </p>
          {genError && <p className="sp-error">{genError}</p>}
          <button className="btn btn--primary" onClick={handleGenerate}>
            {isCreole ? 'Kreye Plan' : 'Créer mon Plan'}
          </button>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // Main plan view — dashboard layout
  // ═════════════════════════════════════════════════════════════════════

  // Pick the most urgent task for the hero card
  const heroTask = todayTasks[0] || null;
  const remainingToday = todayTasks.slice(1);

  const TASK_CAP = 4;
  const MASTERY_CAP = 3;

  const tabTasks = activeTab === 'today' ? remainingToday : upcomingTasks;
  const visibleTasks = showAllTasks ? tabTasks : tabTasks.slice(0, TASK_CAP);
  const hasMoreTasks = tabTasks.length > TASK_CAP;

  const masteryEntries = Object.entries(mastery)
    .sort((a, b) => (a[1].masteredPct || 0) - (b[1].masteredPct || 0));
  const visibleMastery = showAllMastery ? masteryEntries : masteryEntries.slice(0, MASTERY_CAP);

  return (
    <div className="sp">
      {/* ── Top bar ────────────────────────────────────────── */}
      <header className="sp-topbar">
        <div className="sp-topbar__left">
          <h1 className="sp-topbar__title">
            {plan.title || (isCreole ? 'Plan Etid' : 'Plan d\'Étude')}
          </h1>
          {trackInfo && (
            <span className="sp-topbar__badge" style={{ backgroundColor: trackInfo.color }}>
              {trackInfo.shortLabel}
            </span>
          )}
        </div>
        <div className="sp-topbar__actions">
          <button className="sp-btn sp-btn--ghost" onClick={handleGenerate} title={isCreole ? 'Rejenere' : 'Régénérer'}>
            <RefreshCw size={16} />
          </button>
          <button className="sp-btn sp-btn--ghost sp-btn--danger" onClick={() => setShowConfirmDelete(true)} title={isCreole ? 'Siprime' : 'Supprimer'}>
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* ── Dashboard grid ─────────────────────────────────── */}
      <div className="sp-dashboard">

        {/* ──── MAIN COLUMN ────────────────────────────────── */}
        <main className="sp-main">

          {/* Hero: Next task */}
          {heroTask ? (
            <div
              className="sp-hero"
              onClick={() => navigateToTask(heroTask, navigate)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigateToTask(heroTask, navigate)}
            >
              <div className="sp-hero__content">
                <span className="sp-hero__eyebrow">
                  <Flame size={14} /> {isCreole ? 'Pwochen travay' : 'Prochaine tâche'}
                </span>
                <h2 className="sp-hero__title">
                  {heroTask.examTitle || heroTask.unitTitle || heroTask.videoTitle || heroTask.examId}
                </h2>
                <div className="sp-hero__meta">
                  <HeroTypeBadge task={heroTask} isCreole={isCreole} />
                  <span style={{ color: subjectColor(heroTask.subject) }} className="sp-hero__subject">
                    {heroTask.subject}
                  </span>
                  {heroTask.aiFocusArea && (
                    <span className="sp-hero__focus">{heroTask.aiFocusArea}</span>
                  )}
                </div>
              </div>
              <button className="sp-hero__go">
                <Play size={20} />
              </button>
            </div>
          ) : (
            <div className="sp-hero sp-hero--done">
              <CheckCircle2 size={20} />
              <span className="sp-hero__done-text">
                {isCreole ? 'Ou ajou — pa gen anyen pou jodi a!' : 'Vous êtes à jour — rien de prévu aujourd\'hui !'}
              </span>
            </div>
          )}

          {/* ── Tabbed task section ────────────────────────── */}
          <section className="sp-section">
            <div className="sp-tabs">
              <button
                className={`sp-tabs__btn ${activeTab === 'today' ? 'sp-tabs__btn--active' : ''}`}
                onClick={() => { setActiveTab('today'); setShowAllTasks(false); }}
              >
                <Target size={15} />
                {isCreole ? 'Jodi a' : 'Aujourd\'hui'}
                <span className="sp-pill sp-pill--sm">{todayTasks.length}</span>
              </button>
              <button
                className={`sp-tabs__btn ${activeTab === 'week' ? 'sp-tabs__btn--active' : ''}`}
                onClick={() => { setActiveTab('week'); setShowAllTasks(false); }}
              >
                <CalendarRange size={15} />
                {isCreole ? 'Semèn' : 'Semaine'}
                <span className="sp-pill sp-pill--sm">{upcomingTasks.length}</span>
              </button>
            </div>

            {visibleTasks.length > 0 ? (
              <div className="sp-task-grid">
                {visibleTasks.map((task) => (
                  <TaskCard
                    key={task.examId || task.taskId}
                    task={task}
                    isCreole={isCreole}
                    compact={activeTab === 'week'}
                    onNavigate={() => navigateToTask(task, navigate)}
                  />
                ))}
              </div>
            ) : (
              <p className="sp-section__empty">
                {activeTab === 'today'
                  ? (isCreole ? 'Pa gen lòt travay jodi a.' : 'Aucune autre tâche aujourd\'hui.')
                  : (isCreole ? 'Pa gen travay pou semèn kap vini an.' : 'Aucune tâche cette semaine.')}
              </p>
            )}

            {hasMoreTasks && !showAllTasks && (
              <button className="sp-show-more" onClick={() => setShowAllTasks(true)}>
                <ChevronDown size={14} />
                {isCreole
                  ? `Wè ${tabTasks.length - TASK_CAP} anplis`
                  : `Voir ${tabTasks.length - TASK_CAP} de plus`}
              </button>
            )}
          </section>
        </main>

        {/* ──── SIDEBAR ────────────────────────────────────── */}
        <aside className="sp-sidebar">

          {/* Progress ring — always visible */}
          <div className="sp-progress-card">
            <ProgressRing pct={progressPct} />
            <div className="sp-progress-card__text">
              <span className="sp-progress-card__big">{progressPct}%</span>
              <span className="sp-progress-card__label">
                {masteredCount}/{totalTasks} {isCreole ? 'metrize' : 'maîtrisés'}
              </span>
            </div>
          </div>

          {/* Quick stats — always visible */}
          <div className="sp-quick-stats">
            <div className="sp-qstat">
              <CalendarDays size={16} />
              <span className="sp-qstat__val">{todayTasks.length}</span>
              <span className="sp-qstat__label">{isCreole ? 'jodi a' : 'aujourd\'hui'}</span>
            </div>
            <div className="sp-qstat">
              <CalendarRange size={16} />
              <span className="sp-qstat__val">{upcomingTasks.length}</span>
              <span className="sp-qstat__label">{isCreole ? '7 jou' : '7 jours'}</span>
            </div>
            <div className="sp-qstat">
              <Timer size={16} />
              <span className="sp-qstat__val">{plan.dailyTargetMinutes || 90}</span>
              <span className="sp-qstat__label">min/{isCreole ? 'jou' : 'jour'}</span>
            </div>
          </div>

          {/* Streak widget */}
          <StreakWidget isCreole={isCreole} />

          {/* Collapsible on mobile: mastery + tips */}
          <div className="sp-sidebar__details">
            <button className="sp-sidebar__toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <BarChart3 size={15} />
              {isCreole ? 'Detay & Metrize' : 'Détails & Maîtrise'}
              <ChevronDown size={14} className={`sp-sidebar__chevron ${sidebarOpen ? 'sp-sidebar__chevron--open' : ''}`} />
            </button>

            <div className={`sp-sidebar__collapsible ${sidebarOpen ? 'sp-sidebar__collapsible--open' : ''}`}>
              {/* Subject mastery — capped at 3 weakest */}
              {masteryEntries.length > 0 && (
                <div className="sp-card">
                  <h4 className="sp-card__title">
                    <BarChart3 size={16} /> {isCreole ? 'Metrize' : 'Maîtrise'}
                  </h4>
                  <div className="sp-mastery-list">
                    {visibleMastery.map(([subject, data]) => (
                      <MasteryRow
                        key={subject}
                        subject={subject}
                        data={data}
                        coefficient={coefficients[subject] || 1}
                      />
                    ))}
                  </div>
                  {masteryEntries.length > MASTERY_CAP && !showAllMastery && (
                    <button className="sp-show-more sp-show-more--sm" onClick={() => setShowAllMastery(true)}>
                      <ChevronDown size={12} />
                      {isCreole
                        ? `${masteryEntries.length - MASTERY_CAP} anplis`
                        : `${masteryEntries.length - MASTERY_CAP} de plus`}
                    </button>
                  )}
                </div>
              )}

              {/* Tips — capped at 3 */}
              {plan.tips?.length > 0 && (
                <div className="sp-card sp-card--tips">
                  <h4 className="sp-card__title">
                    <Lightbulb size={16} /> {isCreole ? 'Konsèy' : 'Conseils'}
                  </h4>
                  <ul className="sp-tips-list">
                    {plan.tips.slice(0, 3).map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Delete confirmation */}
      {showConfirmDelete && (
        <div className="sp-overlay" onClick={() => setShowConfirmDelete(false)}>
          <div className="sp-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{isCreole ? 'Siprime plan sa a?' : 'Supprimer ce plan ?'}</h3>
            <p>{isCreole ? 'Aksyon sa a pa ka defèt.' : 'Cette action est irréversible.'}</p>
            <div className="sp-modal__actions">
              <button className="btn btn--outline" onClick={() => setShowConfirmDelete(false)}>
                {isCreole ? 'Anile' : 'Annuler'}
              </button>
              <button className="btn btn--danger" onClick={async () => { await deletePlan(); setShowConfirmDelete(false); }}>
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

/** SVG progress ring */
function ProgressRing({ pct, size = 80, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (circ * Math.min(pct, 100)) / 100;
  return (
    <svg width={size} height={size} className="sp-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--border)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--primary-500)" strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
    </svg>
  );
}

/** Type badge shown on the hero card */
function HeroTypeBadge({ task, isCreole }) {
  const taskType = task.type || 'exam';
  const meta = TASK_TYPE_META[taskType] || TASK_TYPE_META.exam;
  const TypeIcon = meta.Icon;
  return (
    <span className="sp-hero__badge" style={{ backgroundColor: meta.color + '14', color: meta.color, borderColor: meta.color + '30' }}>
      <TypeIcon size={13} /> {isCreole ? meta.labelHt : meta.label}
    </span>
  );
}

function TaskCard({ task, isCreole, compact, onNavigate }) {
  const overdue = task.nextReviewMs && task.nextReviewMs < Date.now();
  const lastScore =
    task.history?.length > 0 ? task.history[task.history.length - 1].scorePct : null;
  const taskType = task.type || 'exam';
  const meta = TASK_TYPE_META[taskType] || TASK_TYPE_META.exam;
  const TypeIcon = meta.Icon;

  let displayTitle;
  if (taskType === 'practice') {
    displayTitle = task.unitTitle || `${task.subjectCode || task.subject}`;
  } else if (taskType === 'video') {
    displayTitle = task.videoTitle || task.courseTitle || (isCreole ? 'Videyo' : 'Vidéo');
  } else {
    displayTitle = task.examTitle || task.examId;
  }

  // Secondary info line
  let secondaryInfo = '';
  if (taskType === 'practice' && task.questionCount) secondaryInfo = `${task.questionCount} ${isCreole ? 'kesyon' : 'questions'}`;
  if (taskType === 'video' && task.duration) secondaryInfo = `${task.duration} min`;

  return (
    <div
      className={`sp-task ${compact ? 'sp-task--compact' : ''} ${overdue ? 'sp-task--overdue' : ''}`}
      onClick={onNavigate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onNavigate()}
    >
      {/* Left accent bar */}
      <div className="sp-task__accent" style={{ backgroundColor: meta.color }} />

      <div className="sp-task__body">
        <div className="sp-task__top-row">
          <span className="sp-task__type-icon" style={{ color: meta.color }}><TypeIcon size={15} /></span>
          <span className="sp-task__subject" style={{ color: subjectColor(task.subject) }}>{task.subject}</span>
          {overdue && <span className="sp-task__overdue-tag">{isCreole ? 'Anreta' : 'En retard'}</span>}
        </div>
        <span className="sp-task__title">{displayTitle}</span>
        {(secondaryInfo || task.aiFocusArea) && (
          <span className="sp-task__secondary">
            {task.aiFocusArea || secondaryInfo}
          </span>
        )}
      </div>

      <div className="sp-task__end">
        {lastScore !== null && (
          <span className="sp-task__score">{lastScore}%</span>
        )}
        {taskType === 'exam' && (
          <span className="sp-task__stars" style={{ color: difficultyColor(task.difficulty) }} title={difficultyLabel(task.difficulty, isCreole)}>
            {'★'.repeat(task.difficulty)}{'☆'.repeat(5 - task.difficulty)}
          </span>
        )}
        <span className="sp-task__date">{formatDate(task.nextReviewMs, isCreole)}</span>
        <ChevronRight size={16} className="sp-task__chevron" />
      </div>
    </div>
  );
}

/** Compact mastery row for sidebar */
function MasteryRow({ subject, data, coefficient }) {
  return (
    <div className="sp-mastery-row">
      <div className="sp-mastery-row__head">
        <span className="sp-mastery-row__subject" style={{ color: subjectColor(subject) }}>
          {subject}
        </span>
        <span className="sp-mastery-row__pct">{data.masteredPct || 0}%</span>
      </div>
      <div className="sp-mastery-row__track">
        <div className="sp-mastery-row__fill" style={{ width: `${data.masteredPct || 0}%` }} />
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
