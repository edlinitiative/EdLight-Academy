import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyExerciseScore, applyChapterTestResult } from '../utils/mastery';
import { applyReviewOutcome, pruneReview, type ReviewMap, type ReviewMeta } from '../utils/review';

export const FREE_VIDEO_LIMIT = 3;

export interface LastActivity {
  type: 'lesson' | 'exam' | 'quiz';
  path: string;
  /** For exams: the exam's level, needed to deep-link into ExamTake on resume. */
  level?: string;
  /** For lessons: the lesson to reopen, so "Reprendre" lands on it, not just the course. */
  lessonId?: string;
  title: string;
  subtitle?: string;
  ts: number;
}

export interface AppState {
  user: any;
  isAuthenticated: boolean;
  authConfirmed: boolean;
  language: string;
  hydrated: boolean;
  track: string | null;
  /** Student's grade/class (7e, 8e, 9e, NS1–NS4, POSTBAC) — drives adaptive content. */
  grade: string | null;
  /** True once the grade question has been answered or skipped (gates the prompt). */
  gradeChosen: boolean;
  /** Key of the last Home "Recommandé pour toi" suggestion the user dismissed. */
  dismissedSuggestionKey: string | null;
  onboardingCompleted: boolean;
  tourCompleted: boolean;
  practiceTipSeen: boolean;
  /** True once the one-time "follow us on Instagram" Home prompt was shown (followed OR dismissed). */
  igPromptSeen: boolean;
  languageChosen: boolean;
  theme: 'light' | 'dark';
  enrolledCourses: any[];
  progress: Record<string, any>;
  /** Missed quiz-bank questions, kept until answered right (drives "Revizyon"). */
  review: ReviewMap;
  quizAttempts: Record<string, any[]>;
  freeVideoIds: string[];
  lastActivity: LastActivity | null;
  currentCourse: any;
  showAuthModal: boolean;
  guestInteractionCount: number;
  activeTab: string;
  focusMode: boolean;
  // Transient (not persisted): set by the home "Défi du jour" widget so the
  // Trivia tab auto-starts today's daily challenge on focus.
  pendingDailyChallenge: boolean;

  setUser: (user: any) => void;
  setAuthConfirmed: () => void;
  setLanguage: (language: string) => void;
  setTrack: (track: string | null) => void;
  setGrade: (grade: string | null) => void;
  setGradeChosen: (chosen: boolean) => void;
  setDismissedSuggestion: (key: string) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  setTourCompleted: (completed: boolean) => void;
  setPracticeTipSeen: (seen: boolean) => void;
  setIgPromptSeen: (seen: boolean) => void;
  setLanguageChosen: (chosen: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  enrollInCourse: (course: any) => void;
  updateProgress: (videoId: string, progress: any) => void;
  /** Best-score bookkeeping for a lesson's exercises (drives mastery). */
  recordLessonScore: (lessonId: string, pct: number) => void;
  /** Chapter-test outcome: lessonId → were ALL its drawn questions correct. */
  applyChapterTest: (perLesson: Record<string, boolean>) => void;
  /** Replace the progress map with one already merged against the server. */
  mergeRemoteProgress: (progress: Record<string, any>) => void;
  /** One answered quiz-bank question — wrong makes it due for review, right resolves it. */
  recordReviewOutcome: (questionId: string, correct: boolean, meta?: ReviewMeta) => void;
  /** Replace the review map with one already merged against the server. */
  mergeRemoteReview: (review: ReviewMap) => void;
  recordQuizAttempt: (quizId: string, attempt: any) => void;
  recordFreeVideoView: (videoId: string) => void;
  recordActivity: (activity: LastActivity) => void;
  clearActivity: () => void;
  setCurrentCourse: (course: any) => void;
  toggleAuthModal: () => void;
  setShowAuthModal: (show: boolean) => void;
  incrementGuestInteraction: () => void;
  setActiveTab: (tab: string) => void;
  setFocusMode: (focus: boolean) => void;
  setPendingDailyChallenge: (pending: boolean) => void;
  logout: () => void;
}

/**
 * What sign-out / account deletion / an account switch clears.
 * ────────────────────────────────────────────────────────────
 * A phone in Haiti is often shared by siblings or classmates, so the rule is:
 * anything that describes THE STUDENT is cleared; anything that describes THE
 * DEVICE or its owner's reading preferences is kept.
 *
 * Cleared (student-owned):
 *   user / isAuthenticated, track, grade + gradeChosen, onboardingCompleted,
 *   dismissedSuggestionKey, enrolledCourses, progress (mastery), review,
 *   quizAttempts, lastActivity, currentCourse, pendingDailyChallenge.
 *   grade is cleared deliberately (it used to survive logout): AuthGate
 *   backfills a device grade into a server profile that has none, so a kept
 *   grade would be written onto the NEXT student's account.
 *
 * Kept (device preferences / device facts):
 *   language + languageChosen, theme, tourCompleted, practiceTipSeen,
 *   igPromptSeen (one-time UI intros on this device), focusMode, activeTab,
 *   hydrated, authConfirmed (auth has resolved — clearing it would put the app
 *   back on the loading screen), freeVideoIds + guestInteractionCount (guest
 *   gating is per device; resetting them on logout would hand out free videos
 *   on every sign-out).
 *
 * Returned as a fresh object so callers can spread it into one `set()` — the
 * mastery sync listens to the store, and clearing progress in the SAME update
 * that drops the user keeps it from pushing an empty map to anyone.
 */
export function studentStateReset() {
  return {
    user: null,
    isAuthenticated: false,
    track: null,
    grade: null,
    gradeChosen: false,
    onboardingCompleted: false,
    dismissedSuggestionKey: null,
    currentCourse: null,
    enrolledCourses: [] as any[],
    progress: {} as Record<string, any>,
    review: {} as ReviewMap,
    quizAttempts: {} as Record<string, any[]>,
    lastActivity: null,
    pendingDailyChallenge: false,
  } satisfies Partial<AppState>;
}

const useStore = create<AppState>()(
  persist(
    (set, _get) => ({
      user: null,
      isAuthenticated: false,
      authConfirmed: false,
      // Kreyòl-first: the UI opens in the language students actually speak.
      // Academic terms stay French inside the content; navigation is Creole.
      // Existing installs keep whatever language they had (persisted), and
      // Profile's switch still offers Français.
      language: 'ht',
      hydrated: false,
      track: null,
      grade: null,
      gradeChosen: false,
      dismissedSuggestionKey: null,
      onboardingCompleted: false,
      tourCompleted: false,
      practiceTipSeen: false,
      igPromptSeen: false,
      languageChosen: false,
      theme: 'light',
      enrolledCourses: [],
      progress: {},
      review: {},
      quizAttempts: {},
      freeVideoIds: [],
      lastActivity: null,
      currentCourse: null,
      showAuthModal: false,
      guestInteractionCount: 0,
      activeTab: 'signin',
      focusMode: false,
      pendingDailyChallenge: false,

      setUser: (user) => set({ user, isAuthenticated: !!user, ...(user ? { showAuthModal: false } : {}) }),
      setAuthConfirmed: () => set({ authConfirmed: true }),
      setLanguage: (language) => set({ language }),
      setTrack: (track) => set({ track }),
      setGrade: (grade) => set({ grade }),
      setGradeChosen: (chosen) => set({ gradeChosen: !!chosen }),
      setDismissedSuggestion: (key) => set({ dismissedSuggestionKey: key }),
      setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
      setTourCompleted: (completed) => set({ tourCompleted: !!completed }),
      setPracticeTipSeen: (seen) => set({ practiceTipSeen: !!seen }),
      setIgPromptSeen: (seen) => set({ igPromptSeen: !!seen }),
      setLanguageChosen: (chosen) => set({ languageChosen: !!chosen }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      enrollInCourse: (course) =>
        set((s) => {
          if (s.enrolledCourses.some((c) => c.id === course.id)) return s;
          return { enrolledCourses: [...s.enrolledCourses, course] };
        }),

      updateProgress: (videoId, progress) =>
        set((s) => ({
          progress: { ...s.progress, [videoId]: { ...s.progress[videoId], ...progress } },
        })),

      recordLessonScore: (lessonId, pct) =>
        set((s) => {
          if (!lessonId) return s;
          const next = applyExerciseScore(s.progress[lessonId], pct, Date.now());
          // `null` = the student didn't beat their record; leave the store alone
          // so a bad round can't overwrite a good one.
          if (!next) return s;
          return { progress: { ...s.progress, [lessonId]: next } };
        }),

      applyChapterTest: (perLesson) =>
        set((s) => {
          const now = Date.now();
          let changed = false;
          const progress = { ...s.progress };
          for (const [lessonId, allCorrect] of Object.entries(perLesson ?? {})) {
            const next = applyChapterTestResult(progress[lessonId], allCorrect, now);
            if (next) { progress[lessonId] = next; changed = true; }
          }
          return changed ? { progress } : s;
        }),

      // The caller (services/masterySync) has already joined this with local
      // state, so it can be taken wholesale.
      mergeRemoteProgress: (progress) => set({ progress: progress ?? {} }),

      recordReviewOutcome: (questionId, correct, meta) =>
        set((s) => {
          // Skip the parser's synthetic `q${index}` fallback ids — they're
          // positional, so "q3" today is a different question tomorrow.
          if (!questionId || /^q\d+$/.test(questionId)) return s;
          const now = Date.now();
          const next = applyReviewOutcome(s.review[questionId], correct, now, meta);
          // `null` = nothing changed (a right answer on a never-missed question).
          if (!next) return s;
          return { review: pruneReview({ ...s.review, [questionId]: next }, now) };
        }),

      mergeRemoteReview: (review) => set({ review: review ?? {} }),

      recordQuizAttempt: (quizId, attempt) =>
        set((s) => ({
          quizAttempts: { ...s.quizAttempts, [quizId]: [...(s.quizAttempts[quizId] || []), attempt] },
        })),

      recordFreeVideoView: (videoId) =>
        set((s) => {
          if (!videoId || s.isAuthenticated || s.freeVideoIds.includes(videoId)) return s;
          return { freeVideoIds: [...s.freeVideoIds, videoId] };
        }),

      recordActivity: (activity) =>
        set((s) => {
          if (!activity?.path || !activity?.title) return s;
          const prev = s.lastActivity;
          if (prev && prev.path === activity.path && prev.title === activity.title) return s;
          return { lastActivity: { ...activity, ts: activity.ts || Date.now() } };
        }),

      clearActivity: () => set({ lastActivity: null }),
      setCurrentCourse: (course) => set({ currentCourse: course }),
      toggleAuthModal: () => set((s) => ({ showAuthModal: !s.showAuthModal })),
      setShowAuthModal: (show) => set({ showAuthModal: !!show }),
      incrementGuestInteraction: () =>
        set((s) => {
          if (s.isAuthenticated) return s;
          const newCount = s.guestInteractionCount + 1;
          return {
            guestInteractionCount: newCount,
            showAuthModal: newCount >= 2 ? true : s.showAuthModal,
          };
        }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setFocusMode: (focus) => set({ focusMode: !!focus }),
      setPendingDailyChallenge: (pending) => set({ pendingDailyChallenge: !!pending }),

      logout: () => set({ ...studentStateReset(), showAuthModal: false }),
    }),
    {
      name: 'edlight-mobile-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        user: s.user,
        isAuthenticated: s.isAuthenticated,
        language: s.language,
        track: s.track,
        grade: s.grade,
        gradeChosen: s.gradeChosen,
        dismissedSuggestionKey: s.dismissedSuggestionKey,
        onboardingCompleted: s.onboardingCompleted,
        tourCompleted: s.tourCompleted,
        practiceTipSeen: s.practiceTipSeen,
        igPromptSeen: s.igPromptSeen,
        languageChosen: s.languageChosen,
        theme: s.theme,
        enrolledCourses: s.enrolledCourses,
        progress: s.progress,
        review: s.review,
        quizAttempts: s.quizAttempts,
        freeVideoIds: s.freeVideoIds,
        lastActivity: s.lastActivity,
        hydrated: s.hydrated,
        guestInteractionCount: s.guestInteractionCount,
      }),
    },
  ),
);

// `hydrated` starts false and is only meaningful once AsyncStorage rehydration
// has finished — flip it true then so first-run gates (language picker,
// onboarding tour) actually fire. Registered after creation to avoid
// referencing `useStore` before its declaration.
if (useStore.persist.hasHydrated()) {
  useStore.setState({ hydrated: true });
} else {
  useStore.persist.onFinishHydration(() => useStore.setState({ hydrated: true }));
}

/**
 * Resolves once the persisted store has been read back from AsyncStorage.
 * The auth gate waits on this before comparing accounts: deciding "is this a
 * different student?" against the pre-hydration defaults would miss a switch,
 * and the later rehydration would then restore the previous student's state
 * over the new one. Never rejects; gives up waiting after `maxMs`.
 */
export function waitForStoreHydration(maxMs = 3000): Promise<void> {
  if (useStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(id); unsub(); resolve(); } };
    const id = setTimeout(finish, maxMs);
    const unsub = useStore.persist.onFinishHydration(finish);
    if (useStore.persist.hasHydrated()) finish();
  });
}

export default useStore;
