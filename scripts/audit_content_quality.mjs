#!/usr/bin/env node
/**
 * audit_content_quality.mjs
 * -------------------------------------------------------------------------
 * READ-ONLY content-quality audit over public/exam_catalog.json.
 *
 * Unlike audit_exams.mjs (structural/contract checks) this scanner looks for
 * the *content* defects surfaced while fixing the SVT exam ex_0b166916:
 *
 *   1. ENGLISH_LABEL   - student-facing scaffold/answer-part labels written in
 *                        English inside a non-English exam (e.g. "Value of a",
 *                        "Completion of the sentence", "Figure of speech").
 *   2. LATEX_IN_LABEL  - labels carrying raw LaTeX / sub-superscript markup
 *                        ("Expression de U_n", "z^2 in exponential form") that
 *                        render as literal source to the student.
 *   3. CALC_AS_PROSE   - questions typed `calculation` whose answer is plain
 *                        prose (no number / formula) -> wrong badge + math pad.
 *   4. VACUOUS_HINT    - first hint that only restates the topic and gives no
 *                        actionable guidance.
 *   5. TOPIC_NOISE     - section headers / point-budgets leaked into the
 *                        `topics` metadata array ("GEOLOGIE", "BIOLOGIE : 50 pts").
 *   6. DOUBLE_ESCAPED  - double-escaped LaTeX (\\frac) left in rendered text.
 *
 * The script does NOT modify any data. It prints a summary and writes a
 * machine-readable report to artifacts/content_quality_audit.json.
 *
 * Usage:  node scripts/audit_content_quality.mjs [--subject "Mathématiques"]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CATALOG = path.join(ROOT, 'public', 'exam_catalog.json');
const OUT = path.join(ROOT, 'artifacts', 'content_quality_audit.json');

const argv = process.argv.slice(2);
const subjectFilter = (() => {
  const i = argv.indexOf('--subject');
  return i >= 0 ? argv[i + 1] : null;
})();

// --------------------------------------------------------------------------
// Detectors (mirrors of the validated Python heuristics)
// --------------------------------------------------------------------------

// Strong English signal: "<word> of <word>" is almost never valid French/Spanish/Kreyòl.
const ENGLISH_OF = /\b\w+ of \b/i;
// Curated English content tokens seen across Math/Chimie/Physique/SVT/Espagnol/Kreyòl/Art.
const ENGLISH_TOKENS =
  /\b(definition|formula|value|values|moles|isomer|isomerism|equation|reaction|reagent|yield|compound|mixture|synthesis|properties|molecular|empirical|sugar|cells?|linkage|karyotype|aneuploidy|trisomy|monosomy|colou?rblindness|balanced|the correct|general formula|coordinates|domain|variance|derivative|limit|expression for|necessity|importance|preservation|elements|lack|acknowledgement|statement|completion|meaning|figure of speech|opposite|name of|number of)\b/i;
// French/Spanish function words that, when present, usually mean the label is NOT English.
const ROMANCE_HINT =
  /\b(de|du|des|la|le|les|une?|et|pour|avec|selon|dans|sur|son|sa|ses|au|aux|el|los|las|en|por|para|con)\b/i;

function labelIsEnglish(lab) {
  if (typeof lab !== 'string' || lab.trim().length < 3) return false;
  if (ENGLISH_OF.test(lab)) return true; // rock-solid
  if (ENGLISH_TOKENS.test(lab)) {
    // If it also reads as Romance prose (and isn't an "X of Y"), treat as native.
    if (ROMANCE_HINT.test(lab) && !ENGLISH_OF.test(lab)) return false;
    return true;
  }
  return false;
}

// Labels are rendered as (near) plain text; raw LaTeX / markup leaks to the page.
const LATEX_IN_LABEL = /\$|\\[a-zA-Z]+|[_^]\{?\w/;

// Double-escaped LaTeX that survives into rendered prose.
const DOUBLE_ESCAPED = /\\\\(frac|sqrt|times|cdot|left|right|begin|end|text|mathrm|alpha|beta|pi|theta)\b/;

// Topic metadata that is really a leaked section header / point budget.
const TOPIC_NOISE =
  /(:\s*\d+\s*(pts?|points?|%))|^\s*(g[ée]ologie|biologie|iologie|chimie|physique|math[ée]matiques?|[ée]preuve|partie|section)\b.*\d|^[A-ZÀ-Ÿ\s:]{6,}\d/i;

function looksAllCapsHeader(s) {
  if (typeof s !== 'string') return false;
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 5) return false;
  return letters === letters.toUpperCase() && /[A-ZÀ-Ÿ]{5,}/.test(s);
}

// Vacuous hint templates (strict — validated to ~5 true positives).
const VACUOUS_HINT =
  /^(la|le|les|l['’])\s+[«"“][^»"”]+[»"”]\s+est\s+un\s+(concept|notion|terme|principe|[ée]l[ée]ment)\s+(cl[ée]|important|fondamental|essentiel)\b/i;

function repAnswer(q) {
  const cands = [];
  if (typeof q.answer === 'string') cands.push(q.answer);
  if (typeof q.correct_answer === 'string') cands.push(q.correct_answer);
  for (const p of q.answer_parts || []) if (p && typeof p.answer === 'string') cands.push(p.answer);
  for (const b of q.scaffold_blanks || []) if (b && typeof b.answer === 'string') cands.push(b.answer);
  return cands.join(' ').trim();
}

function isProseAnswer(s) {
  if (!s) return false;
  if (/\d/.test(s)) return false; // has a number -> plausibly a calculation
  if (/[=+\-×*/^√∑∫]|\\[a-zA-Z]+|\$/.test(s)) return false; // has math
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '').length;
  const words = s.split(/\s+/).filter(Boolean).length;
  return letters >= 15 && words >= 3;
}

// --------------------------------------------------------------------------
// Scan
// --------------------------------------------------------------------------
function* iterQuestions(exam) {
  for (const sec of exam.sections || []) {
    for (const q of sec.questions || []) yield [sec, q];
  }
}

function flatStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) flatStrings(x, out);
  return out;
}

const report = {
  generatedAt: new Date().toISOString(),
  catalog: path.relative(ROOT, CATALOG),
  totals: {},
  bySubject: {},
  issues: {
    ENGLISH_LABEL: { count: 0, exams: new Set(), samples: new Map() },
    LATEX_IN_LABEL: { count: 0, exams: new Set(), samples: new Map() },
    CALC_AS_PROSE: { count: 0, exams: new Set(), samples: new Map() },
    VACUOUS_HINT: { count: 0, exams: new Set(), samples: new Map() },
    TOPIC_NOISE: { count: 0, exams: new Set(), samples: new Map() },
    DOUBLE_ESCAPED: { count: 0, exams: new Set(), samples: new Map() },
  },
  examIndex: {}, // exam_id -> per-issue counts
};

function bump(issue, examId, subject, sample) {
  const it = report.issues[issue];
  it.count++;
  it.exams.add(examId);
  if (sample) it.samples.set(sample, (it.samples.get(sample) || 0) + 1);
  report.bySubject[subject] = report.bySubject[subject] || {};
  report.bySubject[subject][issue] = (report.bySubject[subject][issue] || 0) + 1;
  report.examIndex[examId] = report.examIndex[examId] || { subject, ...zeroCounts() };
  report.examIndex[examId][issue]++;
}
function zeroCounts() {
  return { ENGLISH_LABEL: 0, LATEX_IN_LABEL: 0, CALC_AS_PROSE: 0, VACUOUS_HINT: 0, TOPIC_NOISE: 0, DOUBLE_ESCAPED: 0 };
}

const data = JSON.parse(fs.readFileSync(CATALOG, 'utf-8'));
let examCount = 0;
let questionCount = 0;

for (const exam of data) {
  const subject = exam.subject || 'Inconnu';
  if (subjectFilter && subject !== subjectFilter) continue;
  examCount++;
  const examId = exam.exam_id;
  const isEnglishExam = subject === 'Anglais' || exam.language === 'en';

  // TOPIC_NOISE (exam-level metadata)
  for (const t of exam.topics || []) {
    if (typeof t !== 'string') continue;
    if (TOPIC_NOISE.test(t) || looksAllCapsHeader(t)) {
      bump('TOPIC_NOISE', examId, subject, t);
    }
  }

  for (const [, q] of iterQuestions(exam)) {
    questionCount++;

    // Labels (student-facing)
    for (const key of ['scaffold_blanks', 'answer_parts']) {
      for (const p of q[key] || []) {
        const lab = p && p.label;
        if (typeof lab !== 'string') continue;
        if (!isEnglishExam && labelIsEnglish(lab)) bump('ENGLISH_LABEL', examId, subject, lab);
        if (LATEX_IN_LABEL.test(lab)) bump('LATEX_IN_LABEL', examId, subject, lab);
      }
    }

    // CALC_AS_PROSE
    if (q.type === 'calculation') {
      const ans = repAnswer(q);
      if (isProseAnswer(ans)) bump('CALC_AS_PROSE', examId, subject, ans.slice(0, 80));
    }

    // VACUOUS_HINT (first hint only)
    const hints = flatStrings(q.hints);
    if (hints.length && VACUOUS_HINT.test(hints[0])) bump('VACUOUS_HINT', examId, subject, hints[0].slice(0, 90));

    // DOUBLE_ESCAPED across rendered text fields
    for (const f of ['question_text', 'scaffold_text', 'explanation']) {
      const v = q[f];
      if (typeof v === 'string' && DOUBLE_ESCAPED.test(v)) bump('DOUBLE_ESCAPED', examId, subject, v.slice(0, 80));
    }
  }
}

// --------------------------------------------------------------------------
// Serialize & print
// --------------------------------------------------------------------------
report.totals = {
  exams: examCount,
  questions: questionCount,
  ENGLISH_LABEL: report.issues.ENGLISH_LABEL.count,
  LATEX_IN_LABEL: report.issues.LATEX_IN_LABEL.count,
  CALC_AS_PROSE: report.issues.CALC_AS_PROSE.count,
  VACUOUS_HINT: report.issues.VACUOUS_HINT.count,
  TOPIC_NOISE: report.issues.TOPIC_NOISE.count,
  DOUBLE_ESCAPED: report.issues.DOUBLE_ESCAPED.count,
};

function serializeIssue(it) {
  return {
    count: it.count,
    exams: it.exams.size,
    topSamples: [...it.samples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([s, n]) => ({ sample: s, n })),
  };
}

const out = {
  generatedAt: report.generatedAt,
  catalog: report.catalog,
  totals: report.totals,
  bySubject: report.bySubject,
  issues: Object.fromEntries(Object.entries(report.issues).map(([k, v]) => [k, serializeIssue(v)])),
  worstExams: Object.entries(report.examIndex)
    .map(([id, c]) => ({ exam_id: id, subject: c.subject, total: Object.keys(zeroCounts()).reduce((s, k) => s + c[k], 0), ...c }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 40),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf-8');

// Console summary
const pad = (s, n) => String(s).padEnd(n);
console.log(`\nContent-quality audit  —  ${examCount} exams, ${questionCount} questions`);
if (subjectFilter) console.log(`(filtered to subject: ${subjectFilter})`);
console.log('─'.repeat(64));
for (const [k, v] of Object.entries(report.issues)) {
  console.log(`${pad(k, 16)} ${pad(v.count + ' occ', 12)} ${pad(v.exams.size + ' exams', 12)}`);
}
console.log('─'.repeat(64));
console.log('\nEnglish labels by subject (top 12):');
const eng = Object.entries(report.bySubject)
  .map(([s, c]) => [s, c.ENGLISH_LABEL || 0])
  .filter(([, n]) => n)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12);
for (const [s, n] of eng) console.log(`  ${pad(s, 22)} ${n}`);
console.log(`\nReport written to ${path.relative(ROOT, OUT)}`);
