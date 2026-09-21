/**
 * Topic tags on an exam row.
 *
 * Eleven Baccalauréat 2025 maths papers render as the same line — "Session de
 * juillet 2025 · 13 questions · 180 min" — and `tracks` is `['ALL']` on every
 * one, so a student cannot tell them apart. The only thing that actually
 * differs is the mathematics inside, which lives in `topics` — mixed in with
 * fragments of each paper's section instructions.
 */
import { examTopicTags } from '../../../shared/examUtils';

describe('examTopicTags', () => {
  it('keeps real subject areas', () => {
    expect(examTopicTags(['Dérivées', 'Fonctions', 'Probabilités'], 3))
      .toEqual(['Dérivées', 'Fonctions', 'Probabilités']);
  });

  /* The exact strings that sit in the live catalogue next to the real ones. */
  it('drops section headings and rubric instructions', () => {
    expect(examTopicTags([
      'A.- Recopier et compléter les phrases suivantes',
      'B.- Traiter trois (3) des cinq (5) exercices',
      'Dérivées',
    ])).toEqual(['Dérivées']);
  });

  it('drops a bare section letter prefix in any of its forms', () => {
    expect(examTopicTags(['A. Complétion de phrases', 'B - Obligatoire', 'PARTIE A', 'Algèbre linéaire']))
      .toEqual(['Algèbre linéaire']);
  });

  it('caps the list so a row never wraps', () => {
    expect(examTopicTags(['Dérivées', 'Fonctions', 'Suites', 'Intégrales'])).toHaveLength(2);
  });

  it('de-duplicates case-insensitively', () => {
    expect(examTopicTags(['Fonctions', 'fonctions', 'Suites'])).toEqual(['Fonctions', 'Suites']);
  });

  it('is empty rather than wrong when there is nothing usable', () => {
    expect(examTopicTags(undefined)).toEqual([]);
    expect(examTopicTags(['A.- Recopier et compléter les phrases suivantes'])).toEqual([]);
    expect(examTopicTags('Dérivées')).toEqual([]);
  });

  it('refuses a tag too long to be a tag', () => {
    expect(examTopicTags(['Étude complète d’une fonction rationnelle et de ses asymptotes'])).toEqual([]);
  });
});
