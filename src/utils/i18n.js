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
  },
  fr: {
    translation: {
      common: {
        loading: 'Chargement…',
        error: 'Une erreur est survenue',
        close: 'Fermer',
        save: 'Enregistrer',
        cancel: 'Annuler',
        delete: 'Supprimer',
        edit: 'Modifier',
        next: 'Suivant',
        previous: 'Précédent',
        search: 'Rechercher',
        all: 'Tout',
        none: 'Aucun',
        required: 'Obligatoire'
      },
      auth: {
        signIn: 'Se connecter',
        signUp: "S’inscrire",
        signOut: 'Se déconnecter',
        email: 'Email',
        password: 'Mot de passe',
        fullName: 'Nom complet',
        forgotPassword: 'Mot de passe oublié ?',
        noAccount: "Pas de compte ?",
        hasAccount: 'Déjà un compte ?'
      },
      courses: {
        catalog: 'Catalogue des cours',
        myCourses: 'Mes cours',
        start: 'Commencer',
        continue: 'Continuer',
        preview: 'Aperçu',
        enroll: "S’inscrire",
        enrolled: 'Inscrit',
        progress: 'Progression',
        completed: 'Terminé',
        modules: 'Modules',
        duration: 'Durée',
        instructor: 'Enseignant',
        students: 'Élèves',
        rating: 'Note'
      },
      quizzes: {
        start: 'Démarrer le quiz',
        check: 'Vérifier',
        correct: 'Correct !',
        incorrect: 'Incorrect, réessaie',
        hint: 'Indice',
        explanation: 'Explication',
        tryAgain: 'Réessayer',
        submit: 'Envoyer',
        score: 'Score'
      }
    }
  },
  ht: {
    translation: {
      common: {
        loading: 'Ap chaje…',
        error: 'Gen yon erè ki rive',
        close: 'Fèmen',
        save: 'Sove',
        cancel: 'Anile',
        delete: 'Efase',
        edit: 'Modifye',
        next: 'Pwochen',
        previous: 'Anvan',
        search: 'Chèche',
        all: 'Tout',
        none: 'Okenn',
        required: 'Obligatwa'
      },
      auth: {
        signIn: 'Konekte',
        signUp: 'Enskri',
        signOut: 'Dekonekte',
        email: 'Imèl',
        password: 'Modpas',
        fullName: 'Non konplè',
        forgotPassword: 'Ou bliye modpas la?',
        noAccount: 'Ou pa gen kont?',
        hasAccount: 'Ou deja gen kont?'
      },
      courses: {
        catalog: 'Katalòg kou yo',
        myCourses: 'Kou mwen yo',
        start: 'Kòmanse',
        continue: 'Kontinye',
        preview: 'Gade yon ti apèsi',
        enroll: 'Enskri',
        enrolled: 'Ou enskri',
        progress: 'Pwogrè',
        completed: 'Fini',
        modules: 'Modil',
        duration: 'Dire',
        instructor: 'Pwofesè',
        students: 'Elèv',
        rating: 'Nòt'
      },
      quizzes: {
        start: 'Kòmanse kesyon yo',
        check: 'Verifye',
        correct: 'Bon!',
        incorrect: 'Pa bon, eseye ankò',
        hint: 'Endis',
        explanation: 'Eksplikasyon',
        tryAgain: 'Esaye ankò',
        submit: 'Voye',
        score: 'Nòt'
      }
    }
  }
};

function getInitialLanguage() {
  // Prefer persisted language from Zustand store.
  try {
    const raw = localStorage.getItem('edlight-storage');
    if (raw) {
      const parsed = JSON.parse(raw);
      const lang = parsed?.state?.language;
      if (lang === 'fr' || lang === 'ht') return lang;
      if (lang === 'en') return 'fr';
    }
  } catch {
    // ignore
  }

  // Next: derive from browser, otherwise default to French.
  const navLang = (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || '';
  const normalized = String(navLang).toLowerCase();
  if (normalized.startsWith('ht')) return 'ht';
  if (normalized.startsWith('fr')) return 'fr';
  return 'fr';
}

export function initI18n() {
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: getInitialLanguage(),
      supportedLngs: ['fr', 'ht', 'en'],
      fallbackLng: 'fr',
      interpolation: {
        escapeValue: false
      }
    });
}