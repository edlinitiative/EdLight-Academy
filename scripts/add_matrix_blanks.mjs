#!/usr/bin/env node
/**
 * add_matrix_blanks.mjs
 *
 * Converts the remaining `kind:'open'` math blanks whose answer is a matrix
 * (`\begin{pmatrix} … \end{pmatrix}`) into an interactive grid: the student
 * fills each cell inside the brackets. The answer_part gains
 * `{ matrix:{rows,cols}, slots:[…row-major…], kind:'matrix' }` and its `answer`
 * is rebuilt as a CLEAN pmatrix string (also repairing the `\\`→`\` row-break
 * corruption present in some source data).
 *
 * Cell handling:
 *   • A pure number (`0`, `-1`)        → slot {answer, kind:'number'}.
 *   • A safe arithmetic sum (`3+40+8`) → evaluated to its integer value as the
 *     primary answer (kind:'number'), since asking the learner to retype the
 *     exact unsimplified expansion is brittle and pedagogically weak.
 *   • Anything else                    → left as a text slot (verbatim).
 *
 * Patches BOTH public/exams/<id>.json and public/exam_catalog.json. Offline.
 *
 * Usage:
 *   node scripts/add_matrix_blanks.mjs           # dry-run (report + samples)
 *   node scripts/add_matrix_blanks.mjs --write    # apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');
const CATALOG = path.join(__dirname, '..', 'public', 'exam_catalog.json');
const WRITE = process.argv.includes('--write');

const isMathExam = (e) => /math/i.test(e.subject || '');
const stripDollars = (s) => String(s ?? '').trim().replace(/^\$+/, '').replace(/\$+$/, '').trim();

/** Evaluate a cell that is pure integer arithmetic (+ - *), else return null. */
function safeEvalCell(cell) {
  const c = cell.trim();
  if (!/^[-+*\d\s]+$/.test(c)) return null;          // digits & + - * only
  if (!/\d/.test(c)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict";return (${c});`)();
    return Number.isFinite(v) && Number.isInteger(v) ? String(v) : null;
  } catch { return null; }
}

/** Build a slot spec from a raw matrix cell. */
function cellSlot(raw) {
  const cell = raw.trim();
  if (/^[-+]?\d+$/.test(cell)) return { answer: cell, kind: 'number', width: cell.length };
  const evaluated = safeEvalCell(cell);
  if (evaluated != null) {
    // Grade against the evaluated integer (kind:number). We deliberately do NOT
    // add the raw expansion (e.g. "3 + 40 + 8") as an alternative: numeric
    // matching uses parseFloat, which would read "3 + 40 + 8" as 3 and wrongly
    // accept a lone "3". The reference answer still SHOWS the expansion.
    return { answer: evaluated, kind: 'number', width: evaluated.length };
  }
  return { answer: cell, kind: 'text', width: Math.min(8, Math.max(2, cell.replace(/[\\{}\s]/g, '').length || 2)) };
}

/** Parse a `\begin{*matrix} … \end{*matrix}` answer into {rows, cols, cells[][]}. */
function parseMatrix(rawAnswer) {
  const s = stripDollars(rawAnswer);
  const m = s.match(/\\begin\{([pbvB]?)matrix\}([\s\S]*?)\\end\{\1?matrix\}/);
  if (!m) return null;
  const inner = m[2].trim();
  // Rows are separated by `\\`; tolerate the corruption where `\\` collapsed to
  // a single `\`. Cells here are arithmetic only, so any backslash run is a
  // row break. Split on one-or-more backslashes.
  const rowStrs = inner.split(/\\+/).map((r) => r.trim()).filter((r) => r.length);
  if (rowStrs.length < 1) return null;
  const cells = rowStrs.map((r) => r.split('&').map((c) => c.trim()));
  const cols = cells[0].length;
  if (cols < 1 || !cells.every((r) => r.length === cols)) return null; // not rectangular
  return { rows: cells.length, cols, cells };
}

/** Rebuild a clean pmatrix string from parsed cell texts (for the reference answer). */
function cleanMatrixString(parsed) {
  const lines = parsed.cells.map((r) => r.join(' & '));
  return `$\\begin{pmatrix} ${lines.join(' \\\\ ')} \\end{pmatrix}$`;
}

function main() {
  const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));
  const changed = new Map();
  let scanned = 0, converted = 0;
  const samples = [];

  for (const f of files) {
    let exam;
    try { exam = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
    if (!isMathExam(exam)) continue;
    let examChanged = false;

    for (const sec of exam.sections || []) {
      for (const q of sec.questions || []) {
        if (!q.scaffold_text || !Array.isArray(q.answer_parts)) continue;
        for (const p of q.answer_parts) {
          if (!p || p.template || p.matrix || Array.isArray(p.options)) continue;
          if (p.kind !== 'open') continue;
          if (!/\\begin\{[pbvB]?matrix\}/.test(p.answer || '')) continue;
          scanned += 1;
          const parsed = parseMatrix(p.answer);
          if (!parsed) continue;
          const slots = [];
          for (const row of parsed.cells) for (const c of row) slots.push(cellSlot(c));
          p.matrix = { rows: parsed.rows, cols: parsed.cols };
          p.slots = slots;
          p.answer = cleanMatrixString(parsed); // clean + de-corrupt the reference
          p.kind = 'matrix';
          converted += 1;
          examChanged = true;
          if (samples.length < 8) samples.push({ file: f, matrix: p.matrix, answer: p.answer, slots });
        }
      }
    }
    if (examChanged) {
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

  console.log(`Scanned ${scanned} matrix open blanks. ${WRITE ? 'Converted' : 'Would convert'} ${converted} → grids`);
  for (const s of samples) {
    console.log(`\n  ${s.file.slice(0, 16)}  ${s.matrix.rows}×${s.matrix.cols}`);
    console.log(`  answer:  ${s.answer}`);
    console.log(`  cells:   ${s.slots.map((x) => x.answer + (x.alternatives ? ` (≈ ${x.alternatives.join(', ')})` : '') + `[${x.kind}]`).join('  ')}`);
  }
  if (!WRITE && converted > 0) console.log('\nDry-run — pass --write to apply.');
}

main();
