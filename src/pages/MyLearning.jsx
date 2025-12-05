import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../hooks/useData';
import useStore from '../contexts/store';

export default function MyLearning() {
  const navigate = useNavigate();
  const { data, isLoading } = useAppData();
  const { enrolledCourses, progress, isAuthenticated } = useStore();

  // Redirect to home if not authenticated
  React.useEffect(() => {
    if (!isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <section className="section">
        <div className="container" style={{ display: 'grid', placeItems: 'center', minHeight: '320px' }}>
          <div className="loading-spinner" />
        </div>
      </section>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

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
      <div className="container">
        <div className="page-header">
          <div>
            <h1>My Learning</h1>
            <p className="text-muted">
              Track your progress and continue where you left off
            </p>
          </div>
        </div>

        {enrolledCourses.length > 0 ? (
          <div className="my-learning-content">
            {/* In Progress Courses */}
            <div className="dashboard-section">
              <div className="dashboard-section__header">
                <h2 className="dashboard-section__title">
                  In Progress ({enrolledCourses.filter(course => {
                    const prog = computeProgress(course.id, course.modules?.length);
                    return prog.percent > 0 && prog.percent < 100;
                  }).length})
                </h2>
              </div>

              <div className="grid grid--courses">
                {enrolledCourses
                  .filter(course => {
                    const prog = computeProgress(course.id, course.modules?.length);
                    return prog.percent > 0 && prog.percent < 100;
                  })
                  .map((course) => {
                    const courseProgress = computeProgress(course.id, course.modules?.length);
                    return (
                      <article 
                        key={course.id} 
                        className="course-card"
                        onClick={() => navigate(`/courses/${course.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="course-card__head">
                          <span className="course-card__badge">{course.subject} · {course.level}</span>
                          <span className="chip chip--warning">In Progress</span>
                        </div>
                        <h3 className="course-card__title">{course.name || course.title}</h3>
                        <p className="course-card__description">
                          {course.description || 'Continue your learning journey'}
                        </p>

                        <div className="course-card__footer">
                          <div className="course-progress">
                            <span style={{ fontWeight: '600', color: '#7c3aed' }}>
                              {courseProgress.percent}% complete
                            </span>
                            <div className="progress-bar">
                              <span className="progress-bar__fill" style={{ width: `${courseProgress.percent}%` }} />
                            </div>
                            <span className="text-muted text-xs">
                              {courseProgress.completed}/{courseProgress.total} lessons finished
                            </span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
              </div>

              {enrolledCourses.filter(course => {
                const prog = computeProgress(course.id, course.modules?.length);
                return prog.percent > 0 && prog.percent < 100;
              }).length === 0 && (
                <div className="dashboard-empty">
                  <p>No courses in progress. Start learning by clicking on a course below!</p>
                </div>
              )}
            </div>

            {/* Not Started Courses */}
            {enrolledCourses.filter(course => {
              const prog = computeProgress(course.id, course.modules?.length);
              return prog.percent === 0;
            }).length > 0 && (
              <div className="dashboard-section">
                <div className="dashboard-section__header">
                  <h2 className="dashboard-section__title">
                    Not Started ({enrolledCourses.filter(course => {
                      const prog = computeProgress(course.id, course.modules?.length);
                      return prog.percent === 0;
                    }).length})
                  </h2>
                </div>

                <div className="grid grid--courses">
                  {enrolledCourses
                    .filter(course => {
                      const prog = computeProgress(course.id, course.modules?.length);
                      return prog.percent === 0;
                    })
                    .map((course) => (
                      <article 
                        key={course.id} 
                        className="course-card"
                        onClick={() => navigate(`/courses/${course.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="course-card__head">
                          <span className="course-card__badge">{course.subject} · {course.level}</span>
                          <span className="chip chip--ghost">Not Started</span>
                        </div>
                        <h3 className="course-card__title">{course.name || course.title}</h3>
                        <p className="course-card__description">
                          {course.description || 'Start your learning journey'}
                        </p>

                        <div className="course-card__footer">
                          <button 
                            className="button button--primary button--pill"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/courses/${course.id}`);
                            }}
                            style={{ width: '100%' }}
                          >
                            Start Learning
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              </div>
            )}

            {/* Completed Courses */}
            {enrolledCourses.filter(course => {
              const prog = computeProgress(course.id, course.modules?.length);
              return prog.percent === 100;
            }).length > 0 && (
              <div className="dashboard-section">
                <div className="dashboard-section__header">
                  <h2 className="dashboard-section__title">
                    Completed ({enrolledCourses.filter(course => {
                      const prog = computeProgress(course.id, course.modules?.length);
                      return prog.percent === 100;
                    }).length})
                  </h2>
                </div>

                <div className="grid grid--courses">
                  {enrolledCourses
                    .filter(course => {
                      const prog = computeProgress(course.id, course.modules?.length);
                      return prog.percent === 100;
                    })
                    .map((course) => (
                      <article 
                        key={course.id} 
                        className="course-card course-card--completed"
                        onClick={() => navigate(`/courses/${course.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="course-card__head">
                          <span className="course-card__badge">{course.subject} · {course.level}</span>
                          <span className="chip chip--success">✓ Completed</span>
                        </div>
                        <h3 className="course-card__title">{course.name || course.title}</h3>
                        <p className="course-card__description">
                          {course.description || 'Great job completing this course!'}
                        </p>

                        <div className="course-card__footer">
                          <button 
                            className="button button--ghost button--pill"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/courses/${course.id}`);
                            }}
                            style={{ width: '100%' }}
                          >
                            Review Course
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="dashboard-section">
            <div className="dashboard-empty">
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📚</div>
              <h3 style={{ marginBottom: '0.5rem' }}>No Enrolled Courses Yet</h3>
              <p>Start your learning journey by enrolling in a course!</p>
              <div style={{ marginTop: '1.5rem' }}>
                <button 
                  className="button button--primary button--pill"
                  onClick={() => navigate('/courses')}
                >
                  Browse All Courses
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

