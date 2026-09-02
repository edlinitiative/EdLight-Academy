import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Target, Flame, Check, X, BookOpen, MessageCircle, ChevronLeft } from 'lucide-react';
import { useAppData, useCourses } from '../hooks/useData';
import { useCourseProgress } from '../hooks/useProgress';
import { trackVideoProgress, markLessonComplete } from '../services/progressTracking';
import UnitQuiz from '../components/UnitQuiz';
import Comments from '../components/Comments';
import FlashcardDeck from '../components/FlashcardDeck';
import YouTubePlayer, { getYouTubeVideoId } from '../components/YouTubePlayer';
import CourseSidebar from '../components/CourseSidebar';
import CourseOverview from '../components/CourseOverview';
import { ErrorState } from '../components/StateViews';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { useFocusMode } from '../hooks/useFocusMode';
import useStore, { FREE_VIDEO_LIMIT } from '../contexts/store';
import { chapterTestLessonMap, lessonMastery, masteryNextStep, summarize } from '../../shared/mastery';
import { useCourseMastery } from '../hooks/useMastery';
import MasteryBadge from '../components/MasteryBadge';
import ChapterTestCard from '../components/ChapterTestCard';
import { useTranslation } from 'react-i18next';

// ── Video resume position ("reprendre la vidéo") ───────────────────────────
// Persist the last playback second per lesson in localStorage so reopening a
// lesson resumes the video where the learner stopped. Kept local + tiny so it
// works for signed-out free-preview viewers too, with no backend round-trip.
const VIDEO_POS_KEY = 'edlight-video-positions';

function readVideoPositions() {
  try {
    return JSON.parse(localStorage.getItem(VIDEO_POS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveVideoPosition(key, t, d) {
  if (!key || !Number.isFinite(t)) return;
  try {
    const all = readVideoPositions();
    if (t < 5 || (d && t > d * 0.95)) {
      // Near the start or essentially finished — drop any resume point.
      delete all[key];
    } else {
      all[key] = { t: Math.floor(t), d: d ? Math.floor(d) : 0 };
    }
    // Bound the map so it can never grow without limit.
    const keys = Object.keys(all);
    if (keys.length > 200) delete all[keys[0]];
    localStorage.setItem(VIDEO_POS_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable / quota exceeded — resume is best-effort */
  }
}

function getResumeSeconds(key) {
  if (!key) return 0;
  const rec = readVideoPositions()[key];
  if (!rec || !Number.isFinite(rec.t)) return 0;
  if (rec.t < 15) return 0; // ignore trivially short watches
  if (rec.d && rec.t > rec.d * 0.95) return 0; // basically finished
  return rec.t;
}

export default function CourseDetail() {
  const { t, i18n } = useTranslation();
  const isCreole = i18n.language === 'ht';
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, isFetching, refetch } = useAppData();
  // The lightweight catalog hydrates instantly from localStorage and already
  // carries the full unit/lesson structure — enough to paint this page while
  // the heavy appData query (video URLs, quiz payloads) loads in the
  // background. Clicking a course card should never show a full-page skeleton.
  const { data: catalog } = useCourses();
  const [view, setView] = useState('overview'); // 'overview' | 'lesson'
  const [activeModule, setActiveModule] = useState(0);
  const [activeLesson, setActiveLesson] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false); // Mobile sidebar toggle
  const [showComments, setShowComments] = useState(false); // Mobile comments toggle
  const { isAuthenticated, enrolledCourses, user } = useStore();
  const freeVideoIds = useStore((s) => s.freeVideoIds);
  const recordActivity = useStore((s) => s.recordActivity);
  const { progress } = useCourseProgress(courseId);

  const enrichedCourse = data?.courses?.find((c) => c.id === courseId);
  const course = enrichedCourse ?? catalog?.find((c) => c.id === courseId);
  // True while we're showing the catalog version and the enriched one
  // (real video URLs) is still on its way.
  const enriching = !enrichedCourse && (isLoading || isFetching);
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
  const primaryVideoRawCandidate =
    activeLessonData?.videoUrl
    || activeModuleData?.videoUrl
    || lessonBreakdown?.[0]?.videoUrl
    || course?.trailerUrl
    || '';
  // The catalog-only course carries a literal ".../embed/placeholder" URL for
  // video lessons — never feed that to the player; wait for enrichment.
  const primaryVideoRaw = primaryVideoRawCandidate.endsWith('/placeholder')
    ? ''
    : primaryVideoRawCandidate;
  
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

  // lesson_no -> lessonId for the lessons of the ACTIVE unit. This is what lets
  // a chapter test promote the lessons it drew from: the quiz bank tags every
  // question with a Subchapter_Number, and this map turns that number back into
  // the lesson it belongs to. Without it `mastered` is unreachable.
  //
  // lesson_no is only populated on lessons enrichment matched to a video row, so
  // fall back to the `-L<n>` suffix of the lesson id exactly as dataService does
  // — otherwise a course whose videos haven't been enriched yet would yield an
  // empty map and silently never promote anything.
  // Null rather than an empty map, so UnitQuiz can tell "this isn't a chapter
  // test" from "this unit has no attributable lessons" and skip the write.
  const chapterTestLessons = useMemo(() => {
    const map = chapterTestLessonMap(lessonBreakdown);
    return Object.keys(map).length > 0 ? map : null;
  }, [lessonBreakdown]);

  // ── The next step for THIS lesson ──────────────────────────────────────────
  // Mastery comes from users/{uid}/mastery/lessons — the document the MOBILE
  // app writes too — NOT from this course's progress doc. Reading it off
  // `progress` would look free and would cap every lesson at `seen`, since
  // completedLessons is the only rung that array can prove. One read here,
  // handed down to the sidebar and the overview.
  const { mastery, refresh: refreshMastery } = useCourseMastery(courseId);
  const activeLessonLevel = lessonMastery(mastery[activeLessonData?.id]);

  // Mastery across the ACTIVE unit — the chapter test's gate and its scope.
  const unitLessonIds = useMemo(
    () => lessonBreakdown.map((l) => l?.id).filter(Boolean),
    [lessonBreakdown],
  );
  const unitMastery = useMemo(() => summarize(unitLessonIds, mastery), [unitLessonIds, mastery]);

  // Some units have a chapter test authored as a `type: 'quiz'` lesson (only
  // phys-ns2/3/4 do). Where one exists we send the student to it rather than
  // opening a second, parallel test — one entry point per unit either way.
  const chapterTestLessonIndex = useMemo(
    () => lessonBreakdown.findIndex((l) => l?.type === 'quiz'),
    [lessonBreakdown],
  );
  const [showChapterTest, setShowChapterTest] = useState(false);

  const startChapterTest = () => {
    setShowQuiz(false);
    setShowFlashcards(false);
    if (chapterTestLessonIndex >= 0) {
      // Authored test: it IS a lesson, so just go to it.
      setActiveLesson(chapterTestLessonIndex);
      setShowChapterTest(false);
    } else {
      // No authored test — draw one from the bank for this unit. Every subject
      // has unit-wide questions, so this is available everywhere.
      setShowChapterTest(true);
    }
  };

  // Close the test whenever the student moves to another unit, so it can't
  // stay open over a unit it wasn't drawn from.
  useEffect(() => { setShowChapterTest(false); }, [activeModule]);

  const nextStepLabel = masteryNextStep(activeLessonLevel, isCreole);

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

  // The lesson view is an immersive, heads-down task (sheds the bottom tab bar +
  // footer); the overview is a browsing screen that keeps the global chrome.
  useFocusMode(view === 'lesson');

  // Where "Reprendre" should land: the first lesson the learner hasn't completed
  // yet (falls back to the very first lesson for a fresh start).
  const resumeTarget = useMemo(() => {
    for (let m = 0; m < modules.length; m++) {
      const lessons = getModuleLessons(m);
      for (let l = 0; l < lessons.length; l++) {
        if (!progress?.completedLessons?.includes(lessons[l]?.id)) return { module: m, lesson: l };
      }
    }
    return { module: 0, lesson: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, progress?.completedLessons]);
  const hasProgress = (progress?.completedLessons?.length || 0) > 0;

  const hydrated = useStore(s => s.hydrated);

  // Free-preview gating: signed-out visitors may watch up to FREE_VIDEO_LIMIT
  // distinct video lessons before being asked to create an account.
  const isVideoLesson = !!activeLessonData
    && activeLessonData.type !== 'quiz'
    && !!primaryVideo;
  const currentVideoKey = isVideoLesson ? (activeLessonData?.id || primaryVideoRaw) : null;
  const isCurrentVideoCounted = !!currentVideoKey && freeVideoIds.includes(currentVideoKey);
  const videoLocked = !isAuthenticated
    && isVideoLesson
    && !isCurrentVideoCounted
    && freeVideoIds.length >= FREE_VIDEO_LIMIT;
  const freeVideosRemaining = Math.max(0, FREE_VIDEO_LIMIT - freeVideoIds.length);

  useEffect(() => {
    if (view !== 'lesson') return;
    if (!hydrated || isAuthenticated) return;
    if (!isVideoLesson || !currentVideoKey) return;
    if (isCurrentVideoCounted) return;
    if (freeVideoIds.length >= FREE_VIDEO_LIMIT) {
      // Reached the free limit on a brand-new video — prompt sign up.
      useStore.getState().setShowAuthModal(true);
      return;
    }
    // Count this video toward the free preview allowance.
    useStore.getState().recordFreeVideoView(currentVideoKey);
  }, [view, hydrated, isAuthenticated, isVideoLesson, currentVideoKey, isCurrentVideoCounted, freeVideoIds.length]);

  // Prevent background page scrolling when the mobile course drawer is open
  useEffect(() => {
    const isMobile = typeof window !== 'undefined'
      ? window.matchMedia?.('(max-width: 960px)')?.matches
      : false;

    if (isMobile && showSidebar) document.body.classList.add('no-scroll');
    else document.body.classList.remove('no-scroll');

    return () => document.body.classList.remove('no-scroll');
  }, [showSidebar]);

  useEffect(() => {
    setView('overview');
    setActiveModule(0);
    setActiveLesson(0);
    setShowQuiz(false);
    setShowFlashcards(false);
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
    setShowFlashcards(false);
  }, [activeModule]);

  useEffect(() => {
    setShowQuiz(false);
    setShowFlashcards(false);
  }, [activeLesson]);

  // Remember where the learner was so Home can offer "Reprendre où vous étiez".
  useEffect(() => {
    if (!course || !courseId) return;
    const courseName = course.name || course.title || '';
    const lessonTitle = activeLessonData?.title || activeModuleData?.title || '';
    recordActivity({
      type: 'lesson',
      path: `/courses/${courseId}`,
      title: courseName || lessonTitle || String(courseId),
      subtitle: lessonTitle && lessonTitle !== courseName ? lessonTitle : undefined,
      ts: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, course?.name, activeModuleData?.id, activeLessonData?.id]);

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

  // Per-lesson key for saving/restoring the video position.
  const positionKey = courseId && activeLessonData?.id ? `${courseId}:${activeLessonData.id}` : '';
  const lastSavedRef = useRef({ key: '', t: -100 });

  // Where to resume this lesson's video (0 if none / completed). Recomputed when
  // the lesson changes; the player remounts per video via its key.
  const resumeSeconds = useMemo(() => {
    if (!positionKey || isLessonCompleted) return 0;
    return getResumeSeconds(positionKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionKey, youtubeVideoId, isLessonCompleted]);

  // Handle YouTube player time updates for progress tracking
  const handleVideoTimeUpdate = ({ currentTime, duration }) => {
    // Persist resume position for everyone (throttled to ~5s), independent of
    // enrolment/auth so free-preview viewers also get resume.
    if (positionKey && Number.isFinite(currentTime)) {
      const last = lastSavedRef.current;
      if (last.key !== positionKey || Math.abs(currentTime - last.t) >= 5) {
        lastSavedRef.current = { key: positionKey, t: currentTime };
        saveVideoPosition(positionKey, currentTime, duration);
      }
    }

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

  if (isLoading && !course) {
    return (
      <div className="section course-detail">
        <div className="container course-detail__container">
          <div className="course-overview" aria-busy="true">
            <Skeleton width={120} height={16} radius={999} style={{ marginBottom: '1.25rem' }} />
            <header className="course-overview__hero">
              <div className="skeleton-row" style={{ marginBottom: '0.9rem' }}>
                <Skeleton width={96} height={24} radius={999} />
                <Skeleton width={64} height={24} radius={999} />
              </div>
              <Skeleton width="70%" height={34} style={{ marginBottom: '0.9rem' }} />
              <SkeletonText lines={2} lastWidth="80%" />
              <div className="skeleton-row" style={{ marginTop: '1.1rem', gap: '1.25rem' }}>
                <Skeleton width={110} height={18} />
                <Skeleton width={110} height={18} />
                <Skeleton width={90} height={18} />
              </div>
              <Skeleton width="100%" height={48} radius={12} style={{ marginTop: '1.5rem', maxWidth: 320 }} />
            </header>
            <section className="course-overview__content">
              <Skeleton width={180} height={24} style={{ marginBottom: '1rem' }} />
              <div className="skeleton-lines" style={{ gap: '0.75rem' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} width="100%" height={64} radius={12} />
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  if (isError && !data && !course) {
    return (
      <div className="section">
        <div className="container">
          <ErrorState onRetry={() => refetch()} retrying={isFetching} />
        </div>
      </div>
    );
  }

  if (!course && (isLoading || isFetching)) {
    // Neither the catalog nor appData knows this course yet, but a fetch is
    // still in flight — don't flash "course not found".
    return null;
  }

  if (!course) {
    return (
      <div className="section">
        <div className="container">
          <div className="card card--message">
            <h2 className="section__title">{t('courses.notAvailableTitle', 'Ce cours n\'est pas disponible')}</h2>
            <p className="text-muted">{t('courses.notAvailableBody', 'Nous n\'avons pas trouvé le cours que vous cherchez.')}</p>
            <button className="button button--primary" onClick={() => navigate('/courses')}>
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
        {view === 'overview' ? (
          <CourseOverview
            course={course}
            modules={modules}
            progress={progress}
            mastery={mastery}
            isEnrolled={isEnrolled}
            resumeTarget={resumeTarget}
            hasProgress={hasProgress}
            onStart={() => {
              setActiveModule(resumeTarget.module);
              setActiveLesson(resumeTarget.lesson);
              setView('lesson');
            }}
            onSelectModule={(mIdx) => {
              setActiveModule(mIdx);
              setActiveLesson(0);
              setView('lesson');
            }}
          />
        ) : (
        <div className="course-detail__layout">
          <div className="course-detail__column">
            <button
              type="button"
              className="course-detail__back"
              onClick={() => setView('overview')}
            >
              <ChevronLeft size={16} /> {course.name || course.title}
            </button>
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
                        <span className="chip chip--primary"><Target size={14} /> {progress.totalPoints} {t('common.pointsShort', 'pts')}</span>
                      )}
                      {progress.currentStreak > 0 && (
                        <span className="chip chip--warning"><Flame size={14} /> {progress.currentStreak} {t('courses.dayStreak', 'jours de série')}</span>
                      )}
                      {progress.completedLessons?.length > 0 && (
                        <span className="chip chip--success"><Check size={14} /> {progress.completedLessons.length} {t('courses.completedLower', 'terminés')}</span>
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
                  {showSidebar ? <><X size={14} /> {t('common.close', 'Fermer')}</> : <><BookOpen size={14} /> {t('courses.courseContent', 'Contenu du cours')}</>}
                </button>
              </header>

              <div className={`lesson-card__media ${activeLessonData?.type === 'quiz' ? 'lesson-card__media--quiz' : ''}`}>
                {videoLocked ? (
                  <div className="lesson-card__gate">
                    <div className="lesson-card__gate-icon" aria-hidden>🔒</div>
                    <h3 className="lesson-card__gate-title">
                      {t('courses.gateTitle', 'Créez un compte gratuit pour continuer')}
                    </h3>
                    <p className="lesson-card__gate-text">
                      {t('courses.gateText', 'Vous avez profité de vos 3 vidéos gratuites. Inscrivez-vous gratuitement pour débloquer tous les cours, quiz et examens.')}
                    </p>
                    <button
                      className="button button--primary"
                      onClick={() => useStore.getState().setShowAuthModal(true)}
                    >
                      {t('courses.gateCta', 'Créer un compte gratuit')}
                    </button>
                  </div>
                ) : activeLessonData?.type === 'quiz' ? (
                  <div className="lesson-card__quizwrap">
                    {/* THE CHAPTER TEST. A quiz-type lesson draws from the whole
                        unit (no subchapterNumber), which is exactly the
                        condition the top rung asks for: passing chapterTestLessons
                        lets every lesson the test happened to draw from be
                        promoted, so `mastered` means the student still knew it
                        when it wasn't the only thing in front of them. */}
                    <UnitQuiz
                      subjectCode={course?.code}
                      unitId={undefined}
                      chapterNumber={activeModuleData?.unit_no}
                      subchapterNumber={undefined}
                      courseId={courseId}
                      lessonId={activeLessonData?.id}
                      chapterTestLessons={chapterTestLessons}
                      onClose={undefined}
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
                      startSeconds={resumeSeconds}
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
                ) : enriching ? (
                  // Video URL is still loading (catalog paint, appData in flight).
                  <Skeleton width="100%" height="100%" radius={0} />
                ) : (
                  <div className="lesson-card__placeholder">
                    {t('courses.videoPlaceholder', 'Le contenu vidéo apparaîtra ici dès qu\'il sera disponible.')}
                  </div>
                )}
              </div>

              {!isAuthenticated && !videoLocked && isVideoLesson && (
                <div className="lesson-card__free-banner">
                  {freeVideosRemaining > 0
                    ? t('courses.freeRemaining', {
                        count: freeVideosRemaining,
                        defaultValue: `Aperçu gratuit · ${freeVideosRemaining} vidéo(s) restante(s). Inscrivez-vous pour un accès illimité.`,
                      })
                    : t('courses.freeLast', 'Dernière vidéo gratuite. Inscrivez-vous pour un accès illimité.')}
                  <button
                    type="button"
                    className="lesson-card__free-banner-link"
                    onClick={() => useStore.getState().setShowAuthModal(true)}
                  >
                    {t('courses.signUpFree', 'Créer un compte gratuit')}
                  </button>
                </div>
              )}

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

                {/* The next step for this lesson. Sits directly above the
                    actions so the guidance and the button that satisfies it are
                    read together. Hidden entirely at `none` — telling someone
                    who just opened a lesson to "regarde la leçon" is noise, the
                    video is already playing in front of them. */}
                {isEnrolled && activeLessonData?.type !== 'quiz' && activeLessonLevel !== 'none' && (
                  <div className="lesson-card__mastery">
                    <MasteryBadge level={activeLessonLevel} isCreole={isCreole} />
                    <span className="lesson-card__mastery-next">
                      {nextStepLabel || t('courses.masteryDone', 'Rien à revoir ici.')}
                    </span>
                    {activeLessonLevel === 'proficient' && (
                      <button
                        type="button"
                        className="lesson-card__mastery-cta"
                        onClick={startChapterTest}
                      >
                        {t('courses.goToChapterTest', 'Test du chapitre')}
                      </button>
                    )}
                  </div>
                )}

                {/* The chapter test for this unit — the only route to
                    `mastered`. A unit-level action rather than a row in the
                    lesson list: adding a lesson would inflate every course's
                    lesson denominator and drop existing students' progress
                    percentages, and a test isn't a lesson anyway. */}
                {isEnrolled && activeLessonData?.type !== 'quiz' && !showChapterTest && (
                  <ChapterTestCard
                    summary={unitMastery}
                    unitTitle={activeModuleData?.title}
                    onStart={startChapterTest}
                  />
                )}

                {/* Action Buttons */}
                <div className="lesson-card__nav-group lesson-card__nav-group--actions">
                  {activeLessonData?.type !== 'quiz' && isEnrolled && (
                    <button
                      className={`button button--sm ${isLessonCompleted ? 'button--success' : 'button--secondary'}`}
                      onClick={handleMarkComplete}
                      disabled={isLessonCompleted}
                    >
                      {isLessonCompleted ? <><Check size={14} /> {t('courses.completed', 'Terminé')}</> : t('courses.markComplete', 'Marquer comme terminé')}
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

            {showChapterTest && (
              <UnitQuiz
                subjectCode={course?.code}
                unitId={undefined}
                chapterNumber={activeModuleData?.unit_no}
                /* No subchapterNumber: the test draws from the WHOLE unit,
                   which is what makes passing it worth the top rung. */
                subchapterNumber={undefined}
                courseId={courseId}
                /* Not a lesson, so it scores no lesson of its own. */
                lessonId={undefined}
                chapterTestLessons={chapterTestLessons}
                limit={12}
                onClose={() => { setShowChapterTest(false); refreshMastery(); }}
              />
            )}

            {showQuiz && hasQuiz && (
              <>
                {/* The exercises for THIS lesson. lessonId is what attributes
                    the score to the lesson, so it can climb the mastery
                    ladder — it used to be undefined, which is why the score
                    was computed and then dropped. */}
                <UnitQuiz
                  subjectCode={course?.code}
                  unitId={undefined}
                  chapterNumber={activeModuleData?.unit_no}
                  subchapterNumber={activeLessonData?.lesson_no}
                  courseId={courseId}
                  lessonId={activeLessonData?.id}
                  onClose={() => { setShowQuiz(false); refreshMastery(); }}
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
                  <MessageCircle size={18} /> {t('courses.discussionComments', 'Discussion & commentaires')}
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
            mastery={mastery}
            isEnrolled={isEnrolled}
            isOpen={showSidebar}
            onOpenChange={setShowSidebar}
            onSelectLesson={(moduleIdx, lessonIdx) => {
              setActiveModule(moduleIdx);
              setActiveLesson(lessonIdx);
            }}
          />
        </div>
        )}
      </div>
      {/* Removed modal overlay; inline rendering used instead */}
    </div>
  );
}