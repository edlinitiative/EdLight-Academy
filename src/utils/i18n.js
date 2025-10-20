import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      common: {
        loading: 'Loading...',
        error: 'An error occurred',
        close: 'Close',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        next: 'Next',
        previous: 'Previous',
        search: 'Search',
        all: 'All',
        none: 'None',
        required: 'Required'
      },
      auth: {
        signIn: 'Sign In',
        signUp: 'Sign Up',
        signOut: 'Sign Out',
        email: 'Email',
        password: 'Password',
        fullName: 'Full Name',
        forgotPassword: 'Forgot Password?',
        noAccount: "Don't have an account?",
        hasAccount: 'Already have an account?'
      },
      courses: {
        catalog: 'Course Catalog',
        myCourses: 'My Courses',
        start: 'Start',
        continue: 'Continue',
        preview: 'Preview',
        enroll: 'Enroll',
        enrolled: 'Enrolled',
        progress: 'Progress',
        completed: 'Completed',
        modules: 'Modules',
        duration: 'Duration',
        instructor: 'Instructor',
        students: 'Students',
        rating: 'Rating'
      },
      quizzes: {
        start: 'Start Quiz',
        check: 'Check Answer',
        correct: 'Correct!',
        incorrect: 'Incorrect, try again',
        hint: 'Hint',
        explanation: 'Explanation',
        tryAgain: 'Try Again',
        submit: 'Submit',
        score: 'Score'
      }
    }
  }
};

export function initI18n() {
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: 'en', // default language
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false
      }
    });
}