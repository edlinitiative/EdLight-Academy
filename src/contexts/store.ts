import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Number of course videos an anonymous (signed-out) visitor may watch for free
// before being asked to create an account.
export const FREE_VIDEO_LIMIT = 3;

/** Shape of the global application store (state + actions). */
export interface AppState {
  // User state
  user: any;
  isAuthenticated: boolean;
  language: string;
  hydrated: boolean;
  track: string | null;
  onboardingCompleted: boolean;
  theme: 'light' | 'dark';

  // Course progress
  enrolledCourses: any[];
  progress: Record<string, any>;
  quizAttempts: Record<string, any[]>;
  freeVideoIds: string[];

  // UI state
  currentCourse: any;
  showAuthModal: boolean;
  showUserDropdown: boolean;
  showCourseModal: boolean;
  activeTab: string;

  // Actions
  setUser: (user: any) => void;
  setLanguage: (language: string) => void;
  setTrack: (track: string | null) => void;
  setOnboardingCompleted: (completed: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  enrollInCourse: (course: any) => void;
  updateProgress: (videoId: string, progress: any) => void;
  recordQuizAttempt: (quizId: string, attempt: any) => void;
  recordFreeVideoView: (videoId: string) => void;
  setCurrentCourse: (course: any) => void;
  toggleAuthModal: () => void;
  setShowAuthModal: (show: boolean) => void;
  toggleUserDropdown: () => void;
  setShowUserDropdown: (show: boolean) => void;
  toggleCourseModal: () => void;
  setActiveTab: (tab: string) => void;
  logout: () => void;
}

const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // User state
      user: null,
      isAuthenticated: false,
      language: 'fr', // Langue par défaut : français
      hydrated: false,
      track: null, // Bac track: 'SVT' | 'SMP' | 'SES' | 'LET' | 'ARTS' | null
      onboardingCompleted: false,
      theme: 'light', // 'light' | 'dark' — Night Shift
      
      // Course progress
      enrolledCourses: [],
      progress: {}, // videoId -> { completed: boolean, watchTime: number }
      quizAttempts: {}, // quizId -> [{ score: number, date: Date }]
      freeVideoIds: [], // distinct video lessons watched while signed out (free preview)
      
      // UI state
      currentCourse: null,
      showAuthModal: false,
      showUserDropdown: false,
      showCourseModal: false,
      activeTab: 'signin',
      
      // Actions
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setLanguage: (language) => set({ language }),
      setTrack: (track) => set({ track }),
      setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
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
        
      setCurrentCourse: (course) => set({ currentCourse: course }),
      toggleAuthModal: () => set((state) => ({ showAuthModal: !state.showAuthModal })),
      setShowAuthModal: (show) => set({ showAuthModal: !!show }),
      toggleUserDropdown: () => set((state) => ({ showUserDropdown: !state.showUserDropdown })),
      setShowUserDropdown: (show) => set({ showUserDropdown: show }),
      toggleCourseModal: () => set((state) => ({ showCourseModal: !state.showCourseModal })),
      setActiveTab: (tab) => set({ activeTab: tab }),
      
      logout: () => set({
        user: null,
        isAuthenticated: false,
        track: null,
        onboardingCompleted: false,
        currentCourse: null,
        enrolledCourses: [],
        progress: {},
        quizAttempts: {},
        showUserDropdown: false,
        showAuthModal: false,
        showCourseModal: false
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
        theme: state.theme,
        enrolledCourses: state.enrolledCourses,
        progress: state.progress,
        quizAttempts: state.quizAttempts,
        freeVideoIds: state.freeVideoIds,
        hydrated: state.hydrated
      })
      // Note: Avoid using onRehydrateStorage here because set/get are out of scope.
      // We'll mark hydrated in src/index.js after boot to prevent auth flicker.
    }
  )
);

export default useStore;