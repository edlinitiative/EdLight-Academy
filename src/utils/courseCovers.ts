/**
 * One chosen frame per course for its catalogue card.
 *
 * The card used to take whichever lesson sat a third of the way into the
 * course, so the covers were luck: a nearly blank board, writing cut off at
 * the edge, or the iPad's colour-picker menu open over the board. These were
 * picked from every lesson's frames (YouTube's own still plus its three
 * automatic mid-video frames), scored for a readable amount of writing, no
 * writing cut at the sides and no menu, then checked by eye.
 *
 * Values are `{videoId}/{frame}` on i.ytimg.com (already in the CSP's
 * img-src). `sd*` is 640×480 with the 16:9 picture letterboxed in the middle,
 * so cards crop it centred; ~50 KB, sharp on a 2× screen at card size.
 *
 * A course missing here (a new one) falls back to the automatic frame.
 */
const COURSE_COVER_FRAMES: Record<string, string> = {
  'math-ns1': 'eLmxna326QM/sddefault',
  'math-ns2': 'bms0NxhaUDg/sddefault',
  'math-ns3': 'k3PgXLur2CU/sddefault',
  'math-ns4': 'ztUcXCU82pA/sd1',
  'econ-ns1': 'HNOuKpOp1AE/sd3',
  'econ-ns2': 'BePNgqPtwl0/sddefault',
  'econ-ns3': 'fQjfPyOYK48/sd2',
  'econ-ns4': 'bh8l5kXnXkU/sddefault',
  'chem-ns1': 'Xe0jGLMZoXg/sddefault',
};

export function courseCover(courseId?: string | null): string | null {
  const frame = courseId ? COURSE_COVER_FRAMES[courseId] : undefined;
  return frame ? `https://i.ytimg.com/vi/${frame}.jpg` : null;
}
