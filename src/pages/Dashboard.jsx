import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../hooks/useData';
import { useAllProgress } from '../hooks/useProgress';
import useStore from '../contexts/store';
import ProgressDashboard from '../components/ProgressDashboard';
import { getFirstName } from '../utils/shared';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useAppData();
  const { user, enrolledCourses } = useStore();
  const { progress: allCourseProgress } = useAllProgress();

  const toMs = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    return 0;
  };

  const parseQuizIdToQuery = (quizId) => {
    const str = String(quizId || '').trim();
    const m = str.match(/^(.*)-U(\d+)(?:-L(\d+))?$/i);
    if (!m) return null;
    const course = m[1];
    const unit = `U${m[2]}`;
    return { course, unit };
  };

  const coursesInProgress = enrolledCourses.length;

  const quizAttemptsList = useMemo(() => {
    const list = [];
    for (const p of (allCourseProgress || [])) {
      const quizAttempts = p?.quizAttempts || {};
      for (const [quizId, payload] of Object.entries(quizAttempts)) {
        const attempts = Array.isArray(payload?.attempts) ? payload.attempts : [];
        for (const a of attempts) {
          const percentage = typeof a?.percentage === 'number'
            ? Math.round(a.percentage)
            : (a?.totalQuestions ? Math.round((a.score / a.totalQuestions) * 100) : 0);
          const attemptedAtMs = a?.attemptedAtMs
            || toMs(a?.attemptedAt)
            || toMs(p?.lastStudyDate);
          list.push({
            courseId: p.courseId,
            quizId,
            attemptedAtMs,
            percentage,
            score: a?.score ?? 0,
            totalQuestions: a?.totalQuestions ?? 0,
          });
        }
      }
    }
    list.sort((a, b) => (b.attemptedAtMs || 0) - (a.attemptedAtMs || 0));
    return list;
  }, [allCourseProgress]);

  const quizzesTaken = quizAttemptsList.length;
  const avgScore = quizzesTaken
    ? Math.round(quizAttemptsList.reduce((sum, a) => sum + (a.percentage || 0), 0) / quizzesTaken)
    : 0;

  const needsReview = quizAttemptsList.filter(a => (a.percentage || 0) < 70).slice(0, 3);

  const coursesById = useMemo(() => {
    const map = new Map();
    for (const c of (data?.courses || [])) map.set(c.id, c);
    return map;
  }, [data?.courses]);

  const progressByCourseId = useMemo(() => {
    const map = new Map();
    for (const p of (allCourseProgress || [])) map.set(p.courseId, p);
    return map;
  }, [allCourseProgress]);

  const getTotalLessonsForCourse = (course) => {
    if (!course || !Array.isArray(course.modules)) return 0;
    return course.modules.reduce((sum, m) => sum + (Array.isArray(m.lessons) ? m.lessons.length : 0), 0);
  };

  const computeCourseProgress = (courseId) => {
    const course = enrolledCourses.find(c => c.id === courseId) || coursesById.get(courseId);
    const p = progressByCourseId.get(courseId);
    const completed = p?.completedLessons?.length || 0;
    const total = getTotalLessonsForCourse(course) || 0;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return {
      completed,
      total: total || 1,
      percent: Number.isFinite(percent) ? Math.min(100, percent) : 0
    };
  };

  const recommendedCourseId = useMemo(() => {
    if (allCourseProgress && allCourseProgress.length > 0) {
      const mostRecent = [...allCourseProgress]
        .sort((a, b) => toMs(b.lastStudyDate) - toMs(a.lastStudyDate))[0];
      if (mostRecent?.courseId) return mostRecent.courseId;
    }
    return enrolledCourses[0]?.id || null;
  }, [allCourseProgress, enrolledCourses]);

  const recommendedCourse = useMemo(() => {
    if (!recommendedCourseId) return null;
    return enrolledCourses.find(c => c.id === recommendedCourseId)
      || coursesById.get(recommendedCourseId)
      || null;
  }, [recommendedCourseId, enrolledCourses, coursesById]);

  const recommendedPracticeHref = useMemo(() => {
    if (!recommendedCourse) return '/quizzes';
    const courseCode = recommendedCourse.code || recommendedCourse.id;
    const firstModule = Array.isArray(recommendedCourse.modules) ? recommendedCourse.modules[0] : null;
    const unit = firstModule?.id || (firstModule?.unit_no != null ? `U${firstModule.unit_no}` : '');
    const params = new URLSearchParams();
    if (courseCode) params.set('course', courseCode);
    if (unit) params.set('unit', unit);
    const qs = params.toString();
    return `/quizzes${qs ? `?${qs}` : ''}`;
  }, [recommendedCourse]);

  const firstName = getFirstName(user);

  if (isLoading) {
    return (
      <section className="section">
        <div className="container dashboard-grid">
          <div className="page-header">
            <div>
              <div className="skeleton" style={{ height: 18, width: 140, borderRadius: 999, marginBottom: '0.75rem' }} />
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
            {Array.from({ length: 2 }).map((_, i) => (
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

  return (
    <section className="section">
      <div className="container dashboard-grid">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">Bon retour / Byenvini ankò</span>
            <h1>Salut {firstName || '!'} — on continue ? / Bonjou {firstName || '!'} — ann kontinye</h1>
            <p className="text-muted">Reprenez un cours, voyez vos quiz, ou découvrez une nouvelle matière. / Kontinye yon kou, gade rezilta quiz, oswa dekouvri yon nouvo matyè.</p>
          </div>
          <div className="page-header__actions">
            <button className="button button--ghost button--pill" onClick={() => navigate('/courses')}>
              Voir le catalogue / Gade katalòg la
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
            <span className="metric-card__eyebrow">Cours en cours / Kou an kou</span>
            <span className="metric-card__value">{coursesInProgress}</span>
            <span className="metric-card__caption">Restez régulier pour progresser. / Rete regilye pou monte nivo.</span>
          </div>

          <div className="metric-card metric-card--green">
            <div className="metric-card__icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
            </div>
            <span className="metric-card__eyebrow">Quiz terminés / Quiz fini</span>
            <span className="metric-card__value">{quizzesTaken}</span>
            <span className="metric-card__caption">La pratique aide — gardez la série. / Pratik ede — kenbe seri a.</span>
          </div>

          <div className="metric-card metric-card--purple">
            <div className="metric-card__icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </div>
            <span className="metric-card__eyebrow">Score moyen / Nòt mwayèn</span>
            <span className="metric-card__value">{avgScore}%</span>
            <span className="metric-card__caption">Visez 85%+ pour viser plus haut. / Vize 85%+ pou avanse.</span>
          </div>
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section__header">
            <h2 className="dashboard-section__title">Prochaine étape / Sa pou fè apre</h2>
          </div>

          {recommendedCourse ? (
            <div className="grid grid--courses">
              {(() => {
                const courseProgress = computeCourseProgress(recommendedCourse.id);
                const badgeLeft = recommendedCourse.subject && recommendedCourse.level
                  ? `${recommendedCourse.subject} · ${recommendedCourse.level}`
                  : (recommendedCourse.code || recommendedCourse.id);

                return (
                  <article className="course-card">
                    <div className="course-card__head">
                      <span className="course-card__badge">{badgeLeft}</span>
                      <span className="chip">{courseProgress.percent}%</span>
                    </div>
                    <h3 className="course-card__title">{recommendedCourse.name || recommendedCourse.title}</h3>
                    <p className="course-card__description">
                      Continuez votre cours, ou faites une pratique ciblée. / Kontinye kou a, oswa fè pratik ki vize.
                    </p>

                    <div className="course-card__footer">
                      <div className="course-progress">
                        <span>{courseProgress.percent}% terminé / fini</span>
                        <div className="progress-bar">
                          <span className="progress-bar__fill" style={{ width: `${courseProgress.percent}%` }} />
                        </div>
                        <span className="text-muted text-xs">
                          {courseProgress.completed}/{courseProgress.total} leçons finies / leson fini
                        </span>
                      </div>
                      <div className="course-card__actions">
                        <button
                          className="button button--primary button--pill"
                          onClick={() => navigate(`/courses/${recommendedCourse.id}`)}
                        >
                          Continuer / Kontinye
                        </button>
                        <button
                          className="button button--light button--pill"
                          onClick={() => navigate(recommendedPracticeHref)}
                        >
                          Pratiquer / Pratike
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })()}
            </div>
          ) : (
            <div className="dashboard-empty">
              <p>Commencez par choisir un cours. / Kòmanse pa chwazi yon kou.</p>
              <div style={{ marginTop: '1rem' }}>
                <button className="button button--primary button--pill" onClick={() => navigate('/courses')}>
                  Explorer les cours / Gade kou yo
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section__header">
            <h2 className="dashboard-section__title">Cours suivis / Kou ou pran</h2>
            <button className="button button--light button--pill" onClick={() => navigate('/courses')}>
              Ajouter des cours / Ajoute kou
            </button>
          </div>

          {enrolledCourses.length > 0 ? (
            <div className="grid grid--courses">
              {enrolledCourses.map((course) => {
                const courseProgress = computeCourseProgress(course.id);
                return (
                  <article key={course.id} className="course-card">
                    <div className="course-card__head">
                      <span className="course-card__badge">{course.subject} · {course.level}</span>
                      <span className="chip chip--success">En cours / An kou</span>
                    </div>
                    <h3 className="course-card__title">{course.name || course.title}</h3>
                    <p className="course-card__description">{course.description}</p>

                    <div className="course-card__footer">
                      <div className="course-progress">
                        <span>{courseProgress.percent}% terminé / fini</span>
                        <div className="progress-bar">
                          <span className="progress-bar__fill" style={{ width: `${courseProgress.percent}%` }} />
                        </div>
                        <span className="text-muted text-xs">
                          {courseProgress.completed}/{courseProgress.total} leçons finies / leson fini
                        </span>
                      </div>
                      <div className="course-card__actions">
                        <button
                          className="button button--primary button--pill"
                          onClick={() => navigate(`/courses/${course.id}`)}
                        >
                          Continuer / Kontinye
                        </button>
                        <button
                          className="course-card__cta"
                          onClick={() => navigate(`/courses/${course.id}`)}
                        >
                          Détails → / Detay →
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty">
              <p>Aucun cours pour l’instant. Parcourez le catalogue pour commencer. / Pa gen kou ankò. Gade katalòg la pou kòmanse.</p>
              <div style={{ marginTop: '1rem' }}>
                <button className="button button--primary button--pill" onClick={() => navigate('/courses')}>
                  Explorer les cours / Gade kou yo
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <ProgressDashboard />
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section__header">
            <h2 className="dashboard-section__title">À revoir / Pou revize</h2>
            {needsReview.length > 0 && (
              <span className="chip chip--ghost">{needsReview.length} à retravailler / pou travay</span>
            )}
          </div>

          {needsReview.length > 0 ? (
            <div className="dashboard-activity">
              {needsReview.map((item) => {
                const query = parseQuizIdToQuery(item.quizId);
                const href = query
                  ? `/quizzes?${new URLSearchParams(query).toString()}`
                  : '/quizzes';
                const date = item.attemptedAtMs ? new Date(item.attemptedAtMs).toLocaleDateString() : '';
                return (
                  <div key={`${item.courseId}-${item.quizId}-${item.attemptedAtMs}`} className="activity-item">
                    <div className="activity-item__meta">
                      <span className="activity-item__question">{item.quizId}</span>
                      <span className="activity-item__date">{date}</span>
                    </div>
                    <span className={[
                      'activity-item__tag',
                      'activity-item__tag--error'
                    ].join(' ')}>
                      {item.percentage}%
                    </span>
                    <button className="button button--light button--pill" onClick={() => navigate(href)}>
                      Pratiquer / Pratike
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty">
              <p>Rien à revoir pour l’instant. Continuez à pratiquer. / Pa gen anyen pou revize la. Kontinye pratike.</p>
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section__header">
            <h2 className="dashboard-section__title">Activité récente / Aktivite resan</h2>
            {quizzesTaken > 0 && (
              <span className="chip chip--ghost">{Math.min(5, quizzesTaken)} derniers / dènye</span>
            )}
          </div>

          {progressLoading ? (
            <div className="dashboard-empty">
              <p>Chargement… / Ap chaje…</p>
            </div>
          ) : quizzesTaken > 0 ? (
            <div className="dashboard-activity">
              {quizAttemptsList.slice(0, 5).map((activity) => {
                const good = (activity.percentage || 0) >= 70;
                const query = parseQuizIdToQuery(activity.quizId);
                const href = query
                  ? `/quizzes?${new URLSearchParams(query).toString()}`
                  : '/quizzes';
                const date = activity.attemptedAtMs ? new Date(activity.attemptedAtMs).toLocaleDateString() : '';

                return (
                  <div key={`${activity.courseId}-${activity.quizId}-${activity.attemptedAtMs}`} className="activity-item">
                    <div className="activity-item__meta">
                      <span className="activity-item__question">{activity.quizId}</span>
                      <span className="activity-item__date">{date}</span>
                    </div>
                    <span className={[
                      'activity-item__tag',
                      good ? 'activity-item__tag--success' : 'activity-item__tag--error'
                    ].join(' ')}>
                      {activity.percentage}%
                    </span>
                    <button className="button button--light button--pill" onClick={() => navigate(href)}>
                      Refaire / Refè
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty">
              <p>Aucun quiz pour l’instant. Faites un quiz pour voir votre résumé ici. / Ou poko fè quiz. Fè yon quiz pou wè rezime a.</p>
              <div style={{ marginTop: '1rem' }}>
                <button className="button button--primary button--pill" onClick={() => navigate('/quizzes')}>
                  Aller à la pratique / Ale pratike
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}