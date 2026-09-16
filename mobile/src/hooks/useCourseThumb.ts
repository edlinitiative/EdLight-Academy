import { useMemo, useState } from 'react';
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
 *   const { uri, onError } = useCourseThumb(course);
 *   {uri ? <Image source={{ uri }} onError={onError} /> : <SubjectIcon />}
 */
export function useCourseThumb(course: any): { uri: string | null; onError: () => void } {
  const candidates = useMemo(() => courseVideoThumbs(course), [course]);
  const [attempt, setAttempt] = useState(0);
  return {
    uri: candidates[attempt] ?? null,
    onError: () => setAttempt((a) => a + 1),
  };
}

export default useCourseThumb;
