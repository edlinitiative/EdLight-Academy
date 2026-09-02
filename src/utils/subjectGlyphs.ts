/**
 * subjectGlyphs — one CardCover glyph per exam subject, so subject cards and
 * subject pages share a stable visual identity (Coursera-style covers without
 * shipping photos for 13 subjects).
 */

export const SUBJECT_GLYPHS: Record<string, string> = {
  'Mathématiques': 'function',
  'Physique': 'atom',
  'Chimie': 'beaker',
  'SVT': 'leaf',
  'Économie': 'chart',
  'Histoire-Géo': 'globe',
  'Philosophie': 'book',
  'Français': 'book',
  'Anglais': 'globe',
  'Espagnol': 'globe',
  'Kreyòl': 'book',
  'Art & Musique': 'palette',
  'Informatique': 'chart',
  'Santé': 'leaf',
  'Culture Générale': 'book',
};
