import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppData } from '../hooks/useData';
import { useCourseProgress } from '../hooks/useProgress';
import { trackVideoProgress, markLessonComplete } from '../services/progressTracking';
import { QuizComponent } from '../components/Quiz';
import UnitQuiz from '../components/UnitQuiz';
import Comments from '../components/Comments';
import VideoPlayer from '../components/VideoPlayer';
import FlashcardDeck from '../components/FlashcardDeck';
import useStore from '../contexts/store';

export default function CourseDetail() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useAppData();
  const [activeModule, setActiveModule] = useState(0);
  const [activeLesson, setActiveLesson] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [expandedModules, setExpandedModules] = useState(() => new Set([0]));
  const { isAuthenticated, enrolledCourses, user } = useStore();
  const { progress } = useCourseProgress(courseId);

  const course = data?.courses?.find((c) => c.id === courseId);
  const isEnrolled = enrolledCourses.some((c) => c.id === courseId);
  const modules = course?.modules ?? [];
  const activeModuleData = modules[activeModule] ?? null;
  const lessonBreakdown = Array.isArray(activeModuleData?.lessons) ? activeModuleData.lessons : [];
  const activeLessonData = lessonBreakdown[activeLesson] ?? null;
  const activeDescription =
    activeLessonData?.objectives
    ?? activeLessonData?.description
    ?? activeModuleData?.description
    ?? activeModuleData?.objective
    ?? course?.description
    ?? '';
  const primaryVideo =
    activeLessonData?.videoUrl
    || activeModuleData?.videoUrl
    || lessonBreakdown?.[0]?.videoUrl
    || course?.trailerUrl
    || '';
  // Curriculum practice is always available (subject to data availability),
  // so enable Practice regardless of legacy per-video quizzes.
  const hasQuiz = true;

  // Stable thread key per visible video (falls back to module id when needed)
  const threadKey = `comments:${courseId}:${activeLessonData?.id || activeModuleData?.id || 'module'}`;

  // Helpers to navigate across lessons and modules (skip empty modules)
  const getModuleLessons = (idx) => (Array.isArray(modules[idx]?.lessons) ? modules[idx].lessons : []);
  const findPrevTarget = (mIdx, lIdx) => {
    const curLessons = getModuleLessons(mIdx);
    if (curLessons.length > 0 && lIdx > 0) return { module: mIdx, lesson: lIdx - 1 };
    for (let m = mIdx - 1; m >= 0; m--) {
      const lessons = getModuleLessons(m);
      if (lessons.length > 0) return { module: m, lesson: lessons.length - 1 };
    }
    return null;
  };
  const findNextTarget = (mIdx, lIdx) => {
    const curLessons = getModuleLessons(mIdx);
    if (curLessons.length > 0 && lIdx < curLessons.length - 1) return { module: mIdx, lesson: lIdx + 1 };
    for (let m = mIdx + 1; m < modules.length; m++) {
      const lessons = getModuleLessons(m);
      if (lessons.length > 0) return { module: m, lesson: 0 };
    }
    return null;
  };
  const prevTarget = findPrevTarget(activeModule, activeLesson);
  const nextTarget = findNextTarget(activeModule, activeLesson);

  const hydrated = useStore(s => s.hydrated);
  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      useStore.getState().toggleAuthModal();
    }
  }, [hydrated, isAuthenticated]);

  useEffect(() => {
    setActiveModule(0);
    setActiveLesson(0);
    setExpandedModules(new Set([0]));
  }, [courseId]);

  useEffect(() => {
    if (modules.length > 0 && activeModule >= modules.length) {
      setActiveModule(0);
    }
  }, [modules.length, activeModule]);

  useEffect(() => {
    // reset lesson to the first when switching modules
    setActiveLesson(0);
    setShowQuiz(false);
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.add(activeModule);
      return next;
    });
  }, [activeModule]);

  useEffect(() => {
    setShowQuiz(false);
  }, [activeLesson]);

  // Handler to mark lesson as complete
  const handleMarkComplete = async () => {
    if (!user?.uid || !courseId || !activeLessonData?.id) return;
    
    try {
      await markLessonComplete(user.uid, courseId, activeLessonData.id);
    } catch (error) {
      console.error('[CourseDetail] Error marking lesson complete:', error);
    }
  };

  // Check if current lesson is completed
  const isLessonCompleted = progress?.completedLessons?.includes(activeLessonData?.id) || false;

  // Track video view when user spends time on a video lesson
  useEffect(() => {
    if (!user?.uid || !isEnrolled || !activeLessonData || activeLessonData.type !== 'video') {
      return;
    }

    // Mark video as watched after 10 seconds
    const timer = setTimeout(() => {
      trackVideoProgress(user.uid, courseId, activeLessonData.id, {
        watchDuration: 10, // Will be improved with actual video player tracking
        totalDuration: activeLessonData.duration * 60 || 600,
        completed: false
      });
    }, 10000); // 10 seconds

    return () => clearTimeout(timer);
  }, [user?.uid, isEnrolled, activeLessonData, courseId]);

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
              <header className="lesson-card__header">
                <div className="lesson-card__header-content">
                  <h1 className="lesson-card__title">{activeLessonData?.title || activeModuleData?.title || course.name}</h1>
                  {isEnrolled && progress && (
                    <div className="lesson-card__progress-badges">
                      {progress.totalPoints > 0 && (
                        <span className="chip chip--primary">🎯 {progress.totalPoints} pts</span>
                      )}
                      {progress.currentStreak > 0 && (
                        <span className="chip chip--warning">🔥 {progress.currentStreak} day streak</span>
                      )}
                      {progress.completedLessons?.length > 0 && (
                        <span className="chip chip--success">✓ {progress.completedLessons.length} completed</span>
                      )}
                    </div>
                  )}
                </div>
              </header>

              <div className={`lesson-card__media ${activeLessonData?.type === 'quiz' ? 'lesson-card__media--quiz' : ''}`}>
                {activeLessonData?.type === 'quiz' ? (
                  <div className="lesson-card__quizwrap">
                    <UnitQuiz
                      subjectCode={course?.code}
                      chapterNumber={activeModuleData?.unit_no}
                      courseId={courseId}
                      lessonId={activeLessonData?.id}
                    />
                  </div>
                ) : primaryVideo ? (
                  primaryVideo.includes('youtube.com') || primaryVideo.includes('youtu.be') ? (
                    // YouTube iframe (native controls)
                    <iframe
                      src={primaryVideo}
                      title={activeLessonData?.title || activeModuleData?.title || course.name}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{ width: '100%', height: '100%', border: 'none' }}
                    />
                  ) : (
                    // Custom video player for direct video files
                    <VideoPlayer
                      src={primaryVideo}
                      title={activeLessonData?.title || activeModuleData?.title || course.name}
                      onTimeUpdate={(data) => {
                        // Track video progress every 30 seconds
                        if (user?.uid && isEnrolled && Math.floor(data.currentTime) % 30 === 0) {
                          trackVideoProgress(user.uid, courseId, activeLessonData.id, {
                            watchDuration: data.currentTime,
                            totalDuration: data.duration,
                            completed: data.currentTime / data.duration > 0.9,
                          }).catch(err => console.error('Error tracking video:', err));
                        }
                      }}
                      onEnded={() => {
                        // Mark video as watched when ended
                        if (user?.uid && isEnrolled && activeLessonData?.id) {
                          trackVideoProgress(user.uid, courseId, activeLessonData.id, {
                            watchDuration: activeLessonData.duration * 60 || 600,
                            totalDuration: activeLessonData.duration * 60 || 600,
                            completed: true,
                          }).catch(err => console.error('Error tracking video completion:', err));
                        }
                      }}
                    />
                  )
                ) : (
                  <div className="lesson-card__placeholder">
                    Video content will appear here once available.
                  </div>
                )}
              </div>

              {activeDescription && (
                <p className="lesson-card__description text-muted">
                  {activeDescription}
                </p>
              )}

              <div className="lesson-card__nav">
                <div className="lesson-card__nav-group">
                  {prevTarget && (
                    <button
                      className="button button--ghost button--sm"
                      onClick={() => {
                        setActiveModule(prevTarget.module);
                        setActiveLesson(prevTarget.lesson);
                      }}
                    >
                      Previous
                    </button>
                  )}
                  {nextTarget && (
                    <button
                      className="button button--ghost button--sm"
                      onClick={() => {
                        setActiveModule(nextTarget.module);
                        setActiveLesson(nextTarget.lesson);
                      }}
                    >
                      Next
                    </button>
                  )}
                </div>

                <div className="lesson-card__nav-group">
                  {activeLessonData?.type !== 'quiz' && isEnrolled && (
                    <button
                      className={`button button--sm ${isLessonCompleted ? 'button--ghost' : 'button--secondary'}`}
                      onClick={handleMarkComplete}
                      disabled={isLessonCompleted}
                    >
                      {isLessonCompleted ? '✓ Completed' : 'Mark Complete'}
                    </button>
                  )}
                  {hasQuiz && (
                    <>
                      <button
                        className="button button--secondary button--sm"
                        onClick={() => setShowFlashcards(true)}
                      >
                        📇 Flashcards
                      </button>
                      <button
                        className="button button--primary button--sm"
                        onClick={() => setShowQuiz(true)}
                      >
                        Practice
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>

            {showQuiz && hasQuiz && (
              <>
                {console.log('[CourseDetail] Practice button - passing to UnitQuiz:', {
                  subjectCode: course?.code,
                  chapterNumber: activeModuleData?.unit_no,
                  subchapterNumber: activeLessonData?.lesson_no,
                  courseId,
                  activeLessonData
                })}
                <UnitQuiz
                  subjectCode={course?.code}
                  chapterNumber={activeModuleData?.unit_no}
                  subchapterNumber={activeLessonData?.lesson_no}
                  courseId={courseId}
                  onClose={() => setShowQuiz(false)}
                />
              </>
            )}

            {showFlashcards && hasQuiz && (
              <FlashcardDeck
                subjectCode={course?.code}
                chapterNumber={activeModuleData?.unit_no}
                subchapterNumber={activeLessonData?.lesson_no}
                onClose={() => setShowFlashcards(false)}
              />
            )}

            {/* Unit Quiz renders inline in the media area when lesson type is 'quiz' */}
            <Comments
              threadKey={threadKey}
              isAuthenticated={isAuthenticated}
              onRequireAuth={() => useStore.getState().toggleAuthModal()}
            />
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
                modules.map((module, idx) => {
                  const isActiveModule = idx === activeModule;
                  const hasLessons = Array.isArray(module.lessons) && module.lessons.length > 0;
                  const isExpanded = expandedModules.has(idx);
                  return (
                    <div key={module.id ?? idx} className="lesson-list__group">
                      <button
                        className={`lesson-list__item ${isActiveModule ? 'lesson-list__item--active' : ''} ${isExpanded ? 'is-expanded' : ''}`}
                        onClick={() => {
                          if (isActiveModule) {
                            setExpandedModules((prev) => {
                              const next = new Set(prev);
                              if (next.has(idx)) next.delete(idx); else next.add(idx);
                              return next;
                            });
                          } else {
                            setActiveModule(idx);
                            setActiveLesson(0);
                            setExpandedModules((prev) => {
                              const next = new Set(prev);
                              next.add(idx);
                              return next;
                            });
                          }
                        }}
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
                        <span className="lesson-list__chevron" aria-hidden>
                          ▸
                        </span>
                        {isActiveModule && <span className="chip chip--ghost">Current</span>}
                      </button>

                      {isExpanded && hasLessons && (
                        <div className="lesson-list__children">
                          {module.lessons.map((lsn, lidx) => {
                            const isActiveLesson = isActiveModule && lidx === activeLesson;
                            const isCompleted = progress?.completedLessons?.includes(lsn.id) || false;
                            return (
                              <button
                                key={lsn.id ?? `${idx}-${lidx}`}
                                type="button"
                                className={`lesson-list__item ${isActiveLesson ? 'lesson-list__item--active' : ''} ${isCompleted ? 'lesson-list__item--completed' : ''}`}
                                onClick={() => {
                                  setActiveModule(idx);
                                  setActiveLesson(lidx);
                                }}
                              >
                                <span className="lesson-list__index">
                                  {isCompleted ? '✓' : `${idx + 1}.${lidx + 1}`}
                                </span>
                                <span className="lesson-list__meta">
                                  <span className="lesson-list__title">{lsn.title}</span>
                                  <span className="lesson-list__duration">
                                    {lsn.duration ? `${lsn.duration} min` : (lsn.readingTime ? `${lsn.readingTime} min read` : '')}
                                  </span>
                                </span>
                                {isActiveLesson && <span className="chip chip--ghost">Current</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="lesson-list__empty">
                  Modules for this course will appear here shortly.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
      {/* Removed modal overlay; inline rendering used instead */}
    </div>
  );
}