import { readFile, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const CATALOG_PATH = path.resolve(process.cwd(), 'public', 'exam_catalog.json');

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function newExamId(existing) {
  // Stable once written. Prefix keeps it recognizable.
  let id;
  do {
    id = `ex_${crypto.randomUUID()}`;
  } while (existing.has(id));
  return id;
}

async function main() {
  const raw = await readFile(CATALOG_PATH, 'utf8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error('exam_catalog.json must be a JSON array of exam objects');
  }

  const existing = new Set();
  for (const exam of data) {
    if (isNonEmptyString(exam?.exam_id)) existing.add(exam.exam_id.trim());
  }

  let changed = 0;
  for (const exam of data) {
    if (!isNonEmptyString(exam?.exam_id)) {
      exam.exam_id = newExamId(existing);
      existing.add(exam.exam_id);
      changed++;
    }
  }

  if (changed === 0) {
    console.log('No changes: all exams already have exam_id');
    return;
  }

  await writeFile(CATALOG_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Stamped exam_id for ${changed} exam(s). Updated: ${CATALOG_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
