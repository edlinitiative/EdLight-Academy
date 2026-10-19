import { useState, useEffect, useCallback } from 'react';
import useStore from '../contexts/store';

// Firebase and progressTracking are loaded inside the effects, and only for a
// signed-in student. Imported statically they put the Firebase SDK on the
// critical path of every course page, including for anonymous visitors, who
// never read progress at all.
const loadProgressDeps = () =>
  Promise.all([import('../services/firebase'), import('../services/progressTracking')]);

/**
 * Hook to get and track user's progress for a specific course.
 * `failed` is true when the read errored (not when there is no progress yet);
 * `retry` reads again.
 */
export function useCourseProgress(courseId) {
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  const { user } = useStore();

  useEffect(() => {
    if (!user?.uid || !courseId) {
      setProgress(null);
      setFailed(false);
      setLoading(false);
      return;
    }
    let alive = true;

    const loadProgress = async () => {
      const [{ getCurrentUser }, { getCourseProgressResult }] = await loadProgressDeps();
      if (!alive) return;
      const authedUid = getCurrentUser()?.uid;
      if (!authedUid || authedUid !== user.uid) {
        setProgress(null);
        setFailed(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await getCourseProgressResult(user.uid, courseId);
      if (!alive) return;
      setProgress(res.data);
      setFailed(res.status === 'error');
      setLoading(false);
    };

    // A rejected chunk import or read must end in `failed` (Réessayer), never
    // an endless `loading` (roadmap §4: no indefinite spinners).
    loadProgress().catch(() => {
      if (!alive) return;
      setFailed(true);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user?.uid, courseId, round]);

  const retry = useCallback(() => setRound((r) => r + 1), []);
  return { progress, loading, failed, retry };
}

/**
 * Hook to get all user's progress across all courses.
 * `failed` is true when the read errored (an empty list is then NOT "no
 * courses opened"); `retry` reads again.
 */
export function useAllProgress() {
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [round, setRound] = useState(0);
  const { user } = useStore();

  useEffect(() => {
    if (!user?.uid) {
      setProgress([]);
      setFailed(false);
      setLoading(false);
      return;
    }
    let alive = true;

    const loadProgress = async () => {
      const [{ getCurrentUser }, { getAllUserProgressResult }] = await loadProgressDeps();
      if (!alive) return;
      const authedUid = getCurrentUser()?.uid;
      if (!authedUid || authedUid !== user.uid) {
        setProgress([]);
        setFailed(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await getAllUserProgressResult(user.uid);
      if (!alive) return;
      setProgress(res.data);
      setFailed(res.status === 'error');
      setLoading(false);
    };

    // A rejected chunk import or read must end in `failed` (Réessayer), never
    // an endless `loading` (roadmap §4: no indefinite spinners).
    loadProgress().catch(() => {
      if (!alive) return;
      setFailed(true);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user?.uid, round]);

  const retry = useCallback(() => setRound((r) => r + 1), []);
  return { progress, loading, failed, retry };
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
