#!/usr/bin/env node
/**
 * audit_pedagogy.mjs  —  read-only, cross-subject pedagogical audit.
 *
 * The math work made 1147 math questions interactive (dropdowns, fill-in
 * templates, matrix grids, step blanks). This audit looks at EVERY subject and
 * quantifies, per subject, where the learning experience can be improved:
 *
 *   • Interactivity   — does the authored scaffold actually render as fill-in,
 *                       or does it collapse to a single box / get blocked?
 *   • Wasted scaffolds— questions that HAVE scaffold_text+blanks but never show
 *                       them (blocked by the short_answer guard or the
 *                       "only when !correct" guard for non-math subjects).
 *   • Feedback        — explanation coverage (what a learner sees after a wrong
 *                       answer). Hints are separate (already ~100%).
 *   • Auto-grading    — fraction that can be graded without a human/AI.
 *   • matching        — letter/number matchings now render interactive
 *                       dropdowns and auto-grade (parseMatchingKey); the rest
 *                       (free-text tables, grouping tasks) stay manual.
 *
 * Prints a per-subject table + a global opportunity summary. Mutates nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');

// Mirror the app exactly (src/pages/ExamTake.tsx).
const MATH_SUBJECTS = new Set(['Mathématiques', 'Physique', 'Chimie', 'SVT', 'Informatique']);
const NATIVE_INPUT_TYPES = new Set(['multiple_choice', 'multiple_select', 'true_false', 'matching']);

const nonEmpty = (v) => {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0 && v.some((x) => String(x ?? '').trim());
  return String(v).trim().length > 0;
};

const hasScaffoldData = (q) => nonEmpty(q.scaffold_text) && nonEmpty(q.scaffold_blanks);

// usesScaffold() from ExamTake.tsx — does the interactive fill-in actually show?
function usesScaffold(q, subject) {
  if (!q) return false;
  if (q.type === 'essay') return false;
  if (NATIVE_INPUT_TYPES.has(q.type)) return false;
  if (!nonEmpty(q.scaffold_text) || !nonEmpty(q.scaffold_blanks)) return false;
  if (typeof q.scaffold_ready === 'boolean') return q.scaffold_ready;
  if (q.type === 'short_answer') return false;
  return !nonEmpty(q.correct) || MATH_SUBJECTS.has(subject);
}

// Mirror of parseMatchingKey() accept gates (src/utils/examUtils.ts): does this
// matching normalize into a clean letter/number key (→ interactive + gradable)?
function matchingGradable(q) {
  if (!q || q.type !== 'matching') return false;
  const parts = Array.isArray(q.answer_parts) ? q.answer_parts : [];
  let answers = parts.map((p) => String(p?.answer ?? '').trim());
  const nonE = answers.filter(Boolean);
  if (nonE.length === 1 && /[,;]/.test(nonE[0]) && /[-–—:)]/.test(nonE[0])) {
    answers = nonE[0].split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  }
  if (answers.filter(Boolean).length < 2) return false;
  const lefts = [];
  let anyExplicit = false;
  let anyPositional = false;
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (!a) continue;
    const two = a.match(/^([a-z0-9]{1,3})\s*[-–—:.)]\s*([a-z0-9]{1,3})$/i);
    if (two) { anyExplicit = true; lefts.push(two[1].toLowerCase()); continue; }
    const lead = a.match(/^([a-z0-9]{1,3})\b/i);
    if (lead) { anyPositional = true; lefts.push(String(i + 1)); continue; }
    return false;
  }
  if (lefts.length < 2) return false;
  if (anyExplicit && anyPositional) return false;
  if (new Set(lefts).size !== lefts.length) return false;
  return true;
}

function blankRow() {
  return {
    exams: 0, questions: 0,
    types: {},
    interactive: 0,             // usesScaffold === true
    scaffoldData: 0,            // has scaffold_text + blanks
    blockedShortAnswer: 0,      // short_answer WITH scaffold data (guard blocks it)
    blockedNonMathCorrect: 0,   // non-math, non-essay/native, scaffold data, has correct → blocked
    explanation: 0,            // non-empty explanation
    hints: 0,                   // non-empty hints
    modelAnswer: 0,
    autoGradable: 0,            // correct present OR answer_parts present
    essay: 0,
    matching: 0,
    matchGradable: 0,
  };
}

const bySubject = {};
const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));

for (const f of files) {
  let ex;
  try { ex = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
  const subject = ex.subject || '(unknown)';
  const row = (bySubject[subject] ||= blankRow());
  row.exams += 1;

  for (const sec of ex.sections || []) {
    for (const q of sec.questions || []) {
      row.questions += 1;
      const t = q.type || '(none)';
      row.types[t] = (row.types[t] || 0) + 1;

      if (nonEmpty(q.explanation)) row.explanation += 1;
      if (nonEmpty(q.hints)) row.hints += 1;
      if (nonEmpty(q.model_answer)) row.modelAnswer += 1;
      if (nonEmpty(q.correct) || nonEmpty(q.answer_parts)) row.autoGradable += 1;
      if (t === 'essay') row.essay += 1;
      if (t === 'matching') row.matching += 1;
      if (matchingGradable(q)) row.matchGradable += 1;

      if (hasScaffoldData(q)) {
        row.scaffoldData += 1;
        if (!usesScaffold(q, subject)) {
          if (t === 'short_answer') row.blockedShortAnswer += 1;
          else if (!MATH_SUBJECTS.has(subject) && t !== 'essay' && !NATIVE_INPUT_TYPES.has(t) && nonEmpty(q.correct)) {
            row.blockedNonMathCorrect += 1;
          }
        }
      }
      if (usesScaffold(q, subject)) row.interactive += 1;
    }
  }
}

const subjects = Object.entries(bySubject).sort((a, b) => b[1].questions - a[1].questions);
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(0) + '%' : '—');
const MATH = (s) => (MATH_SUBJECTS.has(s) ? '∑' : ' ');

console.log('='.repeat(96));
console.log('CROSS-SUBJECT PEDAGOGICAL AUDIT (read-only)   ∑ = science subject (already interactive)');
console.log('='.repeat(96));
console.log(
  pad('Subject', 26) + pad('Qs', 6) + pad('Interact', 9) + pad('Scaffld', 8) +
  pad('Blocked', 8) + pad('Expl', 7) + pad('AutoGr', 8) + pad('Essay', 7) + pad('Match', 6) + pad('MGrad', 7));
console.log('-'.repeat(96));
for (const [s, r] of subjects) {
  const blocked = r.blockedShortAnswer + r.blockedNonMathCorrect;
  console.log(
    MATH(s) + ' ' + pad(s, 24) +
    pad(String(r.questions), 6) +
    pad(`${r.interactive}`, 9) +
    pad(`${r.scaffoldData}`, 8) +
    pad(`${blocked}`, 8) +
    pad(pct(r.explanation, r.questions), 7) +
    pad(pct(r.autoGradable, r.questions), 8) +
    pad(`${r.essay}`, 7) +
    pad(`${r.matching}`, 6) +
    pad(`${r.matchGradable}`, 7));
}

// Global opportunity rollups
const sum = (k) => subjects.reduce((n, [, r]) => n + r[k], 0);
const sumQ = sum('questions');
console.log('-'.repeat(96));
console.log('GLOBAL OPPORTUNITIES');
console.log(`  Total questions                         : ${sumQ}`);
console.log(`  Render interactive today                : ${sum('interactive')}  (${pct(sum('interactive'), sumQ)})`);
console.log(`  ⮑ incl. matching dropdowns              : ${sum('interactive') + sum('matchGradable')}  (${pct(sum('interactive') + sum('matchGradable'), sumQ)})`);
console.log(`  Have scaffold data (text+blanks)        : ${sum('scaffoldData')}  (${pct(sum('scaffoldData'), sumQ)})`);
console.log(`  ⫠ BLOCKED short_answer scaffolds        : ${sum('blockedShortAnswer')}   (authored steps never shown)`);
console.log(`  ⫠ BLOCKED non-math "has correct"        : ${sum('blockedNonMathCorrect')}`);
console.log(`  Missing explanation (no "why")          : ${sumQ - sum('explanation')}  (${pct(sumQ - sum('explanation'), sumQ)})`);
console.log(`  matching: auto-gradable / total         : ${sum('matchGradable')} / ${sum('matching')}  (rest stay manual: tables, grouping)`);
console.log(`  essay (manual/AI only)                  : ${sum('essay')}`);
console.log('-'.repeat(96));

// Per-type interactivity-of-scaffold breakdown (where the wasted scaffolds live)
const NONMATH = subjects.filter(([s]) => !MATH_SUBJECTS.has(s));
const nmQ = NONMATH.reduce((n, [, r]) => n + r.questions, 0);
const nmScaffold = NONMATH.reduce((n, [, r]) => n + r.scaffoldData, 0);
const nmInteractive = NONMATH.reduce((n, [, r]) => n + r.interactive, 0);
const nmExpl = NONMATH.reduce((n, [, r]) => n + r.explanation, 0);
console.log('NON-MATH SUBJECTS ONLY (10 humanities/language subjects)');
console.log(`  questions                : ${nmQ}`);
console.log(`  have scaffold data       : ${nmScaffold}  (${pct(nmScaffold, nmQ)})`);
console.log(`  render interactive today : ${nmInteractive}  (${pct(nmInteractive, nmQ)})  ← the gap`);
console.log(`  have explanation         : ${nmExpl}  (${pct(nmExpl, nmQ)})`);
console.log('='.repeat(96));

function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n - 1) + ' ' : s + ' '.repeat(n - s.length); }
