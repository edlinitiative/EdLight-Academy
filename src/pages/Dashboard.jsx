import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../hooks/useData';
import useStore from '../contexts/store';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useAppData();
  const { user, enrolledCourses, progress, quizAttempts } = useStore();

  if (isLoading) {
    return (
      <section className="section">
        <div className="container" style={{ display: 'grid', placeItems: 'center', minHeight: '320px' }}>
          <div className="loading-spinner" />
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

  return (
    <section className="section">
      <div className="container dashboard-grid">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">Welcome back</span>
            <h1>Hi {user?.name?.split(' ')[0] || 'there'}, let’s continue your journey</h1>
            <p className="text-muted">Pick up a course, review your quiz streak, or explore a new subject.</p>
          </div>
          <div className="page-header__actions">
            <button className="button button--ghost button--pill" onClick={() => navigate('/courses')}>
              Browse Catalog
            </button>
          </div>
        </div>

        <div className="grid grid--metrics">
          <div className="metric-card">
            <div className="metric-card__icon" aria-hidden>📚</div>
            <span className="metric-card__eyebrow">Courses in progress</span>
            <span className="metric-card__value">{coursesInProgress}</span>
            <span className="metric-card__caption">Stay consistent to unlock mastery badges.</span>
          </div>
          <div className="metric-card">
            <div className="metric-card__icon" aria-hidden>✅</div>
            <span className="metric-card__eyebrow">Quizzes completed</span>
            <span className="metric-card__value">{quizzesTaken}</span>
            <span className="metric-card__caption">Practice makes perfect — keep the streak alive.</span>
          </div>
          <div className="metric-card">
            <div className="metric-card__icon" aria-hidden>🎯</div>
            <span className="metric-card__eyebrow">Average score</span>
            <span className="metric-card__value">{avgScore}%</span>
            <span className="metric-card__caption">Aim for 85%+ to unlock advanced lessons.</span>
          </div>
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section__header">
            <h2 className="dashboard-section__title">Enrolled Courses</h2>
            <button className="button button--light button--pill" onClick={() => navigate('/courses')}>
              Add More Courses
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
                      <span className="chip chip--success">In Progress</span>
                    </div>
                    <h3 className="course-card__title">{course.name || course.title}</h3>
                    <p className="course-card__description">{course.description}</p>

                    <div className="course-card__footer">
                      <div className="course-progress">
                        <span>{courseProgress.percent}% complete</span>
                        <div className="progress-bar">
                          <span className="progress-bar__fill" style={{ width: `${courseProgress.percent}%` }} />
                        </div>
                        <span className="text-muted text-xs">
                          {courseProgress.completed}/{courseProgress.total} lessons finished
                        </span>
                      </div>
                      <div className="course-card__actions">
                        <button
                          className="button button--primary button--pill"
                          onClick={() => navigate(`/courses/${course.id}`)}
                        >
                          Continue
                        </button>
                        <button
                          className="course-card__cta"
                          onClick={() => navigate(`/courses/${course.id}`)}
                        >
                          View Details →
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty">
              <p>No courses yet. Browse the catalog to enroll in your first lesson bundle.</p>
              <div style={{ marginTop: '1rem' }}>
                <button className="button button--primary button--pill" onClick={() => navigate('/courses')}>
                  Explore Courses
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section__header">
            <h2 className="dashboard-section__title">Recent Activity</h2>
            {quizzesTaken > 0 && (
              <span className="chip chip--ghost">Last {Math.min(5, quizzesTaken)} quiz results</span>
            )}
          </div>

          {quizzesTaken > 0 ? (
            <div className="dashboard-activity">
              {quizAttemptsList.slice(0, 5).map((activity, index) => {
                const isCorrect = activity.score === 1;
                return (
                  <div key={`${activity.quizId}-${index}`} className="activity-item">
                    <div className="activity-item__meta">
                      <span className="activity-item__question">{activity.quiz?.question || 'Quiz question'}</span>
                      <span className="activity-item__date">{new Date(activity.date).toLocaleDateString()}</span>
                    </div>
                    <span className={[
                      'activity-item__tag',
                      isCorrect ? 'activity-item__tag--success' : 'activity-item__tag--error'
                    ].join(' ')}>
                      {isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-empty">
              <p>No quizzes attempted yet. Take a quiz to see your performance summary here.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}