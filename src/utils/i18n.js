import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  ht: {
    translation: {
      common: {
        loading: 'Chajman...',
        error: 'Gen yon erè ki pase',
        close: 'Fèmen',
        save: 'Sove',
        cancel: 'Anile',
        delete: 'Siprime',
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
        fullName: 'Non Konplè',
        forgotPassword: 'Ou bliye modpas ou?',
        noAccount: 'Ou pa gen yon kont?',
        hasAccount: 'Ou gen yon kont deja?'
      },
      courses: {
        catalog: 'Katalòg Kou yo',
        myCourses: 'Kou mwen yo',
        start: 'Kòmanse',
        continue: 'Kontinye',
        preview: 'Apèsi',
        enroll: 'Enskri',
        enrolled: 'Enskri',
        progress: 'Pwogrè',
        completed: 'Konplete',
        modules: 'Modil yo',
        duration: 'Dire',
        instructor: 'Pwofesè',
        students: 'Elèv yo',
        rating: 'Evalyasyon'
      },
      quizzes: {
        start: 'Kòmanse Egzèsis',
        check: 'Verifye Repons',
        correct: 'Korèk!',
        incorrect: 'Pa korèk, eseye ankò',
        hint: 'Èd',
        explanation: 'Eksplikasyon',
        tryAgain: 'Eseye Ankò',
        submit: 'Soumèt',
        score: 'Nòt'
      }
    }
  },
  fr: {
    translation: {
      common: {
        loading: 'Chargement...',
        error: 'Une erreur est survenue',
        close: 'Fermer',
        save: 'Enregistrer',
        cancel: 'Annuler',
        delete: 'Supprimer',
        edit: 'Modifier',
        next: 'Suivant',
        previous: 'Précédent',
        search: 'Rechercher',
        all: 'Tous',
        none: 'Aucun',
        required: 'Obligatoire'
      },
      auth: {
        signIn: 'Se connecter',
        signUp: 'S\'inscrire',
        signOut: 'Se déconnecter',
        email: 'Email',
        password: 'Mot de passe',
        fullName: 'Nom complet',
        forgotPassword: 'Mot de passe oublié?',
        noAccount: 'Pas de compte?',
        hasAccount: 'Déjà un compte?'
      },
      courses: {
        catalog: 'Catalogue des cours',
        myCourses: 'Mes cours',
        start: 'Commencer',
        continue: 'Continuer',
        preview: 'Aperçu',
        enroll: 'S\'inscrire',
        enrolled: 'Inscrit',
        progress: 'Progrès',
        completed: 'Terminé',
        modules: 'Modules',
        duration: 'Durée',
        instructor: 'Instructeur',
        students: 'Étudiants',
        rating: 'Note'
      },
      quizzes: {
        start: 'Commencer l\'exercice',
        check: 'Vérifier la réponse',
        correct: 'Correct!',
        incorrect: 'Incorrect, essayez encore',
        hint: 'Indice',
        explanation: 'Explication',
        tryAgain: 'Réessayer',
        submit: 'Soumettre',
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
      lng: 'ht', // default language
      fallbackLng: 'fr',
      interpolation: {
        escapeValue: false
      }
    });
}