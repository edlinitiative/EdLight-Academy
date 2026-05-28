/**
 * Exam Utilities
 * ─────────────
 * Subject normalization (85+ raw variants → ~15 canonical),
 * index builder, grading engine, and helpers for the Exam UI pages.
 */

import { checkWithCAS } from './mathCAS';
import { getCoefficient } from '../config/trackConfig';

// ─── Subject normalisation ──────────────────────────────────────────────────

const SUBJECT_MAP = {
  // French
  francais: 'Français',
  français: 'Français',

  // English
  anglais: 'Anglais',
  'anglais - business': 'Anglais',
  'anglais et espagnol': 'Anglais',

  // Spanish
  espagnol: 'Espagnol',
  'espagnol - gastronomía': 'Espagnol',

  // Math
  mathematiques: 'Mathématiques',
  mathématiques: 'Mathématiques',
  'mathématiques topographie': 'Mathématiques',
  'mathématiques, chimie, physique, compréhension de texte': 'Mixed',

  // Physics
  physique: 'Physique',
  'physique - onde': 'Physique',

  // Chemistry
  chimie: 'Chimie',
  'chimie - hydrocarbures': 'Chimie',
  'chimie organique': 'Chimie',
  'chimie (ses) brome': 'Chimie',
  'chimie (svt, smp)': 'Chimie',
  'chimie (svt, smp) alcool : sr': 'Chimie',
  'chimie (svt, smp) macromolécule : sr': 'Chimie',

  // Biology / SVT / Geology
  svt: 'SVT',
  'svt (sciences de la vie et de la terre)': 'SVT',
  'svt - anatomie': 'SVT',
  'svt - cytologie': 'SVT',
  'svt - morphologie': 'SVT',
  'svt - paléontologie': 'SVT',
  'svt cardiaque': 'SVT',
  'svt histologie': 'SVT',
  'svt morphologie': 'SVT',
  'svt microbiologie': 'SVT',
  'svt, génétique, géologie': 'SVT',
  'biologie et géologie': 'SVT',
  'biologie / géologie': 'SVT',
  'biologie / géologie (svt) - polynevrite : sr': 'SVT',
  'bio/géo': 'SVT',
  géologie: 'SVT',
  anatomie: 'SVT',
  zoologie: 'SVT',
  'cytologie (svt)': 'SVT',

  // History / Geography
  'histoire et géographie': 'Histoire-Géo',
  'histoire - géographie': 'Histoire-Géo',
  'histoire-géographie': 'Histoire-Géo',

  // Philosophy
  philosophie: 'Philosophie',
  'philosophie (esthétique)': 'Philosophie',
  'philosophie (religion)': 'Philosophie',
  'philosophie - logique': 'Philosophie',
  'philosophie, sciences humaines, culture haïtienne': 'Philosophie',

  // Kreyòl
  kreyol: 'Kreyòl',
  kreyòl: 'Kreyòl',
  'kominikasyon kreyòl': 'Kreyòl',

  // Economics
  économie: 'Économie',

  // Art / Music
  art_musique: 'Art & Musique',
  'art et musique': 'Art & Musique',
  'arts et musique': 'Art & Musique',
  'éducation esthétique et artistique': 'Art & Musique',

  // Informatics
  informatique: 'Informatique',

  // Health / Nursing
  santé: 'Santé',
  'sciences infirmières': 'Santé',
  'sciences infirmières - bloc materno-infantile et bloc santé mentale': 'Santé',
  'soins infirmiers': 'Santé',

  // Mixed / General
  mixed: 'Mixed',
  'culture générale': 'Culture Générale',
  'connaissances générales': 'Culture Générale',
  "concours d'admission": 'Culture Générale',
  éthique: 'Philosophie',
};

export function normalizeSubject(raw) {
  if (!raw) return 'Autre';
  const key = raw.trim().toLowerCase();
  return SUBJECT_MAP[key] || raw.trim();
}

// ─── Level normalisation ────────────────────────────────────────────────────

const LEVEL_MAP = {
  baccalaureat: 'Baccalauréat',
  '9eme_af': '9ème AF',
  universite: 'Université',
};

export function normalizeLevel(raw) {
  if (!raw) return '';
  return LEVEL_MAP[raw.trim().toLowerCase()] || raw.trim();
}

// ─── Year normalisation ─────────────────────────────────────────────────────

const MONTH_RE =
  /(?:JANVIER|F[ÉE]VRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AO[ÛU]T|SEPTEMBRE|OCTOBRE|NOVEMBRE|D[ÉE]CEMBRE)/i;

const MONTH_LABELS = {
  janvier: 'Janvier',
  fevrier: 'Février',
  février: 'Février',
  mars: 'Mars',
  avril: 'Avril',
  mai: 'Mai',
  juin: 'Juin',
  juillet: 'Juillet',
  aout: 'Août',
  août: 'Août',
  septembre: 'Septembre',
  octobre: 'Octobre',
  novembre: 'Novembre',
  decembre: 'Décembre',
  décembre: 'Décembre',
};

/**
 * Normalise a year field.  Returns { year: number|0, session: string }.
 *
 * Raw year values come in many forms:
 *   "2022"  →  { year: 2022, session: '' }
 *   "JUILLET 2022"  →  { year: 2022, session: 'Juillet 2022' }
 *   "2016-2022"  →  { year: 2022, session: '' }
 *   "Modèle"  →  { year: 0, session: '' }
 */
export function normalizeYear(raw) {
  const str = String(raw || '').trim();
  if (!str) return { year: 0, session: '' };

  // Try to extract month + 4-digit year
  const monthYearMatch = str.match(
    new RegExp(`(${MONTH_RE.source})\\s*(\\d{4})`, 'i'),
  );
  if (monthYearMatch) {
    const month = MONTH_LABELS[monthYearMatch[1].toLowerCase()] || monthYearMatch[1];
    const yr = parseInt(monthYearMatch[2], 10);
    return { year: yr, session: `${month} ${yr}` };
  }

  // Try plain 4-digit year (take the latest if range like "2016-2022")
  const yearMatches = str.match(/\d{4}/g);
  if (yearMatches) {
    const yr = Math.max(...yearMatches.map(Number));
    return { year: yr, session: '' };
  }

  return { year: 0, session: '' };
}

// ─── Title normalisation ────────────────────────────────────────────────────

/**
 * Boilerplate phrases that appear in raw exam titles from MENFP PDFs.
 * Order matters — earlier patterns consume more text so later ones don't re-match.
 */
const TITLE_NOISE = [
  // Full ministry name with optional "(MENFP)" and optional comma/dash
  /MINIST[ÈE]RE\s+(?:DE\s+L[''']?)?[ÉE]DUCATION\s+NATIONALE\s+(?:ET\s+)?(?:DE\s+LA\s+)?FORMATION\s+PROFESSIONNELLE\s*(?:[,(]\s*MENFP\s*\)?\s*)?/gi,
  // Filière (French)
  /FILI[ÈE]RES?\s+(?:D[''']?)?ENSEIGNEMENT\s+G[ÉE]N[ÉE]RAL/gi,
  // "Examens de fin d'études secondaires" (with accented or plain characters)
  /EXAMENS?\s+(?:DE\s+)?FIN\s+D[''']?[ÉE]TUDES?\s+SECONDAIRES/gi,
  // "Baccalauréat ..." variations (keep session/month if any)
  /BACCALAUR[ÉE]AT\s+(?:D[''']?ENSEIGNEMENT\s+G[ÉE]N[ÉE]RAL\s*)?(?:2[ÈE]ME\s+PARTIE\s*)?/gi,
  /BACCALAUR[ÉE]AT\s+(?:R[ÉE]GULIER|PERMANENT)\s*/gi,
  /BACCALAUR[ÉE]AT\s+SESSION\s+(?:ORDINAIRE|EXTRAORDINAIRE)\s*/gi,
  /BAC\s+PERMANENT\s*/gi,
  // "Épreuves Nationales..."
  /[ÉE]PREUVES?\s+NATIONALES?\s+(?:DE\s+FIN\s+D[''']?[ÉE]TUDES?\s+SECONDAIRES\s*)?/gi,
  // Series patterns — extract before removing
  /S[ÉE]RIES?\s*:?\s*\([^)]*\)\s*/gi,
  /S[ÉE]RIES?\s*:?\s*[A-Z,/\s-]+(?=\s|$)/gi,
  // Session month+year (we already extract this from the year field)
  /(?:SESSION\s+(?:ORDINAIRE|EXTRAORDINAIRE)\s*)?[-–—]?\s*(?:JANVIER|F[ÉE]VRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AO[ÛU]T|SEPTEMBRE|OCTOBRE|NOVEMBRE|D[ÉE]CEMBRE)\s*[-–—]?\s*\d{0,4}\s*/gi,
  // Bare year
  /[-–—]\s*\d{4}\s*/g,
  // "Épreuve de ..." prefix (redundant with subject)
  /[ÉE]PREUVE\s+(?:DE\s+|D['''])/gi,
  // Kreyòl boilerplate
  /EGZAMEN\s+FEN\s+ETID[ÈE]?\s+SEGOND[ÈE]?/gi,
  /BAKALOREYA\s+(?:SESYON\s+(?:JEN|JIY[ÈE]|JIVÈ|OUT)|P[ÈE]MANAN|REGILYE)\s*[-–—]?\s*(?:JEN|JIY[ÈE]|JIVÈ|OUT|MAS|FEVRIYE|JANVYE|AVR[IÌ]L|DESANM)?\s*\d{0,4}\s*/gi,
  // Kreyòl ministry name — catch-all for many spelling variants
  // If "(MENFP)" is present, strip everything from "Minist..." up to and including it
  /MINIST[ÈEÉ]\S*\s+(?:(?!\bMENFP\b).)*\bMENFP\b\s*\)?\s*/gi,
  // Without MENFP: match known Kreyòl structure (\S+ absorbs spelling variants)
  /MINIST[ÈEÉ]\S*\s+\S+\s+NA[TS]?YONAL\S*\s+(?:AK|ET)\s+(?:DE\s+)?(?:LA\s+)?F[OÒ]\S*MASYON\s+P\S+\s*/gi,
  // "BIWO NASYONAL EGZAMEN LETA" / "DIREKSYON ANSÈYMAN FONDAMANTAL"
  /BIWO\s+NASYONAL\s+EGZAMEN\s+LETA\s*/gi,
  /DIR[EÈ]KSYON\s+ANS[ÈE]YMAN\s+FONDAMANTAL\s*/gi,
  // Kreyòl filière + "seconde IV" French variant
  /FIL[IY][ÈEÉ]R?E?\s+ANS[ÈEÉ]YMAN\s+JENERAL\s*/gi,
  /FIL[VY][ÈEÉ]\s+ANS[ÈEÉ]YMAN\s+JENERAL\s*/gi,
  /SECONDE?\s+IV\s*/gi,
  /PERMANENT[E]?\s+SECONDE?\s+IV\s*/gi,
  // Kreyòl series / level remnants ("SERI:", "SEGONDÈ IV", "SÈVIS SOSYAL", etc.)
  /SERI\s*:?\s*\([^)]*\)\s*/gi,
  /SERI\s*:\s*[A-Z,/\s-]+(?=\s|$)/gi,
  /\bSES\s*\([^)]*\)\s*/gi,
  /S[ÈE]VIS\s+(?:SOSYAL|JESYON)\s+\w*\s*/gi,
  /SEGOND[ÈEÉI]\s+IV\s*/gi,
  /BAK\s+P[ÈE]MANAN\s*[-–—]?\s*(?:JEN|JIYE|OUT|MAS|FEVRIYE|JANVYE)?\s*/gi,
  /(?:MATOMANN|RABONNEN|POTORIK)\s*/gi,
  // "UNIVERSIT[ÉE] D'[ÉE]TAT D'HA[ÏI]TI" and faculty names
  /UNIVERSIT[ÉE]\s+D[''']?[ÉE]TAT\s+D[''']?HA[ÏI]TI\s*[-–—]?\s*(?:Facult[ée]\s+[^-–—\n]*)?/gi,
  // "Bureau national des examens..." / "Faculté de médecine..." institutional headers
  /BUREAU\s+NATIONAL\s+DES\s+EXAMENS\s+D[''']?[ÉE]TAT\s*\/?\s*(?:DIRECTION\s+[^-–—\n]*)?/gi,
  /DIRECTION\s+DE\s+L[''']?ENSEIGNEMENT\s+FONDAMENTAL\s*/gi,
  /FACULT[ÉEÈ]\s+DE\s+M[ÉEÈ]DECINE\s+(?:ET\s+DE\s+PHARMACIE\s+)?(?:ET\s+L[''']?[ÉEÈ]COLE\s+[^-–—\n]*)?/gi,
  // "EXAMEN DE 9ÈME ANNÉE FONDAMENTALE"
  // "EXAMEN DE 9ÈME ANNÉE FONDAMENTALE" / "EGZAMEN 9èm ANE FONDAMANTAL"
  /EGZAMEN\s+\d+[ÈE]M\s+ANE\s+FONDAMANTAL\s*/gi,
  /EXAMEN\s+DE\s+\d+[ÈE]ME\s+ANN[ÉEÈ]E\s+FONDAMENTALE\s*/gi,
  // Institution headers
  /CONCOURS\s+D[''']?(?:ADMISSION|ENTR[ÉEÈ]E)\s+(?:EN\s+\w+\s+ANN[ÉEÈ]E\s*)?/gi,
  // "Ministere de la sante publique..."
  /MINIST[ÈEÉ]RE?\s+DE\s+LA\s+SANT[ÉEÈ]\s+PUBLIQUE\s+ET\s+DE\s+LA\s+POPULATION\s*/gi,
  /EXAMEN\s+D[''']?[ÉEÈ]TAT\s+EN\s+SCIENCES\s+INFIRMI[ÈE]RES\s*/gi,
  /CENTRE\s+DE\s+TECHNIQUES\s+DE\s+PLANIFICATION\s+ET\s+D[''']?[ÉEÈ]CONOMIE\s+APPLIQU[ÉEÈ]E\s*\(\s*CTPEA\s*\)\s*/gi,
  /INSTITUT\s+NATIONAL\s+D[''']?ADMINISTRATION[^()]*?\(\s*INAGHEI\s*\)?\s*/gi,
  /SESSION\s+(?:ORDINAIRE|EXTRAORDINAIRE)\s*/gi,
  // Parenthesized series codes: (SES), (SVT), (LLA) etc.
  /\([A-Z]{2,5}(?:[\s,/-]+[A-Z]{2,5})*\)\s*/gi,
  // Stray separators and whitespace
  /^\s*[-–—:,.\s]+/,
  /\s*[-–—:,.\s]+$/,
];

/**
 * Extract series info (e.g. "SVT, SES, SMP") from a raw exam title.
 */
function extractSeries(title) {
  // Match patterns like "SÉRIES : (SVT, SES, SMP)" or "SÉRIE : LLA"
  const m = title.match(/S[ÉE]RIES?\s*:?\s*\(?([A-Za-z,/\s-]+)\)?/i);
  if (!m) return '';
  return m[1]
    .replace(/\s+/g, ' ')
    .replace(/\s*[,/]\s*/g, ', ')
    .trim()
    .toUpperCase();
}

/**
 * Extract session month/year from the raw title string.
 */
function extractSession(title) {
  const m = title.match(
    new RegExp(
      `(?:SESSION\\s+(?:ORDINAIRE|EXTRAORDINAIRE)\\s*)?[-–—]?\\s*(${MONTH_RE.source})\\s*[-–—]?\\s*(\\d{4})`,
      'i',
    ),
  );
  if (!m) return '';
  const month = MONTH_LABELS[m[1].toLowerCase()] || m[1];
  return `${month} ${m[2]}`;
}

/**
 * Produce a short, clean exam title from the raw title + metadata.
 *
 * Strategy:
 *   1. Extract series and session from the raw title before stripping
 *   2. Strip all boilerplate noise
 *   3. Whatever meaningful text remains becomes the "topic" (e.g. "Chimie Organique",
 *      "Anglais", "TEXTE MODÈLE", "Ethanol")
 *   4. Build: "[Subject] — [Topic] [· Series] [· Session]"
 *      - If topic duplicates the subject, omit it
 *      - If no topic and no extra metadata, use: "[Subject] — Bac [Year]"
 */
export function normalizeExamTitle(exam) {
  const rawTitle = String(exam.exam_title || '').trim();
  const subject = normalizeSubject(exam.subject);
  const { year, session: yearSession } = normalizeYear(exam.year);

  // Extract metadata embedded in title
  const series = extractSeries(rawTitle);
  const titleSession = extractSession(rawTitle);

  // Strip boilerplate noise
  let cleaned = rawTitle;
  for (const re of TITLE_NOISE) {
    cleaned = cleaned.replace(re, ' ');
  }
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  // Remove trailing/leading punctuation
  cleaned = cleaned.replace(/^[\s\-–—:,.]+|[\s\-–—:,.]+$/g, '').trim();

  // Remove subject name from the topic (avoids "Chimie — CHIMIE Organique")
  // Check at word boundary, not just start — handles "HISTOIRE-GÉOGRAPHIE" anywhere
  if (subject) {
    // Build variants: "Histoire-Géo" + possible full forms like "Histoire-Géographie"
    const escSubj = subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`\\b${escSubj}\\b\\s*[-–—:]?\\s*`, 'gi'), '').trim();
  }
  // Also remove the raw subject field value (handles unormalized forms)
  if (exam.subject) {
    const rawSubj = String(exam.subject).trim();
    const escRaw = rawSubj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`\\b${escRaw}\\b\\s*[-–—:]?\\s*`, 'gi'), '').trim();
  }

  // Strip leftover "régulier", "permanent" (already captured by level)
  cleaned = cleaned.replace(/^(?:R[ÉE]GULIER|PERMANENT)\s*/i, '').trim();
  // Strip leftover "fin d'études secondaires" fragments
  cleaned = cleaned.replace(/\bfin\s+d[''']?[ée]tudes?\s+secondaires\b/gi, '').trim();
  // Strip "Examen de" / "Épreuve de" prefix
  cleaned = cleaned.replace(/^(?:Examen|[ÉE]preuve)\s+(?:de\s+|d['''])/i, '').trim();
  // Strip "Deuxième partie" / "2ème partie"
  cleaned = cleaned.replace(/\b(?:Deuxi[èe]me|2[èe]me)\s+partie\b/gi, '').trim();
  // Strip leftover bare years
  cleaned = cleaned.replace(/\b\d{4}\b/g, '').trim();
  // Strip leftover "Espagnol 1" → just "1" type remnants, or bare series codes like "SMP"
  cleaned = cleaned.replace(/^\d+$/, '').trim();
  // Strip orphaned parentheses / brackets before fragment checks
  cleaned = cleaned.replace(/^[\s\-–—:,.()[\]]+|[\s\-–—:,.()[\]]+$/g, '').trim();
  // Strip orphaned short fragments: lone "graphie", "géo" from partial subject removal
  if (cleaned.length < 8 && /^[a-zà-ÿ]+$/i.test(cleaned)) {
    // Check if it's a substring of the subject
    if (subject && subject.toLowerCase().includes(cleaned.toLowerCase())) {
      cleaned = '';
    }
  }
  // Strip lone series codes left in the topic
  if (/^[A-Z]{2,4}(?:[\s,/-]+[A-Z]{2,4})*$/i.test(cleaned)) {
    cleaned = '';
  }

  // Remove if only the subject name remains (redundant) or is empty-ish
  if (subject && cleaned.toLowerCase().replace(/[^a-zà-ÿ]/g, '') === subject.toLowerCase().replace(/[^a-zà-ÿ]/g, '')) {
    cleaned = '';
  }
  // Remove if it's just "PHILO C-D" or similar series abbreviation
  if (/^(?:PHILO\s+)?[A-Z][\s-]*[A-Z]?$/i.test(cleaned)) {
    cleaned = '';
  }
  // Remove standalone "MENFP" (ministry acronym leaked through)
  cleaned = cleaned.replace(/\bMENFP\b\s*/gi, '').trim();
  // Remove stray Kreyòl month names used as topic
  cleaned = cleaned.replace(/^(?:JEN|JIY[ÈE]|JIV[ÈE]|OUT|MAS|FEVRIYE|JANVYE|AVR[IÌ]L|DESANM)$/i, '').trim();
  // Remove trailing/leading punctuation again after all cleaning
  cleaned = cleaned.replace(/^[\s\-–—:,.()[\]/]+|[\s\-–—:,.()[\]/]+$/g, '').trim();
  // Final guard: if what's left is very short junk (≤2 chars), discard
  if (cleaned.length <= 2) cleaned = '';

  // Build the clean title
  const parts = [subject || 'Examen'];

  // Meaningful topic / subtitle from the original title
  if (cleaned) {
    // Smart case: Title-case if ALL UPPER, otherwise preserve original mixed case
    let topic;
    if (cleaned.length > 3 && cleaned === cleaned.toUpperCase()) {
      // "TEXTE MODÈLE" → "Texte modèle"
      topic = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    } else {
      topic = cleaned;
    }
    parts.push('—');
    parts.push(topic);
  }

  // Session line
  const session = titleSession || yearSession;

  // Build subtitle chips (series, session, year)
  const chips = [];
  // Only show series if it adds info beyond the subject name
  if (series) {
    const seriesClean = series
      .split(/[,\s]+/)
      .filter((s) => s.length >= 2 && s.toUpperCase() !== subject.toUpperCase())
      .join(', ');
    if (seriesClean) chips.push(seriesClean);
  }
  if (session) {
    chips.push(session);
  } else if (year) {
    chips.push(String(year));
  }

  if (chips.length) {
    parts.push('·');
    parts.push(chips.join(' · '));
  } else if (!cleaned && year) {
    // No topic and no session — add bare year
    parts.push('·');
    parts.push(String(year));
  }

  return parts.join(' ');
}

// ─── Subject colors ─────────────────────────────────────────────────────────

const SUBJECT_COLORS = {
  Français: '#8b5cf6',
  Anglais: '#3b82f6',
  Espagnol: '#f59e0b',
  Mathématiques: '#ef4444',
  Physique: '#06b6d4',
  Chimie: '#22c55e',
  SVT: '#10b981',
  'Histoire-Géo': '#f97316',
  Philosophie: '#a855f7',
  Kreyòl: '#ec4899',
  Économie: '#14b8a6',
  'Art & Musique': '#d946ef',
  Informatique: '#6366f1',
  Santé: '#e11d48',
  'Culture Générale': '#64748b',
  Mixed: '#78716c',
};

export function subjectColor(subject) {
  return SUBJECT_COLORS[subject] || '#6366f1';
}

// ─── Question type metadata ─────────────────────────────────────────────────

export const QUESTION_TYPE_META = {
  multiple_choice: { icon: 'Circle', label: 'QCM', gradable: true },
  multiple_select: { icon: 'CheckSquare', label: 'QCM (plusieurs)', gradable: true },
  true_false: { icon: 'CheckCircle', label: 'Vrai/Faux', gradable: true },
  fill_blank: { icon: 'Pencil', label: 'Compléter', gradable: true },
  calculation: { icon: 'Calculator', label: 'Calcul', gradable: true },
  short_answer: { icon: 'PenLine', label: 'Réponse courte', gradable: true },
  essay: { icon: 'FileText', label: 'Rédaction', gradable: false },
  matching: { icon: 'Link', label: 'Appariement', gradable: false },
  unknown: { icon: 'HelpCircle', label: 'Autre', gradable: false },
};

export function questionTypeMeta(type) {
  return QUESTION_TYPE_META[type] || QUESTION_TYPE_META.unknown;
}

// ─── Build index ────────────────────────────────────────────────────────────

/**
 * Build a searchable index from the raw exam catalog array.
 * Enriches each exam object with precomputed fields (_subject, _level, etc.)
 * and returns { exams, levels, subjects, years }.
 */
export function buildExamIndex(rawExams) {
  const levelSet = new Set();
  const subjectSet = new Set();
  const yearSet = new Set();

  const exams = rawExams.map((exam, idx) => {
    const subj = normalizeSubject(exam.subject);
    const level = normalizeLevel(exam.level);
    const yearRaw = String(exam.year || '');
    const { year: yearNum } = normalizeYear(yearRaw);
    const title = normalizeExamTitle(exam);

    let qCount = 0;
    let autoGradable = 0;
    const typeCounts = {};

    for (const sec of exam.sections || []) {
      for (const q of sec.questions || []) {
        qCount++;
        const t = q.type || 'unknown';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
        const meta = QUESTION_TYPE_META[t] || QUESTION_TYPE_META.unknown;
        if ((meta.gradable && q.correct) || (q.answer_parts && q.answer_parts.length > 0)) autoGradable++;
      }
    }

    if (subj) subjectSet.add(subj);
    if (level) levelSet.add(level);
    if (yearNum) yearSet.add(yearNum);

    return {
      ...exam,
      _idx: idx,
      _subject: subj,
      _level: level,
      _title: title,
      _yearRaw: yearRaw,
      _year: yearNum,
      _questionCount: qCount,
      _autoGradable: autoGradable,
      _typeCounts: typeCounts,
      tracks: exam.tracks || ['ALL'],
    };
  });

  return {
    exams,
    levels: [...levelSet].sort(),
    subjects: [...subjectSet].sort(),
    years: [...yearSet].sort((a, b) => b - a),
  };
}

// ─── Flatten questions ──────────────────────────────────────────────────────

/**
 * Extract the sub-exercise letter prefix from a question number.
 * "A.1" → "A", "B.3" → "B", "C" → "C", "II.A.2" → "II.A", "5" → null
 */
function subExerciseGroup(num) {
  if (!num) return null;
  const s = String(num).trim();
  // Match leading letter-based prefix: A.1 → A, II.A.2 → II.A, B → B
  const m = s.match(/^([A-Z]+(?:\.[A-Z]+)*)(?:[.\-]?\d|$)/i);
  if (m) return m[1];
  // Standalone letter: "A", "B", etc.
  if (/^[A-Z]$/i.test(s)) return s;
  return null;
}

/**
 * Clean up question text for display:
 * 1. Strip leading directive prefix from first-in-group questions
 *    (e.g. "A. Write the correct form... (10%)\n1. She has been...")
 * 2. Strip redundant leading sub-number (e.g. "2. If we had...")
 * 3. Strip embedded percentage/point markers like "(10%)" or "15%"
 * 4. Extract word pool / word bank into a separate field
 * 5. Handle remaining leading whitespace / newlines
 *
 * Returns { cleanText, directive, wordPool }
 */
export function cleanQuestionText(text, number, isFirstInGroup) {
  if (!text) return { cleanText: '', directive: '', wordPool: '' };

  let t = text;
  let directive = '';
  let wordPool = '';

  // ── 1. Extract directive prefix from first-in-group ──
  // Matches: "A. Write the correct form of the verbs... (10%)\n"
  // or "D. Choose the right word... 10%\n"
  // or "A- Problem-solving situation (10%)\n"
  if (isFirstInGroup) {
    const directiveMatch = t.match(
      /^([A-Z][\.\-\)]\s*.+?)(?:\s*\(?\s*\d+\s*%\s*\)?\s*)?\n/
    );
    if (directiveMatch) {
      directive = directiveMatch[1].replace(/\s*\(?\s*\d+\s*%\s*\)?\s*$/, '').trim();
      t = t.slice(directiveMatch[0].length);
    } else {
      // Fallback: instruction line without a letter prefix, e.g.
      // "Escoger la formula verbal adecuada... (10%)\n1. Joana..."
      // or "Situación (Ítem obligatorio) (10%)\n..."
      const fallbackMatch = t.match(
        /^(.+?)\s*\(?\s*\d+\s*%\s*\)?\s*\n(?=\d+[.\-)]\s|\S)/
      );
      if (fallbackMatch) {
        directive = fallbackMatch[1].replace(/\s*\(?\s*\d+\s*%\s*\)?\s*$/, '').trim();
        t = t.slice(fallbackMatch[0].length);
      }
    }
  }

  // ── 2. Extract word pool / word bank ──
  // a) Parenthesized: "(Word pool: ...)" or "(Mots: ...)"
  const wpRegex = /\((?:Word\s*pool|Word\s*bank|Banque\s*de\s*mots|Mots)\s*:\s*([^)]+)\)/gi;
  const wpMatches = [...t.matchAll(wpRegex)];
  if (wpMatches.length > 0) {
    wordPool = wpMatches[0][1].trim();
    // Remove all occurrences from text
    t = t.replace(wpRegex, '').trim();
  }

  // b) Standalone word list line(s): "Lista de palabras: ...", "Word list: ..."
  //    These are not parenthesized; capture everything after the label up to the
  //    next numbered question line (or end of string).
  if (!wordPool) {
    const wpStandalone = t.match(
      /(?:Lista\s+de\s+palabras|Word\s*list)\s*:\s*(.+(?:\n(?!\d+[.\-)]\s).+)*)/i
    );
    if (wpStandalone) {
      wordPool = wpStandalone[1].replace(/\s*\n\s*/g, ' ').trim();
      const start = t.indexOf(wpStandalone[0]);
      t = (t.slice(0, start) + t.slice(start + wpStandalone[0].length)).trim();
    }
  }

  // ── 3. Strip [Figure: ...] tags (rendered separately by FigureRenderer) ──
  t = t.replace(/\s*\[Figure:\s*[^\]]*\]\s*/g, ' ').trim();

  // ── 4. Strip redundant leading sub-number or sub-letter ──
  // "1. She has been..." → "She has been..."
  // "2. If we had..." → "If we had..."
  // "a. Reorder the following..." → "Reorder the following..."
  // "b. Write a ten-line..." → "Write a ten-line..."
  t = t.replace(/^(?:\d+|[a-z])[\.\)]\s*/, '');

  // ── 4. Strip embedded standalone percentage markers ──
  // Remove leading "10%" or "(10%)" on their own
  t = t.replace(/^\s*\(?\s*\d+\s*%\s*\)?\s*\n?/, '');
  // Also clean trailing percentage at end of first line:
  // "Select the correct word to complete each sentence. 10%"
  t = t.replace(/^(.+?)\s+\d+\s*%\s*$/m, '$1');

  // ── 5. Trim leading/trailing whitespace ──
  t = t.replace(/^\s*\n/, '').trim();

  return { cleanText: t, directive, wordPool };
}

// ─── Consignes / rules extraction ───────────────────────────────────────────

/**
 * Keywords that identify a rule/consigne sentence.
 * Kept broad to catch French and Creole variations.
 */
const RULE_KEYWORDS =
  /interdit|calculat|silence\s+est|obligatoire|gadget|téléphone|tablette|ipad|montre intelligente|portable|coefficient|durée\s*(?:de\s+l[''']é|:)|échange\s+de\s+papier/i;

/**
 * Header patterns: "Consignes:", "Consignes générales:", "Consignes générales
 * de l'examen:", "Consigne:", "Instructions générales de l'examen:", etc.
 */
const CONSIGNE_HEADER_RE =
  /(?:Consignes?\s*(?:générales?\s*)?(?:de\s+l['''](?:examen|évaluation)\s*)?|Instructions?\s*(?:générales?\s*)?(?:de\s+l['''](?:examen|évaluation)\s*)?)[:.]?\s*/gi;

/**
 * Parse section instructions to separate exam rules ("consignes") from
 * actual pedagogical content (task directives, reading passages, etc.).
 *
 * Uses a sentence-level classification approach:
 * 1. Split text into sentences (by newlines, then by ". " boundaries)
 * 2. Strip any "Consignes:" headers
 * 3. Classify each sentence as rule (contains RULE_KEYWORDS) or content
 * 4. Rejoin content parts as cleanedText
 *
 * Returns { rules: string[], cleanedText: string }.
 */
export function parseConsignes(text) {
  if (!text || !text.trim()) return { rules: [], cleanedText: '' };

  const trimmed = text.trim();

  // ── Step 1: Split into sentences ──────────────────────────────────────────
  // First split by newlines
  const rawLines = trimmed.split('\n');
  const sentences = [];
  for (const line of rawLines) {
    const l = line.trim();
    if (!l) {
      sentences.push('');
      continue;
    }
    // Within each line, split on boundaries between inline sentences:
    // 1) After a letter+"." followed by a number+punct or uppercase letter
    //    (lookbehind excludes digit+"." so "1. L'usage" doesn't split)
    // 2) Before "N) Upper" or "N- Upper" even without a preceding period
    //    (handles "interdit 2) Le téléphone..." patterns)
    let expanded = l.replace(/(?<=[a-zA-ZÀ-ÿ]\.)\s+(?=\d+[-.)]\s|[A-ZÀ-ÿ])/g, '\x00');
    expanded = expanded.replace(/\s+(?=\d+[-.)]\s+[A-ZÀ-ÿ])/g, '\x00');
    const parts = expanded.split('\x00');
    sentences.push(...parts);
  }

  // ── Step 2 & 3: Classify each sentence ────────────────────────────────────
  const NUM_RE = /^\d+[-.)]\s/;
  const rules = [];
  const contentParts = [];

  for (const sent of sentences) {
    let s = sent.trim();

    // Preserve blank-line separators in content
    if (!s) {
      contentParts.push('');
      continue;
    }

    // Strip consigne headers from the sentence
    const stripped = s.replace(CONSIGNE_HEADER_RE, '').trim();
    if (!stripped) continue; // was just a header with nothing else

    // Strip leading numbering (e.g. "1. ", "2) ", "3- ")
    const deNumbered = stripped.replace(NUM_RE, '').trim();

    // Classify: rule if it contains a keyword and is reasonably short
    if (RULE_KEYWORDS.test(stripped) && deNumbered.length < 300) {
      rules.push(deNumbered);
    } else {
      contentParts.push(sent); // keep original sentence for content
    }
  }

  // ── Step 4: Reassemble cleaned text ───────────────────────────────────────
  // Only accept rules if we found at least 2 (avoids false positives from
  // a single passing mention of "calculatrice" in a task directive)
  if (rules.length < 2) {
    return { rules: [], cleanedText: trimmed };
  }

  const cleanedText = contentParts
    .join('\n')
    .replace(/^\s*\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Filter very short fragments
  const filteredRules = rules.filter((r) => r.length > 5);
  return { rules: filteredRules, cleanedText };
}

/**
 * Flatten all sections/questions into a single ordered array.
 * Each question gets sectionTitle/sectionInstructions attached,
 * plus cleaned text and sub-exercise grouping metadata.
 */
export function flattenQuestions(exam) {
  const flat = [];
  for (const sec of exam.sections || []) {
    let prevGroup = null;

    for (let qi = 0; qi < (sec.questions || []).length; qi++) {
      const q = sec.questions[qi];
      const num = String(q.number || '').trim();
      const group = subExerciseGroup(num);
      const isFirstInGroup = group !== null && group !== prevGroup;

      const { cleanText, directive, wordPool } = cleanQuestionText(
        q.question || '',
        num,
        isFirstInGroup,
      );

      flat.push({
        ...q,
        sectionTitle: sec.section_title || '',
        sectionInstructions: sec.instructions || '',
        // Cleaned display fields
        _displayText: cleanText,
        _subExGroup: group,
        _subExDirective: directive,
        _subExFirstInGroup: isFirstInGroup,
        _wordPool: wordPool,
        _displayNumber: num,
      });

      if (group !== null) prevGroup = group;
    }
  }
  return flat;
}

// ─── Exam stats ─────────────────────────────────────────────────────────────

export function examStats(exam) {
  let total = 0;
  let gradable = 0;
  for (const sec of exam.sections || []) {
    for (const q of sec.questions || []) {
      total++;
      const meta = QUESTION_TYPE_META[q.type] || QUESTION_TYPE_META.unknown;
      // Gradable if: type supports auto-grading with a correct answer,
      // OR question has answer_parts for scaffold grading
      if ((meta.gradable && q.correct) || (q.answer_parts && q.answer_parts.length > 0)) gradable++;
    }
  }
  return { total, gradable };
}

// ─── Scaffold blank grading (answer_parts comparison) ───────────────────────

/**
 * Normalize a string for comparison: lowercase, strip accents, collapse whitespace,
 * remove surrounding $ for LaTeX, trim.
 */
function normalizeAnswer(s) {
  if (!s) return '';
  return s
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/^\$+|\$+$/g, '')  // strip wrapping LaTeX $ signs
    .replace(/\\text\{([^}]*)\}/g, '$1')  // strip \text{} wrappers
    .replace(/\\,/g, '')  // strip LaTeX thin spaces
    .replace(/\s+/g, ' ')  // collapse whitespace
    .trim();
}

/**
 * Subjects that are math/science — use strict matching only.
 * For non-math subjects (culture, history, languages), apply fuzzy matching.
 */
const MATH_SUBJECTS_SET = new Set([
  'Mathématiques', 'Physique', 'Chimie', 'SVT', 'Informatique',
]);

/**
 * For non-math text answers, check if the user's answer contains the key
 * words of the expected answer (word-subset matching). This handles cases
 * like accepting "Souvnans" for "Lakou Souvnans", or the full phrase.
 */
function fuzzyTextMatch(user, expected) {
  if (!user || !expected) return false;
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const u = norm(user);
  const e = norm(expected);
  // Exact accent-stripped match
  if (u === e) return true;
  // Word-subset: if expected has multiple words, accept if user typed any
  // significant word (length >= 3) that matches a word in expected
  const expectedWords = e.split(' ').filter(w => w.length >= 3);
  const userWords = u.split(' ').filter(w => w.length >= 3);
  if (expectedWords.length > 1 && userWords.length > 0) {
    // Accept if user provided at least one significant matching word
    const matchCount = userWords.filter(uw => expectedWords.some(ew => ew === uw)).length;
    if (matchCount > 0 && matchCount >= Math.min(userWords.length, 1)) return true;
  }
  return false;
}

/**
 * Check if a user answer matches any of the acceptable answers for a blank.
 * Returns true for exact match, numeric proximity (±1%), CAS equivalence,
 * or (for non-math subjects) fuzzy text match with word-subset support.
 */
function answerMatches(userVal, expectedAnswer, alternatives = [], options = {}) {
  const user = normalizeAnswer(userVal);
  if (!user) return false;
  const isMathSubject = options.subject ? MATH_SUBJECTS_SET.has(options.subject) : true;

  const allAcceptable = [expectedAnswer, ...(alternatives || [])];
  for (const ans of allAcceptable) {
    const expected = normalizeAnswer(ans);
    if (!expected) continue;

    // Exact text match
    if (user === expected) return true;

    // Numeric comparison (±1% or ±0.01 for small numbers)
    const userNum = parseFloat(user.replace(/,/g, '.'));
    const expNum = parseFloat(expected.replace(/,/g, '.'));
    if (!isNaN(userNum) && !isNaN(expNum)) {
      const tolerance = Math.max(Math.abs(expNum) * 0.01, 0.01);
      if (Math.abs(userNum - expNum) <= tolerance) return true;
    }

    // CAS expression equivalence (fractions, radicals, symbolic)
    try {
      const casResult = checkWithCAS(user, expected);
      if (casResult.correct) return true;
    } catch { /* CAS unavailable */ }

    // Fuzzy text match for non-math subjects (accent-insensitive + word-subset)
    if (!isMathSubject && fuzzyTextMatch(userVal, ans)) return true;
  }

  return false;
}

/**
 * Grade each scaffold blank against its answer_parts entry.
 * Returns array of { blankIndex, correct, userValue, expectedAnswer, label }.
 */
export function gradeScaffoldBlanks(scaffoldValues, answerParts, options = {}) {
  return (answerParts || []).map((part, i) => {
    const userVal = scaffoldValues[i] || '';
    const isCorrect = answerMatches(userVal, part.answer, part.alternatives, options);
    return {
      blankIndex: i,
      correct: isCorrect,
      userValue: userVal,
      expectedAnswer: part.answer,
      alternatives: part.alternatives || [],
      label: part.label || `Partie ${i + 1}`,
    };
  });
}

// ─── Single-question grading (for immediate feedback mode) ──────────────────

/**
 * Grade a single question. Returns the same result shape as one entry of
 * gradeExam's `results` array:
 * { question, userAnswer, status, result: { awarded, maxPoints, blankResults? } }
 *
 * For essay questions this returns status:'manual' — the caller is responsible
 * for sending the answer to the AI grading endpoint and merging the result.
 *
 * `preGradedEssay` is an optional object { isCorrect, feedback, score } from
 * the /api/grade-essay endpoint.  When provided for an essay question the
 * function uses it instead of returning 'manual'.
 */
export function gradeSingleQuestion(question, userAnswer, preGradedEssay, options = {}) {
  const pts = question.points || 1;
  const meta = QUESTION_TYPE_META[question.type] || QUESTION_TYPE_META.unknown;

  // No answer
  if (userAnswer == null || userAnswer === '') {
    return {
      question,
      userAnswer: null,
      status: 'unanswered',
      result: { awarded: 0, maxPoints: pts },
    };
  }

  // Essay or short_answer with AI grade already available
  if ((question.type === 'essay' || question.type === 'short_answer') && preGradedEssay) {
    const scoreParts = (preGradedEssay.score || '').split('/');
    const num = parseFloat(scoreParts[0]);
    const den = parseFloat(scoreParts[1]) || 10;
    const ratio = !isNaN(num) ? num / den : 0;
    const awarded = Math.round(pts * ratio * 100) / 100;
    return {
      question,
      userAnswer,
      status: preGradedEssay.isCorrect ? 'correct' : ratio >= 0.4 ? 'partial' : 'incorrect',
      result: { awarded, maxPoints: pts },
      essayFeedback: preGradedEssay,
    };
  }

  // Non-gradable types (essay without AI, matching, unknown)
  if (!meta.gradable || !question.correct) {
    // Scaffold grading (skip for essay questions — they use AI grading)
    if (question.type !== 'essay' && question.scaffold_text && question.scaffold_blanks) {
      let scaffoldValues = null;
      try {
        const parsed = JSON.parse(userAnswer);
        if (parsed && parsed.scaffold && Array.isArray(parsed.scaffold)) {
          scaffoldValues = parsed.scaffold;
        }
      } catch { /* not scaffold JSON */ }

      if (scaffoldValues && scaffoldValues.filter(v => v && v.trim()).length > 0) {
        if (question.answer_parts && question.answer_parts.length > 0) {
          const blankResults = gradeScaffoldBlanks(scaffoldValues, question.answer_parts, options);
          const correctBlanks = blankResults.filter(r => r.correct).length;
          const totalBlanks = question.answer_parts.length;
          const ratio = totalBlanks > 0 ? correctBlanks / totalBlanks : 0;
          const awarded = Math.round(pts * ratio * 100) / 100;
          return {
            question,
            userAnswer,
            status: correctBlanks === totalBlanks ? 'correct' : correctBlanks > 0 ? 'partial' : 'incorrect',
            result: { awarded, maxPoints: pts, blankResults },
          };
        }
        const filled = scaffoldValues.filter(v => v && v.trim());
        if (filled.length === question.scaffold_blanks.length) {
          return {
            question,
            userAnswer,
            status: 'scaffold-complete',
            result: { awarded: pts, maxPoints: pts },
          };
        }
      }
    }

    // Check final_answer field
    if (question.final_answer && typeof userAnswer === 'string') {
      let effectiveUser = userAnswer;
      try {
        const parsed = JSON.parse(userAnswer);
        if (parsed && parsed.finalAnswer) effectiveUser = parsed.finalAnswer;
      } catch { /* not JSON */ }

      if (effectiveUser && effectiveUser.trim()) {
        const allAcceptable = [question.final_answer];
        if (question.answer_parts) {
          question.answer_parts.forEach(p => {
            if (p.answer) allAcceptable.push(p.answer);
            (p.alternatives || []).forEach(a => allAcceptable.push(a));
          });
        }
        const isCorrect = answerMatches(effectiveUser, question.final_answer, allAcceptable.slice(1), options);
        return {
          question,
          userAnswer,
          status: isCorrect ? 'correct' : 'incorrect',
          result: { awarded: isCorrect ? pts : 0, maxPoints: pts },
        };
      }
    }

    return {
      question,
      userAnswer,
      status: 'manual',
      result: { awarded: 0, maxPoints: pts },
    };
  }

  // Auto-gradable
  const isCorrect = checkAnswer(question, userAnswer, options);
  return {
    question,
    userAnswer,
    status: isCorrect ? 'correct' : 'incorrect',
    result: { awarded: isCorrect ? pts : 0, maxPoints: pts },
  };
}

// ─── Grading engine ─────────────────────────────────────────────────────────

/**
 * Grade an exam given the flat questions array and the user answers map.
 * Accepts optional `preGradedResults` — a map of { [questionIndex]: gradeResult }
 * for questions that have already been individually graded (e.g. immediate-mode
 * essays graded via AI).  Pre-graded entries are used as-is.
 *
 * Accepts optional `options` — { track, subject } for coefficient-weighted scoring.
 * Returns { summary, results }.
 */
export function gradeExam(questions, answers, preGradedResults = {}, options = {}) {
  let totalPoints = 0;
  let earnedPoints = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unanswered = 0;
  let manualReview = 0;
  let autoGraded = 0;

  const results = questions.map((q, i) => {
    // Use pre-graded result if available (from immediate feedback mode)
    if (preGradedResults[i]) {
      const pre = preGradedResults[i];
      const pts = q.points || 1;
      totalPoints += pts;
      const awarded = pre.result?.awarded || 0;
      earnedPoints += awarded;
      if (pre.status === 'correct' || pre.status === 'scaffold-complete') correctCount++;
      else if (pre.status === 'partial') correctCount += pts > 0 ? awarded / pts : 0;
      else if (pre.status === 'incorrect') incorrectCount++;
      else if (pre.status === 'unanswered') unanswered++;
      else if (pre.status === 'manual') manualReview++;
      if (pre.status !== 'unanswered' && pre.status !== 'manual') autoGraded++;
      return pre;
    }

    const userAnswer = answers[i] != null ? answers[i] : null;
    const pts = q.points || 1;
    totalPoints += pts;

    const meta = QUESTION_TYPE_META[q.type] || QUESTION_TYPE_META.unknown;

    // No answer provided
    if (userAnswer == null || userAnswer === '') {
      unanswered++;
      return {
        question: q,
        userAnswer: null,
        status: 'unanswered',
        result: { awarded: 0, maxPoints: pts },
      };
    }

    // Non-gradable types
    if (!meta.gradable || !q.correct) {
      // Check if this is a scaffolded answer with all blanks filled
      if (q.scaffold_text && q.scaffold_blanks) {
        let scaffoldValues = null;
        try {
          const parsed = JSON.parse(userAnswer);
          if (parsed && parsed.scaffold && Array.isArray(parsed.scaffold)) {
            scaffoldValues = parsed.scaffold;
          }
        } catch { /* not scaffold JSON */ }

        if (scaffoldValues && scaffoldValues.filter(v => v && v.trim()).length > 0) {
          autoGraded++;

          // If answer_parts exist, grade each blank against them
          if (q.answer_parts && q.answer_parts.length > 0) {
            const blankResults = gradeScaffoldBlanks(scaffoldValues, q.answer_parts, options);
            const correctBlanks = blankResults.filter(r => r.correct).length;
            const totalBlanks = q.answer_parts.length;
            const ratio = totalBlanks > 0 ? correctBlanks / totalBlanks : 0;
            const awarded = Math.round(pts * ratio * 100) / 100;

            if (correctBlanks === totalBlanks) correctCount++;
            else if (correctBlanks > 0) correctCount += ratio;
            else incorrectCount++;
            earnedPoints += awarded;

            return {
              question: q,
              userAnswer,
              status: correctBlanks === totalBlanks ? 'correct' : correctBlanks > 0 ? 'partial' : 'incorrect',
              result: { awarded, maxPoints: pts, blankResults },
            };
          }

          // No answer_parts — fall back to scaffold-complete (full credit for effort)
          const filled = scaffoldValues.filter(v => v && v.trim());
          if (filled.length === q.scaffold_blanks.length) {
            correctCount++;
            earnedPoints += pts;
            return {
              question: q,
              userAnswer,
              status: 'scaffold-complete',
              result: { awarded: pts, maxPoints: pts },
            };
          }
        }
      }

      // Check if this is a proof/text answer that can be graded via final_answer
      if (q.final_answer && typeof userAnswer === 'string') {
        let effectiveUser = userAnswer;
        try {
          const parsed = JSON.parse(userAnswer);
          if (parsed && parsed.finalAnswer) effectiveUser = parsed.finalAnswer;
        } catch { /* not JSON */ }

        if (effectiveUser && effectiveUser.trim()) {
          const allAcceptable = [q.final_answer];
          if (q.answer_parts) {
            q.answer_parts.forEach(p => {
              if (p.answer) allAcceptable.push(p.answer);
              (p.alternatives || []).forEach(a => allAcceptable.push(a));
            });
          }

          const isCorrect = answerMatches(effectiveUser, q.final_answer,
            allAcceptable.slice(1), options);
          autoGraded++;
          if (isCorrect) {
            correctCount++;
            earnedPoints += pts;
          } else {
            incorrectCount++;
          }
          return {
            question: q,
            userAnswer,
            status: isCorrect ? 'correct' : 'incorrect',
            result: { awarded: isCorrect ? pts : 0, maxPoints: pts },
          };
        }
      }

      manualReview++;
      return {
        question: q,
        userAnswer,
        status: 'manual',
        result: { awarded: 0, maxPoints: pts },
      };
    }

    // Grade it
    autoGraded++;
    const isCorrect = checkAnswer(q, userAnswer, options);
    if (isCorrect) {
      correctCount++;
      earnedPoints += pts;
    } else {
      incorrectCount++;
    }

    return {
      question: q,
      userAnswer,
      status: isCorrect ? 'correct' : 'incorrect',
      result: { awarded: isCorrect ? pts : 0, maxPoints: pts },
    };
  });

  const summary = {
    totalPoints,
    earnedPoints,
    correctCount,
    incorrectCount,
    unanswered,
    manualReview,
    autoGraded,
    percentage: totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0,
  };

  // Add coefficient-weighted score if track + subject are provided
  if (options.track && options.subject) {
    try {
      const coeff = getCoefficient(options.track, options.subject);
      summary.coefficient = coeff;
      summary.weightedEarned = Math.round(earnedPoints * coeff * 100) / 100;
      summary.weightedTotal = Math.round(totalPoints * coeff * 100) / 100;
      summary.track = options.track;
      summary.subject = options.subject;
    } catch {
      // coefficient lookup failed — skip weighted scoring
    }
  }

  return { summary, results };
}

function checkAnswer(question, userAnswer, options = {}) {
  const correct = (question.correct || '').trim().toLowerCase();
  const user = String(userAnswer).trim().toLowerCase();

  if (!correct || !user) return false;

  switch (question.type) {
    case 'multiple_choice':
      return user === correct;

    case 'multiple_select': {
      // User answer is JSON array of selected keys, correct_keys is array of correct keys
      let userKeys = [];
      try {
        const parsed = JSON.parse(String(userAnswer));
        if (Array.isArray(parsed)) userKeys = parsed.map(k => String(k).trim().toLowerCase()).sort();
      } catch { userKeys = [user]; }
      const correctKeys = (question.correct_keys || correct.split(',')).map(k => String(k).trim().toLowerCase()).sort();
      return userKeys.length === correctKeys.length && userKeys.every((k, i) => k === correctKeys[i]);
    }

    case 'true_false': {
      // Normalize common variants
      const trueSet = new Set(['vrai', 'true', 'v', 't', 'oui', 'yes']);
      const falseSet = new Set(['faux', 'false', 'f', 'non', 'no']);
      const userBool = trueSet.has(user) ? 'true' : falseSet.has(user) ? 'false' : user;
      const correctBool = trueSet.has(correct) ? 'true' : falseSet.has(correct) ? 'false' : correct;
      return userBool === correctBool;
    }

    case 'fill_blank':
    case 'calculation':
    case 'short_answer': {
      // Check if the answer is a proof-format JSON (with finalAnswer)
      let effectiveUser = user;
      if (typeof userAnswer === 'string' && (userAnswer.startsWith('{') || userAnswer.startsWith('['))) {
        try {
          const parsed = JSON.parse(userAnswer);
          // New format: { steps, finalAnswer }
          if (parsed && parsed.finalAnswer) {
            effectiveUser = parsed.finalAnswer.trim().toLowerCase();
          }
          // Legacy array format — no final answer to grade
          else if (Array.isArray(parsed)) {
            return false; // Can't auto-grade raw steps
          }
        } catch { /* not JSON, use as-is */ }
      }

      if (!effectiveUser) return false;
      const correctClean = correct;

      // Exact match first
      if (effectiveUser === correctClean) return true;

      // Try numeric comparison (simple)
      const userNum = parseFloat(effectiveUser.replace(/,/g, '.'));
      const correctNum = parseFloat(correctClean.replace(/,/g, '.'));
      if (!isNaN(userNum) && !isNaN(correctNum)) {
        return Math.abs(userNum - correctNum) < 0.01;
      }

      // CAS expression equivalence (handles fractions, radicals, etc.)
      const casResult = checkWithCAS(effectiveUser, correctClean);
      if (casResult.correct) return true;

      // Loose text match (ignore accents and extra spaces)
      const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
      if (norm(effectiveUser) === norm(correctClean)) return true;

      // Word-subset fuzzy match for non-math subjects
      const isMathSubject = options.subject ? MATH_SUBJECTS_SET.has(options.subject) : true;
      if (!isMathSubject) {
        return fuzzyTextMatch(effectiveUser, correctClean);
      }

      return false;
    }

    default:
      return user === correct;
  }
}
