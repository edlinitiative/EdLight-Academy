import { useEffect, useMemo, useState } from 'react';
import { courseVideoThumbs } from '../utils/videoThumb';

/**
 * A course's video still at the sharpest resolution YouTube actually serves.
 *
 * `videoThumb` exposes two shapes: a single always-present `mqdefault` (320×180)
 * and an ordered candidate list that leads with `hq720` (1280×720). Only the
 * Cours-en-vidéo rail used the list — every other surface, including the two
 * LARGEST images in the app (the Home "what now?" hero and the CourseDetail
 * hero), took the 320px still and upscaled it. At full card width on a 3x phone
 * that is roughly a 3.7× stretch, which is why handwritten lesson stills
 * arrived as mush ("this main image is low quality", TestFlight 2026-09-16).
 *
 * `hq720` is not served for every upload, so a consumer cannot simply hardcode
 * it: this walks down the candidates on each load failure and reports `null`
 * once they are exhausted, letting the caller fall back to its icon placeholder.
 *
 * The hand-picked cover (utils/courseCovers, ported from the web) leads the
 * list, so Math NS1 no longer opens on the iPad colour-picker frame.
 *
 *   const { uri, onError } = useCourseThumb(course);
 *   {uri ? <Image source={{ uri }} onError={onError} /> : <SubjectIcon />}
 */
export function useCourseThumb(course: any): { uri: string | null; onError: () => void } {
  const candidates = useMemo(() => courseVideoThumbs(course), [course]);
  return useThumbCandidates(candidates);
}

/**
 * Walk an ordered list of image candidates: `uri` is the current one, and
 * `onError` steps to the next. `null` once exhausted. Restarts when the list
 * changes (a recycled list row showing a different course).
 */
export function useThumbCandidates(candidates: readonly string[]): { uri: string | null; onError: () => void } {
  const key = candidates.join('|');
  const [state, setState] = useState({ key, attempt: 0 });
  useEffect(() => {
    if (state.key !== key) setState({ key, attempt: 0 });
  }, [key, state.key]);
  const attempt = state.key === key ? state.attempt : 0;
  return {
    uri: candidates[attempt] ?? null,
    onError: () => setState((s) => ({ key, attempt: (s.key === key ? s.attempt : 0) + 1 })),
  };
}

export default useCourseThumb;
