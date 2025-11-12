import { useState, useEffect } from 'react';
import { getCourseProgress, getAllUserProgress } from '../services/progressTracking';
import useStore from '../contexts/store';

/**
 * Hook to get and track user's progress for a specific course
 */
export function useCourseProgress(courseId) {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useStore();
  
  useEffect(() => {
    if (!user?.uid || !courseId) {
      setProgress(null);
      setLoading(false);
      return;
    }
    
    const loadProgress = async () => {
      setLoading(true);
      const data = await getCourseProgress(user.uid, courseId);
      setProgress(data);
      setLoading(false);
    };
    
    loadProgress();
  }, [user?.uid, courseId]);
  
  return { progress, loading };
}

/**
 * Hook to get all user's progress across all courses
 */
export function useAllProgress() {
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useStore();
  
  useEffect(() => {
    if (!user?.uid) {
      setProgress([]);
      setLoading(false);
      return;
    }
    
    const loadProgress = async () => {
      setLoading(true);
      const data = await getAllUserProgress(user.uid);
      setProgress(data);
      setLoading(false);
    };
    
    loadProgress();
  }, [user?.uid]);
  
  return { progress, loading };
}

/**
 * Calculate course completion percentage
 */
export function calculateCompletionPercentage(progress, totalLessons) {
  if (!progress || !totalLessons) return 0;
  
  const completedCount = progress.completedLessons?.length || 0;
  return Math.round((completedCount / totalLessons) * 100);
}

/**
 * Check if a lesson is completed
 */
export function isLessonCompleted(progress, lessonId) {
  if (!progress) return false;
  return progress.completedLessons?.includes(lessonId) || false;
}

/**
 * Get quiz best score
 */
export function getQuizBestScore(progress, quizId) {
  if (!progress || !progress.quizAttempts?.[quizId]) return null;
  
  const attempts = progress.quizAttempts[quizId].attempts;
  if (!attempts || attempts.length === 0) return null;
  
  let bestScore = 0;
  let bestAttempt = null;
  
  attempts.forEach(attempt => {
    const percentage = (attempt.score / attempt.totalQuestions) * 100;
    if (percentage > bestScore) {
      bestScore = percentage;
      bestAttempt = attempt;
    }
  });
  
  return bestAttempt;
}

/**
 * Get total quiz attempts
 */
export function getQuizAttemptCount(progress, quizId) {
  if (!progress || !progress.quizAttempts?.[quizId]) return 0;
  return progress.quizAttempts[quizId].attempts?.length || 0;
}
