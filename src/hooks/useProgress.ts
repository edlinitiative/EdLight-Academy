import { useState, useEffect } from 'react';
import useStore from '../contexts/store';

// Firebase and progressTracking are loaded inside the effects, and only for a
// signed-in student. Imported statically they put the Firebase SDK on the
// critical path of every course page, including for anonymous visitors, who
// never read progress at all.
const loadProgressDeps = () =>
  Promise.all([import('../services/firebase'), import('../services/progressTracking')]);

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
    let alive = true;

    const loadProgress = async () => {
      const [{ getCurrentUser }, { getCourseProgress }] = await loadProgressDeps();
      if (!alive) return;
      const authedUid = getCurrentUser()?.uid;
      if (!authedUid || authedUid !== user.uid) {
        setProgress(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const data = await getCourseProgress(user.uid, courseId);
      if (!alive) return;
      setProgress(data);
      setLoading(false);
    };

    loadProgress();
    return () => { alive = false; };
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
    let alive = true;

    const loadProgress = async () => {
      const [{ getCurrentUser }, { getAllUserProgress }] = await loadProgressDeps();
      if (!alive) return;
      const authedUid = getCurrentUser()?.uid;
      if (!authedUid || authedUid !== user.uid) {
        setProgress([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const data = await getAllUserProgress(user.uid);
      if (!alive) return;
      setProgress(data);
      setLoading(false);
    };

    loadProgress();
    return () => { alive = false; };
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
