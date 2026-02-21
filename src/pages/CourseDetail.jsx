import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppData } from '../hooks/useData';
import { useCourseProgress } from '../hooks/useProgress';
import { trackVideoProgress, markLessonComplete } from '../services/progressTracking';
import UnitQuiz from '../components/UnitQuiz';
import Comments from '../components/Comments';
import FlashcardDeck from '../components/FlashcardDeck';
import YouTubePlayer, { getYouTubeVideoId } from '../components/YouTubePlayer';
import CourseSidebar from '../components/CourseSidebar';
import useStore from '../contexts/store';
import { useTranslation } from 'react-i18next';

export default function CourseDetail() {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useAppData();
  const [activeModule, setActiveModule] = useState(0);
  const [activeLesson, setActiveLesson] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
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
            <h2 className="section__title">{t('courses.notAvailableTitle', 'Ce cours n\'est pas disponible')}</h2>
            <p className="text-muted">{t('courses.notAvailableBody', 'Nous n\'avons pas trouvé le cours que vous cherchez.')}</p>
            <button className="button button--primary button--pill" onClick={() => navigate('/courses')}>
              {t('courses.returnToCatalog', 'Retour au catalogue')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section course-detail">
      <div className="container course-detail__container">
        <div className="course-detail__layout">
          <div className="course-detail__column">
            <article className="lesson-card">
              <header className="lesson-card__header">
                <div className="lesson-card__header-content">
                  <h1
                    className="lesson-card__title"
                    onClick={() => setShowSidebar(true)}
                  >
                    {activeLessonData?.title || activeModuleData?.title || course.name}
                  </h1>
                  {isEnrolled && progress && (
                    <div className="lesson-card__progress-badges lesson-card__progress-badges--desktop">
                      {progress.totalPoints > 0 && (
                        <span className="chip chip--primary">🎯 {progress.totalPoints} {t('common.pointsShort', 'pts')}</span>
                      )}
                      {progress.currentStreak > 0 && (
                        <span className="chip chip--warning">🔥 {progress.currentStreak} {t('courses.dayStreak', 'jours de série')}</span>
                      )}
                      {progress.completedLessons?.length > 0 && (
                        <span className="chip chip--success">✓ {progress.completedLessons.length} {t('courses.completedLower', 'terminés')}</span>
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
                  {showSidebar ? `✕ ${t('common.close', 'Fermer')}` : `📚 ${t('courses.courseContent', 'Contenu du cours')}`}
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
                    {t('courses.videoPlaceholder', 'Le contenu vidéo apparaîtra ici dès qu\'il sera disponible.')}
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
                      className="button button--ghost button--sm lesson-card__nav-flat"
                      onClick={() => {
                        if (prevTarget) {
                          setActiveModule(prevTarget.module);
                          setActiveLesson(prevTarget.lesson);
                          setShowSidebar(false);
                        }
                      }}
                      disabled={!prevTarget}
                    >
                      ← {t('common.previous', 'Précédent')}
                    </button>
                    <button
                      className="button button--ghost button--sm lesson-card__nav-flat"
                      onClick={() => {
                        if (nextTarget) {
                          setActiveModule(nextTarget.module);
                          setActiveLesson(nextTarget.lesson);
                          setShowSidebar(false);
                        }
                      }}
                      disabled={!nextTarget}
                    >
                      {t('common.next', 'Suivant')} →
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
                      {isLessonCompleted ? `✓ ${t('courses.completed', 'Terminé')}` : t('courses.markComplete', 'Marquer comme terminé')}
                    </button>
                  )}
                  {hasQuiz && (
                    <>
                      <button
                        className="button button--ghost button--sm lesson-card__nav-flat"
                        onClick={() => setShowFlashcards(true)}
                        title={t('courses.flashcardsTitle', 'Étudier avec des flashcards')}
                      >
                        <span className="button-text">{t('courses.flashcards', 'Flashcards')}</span>
                      </button>
                      <button
                        className="button button--primary button--sm"
                        onClick={() => setShowQuiz(true)}
                        title={t('courses.practiceTitle', 'S\'entraîner avec un quiz')}
                      >
                        <span className="button-text">{t('courses.practice', 'Exercices')}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>

            {showQuiz && hasQuiz && (
              <>
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
            <div className={`lesson-card lesson-card--comments ${showComments ? 'lesson-card--comments-open' : ''}`}>
              <button
                className="lesson-card__comments-toggle"
                onClick={() => setShowComments(!showComments)}
                type="button"
              >
                <span className="lesson-card__comments-title">
                  💬 {t('courses.discussionComments', 'Discussion & commentaires')}
                </span>
                <span className="lesson-card__comments-chevron">
                  {showComments ? '▼' : '▶'}
                </span>
              </button>
              
              <div className="lesson-card__comments-content">
                <Comments
                  threadKey={threadKey}
                  isAuthenticated={isAuthenticated}
                  onRequireAuth={() => useStore.getState().toggleAuthModal()}
                />
              </div>
            </div>
          </div>

          {/* Sidebar - extracted into CourseSidebar component */}
          <CourseSidebar
            courseId={courseId}
            modules={modules}
            activeModule={activeModule}
            activeLesson={activeLesson}
            progress={progress}
            isEnrolled={isEnrolled}
            isOpen={showSidebar}
            onOpenChange={setShowSidebar}
            onSelectLesson={(moduleIdx, lessonIdx) => {
              setActiveModule(moduleIdx);
              setActiveLesson(lessonIdx);
            }}
          />
        </div>
      </div>
      {/* Removed modal overlay; inline rendering used instead */}
    </div>
  );
}