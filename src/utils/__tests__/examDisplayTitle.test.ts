import {
  examDisplayTitle,
  displayStoredExamTitle,
  looksLikeExamBoilerplate,
} from '../../../shared/examUtils';

// The exam PDFs carry the ministry's letterhead as their document title, so
// `exam_title` is ~200 characters of boilerplate. A clean parser for it already
// existed; the bug was that the single-exam fetch path never ran it, and every
// surface reading `_title || exam_title` therefore printed the letterhead.
// These pin the seam so a new caller can't reintroduce it.

// The exact title Ted reported, from /exams/terminale/ex_5d08ef14-…
const REPORTED = "MINISTÈRE DE L'ÉDUCATION NATIONALE ET DE LA FORMATION PROFESSIONNELLE (MENFP) FILIÈRE D'ENSEIGNEMENT GÉNÉRAL EXAMENS DE FIN D'ÉTUDES SECONDAIRES TEXTE MODÈLE 2025 SÉRIE : SES PHYSIQUE";
const REPORTED_EXAM = { exam_title: REPORTED, subject: 'Physique', year: '2025', level: 'baccalaureat' };

describe('looksLikeExamBoilerplate', () => {
  it('recognises the ministry letterhead', () => {
    expect(looksLikeExamBoilerplate(REPORTED)).toBe(true);
    expect(looksLikeExamBoilerplate('MENFP — Épreuve de juillet')).toBe(true);
    expect(looksLikeExamBoilerplate("EXAMENS DE FIN D'ÉTUDES SECONDAIRES")).toBe(true);
  });

  it('leaves a real title alone', () => {
    expect(looksLikeExamBoilerplate('Physique — Sujet type · SES · 2025')).toBe(false);
    expect(looksLikeExamBoilerplate('Chimie — Chimie Organique · Session de juillet 2024')).toBe(false);
    expect(looksLikeExamBoilerplate('')).toBe(false);
    expect(looksLikeExamBoilerplate(null)).toBe(false);
  });
});

describe('examDisplayTitle', () => {
  it('turns the reported letterhead into a readable title', () => {
    const title = examDisplayTitle(REPORTED_EXAM);
    expect(title).toBe('Physique — Sujet type · SES · 2025');
    // The point of the whole exercise: it fits on a line.
    expect(title.length).toBeLessThan(60);
  });

  it('prefers an already-enriched _title from buildExamIndex', () => {
    // The browse path enriches; the single-exam path does not. Both must work.
    expect(examDisplayTitle({ ...REPORTED_EXAM, _title: 'Physique — Ondes · 2025' }))
      .toBe('Physique — Ondes · 2025');
  });

  it('ignores an _title that is itself letterhead', () => {
    // Guards the case where the enrichment ran but produced nothing better.
    expect(examDisplayTitle({ ...REPORTED_EXAM, _title: REPORTED }))
      .toBe('Physique — Sujet type · SES · 2025');
  });

  it('falls back rather than rendering an empty heading', () => {
    expect(examDisplayTitle(null, 'Examen')).toBe('Examen');
    expect(examDisplayTitle(undefined, 'Egzamen')).toBe('Egzamen');
    expect(examDisplayTitle({}, 'Examen')).toBe('Examen');
  });
});

describe('displayStoredExamTitle', () => {
  it('re-derives a title that was saved as letterhead', () => {
    // Attempts written before this fix hold the raw string; fixing the render
    // path alone would never reach them.
    expect(displayStoredExamTitle(REPORTED, REPORTED_EXAM))
      .toBe('Physique — Sujet type · SES · 2025');
  });

  it('re-derives from the stored string alone when the exam is gone', () => {
    // A deleted or renamed catalog entry still has to produce something short.
    const out = displayStoredExamTitle(REPORTED, null);
    expect(looksLikeExamBoilerplate(out)).toBe(false);
    expect(out).toContain('Physique');
  });

  it('trusts a stored title that is already clean', () => {
    // It may name a topic the catalog no longer carries — don't overwrite it.
    expect(displayStoredExamTitle('Physique — Ondes · 2025', REPORTED_EXAM))
      .toBe('Physique — Ondes · 2025');
  });

  it('falls back when there is nothing usable at all', () => {
    expect(displayStoredExamTitle('', null, 'Examen')).toBe('Examen');
    expect(displayStoredExamTitle(null, null, 'Egzamen')).toBe('Egzamen');
  });
});
