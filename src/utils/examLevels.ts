/**
 * examLevels — the one mapping between exam-catalog level values and the
 * public URL slugs. Three files used to carry private copies (ExamBrowser,
 * searchIndex — which had a bug passing raw levels into URLs, breaking the
 * browser's back-target); new exam subpages import from here instead.
 */

/** URL slug -> raw catalog level (exam_catalog_index.json `level`). */
export const URL_LEVEL_TO_RAW: Record<string, string> = {
  '9e': '9eme_af',
  terminale: 'baccalaureat',
  university: 'universite',
};

/** Raw catalog level -> URL slug. */
export const RAW_LEVEL_TO_URL: Record<string, string> = {
  '9eme_af': '9e',
  '9e': '9e',
  neuvieme: '9e',
  baccalaureat: 'terminale',
  universite: 'university',
};

/** Display labels keyed by URL slug. */
export const LEVEL_SLUG_LABELS: Record<string, { fr: string; ht: string }> = {
  '9e': { fr: '9ème AF', ht: '9yèm AF' },
  terminale: { fr: 'Baccalauréat', ht: 'Bakaloreya' },
  university: { fr: 'Université', ht: 'Inivèsite' },
};

/** Normalize whatever level value we have (slug or raw) into a URL slug. */
export function levelToSlug(level: string | undefined | null): string {
  if (!level) return 'terminale';
  if (URL_LEVEL_TO_RAW[level]) return level; // already a slug
  return RAW_LEVEL_TO_URL[level] || level;
}
