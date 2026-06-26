/**
 * Exam title / card-naming tests.
 *
 * The raw exam titles come from MENFP PDFs and are extremely noisy (full
 * ministry headers, filière codes, answer-key markers, unbalanced parens). These
 * tests lock in the polished card heading/sub-line behaviour for the specific
 * garbled shapes found while auditing the Terminale catalog, so they don't
 * regress.
 */
import {
  examTitleParts,
  examCardName,
  sessionLabel,
  examTypeLabel,
  normalizeExamTitle,
} from '../examUtils';

/** Convenience: raw exam → { heading, sub } exactly as the catalog card renders. */
function card(exam) {
  const p = examTitleParts(exam);
  return examCardName({ topic: p.topic, session: p.session, examType: p.examType });
}

describe('examTitleParts — topic extraction', () => {
  it('strips trailing answer-key codes (:SR, : NS, SR)', () => {
    expect(examTitleParts({ subject: 'Chimie', year: '2016', exam_title: 'BACCALAURÉAT SESSION ORDINAIRE JUIN 2016 CHIMIE Polyamide:SR' }).topic).toBe('Polyamide');
    expect(examTitleParts({ subject: 'Chimie', year: '2020', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES - CHIMIE - Carbure : NS" }).topic).toBe('Carbure');
    expect(examTitleParts({ subject: 'Chimie', year: '2022', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES (BAC PERMANENT) - CHIMIE : MOLÉCULE SR" }).topic).toBe('Molécule');
    expect(examTitleParts({ subject: 'Physique', year: '2021', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES - Bobine: NS" }).topic).toBe('Bobine');
  });

  it('keeps a real word that is merely parenthesised, but drops filière groups', () => {
    expect(examTitleParts({ subject: 'Économie', year: '2016', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES - ÉCONOMIE (ÉCOLOGISME)" }).topic).toBe('Écologisme');
    expect(examTitleParts({ subject: 'Mathématiques', year: '2022', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES MATHÉMATIQUES (SVT, SMP) - HYPERBOLE" }).topic).toBe('Hyperbole');
    expect(examTitleParts({ subject: 'Mathématiques', year: '2022', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES MATHÉMATIQUES (SES) LOGIQUE" }).topic).toBe('Logique');
  });

  it('handles unbalanced parens and stray filière codes (no leaked "( SES/LLA")', () => {
    expect(examTitleParts({ subject: 'Histoire-Géo', year: '2022', exam_title: 'Examens de Fin d\'Études Secondaires - Histoire-Géographie (Séries SES/LLA)' }).topic).toBe('');
    // A real topic survives next to a leaked filière paren.
    expect(examTitleParts({ subject: 'Histoire-Géo', year: '2019', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES SÉRIE (SES) HISTOIRE-GÉOGRAPHIE - Accroissement" }).topic).toBe('Accroissement');
  });

  it('removes the subject in every spelling (accent-safe), leaving the real topic', () => {
    expect(examTitleParts({ subject: 'Économie', year: '2022', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES (BAC PERMANENT) - ÉCONOMIE - Budget" }).topic).toBe('Budget');
    expect(examTitleParts({ subject: 'Art & Musique', year: '2016', exam_title: 'Examens de Fin d\'Études Secondaires Art et Musique Nago' }).topic).toBe('Nago');
    expect(examTitleParts({ subject: 'SVT', year: '2019', exam_title: 'Examens de Fin d\'Études Secondaires - SVT - Myopathie' }).topic).toBe('Myopathie');
  });

  it('drops orphaned elided articles ("de Éthique" → "Éthique")', () => {
    expect(examTitleParts({ subject: 'Philosophie', year: '2022', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES de Éthique" }).topic).toBe('Éthique');
    expect(examTitleParts({ subject: 'Art & Musique', year: '2020', exam_title: "Épreuves Nationales d'Art et Musique" }).topic).toBe('');
  });

  it('discards pure boilerplate so it never becomes a topic', () => {
    for (const raw of [
      "EXAMENS DE FIN D'ÉTUDES SECONDAIRES (SESSION ORDINAIRE)",
      'EXAMEN NATIONAL ET DE LA FORMATION PROFESSIONNELLE BACCALAURÉAT',
      "EXAMENS DE FIN D'ÉTUDES SECONDAIRES (ANCIENNE FORMATION)",
      'SESSION DES RAPPELS PHILO C-D MATHÉMATIQUES',
      'EXAMENS DE FIN D\'ÉTUDES SECONDAIRES (BAC UNIQUE) - ESPAGNOL',
    ]) {
      expect(examTitleParts({ subject: 'Mathématiques', year: '2022', exam_title: raw }).topic).toBe('');
    }
  });

  it('classifies the session type', () => {
    expect(examTitleParts({ subject: 'Maths', year: '2025', exam_title: 'BACCAULAURÉAT RÉGULIER - JUILLET 2025' }).examType).toBe('régulier');
    expect(examTitleParts({ subject: 'Chimie', year: '2022', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES (BAC PERMANENT)" }).examType).toBe('permanent');
    expect(examTitleParts({ subject: 'SVT', year: 'modèle', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES TEXTE MODÈLE SÉRIE : SVT" }).examType).toBe('modèle');
    expect(examTitleParts({ subject: 'Maths', year: '2015', exam_title: 'SESSION DE REMÉDIATION AOÛT 2015 MATHÉMATIQUES Minorant : NS' }).examType).toBe('remédiation');
  });
});

describe('examCardName — card heading/sub', () => {
  it('leads with the topic and surfaces the session/type beneath it', () => {
    expect(card({ subject: 'Chimie', year: '2022', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES CHIMIE SÉRIES (SVT, SMP) JUILLET 2022 WELSBACH" }))
      .toEqual({ heading: 'Welsbach', sub: 'Session de juillet' });
  });

  it('never renders a bare year as the heading — uses a clean label instead', () => {
    // No topic, no month, no special type → generic "Annale" (year lives on the chip).
    expect(card({ subject: 'Chimie', year: '2022', exam_title: "MINISTÈRE DE L'ÉDUCATION NATIONALE ET DE LA FORMATION PROFESSIONNELLE FILIÈRE D'ENSEIGNEMENT GÉNÉRAL EXAMENS DE FIN D'ÉTUDES SECONDAIRES CHIMIE" }))
      .toEqual({ heading: 'Annale', sub: '' });
    // No topic but a month session → "Session de juillet".
    expect(card({ subject: 'Anglais', year: '2022', exam_title: "Examens de Fin d'Études Secondaires - Anglais (Séries SVT, SES, SMP) - Juillet 2022" }))
      .toEqual({ heading: 'Session de juillet', sub: '' });
  });

  it('maps model and permanent sessions to friendly labels', () => {
    expect(card({ subject: 'SVT', year: 'modèle', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES TEXTE MODÈLE SÉRIE : SVT" }))
      .toEqual({ heading: 'Sujet type', sub: '' });
    expect(card({ subject: 'Mathématiques', year: '2025', exam_title: 'BACCAULAURÉAT RÉGULIER - JUILLET 2025' }))
      .toEqual({ heading: 'Bac régulier', sub: 'Juillet' });
  });
});

describe('label helpers', () => {
  it('sessionLabel elides "de" before a vowel', () => {
    expect(sessionLabel('Juillet 2022')).toBe('Session de juillet');
    expect(sessionLabel('Octobre 2020')).toBe("Session d'octobre");
    expect(sessionLabel('Août 2024')).toBe("Session d'août");
    expect(sessionLabel('2022')).toBe(''); // bare year is not a session
    expect(sessionLabel('')).toBe('');
  });

  it('examTypeLabel maps known types', () => {
    expect(examTypeLabel('permanent')).toBe('Bac permanent');
    expect(examTypeLabel('modèle')).toBe('Sujet type');
    expect(examTypeLabel('')).toBe('');
  });
});

describe('normalizeExamTitle — one-line title (cover / preview)', () => {
  it('falls back to a session-type label instead of repeating the year', () => {
    expect(normalizeExamTitle({ subject: 'SVT', year: 'modèle', exam_title: "EXAMENS DE FIN D'ÉTUDES SECONDAIRES TEXTE MODÈLE SÉRIE : SVT" }))
      .toBe('SVT — Sujet type');
    expect(normalizeExamTitle({ subject: 'Chimie', year: '2016', exam_title: 'BACCALAURÉAT SESSION ORDINAIRE JUIN 2016 CHIMIE Polyamide:SR' }))
      .toBe('Chimie — Polyamide · Juin 2016');
  });
});
