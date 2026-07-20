/**
 * De-bundle multi-year exam "mega-bundles" in public/exam_catalog.json.
 *
 * Some source PDFs contained many years of past papers, which the extractor
 * merged into one exam (e.g. "Anglais 2011" = 24 sections spanning 2011–2023).
 * This splits each such bundle into one exam PER DISTINCT YEAR, grouping that
 * year's sections together — honest single-session papers ("Anglais · 2023").
 *
 * Safety:
 *  - Only splits bundles where ≥2 distinct years are parseable from the
 *    section titles (leaves ambiguous university bundles untouched).
 *  - Preserves the original exam_id on the child whose year matches the parent's
 *    declared `year` (else the most recent year), so existing Firestore
 *    examResults keyed by exam_id still resolve. Other children get fresh ids.
 *  - Writes a migration map (old id → [new ids]) for the record.
 *
 *   node scripts/debundle_exams.mjs           # dry-run (report only)
 *   node scripts/debundle_exams.mjs --apply   # rewrite the catalog
 */
import fs from 'fs';
import crypto from 'node:crypto';

const CATALOG = 'public/exam_catalog.json';
const MAP_OUT = 'scripts/debundle_migration_map.json';
const APPLY = process.argv.includes('--apply');

const yearOf = (s) => {
  const m = String(s || '').match(/(20\d{2}|19\d{2})/g);
  return m ? m[m.length - 1] : null;
};

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

const out = [];
const migration = {};
let bundlesSplit = 0;
let newExams = 0;
const report = [];

for (const exam of catalog) {
  const secs = Array.isArray(exam.sections) ? exam.sections : [];
  const years = [...new Set(secs.map((s) => yearOf(s.section_title)).filter(Boolean))];

  // Not a splittable bundle → keep as-is.
  if (years.length < 2) {
    out.push(exam);
    continue;
  }

  // Group sections by their year.
  const byYear = new Map();
  for (const s of secs) {
    const y = yearOf(s.section_title) || exam.year || 'inconnu';
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(s);
  }

  const sortedYears = [...byYear.keys()].sort((a, b) => Number(b) - Number(a)); // newest first
  // Child that keeps the original id: the one matching the parent's declared year, else newest.
  const keepYear = byYear.has(String(exam.year)) ? String(exam.year) : sortedYears[0];

  const childIds = [];
  for (const y of sortedYears) {
    const ysecs = byYear.get(y);
    const id = y === keepYear ? exam.exam_id : `ex_${crypto.randomUUID()}`;
    childIds.push(id);
    const totalQ = ysecs.reduce((n, s) => n + (Array.isArray(s.questions) ? s.questions.length : 0), 0);
    out.push({
      ...exam,
      exam_id: id,
      year: y,
      sections: ysecs,
      // Keep total_points proportional-ish if present isn't reliable; recompute nothing risky.
      _debundled_from: exam.exam_id,
      _debundled_year: y,
    });
    newExams++;
  }

  migration[exam.exam_id] = childIds;
  bundlesSplit++;
  report.push(`  ${exam.subject}/${exam.level} "${exam.exam_id}" (${secs.length} sec, ${years.length} yrs) → ${sortedYears.length} exams: ${sortedYears.join(', ')} | keeps orig id on ${keepYear}`);
}

console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`catalog: ${catalog.length} exams → ${out.length} exams`);
console.log(`bundles split: ${bundlesSplit} → ${newExams} single-year exams`);
console.log('plan:');
report.forEach((r) => console.log(r));

if (APPLY) {
  fs.writeFileSync(CATALOG, JSON.stringify(out));
  fs.writeFileSync(MAP_OUT, JSON.stringify(migration, null, 2));
  console.log(`\n✔ wrote ${CATALOG} and ${MAP_OUT}`);
  console.log('Next: run `npm run split:exams` (or prebuild) to regenerate public/exams/*.json + index.');
} else {
  console.log('\nDRY-RUN — no files written. Re-run with --apply to write.');
}
