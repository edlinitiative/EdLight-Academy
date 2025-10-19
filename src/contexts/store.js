import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(
  persist(
    (set) => ({
      // User state
      user: null,
      isAuthenticated: false,
      language: 'ht', // Default to Haitian Creole
      
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
      
      enrollInCourse: (course) =>
        set((state) => ({
          enrolledCourses: [...state.enrolledCourses, course]
        })),
        
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
        currentCourse: null
      })
    }),
    {
      name: 'edlight-storage',
      partialize: (state) => ({
        user: state.user,
        language: state.language,
        enrolledCourses: state.enrolledCourses,
        progress: state.progress,
        quizAttempts: state.quizAttempts
      })
    }
  )
);

export default useStore;