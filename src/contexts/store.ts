import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Number of course videos an anonymous (signed-out) visitor may watch for free
// before being asked to create an account.
export const FREE_VIDEO_LIMIT = 3;

/** A resumable point in the product ("Reprendre où vous étiez"). */
export interface LastActivity {
  type: 'lesson' | 'exam' | 'quiz';
  path: string;          // route to return to
  title: string;         // primary label (lesson/exam/course title)
  subtitle?: string;     // secondary label (course name, subject…)
  ts: number;            // when it was last touched (ms)
}

/** Shape of the global application store (state + actions). */
export interface AppState {
  // User state
  user: any;
  isAuthenticated: boolean;
  /** True once Firebase's onAuthStateChanged has fired at least once this session. */
  authConfirmed: boolean;
  language: string;
  hydrated: boolean;
  track: string | null;
  onboardingCompleted: boolean;
  languageChosen: boolean;
  theme: 'light' | 'dark';

  // Course progress
  enrolledCourses: any[];
  progress: Record<string, any>;
  quizAttempts: Record<string, any[]>;
  freeVideoIds: string[];
  lastActivity: LastActivity | null;

  // UI state
  currentCourse: any;
  showAuthModal: boolean;
  showUserDropdown: boolean;
  showCourseModal: boolean;
  showMobileMenu: boolean;
  showNotifications: boolean;
  activeTab: string;
  // Transient (never persisted): a focused task — taking a quiz, a trivia round,
  // a lesson — asks the Layout to shed distracting chrome (the mobile bottom tab
  // bar + footer) so the task owns the screen.
  focusMode: boolean;

  // Actions
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
  toggleUserDropdown: () => void;
  setShowUserDropdown: (show: boolean) => void;
  toggleCourseModal: () => void;
  setActiveTab: (tab: string) => void;
  toggleMobileMenu: () => void;
  setShowMobileMenu: (show: boolean) => void;
  toggleNotifications: () => void;
  setShowNotifications: (show: boolean) => void;
  setFocusMode: (focus: boolean) => void;
  logout: () => void;
}

const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // User state
      user: null,
      isAuthenticated: false,
      authConfirmed: false,
      language: 'fr', // Langue par défaut : français
      hydrated: false,
      track: null, // Bac track: 'SVT' | 'SMP' | 'SES' | 'LET' | 'ARTS' | null
      onboardingCompleted: false,
      languageChosen: false, // first-run language picker has been answered
      theme: 'light', // 'light' | 'dark' — Night Shift
      
      // Course progress
      enrolledCourses: [],
      progress: {}, // videoId -> { completed: boolean, watchTime: number }
      quizAttempts: {}, // quizId -> [{ score: number, date: Date }]
      freeVideoIds: [], // distinct video lessons watched while signed out (free preview)
      lastActivity: null, // most recent resumable point ("Reprendre où vous étiez")
      
      // UI state
      currentCourse: null,
      showAuthModal: false,
      showUserDropdown: false,
      showCourseModal: false,
      showMobileMenu: false,
      showNotifications: false,
      activeTab: 'signin',
      focusMode: false, // transient: set by useFocusMode while a task is active
      
      // Actions
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setAuthConfirmed: () => set({ authConfirmed: true }),
      setLanguage: (language) => set({ language }),
      setTrack: (track) => set({ track }),
      setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
      setLanguageChosen: (chosen) => set({ languageChosen: !!chosen }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      
      enrollInCourse: (course) =>
        set((state) => {
          if (state.enrolledCourses.some(c => c.id === course.id)) return state;
          return { enrolledCourses: [...state.enrolledCourses, course] };
        }),
        
      updateProgress: (videoId, progress) =>
        set((state) => ({
          progress: {
            ...state.progress,
            [videoId]: { ...state.progress[videoId], ...progress }
          }
        })),
        
      recordQuizAttempt: (quizId, attempt) =>
        set((state) => ({
          quizAttempts: {
            ...state.quizAttempts,
            [quizId]: [...(state.quizAttempts[quizId] || []), attempt]
          }
        })),

      // Track a distinct video watched by a signed-out visitor (free preview).
      recordFreeVideoView: (videoId) =>
        set((state) => {
          if (!videoId || state.isAuthenticated) return state;
          if (state.freeVideoIds.includes(videoId)) return state;
          return { freeVideoIds: [...state.freeVideoIds, videoId] };
        }),

      // Remember the most recent resumable point. Ignores no-op updates to the
      // same path so we don't thrash persisted storage on every re-render.
      recordActivity: (activity) =>
        set((state) => {
          if (!activity?.path || !activity?.title) return state;
          const prev = state.lastActivity;
          if (prev && prev.path === activity.path && prev.title === activity.title) {
            return state;
          }
          return { lastActivity: { ...activity, ts: activity.ts || Date.now() } };
        }),

      clearActivity: () => set({ lastActivity: null }),
        
      setCurrentCourse: (course) => set({ currentCourse: course }),
      toggleAuthModal: () => set((state) => ({ showAuthModal: !state.showAuthModal })),
      setShowAuthModal: (show) => set({ showAuthModal: !!show }),
      toggleUserDropdown: () => set((state) => ({ showUserDropdown: !state.showUserDropdown })),
      setShowUserDropdown: (show) => set({ showUserDropdown: show }),
      toggleCourseModal: () => set((state) => ({ showCourseModal: !state.showCourseModal })),
      setActiveTab: (tab) => set({ activeTab: tab }),
      toggleMobileMenu: () => set((state) => ({ showMobileMenu: !state.showMobileMenu })),
      setShowMobileMenu: (show) => set({ showMobileMenu: !!show }),
      toggleNotifications: () => set((state) => ({ showNotifications: !state.showNotifications })),
      setShowNotifications: (show) => set({ showNotifications: !!show }),
      setFocusMode: (focus) => set({ focusMode: !!focus }),
      
      logout: () => set({
        user: null,
        isAuthenticated: false,
        track: null,
        onboardingCompleted: false,
        currentCourse: null,
        enrolledCourses: [],
        progress: {},
        quizAttempts: {},
        lastActivity: null,
        showUserDropdown: false,
        showAuthModal: false,
        showCourseModal: false,
        showMobileMenu: false,
        showNotifications: false
      })
    }),
    {
      name: 'edlight-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        language: state.language,
        track: state.track,
        onboardingCompleted: state.onboardingCompleted,
        languageChosen: state.languageChosen,
        theme: state.theme,
        enrolledCourses: state.enrolledCourses,
        progress: state.progress,
        quizAttempts: state.quizAttempts,
        freeVideoIds: state.freeVideoIds,
        lastActivity: state.lastActivity,
        hydrated: state.hydrated
      })
      // Note: Avoid using onRehydrateStorage here because set/get are out of scope.
      // We'll mark hydrated in src/index.js after boot to prevent auth flicker.
    }
  )
);

export default useStore;