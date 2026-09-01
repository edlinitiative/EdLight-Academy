/**
 * searchIndex — the local, instant half of EdLight's search.
 *
 * Builds an in-memory index of everything navigable (courses, lessons, mock
 * exams, games, pages, quick actions) and scores it with an accent-insensitive
 * matcher. No network per keystroke — the index builds once per session from
 * the cached course catalog + the slim exam index, so search stays instant on
 * 2G. The AI half is the pinned "Ask Sandra" handoff in the overlay, which
 * routes the raw query to the existing /api/chat brain.
 */

import { getCachedCourses, loadCoursesData } from './dataService';
import { GAMES } from '../data/games';

export type SearchItemType = 'course' | 'lesson' | 'exam' | 'game' | 'page' | 'action';

export interface SearchItem {
  type: SearchItemType;
  title: string;
  subtitle?: string;
  /** react-router path to open */
  to: string;
  /** extra matchable text (other language, subject, level, year…) */
  keywords?: string;
}

export interface SearchResult extends SearchItem {
  score: number;
}

/** Lowercase + strip diacritics so "matematik" matches "Mathématiques". */
export function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score `query` against a haystack. 0 = no match. Higher is better:
 * whole-string prefix (100) > word prefix (80) > substring (60), with a small
 * bonus for every additional query word that also matches.
 */
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
    if (!h.includes(w)) return 0; // every word must match somewhere
    bonus += 5;
  }
  return base + bonus;
}

/** Rank items against a query; ties keep index order (curated first). */
export function searchItems(items: SearchItem[], query: string, limit = 20): SearchResult[] {
  const results: SearchResult[] = [];
  for (const item of items) {
    const inTitle = scoreMatch(query, item.title);
    const inKeywords = item.keywords ? scoreMatch(query, item.keywords) : 0;
    const inSubtitle = item.subtitle ? scoreMatch(query, item.subtitle) : 0;
    // Title matches outrank keyword/subtitle-only matches of the same shape.
    const score = Math.max(inTitle * 2, inKeywords, inSubtitle);
    if (score > 0) results.push({ ...item, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ─── Index building ──────────────────────────────────────────────────────────

type Lang = 'fr' | 'ht';

const EXAM_LEVEL_LABELS: Record<string, { fr: string; ht: string }> = {
  baccalaureat: { fr: 'Bac', ht: 'Bak' },
  universite: { fr: 'Université', ht: 'Inivèsite' },
  '9e': { fr: '9e AF', ht: '9e AF' },
  '9eme_af': { fr: '9e AF', ht: '9e AF' },
  neuvieme: { fr: '9e AF', ht: '9e AF' },
};

/** Static destinations + quick actions — the "command palette" layer. */
function staticItems(lang: Lang): SearchItem[] {
  const L = (fr: string, ht: string) => (lang === 'ht' ? ht : fr);
  return [
    {
      type: 'action',
      title: L('Créer mon plan d’étude', 'Kreye plan etid mwen'),
      subtitle: L('Plan personnalisé par l’IA', 'Plan pèsonalize ak IA'),
      to: '/study-plan',
      keywords: 'plan etude study plan planifye revision ia ai',
    },
    { type: 'page', title: L('Examens blancs', 'Egzamen blan'), to: '/exams', keywords: 'exams bac bak menfp epreuves' },
    { type: 'page', title: L('Quiz et exercices', 'Quiz ak egzèsis'), to: '/quizzes', keywords: 'quiz pratique practice egzesis' },
    { type: 'page', title: L('Révision', 'Revizyon'), to: '/revision', keywords: 'revision revizyon srs reviser' },
    { type: 'page', title: L('Jeux', 'Jwèt'), to: '/jeux', keywords: 'jeux games jwet arcade trivia' },
    { type: 'page', title: L('Classement', 'Klasman'), to: '/classement', keywords: 'classement leaderboard klasman rank' },
    { type: 'page', title: L('Tableau de bord', 'Tablodbò'), to: '/dashboard', keywords: 'dashboard tablodbo progres' },
    { type: 'page', title: L('Mon profil', 'Pwofil mwen'), to: '/profile', keywords: 'profil profile parametres reglaj' },
    {
      type: 'page',
      title: L('Devenir enseignant', 'Vin yon pwofesè'),
      to: '/enseigner',
      keywords: 'enseignant professeur pwofese anseye teach volontariat',
    },
  ];
}

async function courseItems(lang: Lang): Promise<SearchItem[]> {
  let courses: any[] = [];
  try {
    const cached = getCachedCourses();
    courses = cached?.data || (await loadCoursesData());
  } catch {
    return [];
  }
  const items: SearchItem[] = [];
  for (const c of courses) {
    if (!c?.id || c.hidden || c.comingSoon) continue;
    const level = c.level ? String(c.level).toUpperCase() : '';
    items.push({
      type: 'course',
      title: c.name || c.id,
      subtitle: [c.subject, level].filter(Boolean).join(' · '),
      to: `/courses/${encodeURIComponent(c.id)}`,
      keywords: `${c.subject || ''} ${level} cours kou`,
    });
    for (const m of c.modules || []) {
      for (const l of m.lessons || []) {
        if (!l?.lessonId || !l.title) continue;
        items.push({
          type: 'lesson',
          title: l.title,
          subtitle: `${c.name || c.id}${m.title ? ` · ${m.title}` : ''}`,
          to: `/courses/${encodeURIComponent(c.id)}?lesson=${encodeURIComponent(l.lessonId)}`,
          keywords: `${c.subject || ''} ${level} ${m.title || ''} leson leçon`,
        });
      }
    }
  }
  return items;
}

async function examItems(lang: Lang): Promise<SearchItem[]> {
  try {
    const res = await fetch('/exam_catalog_index.json');
    if (!res.ok) return [];
    const idx = await res.json();
    if (!Array.isArray(idx)) return [];
    return idx
      .filter((e: any) => e?.exam_id && e?.level)
      .map((e: any) => {
        const levelLabel = EXAM_LEVEL_LABELS[e.level]?.[lang] || e.level;
        return {
          type: 'exam' as const,
          title: `${e.subject || e.exam_title || 'Examen'} — ${levelLabel} ${e.year || ''}`.trim(),
          subtitle: e.exam_title && e.exam_title !== e.subject ? e.exam_title : undefined,
          to: `/exams/${encodeURIComponent(e.level)}/${encodeURIComponent(e.exam_id)}`,
          keywords: `examen egzamen ${e.subject || ''} ${e.year || ''} ${levelLabel}`,
        };
      });
  } catch {
    return [];
  }
}

function gameItems(lang: Lang): SearchItem[] {
  return (GAMES as any[]).map((g) => ({
    type: 'game' as const,
    title: lang === 'ht' ? g.nameHt || g.name : g.name,
    subtitle: lang === 'ht' ? 'Jwèt' : 'Jeu',
    to: g.id === 'trivia' ? '/jeux' : `/jeux/${g.id}`,
    keywords: `${g.name} ${g.nameHt || ''} jeu jwet game`,
  }));
}

let cachedIndex: { lang: Lang; items: SearchItem[] } | null = null;

/** Build (or reuse) the session index. Static + games are instant; courses
 *  and exams arrive from cache/fetch — call again after `await` to refresh. */
export async function getSearchIndex(lang: Lang): Promise<SearchItem[]> {
  if (cachedIndex && cachedIndex.lang === lang) return cachedIndex.items;
  const [courses, exams] = await Promise.all([courseItems(lang), examItems(lang)]);
  const items = [...staticItems(lang), ...courses, ...gameItems(lang), ...exams];
  cachedIndex = { lang, items };
  return items;
}

/** Test hook: drop the memoized index. */
export function __resetSearchIndex(): void {
  cachedIndex = null;
}
