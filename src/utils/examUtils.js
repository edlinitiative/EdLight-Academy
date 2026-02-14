/**
 * Exam Utilities
 * ─────────────
 * Subject normalization (85+ raw variants → ~15 canonical),
 * index builder, grading engine, and helpers for the Exam UI pages.
 */

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
  multiple_choice: { icon: '🔘', label: 'QCM', gradable: true },
  true_false: { icon: '✅', label: 'Vrai/Faux', gradable: true },
  fill_blank: { icon: '✏️', label: 'Compléter', gradable: true },
  calculation: { icon: '🧮', label: 'Calcul', gradable: true },
  short_answer: { icon: '📝', label: 'Réponse courte', gradable: true },
  essay: { icon: '📄', label: 'Rédaction', gradable: false },
  matching: { icon: '🔗', label: 'Appariement', gradable: false },
  unknown: { icon: '❓', label: 'Autre', gradable: false },
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
    const yearNum = parseInt(yearRaw, 10) || 0;

    let qCount = 0;
    let autoGradable = 0;
    const typeCounts = {};

    for (const sec of exam.sections || []) {
      for (const q of sec.questions || []) {
        qCount++;
        const t = q.type || 'unknown';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
        const meta = QUESTION_TYPE_META[t] || QUESTION_TYPE_META.unknown;
        if (meta.gradable && q.correct) autoGradable++;
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
      _yearRaw: yearRaw,
      _year: yearNum,
      _questionCount: qCount,
      _autoGradable: autoGradable,
      _typeCounts: typeCounts,
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
    }
  }

  // ── 2. Extract word pool / word bank ──
  // Matches: "(Word pool: transport, customs, ...)" or "(Mots: ...)"
  const wpRegex = /\((?:Word\s*pool|Word\s*bank|Banque\s*de\s*mots|Mots)\s*:\s*([^)]+)\)/gi;
  const wpMatches = [...t.matchAll(wpRegex)];
  if (wpMatches.length > 0) {
    wordPool = wpMatches[0][1].trim();
    // Remove all occurrences from text
    t = t.replace(wpRegex, '').trim();
  }

  // ── 3. Strip redundant leading sub-number or sub-letter ──
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
      if (meta.gradable && q.correct) gradable++;
    }
  }
  return { total, gradable };
}

// ─── Grading engine ─────────────────────────────────────────────────────────

/**
 * Grade an exam given the flat questions array and the user answers map.
 * Returns { summary, results }.
 */
export function gradeExam(questions, answers) {
  let totalPoints = 0;
  let earnedPoints = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unanswered = 0;
  let manualReview = 0;
  let autoGraded = 0;

  const results = questions.map((q, i) => {
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
    const isCorrect = checkAnswer(q, userAnswer);
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

  return { summary, results };
}

function checkAnswer(question, userAnswer) {
  const correct = (question.correct || '').trim().toLowerCase();
  const user = String(userAnswer).trim().toLowerCase();

  if (!correct || !user) return false;

  switch (question.type) {
    case 'multiple_choice':
      return user === correct;

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
      // Exact match first
      if (user === correct) return true;
      // Try numeric comparison
      const userNum = parseFloat(user.replace(/,/g, '.'));
      const correctNum = parseFloat(correct.replace(/,/g, '.'));
      if (!isNaN(userNum) && !isNaN(correctNum)) {
        return Math.abs(userNum - correctNum) < 0.01;
      }
      // Loose text match (ignore accents and extra spaces)
      const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
      return norm(user) === norm(correct);
    }

    default:
      return user === correct;
  }
}
