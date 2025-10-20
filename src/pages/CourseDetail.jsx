import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppData } from '../hooks/useData';
import { QuizComponent } from '../components/Quiz';
import useStore from '../contexts/store';

export default function CourseDetail() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useAppData();
  const [activeModule, setActiveModule] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const { isAuthenticated, enrolledCourses } = useStore();

  const course = data?.courses?.find((c) => c.id === courseId);
  const isEnrolled = enrolledCourses.some((c) => c.id === courseId);
  const modules = course?.modules ?? [];
  const activeModuleData = modules[activeModule] ?? null;
  const activeDescription = activeModuleData?.description
    ?? activeModuleData?.objective
    ?? activeModuleData?.lessons?.[0]?.objectives
    ?? course?.description
    ?? '';
  const primaryVideo = activeModuleData?.videoUrl || activeModuleData?.lessons?.[0]?.videoUrl || course?.trailerUrl || '';
  const lessonBreakdown = Array.isArray(activeModuleData?.lessons) ? activeModuleData.lessons : [];
  const allQuizzes = data?.quizzes ?? [];
  const moduleIdentifiers = [
    ...lessonBreakdown.map((lesson) => lesson.id).filter(Boolean),
    activeModuleData?.videoId,
    activeModuleData?.id,
  ].filter(Boolean);
  const moduleQuiz = activeModuleData?.quiz
    || allQuizzes.find(
      (quizItem) =>
        moduleIdentifiers.includes(quizItem.video_id)
        || moduleIdentifiers.includes(quizItem.quiz_id)
    );
  const hasQuiz = Boolean(moduleQuiz);

  useEffect(() => {
    if (!isAuthenticated) {
      useStore.getState().toggleAuthModal();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    setActiveModule(0);
  }, [courseId]);

  useEffect(() => {
    if (modules.length > 0 && activeModule >= modules.length) {
      setActiveModule(0);
    }
  }, [modules.length, activeModule]);

  useEffect(() => {
    setShowQuiz(false);
  }, [activeModule]);

  if (isLoading) {
    return (
      <div className="section">
        <div className="container">
          <div className="card card--centered card--loading">
            <div className="loading-spinner" />
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="section">
        <div className="container">
          <div className="card card--message">
            <h2 className="section__title">This course is not available</h2>
            <p className="text-muted">We couldn&apos;t find the course you were looking for.</p>
            <button className="button button--primary button--pill" onClick={() => navigate('/courses')}>
              Return to Course List
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container">
        <div className="course-detail__layout">
          <div className="course-detail__column">
            <article className="lesson-card">
              <div className="lesson-card__media">
                {primaryVideo ? (
                  <iframe
                    src={primaryVideo}
                    title={activeModuleData?.title || course.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="lesson-card__placeholder">
                    Video content will appear here once available.
                  </div>
                )}
              </div>

              <header className="lesson-card__header">
                <h1 className="lesson-card__title">{activeModuleData?.title ?? course.title}</h1>
                {activeDescription && <p className="text-muted">{activeDescription}</p>}
              </header>

              <div className="lesson-card__nav">
                <div className="lesson-card__nav-group">
                  <button
                    className="button button--ghost button--sm"
                    disabled={modules.length === 0 || activeModule === 0}
                    onClick={() => {
                      if (modules.length === 0) return;
                      setActiveModule((m) => Math.max(0, m - 1));
                    }}
                  >
                    Previous
                  </button>
                  <button
                    className="button button--ghost button--sm"
                    disabled={modules.length === 0 || activeModule === modules.length - 1}
                    onClick={() => {
                      if (modules.length === 0) return;
                      setActiveModule((m) => Math.min(modules.length - 1, m + 1));
                    }}
                  >
                    Next
                  </button>
                </div>

                {hasQuiz && (
                  <button
                    className="button button--primary button--sm"
                    onClick={() => setShowQuiz(true)}
                  >
                    Take Quiz
                  </button>
                )}
              </div>

              {lessonBreakdown.length > 0 && (
                <div className="lesson-card__lessons">
                  <div className="lesson-card__lessons-header">
                    <span className="lesson-card__lessons-title">Lesson Breakdown</span>
                    <span className="text-muted lesson-card__lessons-count">
                      {lessonBreakdown.length} lesson{lessonBreakdown.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="lesson-card__lesson-list">
                    {lessonBreakdown.map((lesson, idx) => (
                      <div key={lesson.id ?? idx} className="lesson-card__lesson-item">
                        <div className="lesson-card__lesson-meta">
                          <span className="lesson-card__lesson-index">{idx + 1}</span>
                          <div>
                            <p className="lesson-card__lesson-title">{lesson.title}</p>
                            {lesson.objectives && (
                              <p className="lesson-card__lesson-objective text-muted">
                                {lesson.objectives}
                              </p>
                            )}
                          </div>
                        </div>
                        {lesson.duration && (
                          <span className="lesson-card__lesson-duration">{lesson.duration} min</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>

            {showQuiz && hasQuiz && (
              <QuizComponent
                quiz={moduleQuiz}
                onComplete={(isCorrect) => {
                  if (isCorrect && activeModule < modules.length - 1) {
                    setActiveModule((m) => Math.min(modules.length - 1, m + 1));
                  }
                  setShowQuiz(false);
                }}
              />
            )}
          </div>

          <aside className="lesson-sidebar">
            <div>
              <h3 className="lesson-sidebar__heading">Course Content</h3>
              <p className="text-muted lesson-sidebar__description">
                {isEnrolled
                  ? 'Track your progress across each module and revisit lessons anytime.'
                  : 'Preview the modules covered in this course. Enroll to unlock full lessons.'}
              </p>
            </div>

            <div className="lesson-list">
              {modules.length > 0 ? (
                modules.map((module, idx) => (
                  <button
                    key={module.id ?? idx}
                    className={`lesson-list__item ${idx === activeModule ? 'lesson-list__item--active' : ''}`}
                    onClick={() => setActiveModule(idx)}
                    type="button"
                  >
                    <span className="lesson-list__index">{String(idx + 1).padStart(2, '0')}</span>
                    <span className="lesson-list__meta">
                      <span className="lesson-list__title">{module.title}</span>
                      <span className="lesson-list__duration">
                        {module.duration
                          ? `${module.duration} min`
                          : module.readingTime
                            ? `${module.readingTime} min read`
                            : module.lessons?.length
                              ? `${module.lessons.length} lesson${module.lessons.length === 1 ? '' : 's'}`
                              : 'Coming soon'}
                      </span>
                    </span>
                    {idx === activeModule && <span className="chip chip--ghost">Current</span>}
                  </button>
                ))
              ) : (
                <div className="lesson-list__empty">
                  Modules for this course will appear here shortly.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}