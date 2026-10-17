/**
 * rank — how the search overlay orders what the local index returns.
 *
 * The index scores every item (searchIndex.searchItems). The overlay used to
 * group those results in a FIXED order — actions, pages, then courses,
 * lessons, exams — so an exact lesson title could sit behind "Créer mon plan
 * d'étude" and three generic pages (audit #15).
 *
 * Now:
 *   1. "Meilleurs résultats" — up to BEST_LIMIT learning destinations
 *      (course / lesson / exam) whose TITLE matches the query. An exact title
 *      match always comes first. Keyword-only matches never qualify: a lesson
 *      that only shares the subject word is not a "best" result.
 *   2. Type groups, learning content first, then games, pages and actions.
 *      Items already shown as best results are not repeated.
 *
 * Pure so the ordering is testable without a DOM.
 */
import { normalize, searchItems, type SearchItem, type SearchItemType, type SearchResult } from '../../services/searchIndex';

export const BEST_LIMIT = 3;

export const GROUP_ORDER: SearchItemType[] = ['course', 'lesson', 'exam', 'game', 'page', 'action'];
export const GROUP_LIMIT: Record<SearchItemType, number> = {
  course: 4, lesson: 5, exam: 4, game: 3, page: 4, action: 3,
};

const LEARNING: ReadonlySet<SearchItemType> = new Set(['course', 'lesson', 'exam']);

/** searchItems doubles a title score: 120 is the weakest title match (substring). */
const TITLE_MATCH_MIN = 120;

export type RankedRow = SearchResult & { exact: boolean };

export interface RankedGroup {
  key: 'best' | SearchItemType;
  rows: RankedRow[];
}

export function rankResults(index: SearchItem[], query: string): RankedGroup[] {
  const q = normalize(query);
  if (!q) return [];
  // Generous limit: with 60, a common word could push an exact lesson title
  // out of the list before it was ever considered.
  const ranked: RankedRow[] = searchItems(index, query, 500).map((r) => ({
    ...r,
    exact: normalize(r.title) === q,
  }));

  const best = ranked
    .filter((r) => LEARNING.has(r.type) && (r.exact || r.score >= TITLE_MATCH_MIN))
    // Stable: exact first, then score; ties keep index order (courses first).
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(b.r.exact) - Number(a.r.exact) || b.r.score - a.r.score || a.i - b.i)
    .slice(0, BEST_LIMIT)
    .map(({ r }) => r);
  const inBest = new Set(best.map((r) => r.to));

  const grouped = new Map<SearchItemType, RankedRow[]>();
  for (const r of ranked) {
    if (inBest.has(r.to)) continue;
    const bucket = grouped.get(r.type) || [];
    if (bucket.length < GROUP_LIMIT[r.type]) bucket.push(r);
    grouped.set(r.type, bucket);
  }

  const groups: RankedGroup[] = [];
  if (best.length) groups.push({ key: 'best', rows: best });
  for (const type of GROUP_ORDER) {
    const rows = grouped.get(type);
    if (rows && rows.length) groups.push({ key: type, rows });
  }
  return groups;
}

/* ── Context: subject + class on every learning row ─────────────────────── */

const SUBJECTS: Record<string, [string, string]> = {
  CHEM: ['Chimie', 'Chimi'],
  PHYS: ['Physique', 'Fizik'],
  MATH: ['Mathématiques', 'Matematik'],
  ECON: ['Économie', 'Ekonomi'],
  BIO: ['SVT', 'SVT'],
  SVT: ['SVT', 'SVT'],
  PHIL: ['Philosophie', 'Filozofi'],
  HIST: ['Histoire', 'Istwa'],
  FREN: ['Français', 'Franse'],
  FR: ['Français', 'Franse'],
  ENG: ['Anglais', 'Angle'],
};
const LEVELS: Record<string, string> = { NSI: 'NS1', NSII: 'NS2', NSIII: 'NS3', NSIV: 'NS4' };

/** "CHEM · NSI" → "Chimie · NS1". Unknown codes pass through unchanged. */
export function readableCourseMeta(subtitle: string | undefined, ht: boolean): string {
  if (!subtitle) return '';
  return subtitle
    .split(' · ')
    .map((part) => {
      const key = part.trim().toUpperCase();
      if (SUBJECTS[key]) return SUBJECTS[key][ht ? 1 : 0];
      if (LEVELS[key]) return LEVELS[key];
      return part.trim();
    })
    .filter(Boolean)
    .join(' · ');
}

/**
 * The context line under a row's title.
 *   course → "Chimie · NS1"
 *   lesson → "Chimie NS1 · Grandeurs et mesures" (course name carries subject
 *            and class; the unit gives the topic)
 *   exam   → the composed exam subtitle (series, month) when there is one
 *   other  → the index subtitle as is
 */
export function rowContext(row: SearchItem, ht: boolean): string {
  if (row.type === 'course') return readableCourseMeta(row.subtitle, ht);
  return row.subtitle || '';
}

/** Short type tag shown on best results (they mix types). */
export function typeTag(type: SearchItemType, ht: boolean): string {
  const L = (fr: string, kr: string) => (ht ? kr : fr);
  return ({
    course: L('Cours', 'Kou'),
    lesson: L('Leçon', 'Leson'),
    exam: L('Examen', 'Egzamen'),
    game: L('Jeu', 'Jwèt'),
    page: L('Page', 'Paj'),
    action: L('Action', 'Aksyon'),
  })[type];
}

/**
 * Index health. The index swallows its own fetch errors and returns what it
 * could build, so "failed" is read from the result: a working catalogue
 * always has courses, and the exam index always has exams.
 */
export type IndexStatus = 'loading' | 'ready' | 'failed';

export function indexHealth(items: SearchItem[]): { ok: boolean; missingCourses: boolean; missingExams: boolean } {
  const missingCourses = !items.some((i) => i.type === 'course');
  const missingExams = !items.some((i) => i.type === 'exam');
  return { ok: !missingCourses && !missingExams, missingCourses, missingExams };
}
