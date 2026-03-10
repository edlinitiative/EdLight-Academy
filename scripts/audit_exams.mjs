#!/usr/bin/env node
/**
 * audit_exams.mjs
 * ───────────────
 * Read-only audit of public/exam_catalog.json against the frontend contract
 * defined in src/utils/examUtils.js (QUESTION_TYPE_META, checkAnswer, gradeSingleQuestion).
 *
 * Usage:
 *   node scripts/audit_exams.mjs
 *   node scripts/audit_exams.mjs --out artifacts/exam_pipeline/123/audit_before
 *   node scripts/audit_exams.mjs --out artifacts/exam_pipeline/123/audit_after
 *
 * Exit codes:
 *   0 = audit passed (no critical issues)
 *   1 = critical issues found (breaks rendering / grading in the app)
 *   2 = catalog could not be read or parsed
 *
 * Output files (written when --out <prefix> is given):
 *   <prefix>.json  — machine-readable report (all issues per exam)
 *   <prefix>.md    — human-readable Markdown report for PR review
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.resolve(__dirname, '..', 'public', 'exam_catalog.json');

// ─── Frontend contract constants (src/utils/examUtils.js) ──────────────────

/** Valid level values (see LEVEL_MAP in examUtils.js) */
const VALID_LEVELS = new Set(['baccalaureat', '9eme_af', 'universite']);

/** Valid track codes (see VALID_TRACKS in add_tracks_to_exams.js + trackConfig) */
const VALID_TRACKS = new Set(['SVT', 'SMP', 'SES', 'LET', 'ARTS', 'ALL']);

/** Recognized question types (see QUESTION_TYPE_META in examUtils.js) */
const KNOWN_TYPES = new Set([
  'multiple_choice',
  'multiple_select',
  'true_false',
  'fill_blank',
  'calculation',
  'short_answer',
  'essay',
  'matching',
  'unknown',
]);

/** Types the app can auto-grade without AI (meta.gradable === true) */
const GRADABLE_TYPES = new Set([
  'multiple_choice',
  'multiple_select',
  'true_false',
  'fill_blank',
  'calculation',
  'short_answer',
]);

/** Accepted values for true_false `correct` field (checkAnswer in examUtils.js) */
const TRUE_FALSE_VALUES = new Set(['vrai', 'faux', 'true', 'false', 'v', 'f']);

// ─── Helpers ────────────────────────────────────────────────────────────────

function isNonEmpty(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function countPlaceholders(text) {
  // scaffold_text uses {{0}}, {{1}}, … placeholders
  return (text.match(/\{\{\d+\}\}/g) || []).length;
}

// ─── Per-exam audit ──────────────────────────────────────────────────────────

/**
 * Audit a single exam and return an array of issue objects.
 * Each issue has { severity: 'critical'|'warning'|'info', code, msg, ...context }.
 *
 * Severity guide:
 *   critical — breaks rendering, deep-linking, filtering, or grading in the app
 *   warning  — reduces auto-grading coverage or is technically incorrect data
 *   info     — missing nice-to-have fields (year, null titles, etc.)
 */
function auditExam(exam) {
  const issues = [];
  const crit = (code, msg, ctx = {}) => issues.push({ severity: 'critical', code, msg, ...ctx });
  const warn = (code, msg, ctx = {}) => issues.push({ severity: 'warning',  code, msg, ...ctx });
  const info = (code, msg, ctx = {}) => issues.push({ severity: 'info',     code, msg, ...ctx });

  // ── Exam-level ────────────────────────────────────────────────────────────

  if (!isNonEmpty(exam.exam_id)) {
    crit('MISSING_EXAM_ID', 'exam_id is missing or empty — breaks deep links and attempt tracking');
  }

  if (!isNonEmpty(exam.level)) {
    warn('MISSING_LEVEL', 'level field is missing — exam will not appear in level filters');
  } else if (!VALID_LEVELS.has(exam.level.toLowerCase())) {
    crit('INVALID_LEVEL', `level "${exam.level}" is not one of: ${[...VALID_LEVELS].join(', ')}`);
  }

  if (!isNonEmpty(exam.subject)) {
    warn('MISSING_SUBJECT', 'subject field is missing — exam will not appear in subject filters');
  }

  if (!exam.year) {
    info('MISSING_YEAR', 'year field is missing');
  }

  if (!exam.exam_title) {
    warn('MISSING_TITLE', 'exam_title is missing — catalog card will render blank');
  }

  if (!exam.tracks) {
    warn('MISSING_TRACKS', 'tracks field is missing (will default to ["ALL"] at runtime, but should be explicit)');
  } else if (!Array.isArray(exam.tracks) || exam.tracks.length === 0) {
    warn('INVALID_TRACKS', 'tracks must be a non-empty array');
  } else {
    const badTracks = exam.tracks.filter((t) => !VALID_TRACKS.has(t));
    if (badTracks.length > 0) {
      warn('UNKNOWN_TRACKS', `unknown track codes: ${badTracks.join(', ')} — these will be ignored by the track filter`);
    }
  }

  const sections = exam.sections;
  if (!Array.isArray(sections) || sections.length === 0) {
    crit('NO_SECTIONS', 'exam has no sections array — will render as empty');
    return issues; // No point checking questions
  }

  // ── Section + question level ───────────────────────────────────────────────

  let totalQuestions = 0;

  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si];
    const secLabel = sec.section_title ? `"${sec.section_title}"` : `section[${si}]`;

    if (!isNonEmpty(sec.section_title)) {
      info('NULL_SECTION_TITLE', `${secLabel}: section title is null/empty`, { section: si });
    }

    const instr = (sec.instructions || '').trim();
    if (!instr) {
      info('MISSING_INSTRUCTIONS', `${secLabel}: has no instructions — students won't see directions for this section`, { section: si });
    }

    const questions = sec.questions || [];
    if (questions.length === 0) {
      warn('EMPTY_SECTION', `${secLabel}: has no questions`, { section: si });
      continue;
    }

    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi];
      totalQuestions++;
      const loc = `§${si} q${qi}`;

      // ── Type checks ──────────────────────────────────────────────────────

      if (q.type == null) {
        crit('NULL_TYPE', `${loc}: type is null — question cannot be rendered or graded`, { section: si, question: qi });
        continue; // Rest of checks depend on type
      }

      if (!KNOWN_TYPES.has(q.type)) {
        crit('UNKNOWN_TYPE', `${loc}: type "${q.type}" is not a recognized question type`, {
          section: si, question: qi, type: q.type,
        });
        continue;
      }

      // ── Multiple choice ───────────────────────────────────────────────────

      if (q.type === 'multiple_choice') {
        if (!q.options || typeof q.options !== 'object' || Array.isArray(q.options)) {
          crit('MCQ_NO_OPTIONS', `${loc}: MCQ is missing an options object — cannot render answer choices`, {
            section: si, question: qi,
          });
        } else {
          const optionKeys = new Set(Object.keys(q.options).map((k) => k.toLowerCase()));
          if (!q.correct) {
            if (q.manual_reason) {
              info('MCQ_NO_CORRECT', `${loc}: MCQ has no correct answer (manual_reason: ${q.manual_reason.slice(0, 80)})`, {
                section: si, question: qi, manual_reason: q.manual_reason,
              });
            } else {
              warn('MCQ_NO_CORRECT', `${loc}: MCQ has no correct answer — will fall back to manual grading`, {
                section: si, question: qi,
              });
            }
          } else if (typeof q.correct !== 'string') {
            warn('MCQ_CORRECT_NOT_STRING', `${loc}: correct is ${typeof q.correct} (expected string key like "a", "b")`, {
              section: si, question: qi, correct: q.correct,
            });
          } else if (!optionKeys.has(q.correct.toLowerCase().trim())) {
            warn('MCQ_CORRECT_NOT_KEY', `${loc}: correct "${q.correct}" is not a key in options [${[...optionKeys].join(', ')}] — likely an answer text instead of key`, {
              section: si, question: qi, correct: q.correct, optionKeys: [...optionKeys],
            });
          }
        }
      }

      // ── Multiple select ───────────────────────────────────────────────────

      if (q.type === 'multiple_select') {
        if (!q.options || typeof q.options !== 'object' || Array.isArray(q.options)) {
          crit('MULTI_SELECT_NO_OPTIONS', `${loc}: multiple_select is missing an options object`, {
            section: si, question: qi,
          });
        }
        if (!q.correct_keys && !q.correct) {
          warn('MULTI_SELECT_NO_CORRECT', `${loc}: multiple_select has no correct_keys or correct — manual grading only`, {
            section: si, question: qi,
          });
        }
      }

      // ── True / false ──────────────────────────────────────────────────────

      if (q.type === 'true_false') {
        if (!q.correct) {
          if (q.manual_reason) {
            info('TF_NO_CORRECT', `${loc}: true_false has no correct answer (manual_reason: ${q.manual_reason.slice(0, 80)})`, {
              section: si, question: qi, manual_reason: q.manual_reason,
            });
          } else {
            warn('TF_NO_CORRECT', `${loc}: true_false has no correct answer — manual grading only`, {
              section: si, question: qi,
            });
          }
        } else if (typeof q.correct !== 'string') {
          warn('TF_INVALID_CORRECT', `${loc}: true_false correct is ${typeof q.correct} (expected string vrai/faux)`, {
            section: si, question: qi, correct: q.correct,
          });
        } else if (!TRUE_FALSE_VALUES.has(q.correct.toLowerCase().trim())) {
          warn('TF_INVALID_CORRECT', `${loc}: true_false correct "${q.correct}" not in [vrai/faux/true/false/v/f]`, {
            section: si, question: qi, correct: q.correct,
          });
        }
      }

      // ── Open-ended (fill_blank / calculation / short_answer) ──────────────

      if (['fill_blank', 'calculation', 'short_answer'].includes(q.type)) {
        // correct can be a string OR a dict of sub-answers (multi-part questions)
        const hasCorrect = isNonEmpty(q.correct) || (q.correct != null && typeof q.correct === 'object');
        const hasAnswerParts = Array.isArray(q.answer_parts) && q.answer_parts.length > 0;
        const hasFinalAnswer = isNonEmpty(q.final_answer);
        if (!hasCorrect && !hasAnswerParts && !hasFinalAnswer) {
          const emitter = q.manual_reason ? info : warn;
          emitter('OPEN_NO_CORRECT', `${loc}: ${q.type} has no correct/answer_parts/final_answer${q.manual_reason ? ` (manual_reason: ${q.manual_reason.slice(0,80)})` : ' — manual grading only'}`, {
            section: si, question: qi,
          });
        }
      }

      // ── Scaffold consistency ───────────────────────────────────────────────
      // scaffold_text placeholders ({{0}}, {{1}}) must match scaffold_blanks count

      if (q.scaffold_text) {
        const placeholderCount = countPlaceholders(q.scaffold_text);
        const blanksCount = Array.isArray(q.scaffold_blanks) ? q.scaffold_blanks.length : 0;
        const partsCount = Array.isArray(q.answer_parts) ? q.answer_parts.length : 0;

        if (placeholderCount > 0 && blanksCount === 0) {
          warn('SCAFFOLD_NO_BLANKS', `${loc}: scaffold_text has ${placeholderCount} placeholder(s) but scaffold_blanks is empty`, {
            section: si, question: qi, placeholders: placeholderCount,
          });
        } else if (placeholderCount > 0 && blanksCount !== placeholderCount) {
          warn('SCAFFOLD_COUNT_MISMATCH', `${loc}: scaffold_text has ${placeholderCount} placeholder(s) but scaffold_blanks has ${blanksCount} entries`, {
            section: si, question: qi, placeholders: placeholderCount, blanks: blanksCount,
          });
        }

        if (blanksCount > 0 && partsCount === 0) {
          info('SCAFFOLD_NO_ANSWER_PARTS', `${loc}: has scaffold_blanks but no answer_parts — grading will fall back to scaffold-complete (full credit for any filled attempt)`, {
            section: si, question: qi,
          });
        }
      }
    }
  }

  if (totalQuestions === 0) {
    crit('NO_QUESTIONS', 'exam has sections but no questions in any of them');
  }

  return issues;
}

// ─── Aggregate stats ─────────────────────────────────────────────────────────

function buildStats(exams, allIssues) {
  let totalQuestions = 0;
  let autoGradable = 0;
  const typeCounts = {};
  const levelCounts = {};
  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let examsWithIssues = 0;
  const critByCode = {};
  const warnByCode = {};

  for (const { exam, issues } of allIssues) {
    levelCounts[exam.level || '(unknown)'] = (levelCounts[exam.level || '(unknown)'] || 0) + 1;

    if (issues.length > 0) examsWithIssues++;

    for (const iss of issues) {
      if (iss.severity === 'critical') {
        criticalCount++;
        critByCode[iss.code] = (critByCode[iss.code] || 0) + 1;
      } else if (iss.severity === 'warning') {
        warningCount++;
        warnByCode[iss.code] = (warnByCode[iss.code] || 0) + 1;
      } else {
        infoCount++;
      }
    }

    for (const sec of exam.sections || []) {
      for (const q of sec.questions || []) {
        totalQuestions++;
        const t = q.type || 'unknown';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
        // Auto-gradable = recognized gradable type + has any grading data
        if (GRADABLE_TYPES.has(t)) {
          const hasGradingData =
            isNonEmpty(q.correct) ||
            (Array.isArray(q.answer_parts) && q.answer_parts.length > 0) ||
            isNonEmpty(q.final_answer);
          if (hasGradingData) autoGradable++;
        }
      }
    }
  }

  return {
    totalExams: exams.length,
    examsWithIssues,
    totalQuestions,
    autoGradable,
    autoGradablePct: totalQuestions > 0 ? Math.round((autoGradable / totalQuestions) * 100) : 0,
    typeCounts,
    levelCounts,
    criticalCount,
    warningCount,
    infoCount,
    critByCode,
    warnByCode,
  };
}

// ─── Markdown report renderer ─────────────────────────────────────────────────

function renderMarkdown(stats, allIssues, timestamp) {
  const lines = [];

  lines.push(`# 📋 Exam Catalog Audit Report`);
  lines.push(`**Generated:** ${timestamp}`);
  lines.push(`**Catalog:** \`public/exam_catalog.json\``);
  lines.push(``);

  lines.push(`## Summary`);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total exams | ${stats.totalExams} |`);
  lines.push(`| Exams with issues | ${stats.examsWithIssues} |`);
  lines.push(`| Total questions | ${stats.totalQuestions} |`);
  lines.push(`| Auto-gradable questions | **${stats.autoGradable} (${stats.autoGradablePct}%)** |`);
  lines.push(`| 🔴 Critical issues | **${stats.criticalCount}** |`);
  lines.push(`| 🟡 Warnings | ${stats.warningCount} |`);
  lines.push(`| ℹ️ Info | ${stats.infoCount} |`);
  lines.push(``);

  if (stats.criticalCount === 0 && stats.warningCount === 0) {
    lines.push(`## ✅ All Clear`);
    lines.push(`No critical issues or warnings found. The catalog is ready for deploy.`);
    lines.push(``);
  } else {
    // Critical
    lines.push(`## 🔴 Critical Issues (${stats.criticalCount})`);
    if (stats.criticalCount === 0) {
      lines.push(`_None._`);
    } else {
      lines.push(`> These **will break** rendering, deep-linking, filtering, or grading in the app.`);
      lines.push(`> All critical issues must be resolved before deploying.`);
      lines.push(``);
      for (const [code, count] of Object.entries(stats.critByCode).sort((a, b) => b[1] - a[1])) {
        lines.push(`### \`${code}\` — ${count} occurrence${count !== 1 ? 's' : ''}`);
        const examples = allIssues
          .filter(({ issues }) => issues.some((i) => i.code === code && i.severity === 'critical'))
          .slice(0, 6);
        for (const { exam, issues } of examples) {
          const iss = issues.find((i) => i.code === code && i.severity === 'critical');
          const id = exam.exam_id || `idx:${exam._idx}`;
          lines.push(`- **${id}** \`${exam.level || '?'}\` ${exam.year || ''} *${(exam.subject || '').slice(0, 30)}*: ${iss.msg}`);
        }
        if (count > 6) lines.push(`- _…and ${count - 6} more_`);
        lines.push(``);
      }
    }

    // Warnings
    lines.push(`## 🟡 Warnings (${stats.warningCount})`);
    if (stats.warningCount === 0) {
      lines.push(`_None._`);
    } else {
      lines.push(`> These reduce auto-grading coverage or reflect technically incorrect data.`);
      lines.push(`> Fix before the next release.`);
      lines.push(``);
      for (const [code, count] of Object.entries(stats.warnByCode).sort((a, b) => b[1] - a[1])) {
        lines.push(`### \`${code}\` — ${count} occurrence${count !== 1 ? 's' : ''}`);
        const examples = allIssues
          .filter(({ issues }) => issues.some((i) => i.code === code && i.severity === 'warning'))
          .slice(0, 6);
        for (const { exam, issues } of examples) {
          const iss = issues.find((i) => i.code === code && i.severity === 'warning');
          const id = exam.exam_id || `idx:${exam._idx}`;
          lines.push(`- **${id}** \`${exam.level || '?'}\` ${exam.year || ''} *${(exam.subject || '').slice(0, 30)}*: ${iss.msg}`);
        }
        if (count > 6) lines.push(`- _…and ${count - 6} more_`);
        lines.push(``);
      }
    }
  }

  lines.push(`## Question Types Distribution`);
  lines.push(`| Type | Count |`);
  lines.push(`|------|------:|`);
  for (const [t, n] of Object.entries(stats.typeCounts).sort((a, b) => b[1] - a[1])) {
    const gradable = GRADABLE_TYPES.has(t) ? ' ✅' : '';
    lines.push(`| \`${t}\`${gradable} | ${n} |`);
  }
  lines.push(`_✅ = auto-gradable type (still needs correct answer set to actually auto-grade)_`);
  lines.push(``);

  lines.push(`## Exams by Level`);
  for (const [level, count] of Object.entries(stats.levelCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${level}**: ${count}`);
  }
  lines.push(``);

  return lines.join('\n');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPrefix = outIdx >= 0 ? args[outIdx + 1] : null;

  // Read catalog
  let raw;
  try {
    raw = await readFile(CATALOG_PATH, 'utf8');
  } catch (e) {
    console.error(`❌ Could not read ${CATALOG_PATH}: ${e.message}`);
    process.exit(2);
  }

  let exams;
  try {
    exams = JSON.parse(raw);
  } catch (e) {
    console.error(`❌ Could not parse exam_catalog.json as JSON: ${e.message}`);
    process.exit(2);
  }

  if (!Array.isArray(exams)) {
    console.error(`❌ exam_catalog.json root must be a JSON array, got: ${typeof exams}`);
    process.exit(2);
  }

  console.log(`📚 Loaded ${exams.length} exams`);

  // Run audits
  const allIssues = exams.map((exam, idx) => ({
    exam: { ...exam, _idx: idx },
    issues: auditExam({ ...exam, _idx: idx }),
  }));

  const timestamp = new Date().toISOString();
  const stats = buildStats(exams, allIssues);

  // Console output
  console.log(`\n── Audit Results ────────────────────────────────────`);
  console.log(`  📊 Total questions:    ${stats.totalQuestions}`);
  console.log(`  ✅ Auto-gradable:      ${stats.autoGradable} (${stats.autoGradablePct}%)`);
  console.log(`  🔴 Critical issues:    ${stats.criticalCount}`);
  console.log(`  🟡 Warnings:           ${stats.warningCount}`);
  console.log(`  ℹ️  Info:               ${stats.infoCount}`);
  console.log(`  📁 Exams with issues:  ${stats.examsWithIssues} / ${stats.totalExams}`);

  if (stats.criticalCount > 0) {
    console.log(`\n  Top critical issue codes:`);
    for (const [code, count] of Object.entries(stats.critByCode).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`    ${code.padEnd(30)} ${count}`);
    }
  }
  if (stats.warningCount > 0) {
    console.log(`\n  Top warning codes:`);
    for (const [code, count] of Object.entries(stats.warnByCode).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`    ${code.padEnd(30)} ${count}`);
    }
  }

  // Write report files if --out is given
  if (outPrefix) {
    const dir = path.dirname(outPrefix);
    await mkdir(dir, { recursive: true });

    const jsonReport = {
      timestamp,
      stats,
      issues: allIssues
        .filter(({ issues }) => issues.length > 0)
        .map(({ exam, issues }) => ({
          exam_id: exam.exam_id || null,
          exam_title: exam.exam_title || null,
          level: exam.level || null,
          subject: exam.subject || null,
          year: exam.year || null,
          _idx: exam._idx,
          issues,
        })),
    };

    const mdReport = renderMarkdown(stats, allIssues, timestamp);

    await writeFile(`${outPrefix}.json`, JSON.stringify(jsonReport, null, 2) + '\n', 'utf8');
    await writeFile(`${outPrefix}.md`, mdReport, 'utf8');
    console.log(`\n💾 Reports saved:`);
    console.log(`   ${outPrefix}.json`);
    console.log(`   ${outPrefix}.md`);
  }

  console.log('');
  if (stats.criticalCount > 0) {
    console.log(`❌ Audit FAILED — ${stats.criticalCount} critical issue(s) must be fixed.`);
    process.exit(1);
  } else {
    console.log(`✅ Audit PASSED — no critical issues.`);
    process.exit(0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
