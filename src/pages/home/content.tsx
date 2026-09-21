import React from 'react';
import { useQuery } from '@tanstack/react-query';
import useStore from '../../contexts/store';

/** Bilingual translate helper: pick Haitian Creole when active, else French. */
export type TFn = (fr: string, ht: string) => string;

/** Hook exposing the bilingual `t` helper bound to the current language. */
export function useT(): TFn {
  const { language } = useStore();
  const isCreole = language === 'ht';
  return React.useCallback((fr: string, ht: string) => (isCreole ? ht : fr), [isCreole]);
}

/** Subject thumbnail assets keyed by subject code. */
export const subjectThumbs: Record<string, string> = {
  PHYS: '/assets/physics-thumb.webp',
  CHEM: '/assets/chemistry-thumb.jpg',
  MATH: '/assets/math-thumb.webp',
  ECON: '/assets/economy-thumb.webp',
};

/* ── The catalogue, as it actually is ──────────────────────────────────────
   The landing page used to advertise four hand-written course cards with
   hand-written lesson counts ("Physique NS I · 24 leçons"), a hand-written
   "490+ examens" line, and a mock dashboard showing 82% mastery and a 12-day
   streak for a student who does not exist. Redesign plan §3 forbids inventing
   counts, mastery or activity, and §6.10 asks marketing to explain EdLight
   *concretely*. So the page reads the same committed catalogue snapshot the
   /courses listing paints from, and states only what is in it.

   `/catalog.json` (scripts/export_catalog.mjs) is a static file the Layout
   already warms on idle, so this costs no Firestore round-trip and — unlike
   importing the data service — keeps the Firebase SDK out of the landing
   bundle. Firestore stays the source of truth for the app itself. */

export type SubjectCode = 'MATH' | 'PHYS' | 'CHEM' | 'ECON';

/** Stable fallback order; subjects are then sorted by what is actually open. */
export const SUBJECT_ORDER: SubjectCode[] = ['MATH', 'ECON', 'CHEM', 'PHYS'];

const SUBJECT_NAMES: Record<SubjectCode, { fr: string; ht: string }> = {
  MATH: { fr: 'Mathématiques', ht: 'Matematik' },
  PHYS: { fr: 'Physique', ht: 'Fizik' },
  CHEM: { fr: 'Chimie', ht: 'Chimi' },
  ECON: { fr: 'Économie', ht: 'Ekonomi' },
};

const LEVEL_LABELS: Record<string, string> = {
  ns1: 'NS I',
  ns2: 'NS II',
  ns3: 'NS III',
  ns4: 'NS IV',
};

export interface CatalogLevel {
  /** Course id — the real `/courses/:courseId` destination. */
  id: string;
  /** "NS I" … "NS IV". */
  label: string;
  /** Lessons in that course, from the catalogue (0 when not published yet). */
  lessons: number;
  /** Published but not yet opened to students. */
  comingSoon: boolean;
}

export interface CatalogSubject {
  code: SubjectCode;
  name: string;
  /** Levels present in the catalogue, NS I → NS IV. */
  levels: CatalogLevel[];
  /** Lessons a student can open today. */
  lessons: number;
  /** Real unit titles from the first open course — what the course covers. */
  units: string[];
  /** True when every level of the subject is still coming soon. */
  comingSoon: boolean;
}

export interface CatalogSummary {
  subjects: CatalogSubject[];
  /** Courses open to students. */
  courses: number;
  /** Video lessons open to students. */
  lessons: number;
}

type RawUnit = { title?: string; lessons?: unknown[] };
type RawCourse = {
  id?: string;
  hidden?: boolean;
  coming_soon?: boolean;
  number_of_lessons?: number;
  units?: RawUnit[];
};

const SUBJECT_BY_PREFIX: Record<string, SubjectCode> = {
  math: 'MATH',
  phys: 'PHYS',
  chem: 'CHEM',
  econ: 'ECON',
};

/**
 * Fold the catalogue snapshot into per-subject facts.
 *
 * Mirrors the data service's two filters so the page can never advertise
 * something the catalogue hides: `hidden` courses (un-migrated levels) are
 * dropped entirely, and `coming_soon` courses are shown as such rather than
 * counted as available content.
 */
export function summarizeCatalog(raw: unknown, t: TFn): CatalogSummary | null {
  const courses = (raw as { courses?: RawCourse[] })?.courses;
  if (!Array.isArray(courses) || courses.length === 0) return null;

  const buckets = new Map<SubjectCode, CatalogLevel[]>();
  const unitsBySubject = new Map<SubjectCode, string[]>();

  for (const course of courses) {
    if (!course?.id || course.hidden) continue;
    const [prefix, levelKey] = String(course.id).split('-');
    const code = SUBJECT_BY_PREFIX[prefix];
    const label = LEVEL_LABELS[levelKey];
    if (!code || !label) continue;

    const units = Array.isArray(course.units) ? course.units : [];
    const counted = units.reduce(
      (n, u) => n + (Array.isArray(u?.lessons) ? u.lessons.length : 0),
      0,
    );
    const lessons = Number.isFinite(course.number_of_lessons)
      ? Math.max(Number(course.number_of_lessons), counted)
      : counted;
    const comingSoon = !!course.coming_soon;

    if (!buckets.has(code)) buckets.set(code, []);
    buckets.get(code)!.push({ id: String(course.id), label, lessons, comingSoon });

    // Unit titles come from the first open level — a real table of contents
    // beats a slogan about "cours structurés".
    if (!comingSoon && !unitsBySubject.has(code)) {
      const titles = units
        .map((u) => (typeof u?.title === 'string' ? u.title.trim() : ''))
        .filter(Boolean)
        .slice(0, 3);
      if (titles.length) unitsBySubject.set(code, titles);
    }
  }

  const order = Object.keys(LEVEL_LABELS);
  const subjects: CatalogSubject[] = SUBJECT_ORDER.filter((code) => buckets.has(code)).map(
    (code) => {
      const levels = buckets
        .get(code)!
        .slice()
        .sort(
          (a, b) =>
            order.findIndex((k) => LEVEL_LABELS[k] === a.label) -
            order.findIndex((k) => LEVEL_LABELS[k] === b.label),
        );
      const open = levels.filter((l) => !l.comingSoon);
      return {
        code,
        name: t(SUBJECT_NAMES[code].fr, SUBJECT_NAMES[code].ht),
        levels,
        lessons: open.reduce((n, l) => n + l.lessons, 0),
        units: unitsBySubject.get(code) ?? [],
        comingSoon: open.length === 0,
      };
    },
  );

  if (subjects.length === 0) return null;

  // What a student can open today leads; subjects still in preparation close
  // the list rather than being hidden or dressed up as available.
  subjects.sort((a, b) => Number(a.comingSoon) - Number(b.comingSoon) || b.lessons - a.lessons);

  return {
    subjects,
    courses: subjects.reduce((n, s) => n + s.levels.filter((l) => !l.comingSoon).length, 0),
    lessons: subjects.reduce((n, s) => n + s.lessons, 0),
  };
}

/**
 * The catalogue snapshot, shared by every section of the landing page.
 *
 * Fetched after first paint (never blocking the hero) and cached by
 * react-query, so the two sections that use it issue one request between them.
 * On failure the sections keep their headings and say so — they never guess a
 * number.
 */
export function useCatalogSummary(t: TFn) {
  const query = useQuery({
    queryKey: ['homeCatalog'],
    queryFn: async () => {
      const res = await fetch('/catalog.json');
      if (!res.ok) throw new Error(`catalog ${res.status}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const summary = React.useMemo(
    () => (query.data ? summarizeCatalog(query.data, t) : null),
    [query.data, t],
  );

  return {
    summary,
    isLoading: query.isLoading,
    isError: query.isError,
    /** Loaded, but the catalogue holds nothing showable. */
    isEmpty: !query.isLoading && !query.isError && !summary,
  };
}

/** Inline arrow glyph reused across hero CTA and section links. */
export function ArrowIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
