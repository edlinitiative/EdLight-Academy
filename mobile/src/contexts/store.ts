import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FREE_VIDEO_LIMIT = 3;

export interface LastActivity {
  type: 'lesson' | 'exam' | 'quiz';
  path: string;
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

  setUser: (user: any) => void;
  setAuthConfirmed: () => void;
  setLanguage: (language: string) => void;
  setTrack: (track: string | null) => void;
  setOnboardingCompleted: (completed: boolean) => void;
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

      setUser: (user) => set({ user, isAuthenticated: !!user, ...(user ? { showAuthModal: false } : {}) }),
      setAuthConfirmed: () => set({ authConfirmed: true }),
      setLanguage: (language) => set({ language }),
      setTrack: (track) => set({ track }),
      setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
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

export default useStore;
