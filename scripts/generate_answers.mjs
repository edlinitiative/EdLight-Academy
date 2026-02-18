#!/usr/bin/env node
/**
 * generate_answers.mjs
 *
 * Uses Gemini 2.0 Flash to generate actual correct answers for all
 * unanswered questions in the exam catalog.
 *
 * For each question it produces:
 *   model_answer  – full worked solution (string, may contain LaTeX)
 *   answer_parts  – array of { label, answer, alternatives[] }
 *                   These are the key result values that can be graded.
 *   approaches    – (for proofs/calculation) array of { name, steps[] }
 *                   Each approach is a different way to solve the problem.
 *
 * The existing scaffold_text / scaffold_blanks are then rebuilt from the
 * actual answer, so the blanked-out parts are real answer fragments.
 *
 * Run:  node scripts/generate_answers.mjs
 *       node scripts/generate_answers.mjs --resume   # continue from checkpoint
 *       node scripts/generate_answers.mjs --dry-run  # test 1 batch only
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(__dirname, '../public/exam_catalog.json');
const CHECKPOINT_PATH = resolve(__dirname, '../.answer_checkpoint.json');
const GEMINI_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBA4NHDVyIbnGt7iVfPUJHi7jNMV2Maqbc';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

const BATCH_SIZE = 4;          // questions per API call
const CONCURRENCY = 5;         // parallel API calls
const RETRY_LIMIT = 3;
const DELAY_BETWEEN_BATCHES = 300; // ms

const args = process.argv.slice(2);
const RESUME = args.includes('--resume');
const DRY_RUN = args.includes('--dry-run');

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Fix invalid JSON escape sequences that Gemini sometimes produces.
 * Valid JSON escapes: \" \\ \/ \b \f \n \r \t \uXXXX
 * Invalid ones (\d, \p, \s, \w, \x, etc.) are turned into
 * properly escaped literal backslash + char so JSON.parse succeeds.
 */
function repairJSON(text) {
  const validEscapes = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
  let result = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) {
      if (validEscapes.has(text[i + 1])) {
        // Valid escape — keep as-is
        result += text[i] + text[i + 1];
        i++;
      } else {
        // Invalid escape like \d — double the backslash
        result += '\\\\' + text[i + 1];
        i++;
      }
    } else {
      result += text[i];
    }
  }
  return result;
}

async function callGemini(prompt, retries = RETRY_LIMIT) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 16384,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (resp.status === 429) {
        const wait = Math.min(2000 * attempt, 10000);
        console.log(`  Rate limited, waiting ${wait}ms…`);
        await sleep(wait);
        continue;
      }
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 200)}`);
      }

      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini');
      return JSON.parse(repairJSON(text));
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  Attempt ${attempt} failed: ${err.message.slice(0, 100)}`);
      await sleep(1000 * attempt);
    }
  }
}

// ─── Build prompt for a batch of questions ──────────────────────────────────

function buildPrompt(questions) {
  const qList = questions.map((q, i) => {
    let desc = `Question ${i + 1}:\n`;
    desc += `  Subject: ${q._subject}\n`;
    desc += `  Type: ${q.type}\n`;
    if (q._sectionInstructions) {
      desc += `  Section instructions: ${q._sectionInstructions.slice(0, 300)}\n`;
    }
    if (q._sectionContext) {
      desc += `  Section context (other questions for reference): ${q._sectionContext.slice(0, 500)}\n`;
    }
    desc += `  Text: ${(q.question || '').slice(0, 1200)}\n`;
    if (q.options && Object.keys(q.options).length > 0) {
      desc += `  Options: ${JSON.stringify(q.options)}\n`;
    }
    if (q.figure_description) {
      desc += `  Figure: ${q.figure_description.slice(0, 400)}\n`;
    }
    if (q._parentQuestion) {
      desc += `  Parent question context: ${q._parentQuestion}\n`;
    }
    if (q.sub_questions && q.sub_questions.length > 0) {
      desc += `  Sub-questions:\n`;
      q.sub_questions.forEach(sq => {
        desc += `    ${sq.number}: ${(sq.question || '').slice(0, 200)}\n`;
      });
    }
    return desc;
  }).join('\n');

  return `You are an expert teacher creating an answer key for Haitian baccalauréat exams.

For EACH question below, provide the ACTUAL CORRECT ANSWER with full worked solution.

RULES:
1. For math/physics/chemistry: Show the complete computation. Use LaTeX ($...$) for math.
2. For proofs or multi-step problems: Provide up to 3 different approaches if applicable.
3. For fill_blank: Give the exact value/expression that goes in the blank.
4. For multiple_choice: Give the correct option letter AND explain why.
5. For true_false: Give "Vrai" or "Faux" with justification.
6. For essay: Provide a complete model essay (300-500 words).
7. For short_answer: Provide a complete, correct answer.
8. For matching: Give the correct pairs.
9. For questions with sub-parts (a, b, c, d): Solve EACH sub-part separately.
10. ALWAYS write ALL output in FRENCH — model_answer, explanation, approaches, and all explanatory text MUST be in French. The students are Haitian and French is their language of instruction, even for English, Spanish, or Kreyòl exams.
11. For short text answers (names, places, terms): include ALL plausible alternative forms in the "alternatives" array — partial answers (e.g., last name only when full name is expected), accent-less variants, common misspellings, and equivalent expressions. For multi-word answers, include each significant word individually as an alternative.

IMPORTANT: Identify the 2-4 KEY ANSWER FRAGMENTS that are the critical results a student must provide. These will be used for grading. For math, these are the computed values. For essays, these are the key thesis points. For MCQ, this is the letter.

Return a JSON array with exactly ${questions.length} objects, one per question, in order:
[
  {
    "model_answer": "Full worked solution as a string (may include LaTeX, use \\n for newlines)",
    "answer_parts": [
      {
        "label": "Short description of this answer fragment",
        "answer": "The exact correct value/expression",
        "alternatives": ["Other acceptable forms of the same answer"]
      }
    ],
    "approaches": [
      {
        "name": "Name of approach (e.g., 'Méthode directe', 'Par récurrence')",
        "steps": ["Step 1 text", "Step 2 text", "Step 3 text"]
      }
    ],
    "final_answer": "The single most important final result (short)"
  }
]

Questions:
${qList}

Return ONLY valid JSON. No markdown, no code blocks.`;
}

// ─── Process a single batch ─────────────────────────────────────────────────

async function processBatch(batch, batchIndex) {
  try {
    const prompt = buildPrompt(batch);
    const results = await callGemini(prompt);

    if (!Array.isArray(results) || results.length !== batch.length) {
      console.log(`  Batch ${batchIndex}: Got ${Array.isArray(results) ? results.length : 'non-array'} results for ${batch.length} questions`);
      // Try to use what we got
      if (!Array.isArray(results)) return batch.map(() => null);
    }

    return results;
  } catch (err) {
    console.log(`  Batch ${batchIndex} FAILED: ${err.message.slice(0, 150)}`);
    return batch.map(() => null);
  }
}

// ─── Build scaffold from answer ─────────────────────────────────────────────
// Creates scaffold_text with {{n}} blanks and scaffold_blanks from answer_parts

function buildScaffoldFromAnswer(modelAnswer, answerParts, question) {
  if (!answerParts || answerParts.length === 0) {
    return { scaffold_text: null, scaffold_blanks: null };
  }

  // Strategy: Show the model answer with key parts replaced by blanks
  let scaffoldText = modelAnswer || '';
  const blanks = [];

  for (let i = 0; i < answerParts.length; i++) {
    const part = answerParts[i];
    const placeholder = `{{${i}}}`;
    const answer = part.answer || '';

    // Try to find and replace the answer in the model text
    if (answer && scaffoldText.includes(answer)) {
      scaffoldText = scaffoldText.replace(answer, placeholder);
    } else {
      // If answer isn't found literally in text, append it as a blank
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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading catalog…');
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));

  // Collect all unanswered questions with their location in the catalog
  const unanswered = [];
  for (let ei = 0; ei < catalog.length; ei++) {
    const exam = catalog[ei];
    for (let si = 0; si < (exam.sections || []).length; si++) {
      const section = exam.sections[si];
      for (let qi = 0; qi < (section.questions || []).length; qi++) {
        const q = section.questions[qi];
        if (q.correct && q.correct !== '') continue;
        if (q.model_answer) continue; // Already has AI-generated answer
        // Attach metadata for the prompt
        q._subject = exam.subject || 'Unknown';
        q._examIndex = ei;
        q._sectionIndex = si;
        q._questionIndex = qi;
        q._sectionInstructions = section.instructions || section.section_title || '';

        // For comprehension questions, include nearby questions as context
        // (helps AI understand the passage topic even if passage isn't stored)
        if (/read|passage|comprehension|text/i.test(q._sectionInstructions)) {
          const otherQs = (section.questions || [])
            .map(oq => (oq.question || '').slice(0, 100))
            .join(' | ');
          q._sectionContext = otherQs.slice(0, 500);
        }

        // Also handle sub_questions — include them for the AI
        unanswered.push(q);

        // Also add sub_questions as separate items if they exist and need answers
        if (q.sub_questions && q.sub_questions.length > 0) {
          for (let sqi = 0; sqi < q.sub_questions.length; sqi++) {
            const sq = q.sub_questions[sqi];
            if (sq.correct && sq.correct !== '') continue;
            if (sq.model_answer) continue; // Already has AI-generated answer
            sq._subject = exam.subject || 'Unknown';
            sq._examIndex = ei;
            sq._sectionIndex = si;
            sq._questionIndex = qi;
            sq._subQuestionIndex = sqi;
            sq._parentQuestion = (q.question || '').slice(0, 400);
            sq._sectionInstructions = section.instructions || '';
            sq.type = sq.type || 'calculation';
            unanswered.push(sq);
          }
        }
      }
    }
  }

  console.log(`Found ${unanswered.length} unanswered questions across ${catalog.length} exams`);

  // Load checkpoint if resuming
  let completed = new Set();
  if (RESUME && existsSync(CHECKPOINT_PATH)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf-8'));
    completed = new Set(cp.completed || []);
    console.log(`Resuming from checkpoint: ${completed.size} already done`);
  }

  // Split into batches
  const batches = [];
  let currentBatch = [];
  for (const q of unanswered) {
    const sfx = q._subQuestionIndex !== undefined ? `-sq${q._subQuestionIndex}` : '';
    const key = `${q._examIndex}-${q._sectionIndex}-${q._questionIndex}${sfx}`;
    if (completed.has(key)) continue;
    currentBatch.push(q);
    if (currentBatch.length === BATCH_SIZE) {
      batches.push(currentBatch);
      currentBatch = [];
    }
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  console.log(`${batches.length} batches to process (${BATCH_SIZE} questions each, ${CONCURRENCY} concurrent)`);

  if (DRY_RUN) {
    console.log('\n=== DRY RUN: Processing 1 batch only ===');
    batches.length = Math.min(batches.length, 1);
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const startTime = Date.now();

  // Process batches with concurrency
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const promises = chunk.map((batch, j) => processBatch(batch, i + j));
    const results = await Promise.all(promises);

    // Apply results to catalog
    for (let j = 0; j < chunk.length; j++) {
      const batch = chunk[j];
      const batchResults = results[j];

      for (let k = 0; k < batch.length; k++) {
        const q = batch[k];
        const result = batchResults?.[k];
        const sfx = q._subQuestionIndex !== undefined ? `-sq${q._subQuestionIndex}` : '';
        const key = `${q._examIndex}-${q._sectionIndex}-${q._questionIndex}${sfx}`;
        processed++;

        if (result && result.model_answer) {
          let target;
          if (q._subQuestionIndex !== undefined) {
            // This is a sub_question
            target = catalog[q._examIndex].sections[q._sectionIndex]
              .questions[q._questionIndex].sub_questions[q._subQuestionIndex];
          } else {
            target = catalog[q._examIndex].sections[q._sectionIndex].questions[q._questionIndex];
          }
          target.model_answer = result.model_answer;
          target.answer_parts = result.answer_parts || [];
          target.approaches = result.approaches || [];
          target.final_answer = result.final_answer || '';

          // Rebuild scaffold from actual answer
          const { scaffold_text, scaffold_blanks } = buildScaffoldFromAnswer(
            result.model_answer,
            result.answer_parts,
            target
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

    // Progress report
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (processed / (elapsed || 1)).toFixed(1);
    const eta = ((unanswered.length - completed.size) / (rate || 1) / 60).toFixed(1);
    console.log(`  Progress: ${processed}/${unanswered.length} (${succeeded} ok, ${failed} failed) | ${rate} q/s | ETA: ${eta}m`);

    // Save checkpoint + catalog every 10 concurrent rounds (~400 questions)
    if ((i + CONCURRENCY) % (10 * CONCURRENCY) === 0 || i + CONCURRENCY >= batches.length) {
      writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completed: [...completed] }), 'utf-8');
      writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
    }

    if (i + CONCURRENCY < batches.length) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  // Clean up temporary properties
  for (const exam of catalog) {
    for (const sec of (exam.sections || [])) {
      for (const q of (sec.questions || [])) {
        delete q._subject;
        delete q._examIndex;
        delete q._sectionIndex;
        delete q._questionIndex;
        delete q._sectionInstructions;
        delete q._sectionContext;
        delete q._parentQuestion;
        delete q._subQuestionIndex;
        if (q.sub_questions) {
          for (const sq of q.sub_questions) {
            delete sq._subject;
            delete sq._examIndex;
            delete sq._sectionIndex;
            delete sq._questionIndex;
            delete sq._subQuestionIndex;
            delete sq._parentQuestion;
            delete sq._sectionInstructions;
          }
        }
      }
    }
  }

  // Final stats
  const totalWithAnswers = (() => {
    let count = 0;
    for (const exam of catalog) {
      for (const sec of (exam.sections || [])) {
        for (const q of (sec.questions || [])) {
          if (q.model_answer || (q.correct && q.correct !== '')) count++;
        }
      }
    }
    return count;
  })();

  console.log(`\n════════════════════════════════════════`);
  console.log(`Processed: ${processed}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total questions with answers now: ${totalWithAnswers} / ${unanswered.length + (9678 - unanswered.length)}`);
  console.log(`Time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);

  console.log('\nWriting catalog…');
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log('Done ✓');

  // Save final checkpoint
  writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completed: [...completed], final: true }), 'utf-8');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
