/**
 * lessonCopy — tells authored lesson/course copy from the sentences the
 * catalogue generator filled in (learning-journey RECHECK item 4).
 *
 * The generated text only repeats what the page already shows above it
 * (course, level, chapter), so it is hidden rather than shown as a summary:
 *   lesson  « Leçon « Masse et poids » du cours de Chimie NS1 — chapitre … »
 *           « Leson « … » nan kou … — chapit … »               (HT twin)
 *   course  « Cours de Chimie du Nouveau Secondaire 1 (NS1), enseigné en vidéo par EdLight. … »
 *           « Cours complet de Mathématiques du Nouveau Secondaire 2 (NS2), enseigné … »
 *           « Cours d'Économie NS1 (Nouveau Secondaire 1) — EdLight. »
 *           « Kou … Nouvo Segondè … EdLight »                    (HT twin)
 * Anything else counts as authored.
 */

const GENERATED: RegExp[] = [
  // Lesson template, FR.
  /^\s*le[çc]on\s*[«"“]\s*[^»"”]+[»"”]\s*du\s+cours\s+d/i,
  // Lesson template, HT.
  /^\s*leson\s*[«"“]\s*[^»"”]+[»"”]\s*(?:nan|nan kou|de|kou)\b/i,
  // Course template, FR: opens on "Cours" and names the level and EdLight in its first sentence.
  /^\s*cours\b[^.]*\b(?:nouveau\s+secondaire|NS\s?(?:[1-4]|I{1,3}|IV))\b[^.]*\bedlight\b/i,
  // Course template, HT.
  /^\s*kou\b[^.]*\b(?:nouvo\s+segond[eè]|NS\s?(?:[1-4]|I{1,3}|IV))\b[^.]*\bedlight\b/i,
];

/** True when the text is one of the generated catalogue sentences. */
export function isGeneratedDescription(text?: string | null): boolean {
  if (typeof text !== 'string') return false;
  const s = text.trim();
  if (!s) return false;
  return GENERATED.some((re) => re.test(s));
}

/** The text when it is authored and non-empty, otherwise null. */
export function authoredDescription(text?: string | null): string | null {
  if (typeof text !== 'string') return null;
  const s = text.trim();
  if (!s || isGeneratedDescription(s)) return null;
  return s;
}
