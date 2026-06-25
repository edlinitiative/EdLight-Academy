#!/usr/bin/env node
/**
 * heal_latex_control_chars.mjs
 *
 * Repairs LaTeX that was corrupted into control characters anywhere in the exam
 * data (scaffold_text, question, model_answer, answer_parts.answer/options, …).
 *
 * Root cause: an upstream process unescaped single-backslash LaTeX commands
 * through a JSON/string boundary, so `\b \t \f \r` (and rarely `\v`) collapsed
 * into a single control byte, e.g. `\frac` -> <0x0c>rac, `\times` -> <0x09>imes,
 * `\begin` -> <0x08>egin, `\rightarrow` -> <0x0d>ightarrow.
 *
 * Safety rule (data-driven — see audit): convert a control byte back to its
 * backslash-command ONLY when it is immediately followed by a letter, because a
 * real LaTeX command continues with letters. Crucially we DO NOT touch 0x0a
 * (newline): an audit showed ~38k of its occurrences are followed by
 * whitespace/punctuation/newlines and the letter-followed ones are real prose
 * line breaks ("\nAu niveau…"), not corrupted \n... commands. Touching it would
 * destroy ~30k legitimate newlines.
 *
 * The walk is recursive over the whole exam object, so no field is missed, and
 * the conversion is a no-op on already-correct text. Patches BOTH
 * public/exams/<id>.json and public/exam_catalog.json.
 *
 * Usage:
 *   node scripts/heal_latex_control_chars.mjs           # dry-run (report only)
 *   node scripts/heal_latex_control_chars.mjs --write    # apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');
const CATALOG = path.join(__dirname, '..', 'public', 'exam_catalog.json');
const WRITE = process.argv.includes('--write');

// Convert collapsed LaTeX commands back to backslash form. Letter-lookahead only.
// 0x0a (newline) is intentionally NOT handled. No trimming (preserve whitespace).
const HEAL_RE = /([\x08\x09\x0b\x0c\x0d])(?=[A-Za-z])/g;
const CTRL_TO_BACKSLASH = { '\x08': '\\b', '\x09': '\\t', '\x0b': '\\v', '\x0c': '\\f', '\x0d': '\\r' };
function healString(s) {
  return s.replace(HEAL_RE, (m, c) => CTRL_TO_BACKSLASH[c]);
}

// Recursively heal every string in the object in place. Returns #chars fixed.
function healNode(node) {
  let fixed = 0;
  if (typeof node === 'string') return 0; // strings handled by parent (need write-back)
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === 'string') {
        const before = node[i];
        const after = healString(before);
        if (after !== before) { fixed += (before.match(HEAL_RE) || []).length; node[i] = after; }
      } else fixed += healNode(node[i]);
    }
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === 'string') {
        const after = healString(v);
        if (after !== v) { fixed += (v.match(HEAL_RE) || []).length; node[k] = after; }
      } else fixed += healNode(v);
    }
  }
  return fixed;
}

function main() {
  const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));
  const changed = new Map(); // exam_id -> exam object
  let totalFixed = 0, filesFixed = 0;

  for (const f of files) {
    let exam;
    try { exam = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
    const fixed = healNode(exam);
    if (fixed > 0) {
      totalFixed += fixed; filesFixed += 1;
      changed.set(exam.exam_id || exam.id, exam);
      if (WRITE) fs.writeFileSync(path.join(EXAM_DIR, f), JSON.stringify(exam));
    }
  }

  if (WRITE && changed.size > 0 && fs.existsSync(CATALOG)) {
    try {
      const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
      if (Array.isArray(catalog)) {
        let n = 0;
        for (let i = 0; i < catalog.length; i++) {
          const src = changed.get(catalog[i].exam_id || catalog[i].id);
          if (src) { catalog[i] = src; n += 1; }
        }
        fs.writeFileSync(CATALOG, JSON.stringify(catalog));
        console.log(`Catalog mirrored: ${n} exam(s).`);
      }
    } catch (e) { console.error('WARN: catalog mirror failed:', e.message); }
  }

  console.log(`${WRITE ? 'Fixed' : 'Would fix'} ${totalFixed} corrupted LaTeX command(s) across ${filesFixed} file(s).`);
  if (!WRITE && totalFixed > 0) console.log('Dry-run — pass --write to apply.');
}

main();
