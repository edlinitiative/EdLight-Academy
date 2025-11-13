import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppData } from '../hooks/useData';
import { useCourseProgress } from '../hooks/useProgress';
import { trackVideoProgress, markLessonComplete } from '../services/progressTracking';
import { QuizComponent } from '../components/Quiz';
import UnitQuiz from '../components/UnitQuiz';
import Comments from '../components/Comments';
import FlashcardDeck from '../components/FlashcardDeck';
import YouTubePlayer, { getYouTubeVideoId } from '../components/YouTubePlayer';
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
  const [showSidebar, setShowSidebar] = useState(false); // Mobile sidebar toggle
  const [showComments, setShowComments] = useState(false); // Mobile comments toggle
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
  const primaryVideoRaw =
    activeLessonData?.videoUrl
    || activeModuleData?.videoUrl
    || lessonBreakdown?.[0]?.videoUrl
    || course?.trailerUrl
    || '';
  
  // Check if it's a YouTube URL and extract video ID
  const isYouTubeVideo = primaryVideoRaw && (
    primaryVideoRaw.includes('youtube.com') || 
    primaryVideoRaw.includes('youtu.be')
  );
  const youtubeVideoId = isYouTubeVideo ? getYouTubeVideoId(primaryVideoRaw) : null;
  
  // For non-YouTube videos, keep the original URL
  const primaryVideo = primaryVideoRaw;
  
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

  // Handle YouTube player time updates for progress tracking
  const handleVideoTimeUpdate = ({ currentTime, duration }) => {
    if (!user?.uid || !isEnrolled || !activeLessonData) return;
    
    // Track video progress when user watches 10+ seconds
    if (currentTime >= 10) {
      trackVideoProgress(user.uid, courseId, activeLessonData.id, {
        watchDuration: currentTime,
        totalDuration: duration,
        completed: currentTime >= duration * 0.9 // 90% watched = completed
      });
    }
  };

  // Handle when YouTube video ends
  const handleVideoEnded = () => {
    if (!user?.uid || !isEnrolled || !activeLessonData) return;
    
    // Mark video as fully watched
    trackVideoProgress(user.uid, courseId, activeLessonData.id, {
      watchDuration: activeLessonData.duration * 60 || 600,
      totalDuration: activeLessonData.duration * 60 || 600,
      completed: true
    });
  };

  // Track video view when user spends time on a video lesson (fallback for non-YouTube)
  useEffect(() => {
    if (!user?.uid || !isEnrolled || !activeLessonData || activeLessonData.type !== 'video') {
      return;
    }

    // For non-YouTube videos, mark as watched after 10 seconds
    if (!youtubeVideoId) {
      const timer = setTimeout(() => {
        trackVideoProgress(user.uid, courseId, activeLessonData.id, {
          watchDuration: 10,
          totalDuration: activeLessonData.duration * 60 || 600,
          completed: false
        });
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [activeLessonData, user, isEnrolled, youtubeVideoId]);

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
                    <div className="lesson-card__progress-badges lesson-card__progress-badges--desktop">
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
                
                {/* Mobile: Show Course Content toggle button */}
                <button
                  className="button button--ghost button--sm lesson-card__sidebar-toggle"
                  onClick={() => setShowSidebar(!showSidebar)}
                  type="button"
                >
                  {showSidebar ? '✕ Close' : '📚 Course Content'}
                </button>
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
                  youtubeVideoId ? (
                    <YouTubePlayer
                      key={youtubeVideoId}
                      videoId={youtubeVideoId}
                      title={activeLessonData?.title || activeModuleData?.title || course.name}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onEnded={handleVideoEnded}
                    />
                  ) : (
                    <iframe
                      key={primaryVideo}
                      src={primaryVideo}
                      title={activeLessonData?.title || activeModuleData?.title || course.name}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
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
                {/* Previous/Next Navigation */}
                {(prevTarget || nextTarget) && (
                  <div className="lesson-card__nav-group lesson-card__nav-group--navigation">
                    <button
                      className="button button--ghost button--sm"
                      onClick={() => {
                        if (prevTarget) {
                          setActiveModule(prevTarget.module);
                          setActiveLesson(prevTarget.lesson);
                          setShowSidebar(false);
                        }
                      }}
                      disabled={!prevTarget}
                    >
                      ← Previous
                    </button>
                    <button
                      className="button button--ghost button--sm"
                      onClick={() => {
                        if (nextTarget) {
                          setActiveModule(nextTarget.module);
                          setActiveLesson(nextTarget.lesson);
                          setShowSidebar(false);
                        }
                      }}
                      disabled={!nextTarget}
                    >
                      Next →
                    </button>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="lesson-card__nav-group lesson-card__nav-group--actions">
                  {activeLessonData?.type !== 'quiz' && isEnrolled && (
                    <button
                      className={`button button--sm ${isLessonCompleted ? 'button--success' : 'button--secondary'}`}
                      onClick={handleMarkComplete}
                      disabled={isLessonCompleted}
                    >
                      {isLessonCompleted ? '✓ Completed' : 'Mark Complete'}
                    </button>
                  )}
                  {hasQuiz && (
                    <>
                      <button
                        className="button button--ghost button--sm"
                        onClick={() => setShowFlashcards(true)}
                        title="Study with flashcards"
                      >
                        <span className="button-icon">📇</span>
                        <span className="button-text">Flashcards</span>
                      </button>
                      <button
                        className="button button--primary button--sm"
                        onClick={() => setShowQuiz(true)}
                        title="Practice with quiz"
                      >
                        <span className="button-icon">📝</span>
                        <span className="button-text">Practice</span>
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
            
            {/* Comments Section - Collapsible on Mobile */}
            <div className="lesson-card lesson-card--comments">
              <button
                className="lesson-card__comments-toggle"
                onClick={() => setShowComments(!showComments)}
                type="button"
              >
                <span className="lesson-card__comments-title">
                  💬 Discussion & Comments
                </span>
                <span className="lesson-card__comments-chevron">
                  {showComments ? '▼' : '▶'}
                </span>
              </button>
              
              {showComments && (
                <div className="lesson-card__comments-content">
                  <Comments
                    threadKey={threadKey}
                    isAuthenticated={isAuthenticated}
                    onRequireAuth={() => useStore.getState().toggleAuthModal()}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Collapsible on Mobile */}
          <aside className={`lesson-sidebar ${showSidebar ? 'lesson-sidebar--visible' : ''}`}>
            <div className="lesson-sidebar__header">
              <div>
                <h3 className="lesson-sidebar__heading">Course Content</h3>
                <p className="text-muted lesson-sidebar__description">
                  {isEnrolled
                    ? 'Track your progress across each module and revisit lessons anytime.'
                    : 'Preview the modules covered in this course. Enroll to unlock full lessons.'}
                </p>
              </div>
              <button
                className="lesson-sidebar__close"
                onClick={() => setShowSidebar(false)}
                type="button"
                aria-label="Close sidebar"
              >
                ✕
              </button>
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