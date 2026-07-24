import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FREE_VIDEO_LIMIT = 3;

export interface LastActivity {
  type: 'lesson' | 'exam' | 'quiz';
  path: string;
  /** For exams: the exam's level, needed to deep-link into ExamTake on resume. */
  level?: string;
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
  onboardingCompleted: boolean;
  tourCompleted: boolean;
  practiceTipSeen: boolean;
  languageChosen: boolean;
  theme: 'light' | 'dark';
  enrolledCourses: any[];
  progress: Record<string, any>;
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
  setOnboardingCompleted: (completed: boolean) => void;
  setTourCompleted: (completed: boolean) => void;
  setPracticeTipSeen: (seen: boolean) => void;
  setLanguageChosen: (chosen: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  enrollInCourse: (course: any) => void;
  updateProgress: (videoId: string, progress: any) => void;
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

const useStore = create<AppState>()(
  persist(
    (set, _get) => ({
      user: null,
      isAuthenticated: false,
      authConfirmed: false,
      language: 'fr',
      hydrated: false,
      track: null,
      onboardingCompleted: false,
      tourCompleted: false,
      practiceTipSeen: false,
      languageChosen: false,
      theme: 'light',
      enrolledCourses: [],
      progress: {},
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
      setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
      setTourCompleted: (completed) => set({ tourCompleted: !!completed }),
      setPracticeTipSeen: (seen) => set({ practiceTipSeen: !!seen }),
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

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          track: null,
          onboardingCompleted: false,
          currentCourse: null,
          enrolledCourses: [],
          progress: {},
          quizAttempts: {},
          lastActivity: null,
          showAuthModal: false,
        }),
    }),
    {
      name: 'edlight-mobile-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        user: s.user,
        isAuthenticated: s.isAuthenticated,
        language: s.language,
        track: s.track,
        onboardingCompleted: s.onboardingCompleted,
        tourCompleted: s.tourCompleted,
        practiceTipSeen: s.practiceTipSeen,
        languageChosen: s.languageChosen,
        theme: s.theme,
        enrolledCourses: s.enrolledCourses,
        progress: s.progress,
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

export default useStore;
