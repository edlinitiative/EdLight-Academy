#!/usr/bin/env node
/**
 * enrich_quiz_hints.mjs
 *
 * Reads every doc in the Firestore `quizzes` collection and enriches it with:
 *   - hint1, hint2, hint3  (3 progressive hints, from gentle nudge to near-answer)
 *   - explanation           (detailed pedagogical explanation in French, 2-4 sentences)
 *
 * Uses Gemini 2.0 Flash.  Checkpoint support via .enrich_hints_checkpoint.json.
 *
 * Usage:
 *   export $(grep -v '^#' .env | xargs) && node scripts/enrich_quiz_hints.mjs
 *   ... --dry-run   (prints plan, no API calls)
 *   ... --resume    (resume from checkpoint)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');

/* ── Robust JSON parser (handles Gemini's LaTeX escapes & control chars) ── */
function robustJsonParse(raw) {
  // Attempt 1: direct parse
  try { return JSON.parse(raw); } catch (_) {}

  // Attempt 2: strip markdown code fences
  let text = raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  try { return JSON.parse(text); } catch (_) {}

  // Attempt 3: fix inside JSON string values only
  // Walk through the text character by character, fixing issues inside strings
  let result = '';
  let inString = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      i++;
    } else {
      // Inside a JSON string value
      if (ch === '\\') {
        const next = text[i + 1];
        if (next && '"\\\/bfnrtu'.includes(next)) {
          // Valid JSON escape - keep as-is
          result += ch + next;
          i += 2;
        } else {
          // Invalid escape (like \( \) from LaTeX) - double the backslash
          result += '\\\\';
          i++;
        }
      } else if (ch === '"') {
        // End of string
        inString = false;
        result += ch;
        i++;
      } else if (ch.charCodeAt(0) < 32) {
        // Control character inside string - escape it
        if (ch === '\n') result += '\\n';
        else if (ch === '\r') result += '\\r';
        else if (ch === '\t') result += '\\t';
        else result += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
        i++;
      } else {
        result += ch;
        i++;
      }
    }
  }
  return JSON.parse(result);
}

/* ── Firebase ─────────────────────────────────────────── */
const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!svcJson) { console.error('Missing FIREBASE_SERVICE_ACCOUNT_JSON'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(svcJson)) });
const db = getFirestore();

/* ── Gemini ───────────────────────────────────────────── */
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) { console.error('Missing GEMINI_API_KEY'); process.exit(1); }
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

/* ── CLI args ─────────────────────────────────────────── */
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const RESUME    = args.includes('--resume');
const LIMIT_IDX = args.indexOf('--limit');
const LIMIT     = LIMIT_IDX >= 0 ? parseInt(args[LIMIT_IDX + 1], 10) : Infinity;
const CONCURRENCY = 3;      // parallel Gemini calls
const DELAY_MS    = 400;    // between batches
const MAX_RETRIES = 3;

/* ── Checkpoint ───────────────────────────────────────── */
const CP_PATH = resolve(ROOT, '.enrich_hints_checkpoint.json');

function loadCheckpoint() {
  if (RESUME && existsSync(CP_PATH)) {
    try { return JSON.parse(readFileSync(CP_PATH, 'utf8')); }
    catch { return { done: {} }; }
  }
  return { done: {} };
}
function saveCheckpoint(cp) {
  writeFileSync(CP_PATH, JSON.stringify(cp), 'utf8');
}

/* ── Gemini call ──────────────────────────────────────── */
const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      hint1:       { type: 'STRING' },
      hint2:       { type: 'STRING' },
      hint3:       { type: 'STRING' },
      explanation: { type: 'STRING' },
    },
    required: ['hint1', 'hint2', 'hint3', 'explanation'],
  },
};

async function callGemini(prompt, expectedCount, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      });
      if (res.status === 429) {
        const wait = Math.min(2000 * attempt, 10000);
        console.log(`  ⏳ Rate-limited, waiting ${wait}ms (attempt ${attempt}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return robustJsonParse(text);
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  ⚠ Attempt ${attempt} failed: ${err.message}. Retrying...`);
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

/* ── Build prompt for a batch of questions ────────────── */
function buildPrompt(questions) {
  // questions is an array of { id, question, correct_answer, question_type, unit, subject_code }
  const items = questions.map((q, i) => {
    return `${i + 1}. [${q.question_type}] "${q.question}"  →  Réponse: "${q.correct_answer}"  |  Sujet: "${q.unit}"`;
  }).join('\n');

  return `Tu es un professeur expert pour le programme scolaire haïtien. Pour chaque question ci-dessous, génère:

1. **hint1**: Un indice subtil qui oriente l'élève vers le bon concept (sans révéler la réponse). 1 phrase.
2. **hint2**: Un indice plus explicite qui précise la méthode ou la formule à utiliser. 1-2 phrases.
3. **hint3**: Un indice très direct qui mène presque à la réponse (sans la donner explicitement). 1-2 phrases.
4. **explanation**: Une explication pédagogique détaillée de la bonne réponse. 2-4 phrases. Explique POURQUOI c'est la réponse, avec la logique ou formule.

IMPORTANT:
- Tout en FRANÇAIS.
- Les 3 hints doivent être PROGRESSIFS (du plus vague au plus précis).
- L'explanation doit être PÉDAGOGIQUE, pas juste "la réponse est X".
- Pour les formules mathématiques, utilise la notation $...$ (dollar sign). Par exemple: $x^2 + y^2 = r^2$. NE PAS utiliser \\( \\) car ça casse le JSON.
- N'utilise PAS de backslash sauf pour les commandes LaTeX à l'intérieur de $...$. Par exemple: $\\frac{a}{b}$ est OK.
- Retourne un tableau JSON de ${questions.length} objets, dans le MÊME ordre.

Questions:
${items}

Format de sortie (JSON array):
[
  {
    "hint1": "...",
    "hint2": "...",
    "hint3": "...",
    "explanation": "..."
  }
]`;
}

/* ── Main ─────────────────────────────────────────────── */
async function main() {
  console.log('\n📚 Enriching quiz hints & explanations...\n');

  // 1. Load all quiz docs
  console.log('Loading quiz docs from Firestore...');
  const snap = await db.collection('quizzes').get();
  const allDocs = [];
  snap.forEach(d => {
    const data = d.data();
    allDocs.push({ docId: d.id, ...data });
  });
  console.log(`  Found ${allDocs.length} quiz docs\n`);

  // 2. Filter out already-enriched docs (have non-empty hint2 + explanation)
  const cp = loadCheckpoint();
  const needsEnrichment = allDocs.filter(d => {
    if (cp.done[d.docId]) return false;
    const hasHints = d.hint2 && String(d.hint2).trim().length > 0;
    const hasExpl  = d.explanation && String(d.explanation).trim().length > 0;
    return !(hasHints && hasExpl);
  });

  console.log(`  Need enrichment: ${needsEnrichment.length} / ${allDocs.length}`);
  const toProcess = needsEnrichment.slice(0, LIMIT);
  console.log(`  Will process: ${toProcess.length}\n`);

  if (DRY_RUN) {
    console.log('🏁 Dry run — no API calls.');
    toProcess.slice(0, 5).forEach(d => {
      console.log(`  ${d.docId}: "${(d.question || '').substring(0, 60)}..."`);
    });
    return;
  }

  // 3. Process in batches of 10 (one Gemini call per batch)
  const BATCH_SIZE = 10;
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);
    console.log(`🔄 [${batchNum}/${totalBatches}] Processing ${batch.length} questions...`);

    // Build prompt
    const prompt = buildPrompt(batch.map(d => ({
      id: d.docId,
      question: d.question || '',
      correct_answer: d.correct_answer || '',
      question_type: d.question_type || '',
      unit: d.unit || '',
      subject_code: d.subject_code || '',
    })));

    try {
      const results = await callGemini(prompt, batch.length);

      if (!Array.isArray(results) || results.length !== batch.length) {
        console.log(`  ⚠ Expected ${batch.length} results, got ${Array.isArray(results) ? results.length : 'non-array'}. Skipping batch.`);
        errors += batch.length;
        continue;
      }

      // Write updates to Firestore
      const fbBatch = db.batch();
      for (let j = 0; j < batch.length; j++) {
        const doc = batch[j];
        const enrichment = results[j];
        if (!enrichment || typeof enrichment !== 'object') {
          console.log(`  ⚠ Bad result for ${doc.docId}, skipping.`);
          errors++;
          continue;
        }

        const h1 = String(enrichment.hint1 || '').trim();
        const h2 = String(enrichment.hint2 || '').trim();
        const h3 = String(enrichment.hint3 || '').trim();
        const expl = String(enrichment.explanation || '').trim();

        if (!h1 || !h2 || !h3 || !expl) {
          console.log(`  ⚠ Incomplete enrichment for ${doc.docId}, skipping.`);
          errors++;
          continue;
        }

        const ref = db.collection('quizzes').doc(doc.docId);
        fbBatch.update(ref, {
          hint1: h1,
          hint2: h2,
          hint3: h3,
          explanation: expl,
        });

        cp.done[doc.docId] = true;
        processed++;
      }

      await fbBatch.commit();
      saveCheckpoint(cp);

      console.log(`  ✅ Batch done. Progress: ${processed}/${toProcess.length}`);

    } catch (err) {
      console.log(`  ❌ Batch failed: ${err.message}`);
      errors += batch.length;
      saveCheckpoint(cp);
    }

    // Rate-limit delay
    if (i + BATCH_SIZE < toProcess.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  Enriched: ${processed} questions`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  Total:    ${allDocs.length}`);
  console.log(`══════════════════════════════════════════════════`);
  console.log('✅ Done!');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
