import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import LessonComplete from '../components/LessonComplete';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, X, BookOpen, MessageCircle, ChevronLeft, Target, WifiOff, AlertCircle } from '../components/icons';
import { useAppData, useCourses } from '../hooks/useData';
import { useCourseProgress } from '../hooks/useProgress';
import { trackVideoProgress, markLessonComplete } from '../services/progressTracking';
import UnitQuiz from '../components/UnitQuiz';
import Comments from '../components/Comments';
import FlashcardDeck from '../components/FlashcardDeck';
import YouTubePlayer, { getYouTubeVideoId } from '../components/YouTubePlayer';
import CourseSidebar from '../components/CourseSidebar';
import CourseOverview from '../components/CourseOverview';
import InstructionRenderer from '../components/InstructionRenderer';
import { ErrorState } from '../components/StateViews';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { useFocusMode } from '../hooks/useFocusMode';
import useStore, { FREE_VIDEO_LIMIT } from '../contexts/store';
import { chapterTestLessonMap, lessonMastery, masteryNextStep, summarize } from '../../shared/mastery';
import { useCourseMastery } from '../hooks/useMastery';
import MasteryBadge from '../components/MasteryBadge';
import ChapterTestCard from '../components/ChapterTestCard';
import { useAskSandra } from '../components/SandraWidget';
import { useTranslation } from 'react-i18next';
import './CourseDetail.css';

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

function clearVideoPosition(key) {
  if (!key) return;
  try {
    const all = readVideoPositions();
    delete all[key];
    localStorage.setItem(VIDEO_POS_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — there is nothing to clear */
  }
}

/** m:ss, for telling the learner exactly where playback resumed. */
function formatClock(total) {
  const s = Math.max(0, Math.floor(Number(total) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function getResumeSeconds(key) {
  if (!key) return 0;
  const rec = readVideoPositions()[key];
  if (!rec || !Number.isFinite(rec.t)) return 0;
  if (rec.t < 15) return 0; // ignore trivially short watches
  if (rec.d && rec.t > rec.d * 0.95) return 0; // basically finished
  return rec.t;
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
  const [showQuiz, setShowQuiz] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false); // Mobile sidebar toggle
  const [showComments, setShowComments] = useState(false); // Mobile comments toggle
  const { isAuthenticated, enrolledCourses, user } = useStore();
  // Sandra's own public API (`src/components/SandraWidget`): it composes the
  // grounding, and it is the thing that knows whether she is allowed to help
  // on this screen. The lesson used to poke `setSandraAsk` with a hand-built
  // sentence, which bypassed both.
  const { available: sandraAvailable, reason: sandraReason, ask: askSandra } = useAskSandra();
  const freeVideoIds = useStore((s) => s.freeVideoIds);
  const recordActivity = useStore((s) => s.recordActivity);
  const { progress } = useCourseProgress(courseId);

  // ── Completion, confirmed ──────────────────────────────────────────────────
  // `useCourseProgress` reads the progress document ONCE per course, so a
  // lesson marked complete in this session was written to Firestore and then
  // never read back: the button stayed on "Marquer comme terminé" and the
  // lesson list kept showing it as unfinished until a reload. This set holds
  // only ids whose write the server has ACKNOWLEDGED (added after the promise
  // resolves), so it echoes the authoritative document rather than inventing a
  // second progress model — nothing here decides completion, it only stops the
  // screen from contradicting a save that landed.
  const [justCompleted, setJustCompleted] = useState<Set<string>>(() => new Set());
  const completedIds = useMemo(() => {
    const ids = new Set<string>(progress?.completedLessons || []);
    justCompleted.forEach((id) => ids.add(id));
    return ids;
  }, [progress?.completedLessons, justCompleted]);
  // What the lesson list is handed: the same document, plus this session's
  // confirmed writes, so the sidebar's ticks agree with the lesson screen.
  const progressView = useMemo(
    () => (justCompleted.size > 0 ? { ...(progress || {}), completedLessons: [...completedIds] } : progress),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progress, justCompleted, completedIds],
  );

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
  // Changing the module runs an effect that resets the lesson to the first one
  // of that module — the safety net for a module picked on its own. It also
  // used to undo every RESUME: "Reprendre · Unité 3 · Leçon 4" set both values
  // in one commit, then the effect put the learner back on Leçon 1. This ref
  // records that a lesson was asked for deliberately, so the reset can tell a
  // module-only change from a lesson the student chose.
  const requestedLessonRef = useRef<{ module: number; lesson: number } | null>(null);
  const goToLesson = (mIdx, lIdx) => {
    requestedLessonRef.current = { module: mIdx, lesson: lIdx };
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

  // ── Relaunch / deep link: /courses/:courseId?lesson=<lessonId> ────────────
  // Which lesson is open lived only in component state, so a reload, a shared
  // link or a tap on Home's "Reprendre" dropped the learner back on the course
  // overview with their place lost. The lesson id in the query string is the
  // one part of a lesson view that survives a refresh — and it is the field
  // Sandra's panel reads to know which lesson is on screen.
  const restoredForRef = useRef<string | null>(null);
  const lessonParam = searchParams.get('lesson');

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
        goToLesson(m, lIdx);
        setView('lesson');
        return;
      }
    }
    // Stale link: the id isn't in this course. Drop it and stay on the
    // overview rather than opening some other lesson.
    restoredForRef.current = courseId;
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
    // Reset to the module's first lesson — UNLESS the student asked for a
    // specific lesson in this module (resume, deep link, lesson list, next).
    const requested = requestedLessonRef.current;
    requestedLessonRef.current = null;
    if (!requested || requested.module !== activeModule) setActiveLesson(0);
    setShowQuiz(false);
    setShowFlashcards(false);
  }, [activeModule]);

  useEffect(() => {
    // A lesson-only change consumes the request too, so it can never be
    // honoured later by a module-only change.
    requestedLessonRef.current = null;
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

  // Finishing a lesson is the moment a student is most likely to do one more —
  // so completion opens the continuation sheet rather than just turning the
  // button green. `markLessonComplete` also advances the global streak, so the
  // streak query is invalidated to stop the sheet quoting yesterday's count.
  const [showDone, setShowDone] = useState(false);

  // Saving a completion has four honest outcomes, and the screen says which:
  //   saving  — the write is in flight
  //   slow    — still unconfirmed after 8s; we do NOT claim it worked
  //   queued  — offline; Firestore is holding the write until the connection is back
  //   failed  — it did not land, and the button is still the way to retry
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'slow' | 'queued' | 'failed'>('idle');
  useEffect(() => { setSaveState('idle'); }, [activeLessonData?.id]);

  const handleMarkComplete = async () => {
    if (!user?.uid || !courseId || !activeLessonData?.id) return;
    if (saveState === 'saving' || saveState === 'slow' || saveState === 'queued') return;

    const lessonId = activeLessonData.id;
    setSaveState(offline ? 'queued' : 'saving');
    // Offline the promise simply never settles (the write sits in Firestore's
    // local queue), so the copy says "waiting for the connection" instead of
    // spinning forever or pretending the lesson is done.
    const slowTimer = offline
      ? null
      : setTimeout(() => setSaveState((s) => (s === 'saving' ? 'slow' : s)), 8000);

    try {
      await markLessonComplete(user.uid, courseId, lessonId);
      if (slowTimer) clearTimeout(slowTimer);
      queryClient.invalidateQueries({ queryKey: ['global-streak'] });
      // Confirmed by the server — now the screen may show it as complete.
      setJustCompleted((prev) => new Set(prev).add(lessonId));
      setSaveState('idle');
      setShowDone(true);
    } catch (error) {
      if (slowTimer) clearTimeout(slowTimer);
      console.error('[CourseDetail] Error marking lesson complete:', error);
      // The sheet is a reward for work that landed; don't show it for work
      // that didn't. The button stays actionable so they can retry.
      setSaveState('failed');
    }
  };

  /** The lesson the continuation sheet offers, or null at the end of a course. */
  const nextUp = useMemo(() => {
    if (!nextTarget) return null;
    const lesson = getModuleLessons(nextTarget.module)[nextTarget.lesson];
    if (!lesson) return null;
    return {
      title: lesson.title || (isCreole ? 'Pwochen leson' : 'Leçon suivante'),
      unit: modules[nextTarget.module]?.title || undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextTarget?.module, nextTarget?.lesson, modules, isCreole]);

  const goToNextLesson = () => {
    setShowDone(false);
    if (!nextTarget) return;
    goToLesson(nextTarget.module, nextTarget.lesson);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Check if current lesson is completed (the progress document, plus any
  // completion this session has had confirmed).
  const isLessonCompleted = !!activeLessonData?.id && completedIds.has(activeLessonData.id);

  // The lesson's ONE primary action: finish it if it isn't finished, otherwise
  // go on to the next one. Naming it here lets the quiet previous/next pager
  // below drop its "Suivant", which was the same tap as the big blue button
  // directly above it — two controls competing to be the next step.
  const lessonPrimary: 'complete' | 'next' | null =
    activeLessonData?.type === 'quiz'
      ? null
      : isEnrolled && !isLessonCompleted
        ? 'complete'
        : nextTarget
          ? 'next'
          : null;

  // How far this unit has actually been taken — read off the same document, so
  // it can never disagree with the lesson list.
  const unitCompletedCount = lessonBreakdown.filter((l) => l?.id && completedIds.has(l.id)).length;

  // One practice surface at a time: while a set is open the launchers step
  // aside instead of sitting under it offering the same thing again.
  const practiceOpen = showQuiz || showFlashcards || showChapterTest;
  const practiceRef = useRef<HTMLElement>(null);
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
    return getResumeSeconds(positionKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionKey, youtubeVideoId, isLessonCompleted]);

  // "Recommencer" — a resume the learner didn't want. Forgetting the stored
  // second and remounting the player (the token is part of its key) is the
  // whole mechanism; it is deliberately per-lesson, so leaving and coming
  // back still resumes.
  const [restart, setRestart] = useState({ key: '', token: 0 });
  const startedFrom = restart.key === positionKey ? 0 : resumeSeconds;
  // Only the JS-API player reports playback time back to us, so it is the only
  // path where a position can be stored and resumed. A bare embed (which is
  // what a youtube-nocookie lesson URL gets — deliberately, the iframe API
  // script is not in the site's CSP) plays fine but tells us nothing.
  const positionTracked = isVideoLesson && !!youtubeVideoId;
  const restartVideo = () => {
    clearVideoPosition(positionKey);
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
            progress={progressView}
            mastery={mastery}
            isEnrolled={isEnrolled}
            resumeTarget={resumeTarget}
            hasProgress={hasProgress}
            onStart={() => {
              goToLesson(resumeTarget.module, resumeTarget.lesson);
              setView('lesson');
            }}
            onSelectModule={(mIdx) => {
              // Opening a chapter RESUMES it: the first lesson of that chapter
              // the student hasn't finished, not lesson 1 again.
              goToLesson(mIdx, firstUnfinishedIn(mIdx));
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
            <article className="lesson-card lesson-stage">
              {/* ── 1. The lesson itself ────────────────────────────────────
                  The video (or the chapter test) comes first and gets the
                  width: what the student came for. Title, progress and the
                  next action follow it, deliberately quieter. */}
              {offline && isVideoLesson && (
                <p className="lesson-stage__notice lesson-stage__notice--offline">
                  <WifiOff size={14} aria-hidden="true" />
                  {L(
                    'Vous êtes hors ligne. La vidéo a besoin d’une connexion ; le texte de cette leçon reste lisible, mais les exercices peuvent ne pas se charger.',
                    'Ou pa gen koneksyon. Videyo a bezwen entènèt ; tèks leson sa a rete la, men egzèsis yo ka pa chaje.',
                  )}
                </p>
              )}

              <div
                className={`lesson-card__media ${activeLessonData?.type === 'quiz' ? 'lesson-card__media--quiz' : ''}`}
                aria-busy={enriching && !primaryVideo ? true : undefined}
              >
                {videoLocked ? (
                  <div className="lesson-card__gate">
                    <div className="lesson-card__gate-icon" aria-hidden>🔒</div>
                    <h3 className="lesson-card__gate-title">
                      {t('courses.gateTitle', L('Créez un compte gratuit pour continuer', 'Kreye yon kont gratis pou kontinye'))}
                    </h3>
                    <p className="lesson-card__gate-text">
                      {t('courses.gateText', L(
                        `Vous avez profité de vos ${FREE_VIDEO_LIMIT} vidéos gratuites. Inscrivez-vous gratuitement pour débloquer tous les cours, quiz et examens.`,
                        `Ou gade ${FREE_VIDEO_LIMIT} videyo gratis ou yo. Enskri gratis pou louvri tout kou, quiz ak egzamen yo.`,
                      ))}
                    </p>
                    <button
                      className="button button--primary"
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
                      title={activeLessonData?.title || activeModuleData?.title || course.name}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onEnded={handleVideoEnded}
                      startSeconds={startedFrom}
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
                  <div className="lesson-card__placeholder lesson-stage__placeholder">
                    <span>{t('courses.videoPlaceholder', L(
                      'Le contenu vidéo apparaîtra ici dès qu’il sera disponible.',
                      'Kontni videyo a ap parèt isit la lè li disponib.',
                    ))}</span>
                    {/* An empty region still owes the student a next step. */}
                    <span className="lesson-stage__placeholder-actions">
                      <button
                        type="button"
                        className="button button--primary button--sm"
                        onClick={() => setShowQuiz(true)}
                      >
                        {L('Faire les exercices', 'Fè egzèsis yo')}
                      </button>
                      {nextTarget && (
                        <button
                          type="button"
                          className="button button--ghost button--sm"
                          onClick={() => goToLesson(nextTarget.module, nextTarget.lesson)}
                        >
                          {L('Leçon suivante', 'Pwochen leson')}
                        </button>
                      )}
                    </span>
                  </div>
                )}
              </div>

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

              {/* …and where it genuinely cannot be kept, say so. Only the
                  player that reports playback time can be resumed; the
                  privacy-preserving embed every current lesson uses cannot be
                  read from this page, so there is no second where playback
                  would pick up. §8: don't promise what isn't implemented —
                  name what IS restored instead (the lesson itself). */}
              {isVideoLesson && !positionTracked && !videoLocked && !isLessonCompleted && (
                <p className="lesson-stage__notice lesson-stage__notice--quiet">
                  {L(
                    'La vidéo repart du début : sa position n’est pas enregistrée. Votre place dans le cours l’est — revenir sur ce lien vous ramène à cette leçon.',
                    'Videyo a rekòmanse depi nan konmansman : pozisyon li pa sere. Men plas ou nan kou a sere — lè ou tounen sou lyen sa a, w ap rive nan menm leson an.',
                  )}
                </p>
              )}

              {!isAuthenticated && !videoLocked && isVideoLesson && (
                <div className="lesson-card__free-banner">
                  {freeVideosRemaining > 0
                    ? t('courses.freeRemaining', {
                        count: freeVideosRemaining,
                        defaultValue: L(
                          `Aperçu gratuit · ${freeVideosRemaining} vidéo(s) restante(s). Inscrivez-vous pour un accès illimité.`,
                          `Apèsi gratis · ${freeVideosRemaining} videyo ki rete. Enskri pou aksè san limit.`,
                        ),
                      })
                    : t('courses.freeLast', L(
                        'Dernière vidéo gratuite. Inscrivez-vous pour un accès illimité.',
                        'Dènye videyo gratis la. Enskri pou aksè san limit.',
                      ))}
                  <button
                    type="button"
                    className="lesson-card__free-banner-link"
                    onClick={() => useStore.getState().setShowAuthModal(true)}
                  >
                    {t('courses.signUpFree', L('Créer un compte gratuit', 'Kreye yon kont gratis'))}
                  </button>
                </div>
              )}

              {/* ── 2. Which lesson this is, and where it sits ──────────────
                  Restrained on purpose: one eyebrow line, the title, and one
                  line of real state (completion of this unit, mastery of this
                  lesson) — all read off the authoritative documents. */}
              <header className="lesson-card__header lesson-stage__head">
                <div className="lesson-card__header-content">
                  <span className="lesson-card__eyebrow">
                    {activeModuleData?.title || course.name}
                    {lessonBreakdown.length > 0
                      ? ` · ${t('courses.lessonPosition', {
                          current: activeLesson + 1,
                          total: lessonBreakdown.length,
                          defaultValue: isCreole
                            ? `Leson ${activeLesson + 1} sou ${lessonBreakdown.length}`
                            : `Leçon ${activeLesson + 1} sur ${lessonBreakdown.length}`,
                        })}`
                      : ''}
                  </span>
                  {/* A heading, not a control: the click handler that used to
                      open the chapter drawer from here was invisible and
                      unreachable by keyboard. The labelled toggle beside it is
                      the way in. */}
                  <h1 className="lesson-card__title">
                    {activeLessonData?.title || activeModuleData?.title || course.name}
                  </h1>

                  <div className="lesson-stage__state">
                    {isLessonCompleted && (
                      <span className="lesson-stage__chip lesson-stage__chip--done">
                        <Check size={13} aria-hidden="true" />
                        {L('Leçon terminée', 'Leson fini')}
                      </span>
                    )}
                    {videoLocked && (
                      <span className="lesson-stage__chip lesson-stage__chip--locked">
                        {L('Vidéo verrouillée', 'Videyo fèmen')}
                      </span>
                    )}
                    {isEnrolled && lessonBreakdown.length > 0 && unitCompletedCount > 0 && (
                      <span className="lesson-stage__state-text">
                        {L(
                          `${unitCompletedCount}/${lessonBreakdown.length} leçons terminées dans cette unité`,
                          `${unitCompletedCount}/${lessonBreakdown.length} leson fini nan inite sa a`,
                        )}
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
                  </div>
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

              {/* ── 3. The explanation ─────────────────────────────────────
                  Objectives and lesson text, at a readable measure, through
                  the renderer the rest of the app uses for maths so `$x^2$`
                  in authored content isn't shown raw. */}
              {activeDescription && (
                <div className="lesson-card__description lesson-stage__text">
                  {/* `InstructionRenderer` is the app's KaTeX + Markdown
                      renderer, and it is what authored `$x^2$` in a lesson
                      needs. But it also carries an EXAM helper that pushes
                      "a)" / "1)" sub-part markers onto their own line, and a
                      lesson title like "Fractions (Partie 1)" trips it: the
                      browser showed "… (Partie" / "» du cours …" on two lines
                      with the "1)" eaten as a list marker. So prose with no
                      markup goes through as prose; anything with real markup
                      or math still goes to the renderer. */}
                  {hasRichText(activeDescription) ? (
                    <InstructionRenderer text={activeDescription} />
                  ) : (
                    <p className="lesson-stage__prose">{activeDescription}</p>
                  )}
                </div>
              )}

              {/* Sandra, from inside the lesson — and exactly what she is
                  told. She receives the page and the titles, never the
                  student's answers. */}
              {isAuthenticated && activeLessonData?.type !== 'quiz' && (
                <div className="lesson-stage__sandra">
                  <button
                    type="button"
                    className="button button--ghost button--sm lesson-card__nav-flat"
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
                    <MessageCircle size={15} aria-hidden="true" />
                    {L('Demander à Sandra', 'Mande Sandra')}
                  </button>
                  {/* What she is told, stated where the student decides to ask
                      — not buried in a policy page. It matches exactly what
                      `askSandra` sends plus the grade her panel attaches. */}
                  <span className="lesson-stage__sandra-note">
                    {sandraAvailable
                      ? L(
                          'Sandra reçoit le nom du cours, de l’unité et de cette leçon, plus votre classe. Vos réponses aux exercices ne sont pas partagées.',
                          'Sandra resevwa non kou a, non inite a ak non leson sa a, plis klas ou. Repons ou nan egzèsis yo pa pataje.',
                        )
                      : sandraReason}
                  </span>
                </div>
              )}

              {/* ── 4. The next action ─────────────────────────────────────
                  One primary action for the lesson, and the plain truth about
                  whether it was saved. Practice moved out of this row: it
                  belongs after the lesson, not beside the button that ends
                  it. */}
              <div className="lesson-card__nav">
                {activeLessonData?.type !== 'quiz' && (lessonPrimary || isLessonCompleted) && (
                  <div className="lesson-stage__next">
                    {lessonPrimary === 'complete' ? (
                      <button
                        type="button"
                        className="button button--primary lesson-stage__next-primary"
                        onClick={handleMarkComplete}
                        disabled={saveState === 'saving' || saveState === 'slow' || saveState === 'queued'}
                      >
                        {saveState === 'saving' || saveState === 'slow'
                          ? L('Enregistrement…', 'N ap anrejistre…')
                          : saveState === 'queued'
                            ? L('En attente de la connexion…', 'N ap tann koneksyon an…')
                            : nextTarget
                              ? L('Terminer et continuer', 'Fini epi kontinye')
                              : t('courses.markComplete', L('Marquer comme terminé', 'Make kòm fini'))}
                      </button>
                    ) : lessonPrimary === 'next' && nextTarget ? (
                      <button
                        type="button"
                        className="button button--primary lesson-stage__next-primary"
                        onClick={() => goToLesson(nextTarget.module, nextTarget.lesson)}
                      >
                        {L('Leçon suivante', 'Pwochen leson')}
                        {nextUp?.title && <span className="lesson-stage__next-sub">{nextUp.title}</span>}
                      </button>
                    ) : null}

                    {saveState === 'slow' && (
                      <p className="lesson-stage__save lesson-stage__save--pending" role="status">
                        {L(
                          'Toujours en cours d’enregistrement. Ne fermez pas la page ; nous vous confirmerons dès que c’est enregistré.',
                          'N ap toujou anrejistre. Pa fèmen paj la ; n ap konfime w kou li anrejistre.',
                        )}
                      </p>
                    )}
                    {saveState === 'queued' && (
                      <p className="lesson-stage__save lesson-stage__save--pending" role="status">
                        <WifiOff size={13} aria-hidden="true" />
                        {L(
                          'Hors ligne : la leçon sera marquée comme terminée dès le retour de la connexion. Ce n’est pas encore enregistré.',
                          'San koneksyon : leson an ap make kòm fini kou entènèt la tounen. Li poko anrejistre.',
                        )}
                      </p>
                    )}
                    {saveState === 'failed' && (
                      <p className="lesson-stage__save lesson-stage__save--failed" role="alert">
                        <AlertCircle size={13} aria-hidden="true" />
                        {L(
                          'Nous n’avons pas pu enregistrer. Vérifiez votre connexion, puis réessayez.',
                          'Nou pa t ka anrejistre. Tcheke koneksyon ou, epi eseye ankò.',
                        )}
                      </p>
                    )}
                    {isLessonCompleted && !nextTarget && (
                      <p className="lesson-stage__save">
                        {L(
                          'C’était la dernière leçon de ce cours.',
                          'Sa te dènye leson kou sa a.',
                        )}
                        <button
                          type="button"
                          className="lesson-stage__notice-link"
                          onClick={() => setView('overview')}
                        >
                          {L('Revoir le plan du cours', 'Gade plan kou a')}
                        </button>
                      </p>
                    )}
                  </div>
                )}

                {/* Lesson-to-lesson paging. "Suivant" is left out whenever the
                    primary action above it already IS the next lesson. */}
                {(prevTarget || (nextTarget && lessonPrimary !== 'next')) && (
                  <div className="lesson-card__nav-group lesson-card__nav-group--navigation">
                    <button
                      className="button button--ghost button--sm lesson-card__nav-flat"
                      onClick={() => {
                        if (prevTarget) {
                          goToLesson(prevTarget.module, prevTarget.lesson);
                          setShowSidebar(false);
                        }
                      }}
                      disabled={!prevTarget}
                    >
                      ← {t('common.previous', 'Précédent')}
                    </button>
                    {nextTarget && lessonPrimary !== 'next' && (
                      <button
                        className="button button--ghost button--sm lesson-card__nav-flat"
                        onClick={() => {
                          goToLesson(nextTarget.module, nextTarget.lesson);
                          setShowSidebar(false);
                        }}
                      >
                        {t('common.next', 'Suivant')} →
                      </button>
                    )}
                  </div>
                )}

              </div>
            </article>

            {/* ── 5. Practice, at the transition out of the lesson ────────
                After the video and the explanation, never beside them: the
                same questions offered next to the thing they test read as one
                more control. A quiz-type lesson already IS the test, so this
                region stays out of its way. */}
            {activeLessonData?.type !== 'quiz' && (
              <section className="lesson-practice" aria-labelledby="lesson-practice-title" ref={practiceRef}>
                <h2 id="lesson-practice-title" className="lesson-practice__title">
                  <Target size={16} aria-hidden="true" />
                  {L('Pratiquer cette leçon', 'Pratike leson sa a')}
                </h2>

                {!practiceOpen && (
                  <>
                    {/* Honest about what is kept: a practice set lives in this
                        page only. It is scored when the set is finished, so
                        leaving halfway loses the run — we don't claim a draft
                        that doesn't exist. */}
                    <p className="lesson-practice__note">
                      {L(
                        'Une série est enregistrée à la fin. Si vous la quittez avant d’avoir terminé, elle recommence au début.',
                        'Yon seri anrejistre lè ou fini l. Si ou soti anvan ou fini, li rekòmanse depi nan konmansman.',
                      )}
                    </p>
                    <div className="lesson-practice__actions">
                      <button
                        type="button"
                        className="button button--primary button--sm"
                        onClick={() => setShowQuiz(true)}
                        title={t('courses.practiceTitle', L('S’entraîner avec un quiz', 'Pratike ak yon quiz'))}
                      >
                        <span className="button-text">{t('courses.practice', L('Exercices', 'Egzèsis'))}</span>
                      </button>
                      <button
                        type="button"
                        className="button button--ghost button--sm"
                        onClick={() => setShowFlashcards(true)}
                        title={t('courses.flashcardsTitle', L('Étudier avec des flashcards', 'Etidye ak kat etid'))}
                      >
                        <span className="button-text">{t('courses.flashcards', L('Flashcards', 'Kat etid'))}</span>
                      </button>
                    </div>

                    {/* The chapter test for this unit — the only route to
                        `mastered`. A unit-level action rather than a row in the
                        lesson list: adding a lesson would inflate every course's
                        lesson denominator and drop existing students' progress
                        percentages, and a test isn't a lesson anyway. */}
                    {isEnrolled && (
                      <ChapterTestCard
                        summary={unitMastery}
                        unitTitle={activeModuleData?.title}
                        onStart={startChapterTest}
                      />
                    )}
                  </>
                )}

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
                     ladder — it used to be undefined, which is why the score
                     was computed and then dropped. */
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

            {/* ── 6. Discussion — secondary to the learning, and collapsed
                until asked for, on every screen size. */}
            <div className={`lesson-card lesson-card--comments ${showComments ? 'lesson-card--comments-open' : ''}`}>
              <button
                className="lesson-card__comments-toggle"
                onClick={() => setShowComments(!showComments)}
                type="button"
                aria-expanded={showComments}
              >
                <span className="lesson-card__comments-title">
                  <MessageCircle size={18} /> {t('courses.discussionComments', L('Discussion & commentaires', 'Diskisyon ak kòmantè'))}
                </span>
                <span className="lesson-card__comments-chevron" aria-hidden="true">
                  {showComments ? '▼' : '▶'}
                </span>
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

          {/* Sidebar - extracted into CourseSidebar component */}
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
        )}
      </div>
      {/* Removed modal overlay; inline rendering used instead */}

      {/* Session-end continuation: turns a finished lesson into the next one. */}
      <LessonComplete
        open={showDone}
        next={nextUp}
        onContinue={goToNextLesson}
        onDismiss={() => setShowDone(false)}
      />
    </div>
  );
}
