/**
 * searchIndex — mobile mirror of src/services/searchIndex.ts (web).
 *
 * Local, instant search over courses, lessons, mock exams, games and quick
 * actions. The scorer is identical to the web's (accent-insensitive,
 * every-word-must-match); sources come from the mobile caches (AsyncStorage
 * course catalog, exam index fetch). The AI layer is the "Mande Sandra" row
 * in SearchScreen, which hands the query to the Sandra chat.
 */

import { getCachedCourses, loadCoursesData } from './dataService';
import { fetchCatalogIndex } from '../utils/examCatalog';
import { GAMES } from '../data/games';

export type SearchItemType = 'course' | 'lesson' | 'exam' | 'game' | 'action';

export interface SearchItem {
  type: SearchItemType;
  title: string;
  subtitle?: string;
  keywords?: string;
  /** Navigation payload — interpreted by SearchScreen. */
  nav:
    | { kind: 'course'; courseId: string; courseName?: string }
    | { kind: 'lesson'; courseId: string; courseName?: string; lessonId: string }
    | { kind: 'exam'; level: string; examId: string }
    | { kind: 'games' }
    | { kind: 'studyPlan' }
    | { kind: 'leaderboard' }
    | { kind: 'exams' };
}

export interface SearchResult extends SearchItem {
  score: number;
}

export function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scoreMatch(query: string, haystack: string): number {
  const q = normalize(query);
  const h = normalize(haystack);
  if (!q || !h) return 0;
  const words = q.split(' ').filter(Boolean);
  const first = words[0];
  let base = 0;
  if (h.startsWith(first)) base = 100;
  else if (h.includes(` ${first}`)) base = 80;
  else if (h.includes(first)) base = 60;
  else return 0;
  let bonus = 0;
  for (const w of words.slice(1)) {
    if (!h.includes(w)) return 0;
    bonus += 5;
  }
  return base + bonus;
}

export function searchItems(items: SearchItem[], query: string, limit = 30): SearchResult[] {
  const results: SearchResult[] = [];
  for (const item of items) {
    const inTitle = scoreMatch(query, item.title);
    const inKeywords = item.keywords ? scoreMatch(query, item.keywords) : 0;
    const inSubtitle = item.subtitle ? scoreMatch(query, item.subtitle) : 0;
    const score = Math.max(inTitle * 2, inKeywords, inSubtitle);
    if (score > 0) results.push({ ...item, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

type Lang = 'fr' | 'ht';

const EXAM_LEVEL_LABELS: Record<string, { fr: string; ht: string }> = {
  baccalaureat: { fr: 'Bac', ht: 'Bak' },
  universite: { fr: 'Université', ht: 'Inivèsite' },
  '9e': { fr: '9e AF', ht: '9e AF' },
  '9eme_af': { fr: '9e AF', ht: '9e AF' },
  neuvieme: { fr: '9e AF', ht: '9e AF' },
};

function staticItems(lang: Lang): SearchItem[] {
  const L = (fr: string, ht: string) => (lang === 'ht' ? ht : fr);
  return [
    {
      type: 'action',
      title: L('Créer mon plan d’étude', 'Kreye plan etid mwen'),
      subtitle: L('Plan personnalisé par l’IA', 'Plan pèsonalize ak IA'),
      keywords: 'plan etude study revizyon ia ai planifye',
      nav: { kind: 'studyPlan' },
    },
    {
      type: 'action',
      title: L('Examens blancs', 'Egzamen blan'),
      keywords: 'exams bac bak menfp epreuves egzamen',
      nav: { kind: 'exams' },
    },
    {
      type: 'action',
      title: L('Classement', 'Klasman'),
      keywords: 'classement leaderboard klasman rank',
      nav: { kind: 'leaderboard' },
    },
  ];
}

async function courseItems(): Promise<SearchItem[]> {
  let courses: any[] = [];
  try {
    const cached = await getCachedCourses();
    courses = cached?.data || (await loadCoursesData());
  } catch {
    return [];
  }
  const items: SearchItem[] = [];
  for (const c of courses || []) {
    if (!c?.id || c.hidden || c.comingSoon) continue;
    const level = c.level ? String(c.level).toUpperCase() : '';
    items.push({
      type: 'course',
      title: c.name || c.id,
      // Raw codes ("CHEM · NSI"); SearchScreen shows them readable.
      subtitle: [c.subject, level].filter(Boolean).join(' · '),
      keywords: `${c.subject || ''} ${level} cours kou`,
      nav: { kind: 'course', courseId: c.id, courseName: c.name },
    });
    for (const m of c.modules || []) {
      for (const l of m.lessons || []) {
        // The transformed catalog keys lessons on `id` (dataService maps the
        // raw `lessonId` onto it). Reading only `lessonId` here meant no lesson
        // was ever indexed — the same bug the web fixed in 4a712e5.
        const lessonId = l?.id || l?.lessonId;
        if (!lessonId || !l.title) continue;
        items.push({
          type: 'lesson',
          title: l.title,
          subtitle: `${c.name || c.id}${m.title ? ` · ${m.title}` : ''}`,
          keywords: `${c.subject || ''} ${level} ${m.title || ''} leson leçon`,
          nav: { kind: 'lesson', courseId: c.id, courseName: c.name, lessonId: String(lessonId) },
        });
      }
    }
  }
  return items;
}

async function examItems(lang: Lang): Promise<SearchItem[]> {
  try {
    const idx = await fetchCatalogIndex();
    return (idx || [])
      .filter((e: any) => e?.exam_id && e?.level)
      .map((e: any) => {
        const levelLabel = EXAM_LEVEL_LABELS[e.level]?.[lang] || e.level;
        return {
          type: 'exam' as const,
          title: `${e.subject || e.exam_title || 'Examen'} — ${levelLabel} ${e.year || ''}`.trim(),
          subtitle: e.exam_title && e.exam_title !== e.subject ? e.exam_title : undefined,
          keywords: `examen egzamen ${e.subject || ''} ${e.year || ''} ${levelLabel}`,
          nav: { kind: 'exam' as const, level: String(e.level), examId: String(e.exam_id) },
        };
      });
  } catch {
    return [];
  }
}

function gameItems(lang: Lang): SearchItem[] {
  return GAMES.map((g) => ({
    type: 'game' as const,
    title: lang === 'ht' ? g.nameHt || g.name : g.name,
    subtitle: lang === 'ht' ? 'Jwèt' : 'Jeu',
    keywords: `${g.name} ${g.nameHt || ''} jeu jwet game`,
    nav: { kind: 'games' as const },
  }));
}

let cachedIndex: { lang: Lang; items: SearchItem[] } | null = null;

/**
 * The session index. Only a HEALTHY index is cached: the sources swallow
 * their own fetch errors, so a failed catalogue used to be cached as "no
 * courses" for the rest of the session. `force` rebuilds (the Retry button).
 */
export async function getSearchIndex(lang: Lang, { force = false }: { force?: boolean } = {}): Promise<SearchItem[]> {
  if (!force && cachedIndex && cachedIndex.lang === lang) return cachedIndex.items;
  const [courses, exams] = await Promise.all([courseItems(), examItems(lang)]);
  const items = [...staticItems(lang), ...courses, ...gameItems(lang), ...exams];
  if (indexHealth(items).ok) cachedIndex = { lang, items };
  return items;
}

// ── Ranking (LJ-11) — mirror of the web's SearchOverlay/rank.ts ──────────────

/** A stable identity per destination, for keys and de-duplication. */
export function itemKey(item: SearchItem): string {
  const n = item.nav as any;
  switch (n.kind) {
    case 'course': return `course:${n.courseId}`;
    case 'lesson': return `lesson:${n.courseId}:${n.lessonId}`;
    case 'exam': return `exam:${n.level}:${n.examId}`;
    default: return `${item.type}:${n.kind}:${item.title}`;
  }
}

export const BEST_LIMIT = 3;
export const RANK_GROUP_ORDER: SearchItemType[] = ['course', 'lesson', 'exam', 'game', 'action'];
export const RANK_GROUP_LIMIT: Record<SearchItemType, number> = { course: 4, lesson: 5, exam: 4, game: 3, action: 3 };
const LEARNING: ReadonlySet<SearchItemType> = new Set(['course', 'lesson', 'exam']);
/** searchItems doubles a title score: 120 is the weakest title match (substring). */
const TITLE_MATCH_MIN = 120;

export type RankedRow = SearchResult & { exact: boolean; key: string };
export interface RankedGroup { key: 'best' | SearchItemType; rows: RankedRow[] }

/**
 * 1. "Meilleurs résultats": up to BEST_LIMIT courses / lessons / exams whose
 *    TITLE matches — an exact title first. Keyword-only matches never
 *    qualify (sharing the subject word is not a best result).
 * 2. Type groups, learning content first; nothing repeated from (1).
 * The old fixed order put "Créer mon plan d'étude" above an exact lesson.
 */
export function rankResults(index: SearchItem[], query: string): RankedGroup[] {
  const q = normalize(query);
  if (!q) return [];
  const ranked: RankedRow[] = searchItems(index, query, 500).map((r) => ({
    ...r,
    exact: normalize(r.title) === q,
    key: itemKey(r),
  }));
  const best = ranked
    .filter((r) => LEARNING.has(r.type) && (r.exact || r.score >= TITLE_MATCH_MIN))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(b.r.exact) - Number(a.r.exact) || b.r.score - a.r.score || a.i - b.i)
    .slice(0, BEST_LIMIT)
    .map(({ r }) => r);
  const inBest = new Set(best.map((r) => r.key));
  const grouped = new Map<SearchItemType, RankedRow[]>();
  for (const r of ranked) {
    if (inBest.has(r.key)) continue;
    const bucket = grouped.get(r.type) || [];
    if (bucket.length < RANK_GROUP_LIMIT[r.type]) bucket.push(r);
    grouped.set(r.type, bucket);
  }
  const groups: RankedGroup[] = [];
  if (best.length) groups.push({ key: 'best', rows: best });
  for (const type of RANK_GROUP_ORDER) {
    const rows = grouped.get(type);
    if (rows && rows.length) groups.push({ key: type, rows });
  }
  return groups;
}

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

/** "CHEM · NSI" → "Chimie · NS1". Unknown parts pass through. */
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

/** Subject + class context under a row's title. */
export function rowContext(row: SearchItem, ht: boolean): string {
  if (row.type === 'course') return readableCourseMeta(row.subtitle, ht);
  return row.subtitle || '';
}

export function typeTag(type: SearchItemType, ht: boolean): string {
  const L = (fr: string, kr: string) => (ht ? kr : fr);
  return ({
    course: L('Cours', 'Kou'),
    lesson: L('Leçon', 'Leson'),
    exam: L('Examen', 'Egzamen'),
    game: L('Jeu', 'Jwèt'),
    action: L('Action', 'Aksyon'),
  })[type];
}

/**
 * Index health, read from the result: the sources swallow their own errors,
 * but a working catalogue always has courses and the exam index always has
 * exams.
 */
export function indexHealth(items: SearchItem[]): { ok: boolean; missingCourses: boolean; missingExams: boolean } {
  const missingCourses = !items.some((i) => i.type === 'course');
  const missingExams = !items.some((i) => i.type === 'exam');
  return { ok: !missingCourses && !missingExams, missingCourses, missingExams };
}

/**
 * Real suggestions when nothing matches: learning destinations matching ANY
 * word of the query (the main scorer needs every word), else the first
 * courses of the index. Never an invented title.
 */
export function suggestFor(index: SearchItem[], query: string, limit = 3): SearchItem[] {
  const words = normalize(query).split(' ').filter((w) => w.length >= 3);
  const learning = index.filter((i) => LEARNING.has(i.type));
  const seen = new Set<string>();
  const out: SearchItem[] = [];
  for (const w of words) {
    for (const r of searchItems(learning, w, 20)) {
      const k = itemKey(r);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
      if (out.length >= limit) return out;
    }
  }
  if (out.length) return out;
  return index.filter((i) => i.type === 'course').slice(0, limit);
}
