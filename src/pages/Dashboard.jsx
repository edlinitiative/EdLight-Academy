import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../hooks/useData';
import useStore from '../contexts/store';
import ProgressDashboard from '../components/ProgressDashboard';
import { getFirstName } from '../utils/shared';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useAppData();
  const { user, enrolledCourses, progress, quizAttempts, language } = useStore();
  const isCreole = language === 'ht';

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

  const coursesInProgress = enrolledCourses.length;
  const quizAttemptsList = Object.entries(quizAttempts)
    .flatMap(([quizId, attempts]) =>
      attempts.map(attempt => ({
        ...attempt,
        quizId,
        quiz: data.quizzes.find(q => q.quiz_id === quizId)
      }))
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const quizzesTaken = quizAttemptsList.length;
  const avgScore = quizzesTaken
    ? Math.round(
        (quizAttemptsList.reduce((sum, attempt) => sum + (attempt.score || 0), 0) / quizzesTaken) * 100
      )
    : 0;

  const computeProgress = (courseId, modulesCount) => {
    const courseProgress = progress[courseId] || { completed: 0, total: modulesCount || 1 };
    const total = courseProgress.total || modulesCount || 1;
    const completed = courseProgress.completed || 0;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return {
      completed,
      total,
      percent: Number.isFinite(percent) ? Math.min(100, percent) : 0
    };
  };

  const firstName = getFirstName(user);

  return (
    <section className="section">
      <div className="container dashboard-grid">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">{isCreole ? 'Byenveni ankò' : 'Bon retour'}</span>
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
              {isCreole ? 'Pratik fè w vin pi bon — kenbe seri a.' : 'La pratique rend meilleur — gardez la série.'}
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
            <div className="grid grid--courses">
              {enrolledCourses.map((course) => {
                const courseProgress = computeProgress(course.id, course.modules?.length);
                return (
                  <article key={course.id} className="course-card">
                    <div className="course-card__head">
                      <span className="course-card__badge">{course.subject} · {course.level}</span>
                      <span className="chip chip--success">{isCreole ? 'An kou' : 'En cours'}</span>
                    </div>
                    <h3 className="course-card__title">{course.name || course.title}</h3>
                    <p className="course-card__description">{course.description}</p>

                    <div className="course-card__footer">
                      <div className="course-progress">
                        <span>{courseProgress.percent}% {isCreole ? 'fini' : 'terminé'}</span>
                        <div className="progress-bar">
                          <span className="progress-bar__fill" style={{ width: `${courseProgress.percent}%` }} />
                        </div>
                        <span className="text-muted text-xs">
                          {courseProgress.completed}/{courseProgress.total} {isCreole ? 'leson fini' : 'leçons terminées'}
                        </span>
                      </div>
                      <div className="course-card__actions">
                        <button
                          className="button button--primary button--pill"
                          onClick={() => navigate(`/courses/${course.id}`)}
                        >
                          {isCreole ? 'Kontinye' : 'Continuer'}
                        </button>
                        <button
                          className="course-card__cta"
                          onClick={() => navigate(`/courses/${course.id}`)}
                        >
                          {isCreole ? 'Gade detay →' : 'Voir les détails →'}
                        </button>
                      </div>
                    </div>
                  </article>
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

        <div className="dashboard-section">
          <div className="dashboard-section__header">
            <h2 className="dashboard-section__title">{isCreole ? 'Aktivite resan' : 'Activité récente'}</h2>
            {quizzesTaken > 0 && (
              <span className="chip chip--ghost">
                {isCreole
                  ? `Dènye ${Math.min(5, quizzesTaken)} rezilta quiz`
                  : `Derniers ${Math.min(5, quizzesTaken)} résultats de quiz`}
              </span>
            )}
          </div>

          {quizzesTaken > 0 ? (
            <div className="dashboard-activity">
              {quizAttemptsList.slice(0, 5).map((activity, index) => {
                const isCorrect = activity.score === 1;
                return (
                  <div key={`${activity.quizId}-${index}`} className="activity-item">
                    <div className="activity-item__meta">
                      <span className="activity-item__question">{activity.quiz?.question || (isCreole ? 'Kesyon quiz' : 'Question du quiz')}</span>
                      <span className="activity-item__date">{new Date(activity.date).toLocaleDateString(isCreole ? 'fr-HT' : 'fr-FR')}</span>
                    </div>
                    <span className={[
                      'activity-item__tag',
                      isCorrect ? 'activity-item__tag--success' : 'activity-item__tag--error'
                    ].join(' ')}>
                      {isCorrect ? (isCreole ? 'Kòrèk' : 'Juste') : (isCreole ? 'Pa kòrèk' : 'Faux')}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty">
              <p>
                {isCreole
                  ? 'Ou poko eseye okenn quiz. Fè yon quiz pou w wè rezime pèfòmans ou isit la.'
                  : 'Aucun quiz tenté pour le moment. Faites un quiz pour voir ici un résumé de vos résultats.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}