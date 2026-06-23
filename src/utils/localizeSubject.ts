/**
 * localizeSubject — translate canonical subject names
 * ───────────────────────────────────────────────────
 * The readiness service, exam catalog and track config all speak in canonical
 * FRENCH subject names (e.g. "Chimie", "Mathématiques", "Histoire-Géo"), since
 * that's how `normalizeSubject` and the Bac coefficient tables are keyed.
 *
 * The course/quiz UI uses short subject CODES (MATH/PHYS/CHEM/ECON) routed
 * through i18next (`t('subjects.CHEM')`). This helper bridges the gap for the
 * canonical-name surfaces (the Readiness card, exam results) so subject labels
 * respect the active language without reworking those data models.
 *
 * French is the canonical key, so unknown/already-French names pass through.
 */

type SubjectLocale = { ht: string; en: string };

const SUBJECT_I18N: Record<string, SubjectLocale> = {
  'SVT': { ht: 'SVT', en: 'Biology & Earth Sci.' },
  'Chimie': { ht: 'Chimi', en: 'Chemistry' },
  'Physique': { ht: 'Fizik', en: 'Physics' },
  'Mathématiques': { ht: 'Matematik', en: 'Mathematics' },
  'Français': { ht: 'Fransè', en: 'French' },
  'Anglais': { ht: 'Anglè', en: 'English' },
  'Espagnol': { ht: 'Panyòl', en: 'Spanish' },
  'Philosophie': { ht: 'Filozofi', en: 'Philosophy' },
  'Histoire-Géo': { ht: 'Istwa-Jeyo', en: 'History-Geo' },
  'Kreyòl': { ht: 'Kreyòl', en: 'Creole' },
  'Économie': { ht: 'Ekonomi', en: 'Economics' },
  'Art & Musique': { ht: 'Atizay & Mizik', en: 'Art & Music' },
  'Informatique': { ht: 'Enfòmatik', en: 'Computing' },
  'Santé': { ht: 'Sante', en: 'Health' },
  'Culture Générale': { ht: 'Kilti Jeneral', en: 'General Knowledge' },
  'Mixed': { ht: 'Melanje', en: 'Mixed' },
  'Autre': { ht: 'Lòt', en: 'Other' },
};

/**
 * Return a subject's display name in the active language.
 * @param name     canonical (French) subject name
 * @param language 'fr' | 'ht' | 'en' (defaults to French)
 */
export function localizeSubject(name: string, language: string = 'fr'): string {
  if (!name) return '';
  const entry = SUBJECT_I18N[name];
  if (!entry) return name; // already French or an unmapped name → leave as-is
  if (language === 'ht') return entry.ht;
  if (language === 'en') return entry.en;
  return name;
}

export default localizeSubject;
