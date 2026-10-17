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
type Cover = { frame: string; position?: string };

// Re-curated 2026-10-17 (learning-journey audit #4): every still of every
// lesson was scored and the finalists judged by eye at card size. Each is a
// real frame of a lesson in that course — no stock or invented artwork.
//   course     lesson the frame comes from
//   math-ns1   U5 L3 Trigonométrie — the trigonometric circle
//   math-ns2   U3 L5 Arcs remarquables — the unit circle with its arcs
//   math-ns3   U1 L5 Produit scalaire (dimension 3) — two vectors, big writing
//   math-ns4   U3 L2 Dérivées et fonctions — the derivative as a limit
//   chem-ns1   U3 L3 Masse volumique et molaire — the crystal lattice
//   econ-ns1   U1 L2 Notion d'offre — supply table and curve
//   econ-ns2   U6 L2 Circuit économique — the circular-flow diagram
//   econ-ns3   U2 L2 Déplacement de la courbe de demande — the shifted curves
//   econ-ns4   U2 L1 Produit intérieur brut — the PIB formulas
// `position` is an optional object-position for the 16:9 card crop. All nine
// were chosen with their content already centred, and the stills are 16:9
// pictures letterboxed in 4:3, so any offset from centre shows a black bar —
// leave it unset unless a future frame really needs it.
const COURSE_COVERS: Record<string, Cover> = {
  'math-ns1': { frame: 'eLmxna326QM/sddefault' },
  'math-ns2': { frame: 'bms0NxhaUDg/sddefault' },
  'math-ns3': { frame: 'd8zrnduv0Gc/sd1' },
  'math-ns4': { frame: 'JH_sSDwehqo/sd3' },
  'chem-ns1': { frame: 'Xe0jGLMZoXg/sddefault' },
  'econ-ns1': { frame: 's8V74XR5BcY/sd2' },
  'econ-ns2': { frame: 'zy68zhmLVS0/sd3' },
  'econ-ns3': { frame: 'AqIcMfBkjzA/sddefault' },
  'econ-ns4': { frame: 'bh8l5kXnXkU/sd1' },
};

export function courseCover(courseId?: string | null): string | null {
  const cover = courseId ? COURSE_COVERS[courseId] : undefined;
  return cover ? `https://i.ytimg.com/vi/${cover.frame}.jpg` : null;
}

/** object-position for the course's cover (centre when not set). */
export function courseCoverPosition(courseId?: string | null): string | undefined {
  return courseId ? COURSE_COVERS[courseId]?.position : undefined;
}

/** Exposed for tests. */
export const __courseCoverTable = COURSE_COVERS;
