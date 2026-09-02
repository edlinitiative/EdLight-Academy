/**
 * subjectCovers — cover artwork per course-subject code.
 *
 * One source of truth: the course catalog cards and the dashboard's resume
 * hero both lead with this image. Kept in utils (not a page) because a
 * private copy per page is exactly the drift that bit us before — see the
 * exam `_level` vs `.level` incident.
 *
 * Codes are the normalized subject codes used on course docs (see
 * dataService's transform): MATH | PHYS | CHEM | ECON.
 */
export const SUBJECT_COVERS: Record<string, string> = {
  MATH: '/assets/math-thumb.webp',
  PHYS: '/assets/physics-thumb.webp',
  CHEM: '/assets/chemistry-thumb.jpg',
  ECON: '/assets/economy-thumb.webp',
};

/** Cover art for a subject code, or '' when the subject has none yet. */
export function subjectCover(code: string | null | undefined): string {
  return SUBJECT_COVERS[String(code || '').toUpperCase()] || '';
}
