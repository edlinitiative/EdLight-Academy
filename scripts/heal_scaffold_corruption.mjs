#!/usr/bin/env node
/**
 * heal_scaffold_corruption.mjs
 *
 * Fixes the mid-token scaffold corruption introduced by an earlier
 * "find the answer string in the solution and replace it with {{n}}" generator.
 * That naive blanking glued placeholders mid-token — option letters matched
 * letters in prose ("est" -> "{{2}}st", "branche" -> "bran{{2}}he") and short
 * numbers matched digits inside larger numbers ("36" -> "3{{0}}6").
 *
 * Because the blank INPUTS already render from the clean `answer_parts` (the
 * `scaffold_text` only feeds the optional "Voir la démarche" preview), the safe,
 * deterministic fix is to rebuild `scaffold_text` + `scaffold_blanks` from the
 * structured `answer_parts` as a numbered, labeled-step scaffold:
 *
 *     1. <label of part 0> : {{0}}
 *     2. <label of part 1> : {{1}}
 *     ...
 *
 * This keeps each blank on its own line (never glued mid-token), keeps the
 * démarche preview minimal (just the first label, no leaked solution), and is
 * fully compatible with the admin AnswerVerification preview (which expands
 * {{n}} by part index) and the grader (answer_parts are untouched, so dropdown
 * options and answers all still work).
 *
 * Only questions whose scaffold_text has mid-token corruption AND whose
 * answer_parts are complete (every part has a non-empty answer) are rebuilt.
 * `model_answer` is never modified — the audit's "answer leak" flag is a false
 * positive (the model answer merely restates the prompt and is shown only after
 * the student answers).
 *
 * Usage:
 *   node scripts/heal_scaffold_corruption.mjs            # dry-run report
 *   node scripts/heal_scaffold_corruption.mjs --write     # apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');
const CATALOG = path.join(__dirname, '..', 'public', 'exam_catalog.json');
const WRITE = process.argv.includes('--write');

const MIDTOKEN_RE = /[A-Za-z0-9]\{\{\s*\d+\s*\}\}|\{\{\s*\d+\s*\}\}[A-Za-z0-9]/;

function isMathExam(e) {
  return /math/i.test(e.subject || e.subject_name || e.subject_code || '');
}

/** A scaffold is corrupt when any placeholder is glued to an adjacent token char. */
function hasMidTokenCorruption(scaffoldText) {
  if (!scaffoldText) return false;
  const m = MIDTOKEN_RE.test(scaffoldText);
  MIDTOKEN_RE.lastIndex = 0;
  return m;
}

/** answer_parts are usable when present and every part carries a non-empty answer. */
function partsAreComplete(answerParts) {
  return Array.isArray(answerParts)
    && answerParts.length > 0
    && answerParts.every((p) => p && String(p.answer ?? '').trim() !== '');
}

/** Strip stray brace pairs from a label so it can't introduce spurious placeholders. */
function cleanLabel(label, i) {
  const l = String(label ?? '').replace(/\{\{|\}\}/g, '').trim();
  return l || `Étape ${i + 1}`;
}

/** Rebuild scaffold_text + scaffold_blanks from answer_parts as labeled steps. */
function rebuildScaffold(answerParts) {
  const lines = [];
  const blanks = [];
  answerParts.forEach((p, i) => {
    const label = cleanLabel(p.label, i);
    lines.push(`${i + 1}. ${label} : {{${i}}}`);
    blanks.push({ label });
  });
  return { scaffold_text: lines.join('\n'), scaffold_blanks: blanks };
}

const stats = {
  mathExams: 0,
  healed: 0,
  byType: {},
  skippedUncleanParts: 0,
  filesChanged: 0,
};
const skipped = [];
const samples = [];

/** Heal every corrupt question in one exam object. Returns # healed. */
function healExam(exam, label, countTypes) {
  if (!isMathExam(exam)) return 0;
  let healed = 0;
  for (const sec of exam.sections || []) {
    for (const q of sec.questions || []) {
      if (!hasMidTokenCorruption(q.scaffold_text)) continue;
      if (!partsAreComplete(q.answer_parts)) {
        if (countTypes) {
          stats.skippedUncleanParts += 1;
          if (skipped.length < 20) skipped.push(`${label} (${q.type}) — incomplete answer_parts`);
        }
        continue;
      }
      const before = q.scaffold_text;
      const rebuilt = rebuildScaffold(q.answer_parts);
      q.scaffold_text = rebuilt.scaffold_text;
      q.scaffold_blanks = rebuilt.scaffold_blanks;
      healed += 1;
      if (countTypes) {
        stats.byType[q.type] = (stats.byType[q.type] || 0) + 1;
        if (samples.length < 12) {
          samples.push(
            `${label} (${q.type})\n      before: ${before.slice(0, 70).replace(/\n/g, '⏎')}…\n      after : ${rebuilt.scaffold_text.slice(0, 70).replace(/\n/g, '⏎')}…`
          );
        }
      }
    }
  }
  return healed;
}

// ── Per-exam files ──────────────────────────────────────────────────────────
const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));
for (const f of files) {
  let exam;
  try { exam = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
  if (!isMathExam(exam)) continue;
  stats.mathExams += 1;
  const n = healExam(exam, f, true);
  if (n > 0) {
    stats.healed += n;
    stats.filesChanged += 1;
    if (WRITE) fs.writeFileSync(path.join(EXAM_DIR, f), JSON.stringify(exam));
  }
}

// ── Source catalog (so a prebuild re-split reproduces the fix) ───────────────
let catalogHealed = 0;
if (fs.existsSync(CATALOG)) {
  try {
    const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
    if (Array.isArray(catalog)) {
      for (const exam of catalog) {
        if (!isMathExam(exam)) continue;
        catalogHealed += healExam(exam, `[catalog] ${exam.exam_id || exam.id || ''}`, false);
      }
      if (WRITE && catalogHealed > 0) fs.writeFileSync(CATALOG, JSON.stringify(catalog));
    }
  } catch (e) {
    console.error('WARN: could not patch exam_catalog.json:', e.message);
  }
}

console.log('='.repeat(66));
console.log(`SCAFFOLD CORRUPTION HEALER  ${WRITE ? '(APPLIED)' : '(dry-run — pass --write to apply)'}`);
console.log('='.repeat(66));
console.log(`Math exams scanned     : ${stats.mathExams}`);
console.log(`Per-exam files changed : ${stats.filesChanged}`);
console.log(`Questions healed       : ${stats.healed}  (catalog: ${catalogHealed})`);
console.log(`By type                : ${JSON.stringify(stats.byType)}`);
console.log(`Skipped (unclean parts): ${stats.skippedUncleanParts}`);
for (const s of skipped) console.log('    · ' + s);
console.log('-'.repeat(66));
console.log('Samples:');
for (const s of samples) console.log('  • ' + s);
console.log('='.repeat(66));
