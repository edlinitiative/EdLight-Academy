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
