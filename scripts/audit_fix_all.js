#!/usr/bin/env node
/**
 * audit_fix_all.js — One-shot script to fix all issues found in the exam catalog audit.
 *
 * Fixes:
 *  1. Split jammed MCQ options (12 questions)
 *  2. Tag multi-select MCQs with type "multiple_select" (11 questions)
 *  3. Normalize year values (59 exams)
 *  4. Normalize subject names to canonical forms (all exams)
 *  5. Fix broken LaTeX — close unmatched $ (28 questions)
 *  6. Remove empty exams (2 exams with 0 sections)
 *  7. Mark "missing from image" / "depends on" questions as manual grading
 *  8. Fix very short questions by prepending section context
 *  9. Deduplicate questions within the same exam (not cross-exam)
 * 10. Fix matching questions with non-string correct (6 questions)
 * 11. Fix scaffold blanks without answer_parts → convert to essay type
 *
 * Usage: node scripts/audit_fix_all.js
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'public', 'exam_catalog.json');
const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

const stats = {
  jammedMCQ: 0,
  multiSelect: 0,
  yearNormalized: 0,
  subjectNormalized: 0,
  brokenLatex: 0,
  emptyExams: 0,
  missingImage: 0,
  dependsOn: 0,
  shortQuestions: 0,
  duplicatesRemoved: 0,
  matchingFixed: 0,
  scaffoldConverted: 0,
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FIX JAMMED MCQ OPTIONS
// ═══════════════════════════════════════════════════════════════════════════════
// Pattern: {"a": "paronymes ; b- antonymes ; c- homonymes ; d- homophones ; e- aucune..."}
// Split on "; b-", "; c-", etc.
function fixJammedOptions(q) {
  if (q.type !== 'multiple_choice' || !q.options) return false;
  const keys = Object.keys(q.options);
  if (keys.length !== 1) return false;

  const singleKey = keys[0];
  const val = q.options[singleKey];
  if (typeof val !== 'string') return false;

  // Check for jammed pattern: "text ; b- text ; c- text"
  const jamPattern = /;\s*([b-f])\s*[-.)]\s*/i;
  if (!jamPattern.test(val)) return false;

  // Split into individual options
  const newOptions = {};
  // First option uses the existing key
  const parts = val.split(/;\s*(?=[b-f]\s*[-.)]\s*)/i);
  newOptions[singleKey] = parts[0].trim().replace(/[.;]+$/, '').trim();

  for (let i = 1; i < parts.length; i++) {
    const match = parts[i].match(/^([b-f])\s*[-.)]\s*(.*)/i);
    if (match) {
      const key = match[1].toLowerCase();
      newOptions[key] = match[2].trim().replace(/[.;]+$/, '').trim();
    }
  }

  if (Object.keys(newOptions).length > 1) {
    q.options = newOptions;
    return true;
  }
  return false;
}

// Special case: Exam 71 Q2 — has only {"e": "aucune des réponses précédentes"}
// The figure shows curves labeled a/b/c/d so those ARE the visual options.
// Add them from the figure context.
function fixExam71Q2(q) {
  if (q.options && Object.keys(q.options).length === 1 && q.options.e &&
      q.question && q.question.includes('graphe de $y =')) {
    q.options = {
      a: 'Courbe (a)',
      b: 'Courbe (b)',
      c: 'Courbe (c)',
      d: 'Courbe (d)',
      e: q.options.e,
    };
    return true;
  }
  return false;
}

// Special case: Exam 305 — {"a": "reprieve, infusion"} — this is a fill-in-blank,
// not really MCQ. Convert to fill_blank.
function fixReprieveQ(q) {
  if (q.options && Object.keys(q.options).length === 1 && q.options.a === 'reprieve, infusion') {
    q.type = 'fill_blank';
    q.correct = 'reprieve, infusion';
    delete q.options;
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. TAG MULTI-SELECT MCQs
// ═══════════════════════════════════════════════════════════════════════════════
function tagMultiSelect(q) {
  if (q.type !== 'multiple_choice' || !q.correct) return false;
  const corr = String(q.correct);
  if (/,\s*/.test(corr) && /^[a-f](\s*,\s*[a-f])+$/i.test(corr.trim())) {
    q.type = 'multiple_select';
    q.correct_keys = corr.split(/\s*,\s*/).map(k => k.trim().toLowerCase());
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. NORMALIZE YEARS
// ═══════════════════════════════════════════════════════════════════════════════
function normalizeYear(yearStr) {
  if (!yearStr) return yearStr;
  const s = yearStr.trim();

  // Already a clean 4-digit year
  if (/^\d{4}$/.test(s)) return s;

  // "JUILLET 2022", "FÉVRIER 2022", "Janvier 2025", "AOÛT 2024", etc.
  const monthYear = s.match(/(\d{4})/);
  if (monthYear) {
    // For ranges like "2016-2022", "2019-2020" — take the later year
    const rangeMatch = s.match(/(\d{4})\s*[-–]\s*(\d{4})/);
    if (rangeMatch) return rangeMatch[2];
    return monthYear[1];
  }

  // "Modèle" → no year
  if (/mod[eè]le/i.test(s)) return null;

  return yearStr;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. NORMALIZE SUBJECTS
// ═══════════════════════════════════════════════════════════════════════════════
const SUBJECT_CANONICAL = {
  'anglais': 'Anglais',
  'anglais - business': 'Anglais',
  'anglais et espagnol': 'Anglais',
  'espagnol': 'Espagnol',
  'espagnol - gastronomía': 'Espagnol',
  'francais': 'Français',
  'français': 'Français',
  'mathematiques': 'Mathématiques',
  'mathématiques': 'Mathématiques',
  'mathématiques topographie': 'Mathématiques',
  'physique': 'Physique',
  'physique - onde': 'Physique',
  'chimie': 'Chimie',
  'chimie - hydrocarbures': 'Chimie',
  'chimie organique': 'Chimie',
  'chimie (ses) brome': 'Chimie',
  'chimie (svt, smp)': 'Chimie',
  'chimie (svt, smp) alcool : sr': 'Chimie',
  'chimie (svt, smp) macromolécule : sr': 'Chimie',
  'svt': 'SVT',
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
  'géologie': 'SVT',
  'anatomie': 'SVT',
  'zoologie': 'SVT',
  'cytologie (svt)': 'SVT',
  'histoire et géographie': 'Histoire-Géo',
  'histoire - géographie': 'Histoire-Géo',
  'histoire-géographie': 'Histoire-Géo',
  'philosophie': 'Philosophie',
  'philosophie (esthétique)': 'Philosophie',
  'philosophie (religion)': 'Philosophie',
  'philosophie - logique': 'Philosophie',
  'philosophie, sciences humaines, culture haïtienne': 'Philosophie',
  'kreyol': 'Kreyòl',
  'kreyòl': 'Kreyòl',
  'kominikasyon kreyòl': 'Kreyòl',
  'économie': 'Économie',
  'art_musique': 'Art & Musique',
  'art et musique': 'Art & Musique',
  'arts et musique': 'Art & Musique',
  'éducation esthétique et artistique': 'Art & Musique',
  'informatique': 'Informatique',
  'santé': 'Santé',
  'sciences infirmières': 'Santé',
  'sciences infirmières - bloc materno-infantile et bloc santé mentale': 'Santé',
  'soins infirmiers': 'Santé',
  'mixed': 'Mixed',
  'culture générale': 'Culture Générale',
  'connaissances générales': 'Culture Générale',
  "concours d'admission": 'Culture Générale',
  'éthique': 'Philosophie',
};

function normalizeSubject(raw) {
  if (!raw) return raw;
  const key = raw.trim().toLowerCase();
  return SUBJECT_CANONICAL[key] || raw.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. FIX BROKEN LaTeX
// ═══════════════════════════════════════════════════════════════════════════════
function fixBrokenLatex(text) {
  if (!text || typeof text !== 'string') return { text, fixed: false };

  // Count $ signs (not escaped \$)
  const dollars = text.match(/(?<!\\)\$/g) || [];
  if (dollars.length % 2 === 0) return { text, fixed: false };

  // Strategy: find the unmatched $ and either close it or remove it
  let fixed = text;
  // Try to find a $ that should be $$ (double dollar)
  // Or an unclosed $ at end — add closing $
  // Most common: trailing unclosed $ → close it
  const lastDollar = fixed.lastIndexOf('$');
  const beforeLast = fixed.substring(0, lastDollar);
  const afterLast = fixed.substring(lastDollar + 1);

  // Count dollars before the last one
  const beforeCount = (beforeLast.match(/(?<!\\)\$/g) || []).length;
  if (beforeCount % 2 === 0) {
    // The last $ is an opener with no closer — add closing $ at end
    fixed = fixed + '$';
  } else {
    // The last $ is a closer but there's an extra opener somewhere
    // Find the first unmatched $ and close it
    let depth = 0;
    let insertPos = -1;
    for (let i = 0; i < fixed.length; i++) {
      if (fixed[i] === '$' && (i === 0 || fixed[i - 1] !== '\\')) {
        depth++;
        if (depth % 2 === 1) {
          // Opening $
          // Check if there's a matching closing $ ahead
          let hasClose = false;
          for (let j = i + 1; j < fixed.length; j++) {
            if (fixed[j] === '$' && fixed[j - 1] !== '\\') { hasClose = true; break; }
          }
          if (!hasClose) {
            // This opener has no closer — find end of math expression
            const nextSpace = fixed.indexOf(' ', i + 1);
            const nextNewline = fixed.indexOf('\n', i + 1);
            let end = fixed.length;
            if (nextSpace > -1) end = Math.min(end, nextSpace);
            if (nextNewline > -1) end = Math.min(end, nextNewline);
            fixed = fixed.substring(0, end) + '$' + fixed.substring(end);
            break;
          }
        }
      }
    }
  }

  const newCount = (fixed.match(/(?<!\\)\$/g) || []).length;
  return { text: fixed, fixed: newCount % 2 === 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. FIX MISSING-IMAGE & DEPENDS-ON QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════════
function fixMissingImageQ(q) {
  const txt = (q.question || '').toLowerCase();
  if (txt.includes('missing from image') || txt.includes('question text missing')) {
    // Can't render this question — mark for manual review
    if (!q.notes) q.notes = '';
    q.notes += ' [auto: question text references a missing image]';
    q._incomplete = true;
    return true;
  }
  return false;
}

function fixDependsOnAnswer(q) {
  const checkStr = (s) => typeof s === 'string' && s.toLowerCase().includes('depends on');
  if (checkStr(q.correct)) {
    q._manual_grade = true;
    if (!q.notes) q.notes = '';
    q.notes += ' [auto: answer depends on passage context — requires manual grading]';
    return true;
  }
  if (q.answer_parts) {
    let changed = false;
    q.answer_parts.forEach(p => {
      if (checkStr(p.answer)) {
        p._manual = true;
        q._manual_grade = true;
        changed = true;
      }
    });
    if (changed) {
      if (!q.notes) q.notes = '';
      q.notes += ' [auto: some blanks depend on passage — requires manual grading]';
    }
    return changed;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. FIX VERY SHORT QUESTIONS (<10 chars)
// ═══════════════════════════════════════════════════════════════════════════════
function fixShortQuestion(q, section) {
  const txt = (q.question || '').trim();
  if (txt.length >= 10 || txt.length === 0) return false;
  if (q.type === 'true_false') return false;

  // Prepend section instruction context if available
  const instr = section.section_instructions || section.instructions || '';
  if (instr && instr.length > 10) {
    // Don't duplicate if already present
    if (!q._displayText) {
      q._sectionContext = instr.substring(0, 200);
    }
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. DEDUPLICATE QUESTIONS WITHIN SAME EXAM
// ═══════════════════════════════════════════════════════════════════════════════
function deduplicateExam(exam) {
  let removed = 0;
  (exam.sections || []).forEach(sec => {
    if (!sec.questions) return;
    const seen = new Set();
    const origLen = sec.questions.length;
    sec.questions = sec.questions.filter(q => {
      const key = (q.question || '').trim().toLowerCase().substring(0, 120);
      if (key.length < 20) return true; // keep short questions
      if (seen.has(key)) {
        removed++;
        return false;
      }
      seen.add(key);
      return true;
    });
  });
  return removed;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. FIX MATCHING NON-STRING CORRECT
// ═══════════════════════════════════════════════════════════════════════════════
function fixMatchingCorrect(q) {
  if (q.type !== 'matching') return false;
  if (typeof q.correct === 'object' && q.correct !== null && !Array.isArray(q.correct)) {
    // Already an object — this is actually correct for matching type
    // But the grading code may treat it as string. Mark as properly typed.
    q._matching_pairs = q.correct;
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. FIX SCAFFOLD WITHOUT ANSWER_PARTS
// ═══════════════════════════════════════════════════════════════════════════════
function fixScaffoldNoAnswerParts(q) {
  if (!q.scaffold_text || !q.scaffold_blanks) return false;
  if (q.answer_parts && q.answer_parts.length > 0) return false;

  // Generate answer_parts from scaffold_blanks (they have .answer)
  if (q.scaffold_blanks.every(b => b.answer)) {
    q.answer_parts = q.scaffold_blanks.map((b, i) => ({
      label: b.label || `Partie ${i + 1}`,
      answer: b.answer,
      alternatives: b.alternatives || [],
    }));
    return true;
  }

  // If blanks don't have answers, mark as manual
  q._manual_grade = true;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPLY ALL FIXES
// ═══════════════════════════════════════════════════════════════════════════════
console.log('Starting comprehensive exam catalog fix...\n');

// Remove empty exams first
const origLen = data.length;
const filtered = data.filter(e => {
  if (!e.sections || e.sections.length === 0) {
    stats.emptyExams++;
    console.log(`  ✗ Removed empty exam: ${(e.exam_title || e.title || '').substring(0, 60)}`);
    return false;
  }
  return true;
});

filtered.forEach((exam, ei) => {
  // 3. Normalize year
  const origYear = exam.year;
  const normYear = normalizeYear(exam.year);
  if (normYear !== origYear) {
    exam.year = normYear;
    stats.yearNormalized++;
  }

  // 4. Normalize subject
  const origSubj = exam.subject;
  const normSubj = normalizeSubject(exam.subject);
  if (normSubj !== origSubj) {
    exam.subject = normSubj;
    stats.subjectNormalized++;
  }

  // 9. Deduplicate
  const dupsRemoved = deduplicateExam(exam);
  stats.duplicatesRemoved += dupsRemoved;

  // Per-question fixes
  (exam.sections || []).forEach((sec) => {
    (sec.questions || []).forEach((q) => {
      // 1. Fix jammed MCQ options
      if (fixExam71Q2(q)) stats.jammedMCQ++;
      else if (fixReprieveQ(q)) stats.jammedMCQ++;
      else if (fixJammedOptions(q)) stats.jammedMCQ++;

      // 2. Tag multi-select
      if (tagMultiSelect(q)) stats.multiSelect++;

      // 5. Fix broken LaTeX in question text
      if (q.question) {
        const res = fixBrokenLatex(q.question);
        if (res.fixed) {
          q.question = res.text;
          stats.brokenLatex++;
        }
      }

      // 7. Fix missing image / depends-on
      if (fixMissingImageQ(q)) stats.missingImage++;
      if (fixDependsOnAnswer(q)) stats.dependsOn++;

      // 8. Fix very short questions
      if (fixShortQuestion(q, sec)) stats.shortQuestions++;

      // 10. Fix matching non-string correct
      if (fixMatchingCorrect(q)) stats.matchingFixed++;

      // 11. Fix scaffold without answer_parts
      if (fixScaffoldNoAnswerParts(q)) stats.scaffoldConverted++;
    });
  });
});

// Write back
fs.writeFileSync(CATALOG_PATH, JSON.stringify(filtered, null, 0));

console.log('\n═══ FIX SUMMARY ═══');
console.log(`  Empty exams removed:       ${stats.emptyExams}`);
console.log(`  Jammed MCQ options split:  ${stats.jammedMCQ}`);
console.log(`  Multi-select MCQs tagged:  ${stats.multiSelect}`);
console.log(`  Years normalized:          ${stats.yearNormalized}`);
console.log(`  Subjects normalized:       ${stats.subjectNormalized}`);
console.log(`  Broken LaTeX fixed:        ${stats.brokenLatex}`);
console.log(`  Missing-image flagged:     ${stats.missingImage}`);
console.log(`  Depends-on flagged:        ${stats.dependsOn}`);
console.log(`  Short questions annotated: ${stats.shortQuestions}`);
console.log(`  In-exam duplicates removed:${stats.duplicatesRemoved}`);
console.log(`  Matching correct fixed:    ${stats.matchingFixed}`);
console.log(`  Scaffold answer_parts gen: ${stats.scaffoldConverted}`);
console.log(`\nTotal exams: ${origLen} → ${filtered.length}`);
console.log('Done! ✓');
