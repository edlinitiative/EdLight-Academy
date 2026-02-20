import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(
  persist(
    (set, get) => ({
      // User state
      user: null,
      isAuthenticated: false,
      language: 'fr', // Langue par défaut : français
      hydrated: false,
      track: null, // Bac track: 'SVT' | 'SMP' | 'SES' | 'LET' | 'ARTS' | null
      onboardingCompleted: false,
      
      // Course progress
      enrolledCourses: [],
      progress: {}, // videoId -> { completed: boolean, watchTime: number }
      quizAttempts: {}, // quizId -> [{ score: number, date: Date }]
      
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
        
      setCurrentCourse: (course) => set({ currentCourse: course }),
      toggleAuthModal: () => set((state) => ({ showAuthModal: !state.showAuthModal })),
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
        enrolledCourses: state.enrolledCourses,
        progress: state.progress,
        quizAttempts: state.quizAttempts,
        hydrated: state.hydrated
      })
      // Note: Avoid using onRehydrateStorage here because set/get are out of scope.
      // We'll mark hydrated in src/index.js after boot to prevent auth flicker.
    }
  )
);

export default useStore;