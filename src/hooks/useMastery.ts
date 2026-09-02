import { useCallback, useEffect, useState } from 'react';
import useStore from '../contexts/store';
import { getCurrentUser } from '../services/firebase';
import { readCourseMastery } from '../services/masteryService';
import type { ProgressMap } from '../../shared/mastery';

/**
 * The mastery map for the signed-in student.
 *
 * WHY THIS EXISTS RATHER THAN READING `progress` DIRECTLY. The obvious move is
 * to derive mastery from the per-course progress doc that `useCourseProgress`
 * already fetched — it's right there, and it costs no read. But mastery does
 * not live there: it lives in `users/{uid}/mastery/lessons`, the one document
 * the MOBILE app also writes, so that a lesson practised on a phone and the
 * same lesson practised in a browser are one record instead of two. Deriving
 * it from the progress doc would silently cap every lesson at `seen` (the only
 * rung `completedLessons` can prove) and the three earned rungs would render
 * as if nobody had ever earned one.
 *
 * The returned map covers ALL courses — it is a single document — so passing a
 * courseId only decides whose legacy `completedLessons` get folded in for the
 * `seen` rung. Callers index it by lesson id.
 *
 * Signed out, it's `{}`: mastery is a claim about a person, and there's nobody
 * to make it about. The surfaces all render `none` as nothing at all, so an
 * anonymous visitor sees a clean lesson list rather than a locked one.
 */
export function useCourseMastery(courseId?: string | null) {
  const [mastery, setMastery] = useState<ProgressMap>({});
  const [loading, setLoading] = useState(true);
  const user = useStore((s: any) => s.user);

  const load = useCallback(async () => {
    // Same guard as useCourseProgress: the store's user can outlive the
    // Firebase session (it's persisted), and reading with a stale uid would
    // just be denied by the rules.
    const authedUid = getCurrentUser()?.uid;
    if (!user?.uid || !authedUid || authedUid !== user.uid) {
      setMastery({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const map = await readCourseMastery(user.uid, courseId);
    setMastery(map);
    setLoading(false);
  }, [user?.uid, courseId]);

  useEffect(() => {
    load();
  }, [load]);

  // Exposed so a surface that just finished a quiz can pull the new rung in
  // without a full remount — the write happens in UnitQuiz, which has no way
  // to reach back into whoever is rendering the ladder.
  return { mastery, loading, refresh: load };
}

export default useCourseMastery;
