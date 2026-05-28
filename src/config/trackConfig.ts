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
    color: '#10b981',
    description: 'Biologie, géologie, chimie et physique',
  },
  {
    code: 'SMP',
    label: 'Sciences Mathématiques et Physiques',
    shortLabel: 'SMP',
    icon: '⚛️',
    color: '#3b82f6',
    description: 'Mathématiques, physique et chimie',
  },
  {
    code: 'SES',
    label: 'Sciences Économiques et Sociales',
    shortLabel: 'SES',
    icon: '📊',
    color: '#f59e0b',
    description: 'Économie, sciences sociales et gestion',
  },
  {
    code: 'LET',
    label: 'Lettres / Langues',
    shortLabel: 'Lettres',
    icon: '📚',
    color: '#8b5cf6',
    description: 'Français, langues étrangères et littérature',
  },
  {
    code: 'ARTS',
    label: 'Arts',
    shortLabel: 'Arts',
    icon: '🎨',
    color: '#ec4899',
    description: 'Art, musique et expression artistique',
  },
];

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
};

/**
 * Get the coefficient for a given subject in a given track.
 * Returns 1 (default) if the subject or track is unknown.
 */
export function getCoefficient(track, subject) {
  return TRACK_COEFFICIENTS[track]?.[subject] ?? 1;
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
export function parseTrackDirectives(instructions) {
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
export function getDirectiveForTrack(directives, trackCode) {
  for (const d of directives) {
    if (d.tracks.includes(trackCode)) return d.directive;
  }
  return null;
}
