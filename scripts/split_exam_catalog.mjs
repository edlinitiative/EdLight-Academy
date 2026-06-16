#!/usr/bin/env node
/**
 * Split the full exam catalog into per-exam files + regenerate the slim index.
 *
 * Why: `public/exam_catalog.json` (~27 MB) embeds every question of all ~494
 * exams. Today, opening a SINGLE exam (ExamTake / ExamResults) downloads and
 * parses the entire 27 MB blob — several minutes on a typical Haitian mobile
 * connection, and enough to freeze a low-end phone.
 *
 * This script produces:
 *   1. public/exams/<exam_id>.json   — one small file per exam (a few KB each)
 *   2. public/exam_catalog_index.json — slim browse index (no `sections`)
 *
 * The browser then fetches only the one exam it needs. The full catalog stays
 * in the repo for admin tooling (AnswerVerification) and as a fallback.
 *
 * Run:  node scripts/split_exam_catalog.mjs
 * (also runs automatically via the `prebuild` npm hook)
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'exam_catalog.json');
const EXAMS_DIR = path.join(ROOT, 'public', 'exams');
const INDEX_OUT = path.join(ROOT, 'public', 'exam_catalog_index.json');

// Mirror of QUESTION_TYPE_META gradable flags in src/utils/examUtils.ts
const GRADABLE_TYPES = new Set([
  'multiple_choice',
  'multiple_select',
  'true_false',
  'fill_blank',
  'calculation',
  'short_answer',
]);

// Heavy / server-only fields the browser never needs in the slim index.
const DROP_FIELDS = new Set(['sections', '_api_usage', '_source_file']);

/** Replicate buildExamIndex() counting logic so the index stays in sync. */
function countQuestions(exam) {
  let qCount = 0;
  let autoGradable = 0;
  const typeCounts = {};
  for (const sec of exam.sections || []) {
    for (const q of sec.questions || []) {
      qCount += 1;
      const t = q.type || 'unknown';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      const isGradable = GRADABLE_TYPES.has(t);
      const hasParts = Boolean(q.answer_parts);
      if ((isGradable && q.correct) || hasParts) autoGradable += 1;
    }
  }
  return { qCount, autoGradable, typeCounts };
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`ERROR: ${SRC} not found`);
    process.exit(1);
  }

  const raw = await readFile(SRC, 'utf8');
  const catalog = JSON.parse(raw);
  if (!Array.isArray(catalog)) {
    console.error('ERROR: expected a list/array catalog');
    process.exit(1);
  }

  // Fresh exams dir so deleted exams don't linger.
  if (existsSync(EXAMS_DIR)) await rm(EXAMS_DIR, { recursive: true, force: true });
  await mkdir(EXAMS_DIR, { recursive: true });

  const slim = [];
  const seen = new Set();
  let written = 0;
  let largestKb = 0;
  let largestId = '';
  let missingIds = 0;

  for (let i = 0; i < catalog.length; i++) {
    const exam = catalog[i];
    const { qCount, autoGradable, typeCounts } = countQuestions(exam);

    // Slim index entry (array order preserved for legacy numeric routes).
    const entry = {};
    for (const [k, v] of Object.entries(exam)) {
      if (!DROP_FIELDS.has(k)) entry[k] = v;
    }
    entry._questionCount = qCount;
    entry._autoGradable = autoGradable;
    entry._typeCounts = typeCounts;
    slim.push(entry);

    // Per-exam file keyed by exam_id (filename-safe UUID style).
    const id = exam.exam_id;
    if (!id) {
      missingIds += 1;
      continue;
    }
    if (seen.has(id)) {
      console.warn(`  WARN: duplicate exam_id "${id}" — later one overwrites earlier`);
    }
    seen.add(id);

    const json = JSON.stringify(exam);
    await writeFile(path.join(EXAMS_DIR, `${id}.json`), json, 'utf8');
    written += 1;

    const kb = Buffer.byteLength(json) / 1024;
    if (kb > largestKb) {
      largestKb = kb;
      largestId = id;
    }
  }

  await writeFile(INDEX_OUT, JSON.stringify(slim), 'utf8');

  const srcMb = Buffer.byteLength(raw) / 1024 / 1024;
  const idxKb = Buffer.byteLength(JSON.stringify(slim)) / 1024;
  console.log('✓ Split exam catalog');
  console.log(`  exams total:      ${catalog.length}`);
  console.log(`  per-exam files:   ${written}  ->  public/exams/`);
  if (missingIds) console.log(`  ⚠ missing exam_id: ${missingIds} (run scripts/ensure_exam_ids.mjs)`);
  console.log(`  largest exam:     ${largestKb.toFixed(0)} KB (${largestId})`);
  console.log(`  full catalog:     ${srcMb.toFixed(1)} MB`);
  console.log(`  browse index:     ${idxKb.toFixed(0)} KB  ->  public/exam_catalog_index.json`);
  console.log(`  → a student now downloads ~${largestKb.toFixed(0)} KB to open an exam instead of ${srcMb.toFixed(1)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
