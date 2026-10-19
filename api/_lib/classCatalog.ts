/**
 * The published course catalog (public/catalog.json), read server-side for teacher
 * analytics. Only ids, titles and the unit/lesson structure are kept.
 */
export type CatalogCourse = {
  id: string; name: string; level: string;
  units: Array<{ id: string; title: string; lessons: Array<{ id: string; title: string }> }>;
};

const CATALOG_MS = 30 * 60 * 1000;
let cache: { at: number; courses: CatalogCourse[] } | null = null;

export function normalizeCatalog(raw: any): CatalogCourse[] {
  const list = Array.isArray(raw?.courses) ? raw.courses : Array.isArray(raw) ? raw : [];
  return list.filter((c: any) => c && typeof c.id === 'string' && !c.hidden).map((c: any) => ({
    id: c.id, name: String(c.name || c.id).slice(0, 80), level: String(c.level_id || ''),
    units: (Array.isArray(c.units) ? c.units : []).slice().sort((a: any, b: any) => (a.order || 0) - (b.order || 0)).map((u: any) => ({
      id: String(u.unitId || u.id || ''), title: String(u.title || '').slice(0, 100),
      lessons: (Array.isArray(u.lessons) ? u.lessons : []).slice().sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
        .map((l: any) => ({ id: String(l.lessonId || l.id || ''), title: String(l.title || '').slice(0, 100) })).filter((l: any) => l.id),
    })).filter((u: any) => u.id && u.lessons.length),
  })).filter((c: CatalogCourse) => c.units.length);
}

export async function fetchCourseCatalog(origin = 'https://academy.edlight.org'): Promise<CatalogCourse[]> {
  if (cache && Date.now() - cache.at < CATALOG_MS) return cache.courses;
  const res = await fetch(`${origin}/catalog.json`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`catalog fetch ${res.status}`);
  const courses = normalizeCatalog(await res.json());
  cache = { at: Date.now(), courses };
  return courses;
}
