#!/usr/bin/env node
/**
 * fix_culture_exams.mjs
 *
 * Data migration script that fixes culture / non-math exam issues:
 *
 * 1. Re-types `calculation` questions in non-math subjects to `short_answer`
 *    so they never trigger MathKeyboard or ProofInput.
 *
 * 2. Deduplicates consecutive identical lines in section instructions
 *    and question text (e.g., repeated "Soyez clairs…").
 *
 * 3. Injects temporal context (dates/years) into time-sensitive culture
 *    questions that reference "dernières élections", "actuel président", etc.
 *    without specifying a date.
 *
 * Run:  node scripts/fix_culture_exams.mjs
 *       node scripts/fix_culture_exams.mjs --dry-run   # preview changes only
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(__dirname, '../public/exam_catalog.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// ── Math subjects (same as frontend MATH_SUBJECTS) ────────────────────────

const MATH_SUBJECTS = new Set([
  'Mathématiques', 'Physique', 'Chimie', 'SVT', 'Informatique',
]);

// ── Subject normalization (mirrors frontend normalizeSubject) ──────────────

function normalizeSubject(raw) {
  if (!raw) return raw;
  const s = raw.trim();
  const lower = s.toLowerCase();
  if (/math/i.test(lower)) return 'Mathématiques';
  if (/physi/i.test(lower)) return 'Physique';
  if (/chimi/i.test(lower)) return 'Chimie';
  if (/svt|biolog|science.*vie/i.test(lower)) return 'SVT';
  if (/info/i.test(lower)) return 'Informatique';
  if (/anglais|english/i.test(lower)) return 'Anglais';
  if (/espagnol|spanish|español/i.test(lower)) return 'Espagnol';
  if (/fran[çc]ais|french/i.test(lower)) return 'Français';
  if (/philo/i.test(lower)) return 'Philosophie';
  if (/histoire|history|géo|geo/i.test(lower)) return 'Histoire-Géo';
  if (/économi|econom|sci.*eco/i.test(lower)) return 'Économie';
  if (/sant[ée]|health|hygi/i.test(lower)) return 'Sciences de la Santé';
  if (/cr[eé][yòo]l|creole|kreyol/i.test(lower)) return 'Créole';
  if (/culture|civique|éducation/i.test(lower)) return 'Culture Générale';
  return s;
}

// ── Deduplicate consecutive identical lines ────────────────────────────────

function deduplicateLines(text) {
  if (!text) return text;
  const lines = text.split('\n');
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const prevTrimmed = i > 0 ? lines[i - 1].trim() : null;
    if (trimmed && trimmed === prevTrimmed) continue;
    result.push(lines[i]);
  }
  return result.join('\n');
}

// ── Temporal patterns: detect time-sensitive questions ─────────────────────

const TEMPORAL_PATTERNS = [
  { re: /derni[eè]res?\s+(élection|joute|compétition)/i, note: 'Réfère à un événement politique/sportif récent' },
  { re: /actuel\s+(président|premier\s*ministre|chef|dirigeant)/i, note: 'Réfère à un dirigeant actuel' },
  { re: /récemment|en\s+ce\s+moment|de\s+nos\s+jours/i, note: 'Réfère à une période récente' },
  { re: /dernier\s+(coupe|championnat|mondial|jeux)/i, note: 'Réfère à un événement sportif récent' },
];

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  if (!existsSync(CATALOG_PATH)) {
    console.error('Catalog not found at', CATALOG_PATH);
    process.exit(1);
  }

  const raw = readFileSync(CATALOG_PATH, 'utf-8');
  if (!raw.trim()) {
    console.error('Catalog is empty');
    process.exit(1);
  }

  const catalog = JSON.parse(raw);
  console.log(`Loaded catalog: ${catalog.length} exams\n`);

  let retypedCount = 0;
  let dedupedInstructions = 0;
  let dedupedQuestions = 0;
  let temporalCount = 0;

  for (let ei = 0; ei < catalog.length; ei++) {
    const exam = catalog[ei];
    const subject = normalizeSubject(exam.subject || '');
    const isMath = MATH_SUBJECTS.has(subject);

    for (let si = 0; si < (exam.sections || []).length; si++) {
      const section = exam.sections[si];

      // 1. Deduplicate section instructions
      if (section.instructions) {
        const cleaned = deduplicateLines(section.instructions);
        if (cleaned !== section.instructions) {
          if (!DRY_RUN) section.instructions = cleaned;
          dedupedInstructions++;
          console.log(`  [DEDUP-INSTR] Exam ${ei} Section ${si}: removed duplicate lines in instructions`);
        }
      }

      for (let qi = 0; qi < (section.questions || []).length; qi++) {
        const q = section.questions[qi];

        // 2. Re-type `calculation` to `short_answer` for non-math subjects
        if (!isMath && q.type === 'calculation') {
          if (!DRY_RUN) q.type = 'short_answer';
          retypedCount++;
          console.log(`  [RETYPE] Exam ${ei} Q${q.number || qi}: "${(q.question || '').slice(0, 60)}…" → short_answer`);
        }

        // 3. Deduplicate question text
        if (q.question) {
          const cleaned = deduplicateLines(q.question);
          if (cleaned !== q.question) {
            if (!DRY_RUN) q.question = cleaned;
            dedupedQuestions++;
            console.log(`  [DEDUP-Q] Exam ${ei} Q${q.number || qi}: removed duplicate lines in question text`);
          }
        }

        // 4. Add temporal_note for time-sensitive questions (if not already set)
        if (!isMath && !q.temporal_note) {
          const text = q.question || '';
          for (const pat of TEMPORAL_PATTERNS) {
            if (pat.re.test(text)) {
              const year = exam.year || exam.session || '';
              const note = `${pat.note}. Contexte de l'examen : ${year || 'date non précisée'}.`;
              if (!DRY_RUN) q.temporal_note = note;
              temporalCount++;
              console.log(`  [TEMPORAL] Exam ${ei} Q${q.number || qi}: added temporal note (${year})`);
              break;
            }
          }
        }

        // 5. Also handle sub_questions
        if (q.sub_questions) {
          for (let sqi = 0; sqi < q.sub_questions.length; sqi++) {
            const sq = q.sub_questions[sqi];
            if (!isMath && sq.type === 'calculation') {
              if (!DRY_RUN) sq.type = 'short_answer';
              retypedCount++;
            }
            if (sq.question) {
              const cleaned = deduplicateLines(sq.question);
              if (cleaned !== sq.question) {
                if (!DRY_RUN) sq.question = cleaned;
                dedupedQuestions++;
              }
            }
          }
        }
      }
    }
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`Re-typed to short_answer: ${retypedCount}`);
  console.log(`Deduplicated instructions: ${dedupedInstructions}`);
  console.log(`Deduplicated question text: ${dedupedQuestions}`);
  console.log(`Temporal notes added: ${temporalCount}`);

  if (DRY_RUN) {
    console.log('\n(DRY RUN — no changes written)');
  } else {
    console.log('\nWriting catalog…');
    writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
    console.log('Done ✓');
  }
}

main();
