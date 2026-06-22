import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Flame, Target, ClipboardList } from 'lucide-react';
import { useCourses } from '../hooks/useData';
import { useAllProgress, calculateCompletionPercentage } from '../hooks/useProgress';
import useStore from '../contexts/store';
import ProgressDashboard from '../components/ProgressDashboard';
import { ErrorState } from '../components/StateViews';
import { listRecentExamAttempts, listRecentQuizAttempts } from '../services/userActivity';
import { getFirstName } from '../utils/shared';

function countCourseLessons(course) {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  const lessonsCount = units.reduce((sum, unit) => sum + (unit?.lessons?.length || 0), 0);
  return lessonsCount || units.length || course?.videoCount || 0;
}

function levelToUrl(levelLabel) {
  const s = String(levelLabel || '').toLowerCase();
  if (s.includes('baccala')) return 'terminale';
  if (s.includes('9')) return '9e';
  if (s.includes('univers')) return 'university';
  return '';
}

function formatShortDate(msOrDate, locale) {
  const d = msOrDate instanceof Date ? msOrDate : new Date(msOrDate);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: courses, isLoading, isError, isFetching, refetch } = useCourses();
  const { user, enrolledCourses, quizAttempts, language } = useStore();
  const isCreole = language === 'ht';
  const locale = isCreole ? 'fr-HT' : 'fr-FR';

  const { progress: allProgress, loading: progressLoading } = useAllProgress();

  const progressByCourseId = React.useMemo(() => {
    const m = new Map();
    for (const p of allProgress || []) {
      if (!p?.courseId) continue;
      m.set(p.courseId, p);
    }
    return m;
  }, [allProgress]);

  const { data: recentQuizAttempts = [], isLoading: quizLoading } = useQuery({
    queryKey: ['dashboard-quiz-attempts', user?.uid],
    queryFn: () => listRecentQuizAttempts(user.uid, 50),
    enabled: !!user?.uid,
    staleTime: 60 * 1000,
  });

  const { data: recentExamAttempts = [], isLoading: examLoading } = useQuery({
    queryKey: ['dashboard-exam-attempts', user?.uid],
    queryFn: () => listRecentExamAttempts(user.uid, 25),
    enabled: !!user?.uid,
    staleTime: 60 * 1000,
  });

  const coursesInProgress = enrolledCourses.length;

  // Quiz stats: prefer Firestore attempts (cross-device), fallback to local attempts.
  const fallbackQuizAttemptsList = Object.entries(quizAttempts)
    .flatMap(([quizId, attempts]) => (attempts || []).map((attempt) => ({ ...attempt, quizId })))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const quizAttemptsForStats = recentQuizAttempts.length
    ? recentQuizAttempts.map((a) => ({
        quizId: a.quizId,
        courseId: a.courseId,
        percentage: typeof a.percentage === 'number' ? a.percentage : null,
        attemptedAtMs: a.attemptedAtMs,
      }))
    : fallbackQuizAttemptsList.map((a) => ({
        quizId: a.quizId,
        courseId: null,
        percentage: typeof a.score === 'number' ? a.score * 100 : null,
        attemptedAtMs: a.date ? new Date(a.date).getTime() : null,
      }));

  const quizzesTaken = quizAttemptsForStats.length;
  const avgScore = quizzesTaken
    ? Math.round(
        (quizAttemptsForStats.reduce((sum, a) => sum + (typeof a.percentage === 'number' ? a.percentage : 0), 0) /
          quizzesTaken)
      )
    : 0;

  const masteredQuizCount = React.useMemo(() => {
    const byQuiz = new Map();
    for (const a of quizAttemptsForStats) {
      if (!a?.quizId) continue;
      const best = byQuiz.get(a.quizId) ?? -1;
      const pct = typeof a.percentage === 'number' ? a.percentage : -1;
      byQuiz.set(a.quizId, Math.max(best, pct));
    }
    let mastered = 0;
    for (const best of byQuiz.values()) {
      if (best >= 80) mastered += 1;
    }
    return mastered;
  }, [quizAttemptsForStats]);

  const quizStreak7d = React.useMemo(() => {
    const now = Date.now();
    const start = now - 7 * 24 * 60 * 60 * 1000;
    const count = quizAttemptsForStats.filter((a) => (a.attemptedAtMs || 0) >= start).length;
    return count;
  }, [quizAttemptsForStats]);

  const recentQuizActivityRows = React.useMemo(() => {
    if (recentQuizAttempts.length) return recentQuizAttempts.slice(0, 5);
    return fallbackQuizAttemptsList.slice(0, 5).map((a) => ({
      quizId: a.quizId,
      courseId: null,
      percentage: typeof a.score === 'number' ? a.score * 100 : 0,
      attemptedAtMs: a.date ? new Date(a.date).getTime() : Date.now(),
    }));
  }, [recentQuizAttempts, fallbackQuizAttemptsList]);

  const examSummary = React.useMemo(() => {
    const attempts = Array.isArray(recentExamAttempts) ? recentExamAttempts : [];
    const inProgress = attempts.filter((a) => a?.status === 'in_progress').length;
    const submitted = attempts.filter((a) => a?.status === 'submitted').length;
    const last = attempts.find((a) => a?.updated_at_ms || a?.submitted_at_ms) || null;
    const lastMs = last?.updated_at_ms || last?.submitted_at_ms || null;
    return { inProgress, submitted, lastMs };
  }, [recentExamAttempts]);

  const firstName = getFirstName(user);

  if (isLoading) {
    return (
      <section className="section">
        <div className="container dashboard-grid">
          <div className="page-header">
            <div>
              <div className="skeleton" style={{ height: 18, width: 100, borderRadius: 999, marginBottom: '0.75rem' }} />
              <div className="skeleton" style={{ height: 30, width: '55%', marginBottom: '0.5rem' }} />
              <div className="skeleton" style={{ height: 15, width: '45%' }} />
            </div>
          </div>
          <div className="grid grid--metrics">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton-metric">
                <div className="skeleton skeleton-metric__icon" />
                <div className="skeleton skeleton-metric__label" />
                <div className="skeleton skeleton-metric__value" />
                <div className="skeleton skeleton-metric__cap" />
              </div>
            ))}
          </div>
          <div className="grid grid--courses">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton-card">
                <div className="skeleton skeleton-card__badge" />
                <div className="skeleton skeleton-card__title" />
                <div className="skeleton skeleton-card__line" />
                <div className="skeleton skeleton-card__bar" />
                <div className="skeleton skeleton-card__btn" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (isError && !courses) {
    return (
      <section className="section">
        <div className="container">
          <ErrorState onRetry={() => refetch()} retrying={isFetching} />
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container dashboard-grid">
        <div className="page-header">
          <div>
            <h1>
              {isCreole
                ? `Bonjou ${firstName || 'zanmi'}, ann kontinye vwayaj la`
                : `Bonjour ${firstName || 'à vous'}, continuons votre parcours`}
            </h1>
            <p className="text-muted">
              {isCreole
                ? 'Kontinye yon kou, gade seri quiz ou, oswa dekouvri yon nouvo matyè.'
                : 'Reprenez un cours, consultez votre série de quiz ou explorez une nouvelle matière.'}
            </p>
          </div>
          <div className="page-header__actions">
            <button className="button button--ghost button--pill" onClick={() => navigate('/courses')}>
              {isCreole ? 'Gade katalòg la' : 'Explorer le catalogue'}
            </button>
          </div>
        </div>

        <div className="grid grid--metrics">
          <div className="metric-card">
            <div className="metric-card__icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
            <span className="metric-card__eyebrow">{isCreole ? 'Kou k ap kontinye' : 'Cours en cours'}</span>
            <span className="metric-card__value">{coursesInProgress}</span>
            <span className="metric-card__caption">
              {isCreole ? 'Rete regilye pou w deblozake badj metrize.' : 'Restez régulier pour débloquer des badges de maîtrise.'}
            </span>
          </div>
          <div className="metric-card metric-card--green">
            <div className="metric-card__icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
            </div>
            <span className="metric-card__eyebrow">{isCreole ? 'Quiz fini' : 'Quiz terminés'}</span>
            <span className="metric-card__value">{quizzesTaken}</span>
            <span className="metric-card__caption">
              {isCreole
                ? `${masteredQuizCount} metrize • ${quizStreak7d} nan 7 jou`
                : `${masteredQuizCount} maîtrisés • ${quizStreak7d} sur 7 jours`}
            </span>
          </div>
          <div className="metric-card metric-card--purple">
            <div className="metric-card__icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </div>
            <span className="metric-card__eyebrow">{isCreole ? 'Mwayèn nòt' : 'Score moyen'}</span>
            <span className="metric-card__value">{avgScore}%</span>
            <span className="metric-card__caption">
              {isCreole ? 'Vize 85%+ pou deblozake leson avanse.' : 'Visez 85%+ pour débloquer des leçons avancées.'}
            </span>
          </div>
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section__header">
            <h2 className="dashboard-section__title">{isCreole ? 'Kou ou enskri' : 'Cours suivis'}</h2>
            <button className="button button--light button--pill" onClick={() => navigate('/courses')}>
              {isCreole ? 'Ajoute lòt kou' : 'Ajouter des cours'}
            </button>
          </div>

          {enrolledCourses.length > 0 ? (
            <div className="dashboard-course-list">
              {enrolledCourses.map((course) => {
                const totalLessons = countCourseLessons(course);
                const p = progressByCourseId.get(course.id) || null;
                const completedLessons = p?.completedLessons?.length || 0;
                const percent = calculateCompletionPercentage(p, totalLessons || 0);
                const points = p?.totalPoints || 0;
                const streak = p?.currentStreak || 0;
                const lastStudyRaw = p?.lastStudyDate?.toDate ? p.lastStudyDate.toDate() : (p?.lastStudyDate || null);
                const lastStudyLabel = lastStudyRaw ? formatShortDate(lastStudyRaw, locale) : '';
                const remaining = Math.max(0, (totalLessons || 0) - completedLessons);

                return (
                  <div
                    key={course.id}
                    className="dashboard-course-row"
                    role="group"
                    aria-label={course.name || course.title || course.id}
                  >
                    <div className="dashboard-course-row__main">
                      <div className="dashboard-course-row__top">
                        <div className="dashboard-course-row__titlewrap">
                          <h3 className="dashboard-course-row__title">{course.name || course.title}</h3>
                          <div className="dashboard-course-row__badges">
                            <span className="course-card__badge">{course.subject} · {course.level}</span>
                            <span className="chip chip--success">{isCreole ? 'An kou' : 'En cours'}</span>
                          </div>
                        </div>
                        <div className="dashboard-course-row__kpis">
                          <span className="chip chip--ghost">{progressLoading ? '—' : `${percent}%`}</span>
                          {streak > 0 && <span className="chip chip--warning"><Flame size={14} /> {streak}</span>}
                          {points > 0 && <span className="chip chip--primary"><Target size={14} /> {points}</span>}
                        </div>
                      </div>

                      <div className="dashboard-course-row__progress">
                        <div className="progress-bar" aria-hidden>
                          <span className="progress-bar__fill" style={{ width: `${percent}%` }} />
                        </div>
                        <div className="dashboard-course-row__meta text-muted text-xs">
                          {progressLoading
                            ? (isCreole ? 'Ap chaje pwogrè…' : 'Chargement de la progression…')
                            : (
                              <>
                                {completedLessons}/{totalLessons || 0} {isCreole ? 'leson fini' : 'leçons terminées'}
                                {totalLessons > 0
                                  ? ` · ${remaining} ${isCreole ? 'rete' : 'restantes'}`
                                  : ''}
                                {lastStudyLabel ? ` · ${isCreole ? 'Dènye etid:' : 'Dernière étude:'} ${lastStudyLabel}` : ''}
                              </>
                            )}
                        </div>
                      </div>
                    </div>

                    <div className="dashboard-course-row__actions">
                      <button
                        className="button button--primary button--pill button--sm"
                        onClick={() => navigate(`/courses/${course.id}`)}
                        type="button"
                      >
                        {isCreole ? 'Kontinye' : 'Continuer'}
                      </button>
                      <button
                        className="button button--ghost button--pill button--sm"
                        onClick={() => navigate(`/courses/${course.id}`)}
                        type="button"
                      >
                        {isCreole ? 'Detay' : 'Détails'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty">
              <p>
                {isCreole
                  ? 'Ou poko gen kou. Gade katalòg la pou enskri nan premye kou ou.'
                  : 'Aucun cours pour le moment. Explorez le catalogue pour vous inscrire à votre premier cours.'}
              </p>
              <div style={{ marginTop: '1rem' }}>
                <button className="button button--primary button--pill" onClick={() => navigate('/courses')}>
                  {isCreole ? 'Eksplore kou yo' : 'Explorer les cours'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* New Progress Tracking Dashboard */}
        <div className="dashboard-section">
          <ProgressDashboard />
        </div>

        <div className="dashboard-cols">
        <div className="dashboard-section">
          <div className="dashboard-section__header">
            <h2 className="dashboard-section__title">{isCreole ? 'Quiz, pèfòmans' : 'Quiz, performance'}</h2>
            <button className="button button--light button--pill" onClick={() => navigate('/quizzes')} type="button">
              {isCreole ? 'Ale nan quiz yo' : 'Aller aux quiz'}
            </button>
          </div>

          {(quizLoading && user?.uid) ? (
            <div className="dashboard-empty">
              <p>{isCreole ? 'Ap chaje done quiz…' : 'Chargement des données quiz…'}</p>
            </div>
          ) : quizzesTaken > 0 ? (
            <div className="dashboard-activity">
              {recentQuizActivityRows.map((a, idx) => {
                const pct = typeof a.percentage === 'number'
                  ? Math.round(a.percentage)
                  : 0;
                const good = pct >= 80;
                const courseName = a.courseId
                  ? (courses?.find((c) => c.id === a.courseId)?.name || a.courseId)
                  : '';
                const label = a.quizId || (isCreole ? 'Quiz' : 'Quiz');
                const dateMs = a.attemptedAtMs || a.attemptedAt_ms || a.date || Date.now();

                return (
                  <div key={`${a.quizId || 'quiz'}-${idx}`} className="activity-item">
                    <div className="activity-item__meta">
                      <span className="activity-item__question">
                        {label}{courseName ? ` · ${courseName}` : ''}
                      </span>
                      <span className="activity-item__date">{formatShortDate(dateMs, locale)}</span>
                    </div>
                    <span
                      className={[
                        'activity-item__tag',
                        good ? 'activity-item__tag--success' : 'activity-item__tag--error'
                      ].join(' ')}
                    >
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty">
              <p>
                {isCreole
                  ? 'Ou poko gen done quiz. Fè yon quiz pou wè pèfòmans ou.'
                  : 'Aucune donnée de quiz pour le moment. Faites un quiz pour voir votre performance.'}
              </p>
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section__header">
            <h2 className="dashboard-section__title">{isCreole ? 'Egzamen, aktivite' : 'Examens, activité'}</h2>
            <button className="button button--light button--pill" onClick={() => navigate('/exams')} type="button">
              {isCreole ? 'Ale nan egzamen yo' : 'Aller aux examens'}
            </button>
          </div>

          {(examLoading && user?.uid) ? (
            <div className="dashboard-empty">
              <p>{isCreole ? 'Ap chaje aktivite egzamen…' : 'Chargement de l’activité examens…'}</p>
            </div>
          ) : (recentExamAttempts.length > 0) ? (
            <>
              <div className="grid grid--metrics">
                <div className="metric-card">
                  <span className="metric-card__eyebrow">{isCreole ? 'Ankou' : 'En cours'}</span>
                  <span className="metric-card__value">{examSummary.inProgress}</span>
                  <span className="metric-card__caption">
                    {examSummary.lastMs
                      ? (isCreole ? `Dènye mizajou: ${formatShortDate(examSummary.lastMs, locale)}` : `Dernière mise à jour: ${formatShortDate(examSummary.lastMs, locale)}`)
                      : (isCreole ? '—' : '—')}
                  </span>
                </div>
                <div className="metric-card metric-card--green">
                  <span className="metric-card__eyebrow">{isCreole ? 'Soumèt' : 'Soumis'}</span>
                  <span className="metric-card__value">{examSummary.submitted}</span>
                  <span className="metric-card__caption">
                    {isCreole ? 'Egzamen ki gen rezilta sove.' : 'Examens avec résultats enregistrés.'}
                  </span>
                </div>
              </div>

              <div className="dashboard-activity">
                {recentExamAttempts.slice(0, 5).map((a, idx) => {
                  const status = a?.status || '';
                  const isSubmitted = status === 'submitted';
                  const tagClass = isSubmitted ? 'activity-item__tag--success' : 'activity-item__tag--error';
                  const title = a?.exam_title || a?.examTitle || a?.exam_id || (isCreole ? 'Egzamen' : 'Examen');
                  const dateMs = a?.updated_at_ms || a?.submitted_at_ms || a?.started_at_ms || Date.now();
                  const urlLevel = levelToUrl(a?.level);

                  const ctaLabel = isSubmitted
                    ? (isCreole ? 'Rezilta' : 'Résultats')
                    : (isCreole ? 'Repran' : 'Reprendre');

                  const onOpen = () => {
                    if (!a?.exam_id) return navigate('/exams');
                    if (!urlLevel) return navigate('/exams');
                    if (isSubmitted) return navigate(`/exams/${urlLevel}/${a.exam_id}/results`);
                    return navigate(`/exams/${urlLevel}/${a.exam_id}`);
                  };

                  return (
                    <div key={`${a?.exam_id || 'exam'}-${idx}`} className="activity-item">
                      <div className="activity-item__meta">
                        <span className="activity-item__question">{title}</span>
                        <span className="activity-item__date">{formatShortDate(dateMs, locale)}</span>
                      </div>
                      <button
                        type="button"
                        className={['activity-item__tag', tagClass].join(' ')}
                        onClick={onOpen}
                      >
                        {ctaLabel}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="dashboard-empty">
              <p>
                {isCreole
                  ? 'Ou poko kòmanse okenn egzamen. Chwazi yon nivo pou kòmanse.'
                  : 'Vous n’avez commencé aucun examen. Choisissez un niveau pour démarrer.'}
              </p>
            </div>
          )}
        </div>
        </div>{/* /dashboard-cols */}

        <div className="dashboard-section">
          <div className="dashboard-section__header">
            <h2 className="dashboard-section__title">
              <ClipboardList size={16} /> {isCreole ? 'Plan Etid' : 'Plan d\'Étude'}
            </h2>
            <button
              className="chip chip--primary"
              onClick={() => navigate('/study-plan')}
              style={{ cursor: 'pointer', border: 'none' }}
            >
              {isCreole ? 'Wè plan' : 'Voir le plan'} →
            </button>
          </div>
          <div className="dashboard-study-plan-cta" onClick={() => navigate('/study-plan')} style={{ cursor: 'pointer' }}>
            <p className="text-muted">
              {isCreole
                ? 'Jwenn yon plan etid pèsonalize ak revizyon espase pou prepare bak ou.'
                : 'Obtenez un plan d\'étude personnalisé avec révision espacée pour préparer votre bac.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}