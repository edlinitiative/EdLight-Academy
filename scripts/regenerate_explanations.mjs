#!/usr/bin/env node
/**
 * regenerate_explanations.mjs
 *
 * Regenerates model_answer / answer_parts / approaches for questions in
 * non-math subjects so that all explanatory text is in FRENCH.
 *
 * This script specifically targets exams whose explanations may have been
 * generated in the wrong language (English, Spanish, Kreyòl) and regenerates
 * them with a French-only prompt.
 *
 * It also enriches the `alternatives` array for short text answers with
 * partial forms, accent-less variants, and individual significant words.
 *
 * Usage:
 *   node scripts/regenerate_explanations.mjs                  # process all non-math subjects
 *   node scripts/regenerate_explanations.mjs --dry-run        # count questions only
 *   node scripts/regenerate_explanations.mjs --subjects "Anglais,Espagnol"  # specific subjects
 *   node scripts/regenerate_explanations.mjs --limit 50       # cap at N questions
 *   node scripts/regenerate_explanations.mjs --resume         # resume from checkpoint
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(__dirname, '../public/exam_catalog.json');
const CHECKPOINT_PATH = resolve(__dirname, '../.regen_checkpoint.json');
const GEMINI_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBA4NHDVyIbnGt7iVfPUJHi7jNMV2Maqbc';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

const BATCH_SIZE = 4;
const CONCURRENCY = 3;
const RETRY_LIMIT = 3;
const DELAY_BETWEEN_BATCHES = 500;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');

// Parse --subjects "Anglais,Espagnol"
let TARGET_SUBJECTS = null;
const subjIdx = args.indexOf('--subjects');
if (subjIdx !== -1 && args[subjIdx + 1]) {
  TARGET_SUBJECTS = new Set(args[subjIdx + 1].split(',').map(s => s.trim()));
}

// Parse --limit N
let LIMIT = Infinity;
const limIdx = args.indexOf('--limit');
if (limIdx !== -1 && args[limIdx + 1]) {
  LIMIT = parseInt(args[limIdx + 1], 10);
}

const MATH_SUBJECTS = new Set([
  'Mathématiques', 'Physique', 'Chimie', 'SVT', 'Informatique',
]);

function normalizeSubject(raw) {
  if (!raw) return raw;
  const lower = raw.trim().toLowerCase();
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
  return raw.trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function repairJSON(text) {
  const validEscapes = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
  let result = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) {
      if (validEscapes.has(text[i + 1])) {
        result += text[i] + text[i + 1];
        i++;
      } else {
        result += '\\\\' + text[i + 1];
        i++;
      }
    } else {
      result += text[i];
    }
  }
  return result;
}

/**
 * Detect if explanation text contains non-French content.
 * Returns true if the text appears to be in English/Spanish/Kreyòl.
 */
function hasNonFrenchExplanation(q) {
  const text = (q.model_answer || '') + ' ' + (q.explanation || '');
  if (!text.trim()) return false;
  // Simple heuristic: check for common English/Spanish markers
  const enMarkers = /\b(therefore|because|since|however|the answer is|this means|we can see|note that|recall that|step \d|first,|next,|finally,|thus,|hence)\b/i;
  const esMarkers = /\b(por lo tanto|porque|entonces|sin embargo|la respuesta es|esto significa|podemos ver|recuerde que)\b/i;
  return enMarkers.test(text) || esMarkers.test(text);
}

async function callGemini(prompt) {
  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    try {
      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429) {
          console.log(`    Rate limited, waiting ${(attempt + 1) * 5}s…`);
          await sleep((attempt + 1) * 5000);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found in response');

      return JSON.parse(repairJSON(jsonMatch[0]));
    } catch (err) {
      if (attempt === RETRY_LIMIT - 1) throw err;
      await sleep(1000 * (attempt + 1));
    }
  }
}

function buildPrompt(questions) {
  const qList = questions.map((q, i) => {
    let desc = `Q${i + 1} [${q.type || '?'}]`;
    if (q._subject) desc += ` (${q._subject})`;
    desc += `:\n  ${(q.question || '').slice(0, 600)}\n`;
    if (q.options && typeof q.options === 'object') {
      const opts = Object.entries(q.options).map(([k, v]) => `${k}) ${v}`).join('  ');
      desc += `  Options: ${opts}\n`;
    }
    if (q.correct) desc += `  Correct: ${q.correct}\n`;
    if (q.model_answer) desc += `  Previous answer (may be in wrong language): ${q.model_answer.slice(0, 300)}\n`;
    return desc;
  }).join('\n');

  return `You are an expert teacher creating an answer key for Haitian baccalauréat exams.

For EACH question below, provide the ACTUAL CORRECT ANSWER with full worked solution.

CRITICAL RULES:
1. ALWAYS write ALL output in FRENCH — model_answer, approaches, and all explanatory text MUST be in French. The students are Haitian and French is their language of instruction, even for English, Spanish, or Kreyòl exams.
2. For math/economics calculations: Show the complete computation. Use LaTeX ($...$) for math.
3. For short_answer: Provide a complete, correct answer.
4. For multiple_choice: Give the correct option letter AND explain why (in French).
5. For true_false: Give "Vrai" or "Faux" with justification (in French).
6. For essay: Provide a complete model essay in French (300-500 words).
7. For questions with sub-parts (a, b, c, d): Solve EACH sub-part separately.
8. For short text answers (names, places, terms): include ALL plausible alternative forms in the "alternatives" array — partial answers (e.g., last name only when full name is expected), accent-less variants, common misspellings, and equivalent expressions. For multi-word answers, include each significant word (≥3 letters) individually as an alternative.

IMPORTANT: Identify the 2-4 KEY ANSWER FRAGMENTS that are the critical results a student must provide.

Return a JSON array with exactly ${questions.length} objects, one per question, in order:
[
  {
    "model_answer": "Full worked solution in FRENCH (may include LaTeX, use \\n for newlines)",
    "answer_parts": [
      {
        "label": "Short description of this answer fragment",
        "answer": "The exact correct value/expression",
        "alternatives": ["Other acceptable forms", "Partial answer", "Accent-less variant"]
      }
    ],
    "approaches": [
      {
        "name": "Nom de l'approche",
        "steps": ["Étape 1", "Étape 2"]
      }
    ],
    "final_answer": "The single most important final result (short)"
  }
]

Questions:
${qList}

Return ONLY valid JSON. No markdown, no code blocks.`;
}

function buildScaffoldFromAnswer(modelAnswer, answerParts) {
  if (!answerParts || answerParts.length === 0) {
    return { scaffold_text: null, scaffold_blanks: null };
  }
  let scaffoldText = modelAnswer || '';
  const blanks = [];
  for (let i = 0; i < answerParts.length; i++) {
    const part = answerParts[i];
    const placeholder = `{{${i}}}`;
    const answer = part.answer || '';
    if (answer && scaffoldText.includes(answer)) {
      scaffoldText = scaffoldText.replace(answer, placeholder);
    } else {
      scaffoldText += `\n\n${part.label || 'Résultat ' + (i + 1)} : ${placeholder}`;
    }
    blanks.push({
      label: part.label || `Partie ${i + 1}`,
      answer: answer,
      alternatives: part.alternatives || [],
    });
  }
  return { scaffold_text: scaffoldText, scaffold_blanks: blanks };
}

async function processBatch(batch, batchIndex) {
  try {
    const prompt = buildPrompt(batch);
    const results = await callGemini(prompt);
    if (!Array.isArray(results) || results.length !== batch.length) {
      console.log(`  Batch ${batchIndex}: Got ${Array.isArray(results) ? results.length : 'non-array'} results for ${batch.length} questions`);
      if (!Array.isArray(results)) return batch.map(() => null);
    }
    return results;
  } catch (err) {
    console.log(`  Batch ${batchIndex} FAILED: ${err.message.slice(0, 150)}`);
    return batch.map(() => null);
  }
}

async function main() {
  console.log('Loading catalog…');
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));

  // Collect questions that need regeneration
  const toRegenerate = [];
  const subjectCounts = {};

  for (let ei = 0; ei < catalog.length; ei++) {
    const exam = catalog[ei];
    const subject = normalizeSubject(exam.subject || '');

    // Skip math subjects — they're fine
    if (MATH_SUBJECTS.has(subject)) continue;

    // If targeting specific subjects, filter
    if (TARGET_SUBJECTS && !TARGET_SUBJECTS.has(subject)) continue;

    for (let si = 0; si < (exam.sections || []).length; si++) {
      const section = exam.sections[si];
      for (let qi = 0; qi < (section.questions || []).length; qi++) {
        const q = section.questions[qi];

        // Only regenerate questions that already have a model_answer
        // (i.e., fix the language, don't generate new answers)
        if (!q.model_answer) continue;

        // Check if explanation appears non-French
        if (!hasNonFrenchExplanation(q)) continue;

        q._subject = subject;
        q._examIndex = ei;
        q._sectionIndex = si;
        q._questionIndex = qi;

        toRegenerate.push(q);
        subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;

        if (toRegenerate.length >= LIMIT) break;
      }
      if (toRegenerate.length >= LIMIT) break;
    }
    if (toRegenerate.length >= LIMIT) break;
  }

  console.log(`\nFound ${toRegenerate.length} questions with non-French explanations:`);
  for (const [subj, count] of Object.entries(subjectCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${subj}: ${count}`);
  }

  if (DRY_RUN) {
    console.log('\n(DRY RUN — no API calls made)');
    return;
  }

  if (toRegenerate.length === 0) {
    console.log('Nothing to regenerate!');
    return;
  }

  // Load checkpoint if resuming
  let completed = new Set();
  if (RESUME && existsSync(CHECKPOINT_PATH)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf-8'));
    completed = new Set(cp.completed || []);
    console.log(`Resuming: ${completed.size} already done`);
  }

  // Split into batches
  const batches = [];
  let currentBatch = [];
  for (const q of toRegenerate) {
    const key = `${q._examIndex}-${q._sectionIndex}-${q._questionIndex}`;
    if (completed.has(key)) continue;
    currentBatch.push(q);
    if (currentBatch.length === BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = [];
    }
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  console.log(`\n${batches.length} batches to process (${BATCH_SIZE} q/batch, ${CONCURRENCY} concurrent)\n`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const promises = chunk.map((batch, j) => processBatch(batch, i + j));
    const results = await Promise.all(promises);

    for (let j = 0; j < chunk.length; j++) {
      const batch = chunk[j];
      const batchResults = results[j];

      for (let k = 0; k < batch.length; k++) {
        const q = batch[k];
        const result = batchResults?.[k];
        const key = `${q._examIndex}-${q._sectionIndex}-${q._questionIndex}`;
        processed++;

        if (result && result.model_answer) {
          const target = catalog[q._examIndex].sections[q._sectionIndex].questions[q._questionIndex];
          target.model_answer = result.model_answer;
          target.answer_parts = result.answer_parts || [];
          target.approaches = result.approaches || [];
          target.final_answer = result.final_answer || target.final_answer || '';

          // Rebuild scaffold
          const { scaffold_text, scaffold_blanks } = buildScaffoldFromAnswer(
            result.model_answer, result.answer_parts
          );
          if (scaffold_text) {
            target.scaffold_text = scaffold_text;
            target.scaffold_blanks = scaffold_blanks;
          }

          succeeded++;
          completed.add(key);
        } else {
          failed++;
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (processed / (elapsed || 1)).toFixed(1);
    console.log(`  Progress: ${processed}/${toRegenerate.length} (${succeeded} ok, ${failed} failed) | ${rate} q/s`);

    // Save checkpoint periodically
    if ((i + CONCURRENCY) % (10 * CONCURRENCY) === 0 || i + CONCURRENCY >= batches.length) {
      writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completed: [...completed] }), 'utf-8');
      writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
    }

    if (i + CONCURRENCY < batches.length) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  // Clean up temp props
  for (const exam of catalog) {
    for (const sec of (exam.sections || [])) {
      for (const q of (sec.questions || [])) {
        delete q._subject;
        delete q._examIndex;
        delete q._sectionIndex;
        delete q._questionIndex;
      }
    }
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`Processed: ${processed}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);

  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
  writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completed: [...completed], final: true }), 'utf-8');
  console.log('Done ✓');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
