/**
 * Guardrail: fail if any exam in public/exam_catalog.json is a multi-year
 * "mega-bundle" (its section titles span ≥2 distinct years, or its source PDF
 * name encodes a year range). Run after exam imports so bundled PDFs are caught
 * before they ship. De-bundle with `node scripts/debundle_exams.mjs --apply`.
 *
 *   node scripts/check_exam_bundles.mjs   # exits 1 if any bundle found
 */
import fs from 'fs';

const catalog = JSON.parse(fs.readFileSync('public/exam_catalog.json', 'utf8'));
const yearOf = (s) => {
  const m = String(s || '').match(/(20\d{2}|19\d{2})/g);
  return m ? m[m.length - 1] : null;
};

// A bundle = section titles spanning ≥2 distinct years. (Source-PDF range names
// aren't a reliable signal on their own — split children keep the parent's
// _source_file, so we only fail on real multi-year section spans.)
const offenders = [];
for (const e of catalog) {
  const years = [...new Set((e.sections || []).map((s) => yearOf(s.section_title)).filter(Boolean))];
  if (years.length >= 2) {
    offenders.push({ id: e.exam_id, subject: e.subject, level: e.level, years: years.length, src: e._source_file });
  }
}

if (offenders.length) {
  console.error(`✖ ${offenders.length} exam bundle(s) detected — split before shipping:`);
  offenders.forEach((o) => console.error(`  ${o.subject}/${o.level} ${o.id} — ${o.years} yrs${o.src ? ` (${o.src})` : ''}`));
  process.exit(1);
}
console.log('✔ no multi-year exam bundles');
