#!/usr/bin/env node
/**
 * generate_missing_explanations.mjs
 *
 * Generates explanations for MCQ questions that have none.
 * Uses Gemini to produce a brief French explanation for each MCQ.
 *
 * Usage:
 *   node scripts/generate_missing_explanations.mjs                # run all
 *   node scripts/generate_missing_explanations.mjs --dry-run      # count only
 *   node scripts/generate_missing_explanations.mjs --limit 100    # cap at N
 *   node scripts/generate_missing_explanations.mjs --resume       # resume from checkpoint
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(__dirname, '../public/exam_catalog.json');
const CHECKPOINT_PATH = resolve(__dirname, '../.mcq_expl_checkpoint.json');
// Load .env if present
try {
  const envFile = readFileSync(resolve(__dirname, '../.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_KEY) { console.error('No GEMINI_API_KEY set. Export it or add to .env'); process.exit(1); }
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

const BATCH_SIZE = 10;      // More Qs per call since we only need short explanations
const CONCURRENCY = 2;
const RETRY_LIMIT = 3;
const DELAY_BETWEEN_BATCHES = 600;
const SAVE_EVERY = 10;      // Save catalog every N batch-groups

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');
let LIMIT = Infinity;
const limIdx = args.indexOf('--limit');
if (limIdx !== -1 && args[limIdx + 1]) LIMIT = parseInt(args[limIdx + 1], 10);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function repairJSON(text) {
  const validEscapes = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
  let result = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) {
      if (validEscapes.has(text[i + 1])) {
        result += text[i] + text[i + 1]; i++;
      } else {
        result += '\\\\' + text[i + 1]; i++;
      }
    } else {
      result += text[i];
    }
  }
  return result;
}

async function callGemini(prompt) {
  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    try {
      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429) {
          const wait = (attempt + 1) * 8;
          console.log(`    Rate limited, waiting ${wait}s…`);
          await sleep(wait * 1000);
          continue;
        }
        if (response.status === 400 && errText.includes('API key')) {
          throw new Error(`API key invalid/expired. Get a new key at https://aistudio.google.com/apikey`);
        }
        throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array in response');
      return JSON.parse(repairJSON(jsonMatch[0]));
    } catch (err) {
      if (attempt === RETRY_LIMIT - 1) throw err;
      await sleep(1500 * (attempt + 1));
    }
  }
}

function buildPrompt(questions) {
  const qList = questions.map((q, i) => {
    const opts = q.options ? Object.entries(q.options).map(([k,v]) => `${k}) ${v}`).join('  ') : '';
    return `Q${i+1}: ${(q.question || '').slice(0, 400)}
  Options: ${opts}
  Correct: ${q.correct || '?'}`;
  }).join('\n\n');

  return `You are an expert teacher writing answer explanations for Haitian baccalauréat MCQ exam questions.

For EACH question below, write a BRIEF explanation (2-4 sentences) of why the correct answer is correct. If relevant, briefly note why common wrong answers are wrong.

RULES:
1. Write ALL explanations in FRENCH, regardless of the exam language.
2. Be concise: 2-4 sentences max.
3. For science/math questions, include the key formula or reasoning.
4. Reference the correct option letter.

Return a JSON array with exactly ${questions.length} strings — one explanation per question, in order:
["Explication pour Q1...", "Explication pour Q2...", ...]

Return ONLY the JSON array. No markdown, no code blocks.

${qList}`;
}

async function main() {
  console.log('Loading catalog…');
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'));

  // Collect MCQs with no explanation
  const toGenerate = [];
  for (let ei = 0; ei < catalog.length; ei++) {
    const exam = catalog[ei];
    for (let si = 0; si < (exam.sections || []).length; si++) {
      for (let qi = 0; qi < (exam.sections[si].questions || []).length; qi++) {
        const q = exam.sections[si].questions[qi];
        if ((q.type === 'mcq' || q.type === 'multiple_choice') &&
            (!q.explanation || !q.explanation.trim())) {
          toGenerate.push({ ...q, _ei: ei, _si: si, _qi: qi });
          if (toGenerate.length >= LIMIT) break;
        }
      }
      if (toGenerate.length >= LIMIT) break;
    }
    if (toGenerate.length >= LIMIT) break;
  }

  console.log(`Found ${toGenerate.length} MCQs missing explanations`);

  if (DRY_RUN) { console.log('(DRY RUN)'); return; }
  if (toGenerate.length === 0) { console.log('Nothing to do!'); return; }

  // Load checkpoint
  let completed = new Set();
  if (RESUME && existsSync(CHECKPOINT_PATH)) {
    const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf-8'));
    completed = new Set(cp.completed || []);
    console.log(`Resuming: ${completed.size} already done`);
  }

  // Filter already-done and batch
  const remaining = toGenerate.filter(q => !completed.has(`${q._ei}-${q._si}-${q._qi}`));
  const batches = [];
  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    batches.push(remaining.slice(i, i + BATCH_SIZE));
  }

  console.log(`${remaining.length} remaining → ${batches.length} batches (${BATCH_SIZE}/batch, ${CONCURRENCY} concurrent)\n`);

  let processed = 0, succeeded = 0, failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const promises = chunk.map(async (batch, j) => {
      try {
        const prompt = buildPrompt(batch);
        const results = await callGemini(prompt);
        if (!Array.isArray(results) || results.length !== batch.length) {
          console.log(`  Batch ${i+j}: size mismatch (got ${Array.isArray(results)?results.length:'?'} for ${batch.length})`);
          return batch.map(() => null);
        }
        return results;
      } catch (err) {
        console.log(`  Batch ${i+j} FAILED: ${err.message.slice(0, 120)}`);
        return batch.map(() => null);
      }
    });

    const results = await Promise.all(promises);

    for (let j = 0; j < chunk.length; j++) {
      const batch = chunk[j];
      const batchResults = results[j];
      for (let k = 0; k < batch.length; k++) {
        const q = batch[k];
        const key = `${q._ei}-${q._si}-${q._qi}`;
        const explanation = batchResults?.[k];
        processed++;
        if (explanation && typeof explanation === 'string' && explanation.length > 10) {
          catalog[q._ei].sections[q._si].questions[q._qi].explanation = explanation;
          succeeded++;
          completed.add(key);
        } else {
          failed++;
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const pct = ((processed / remaining.length) * 100).toFixed(0);
    console.log(`  ${pct}% (${processed}/${remaining.length}) — ${succeeded} ok, ${failed} failed — ${elapsed}s`);

    // Save periodically
    if ((i + CONCURRENCY) % (SAVE_EVERY * CONCURRENCY) === 0 || i + CONCURRENCY >= batches.length) {
      writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completed: [...completed] }));
      writeFileSync(CATALOG_PATH, JSON.stringify(catalog));
      console.log('  💾 saved');
    }

    if (i + CONCURRENCY < batches.length) await sleep(DELAY_BETWEEN_BATCHES);
  }

  // Final save (compact JSON — no pretty-print to keep file small)
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog));
  writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completed: [...completed], done: true }));

  const mins = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n════════════════════════════════`);
  console.log(`Done in ${mins} min — ${succeeded} generated, ${failed} failed`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
