import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Check, BookOpen, MessageCircle, ChevronLeft, ChevronRight, ChevronDown, WifiOff, Lock } from '../components/icons';
import { useAppData, useCourses } from '../hooks/useData';
import { useCourseProgress } from '../hooks/useProgress';
import YouTubePlayer, { getYouTubeVideoId } from '../components/YouTubePlayer';
import CourseSidebar from '../components/CourseSidebar';
import CourseOverview from '../components/CourseOverview';
import { ErrorState } from '../components/StateViews';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { useFocusMode } from '../hooks/useFocusMode';
import useStore, { FREE_VIDEO_LIMIT } from '../contexts/store';
import { chapterTestLessonMap, lessonMastery, masteryNextStep, summarize } from '../../shared/mastery';
import { useCourseMastery } from '../hooks/useMastery';
import { clearVideoPosition, resumeSecondsFor, saveVideoPosition } from '../utils/videoPositions';
import MasteryBadge from '../components/MasteryBadge';
import ChapterTestCard from '../components/ChapterTestCard';
import { useAskSandra, SandraFocusPanel } from '../components/SandraWidget';
import { useTranslation } from 'react-i18next';
import './CourseDetail.css';
import LessonVideoFrame, { lessonVideoWatchUrl } from '../components/LessonVideoFrame';
import { displayCourseName } from '../utils/courseName';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { EVIDENCE, trackJourney } from '../utils/learningJourney';
import { useLessonCompletion, PENDING } from '../components/journey/lesson/useLessonCompletion';
import LessonCompleteAction from '../components/journey/lesson/LessonCompleteAction';
import LessonPracticeCard from '../components/journey/lesson/LessonPracticeCard';
import { pickPreviewQuestion, sessionQuestionCount } from '../components/journey/lesson/previewQuestion';
import SubjectFrame from '../components/journey/media/SubjectFrame';
import { lessonFrame } from '../utils/lessonFrames';
import { authoredDescription } from '../utils/lessonCopy';
import { practiceHref } from '../utils/learningJourney';
import '../components/journey/lesson/lessonPage.css';
import { chapterPractice, lessonQuestionCount } from '../components/journey/lesson/chapterPractice';
import { catalogReturnPath, levelFromCourseId } from '../components/journey/lesson/catalogReturn';

// Only the lesson view uses these. Between them they pull in KaTeX and the
// markdown stack (~120 KB gzipped), which delayed the course overview — the
// cover, modules and "Commencer" button — by that much on a slow connection.
const UnitQuiz = lazyWithRetry(() => import('../components/UnitQuiz'));
const Comments = lazyWithRetry(() => import('../components/Comments'));
const FlashcardDeck = lazyWithRetry(() => import('../components/FlashcardDeck'));
const InstructionRenderer = lazyWithRetry(() => import('../components/InstructionRenderer'));

// Writes only happen for a signed-in student watching or finishing a lesson,
// so progressTracking (and the Firestore SDK behind it) loads on first use
// rather than holding up the course overview for every visitor.
const loadProgressTracking = () => import('../services/progressTracking');
const trackVideoProgress = (...args: Parameters<typeof import('../services/progressTracking').trackVideoProgress>) =>
  loadProgressTracking().then((m) => m.trackVideoProgress(...args));
// The completion write that REPORTS its outcome (the older markLessonComplete
// swallows every error, so the screen could not tell saved from failed).
const confirmLessonComplete = (uid: string, courseId: string, lessonId: string) =>
  loadProgressTracking().then((m) => m.confirmLessonComplete(uid, courseId, lessonId));

// ── Video resume position ("reprendre la vidéo") ───────────────────────────
// The last playback second per lesson, in localStorage — one bucket per
// student (guests share a guest bucket), see utils/videoPositions.ts. Local +
// tiny so it works for signed-out free-preview viewers too, with no backend
// round-trip.

/** m:ss, for telling the learner exactly where playback resumed. */
function formatClock(total) {
  const s = Math.max(0, Math.floor(Number(total) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A lesson's length in minutes, or 0 when it only carries the data layer's
 *  15-minute fallback (catalog duration placeholder). */
function realMinutes(d: unknown): number {
  const m = parseInt(String(d ?? ''), 10);
  return Number.isFinite(m) && m > 0 && m !== 15 ? m : 0;
}


/** Does this text actually need the Markdown/KaTeX renderer? Maths, or any
 *  deliberate markup (emphasis, a heading, a bullet or numbered line, a
 *  table, a link). Plain sentences do not, and sending them through gains
 *  nothing while risking a rewrite of the author's words. */
function hasRichText(text: string) {
  if (!text) return false;
  if (/\$|\\\(|\\\[/.test(text)) return true; // $x^2$, \( \), \[ \]
  if (/(\*\*|__|`|\|)/.test(text)) return true; // emphasis, code, table
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true; // link
  return /^\s{0,3}([-*+]\s|#{1,6}\s|\d{1,2}[.)]\s)/m.test(text); // list / heading line
}

export default function CourseDetail() {
  const { t, i18n } = useTranslation();
  const isCreole = i18n.language === 'ht';
  /** Inline bilingual copy, as elsewhere in this view: the `ht` resource
   *  bundle doesn't carry the lesson-view keys, so a `t()` default would show
   *  French to a Creole reader. FR first, Kreyòl second. */
  const L = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { courseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading, isError, isFetching, refetch } = useAppData();
  // The lightweight catalog hydrates instantly from localStorage and already
  // carries the full unit/lesson structure — enough to paint this page while
  // the heavy appData query (video URLs, quiz payloads) loads in the
  // background. Clicking a course card should never show a full-page skeleton.
  const { data: catalog } = useCourses();
  const queryClient = useQueryClient();
  const [view, setView] = useState('overview'); // 'overview' | 'lesson'
  const [activeModule, setActiveModule] = useState(0);
  const [activeLesson, setActiveLesson] = useState(0);
  // Deep-link restore bookkeeping (see "Relaunch / deep link" below).
  // `restoredForRef`: the course whose `?lesson=` has been honoured.
  // `pendingRestoreRef`: the lesson id the restore just asked for, until the
  // view has actually switched to it — the URL sync must not run in between.
  const restoredForRef = useRef<string | null>(null);
  const pendingRestoreRef = useRef<string | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false); // Mobile sidebar toggle
  const [showComments, setShowComments] = useState(false); // Mobile comments toggle
  // Bumped by the video's "Réessayer": remounts the frame, nothing else.
  const [videoRetry, setVideoRetry] = useState(0);
  // Whether the real provider player is on screen (after the press).
  const [videoPlaying, setVideoPlaying] = useState(false);
  useEffect(() => { setVideoPlaying(false); }, [activeModule, activeLesson, courseId]);
  const { isAuthenticated, enrolledCourses, user } = useStore();
  // Sandra's own public API (`src/components/SandraWidget`): it composes the
  // grounding, and it is the thing that knows whether she is allowed to help
  // on this screen. The lesson used to poke `setSandraAsk` with a hand-built
  // sentence, which bypassed both.
  const { available: sandraAvailable, reason: sandraReason, ask: askSandra } = useAskSandra();
  const freeVideoIds = useStore((s) => s.freeVideoIds);
  const recordActivity = useStore((s) => s.recordActivity);
  const { progress, failed: progressFailed, retry: retryProgress } = useCourseProgress(courseId);

  // Connectivity, used for honest copy only (the app-wide NetworkStatus banner
  // owns the global message). A queued write must not be reported as saved.
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false,
  );
  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ── Completion, confirmed ──────────────────────────────────────────────────
  // `useCourseProgress` reads the progress document ONCE per course, so a
  // lesson marked complete in this session would otherwise never show as
  // complete until a reload. `confirmedIds` holds only ids whose write the
  // server has ACKNOWLEDGED, so it echoes the authoritative document rather
  // than inventing a second progress model. The hook also owns the honest
  // save states (saving / slow / queued / failed) and the duplicate guard —
  // see components/journey/lesson/useLessonCompletion.ts.
  const completion = useLessonCompletion({
    uid: user?.uid,
    courseId,
    offline,
    save: confirmLessonComplete,
    onConfirmed: () => {
      // `confirmLessonComplete` also advances the global streak.
      queryClient.invalidateQueries({ queryKey: ['global-streak'] });
    },
  });
  const completedIds = useMemo(() => {
    const ids = new Set<string>(progress?.completedLessons || []);
    completion.confirmedIds.forEach((id) => ids.add(id));
    return ids;
  }, [progress?.completedLessons, completion.confirmedIds]);
  // What the lesson list is handed: the same document, plus this session's
  // confirmed writes, so the outline's ticks agree with the lesson screen.
  const progressView = useMemo(
    () => (completion.confirmedIds.size > 0 ? { ...(progress || {}), completedLessons: [...completedIds] } : progress),
    [progress, completion.confirmedIds, completedIds],
  );

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
  // The lesson's own text only — the course summary is not lesson context —
  // and never the generated "Leçon « … » du cours de … — chapitre …" line,
  // which repeats the crumbs above it (RECHECK item 4).
  const activeDescription = authoredDescription(
    activeLessonData?.objectives
    || activeLessonData?.description
    || activeModuleData?.description
    || activeModuleData?.objective
    || '',
  ) || '';
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
  const { mastery, failed: masteryFailed, refresh: refreshMastery } = useCourseMastery(courseId);
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
      goToLesson(activeModule, chapterTestLessonIndex);
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

  /** What an "Ask Sandra" from this lesson names — unit and lesson as the
   *  topic, the course by name. It is what the note under the button promises
   *  she is told, so the two must stay the same thing. */
  const lessonAskTopic = [activeModuleData?.title, activeLessonData?.title]
    .filter(Boolean)
    .join(' · ') || String(courseId);

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

  // ── Going to a specific lesson ─────────────────────────────────────────────
  // Module and lesson always change TOGETHER, in one commit. There used to be
  // an effect that reset the lesson to 0 whenever the module changed, with a
  // ref to tell it "this one was deliberate" — and that pair is what broke the
  // deep link: when the course was already cached, the restore, the module
  // effect and the lesson effect all ran in the same mount commit, the lesson
  // effect wiped the ref, and the next render reset "Unité 3 · Leçon 4" to
  // Leçon 1. Every module change now names its lesson, so no reset is needed.
  const goToLesson = (mIdx, lIdx) => {
    setActiveModule(mIdx);
    setActiveLesson(lIdx);
  };

  /** First lesson of a module the student hasn't finished — so opening a
   *  chapter resumes it instead of restarting it at lesson 1. */
  const firstUnfinishedIn = (mIdx) => {
    const lessons = getModuleLessons(mIdx);
    const idx = lessons.findIndex((l) => l?.id && !completedIds.has(l.id));
    return idx >= 0 ? idx : 0;
  };

  // The lesson view is an immersive, heads-down task (sheds the bottom tab bar +
  // footer); the overview is a browsing screen that keeps the global chrome.
  useFocusMode(view === 'lesson');

  // Where "Reprendre" should land: the first lesson the learner hasn't completed
  // yet (falls back to the very first lesson for a fresh start).
  const resumeTarget = useMemo(() => {
    for (let m = 0; m < modules.length; m++) {
      const lessons = getModuleLessons(m);
      for (let l = 0; l < lessons.length; l++) {
        if (!completedIds.has(lessons[l]?.id)) return { module: m, lesson: l };
      }
    }
    return { module: 0, lesson: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, completedIds]);
  const hasProgress = completedIds.size > 0;

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

  // Declared BEFORE the restore below, which it must precede: it hands the
  // new course a clean slate, and the restore then opens the linked lesson.
  // It also re-arms that restore. React's StrictMode (dev) runs every mount
  // effect twice; with a one-shot "already restored" ref the second pass reset
  // the view to the overview and the restore, thinking its job done, never
  // ran again — the audit's "Reprendre" link landed on the course overview.
  useEffect(() => {
    restoredForRef.current = null;
    pendingRestoreRef.current = null;
    setView('overview');
    setActiveModule(0);
    setActiveLesson(0);
    setShowQuiz(false);
    setShowFlashcards(false);
  }, [courseId]);

  useEffect(() => {
    if (modules.length > 0 && activeModule >= modules.length) {
      setActiveModule(0);
      setActiveLesson(0);
    }
  }, [modules.length, activeModule]);

  // ── Relaunch / deep link: /courses/:courseId?lesson=<lessonId> ────────────
  // Which lesson is open lived only in component state, so a reload, a shared
  // link or a tap on Home's "Reprendre" dropped the learner back on the course
  // overview with their place lost. The lesson id in the query string is the
  // one part of a lesson view that survives a refresh — and it is the field
  // Sandra's panel reads to know which lesson is on screen.
  const lessonParam = searchParams.get('lesson');
  // A `?lesson=` that no longer exists in this course (renamed, removed).
  const [staleLesson, setStaleLesson] = useState(false);
  useEffect(() => { setStaleLesson(false); }, [courseId]);

  useEffect(() => {
    if (!courseId || restoredForRef.current === courseId) return;
    if (!lessonParam) {
      if (modules.length > 0) restoredForRef.current = courseId;
      return;
    }
    if (modules.length === 0) return; // course structure hasn't loaded yet
    for (let m = 0; m < modules.length; m++) {
      const lIdx = getModuleLessons(m).findIndex((lsn) => lsn?.id === lessonParam);
      if (lIdx >= 0) {
        restoredForRef.current = courseId;
        pendingRestoreRef.current = lessonParam;
        goToLesson(m, lIdx);
        setView('lesson');
        trackJourney('lesson_resume_resolved', { source: 'link', course_id: courseId, lesson_id: lessonParam, outcome: 'opened' });
        return;
      }
    }
    // Stale link: the id isn't in this course. Drop it and stay on the
    // overview — saying so — rather than opening some other lesson.
    restoredForRef.current = courseId;
    setStaleLesson(true);
    trackJourney('lesson_resume_resolved', { source: 'link', course_id: courseId, lesson_id: lessonParam, outcome: 'stale_link' });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('lesson');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lessonParam, modules.length]);

  // Keep the address bar pointing at the lesson actually on screen.
  useEffect(() => {
    if (!courseId) return;
    // Not before the restore above has had its turn. This effect used to run
    // on the very first render — view still 'overview', modules still
    // loading — and delete the `?lesson=` it was meant to follow, so every
    // reload, shared link and Home "Reprendre où vous étiez" landed on the
    // course overview with the lesson lost. Verified in the browser: the
    // param disappeared from the URL before the lesson could open.
    if (restoredForRef.current !== courseId) return;
    // Nor in the commit where the restore asked for the lesson: this render's
    // `view` is still 'overview', so syncing now would delete the very
    // `?lesson=` being opened. Wait until the lesson view is on screen.
    if (pendingRestoreRef.current) {
      if (view !== 'lesson') return;
      pendingRestoreRef.current = null;
    }
    const id = (view === 'lesson' && activeLessonData?.id) || null;
    if (id === (searchParams.get('lesson') || null)) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('lesson', id);
      else next.delete('lesson');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeLessonData?.id, courseId, searchParams]);

  useEffect(() => {
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
      // Carries the lesson, so Home's "Reprendre où vous étiez" reopens the
      // lesson itself rather than the course overview.
      path: activeLessonData?.id && view === 'lesson'
        ? `/courses/${courseId}?lesson=${encodeURIComponent(activeLessonData.id)}`
        : `/courses/${courseId}`,
      title: courseName || lessonTitle || String(courseId),
      subtitle: lessonTitle && lessonTitle !== courseName ? lessonTitle : undefined,
      ts: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, course?.name, activeModuleData?.id, activeLessonData?.id, view]);

  // Saving a completion has honest outcomes and the screen says which; the
  // hook keeps them per lesson, so a late answer for one lesson can never
  // acknowledge another, and refuses a second write while one is pending.
  const activeEntry = completion.entryFor(activeLessonData?.id);
  const handleMarkComplete = () => {
    if (!activeLessonData?.id) return;
    completion.complete(activeLessonData.id);
  };

  /** The next lesson, as the completion panel names it; null at the end of a course. */
  const nextUp = useMemo(() => {
    if (!nextTarget) return null;
    const lesson = getModuleLessons(nextTarget.module)[nextTarget.lesson];
    if (!lesson) return null;
    return {
      title: lesson.title || (isCreole ? 'Pwochen leson' : 'Leçon suivante'),
      unit: modules[nextTarget.module]?.title || undefined,
      chapter: nextTarget.module + 1,
      still: lessonFrame(lesson.videoUrl),
      minutes: realMinutes(lesson.duration),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextTarget?.module, nextTarget?.lesson, modules, isCreole]);

  const goToNextLesson = () => {
    if (!nextTarget) return;
    goToLesson(nextTarget.module, nextTarget.lesson);
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  // Check if current lesson is completed (the progress document, plus any
  // completion this session has had confirmed).
  const isLessonCompleted = !!activeLessonData?.id && completedIds.has(activeLessonData.id);

  // The lesson's ONE primary action: finish it if it isn't finished, otherwise
  // go on to the next one. Naming it here lets the quiet previous/next pager
  // below drop its "Suivant", which was the same tap as the big blue button
  // directly above it — two controls competing to be the next step.
  // A completed lesson's primary lives in the completion panel (practice for
  // this chapter, or the next lesson when the bank has nothing for it).
  const lessonPrimary: 'complete' | 'done' | 'next' | null =
    activeLessonData?.type === 'quiz'
      ? null
      : isLessonCompleted && isAuthenticated
        ? 'done'
        : isEnrolled && !isLessonCompleted
          ? 'complete'
          : nextTarget
            ? 'next'
            : null;

  // What practice this lesson can honestly promise. The practice page scopes
  // by unit, so the count is the unit's bank rows and the label says chapter.
  const practice = useMemo(() => chapterPractice({
    quizBank: data?.quizBank,
    courseCode: course?.code,
    module: activeModuleData,
    lessonId: activeLessonData?.id,
  }), [data?.quizBank, course?.code, activeModuleData, activeLessonData?.id]);
  // Bank rows tagged to THIS lesson — only these make the in-page exercises
  // lesson-specific. null while the bank loads.
  const lessonQuestions = useMemo(
    () => lessonQuestionCount(data?.quizBank, course?.code, activeModuleData, activeLessonData?.lesson_no),
    [data?.quizBank, course?.code, activeModuleData, activeLessonData?.lesson_no],
  );
  // Question 1 of the chapter, live on the practice card, and how many the
  // session the card opens will really hold.
  const previewQuestion = useMemo(
    () => pickPreviewQuestion(data?.quizBank, course?.code, activeModuleData, activeLessonData?.lesson_no),
    [data?.quizBank, course?.code, activeModuleData, activeLessonData?.lesson_no],
  );
  const sessionCount = useMemo(
    () => sessionQuestionCount(data?.quizBank, course?.code, activeModuleData),
    [data?.quizBank, course?.code, activeModuleData],
  );

  // How far this unit has actually been taken — read off the same document, so
  // it can never disagree with the lesson list.
  const unitCompletedCount = lessonBreakdown.filter((l) => l?.id && completedIds.has(l.id)).length;

  // One practice surface at a time: while a set is open the launchers step
  // aside instead of sitting under it offering the same thing again.
  const practiceOpen = showQuiz || showFlashcards || showChapterTest;
  const practiceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!practiceOpen) return;
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    practiceRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [practiceOpen]);

  // Per-lesson key for saving/restoring the video position.
  const positionKey = courseId && activeLessonData?.id ? `${courseId}:${activeLessonData.id}` : '';
  const lastSavedRef = useRef({ key: '', t: -100 });

  // Where to resume this lesson's video (0 if none / completed). Recomputed when
  // the lesson changes; the player remounts per video via its key.
  const resumeSeconds = useMemo(() => {
    if (!positionKey || isLessonCompleted) return 0;
    return resumeSecondsFor(user?.uid, positionKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionKey, youtubeVideoId, isLessonCompleted, user?.uid]);

  // "Recommencer" — a resume the learner didn't want. Forgetting the stored
  // second and remounting the player (the token is part of its key) is the
  // whole mechanism; it is deliberately per-lesson, so leaving and coming
  // back still resumes.
  const [restart, setRestart] = useState({ key: '', token: 0 });
  const startedFrom = restart.key === positionKey ? 0 : resumeSeconds;
  const restartVideo = () => {
    clearVideoPosition(user?.uid, positionKey);
    lastSavedRef.current = { key: '', t: -100 };
    setRestart((r) => ({ key: positionKey, token: r.token + 1 }));
  };

  // Handle YouTube player time updates for progress tracking
  const handleVideoTimeUpdate = ({ currentTime, duration }) => {
    // Persist resume position for everyone (throttled to ~5s), independent of
    // enrolment/auth so free-preview viewers also get resume.
    if (positionKey && Number.isFinite(currentTime)) {
      const last = lastSavedRef.current;
      if (last.key !== positionKey || Math.abs(currentTime - last.t) >= 5) {
        lastSavedRef.current = { key: positionKey, t: currentTime };
        saveVideoPosition(user?.uid, positionKey, currentTime, duration);
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
    // An unknown or removed course. Keep the student's class (read off the id)
    // on the way back, rather than dropping them on an unfiltered catalogue.
    const backTo = catalogReturnPath(location.state, levelFromCourseId(courseId));
    return (
      <div className="section">
        <div className="container">
          <div className="card card--message">
            <h2 className="section__title">{t('courses.notAvailableTitle', L('Ce cours n\'est pas disponible', 'Kou sa a pa disponib'))}</h2>
            <p className="text-muted">{t('courses.notAvailableBody', L('Nous n\'avons pas trouvé le cours que vous cherchez.', 'Nou pa jwenn kou w ap chèche a.'))}</p>
            <button className="button button--primary" onClick={() => navigate(backTo)}>
              {t('courses.returnToCatalog', L('Retour au catalogue', 'Retounen nan katalòg la'))}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const lessonTitle = activeLessonData?.title || activeModuleData?.title || course.name;

  return (
    <div className={`section course-detail${view === 'lesson' ? ' course-detail--lesson' : ''}`}>
      <div className="container course-detail__container">
        {view === 'overview' ? (
          <CourseOverview
            course={course}
            modules={modules}
            progress={progressView}
            mastery={mastery}
            isEnrolled={isEnrolled}
            resumeTarget={resumeTarget}
            hasProgress={hasProgress}
            staleLesson={staleLesson}
            backTo={catalogReturnPath(location.state)}
            progressFailed={progressFailed || !!masteryFailed}
            onRetryProgress={() => {
              if (progressFailed) retryProgress();
              if (masteryFailed) void refreshMastery();
            }}
            onStart={() => {
              const target = getModuleLessons(resumeTarget.module)[resumeTarget.lesson];
              if (hasProgress) {
                trackJourney('lesson_resume_resolved', { source: 'overview', course_id: courseId, lesson_id: target?.id, outcome: 'opened' });
              }
              setStaleLesson(false);
              goToLesson(resumeTarget.module, resumeTarget.lesson);
              setView('lesson');
            }}
            onSelectLesson={(mIdx, lIdx) => {
              setStaleLesson(false);
              goToLesson(mIdx, lIdx);
              setView('lesson');
              const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
              window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
            }}
            onSelectModule={(mIdx) => {
              // Opening a chapter RESUMES it: the first lesson of that chapter
              // the student hasn't finished, not lesson 1 again.
              setStaleLesson(false);
              goToLesson(mIdx, firstUnfinishedIn(mIdx));
              setView('lesson');
            }}
          />
        ) : (
        <Suspense fallback={<div className="course-detail__layout"><SkeletonText lines={6} /></div>}>
        <div className="course-detail__layout">
          <div className="course-detail__column">
            {/* The way back to the course, and — on constrained widths — the
                labelled way into the outline sheet, side by side. */}
            <div className="lesson-stage__crumbs">
              <button
                type="button"
                className="course-detail__back"
                onClick={() => setView('overview')}
              >
                <ChevronLeft size={16} aria-hidden="true" />
                <span className="course-detail__back-label">{L('Retour au cours', 'Retounen nan kou a')}<span className="qz__sr-only"> : </span></span>
                <span className="course-detail__back-name">{displayCourseName(course.name || course.title)}</span>
              </button>
              <button
                className="lx-tonal lx-tonal--sm lesson-card__sidebar-toggle"
                onClick={() => setShowSidebar(true)}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={showSidebar}
                aria-controls="lesson-outline"
              >
                <BookOpen size={16} aria-hidden="true" /> {L('Sommaire', 'Plan kou a')}
              </button>
            </div>

            <article className="lesson-card lesson-stage">
              {/* ── 1. Which lesson this is, and where it sits ──────────────
                  BEFORE the player, in reading order and on screen (PRD
                  LJ-04): one meta line, the title, and the lesson's own
                  authored text when it has any. */}
              <header className="lesson-card__header lesson-stage__head">
                <div className="lesson-card__header-content">
                  <p className="lesson-stage__meta">
                    <span className="lesson-card__eyebrow">
                      {activeModuleData?.title || course.name}
                      {lessonBreakdown.length > 0
                        ? ` · ${isCreole
                            ? `Leson ${activeLesson + 1} sou ${lessonBreakdown.length}`
                            : `Leçon ${activeLesson + 1} sur ${lessonBreakdown.length}`}`
                        : ''}
                    </span>
                    {isEnrolled && lessonBreakdown.length > 0 && unitCompletedCount > 0 && (
                      <span className="lesson-stage__state-text">
                        {L(
                          `${unitCompletedCount}/${lessonBreakdown.length} terminées dans ce chapitre`,
                          `${unitCompletedCount}/${lessonBreakdown.length} fini nan chapit sa a`,
                        )}
                      </span>
                    )}
                    {videoLocked && (
                      <span className="lesson-stage__chip lesson-stage__chip--locked">
                        {L('Vidéo verrouillée', 'Videyo fèmen')}
                      </span>
                    )}
                    {/* The next step for this lesson, where the lesson is
                        named. Hidden at `none`: telling someone who just
                        opened a lesson to watch it is noise. */}
                    {isEnrolled && activeLessonData?.type !== 'quiz' && activeLessonLevel !== 'none' && (
                      <span className="lesson-stage__mastery">
                        <MasteryBadge level={activeLessonLevel} isCreole={isCreole} />
                        <span className="lesson-stage__state-text">
                          {nextStepLabel || t('courses.masteryDone', L('Rien à revoir ici.', 'Pa gen anyen pou revize isit.'))}
                        </span>
                      </span>
                    )}
                  </p>
                  <h1 className="lesson-card__title">{lessonTitle}</h1>
                  {/* Authored lesson text only (utils/lessonCopy). Through the
                      maths renderer when it carries markup; `InstructionRenderer`
                      has an EXAM helper that breaks "(Partie 1)" onto its own
                      line, so plain prose stays prose. */}
                  {activeDescription && (
                    <div className="lesson-card__description lesson-stage__text lx-desc">
                      {hasRichText(activeDescription) ? (
                        <InstructionRenderer text={activeDescription} />
                      ) : (
                        <p className="lesson-stage__prose">{activeDescription}</p>
                      )}
                    </div>
                  )}
                </div>
              </header>

              {offline && isVideoLesson && (
                <p className="lesson-stage__notice lesson-stage__notice--offline">
                  <WifiOff size={15} aria-hidden="true" />
                  {L(
                    'Tu es hors ligne. La vidéo a besoin d’une connexion ; le texte de cette leçon reste lisible.',
                    'Ou pa gen koneksyon. Videyo a bezwen entènèt ; tèks leson sa a rete la.',
                  )}
                </p>
              )}

              {/* ── 2. The lesson itself ──────────────────────────────────── */}
              <div
                className={`lesson-card__media ${activeLessonData?.type === 'quiz' ? 'lesson-card__media--quiz' : ''}`}
                aria-busy={enriching && !primaryVideo ? true : undefined}
              >
                {videoLocked ? (
                  <div className="lesson-card__gate">
                    <Lock size={28} className="lesson-card__gate-icon" aria-hidden="true" />
                    <h2 className="lesson-card__gate-title">
                      {t('courses.gateTitle', L('Créez un compte gratuit pour continuer', 'Kreye yon kont gratis pou kontinye'))}
                    </h2>
                    <p className="lesson-card__gate-text">
                      {t('courses.gateText', L(
                        `Vous avez profité de vos ${FREE_VIDEO_LIMIT} vidéos gratuites. Inscrivez-vous gratuitement pour débloquer tous les cours, quiz et examens.`,
                        `Ou gade ${FREE_VIDEO_LIMIT} videyo gratis ou yo. Enskri gratis pou louvri tout kou, quiz ak egzamen yo.`,
                      ))}
                    </p>
                    <button
                      className="lx-solid"
                      onClick={() => useStore.getState().setShowAuthModal(true)}
                    >
                      {t('courses.gateCta', L('Créer un compte gratuit', 'Kreye yon kont gratis'))}
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
                      key={`${youtubeVideoId}:${restart.token}`}
                      videoId={youtubeVideoId}
                      title={lessonTitle}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onEnded={handleVideoEnded}
                      startSeconds={startedFrom}
                    />
                  ) : (
                    <LessonVideoFrame
                      key={`${primaryVideo}:${videoRetry}`}
                      src={primaryVideo}
                      title={lessonTitle}
                      isCreole={isCreole}
                      offline={offline}
                      onRetry={() => setVideoRetry((n) => n + 1)}
                      onPlayingChange={setVideoPlaying}
                      minutes={realMinutes(activeLessonData?.duration)}
                    />
                  )
                ) : enriching ? (
                  // Video URL is still loading (catalog paint, appData in flight).
                  <Skeleton width="100%" height="100%" radius={0} />
                ) : (
                  <div className="lesson-card__placeholder lesson-stage__placeholder">
                    <span>{t('courses.videoPlaceholder', L(
                      'Le contenu vidéo apparaîtra ici dès qu’il sera disponible.',
                      'Kontni videyo a ap parèt isit la lè li disponib.',
                    ))}</span>
                    {/* An empty region still owes the student a next step —
                        the practice card below holds it; this is a shortcut. */}
                    {nextTarget && (
                      <span className="lesson-stage__placeholder-actions">
                        <button
                          type="button"
                          className="lx-tonal lx-tonal--sm"
                          onClick={() => goToLesson(nextTarget.module, nextTarget.lesson)}
                        >
                          {L('Leçon suivante', 'Pwochen leson')}
                        </button>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ── 3. One compact row under the player ───────────────────
                  Left: the guest's free-preview count, or the signed-in
                  student's completion (tonal; "Terminée" once the server has
                  confirmed it). Right: quiet lesson-to-lesson paging. The
                  page's one solid button is on the practice card below. */}
              {activeLessonData?.type !== 'quiz' && (
                <div className="lesson-stage__bar lx-row">
                  <div className="lx-row__left">
                    {!isAuthenticated && !videoLocked && isVideoLesson && (
                      <span className="lx-pill">
                        {freeVideosRemaining > 0
                          ? L(
                              `Aperçu gratuit · ${freeVideosRemaining} vidéo${freeVideosRemaining > 1 ? 's' : ''} restante${freeVideosRemaining > 1 ? 's' : ''}`,
                              `Apèsi gratis · ${freeVideosRemaining} videyo ki rete`,
                            )
                          : L('Aperçu gratuit · dernière vidéo', 'Apèsi gratis · dènye videyo')}
                      </span>
                    )}
                    {lessonPrimary === 'complete' && (
                      <LessonCompleteAction
                        entry={activeEntry}
                        isCreole={isCreole}
                        onComplete={handleMarkComplete}
                      />
                    )}
                    {isLessonCompleted && (
                      <span className={`lx-done${completion.freshId === activeLessonData?.id ? ' is-fresh' : ''}`}>
                        <span className="lx-done__pill">
                          <Check size={15} weight="bold" aria-hidden="true" />
                          {isCreole ? EVIDENCE.completed.ht : EVIDENCE.completed.fr}
                        </span>
                        <span className="lx-done__help">{L('La maîtrise se construit avec la pratique.', 'Metriz la bati ak pratik.')}</span>
                      </span>
                    )}
                  </div>

                  {(prevTarget || nextTarget) && (
                    <nav className="lx-row__nav lesson-stage__pager" aria-label={L('Leçons', 'Leson yo')}>
                      {prevTarget && (
                        <button
                          type="button"
                          className="lx-nav lx-nav--prev"
                          onClick={() => goToLesson(prevTarget.module, prevTarget.lesson)}
                        >
                          <ChevronLeft size={18} aria-hidden="true" />
                          <span className="lx-nav__text">{L('Précédente', 'Anvan')}</span>
                        </button>
                      )}
                      {nextTarget && (
                        <button
                          type="button"
                          className="lx-nav lx-nav--next"
                          onClick={goToNextLesson}
                        >
                          <span className="lx-nav__text">
                            {L('Suivante', 'Apre')}
                            {nextUp?.title && <span className="lx-nav__title"> : {nextUp.title}</span>}
                          </span>
                          <ChevronRight size={18} aria-hidden="true" />
                        </button>
                      )}
                    </nav>
                  )}
                </div>
              )}

              {/* The provider's player can fail in ways we can't see from here.
                  Its fallbacks sit under it, never over its controls. */}
              {videoPlaying && !youtubeVideoId && primaryVideo && lessonVideoWatchUrl(primaryVideo) && (
                <p className="lesson-stage__notice lesson-stage__notice--video">
                  {L('Un problème de lecture ?', 'Videyo a pa mache ?')}
                  <button type="button" className="lesson-stage__notice-link" onClick={() => setVideoRetry((n) => n + 1)}>
                    {L('Recharger la vidéo', 'Rechaje videyo a')}
                  </button>
                  <a
                    className="lesson-stage__notice-link"
                    href={lessonVideoWatchUrl(primaryVideo) as string}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {L('Ouvrir sur YouTube', 'Louvri sou YouTube')}
                  </a>
                </p>
              )}

              {/* Continuity, stated plainly. The position is kept per lesson
                  in this browser — so say where playback picked up, and give
                  the student the start of the video back if that isn't what
                  they wanted. */}
              {startedFrom > 0 && !videoLocked && (
                <p className="lesson-stage__notice">
                  {L(
                    `Reprise à ${formatClock(startedFrom)}.`,
                    `Nou repran nan ${formatClock(startedFrom)}.`,
                  )}
                  <button type="button" className="lesson-stage__notice-link" onClick={restartVideo}>
                    {L('Recommencer depuis le début', 'Rekòmanse depi nan konmansman')}
                  </button>
                </p>
              )}

              {/* Sandra, from inside the lesson — in the flow, never floating
                  over the player. She receives the page and the titles, never
                  the student's answers. */}
              {isAuthenticated && activeLessonData?.type !== 'quiz' && (
                <div className="lesson-stage__sandra">
                  <button
                    type="button"
                    className="lx-tonal lx-tonal--sm"
                    disabled={!sandraAvailable}
                    title={sandraReason || undefined}
                    onClick={() => askSandra({
                      question: isCreole
                        ? 'Ede m konprann leson sa a'
                        : 'Aide-moi à comprendre cette leçon',
                      topic: lessonAskTopic,
                      course: course?.name || course?.title || undefined,
                    })}
                  >
                    <MessageCircle size={16} aria-hidden="true" />
                    {L('Demander à Sandra', 'Mande Sandra')}
                  </button>
                  <span className="lesson-stage__sandra-note">
                    {sandraAvailable
                      ? L(
                          'Elle voit le nom de la leçon, jamais tes réponses.',
                          'Li wè non leson an, jamè repons ou yo.',
                        )
                      : sandraReason}
                  </span>
                </div>
              )}
            </article>

            {/* ── 4. Practice, first after the video (RECHECK item 3) ───── */}
            {activeLessonData?.type !== 'quiz' && (
              <div className="lx-practice-slot" ref={practiceRef}>
                {!practiceOpen ? (
                  <LessonPracticeCard
                    isCreole={isCreole}
                    practice={practice}
                    sessionCount={sessionCount}
                    unitTitle={activeModuleData?.title}
                    question={previewQuestion}
                    signedIn={isAuthenticated}
                    solid={!videoLocked}
                    lessonQuestions={lessonQuestions}
                    courseCode={course?.code}
                    courseId={String(courseId)}
                    lessonId={activeLessonData?.id}
                    onLessonExercises={() => setShowQuiz(true)}
                    onFlashcards={() => setShowFlashcards(true)}
                    otherPracticeHref={course?.code ? practiceHref({ course: course.code, from: 'lesson' }) : null}
                  >
                    {/* The chapter test for this unit — the only route to
                        `mastered`. A unit-level action rather than a row in
                        the lesson list: a test isn't a lesson. */}
                    {isEnrolled && (
                      <ChapterTestCard
                        summary={unitMastery}
                        unitTitle={activeModuleData?.title}
                        onStart={startChapterTest}
                      />
                    )}
                  </LessonPracticeCard>
                ) : (
                  <section className="lx-practice lx-practice--open" aria-labelledby="lesson-practice-open-title">
                    <h2 id="lesson-practice-open-title" className="lx-practice__title">
                      {showChapterTest
                        ? L('Test du chapitre', 'Tès chapit la')
                        : showFlashcards
                          ? L('Flashcards', 'Kat etid')
                          : L('S’exercer sur cette leçon', 'Egzèse sou leson sa a')}
                    </h2>
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
                      /* The exercises for THIS lesson. lessonId is what attributes
                         the score to the lesson, so it can climb the mastery
                         ladder. */
                      <UnitQuiz
                        subjectCode={course?.code}
                        unitId={undefined}
                        chapterNumber={activeModuleData?.unit_no}
                        subchapterNumber={activeLessonData?.lesson_no}
                        courseId={courseId}
                        lessonId={activeLessonData?.id}
                        onClose={() => { setShowQuiz(false); refreshMastery(); }}
                      />
                    )}
                    {showFlashcards && hasQuiz && (
                      <FlashcardDeck
                        subjectCode={course?.code}
                        chapterNumber={activeModuleData?.unit_no}
                        subchapterNumber={activeLessonData?.lesson_no}
                        onClose={() => setShowFlashcards(false)}
                      />
                    )}
                  </section>
                )}
              </div>
            )}

            {/* ── 5. Phone: what comes next, as a row (the desktop has it in
                the row under the player). */}
            {nextUp && activeLessonData?.type !== 'quiz' && (
              <button type="button" className="lx-next" onClick={goToNextLesson}>
                <SubjectFrame subject={course?.subject || course?.code || ''} still={nextUp.still} size="sm" className="lx-next__frame" />
                <span className="lx-next__body">
                  <span className="lx-next__kicker">{L('Leçon suivante', 'Pwochen leson')}</span>
                  <span className="lx-next__title">{nextUp.title}</span>
                  <span className="lx-next__meta">
                    {L(`Chapitre ${nextUp.chapter}`, `Chapit ${nextUp.chapter}`)}
                    {nextUp.minutes > 0 ? ` · ${nextUp.minutes} min` : ''}
                  </span>
                </span>
                <ChevronRight size={20} className="lx-next__chev" aria-hidden="true" />
              </button>
            )}

            {/* ── 6. A quiet account prompt, after the learning. The preview
                limit and its counter are unchanged; only weight and place. */}
            {!isAuthenticated && !videoLocked && (
              <div className="lx-signup">
                <p className="lx-signup__text">{L('Garde ta progression d’un appareil à l’autre.', 'Kenbe pwogrè ou sou tout aparèy ou yo.')}</p>
                <button
                  type="button"
                  className="lx-tonal"
                  onClick={() => useStore.getState().setShowAuthModal(true)}
                >
                  {t('courses.signUpFree', L('Créer un compte gratuit', 'Kreye yon kont gratis'))}
                </button>
              </div>
            )}

            {/* ── 7. Discussion — secondary to the learning, and collapsed
                until asked for, on every screen size. */}
            <div className={`lesson-card lesson-card--comments ${showComments ? 'lesson-card--comments-open' : ''}`}>
              <button
                className="lesson-card__comments-toggle"
                onClick={() => setShowComments(!showComments)}
                type="button"
                aria-expanded={showComments}
              >
                <span className="lesson-card__comments-title">
                  <MessageCircle size={20} aria-hidden="true" /> {L('Discussion', 'Diskisyon')}
                </span>
                <ChevronDown size={20} className="lesson-card__comments-chevron" aria-hidden="true" />
              </button>

              <div className="lesson-card__comments-content">
                {/* Mounted on demand: a thread nobody opened shouldn't cost a
                    read on a phone connection. */}
                {showComments && (
                  <Comments
                    threadKey={threadKey}
                    isAuthenticated={isAuthenticated}
                    onRequireAuth={() => useStore.getState().toggleAuthModal()}
                  />
                )}
              </div>
            </div>
          </div>

          <CourseSidebar
            courseId={courseId}
            modules={modules}
            activeModule={activeModule}
            activeLesson={activeLesson}
            progress={progressView}
            mastery={mastery}
            isEnrolled={isEnrolled}
            isOpen={showSidebar}
            onOpenChange={setShowSidebar}
            onSelectLesson={(moduleIdx, lessonIdx) => goToLesson(moduleIdx, lessonIdx)}
          />
        </div>
        </Suspense>
        )}
      </div>

      {/* Layout unmounts the global Sandra widget in focus mode, so the lesson
          hosts the panel its "Demander à Sandra" opens. No launcher of its
          own: nothing floats over the player or the lesson's controls. */}
      {view === 'lesson' && <SandraFocusPanel />}
    </div>
  );
}
