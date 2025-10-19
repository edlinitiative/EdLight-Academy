import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import useStore from '../contexts/store';

export function useLanguage() {
  const { i18n } = useTranslation();
  const language = useStore(state => state.language);
  
  useEffect(() => {
    i18n.changeLanguage(language);
  }, [language, i18n]);
  
  return {
    currentLanguage: language,
    isCreole: language === 'ht',
    isFrench: language === 'fr',
    toggleLanguage: () => {
      const newLang = language === 'ht' ? 'fr' : 'ht';
      useStore.getState().setLanguage(newLang);
    }
  };
}

export function useProgressTracking() {
  const { progress, updateProgress } = useStore();
  
  return {
    markVideoComplete: (videoId) => {
      updateProgress(videoId, { completed: true, lastWatched: new Date() });
    },
    
    updateWatchTime: (videoId, timeInSeconds) => {
      const currentProgress = progress[videoId] || {};
      updateProgress(videoId, {
        ...currentProgress,
        watchTime: timeInSeconds,
        lastWatched: new Date()
      });
    },
    
    getVideoProgress: (videoId) => progress[videoId] || { completed: false, watchTime: 0 }
  };
}

export function useQuizTracking() {
  const { quizAttempts, recordQuizAttempt } = useStore();
  
  return {
    submitQuizAttempt: (quizId, { answer, isCorrect }) => {
      recordQuizAttempt(quizId, {
        date: new Date(),
        score: isCorrect ? 1 : 0,
        answer
      });
    },
    
    getQuizStats: (quizId) => {
      const attempts = quizAttempts[quizId] || [];
      return {
        totalAttempts: attempts.length,
        correctAttempts: attempts.filter(a => a.score === 1).length,
        lastAttempt: attempts[attempts.length - 1],
        mastered: attempts.some(a => a.score === 1)
      };
    }
  };
}