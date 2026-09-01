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
    if (!c?.id || c.hidden) continue;
    const level = c.level ? String(c.level).toUpperCase() : '';
    items.push({
      type: 'course',
      title: c.name || c.id,
      subtitle: [c.subject, level].filter(Boolean).join(' · '),
      keywords: `${c.subject || ''} ${level} cours kou`,
      nav: { kind: 'course', courseId: c.id, courseName: c.name },
    });
    for (const m of c.modules || []) {
      for (const l of m.lessons || []) {
        if (!l?.lessonId || !l.title) continue;
        items.push({
          type: 'lesson',
          title: l.title,
          subtitle: `${c.name || c.id}${m.title ? ` · ${m.title}` : ''}`,
          keywords: `${c.subject || ''} ${level} ${m.title || ''} leson leçon`,
          nav: { kind: 'lesson', courseId: c.id, courseName: c.name, lessonId: l.lessonId },
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

export async function getSearchIndex(lang: Lang): Promise<SearchItem[]> {
  if (cachedIndex && cachedIndex.lang === lang) return cachedIndex.items;
  const [courses, exams] = await Promise.all([courseItems(), examItems(lang)]);
  const items = [...staticItems(lang), ...courses, ...gameItems(lang), ...exams];
  cachedIndex = { lang, items };
  return items;
}
