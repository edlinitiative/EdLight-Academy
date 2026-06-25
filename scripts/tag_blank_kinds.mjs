#!/usr/bin/env node
/**
 * tag_blank_kinds.mjs
 *
 * Encodes the "numbers/words stay text, complex answers become choices" rule as
 * data: every renderable math scaffold blank gets an `answer_part.kind`:
 *
 *   'number'   — a number / fraction / number+unit       → numeric text input
 *   'text'     — a single word or single symbolic token   → text input (math kbd)
 *   'dropdown' — already has `options` (closed category)   → <select>
 *   'open'     — a multi-term expression / list / phrase   → text for now, but
 *                flagged so a distractor pass can turn it into a dropdown later
 *
 * Only `calculation` / `fill_blank` questions with scaffold_text + answer_parts
 * are tagged (these are what ScaffoldedAnswer renders for math). Existing
 * fields (answer, label, alternatives, options) are never modified.
 *
 * Usage:
 *   node scripts/tag_blank_kinds.mjs            # dry-run report
 *   node scripts/tag_blank_kinds.mjs --write     # apply to files + catalog
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');
const CATALOG = path.join(__dirname, '..', 'public', 'exam_catalog.json');
const WRITE = process.argv.includes('--write');

const RENDER_TYPES = new Set(['calculation', 'fill_blank']);

function isMathExam(e) { return /math/i.test(e.subject || e.subject_name || e.subject_code || ''); }

function bare(ans) {
  return String(ans ?? '')
    .trim()
    .replace(/^\$+|\$+$/g, '')
    .replace(/\\,|\\;|\\!|\\ /g, ' ')
    .trim();
}

const NUM_RE = /^[+-]?\d+(?:[.,]\d+)?$/;
const FRAC_RE = /^[+-]?\d+\/\d+$/;
const NUM_UNIT_RE = /^[+-]?\d+(?:[.,]\d+)?\s*[a-zA-Z%°][a-zA-Z²³%°/.\s]*$/;
const WORD_RE = /^[\p{L}][\p{L}'-]*$/u;
const SINGLE_SYMBOL_RE = /^[^\s=]+$/;
function isInterval(s) { return /^[\][][^\];]*[\][]$/.test(s.replace(/\s/g, '')); }

/** Decide the input kind for one answer string (no options case). */
function kindFor(answer) {
  const b = bare(answer);
  if (!b) return 'text';
  if (NUM_RE.test(b) || FRAC_RE.test(b)) return 'number';
  if (NUM_UNIT_RE.test(b) && b.length <= 14) return 'number';
  if (WORD_RE.test(b) && b.length <= 18) return 'text';

  const hasList = /,\s*\S/.test(b);
  const hasEq = /[^<>!]=(?!=)/.test(b);
  if (!hasEq && !hasList && SINGLE_SYMBOL_RE.test(b) && b.length <= 16) return 'text';
  if (isInterval(b) && b.length <= 18) return 'text';
  return 'open';
}

const stats = { number: 0, text: 0, dropdown: 0, open: 0, filesChanged: 0, catalogExams: 0 };

function tagExam(exam, count) {
  if (!isMathExam(exam)) return 0;
  let changed = 0;
  for (const sec of exam.sections || []) {
    for (const q of sec.questions || []) {
      if (!RENDER_TYPES.has(q.type)) continue;
      if (!q.scaffold_text || !Array.isArray(q.answer_parts)) continue;
      for (const p of q.answer_parts) {
        if (!p) continue;
        const kind = (Array.isArray(p.options) && p.options.length) ? 'dropdown' : kindFor(p.answer);
        if (p.kind !== kind) { p.kind = kind; changed += 1; }
        if (count) stats[kind] += 1;
      }
    }
  }
  return changed;
}

// Per-exam files
const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));
for (const f of files) {
  let exam; try { exam = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
  if (!isMathExam(exam)) continue;
  const changed = tagExam(exam, true);
  if (changed > 0) {
    stats.filesChanged += 1;
    if (WRITE) fs.writeFileSync(path.join(EXAM_DIR, f), JSON.stringify(exam));
  }
}

// Catalog (rebuild source)
if (fs.existsSync(CATALOG)) {
  try {
    const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
    if (Array.isArray(catalog)) {
      for (const exam of catalog) {
        if (!isMathExam(exam)) continue;
        const c = tagExam(exam, false);
        if (c > 0) stats.catalogExams += 1;
      }
      if (WRITE) fs.writeFileSync(CATALOG, JSON.stringify(catalog));
    }
  } catch (e) { console.error('WARN: catalog patch failed:', e.message); }
}

const totalTagged = stats.number + stats.text + stats.dropdown + stats.open;
function pct(n) { return totalTagged ? ((100 * n) / totalTagged).toFixed(1) + '%' : '0%'; }

console.log('='.repeat(60));
console.log(`BLANK KIND TAGGING  ${WRITE ? '(APPLIED)' : '(dry-run — pass --write)'}`);
console.log('='.repeat(60));
console.log(`Renderable math blanks tagged : ${totalTagged}`);
console.log(`  number   (numeric input)    : ${stats.number} (${pct(stats.number)})`);
console.log(`  text     (word/symbol input): ${stats.text} (${pct(stats.text)})`);
console.log(`  dropdown (closed category)  : ${stats.dropdown} (${pct(stats.dropdown)})`);
console.log(`  open     (needs distractors): ${stats.open} (${pct(stats.open)})`);
console.log('-'.repeat(60));
console.log(`Per-exam files changed : ${stats.filesChanged}`);
console.log(`Catalog exams changed  : ${stats.catalogExams}`);
console.log('='.repeat(60));
