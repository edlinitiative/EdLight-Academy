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

// ─── Topic-extraction helpers ───────────────────────────────────────────────

/**
 * Canonical subject → extra spellings that appear inside raw titles but won't
 * match the normalized subject string. JS `\b` doesn't form a boundary next to
 * accented letters, so "Histoire-Géo" never matches "HISTOIRE-GÉOGRAPHIE" and
 * "Art & Musique" never matches "Art et Musique" — these strip them anyway.
 */
const SUBJECT_TITLE_ALIASES = {
  'Histoire-Géo': [
    /Histoire\s*[-–—/]?\s*(?:et\s+)?G[ée]ographie/gi,
    /Histoire\s+et\s+G[ée]o\b/gi,
  ],
  'Art & Musique': [
    /[ÉE]ducation\s+esth[ée]tique\s+et\s+artistique/gi,
    /Arts?\s+et\s+Musique/gi,
    /Art\s*&\s*Musique/gi,
  ],
  SVT: [
    /Sciences?\s+de\s+la\s+Vie\s+et\s+de\s+la\s+Terre/gi,
    /Biologie\s*[/-]?\s*(?:et\s+)?G[ée]ologie/gi,
    /Bio\s*\/\s*G[ée]o/gi,
  ],
};

/** Filière codes — never a topic, dropped wherever they appear. */
const SERIES_TOKENS = new Set(['SVT', 'SMP', 'SES', 'LLA', 'LL', 'LET', 'LA', 'ARTS', 'ALL', 'ES']);

const stripDiacritics = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const topicKey = (tok) => stripDiacritics(String(tok).toLowerCase()).replace(/[^a-z0-9]/g, '');

/**
 * Normalized (lowercased, accent-stripped) words that are pure administrative
 * boilerplate or a subject name, and must never survive as a card topic.
 */
const TOPIC_STOPWORDS = new Set([
  // French administrative boilerplate
  'ministere', 'education', 'nationale', 'national', 'formation', 'professionnelle',
  'professionnel', 'menfp', 'filiere', 'filieres', 'enseignement', 'general', 'generale',
  'examen', 'examens', 'annale', 'annales', 'fin', 'etudes', 'etude', 'secondaire', 'secondaires', 'baccalaureat',
  'baccaulaureat', 'bac', 'permanent', 'permanente', 'regulier', 'reguliere', 'unique',
  'session', 'sessions', 'ordinaire', 'extraordinaire', 'remediation', 'rappels', 'rappel',
  'direction', 'epreuve', 'epreuves', 'nationales', 'serie', 'series', 'texte', 'modele',
  'ancienne', 'partie', 'deuxieme', 'premiere', 'des', 'les', 'aux', 'une', 'philo',
  'bureau', 'concours', 'centre', 'institut', 'faculte', 'universite',
  // Subject words (a subject is never its own topic; also blocks cross-subject leakage)
  'francais', 'anglais', 'espagnol', 'mathematiques', 'physique', 'chimie', 'svt', 'histoire',
  'geographie', 'philosophie', 'kreyol', 'economie', 'informatique', 'musique',
  // Kreyòl administrative boilerplate
  'ministe', 'edikasyon', 'nasyonal', 'fomasyon', 'pwofesyonel', 'filye', 'anseyman', 'jeneral',
  'egzamen', 'fen', 'etid', 'liye', 'segonde', 'segond', 'bakaloreya', 'bakalorya', 'sesyon',
  'seri', 'sevis', 'jesyon', 'sosyal',
  // Kreyòl month names (accent-stripped — the \b-based regex misses "Jiyè")
  'jen', 'jiye', 'jive', 'out', 'mas', 'fevriye', 'janvye', 'avril', 'desanm', 'septanm',
  'oktob', 'novanm',
]);

const MONTH_RE_G = new RegExp(MONTH_RE.source, 'gi');
const KREYOL_MONTH_G = /\b(?:JEN|JIY[ÈE]|JIV[ÈE]|OUT|MAS|FEVRIYE|JANVYE|AVR[IÌ]L|DESANM|SEPTANM|OKTOB|NOVANM)\b/gi;
const ANSWER_KEY_CODE_G = /[\s:]+(?:SR|NS)\b/gi;

/**
 * Classify the exam "session type" from the raw title so we can show a clean,
 * human label ("Bac permanent", "Sujet type") when there is no real topic.
 */
function detectExamType(raw) {
  const s = stripDiacritics(raw).toUpperCase();
  if (/TEXTE\s+MODELE/.test(s)) return 'modèle';
  if (/REMEDIATION/.test(s)) return 'remédiation';
  if (/\bRAPPELS?\b/.test(s)) return 'rappels';
  if (/\bBAC(?:CALAUREAT)?\s+UNIQUE\b|UNIQUE\)/.test(s)) return 'unique';
  if (/PERMANENT|PEMANAN/.test(s)) return 'permanent';
  if (/REGULIER/.test(s)) return 'régulier';
  return '';
}

/** Is this parenthesised group only filière codes (e.g. "SVT, SMP")? */
function isSeriesGroup(inner) {
  const toks = String(inner).split(/[\s,/&.-]+/).filter(Boolean);
  return toks.length > 0 && toks.every((t) => SERIES_TOKENS.has(t.toUpperCase()));
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
export function examTitleParts(exam) {
  const rawTitle = String(exam.exam_title || '').trim();
  const subject = normalizeSubject(exam.subject);
  const { year, session: yearSession } = normalizeYear(exam.year);

  // Metadata embedded in the raw title.
  const series = extractSeries(rawTitle);
  const titleSession = extractSession(rawTitle);
  const examType = detectExamType(rawTitle);

  // ── Stage 1: strip known ministry / exam boilerplate ──
  let cleaned = rawTitle;
  for (const re of TITLE_NOISE) cleaned = cleaned.replace(re, ' ');

  // ── Stage 2: strip every spelling of the subject ──
  // Accent-safe boundaries — a plain `\bÉconomie\b` never matches "ÉCONOMIE"
  // because `\b` doesn't fire next to accented letters.
  const removeWord = (text, word) => {
    if (!word) return text;
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(
      new RegExp(`(^|[^A-Za-zÀ-ÿ])${esc}(?![A-Za-zÀ-ÿ])\\s*[-–—:]*\\s*`, 'gi'),
      '$1 ',
    );
  };
  cleaned = removeWord(cleaned, subject);
  if (exam.subject) cleaned = removeWord(cleaned, String(exam.subject).trim());
  for (const re of SUBJECT_TITLE_ALIASES[subject] || []) cleaned = cleaned.replace(re, ' ');

  // ── Stage 3: strip residual structured noise (elisions, series, codes, dates) ──
  cleaned = cleaned
    // Elided articles: d', l', s'… → drop the article ("d'Art" → "Art").
    .replace(/(^|[^A-Za-zÀ-ÿ])[a-zà-ÿ]['’‘]/gi, '$1 ')
    // "SÉRIE(S)" label — the codes are dropped token-by-token below.
    .replace(/\bS[ÉE]RIES?\b\s*:?/gi, ' ')
    // Answer-key markers leaked from source PDFs ("Polyamide:SR", "Carbure : NS").
    .replace(ANSWER_KEY_CODE_G, ' ')
    // "MENFP" acronym, stray months and years (the session is captured already).
    .replace(/\bMENFP\b/gi, ' ')
    .replace(MONTH_RE_G, ' ')
    .replace(KREYOL_MONTH_G, ' ')
    .replace(/\b\d{4}\b/g, ' ');

  // Parenthesised groups: drop pure filière groups ("(SVT, SMP)") but keep a
  // real word that merely happens to be parenthesised ("(ÉCOLOGISME)").
  cleaned = cleaned.replace(/\(([^)]*)\)/g, (_, inner) =>
    isSeriesGroup(inner) ? ' ' : ` ${inner} `,
  );
  cleaned = cleaned.replace(/[()[\]]/g, ' '); // leftover unbalanced brackets

  // ── Stage 4: keep only meaningful words ──
  const subjKey = topicKey(subject);
  const kept = cleaned
    .split(/\s+/)
    .map((t) => t.replace(/^[\s\-–—:,./]+|[\s\-–—:,./]+$/g, ''))
    .filter((tok) => {
      const key = topicKey(tok);
      if (!key || key.length <= 2) return false; // punctuation, "d", "iv", "c-d"
      if (/^\d+$/.test(key)) return false; // stray numbers
      if (SERIES_TOKENS.has(key.toUpperCase())) return false; // filière codes
      if (TOPIC_STOPWORDS.has(key)) return false; // boilerplate / subject words
      if (key.length <= 5 && subjKey.includes(key)) return false; // "géo"/"graphie" remnants
      return true;
    });

  // ── Stage 5: assemble the topic ──
  let topic = kept.join(' ').replace(/\s{2,}/g, ' ').trim();
  if (topic && topic === topic.toUpperCase()) {
    // ALL-CAPS source → Title Case ("MONTAGE BIO/GÉO" → "Montage Bio/Géo").
    topic = topic
      .toLowerCase()
      .replace(/(^|[\s/\-–—])([a-zà-ÿ])/g, (_, sep, ch) => sep + ch.toUpperCase());
  } else if (topic) {
    topic = topic.charAt(0).toUpperCase() + topic.slice(1);
  }

  // Session (month + year, else the caller falls back to the bare year).
  const session = titleSession || yearSession;

  // Series — only filière codes that add info beyond the subject name.
  let seriesClean = '';
  if (series) {
    seriesClean = series
      .split(/[,\s]+/)
      .filter((s) => s.length >= 2 && s.toUpperCase() !== subject.toUpperCase())
      .join(', ');
  }

  return { subject: subject || 'Examen', topic, series: seriesClean, session, year, examType };
}

/**
 * Compose the canonical one-line title string from structured parts:
 *   "[Subject] — [Topic] · [Series] · [Session|Year]"
 */
export function composeExamTitle(parts) {
  const { subject, topic, series, session, year, examType } = parts;
  const out = [subject || 'Examen'];
  // Prefer the real topic; otherwise fall back to a clean session-type label
  // ("Bac permanent", "Sujet type") rather than leaving just "Subject · Year".
  const subtitle = topic || examTypeLabel(examType);
  if (subtitle) out.push('—', subtitle);

  const chips = [];
  if (series) chips.push(series);
  if (session) chips.push(session);
  else if (year) chips.push(String(year));

  if (chips.length) {
    out.push('·', chips.join(' · '));
  } else if (!subtitle && year) {
    // No topic and no session — add the bare year
    out.push('·', String(year));
  }
  return out.join(' ');
}

/** Produce a short, clean one-line exam title (Subject — Topic · Session). */
export function normalizeExamTitle(exam) {
  return composeExamTitle(examTitleParts(exam));
}

// ─── Human-friendly fallback labels ─────────────────────────────────────────

const EXAM_TYPE_LABELS = {
  permanent: 'Bac permanent',
  régulier: 'Bac régulier',
  unique: 'Bac unique',
  remédiation: 'Session de remédiation',
  rappels: 'Session des rappels',
  modèle: 'Sujet type',
};

/** Short label for a session "type" (e.g. "Bac permanent"), or '' if none. */
export function examTypeLabel(examType) {
  return EXAM_TYPE_LABELS[examType] || '';
}

/** "Juillet 2022" → "Session de juillet" (the year is shown separately). */
export function sessionLabel(session) {
  const m = String(session || '').match(/^([A-Za-zÀ-ÿ]+)\s+\d{4}$/);
  if (!m) return '';
  const month = m[1].toLowerCase();
  const elide = /^[aeiouyàâäéèêëîïôöûü]/i.test(month);
  return `Session ${elide ? "d'" : 'de '}${month}`;
}

/** Bare capitalised month from a session ("mars 2021" → "Mars"), or '' if none. */
function sessionMonth(session) {
  const m = String(session || '').match(/^([A-Za-zÀ-ÿ]+)\s+\d{4}$/);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : '';
}

/**
 * Heading + sub-line for an exam catalog card, from the precomputed parts.
 *
 * The card already shows the subject (section header) and the year (chip), so
 * this never repeats them: it leads with the real topic when there is one, and
 * otherwise a clean session/type label — never a bare year or a generic
 * "Épreuve".
 */
export function examCardName({ topic, session, examType }) {
  const typeLbl = examTypeLabel(examType);
  if (topic) {
    return { heading: topic, sub: typeLbl || sessionLabel(session) };
  }
  if (examType === 'modèle') return { heading: 'Sujet type', sub: '' };
  if (typeLbl) return { heading: typeLbl, sub: sessionMonth(session) };
  const sess = sessionLabel(session);
  if (sess) return { heading: sess, sub: '' };
  return { heading: 'Annale', sub: '' };
}

// ─── Subject colors ─────────────────────────────────────────────────────────

const SUBJECT_COLORS = {
  Français: '#0857A6',
  Anglais: '#0A66C2',
  Espagnol: '#2563EB',
  Mathématiques: '#1E40AF',
  Physique: '#0A66C2',
  Chimie: '#4A93DD',
  SVT: '#2563EB',
  'Histoire-Géo': '#5D5B54',
  Philosophie: '#1E40AF',
  Kreyòl: '#0857A6',
  Économie: '#64748B',
  'Art & Musique': '#4A93DD',
  Informatique: '#2563EB',
  Santé: '#64748B',
  'Culture Générale': '#64748B',
  Mixed: '#787671',
};

export function subjectColor(subject) {
  return SUBJECT_COLORS[subject] || '#0A66C2';
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
    const titleParts = examTitleParts(exam);
    const title = composeExamTitle(titleParts);

    let qCount = 0;
    let autoGradable = 0;
    const typeCounts = {};

    const sections = exam.sections || [];
    if (sections.length === 0 && exam._questionCount != null) {
      // Slim browse index: counts were precomputed by generate_exam_index.py
      qCount = exam._questionCount || 0;
      autoGradable = exam._autoGradable || 0;
      Object.assign(typeCounts, exam._typeCounts || {});
    } else {
      for (const sec of sections) {
        for (const q of sec.questions || []) {
          qCount++;
          const t = q.type || 'unknown';
          typeCounts[t] = (typeCounts[t] || 0) + 1;
          const meta = QUESTION_TYPE_META[t] || QUESTION_TYPE_META.unknown;
          if ((meta.gradable && q.correct) || (q.answer_parts && q.answer_parts.length > 0)) autoGradable++;
        }
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
      _topic: titleParts.topic,
      _series: titleParts.series,
      _session: titleParts.session,
      _examType: titleParts.examType,
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
 * Parse a templated-blank value (`{"slots":[...]}`) into its slot-value array,
 * or null when `userVal` is not a templated payload. A templated blank lets a
 * single step show the answer "written out with holes" (e.g. `]_, _[ ∪ ]_, _[`)
 * where each hole is its own small input.
 */
export function parseTemplatedSlots(userVal) {
  if (typeof userVal !== 'string') return null;
  const t = userVal.trim();
  if (!t.startsWith('{')) return null;
  try {
    const p = JSON.parse(t);
    if (p && Array.isArray(p.slots)) return p.slots;
  } catch { /* not a templated payload */ }
  return null;
}

/** Substitute slot values into a template's `{n}` markers (for display/feedback). */
export function reconstructTemplate(template, slots = []) {
  if (!template) return '';
  return String(template).replace(/\{(\d+)\}/g, (_, n) => {
    const v = slots[Number(n)];
    return v == null || v === '' ? '□' : String(v);
  });
}

/** Is this answer_part an inline fill-in template (has a template + slot specs)? */
export function isTemplatedPart(part) {
  return !!(part && part.template && Array.isArray(part.slots) && part.slots.length > 0);
}

/** Is this answer_part a matrix grid (has a matrix shape + row-major slot specs)? */
export function isMatrixPart(part) {
  return !!(part && part.matrix && Array.isArray(part.slots) && part.slots.length > 0);
}

/** True for any slot-based blank — inline template OR matrix grid. */
function isSlotPart(part) {
  return !!(part && Array.isArray(part.slots) && part.slots.length > 0);
}

/** Rebuild a `\begin{pmatrix}…\end{pmatrix}` string from row-major slot values. */
export function reconstructMatrix(matrix, slots = []) {
  const rows = matrix?.rows || 0;
  const cols = matrix?.cols || 0;
  const lines = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const v = slots[r * cols + c];
      cells.push(v == null || v === '' ? '\\square' : String(v));
    }
    lines.push(cells.join(' & '));
  }
  return `\\begin{pmatrix} ${lines.join(' \\\\ ')} \\end{pmatrix}`;
}

/** Reconstruct a slot-based part's filled value for feedback display. */
function reconstructSlotValue(part, slots) {
  if (part.template) return reconstructTemplate(part.template, slots);
  if (part.matrix) return reconstructMatrix(part.matrix, slots);
  return (slots || []).filter(Boolean).join(', ');
}

/**
 * Grade each scaffold blank against its answer_parts entry.
 * Returns array of { blankIndex, correct, userValue, expectedAnswer, label }.
 */
export function gradeScaffoldBlanks(scaffoldValues, answerParts, options = {}) {
  return (answerParts || []).map((part, i) => {
    const userVal = scaffoldValues[i] || '';
    let isCorrect;
    let displayUser = userVal;
    if (isSlotPart(part)) {
      const userSlots = parseTemplatedSlots(userVal) || [];
      isCorrect = part.slots.every((s, k) =>
        answerMatches(userSlots[k] || '', s.answer, s.alternatives || [], options));
      displayUser = reconstructSlotValue(part, userSlots);
    } else {
      isCorrect = answerMatches(userVal, part.answer, part.alternatives, options);
    }
    return {
      blankIndex: i,
      correct: isCorrect,
      userValue: displayUser,
      expectedAnswer: part.answer,
      alternatives: part.alternatives || [],
      label: part.label || `Partie ${i + 1}`,
    };
  });
}

/**
 * Parse a stored scaffold answer (JSON: {"scaffold":[...]}) into its value
 * array, or null if `userAnswer` is not a scaffold payload.
 */
export function parseScaffoldAnswer(userAnswer) {
  if (typeof userAnswer !== 'string') return null;
  const trimmed = userAnswer.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && Array.isArray(parsed.scaffold)) return parsed.scaffold;
  } catch { /* not scaffold JSON */ }
  return null;
}

/**
 * Grade a scaffolded question from its stored {scaffold:[...]} answer.
 *
 * Returns a normalized result { status, awarded, maxPoints, blankResults, ratio }
 * or null when `userAnswer` is not a scaffold payload. When the scaffold is
 * present but empty (no blank filled) the status is 'unanswered'.
 *
 * Works regardless of whether the question also carries a single `correct`
 * value — this is what lets math/science questions use the interactive
 * fill-in-the-solution flow instead of single-answer string matching.
 */
export function gradeScaffoldAnswer(question, userAnswer, options = {}) {
  if (!question.scaffold_text || !question.scaffold_blanks) return null;
  const scaffoldValues = parseScaffoldAnswer(userAnswer);
  if (!scaffoldValues) return null;

  const pts = question.points || 1;
  const filled = scaffoldValues.filter(v => v && String(v).trim());
  if (filled.length === 0) {
    return { status: 'unanswered', awarded: 0, maxPoints: pts, ratio: 0 };
  }

  if (question.answer_parts && question.answer_parts.length > 0) {
    const blankResults = gradeScaffoldBlanks(scaffoldValues, question.answer_parts, options);
    const correctBlanks = blankResults.filter(r => r.correct).length;
    const totalBlanks = question.answer_parts.length;
    const ratio = totalBlanks > 0 ? correctBlanks / totalBlanks : 0;
    const awarded = Math.round(pts * ratio * 100) / 100;
    return {
      status: correctBlanks === totalBlanks ? 'correct' : correctBlanks > 0 ? 'partial' : 'incorrect',
      awarded,
      maxPoints: pts,
      blankResults,
      ratio,
    };
  }

  // No answer_parts — award full credit for completing every blank (effort).
  if (filled.length === question.scaffold_blanks.length) {
    return { status: 'scaffold-complete', awarded: pts, maxPoints: pts, ratio: 1 };
  }
  return { status: 'partial', awarded: 0, maxPoints: pts, ratio: 0 };
}

// ─── Matching-question grading ──────────────────────────────────────────────

const MATCH_SHORT_TOKEN = /^[a-z0-9]{1,3}$/i;
const matchNorm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * Read one answer string into a { left, right } pair.
 *   "1-c", "a - 3", "2.i"  → explicit pair (left = first token, right = second)
 *   "d", "e- freezing"     → positional (left = position i+1, right = lead token)
 * Returns null when the string is not a letter/number match (e.g. a full word).
 */
function parseMatchingPair(answer, i) {
  const a = String(answer ?? '').trim();
  if (!a) return null;
  const two = a.match(/^([a-z0-9]{1,3})\s*[-–—:.)]\s*([a-z0-9]{1,3})$/i);
  if (two) return { left: matchNorm(two[1]), right: matchNorm(two[2]), positional: false };
  const lead = a.match(/^([a-z0-9]{1,3})\b/i);
  if (lead) return { left: String(i + 1), right: matchNorm(lead[1]), positional: true };
  return null;
}

/** Parse a legend entry "a) some text" / "a - text" → { key, text } or null. */
function parseLegendEntry(entry) {
  const m = String(entry ?? '').match(/^\s*([a-z0-9]{1,3})\s*[-–—:.)]\s*(.+)$/i);
  return m ? { key: matchNorm(m[1]), text: m[2].trim() } : null;
}

/** Strip a leading "1."/"a)" enumerator and drop boilerplate "Matching pair x". */
function cleanMatchingLabel(label) {
  const t = String(label ?? '').trim();
  if (!t || /^matching\s+pair/i.test(t)) return '';
  return t.replace(/^[a-z0-9]{1,3}\s*[-–—:.)]\s*/i, '').trim();
}

/** Best-effort left-item texts from a numbered question stem ("1. foo 2. bar"). */
function parseMatchingLeftFromText(questionText) {
  const t = String(questionText ?? '').replace(/\r/g, '');
  const re = /(?:^|\n|\s)(\d{1,2}|[a-z])\s*[-–—.)]\s+/gi;
  const idxs = [];
  let m;
  while ((m = re.exec(t)) !== null) idxs.push({ key: matchNorm(m[1]), start: m.index + m[0].length });
  if (idxs.length < 2) return [];
  return idxs.map((it, i) => {
    const end = i + 1 < idxs.length ? idxs[i + 1].start : t.length;
    let seg = t.slice(it.start, end).trim().replace(/\s*(?:\d{1,2}|[a-z])\s*[-–—.)]\s*$/i, '').trim();
    if (seg.length > 90) seg = seg.slice(0, 90) + '…';
    return { key: it.key, text: seg };
  });
}

/**
 * Normalize a matching question into { pairs, key, leftItems, rightOptions } for
 * both grading and the interactive widget — or null when it is not a clean
 * letter/number matching (free-text tables, grouping tasks, missing key). The
 * null case is what keeps those questions on the manual-review path.
 */
export function parseMatchingKey(question) {
  if (!question || question.type !== 'matching') return null;
  const parts = Array.isArray(question.answer_parts) ? question.answer_parts : [];
  let answers = parts.map((p) => String(p?.answer ?? '').trim());
  let labels = parts.map((p) => String(p?.label ?? '').trim());

  // Combined single string "1-f, 2-e, 3-b" → explode (labels no longer align).
  const nonEmpty = answers.filter(Boolean);
  if (nonEmpty.length === 1 && /[,;]/.test(nonEmpty[0]) && /[-–—:)]/.test(nonEmpty[0])) {
    answers = nonEmpty[0].split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    labels = answers.map(() => '');
  }
  if (answers.filter(Boolean).length < 2) return null;

  const pairs = [];
  let anyExplicit = false;
  let anyPositional = false;
  for (let i = 0; i < answers.length; i++) {
    if (!answers[i]) continue;
    const pr = parseMatchingPair(answers[i], i);
    if (!pr) return null; // an unreadable token → treat the whole question as manual
    if (pr.positional) anyPositional = true; else anyExplicit = true;
    pairs.push({ left: pr.left, right: pr.right, label: labels[i] || '' });
  }
  if (pairs.length < 2) return null;
  if (anyExplicit && anyPositional) return null; // mixed shapes → avoid misalignment
  if (new Set(pairs.map((p) => p.left)).size !== pairs.length) return null; // dup lefts

  // Right-hand legend: prefer question.options; otherwise the key's own letters.
  const rights = [...new Set(pairs.map((p) => p.right))];
  const legendText = {};
  const opts = question.options;
  if (opts && typeof opts === 'object' && !Array.isArray(opts)) {
    const keys = Object.keys(opts);
    if (keys.length && keys.every((k) => MATCH_SHORT_TOKEN.test(k))) {
      for (const k of keys) legendText[matchNorm(k)] = String(opts[k]);
    } else if (Array.isArray(opts.B)) {
      for (const e of opts.B) { const le = parseLegendEntry(e); if (le) legendText[le.key] = le.text; }
    }
  }
  const optionKeys = Object.keys(legendText);
  const rightSet = new Set(rights);
  const overlap = optionKeys.filter((k) => rightSet.has(k)).length;
  let allKeys;
  if (optionKeys.length && overlap === 0) {
    // The options describe the left column (not the right side) → ignore them.
    allKeys = rights.slice().sort();
    for (const k of optionKeys) delete legendText[k];
  } else {
    allKeys = [...new Set([...optionKeys, ...rights])].sort();
  }
  const rightOptions = allKeys.map((k) => ({ key: k, text: legendText[k] || '' }));

  // Left-hand items: answer-part labels → question stem → bare keys.
  const fromText = parseMatchingLeftFromText(question.question);
  const byKey = {};
  for (const it of fromText) byKey[it.key] = it.text;
  const leftItems = pairs.map((p, i) => {
    let text = cleanMatchingLabel(p.label);
    if (!text && byKey[p.left]) text = byKey[p.left];
    if (!text && fromText[i]) text = fromText[i].text;
    return { key: p.left, text: text || '' };
  });

  const key = {};
  for (const p of pairs) key[p.left] = p.right;
  return { pairs: pairs.map((p) => ({ left: p.left, right: p.right })), key, leftItems, rightOptions };
}

/** Parse a stored matching answer into { left: right } selections, or null. */
export function parseMatchingSelections(userAnswer) {
  if (userAnswer == null) return null;
  if (typeof userAnswer === 'object' && !Array.isArray(userAnswer)) {
    const out = {};
    let any = false;
    for (const [k, v] of Object.entries(userAnswer)) {
      const val = matchNorm(v);
      if (val) { out[matchNorm(k)] = val; any = true; }
    }
    return any ? out : null;
  }
  const s = String(userAnswer).trim();
  if (!s) return null;
  if (s.startsWith('{')) {
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === 'object' && !obj.scaffold) return parseMatchingSelections(obj);
    } catch { /* not JSON */ }
  }
  const out = {};
  let any = false;
  for (const seg of s.split(/[,;\n]+/)) {
    const m = seg.trim().match(/^([a-z0-9]{1,3})\s*[-–—:.)]\s*([a-z0-9]{1,3})$/i);
    if (m) { out[matchNorm(m[1])] = matchNorm(m[2]); any = true; }
  }
  return any ? out : null;
}

/**
 * Grade a matching answer against its parsed pair key. Returns a normalized
 * result { status, awarded, maxPoints, ratio, blankResults } or null when the
 * question is not a clean, auto-gradable matching (caller keeps manual review).
 */
export function gradeMatchingAnswer(question, userAnswer) {
  const parsed = parseMatchingKey(question);
  if (!parsed) return null;
  const pts = question.points || 1;
  const sel = parseMatchingSelections(userAnswer);

  const blankResults = parsed.pairs.map((p, i) => {
    const li = parsed.leftItems[i] || { key: p.left, text: '' };
    const got = sel ? matchNorm(sel[p.left]) : '';
    return {
      blankIndex: i,
      label: li.text ? `${String(li.key)}. ${li.text}` : String(li.key),
      correct: got !== '' && got === matchNorm(p.right),
      userValue: got ? got.toUpperCase() : '',
      expectedAnswer: String(p.right).toUpperCase(),
    };
  });

  const filled = blankResults.filter((b) => b.userValue).length;
  if (filled === 0) return { status: 'unanswered', awarded: 0, maxPoints: pts, ratio: 0, blankResults };

  const correctN = blankResults.filter((b) => b.correct).length;
  const total = parsed.pairs.length;
  const ratio = total ? correctN / total : 0;
  const awarded = Math.round(pts * ratio * 100) / 100;
  return {
    status: correctN === total ? 'correct' : correctN > 0 ? 'partial' : 'incorrect',
    awarded,
    maxPoints: pts,
    ratio,
    blankResults,
  };
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
// Operator synonyms for the guided condition builder. Students may enter any of
// these spellings; they normalize to a single canonical operator for comparison.
const CONDITION_OPERATORS = {
  '>': '>',
  '<': '<',
  '=': '=', '==': '=',
  '≥': '≥', '>=': '≥', '⩾': '≥', '=>': '≥',
  '≤': '≤', '<=': '≤', '⩽': '≤', '=<': '≤',
  '≠': '≠', '!=': '≠', '<>': '≠', '=/=': '≠',
};
function normalizeOperator(op) {
  if (op == null) return '';
  const s = String(op).trim();
  return CONDITION_OPERATORS[s] || s;
}

/**
 * Grade a guided "condition builder" answer.
 *
 * The question carries `conditions: [{ left, operator, value, alternatives? }]`.
 * The student's answer is a JSON array of `{ operator, value }` rows (or an
 * object `{ conditions: [...] }`). A row satisfies an expected condition iff the
 * operator matches (synonym-aware) AND the value matches via answerMatches.
 * Matching is order-independent; scoring is proportional to satisfied conditions.
 *
 * Returns null when the question has no `conditions` (so callers fall through to
 * the existing grading paths) — nothing else is affected.
 */
function gradeConditionsAnswer(question, userAnswer, options = {}) {
  const conditions = question.conditions;
  if (!Array.isArray(conditions) || conditions.length === 0) return null;

  let rows = [];
  try {
    const parsed = typeof userAnswer === 'string' ? JSON.parse(userAnswer) : userAnswer;
    if (Array.isArray(parsed)) rows = parsed;
    else if (parsed && Array.isArray(parsed.conditions)) rows = parsed.conditions;
  } catch { /* not condition JSON */ }

  const hasContent = rows.some(
    (r) => r && (String(r.operator || '').trim() || String(r.value || '').trim()),
  );
  if (!hasContent) return { status: 'unanswered' };

  // Order-independent: each expected condition consumes one still-unused row.
  const used = new Array(rows.length).fill(false);
  const blankResults = conditions.map((cond) => {
    const expectedOp = normalizeOperator(cond.operator);
    let matchIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (used[i] || !rows[i]) continue;
      const opOk = normalizeOperator(rows[i].operator) === expectedOp;
      const valOk = answerMatches(rows[i].value, cond.value, cond.alternatives || [], options);
      if (opOk && valOk) { matchIdx = i; break; }
    }
    if (matchIdx >= 0) used[matchIdx] = true;
    return {
      label: cond.left,
      correct: matchIdx >= 0,
      expected: `${cond.left} ${cond.operator} ${cond.value}`,
      userValue: matchIdx >= 0 ? `${rows[matchIdx].operator || ''} ${rows[matchIdx].value || ''}`.trim() : '',
    };
  });

  const correctCount = blankResults.filter((b) => b.correct).length;
  const total = conditions.length;
  const ratio = total > 0 ? correctCount / total : 0;
  const status = correctCount === total ? 'correct' : correctCount > 0 ? 'partial' : 'incorrect';
  return { status, ratio, blankResults };
}

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

  // Guided condition-builder answer ([{operator,value}] / {conditions:[...]}) —
  // grade by structured conditions regardless of the free-text `correct`.
  const conditionsGraded = gradeConditionsAnswer(question, userAnswer, options);
  if (conditionsGraded) {
    if (conditionsGraded.status === 'unanswered') {
      return {
        question,
        userAnswer: null,
        status: 'unanswered',
        result: { awarded: 0, maxPoints: pts },
      };
    }
    const awarded = Math.round(pts * conditionsGraded.ratio * 100) / 100;
    return {
      question,
      userAnswer,
      status: conditionsGraded.status,
      result: { awarded, maxPoints: pts, blankResults: conditionsGraded.blankResults },
    };
  }

  // Interactive scaffold answer ({scaffold:[...]}) — grade by blanks regardless
  // of any single `correct` value (math/science included).
  const scaffoldGraded = gradeScaffoldAnswer(question, userAnswer, options);
  if (scaffoldGraded) {
    if (scaffoldGraded.status === 'unanswered') {
      return {
        question,
        userAnswer: null,
        status: 'unanswered',
        result: { awarded: 0, maxPoints: pts },
      };
    }
    return {
      question,
      userAnswer,
      status: scaffoldGraded.status,
      result: { awarded: scaffoldGraded.awarded, maxPoints: pts, blankResults: scaffoldGraded.blankResults },
    };
  }

  // Interactive matching answer ({left:right}) — grade against the parsed key.
  const matchingGraded = gradeMatchingAnswer(question, userAnswer);
  if (matchingGraded) {
    if (matchingGraded.status === 'unanswered') {
      return {
        question,
        userAnswer: null,
        status: 'unanswered',
        result: { awarded: 0, maxPoints: pts },
      };
    }
    return {
      question,
      userAnswer,
      status: matchingGraded.status,
      result: { awarded: matchingGraded.awarded, maxPoints: pts, blankResults: matchingGraded.blankResults },
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

    // Interactive scaffold answer ({scaffold:[...]}) — grade by blanks,
    // regardless of any single `correct` value (math/science included).
    const scaffoldGraded = gradeScaffoldAnswer(q, userAnswer, options);
    if (scaffoldGraded) {
      if (scaffoldGraded.status === 'unanswered') {
        unanswered++;
        return {
          question: q,
          userAnswer: null,
          status: 'unanswered',
          result: { awarded: 0, maxPoints: pts },
        };
      }
      autoGraded++;
      earnedPoints += scaffoldGraded.awarded;
      if (scaffoldGraded.status === 'correct' || scaffoldGraded.status === 'scaffold-complete') correctCount++;
      else if (scaffoldGraded.status === 'partial') correctCount += scaffoldGraded.ratio || 0;
      else incorrectCount++;
      return {
        question: q,
        userAnswer,
        status: scaffoldGraded.status,
        result: { awarded: scaffoldGraded.awarded, maxPoints: pts, blankResults: scaffoldGraded.blankResults },
      };
    }

    // Interactive matching answer ({left:right}) — grade against the parsed key.
    const matchingGraded = gradeMatchingAnswer(q, userAnswer);
    if (matchingGraded) {
      if (matchingGraded.status === 'unanswered') {
        unanswered++;
        return {
          question: q,
          userAnswer: null,
          status: 'unanswered',
          result: { awarded: 0, maxPoints: pts },
        };
      }
      autoGraded++;
      earnedPoints += matchingGraded.awarded;
      if (matchingGraded.status === 'correct') correctCount++;
      else if (matchingGraded.status === 'partial') correctCount += matchingGraded.ratio || 0;
      else incorrectCount++;
      return {
        question: q,
        userAnswer,
        status: matchingGraded.status,
        result: { awarded: matchingGraded.awarded, maxPoints: pts, blankResults: matchingGraded.blankResults },
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
