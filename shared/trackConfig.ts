/**
 * Track Configuration for Haitian Baccalauréat
 * ─────────────────────────────────────────────
 * Defines the canonical track codes (séries/filières) for Terminale students,
 * subject coefficients per track, and universal subjects shared across all tracks.
 *
 * Source: MENFP official Baccalauréat coefficient tables.
 */

// ─── Canonical Tracks ───────────────────────────────────────────────────────

export const TRACKS = [
  {
    code: 'SVT',
    label: 'Sciences de la Vie et de la Terre',
    shortLabel: 'SVT',
    icon: '🧬',
    glyph: 'leaf',
    color: '#10b981',
    description: 'Biologie, géologie, chimie et physique',
  },
  {
    code: 'SMP',
    label: 'Sciences Mathématiques et Physiques',
    shortLabel: 'SMP',
    icon: '⚛️',
    glyph: 'atom',
    color: '#3b82f6',
    description: 'Mathématiques, physique et chimie',
  },
  {
    code: 'SES',
    label: 'Sciences Économiques et Sociales',
    shortLabel: 'SES',
    icon: '📊',
    glyph: 'chart',
    color: '#f59e0b',
    description: 'Économie, sciences sociales et gestion',
  },
  {
    code: 'LET',
    label: 'Lettres / Langues',
    shortLabel: 'Lettres',
    icon: '📚',
    glyph: 'book',
    color: '#8b5cf6',
    description: 'Français, langues étrangères et littérature',
  },
  {
    code: 'ARTS',
    label: 'Arts',
    shortLabel: 'Arts',
    icon: '🎨',
    glyph: 'palette',
    color: '#ec4899',
    description: 'Art, musique et expression artistique',
  },
  {
    // Post-Bac: université entrance exams (concours d'admission). Not a Bac
    // série — plans for this track pull `universite`-level exams (see
    // TRACK_LEVEL) instead of Bac papers.
    code: 'PREFAC',
    label: "Préfac — Concours d'admission",
    shortLabel: 'Préfac',
    icon: '🏛️',
    glyph: 'campus',
    color: '#0891b2',
    description: "Préparation aux concours d'entrée à l'université",
  },
];

/**
 * Exam level a track's plan should draw from. Bac séries → Terminale papers;
 * Préfac → université concours papers. Consumed by the exam filter so a Préfac
 * plan never pulls Bac exams (and vice-versa).
 */
export const TRACK_LEVEL: Record<string, 'baccalaureat' | 'universite'> = {
  SVT: 'baccalaureat',
  SMP: 'baccalaureat',
  SES: 'baccalaureat',
  LET: 'baccalaureat',
  ARTS: 'baccalaureat',
  PREFAC: 'universite',
};

/**
 * Seasonal default plan mode. Once the Bac is past and the next Bac session is
 * more than ~5 months out, préfac (concours) is the sensible default; the Bac
 * plan auto-returns as the next cycle approaches. Kept in sync with the web's
 * src/config/examSchedule.ts. Bac dates: bac1 ~ July 5-6, bac2 ~ July 19-20.
 */
export function currentPlanSeason(from: Date = new Date()): 'bac' | 'prefac' {
  const y = from.getFullYear();
  // Days until the next July 5 (first Bac session) on/after `from`.
  const julyFirstBac = (yr: number) => new Date(yr, 6, 5);
  let nextBac = julyFirstBac(y);
  if (from > new Date(y, 6, 20)) nextBac = julyFirstBac(y + 1); // past this year's bac2 → next year
  const days = Math.round((nextBac.getTime() - from.getTime()) / 86_400_000);
  return days <= 150 ? 'bac' : 'prefac';
}

export const TRACK_BY_CODE = Object.fromEntries(TRACKS.map((t) => [t.code, t]));

// ─── Subject Coefficients per Track ─────────────────────────────────────────
// Keys are canonical subject names (from normalizeSubject in examUtils.js).
// Values are the Bac coefficient for each track.

export const TRACK_COEFFICIENTS = {
  SVT: {
    'SVT': 4,
    'Chimie': 3,
    'Physique': 3,
    'Mathématiques': 3,
    'Français': 2,
    'Anglais': 2,
    'Espagnol': 2,
    'Philosophie': 2,
    'Histoire-Géo': 2,
    'Kreyòl': 1,
    'Économie': 1,
    'Art & Musique': 1,
    'Informatique': 1,
  },
  SMP: {
    'Mathématiques': 5,
    'Physique': 4,
    'Chimie': 3,
    'SVT': 2,
    'Français': 2,
    'Anglais': 2,
    'Espagnol': 2,
    'Philosophie': 2,
    'Histoire-Géo': 2,
    'Kreyòl': 1,
    'Économie': 1,
    'Art & Musique': 1,
    'Informatique': 1,
  },
  SES: {
    'Économie': 4,
    'Mathématiques': 3,
    'Français': 3,
    'Histoire-Géo': 3,
    'Philosophie': 2,
    'Anglais': 2,
    'Espagnol': 2,
    'Chimie': 2,
    'Physique': 2,
    'SVT': 1,
    'Kreyòl': 1,
    'Art & Musique': 1,
    'Informatique': 1,
  },
  LET: {
    'Français': 5,
    'Philosophie': 4,
    'Anglais': 3,
    'Espagnol': 3,
    'Histoire-Géo': 3,
    'Kreyòl': 2,
    'Mathématiques': 2,
    'Économie': 1,
    'Chimie': 1,
    'Physique': 1,
    'SVT': 1,
    'Art & Musique': 1,
    'Informatique': 1,
  },
  ARTS: {
    'Art & Musique': 5,
    'Français': 3,
    'Philosophie': 3,
    'Anglais': 2,
    'Espagnol': 2,
    'Histoire-Géo': 2,
    'Kreyòl': 2,
    'Mathématiques': 1,
    'Économie': 1,
    'Chimie': 1,
    'Physique': 1,
    'SVT': 1,
    'Informatique': 1,
  },
  // Préfac / concours d'admission — weights over the subjects that actually
  // appear in the université exam pool (Maths, Philo, Culture Générale, etc.).
  PREFAC: {
    'Mathématiques': 4,
    'Culture Générale': 4,
    'Français': 3,
    'Philosophie': 3,
    'Santé': 3,
    'Anglais': 2,
    'Physique': 2,
    'Chimie': 2,
    'SVT': 2,
    'Compréhension de texte': 2,
    'Mixed': 1,
  },
};

/**
 * Get the coefficient for a given subject in a given track.
 * Returns 1 (default) if the subject or track is unknown.
 */
export function getCoefficient(track: string, subject: string) {
  return (TRACK_COEFFICIENTS as Record<string, Record<string, number>>)[track]?.[subject] ?? 1;
}

// ─── Universal Subjects ─────────────────────────────────────────────────────
// These subjects are taken by ALL tracks (no track-specific filtering needed).

export const UNIVERSAL_SUBJECTS = new Set([
  'Français',
  'Anglais',
  'Espagnol',
  'Philosophie',
  'Histoire-Géo',
  'Kreyòl',
  'Mathématiques',
  'Informatique',
  'Culture Générale',
  'Mixed',
  'Santé',
]);

// ─── Default subject order (no track selected) ──────────────────────────────
// Rough importance ordering used to lay out subject sections when the student
// has not chosen a filière. When a track IS active, sections are ordered by the
// track's coefficient instead (see getCoefficient).

export const DEFAULT_SUBJECT_ORDER = [
  'Mathématiques',
  'Physique',
  'Chimie',
  'SVT',
  'Histoire-Géo',
  'Philosophie',
  'Français',
  'Anglais',
  'Espagnol',
  'Économie',
  'Kreyòl',
  'Art & Musique',
  'Informatique',
  'Santé',
  'Culture Générale',
  'Mixed',
];

// ─── Track-specific exam section directives ─────────────────────────────────

/**
 * Parse track-specific directives from a section's instructions.
 * Returns an array of { track, directive } objects.
 *
 * Example input:
 *   "SVT et SMP : Traiter deux (2) des trois (3) problèmes\n
 *    SES : Traiter un (1) des trois problèmes\n
 *    LET/LA/ART : Pas de problème."
 *
 * Returns:
 *   [
 *     { tracks: ['SVT', 'SMP'], directive: 'Traiter deux (2) des trois (3) problèmes' },
 *     { tracks: ['SES'], directive: 'Traiter un (1) des trois problèmes' },
 *     { tracks: ['LET', 'ARTS'], directive: 'Pas de problème.' },
 *   ]
 */
export function parseTrackDirectives(instructions: string | null | undefined) {
  if (!instructions) return [];

  const directives = [];
  // Match lines like "SVT et SMP : ..." or "SES : ..." or "LET/LA/ART : ..."
  const lineRe = /\b((?:SVT|SMP|SES|LET|LA|LLA|ART|ARTS)(?:\s*(?:et|,|\/|-)\s*(?:SVT|SMP|SES|LET|LA|LLA|ART|ARTS))*)\s*:\s*(.+?)(?=\n|$)/gi;

  let match;
  while ((match = lineRe.exec(instructions)) !== null) {
    const rawTracks = match[1].toUpperCase();
    const directive = match[2].trim();

    // Normalize track codes
    const trackCodes = rawTracks
      .split(/\s*(?:et|,|\/|-)\s*/i)
      .map((t) => {
        const code = t.trim().toUpperCase();
        if (code === 'LA' || code === 'LLA') return 'LET';
        if (code === 'ART') return 'ARTS';
        return code;
      })
      .filter((c) => TRACK_BY_CODE[c]);

    // Deduplicate
    const uniqueTracks = [...new Set(trackCodes)];
    if (uniqueTracks.length > 0) {
      directives.push({ tracks: uniqueTracks, directive });
    }
  }

  return directives;
}

/**
 * Get the directive for a specific track from parsed directives.
 */
export function getDirectiveForTrack(directives: any[], trackCode: string) {
  for (const d of directives) {
    if (d.tracks.includes(trackCode)) return d.directive;
  }
  return null;
}

// ─── Season-aware Home suggestion ───────────────────────────────────────────
/**
 * A single "smart suggestion" for the Home screen, chosen from the student's
 * track (série) and the calendar season (see currentPlanSeason). This is what
 * powers the "Recommandé pour toi" card:
 *   • no track yet                    → choose-track (personalise everything)
 *   • Bac is over + a Bac série       → prefac-switch (push concours prep)
 *   • Bac season + a Bac série        → bac-focus (revise with real papers)
 *   • already Préfac / off-season     → null (nothing to nudge)
 *
 * The `key` is stable per season-year so a dismissed card stays hidden for the
 * current season but re-appears next cycle.
 */
export type HomeSuggestionKind =
  | 'choose-track'
  | 'prefac-switch'
  | 'bac-focus'
  | 'trivia-first'   // 7e–8e: no cours/exams yet → play to learn
  | 'cours-first'    // NS1–NS3: build foundations with cours + quizzes
  | 'exam9e-focus';  // 9e: the national 9ème exam

// ─── Grade / class ──────────────────────────────────────────────────────────
/**
 * Haitian school grades the app personalises around. `track` (filière) only
 * matters at NS4/Terminale (Bac) and Post-Bac; lower grades don't need one.
 */
export const GRADES = [
  { code: '7e',      label: '7ᵉ année',              labelHt: '7yèm ane' },
  { code: '8e',      label: '8ᵉ année',              labelHt: '8yèm ane' },
  { code: '9e',      label: '9ᵉ année',              labelHt: '9yèm ane' },
  { code: 'NS1',     label: 'NS1 (Secondaire)',      labelHt: 'NS1 (Segondè)' },
  { code: 'NS2',     label: 'NS2 (Secondaire)',      labelHt: 'NS2 (Segondè)' },
  { code: 'NS3',     label: 'NS3 (Secondaire)',      labelHt: 'NS3 (Segondè)' },
  { code: 'NS4',     label: 'NS4 · Terminale (Bac)', labelHt: 'NS4 · Tèminal (Bak)' },
  { code: 'POSTBAC', label: 'Après le Bac (Préfac)', labelHt: 'Apre Bak (Prefak)' },
];

export type PrimaryTab = 'Exams' | 'Quiz';
export type HomeSurface = 'exams' | 'cours' | 'quiz' | 'trivia' | 'readiness' | 'prefac';

export interface GradeProfile {
  /** Which practice surface leads the bottom bar / Home for this grade. */
  primaryTab: PrimaryTab;
  /** Exam level relevant to this grade (null = de-emphasize exams entirely). */
  examLevel: 'baccalaureat' | 'universite' | '9eme_af' | null;
  /** Home surfaces in priority order (an availability gate still applies downstream). */
  lead: HomeSurface[];
}

/** Resolve a grade to its content profile. Unknown/null → the Bac default. */
export function gradeProfile(grade: string | null | undefined): GradeProfile {
  switch (grade) {
    case '7e':
    case '8e':
      return { primaryTab: 'Quiz', examLevel: null, lead: ['trivia', 'quiz', 'cours'] };
    case '9e':
      return { primaryTab: 'Exams', examLevel: '9eme_af', lead: ['exams', 'quiz', 'trivia', 'cours'] };
    case 'NS1':
    case 'NS2':
    case 'NS3':
      return { primaryTab: 'Quiz', examLevel: null, lead: ['cours', 'quiz', 'trivia'] };
    case 'POSTBAC':
      return { primaryTab: 'Exams', examLevel: 'universite', lead: ['prefac', 'exams', 'quiz'] };
    case 'NS4':
    default:
      return { primaryTab: 'Exams', examLevel: 'baccalaureat', lead: ['exams', 'readiness', 'cours', 'quiz'] };
  }
}

/** Year of the next Bac session on/after `from` — the stable anchor for a season. */
export function seasonAnchorYear(from: Date = new Date()): number {
  const y = from.getFullYear();
  return from > new Date(y, 6, 20) ? y + 1 : y;
}

/**
 * The one "Recommandé pour toi" suggestion for the Home. Grade drives it when
 * known (surface the best of what we have for that background); otherwise it
 * falls back to the track + season heuristic.
 */
export function pickHomeSuggestion(
  opts: { track: string | null; grade?: string | null; from?: Date },
): { kind: HomeSuggestionKind; key: string } | null {
  const from = opts.from ?? new Date();
  const season = currentPlanSeason(from);
  const anchor = seasonAnchorYear(from);
  const { track, grade } = opts;

  // Grade known → background-aware nudge (the best of what we have for them).
  if (grade) {
    switch (grade) {
      case '7e':
      case '8e':
        return { kind: 'trivia-first', key: `trivia-first-${grade}` };
      case 'NS1':
      case 'NS2':
      case 'NS3':
        return { kind: 'cours-first', key: `cours-first-${grade}` };
      case '9e':
        return { kind: 'exam9e-focus', key: `exam9e-focus-${anchor}` };
      case 'POSTBAC':
        return { kind: 'prefac-switch', key: `prefac-switch-${anchor}` };
      case 'NS4':
        if (!track) return { kind: 'choose-track', key: `choose-track-${anchor}` };
        return season === 'prefac'
          ? { kind: 'prefac-switch', key: `prefac-switch-${anchor}` }
          : { kind: 'bac-focus', key: `bac-focus-${anchor}` };
    }
  }

  // No grade → track + season heuristic (existing behaviour).
  if (!track) return { kind: 'choose-track', key: `choose-track-${anchor}` };
  const isBacSerie = (TRACK_LEVEL[track] ?? 'baccalaureat') === 'baccalaureat';
  if (season === 'prefac') {
    return isBacSerie ? { kind: 'prefac-switch', key: `prefac-switch-${anchor}` } : null;
  }
  return isBacSerie ? { kind: 'bac-focus', key: `bac-focus-${anchor}` } : null;
}
