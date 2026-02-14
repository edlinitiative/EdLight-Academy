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
 * Flatten all sections/questions into a single ordered array.
 * Each question gets sectionTitle/sectionInstructions attached.
 */
export function flattenQuestions(exam) {
  const flat = [];
  for (const sec of exam.sections || []) {
    for (const q of sec.questions || []) {
      flat.push({
        ...q,
        sectionTitle: sec.section_title || '',
        sectionInstructions: sec.instructions || '',
      });
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
