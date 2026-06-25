#!/usr/bin/env node
/**
 * heal_option_control_chars.mjs
 *
 * Repairs dropdown `options` whose LaTeX was corrupted into control characters.
 * This happens when an LLM emits single-backslash LaTeX commands (\to, \frac,
 * \nabla, …) inside a JSON string: \t \f \n \b \r \v are VALID JSON escapes, so
 * JSON.parse silently turns "\to" into <TAB>+"o". We map those control chars
 * back to their LaTeX command. Idempotent and offline (no API calls).
 *
 * Patches BOTH public/exams/<id>.json and public/exam_catalog.json so a prebuild
 * re-split keeps the fix.
 *
 * Usage:
 *   node scripts/heal_option_control_chars.mjs          # dry-run (report only)
 *   node scripts/heal_option_control_chars.mjs --write   # apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');
const CATALOG = path.join(__dirname, '..', 'public', 'exam_catalog.json');
const WRITE = process.argv.includes('--write');

function cleanLatexString(s) {
  return String(s ?? '')
    .replace(/\x08/g, '\\b') // \beta, \binom
    .replace(/\x09/g, '\\t') // \to, \times, \tan
    .replace(/\x0a/g, '\\n') // \nabla, \neq
    .replace(/\x0b/g, '\\v') // \vec
    .replace(/\x0c/g, '\\f') // \frac, \forall
    .replace(/\x0d/g, '\\r') // \rho, \rightarrow
    .trim();
}
const hasControl = (s) => /[\x00-\x1f]/.test(String(s ?? ''));

// Repair every option string in an exam in place. Returns count of fields fixed.
function healExam(exam) {
  let fixed = 0;
  for (const sec of exam.sections || []) {
    for (const q of sec.questions || []) {
      for (const p of q.answer_parts || []) {
        if (!Array.isArray(p.options)) continue;
        for (let i = 0; i < p.options.length; i++) {
          if (hasControl(p.options[i])) { p.options[i] = cleanLatexString(p.options[i]); fixed += 1; }
        }
        // keep the stored answer consistent if it carried the same corruption
        if (hasControl(p.answer)) { p.answer = cleanLatexString(p.answer); fixed += 1; }
      }
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
    const fixed = healExam(exam);
    if (fixed > 0) {
      totalFixed += fixed; filesFixed += 1;
      changed.set(exam.exam_id || exam.id, exam);
      if (WRITE) fs.writeFileSync(path.join(EXAM_DIR, f), JSON.stringify(exam));
    }
  }

  // Mirror into the catalog so a re-split keeps the repaired options.
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

  console.log(`${WRITE ? 'Fixed' : 'Would fix'} ${totalFixed} option field(s) across ${filesFixed} file(s).`);
  if (!WRITE && totalFixed > 0) console.log('Dry-run — pass --write to apply.');
}

main();
