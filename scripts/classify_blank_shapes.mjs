#!/usr/bin/env node
// Read-only: classify every renderable math scaffold blank answer by SHAPE so we
// can decide which stay free-text (number / one word) and which become dropdowns.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');

// Question types whose scaffold renders interactively for math (ScaffoldedAnswer).
const RENDER_TYPES = new Set(['calculation', 'fill_blank']);

function isMathExam(e) { return /math/i.test(e.subject || ''); }

// Strip surrounding $…$ and common LaTeX wrappers to look at the "bare" answer.
function bare(ans) {
  return String(ans ?? '')
    .trim()
    .replace(/^\$+|\$+$/g, '')
    .replace(/\\,|\\;|\\!|\\ /g, ' ')
    .trim();
}

function tokenCount(s) {
  return s.split(/\s+/).filter(Boolean).length;
}

// Heuristic LaTeX/expression complexity: count structural operators/macros.
function exprComplexity(s) {
  const macros = (s.match(/\\[a-zA-Z]+/g) || []).length;     // \frac, \sqrt, \pi…
  const ops = (s.match(/[=+\-*/^_<>(){}|]/g) || []).length;  // structural symbols
  return macros * 2 + ops;
}

const NUM_RE = /^[+-]?\d+(?:[.,]\d+)?$/;                        // 3, -2, 0.56
const FRAC_RE = /^[+-]?\d+\/\d+$/;                              // 2/3
const NUM_UNIT_RE = /^[+-]?\d+(?:[.,]\d+)?\s*[a-zA-Z%°][a-zA-Z²³%°/.\s]*$/; // 48 km/h
const WORD_RE = /^[\p{L}][\p{L}'-]*$/u;                         // géométrique, Partitif
// A single symbolic VALUE: no spaces, no '=', no comma-separated list. Typeable
// with the math keyboard and CAS-gradable. e.g. \frac{19}{10}, -\frac{1}{10},
// \frac{\pi}{6}, -\infty, x^2, 9/4, ]0,1[ (kept short).
const SINGLE_SYMBOL_RE = /^[^\s=]+$/;

function isInterval(s) { return /^[\][][^\];]*[\][]$/.test(s.replace(/\s/g, '')); }

function classify(answer) {
  const b = bare(answer);
  if (!b) return 'empty';
  if (NUM_RE.test(b)) return 'number';
  if (FRAC_RE.test(b)) return 'fraction';
  if (NUM_UNIT_RE.test(b) && b.length <= 14) return 'number_unit';
  if (WORD_RE.test(b) && b.length <= 18) return 'single_word';

  const tk = tokenCount(b);
  const hasList = /,\s*\S/.test(b);          // "-3i, 3+i, 3-i"
  const hasEq = /[^<>!]=(?!=)/.test(b);       // "y = 0.88x", "P(z) = …"
  const wordy = (b.match(/\p{L}{3,}/gu) || []).length >= 2 && !/\\/.test(b); // phrase

  // single symbolic value (no spaces / '=' / list) and short → typeable text
  if (!hasEq && !hasList && SINGLE_SYMBOL_RE.test(b) && b.length <= 16) return 'short_symbolic';
  if (isInterval(b) && b.length <= 18) return 'short_symbolic';

  if (hasList) return 'list';
  if (hasEq) return 'equation';
  if (wordy) return tk <= 4 ? 'short_phrase' : 'phrase';
  return 'long_expr';
}

const TEXT_OK = new Set(['number', 'fraction', 'number_unit', 'single_word', 'short_symbolic']);

const counts = {};
const samples = {};
let totalBlanks = 0;
let questionsRenderable = 0;
let alreadyDropdown = 0;

const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));
for (const f of files) {
  let e; try { e = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
  if (!isMathExam(e)) continue;
  for (const sec of e.sections || []) {
    for (const q of sec.questions || []) {
      if (!RENDER_TYPES.has(q.type)) continue;
      if (!q.scaffold_text || !Array.isArray(q.answer_parts)) continue;
      questionsRenderable += 1;
      for (const p of q.answer_parts) {
        totalBlanks += 1;
        if (Array.isArray(p.options) && p.options.length) { alreadyDropdown += 1; continue; }
        const cls = classify(p.answer);
        counts[cls] = (counts[cls] || 0) + 1;
        (samples[cls] ||= []);
        if (samples[cls].length < 8) samples[cls].push(String(p.answer));
      }
    }
  }
}

const order = ['number', 'fraction', 'number_unit', 'single_word', 'short_symbolic',
  'list', 'equation', 'short_phrase', 'phrase', 'long_expr', 'empty'];

console.log('Renderable math scaffold questions :', questionsRenderable);
console.log('Total blanks                       :', totalBlanks);
console.log('Already dropdowns                  :', alreadyDropdown);
console.log('Remaining free-text blanks         :', totalBlanks - alreadyDropdown);
console.log('-'.repeat(64));
let textOk = 0, needDropdown = 0;
for (const k of order) {
  if (!counts[k]) continue;
  const tag = TEXT_OK.has(k) ? 'TEXT-OK ' : k === 'empty' ? '        ' : 'DROPDOWN';
  if (TEXT_OK.has(k)) textOk += counts[k];
  else if (k !== 'empty') needDropdown += counts[k];
  console.log(`  ${tag}  ${k.padEnd(15)} ${String(counts[k]).padStart(4)}`);
}
console.log('-'.repeat(64));
console.log(`KEEP AS TEXT (number/word/short) : ${textOk}`);
console.log(`CONVERT TO DROPDOWN (complex)    : ${needDropdown}`);
console.log('='.repeat(64));
for (const k of order) {
  if (!samples[k]) continue;
  console.log(`\n[${k}] samples:`);
  for (const s of samples[k]) console.log('   · ' + s.slice(0, 70));
}
