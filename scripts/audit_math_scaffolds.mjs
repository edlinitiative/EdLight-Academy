#!/usr/bin/env node
// One-off audit: quantify interactive-scaffold readiness across MATH exams.
// Read-only. Prints a report to stdout. Does not modify any exam files.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');

const MATH_HINTS = [
  'math', 'mathématiques', 'mathematiques', 'mathematics', 'algèbre', 'algebre',
  'géométrie', 'geometrie', 'trigonom', 'arithmét', 'arithmet', 'calcul',
];

function isMathExam(exam) {
  const hay = [
    exam.subject, exam.subject_name, exam.subject_code, exam.discipline,
    exam.title, exam.exam_title, exam.category, exam.track,
  ].filter(Boolean).join(' ').toLowerCase();
  return MATH_HINTS.some((h) => hay.includes(h));
}

function getQuestions(exam) {
  const out = [];
  const sections = exam.sections || exam.parts || [];
  for (const sec of sections) {
    const qs = sec.questions || sec.items || [];
    for (const q of qs) out.push({ q, sectionTitle: sec.title || sec.name || '' });
  }
  // some exams put questions at top level
  if (!sections.length && Array.isArray(exam.questions)) {
    for (const q of exam.questions) out.push({ q, sectionTitle: '' });
  }
  return out;
}

const PLACEHOLDER_RE = /\{\{\s*\d+\s*\}\}/g;
// REAL corruption: empty {{}} braces, or a placeholder glued mid-token to an
// adjacent alphanumeric char (e.g. "(1{{0}}-18i)" where a blank replaced a
// digit inside a number). Does NOT flag valid standalone {{n}} placeholders.
const EMPTY_BRACE_RE = /\{\{\s*\}\}/g;
const MIDTOKEN_RE = /[A-Za-z0-9]\{\{\s*\d+\s*\}\}|\{\{\s*\d+\s*\}\}[A-Za-z0-9]/g;

const stats = {
  totalExams: 0,
  mathExams: 0,
  mathQuestions: 0,
  proofQuestions: 0,
  withScaffoldText: 0,
  withScaffoldBlanks: 0,
  withAnswerParts: 0,
  withModelAnswer: 0,
  withCorrectFlag: 0,
  rendersInteractiveToday: 0, // mirrors usesScaffold(): math scaffold renders even with `correct`
  stillPlainInput: 0,         // scaffolded but native-widget type -> keeps its own input
  dropdownBlanks: 0,          // answer_parts entries with options (choose-from-list)
  questionsWithDropdown: 0,
  midTokenCorruption: 0,      // {{n}} glued inside a token, e.g. (1{{0}}-18i)
  emptyBraces: 0,             // literal {{}} with no index
  blankCountMismatch: 0,
  leakAnswerInPrompt: 0,
  emptyScaffold: 0,
};

const sampleProblems = [];
const samples_dd = [];

function pushSample(kind, file, exam, qIdx, detail) {
  if (sampleProblems.length < 40) {
    sampleProblems.push({ kind, file: path.basename(file), title: exam.title || exam.exam_title || '', qIdx, detail });
  }
}

const files = fs.readdirSync(EXAM_DIR).filter((f) => f.endsWith('.json') && f.startsWith('ex_'));
stats.totalExams = files.length;

for (const f of files) {
  const full = path.join(EXAM_DIR, f);
  let exam;
  try {
    exam = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    continue;
  }
  if (!isMathExam(exam)) continue;
  stats.mathExams += 1;

  const qpairs = getQuestions(exam);
  for (let i = 0; i < qpairs.length; i++) {
    const { q, sectionTitle } = qpairs[i];
    stats.mathQuestions += 1;

    const prompt = String(q.prompt || q.question || q.text || q.statement || '');
    const isProof = /démontr|demontr|prouv|montrer que|déduire|prove|proof/i.test(
      prompt + ' ' + sectionTitle + ' ' + String(q.topic || '')
    );
    if (isProof) stats.proofQuestions += 1;

    const scaffoldText = q.scaffold_text || q.scaffoldText || '';
    const blanks = q.scaffold_blanks || q.scaffoldBlanks || q.answer_parts || q.answerParts || null;
    const model = q.model_answer || q.modelAnswer || q.solution || '';
    const correct = q.correct ?? q.final_answer ?? q.answer ?? null;

    if (scaffoldText) stats.withScaffoldText += 1;
    if (Array.isArray(blanks) && blanks.length) stats.withScaffoldBlanks += 1;
    if (Array.isArray(q.answer_parts || q.answerParts)) stats.withAnswerParts += 1;
    if (model) stats.withModelAnswer += 1;
    const hasCorrect = correct != null && String(correct).trim() !== '';
    if (hasCorrect) stats.withCorrectFlag += 1;

    const type = q.type || '';
    const isEssayLike = type === 'essay' || type === 'short_answer';
    const isNative = ['multiple_choice', 'multiple_select', 'true_false', 'matching'].includes(type);
    const hasScaffoldPair = Boolean(scaffoldText && Array.isArray(blanks) && blanks.length);

    // Mirrors usesScaffold() in ExamTake.tsx for a math subject:
    //   not essay/short_answer, not a native-widget type, has scaffold pair.
    if (hasScaffoldPair && !isEssayLike) {
      if (isNative) {
        stats.stillPlainInput += 1;
      } else {
        stats.rendersInteractiveToday += 1;
      }
    }

    // Dropdown blanks (choose-from-list steps)
    const aps = q.answer_parts || q.answerParts || [];
    const dd = Array.isArray(aps) ? aps.filter((p) => p && Array.isArray(p.options) && p.options.length).length : 0;
    if (dd > 0) {
      stats.dropdownBlanks += dd;
      stats.questionsWithDropdown += 1;
      if (samples_dd.length < 10) samples_dd.push(`${path.basename(f)} q#${i} :: ${dd} dropdown blank(s)`);
    }

    // real corruption in scaffold text
    if (scaffoldText) {
      const placeholders = (scaffoldText.match(PLACEHOLDER_RE) || []).length;
      const midTok = (scaffoldText.match(MIDTOKEN_RE) || []).length;
      const empties = (scaffoldText.match(EMPTY_BRACE_RE) || []).length;
      if (midTok > 0) {
        stats.midTokenCorruption += 1;
        const m = scaffoldText.match(MIDTOKEN_RE);
        pushSample('midtoken', f, exam, i, m.join('  '));
      }
      if (empties > 0) {
        stats.emptyBraces += 1;
        pushSample('emptybrace', f, exam, i, scaffoldText.slice(0, 60));
      }
      if (placeholders === 0) {
        stats.emptyScaffold += 1;
      }
      // mismatch between placeholder count and blanks provided
      if (Array.isArray(blanks) && placeholders !== blanks.length) {
        stats.blankCountMismatch += 1;
        pushSample('mismatch', f, exam, i, `placeholders=${placeholders} blanks=${blanks.length}`);
      }
    }

    // answer leakage: model answer / correct fully visible in prompt
    if (model && prompt && prompt.includes(String(model).slice(0, 20)) && String(model).length > 20) {
      stats.leakAnswerInPrompt += 1;
      pushSample('leak', f, exam, i, 'model answer text appears in prompt');
    }
  }
}

function pct(n, d) {
  if (!d) return '0%';
  return ((100 * n) / d).toFixed(1) + '%';
}

console.log('='.repeat(64));
console.log('MATH EXAM INTERACTIVE-SCAFFOLD AUDIT (read-only)');
console.log('='.repeat(64));
console.log(`Total exam files scanned : ${stats.totalExams}`);
console.log(`Math exams identified    : ${stats.mathExams}`);
console.log(`Math questions total     : ${stats.mathQuestions}`);
console.log(`  of which proof-type    : ${stats.proofQuestions} (${pct(stats.proofQuestions, stats.mathQuestions)})`);
console.log('-'.repeat(64));
console.log('SCAFFOLD COVERAGE (the interactive fill-in model already designed)');
console.log(`  questions w/ scaffold_text   : ${stats.withScaffoldText} (${pct(stats.withScaffoldText, stats.mathQuestions)})`);
console.log(`  questions w/ scaffold_blanks : ${stats.withScaffoldBlanks} (${pct(stats.withScaffoldBlanks, stats.mathQuestions)})`);
console.log(`  questions w/ answer_parts    : ${stats.withAnswerParts}`);
console.log(`  questions w/ model_answer    : ${stats.withModelAnswer} (${pct(stats.withModelAnswer, stats.mathQuestions)})`);
console.log(`  questions w/ correct flag    : ${stats.withCorrectFlag}`);
console.log('-'.repeat(64));
console.log('ACTUAL RENDER PATH (mirrors usesScaffold(): math scaffold always interactive)');
console.log(`  renders interactive NOW   : ${stats.rendersInteractiveToday} (${pct(stats.rendersInteractiveToday, stats.withScaffoldBlanks)} of scaffolded)`);
console.log(`  native-widget (kept input): ${stats.stillPlainInput}`);
console.log('-'.repeat(64));
console.log('DROPDOWN (choose-from-list) BLANKS');
console.log(`  dropdown blanks            : ${stats.dropdownBlanks}`);
console.log(`  questions with a dropdown  : ${stats.questionsWithDropdown}`);
for (const s of samples_dd) console.log('    ' + s);
console.log('-'.repeat(64));
console.log('DATA INTEGRITY (real corruption, false positives excluded)');
console.log(`  mid-token {{n}} corruption : ${stats.midTokenCorruption}`);
console.log(`  empty {{}} braces          : ${stats.emptyBraces}`);
console.log(`  scaffold w/o placeholders  : ${stats.emptyScaffold}`);
console.log(`  blank-count mismatch       : ${stats.blankCountMismatch}`);
console.log(`  answer leak in prompt      : ${stats.leakAnswerInPrompt}`);
console.log('-'.repeat(64));
console.log('SAMPLES (first 40):');
for (const s of sampleProblems) {
  console.log(`  [${s.kind}] ${s.file} q#${s.qIdx} :: ${s.detail}`);
}
console.log('='.repeat(64));
