#!/usr/bin/env node
/**
 * add_dropdown_blanks.mjs
 *
 * Turns selected math scaffold blanks into "choose from a dropdown" steps.
 *
 * A blank becomes a dropdown only when its answer EXACTLY matches (accent- and
 * case-insensitive) one of a closed category's options — e.g. a sequence's
 * nature (arithmétique / géométrique), convergence, parity, sign, monotonie,
 * convexity, or vrai/faux. Because the stored answer is always one of the
 * offered options, the existing scaffold grader keeps working unchanged.
 *
 * Only scaffolded math questions are touched (scaffold_text + scaffold_blanks +
 * answer_parts). The script never removes or rewrites an answer — it only adds
 * `options` (and `kind: 'dropdown'`) to an answer_part.
 *
 * Usage:
 *   node scripts/add_dropdown_blanks.mjs           # dry-run (report only)
 *   node scripts/add_dropdown_blanks.mjs --write    # apply to public/exams/*.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');
const CATALOG = path.join(__dirname, '..', 'public', 'exam_catalog.json');
const WRITE = process.argv.includes('--write');

function norm(s) {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\$+|\$+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Each category: a closed set of mutually-exclusive options. A blank is
// converted only when its answer normalizes to one of these option strings.
const CATEGORIES = [
  { name: 'sequence_nature', options: ['arithmétique', 'géométrique', 'ni arithmétique ni géométrique'] },
  { name: 'monotonie', options: ['croissante', 'décroissante', 'constante'] },
  { name: 'monotonie_stricte', options: ['strictement croissante', 'strictement décroissante', 'constante'] },
  { name: 'convergence', options: ['convergente', 'divergente'] },
  { name: 'convergence_verbe', options: ['converge', 'diverge'] },
  { name: 'parite', options: ['paire', 'impaire', 'ni paire ni impaire'] },
  { name: 'convexite', options: ['convexe', 'concave'] },
  { name: 'signe', options: ['positif', 'négatif', 'nul'] },
  { name: 'signe_f', options: ['positive', 'négative', 'nulle'] },
  { name: 'extremum', options: ['minimum', 'maximum'] },
  { name: 'oui_non', options: ['oui', 'non'] },
  { name: 'proba_qualitative', options: ['impossible', 'probable', 'certain'] },
  { name: 'possibilite', options: ['possible', 'impossible'] },
  { name: 'evenements', options: ['indépendants', 'incompatibles'] },
  { name: 'vrai_faux', options: ['vrai', 'faux'] },
];

// Precompute normalized option sets for fast matching.
for (const c of CATEGORIES) {
  c.normSet = new Set(c.options.map(norm));
}

function categoryForAnswer(answer) {
  const a = norm(answer);
  if (!a) return null;
  for (const c of CATEGORIES) {
    if (c.normSet.has(a)) return c;
  }
  return null;
}

function isMathExam(exam) {
  return /math/i.test(exam.subject || exam.subject_name || exam.subject_code || '');
}

const stats = {
  mathExams: 0,
  filesChanged: 0,
  blanksConverted: 0,
  byCategory: {},
};
const samples = [];

/** Add dropdown options to eligible answer_parts in one exam. Returns # converted. */
function transformExam(exam, fileLabel) {
  if (!isMathExam(exam)) return 0;
  let converted = 0;
  for (const sec of exam.sections || []) {
    for (const q of sec.questions || []) {
      const scaffolded = q.scaffold_text && Array.isArray(q.scaffold_blanks) && Array.isArray(q.answer_parts);
      if (!scaffolded) continue;
      for (const part of q.answer_parts) {
        if (!part || Array.isArray(part.options)) continue; // already a dropdown
        const cat = categoryForAnswer(part.answer);
        if (!cat) continue;
        part.options = [...cat.options];
        part.kind = 'dropdown';
        converted += 1;
        stats.blanksConverted += 1;
        stats.byCategory[cat.name] = (stats.byCategory[cat.name] || 0) + 1;
        if (samples.length < 25) {
          samples.push(`${fileLabel} :: "${part.answer}" -> [${cat.options.join(' | ')}]`);
        }
      }
    }
  }
  return converted;
}

const files = fs.readdirSync(EXAM_DIR).filter((f) => f.endsWith('.json') && f.startsWith('ex_'));

for (const f of files) {
  const full = path.join(EXAM_DIR, f);
  let exam;
  try {
    exam = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    continue;
  }
  if (!isMathExam(exam)) continue;
  stats.mathExams += 1;

  const converted = transformExam(exam, f);
  if (converted > 0) {
    stats.filesChanged += 1;
    if (WRITE) fs.writeFileSync(full, JSON.stringify(exam));
  }
}

// ── Patch the source catalog too, so the prebuild split reproduces dropdowns ──
let catalogConverted = 0;
let catalogExams = 0;
if (fs.existsSync(CATALOG)) {
  try {
    const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
    if (Array.isArray(catalog)) {
      for (const exam of catalog) {
        if (!isMathExam(exam)) continue;
        const c = transformExam(exam, `[catalog] ${exam.exam_id || exam.id || ''}`);
        if (c > 0) catalogExams += 1;
        catalogConverted += c;
      }
      if (WRITE && catalogConverted > 0) fs.writeFileSync(CATALOG, JSON.stringify(catalog));
    }
  } catch (e) {
    console.error('WARN: could not patch exam_catalog.json:', e.message);
  }
}

console.log('='.repeat(64));
console.log(`DROPDOWN BLANK CONVERSION  ${WRITE ? '(APPLIED)' : '(dry-run — pass --write to apply)'}`);
console.log('='.repeat(64));
console.log(`Math exams scanned   : ${stats.mathExams}`);
console.log(`Files changed        : ${stats.filesChanged}`);
console.log(`Catalog exams patched: ${catalogExams} (${catalogConverted} blanks)`);
console.log(`Blanks -> dropdowns  : ${stats.blanksConverted}`);
console.log('By category:');
for (const [k, v] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(16)} ${v}`);
}
console.log('-'.repeat(64));
console.log('Samples:');
for (const s of samples) console.log('  ' + s);
console.log('='.repeat(64));
