/**
 * One chosen frame per course for its cover — ported from the web
 * (src/utils/courseCovers.ts). Keep the two maps identical.
 *
 * Without it a card took whichever lesson came first, so covers were luck: a
 * nearly blank board, writing cut off at the edge, or the iPad's colour-picker
 * menu open over the board (Math NS1 on Home and Cours). These frames were
 * picked from every lesson's stills, scored for a readable amount of writing,
 * then checked by eye.
 *
 * Values are `{videoId}/{frame}` on i.ytimg.com. `sd*` is 640×480 with the
 * 16:9 picture letterboxed in the middle, so render it into a 16:9 box with
 * `resizeMode="cover"` (VideoCover does), which crops the bars.
 *
 * A course missing here (a new one) falls back to its first lesson's still.
 */
export const COURSE_COVER_FRAMES: Readonly<Record<string, string>> = {
  'math-ns1': 'eLmxna326QM/sddefault',
  'math-ns2': 'bms0NxhaUDg/sddefault',
  'math-ns3': 'd8zrnduv0Gc/sd1',
  'math-ns4': 'JH_sSDwehqo/sd3',
  'econ-ns1': 's8V74XR5BcY/sd2',
  'econ-ns2': 'zy68zhmLVS0/sd3',
  'econ-ns3': 'AqIcMfBkjzA/sddefault',
  'econ-ns4': 'bh8l5kXnXkU/sd1',
  'chem-ns1': 'Xe0jGLMZoXg/sddefault',
};

/** The hand-picked cover URL for a course id, or null when none was chosen. */
export function courseCover(courseId?: string | null): string | null {
  const key = String(courseId ?? '').trim().toLowerCase();
  const frame = key ? COURSE_COVER_FRAMES[key] : undefined;
  return frame ? `https://i.ytimg.com/vi/${frame}.jpg` : null;
}

/** Same, from a course object: tries `id`, then `code` ("MATH-NS1"). */
export function courseCoverFor(course: any): string | null {
  return courseCover(course?.id) ?? courseCover(course?.code);
}
