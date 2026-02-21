#!/usr/bin/env node
/**
 * regenerate_quiz_bank.mjs
 *
 * Nukes the entire Firestore `quizzes` collection and regenerates it
 * with unique, topic-specific, FRENCH questions per chapter.
 *
 * Flow:
 *   1. Pull course structure from Firestore `courses` collection
 *   2. For each chapter (unit), call Gemini to generate unique questions
 *   3. Delete ALL old quiz docs from Firestore
 *   4. Write new quiz docs to Firestore
 *   5. Also produce a CSV backup in private_data/
 *
 * Usage:
 *   source .env && node scripts/regenerate_quiz_bank.mjs
 *   source .env && node scripts/regenerate_quiz_bank.mjs --dry-run
 *   source .env && node scripts/regenerate_quiz_bank.mjs --resume
 *   source .env && node scripts/regenerate_quiz_bank.mjs --limit 5
 *
 * Env:
 *   GEMINI_API_KEY          (required)
 *   FIREBASE_SERVICE_ACCOUNT_JSON  (required)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ──── CLI args ──── */
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');
const SKIP_DELETE = args.includes('--skip-delete');
const getArg = (name, fb = null) => { const i = args.indexOf(name); return i !== -1 && args[i+1] ? args[i+1] : fb; };
const LIMIT = (() => { const v = getArg('--limit'); return v ? parseInt(v, 10) : Infinity; })();

/* ──── Firebase ──── */
const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
const app = initializeApp({ credential: cert(cred) });
const db = getFirestore(app);

/* ──── Gemini ──── */
const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY && !DRY_RUN) {
  console.error('❌ GEMINI_API_KEY missing. Export it or add to .env');
  process.exit(1);
}
const GEMINI_URL = GEMINI_KEY
  ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`
  : null;

/* ──── Tuning ──── */
const QUESTIONS_PER_CHAPTER = 15;   // 5 MCQ + 5 SA + 5 TF
const CONCURRENCY = 2;
const RETRY_LIMIT = 4;
const DELAY_MS = 600;

const CHECKPOINT_PATH = resolve(__dirname, '../.regen_bank_checkpoint.json');
const OUT_CSV = resolve(__dirname, '../private_data/edlight_quizzes_bank.csv');

/* ──── Helpers ──── */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function repairJSON(text) {
  const valid = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) {
      if (valid.has(text[i + 1])) { out += text[i] + text[i + 1]; i++; }
      else { out += '\\\\' + text[i + 1]; i++; }
    } else out += text[i];
  }
  return out;
}

/* ──── Course structure loader ──── */
async function loadCourseChapters() {
  const snap = await db.collection('courses').get();
  const chapters = [];
  snap.forEach(doc => {
    const c = { id: doc.id, ...doc.data() };
    const units = c.units || [];
    for (const u of units) {
      // Only care about units that have a quiz lesson → real chapters
      const hasQuiz = (u.lessons || []).some(l => l.type === 'quiz');
      if (!hasQuiz) continue;

      // Derive subject_code from course id  (chem-ns1 → CHEM-NSI)
      const m = c.id.match(/^([a-z]+)-ns(\d)$/);
      let subjectCode = c.id.toUpperCase();
      if (m) {
        const subj = m[1].toUpperCase();
        const roman = ['', 'I', 'II', 'III', 'IV'][parseInt(m[2])];
        subjectCode = `${subj}-NS${roman}`;
      }

      // Unit title (the course chapter topic)
      const rawTitle = u.title || '';
      // Clean up chapter prefixes and overview junk
      let cleanTitle = rawTitle
        .replace(/^Chapitre?\s*\d+\s*:?\s*/i, '')
        .replace(/^Chapit\s*\d+\s*:?\s*/i, '')
        .replace(/^Unité\s+(Overview|Circle|Rates)[^:]*:?\s*/i, '')
        .trim();
      // Truncate if it looks like a long description paragraph
      if (cleanTitle.length > 80) cleanTitle = cleanTitle.slice(0, 80).replace(/\s\S*$/, '…');

      // Get video lesson titles for additional context
      const videoTitles = (u.lessons || [])
        .filter(l => l.type === 'video')
        .map(l => l.title)
        .filter(Boolean);

      // If the unit title is garbage/empty, use the first video title as the topic
      const isGarbage = !cleanTitle || cleanTitle.length < 3
        || /^Provide a few/i.test(cleanTitle)
        || /^Explain taux/i.test(cleanTitle)
        || /^This (capstone|unit)/i.test(cleanTitle);

      const effectiveTitle = isGarbage && videoTitles.length > 0
        ? videoTitles[0]
        : (cleanTitle || rawTitle || `Chapter ${u.order}`);

      // Skip chapters whose effective title is still too short or placeholder-like
      const isTooShort = effectiveTitle.length < 4
        || /^\d+[–-]\d+\s*min/i.test(effectiveTitle)
        || /^x\d|^y\d|^√$/i.test(effectiveTitle)
        || /^e\.g\./i.test(effectiveTitle)
        || /^height via/i.test(effectiveTitle)
        || effectiveTitle === '√';

      if (isTooShort) continue; // skip un-usable chapters

      chapters.push({
        courseId: c.id,
        subjectCode,
        chapterNumber: String(u.order || 1),
        unitId: u.unitId || u.id || '',
        unitTitle: effectiveTitle,
        videoTitles,
        courseName: c.title || c.name || c.id,
      });
    }
  });

  // Also add chapters for subjects that exist in old quiz data but not in courses
  // (MATH-NSIV, PHYS-NSI) — use the old quiz "unit" names as topics
  const oldSnap = await db.collection('quizzes').get();
  const existingSubjects = new Set(chapters.map(c => c.subjectCode));
  const orphanTopics = {};
  oldSnap.forEach(doc => {
    const d = doc.data();
    if (!existingSubjects.has(d.subject_code)) {
      const key = `${d.subject_code}|${d.Chapter_Number}`;
      if (!orphanTopics[key]) {
        orphanTopics[key] = {
          subjectCode: d.subject_code,
          chapterNumber: String(d.Chapter_Number),
          unitTitle: d.unit || `Chapter ${d.Chapter_Number}`,
          videoTitles: d.video_title ? [d.video_title] : [],
        };
      }
    }
  });
  for (const ot of Object.values(orphanTopics)) {
    chapters.push({
      courseId: `${ot.subjectCode.toLowerCase().replace('-ns', '-ns').replace('i','1').replace('ii','2').replace('iii','3').replace('iv','4')}`,
      subjectCode: ot.subjectCode,
      chapterNumber: ot.chapterNumber,
      unitId: `chap${ot.chapterNumber}`,
      unitTitle: ot.unitTitle,
      videoTitles: ot.videoTitles,
      courseName: ot.subjectCode,
    });
  }

  return chapters;
}

/* ──── Subject French names ──── */
const SUBJECT_FR = {
  CHEM: 'Chimie', PHYS: 'Physique', MATH: 'Mathématiques', ECON: 'Économie',
};
const LEVEL_FR = {
  NSI: 'NS I (9e AF)', NSII: 'NS II (NS II)', NSIII: 'NS III (NS III)', NSIV: 'NS IV (Terminale)',
};

function subjectFr(code) {
  const m = code.match(/^([A-Z]+)-NS(IV|III|II|I)$/);
  if (!m) return code;
  return `${SUBJECT_FR[m[1]] || m[1]} ${m[2]}`;
}

/* ──── Prompt builder ──── */
function buildPrompt(chapter) {
  const subj = subjectFr(chapter.subjectCode);
  const videos = chapter.videoTitles.length > 0
    ? `\nSujets des vidéos de ce chapitre: ${chapter.videoTitles.join('; ')}`
    : '';

  return `Tu es un professeur expert dans le système éducatif haïtien. Tu crées des questions de quiz pour des élèves du secondaire en Haïti.

CONTEXTE :
- Matière : ${subj}
- Chapitre ${chapter.chapterNumber} : « ${chapter.unitTitle} »${videos}

GÉNÈRE EXACTEMENT ${QUESTIONS_PER_CHAPTER} questions UNIQUES et VARIÉES sur CE chapitre précis :
- 5 questions à choix multiples (MCQ) : 3 faciles, 1 moyenne, 1 difficile
- 5 questions à réponse courte (ShortAnswer) : 3 faciles, 1 moyenne, 1 difficile
- 5 questions vrai/faux (TrueFalse) : 3 faciles, 1 moyenne, 1 difficile

CONTRAINTES ABSOLUES :
1. LANGUE : FRANÇAIS uniquement (français standard). JAMAIS d'anglais ni de créole haïtien.
2. CONTENU : Chaque question DOIT porter SPÉCIFIQUEMENT sur « ${chapter.unitTitle} ». Pas de questions hors-sujet.
3. MCQ : Exactement 4 options. Le champ "correct_answer" doit être le TEXTE EXACT de la bonne réponse (pas une lettre).
4. ShortAnswer : La réponse correcte doit être COURTE (1-3 mots max, ou un nombre). Donner 1-3 alternatives acceptables.
5. TrueFalse : correct_answer doit être exactement "Vrai" ou "Faux". Options : ["Vrai", "Faux"].
6. Chaque question a un "hint" (indice progressif, ne révèle PAS la réponse).
7. "good_response" = feedback quand l'élève répond bien (1-2 phrases, encourageant).
8. "wrong_response" = feedback quand l'élève se trompe (1-2 phrases, explique l'erreur).
9. Les questions peuvent utiliser du LaTeX : \\(...\\) pour inline, \\[...\\] pour block.
10. VARIÉTÉ : mélange rappel, compréhension et application. PAS de questions triviales ou redondantes.

RETOURNE UNIQUEMENT un tableau JSON valide avec exactement ${QUESTIONS_PER_CHAPTER} objets :
[
  {
    "question_type": "MCQ" | "ShortAnswer" | "TrueFalse",
    "difficulty": "easy" | "medium" | "hard",
    "question": "...",
    "correct_answer": "...",
    "options": ["...","...","...","..."],
    "alternatives": ["..."],
    "hint": "...",
    "good_response": "...",
    "wrong_response": "..."
  }
]

Pour TrueFalse, options = ["Vrai", "Faux"].
Pour ShortAnswer, options = [].
Pour MCQ, options = 4 choix dont la bonne réponse.
"alternatives" seulement pour ShortAnswer (variantes acceptables). Vide sinon.`;
}

/* ──── Gemini caller ──── */
async function callGemini(prompt) {
  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    try {
      const resp = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        if (resp.status === 429) {
          const wait = (attempt + 1) * 8000;
          console.log(`    ⏳ Rate limited, waiting ${wait/1000}s…`);
          await sleep(wait);
          continue;
        }
        throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 300)}`);
      }

      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) throw new Error('Empty Gemini response');

      // Try direct JSON parse first (responseMimeType should give clean JSON)
      try {
        return JSON.parse(text);
      } catch {
        // Fall back to regex extraction + repair
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array in response');
        return JSON.parse(repairJSON(jsonMatch[0]));
      }
    } catch (err) {
      console.log(`    ⚠ Attempt ${attempt + 1}/${RETRY_LIMIT}: ${err.message.slice(0, 120)}`);
      if (attempt === RETRY_LIMIT - 1) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }
}

/* ──── Validation ──── */
function validateQuestion(q, chapterTitle) {
  const errs = [];
  if (!q.question || q.question.trim().length < 10) errs.push('question too short');
  if (!q.correct_answer) errs.push('missing correct_answer');
  if (!['MCQ', 'ShortAnswer', 'TrueFalse'].includes(q.question_type)) errs.push(`bad type: ${q.question_type}`);
  if (!['easy', 'medium', 'hard'].includes(q.difficulty)) errs.push(`bad difficulty: ${q.difficulty}`);

  if (q.question_type === 'MCQ') {
    const opts = q.options || [];
    if (!Array.isArray(opts) || opts.length < 3) errs.push('MCQ needs ≥3 options');
    if (opts.length > 0 && !opts.map(o => o.toLowerCase().trim()).includes(q.correct_answer.toLowerCase().trim())) {
      errs.push('correct_answer not in options');
    }
  }
  if (q.question_type === 'TrueFalse') {
    const ca = q.correct_answer.toLowerCase().trim();
    if (ca !== 'vrai' && ca !== 'faux') errs.push(`TF answer not Vrai/Faux: "${q.correct_answer}"`);
  }
  if (!q.hint) errs.push('missing hint');
  return errs;
}

/* ──── Build Firestore doc ──── */
function buildDoc(q, chapter, index) {
  const typeTag = q.question_type === 'MCQ' ? 'MCQ'
    : q.question_type === 'TrueFalse' ? 'TF' : 'SA';
  const subchapter = String(Math.floor(index / 5) + 1); // distribute across 3 subchapters

  return {
    id: `${chapter.subjectCode}_Ch${chapter.chapterNumber}_Q${String(index + 1).padStart(2, '0')}_${typeTag}`,
    subject_code: chapter.subjectCode,
    Chapter_Number: chapter.chapterNumber,
    Subchapter_Number: subchapter,
    question_type: q.question_type,
    difficulty: q.difficulty || 'easy',
    question: q.question,
    correct_answer: q.correct_answer,
    options: JSON.stringify(q.options || []),
    alternatives: JSON.stringify(q.alternatives || []),
    hint: q.hint || '',
    hint1: q.hint || '',
    hint2: '',
    hint3: '',
    good_response: q.good_response || '',
    wrong_response: q.wrong_response || '',
    unit: chapter.unitTitle,
    video_title: (chapter.videoTitles || [])[0] || '',
    tags: JSON.stringify([chapter.subjectCode, `Ch${chapter.chapterNumber}`]),
    language: 'fr',
    source_doc: `regenerated_${new Date().toISOString().slice(0, 10)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/* ──── Checkpoint ──── */
function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) return { done: {}, docs: [] };
  try { return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf-8')); } catch { return { done: {}, docs: [] }; }
}
function saveCheckpoint(state) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(state, null, 2));
}

/* ──── CSV writer ──── */
function csvEscape(v) {
  const s = String(v ?? '');
  return /[\n\r,"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeCsv(docs) {
  const headers = [
    'id','subject_code','Chapter_Number','Subchapter_Number','question_type',
    'difficulty','question','correct_answer','options','alternatives',
    'hint','hint1','hint2','hint3','good_response','wrong_response',
    'unit','video_title','tags','language','source_doc',
  ];
  const lines = [headers.join(',')];
  for (const d of docs) lines.push(headers.map(h => csvEscape(d[h])).join(','));
  mkdirSync(dirname(OUT_CSV), { recursive: true });
  writeFileSync(OUT_CSV, lines.join('\n') + '\n');
}

/* ──── Delete old quizzes ──── */
async function deleteAllQuizzes() {
  console.log('🗑️  Deleting all existing quiz docs...');
  const snap = await db.collection('quizzes').get();
  const total = snap.size;
  let deleted = 0;

  // Batch delete (max 500 per batch)
  const batches = [];
  let batch = db.batch();
  let count = 0;
  snap.forEach(doc => {
    batch.delete(doc.ref);
    count++;
    if (count === 500) {
      batches.push(batch);
      batch = db.batch();
      count = 0;
    }
  });
  if (count > 0) batches.push(batch);

  for (const b of batches) {
    await b.commit();
    deleted += 500;
    process.stdout.write(`\r   Deleted ${Math.min(deleted, total)}/${total}`);
  }
  console.log(`\n   ✅ Deleted ${total} old quiz docs`);
}

/* ──── Write new quizzes to Firestore ──── */
async function writeToFirestore(docs) {
  console.log(`\n📤 Writing ${docs.length} new quiz docs to Firestore...`);
  let written = 0;

  // Batch write
  const batches = [];
  let batch = db.batch();
  let count = 0;
  for (const d of docs) {
    const ref = db.collection('quizzes').doc(d.id);
    batch.set(ref, d);
    count++;
    if (count === 500) {
      batches.push(batch);
      batch = db.batch();
      count = 0;
    }
  }
  if (count > 0) batches.push(batch);

  for (const b of batches) {
    await b.commit();
    written += 500;
    process.stdout.write(`\r   Written ${Math.min(written, docs.length)}/${docs.length}`);
  }
  console.log(`\n   ✅ Wrote ${docs.length} new quiz docs`);
}

/* ──── Main ──── */
async function main() {
  console.log('📚 Loading course structure from Firestore...');
  const chapters = await loadCourseChapters();
  console.log(`   Found ${chapters.length} chapters across all courses\n`);

  // Deduplicate chapters by subjectCode+chapterNumber
  const seen = new Set();
  const uniqueChapters = [];
  for (const ch of chapters) {
    const key = `${ch.subjectCode}|${ch.chapterNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueChapters.push(ch);
  }
  console.log(`   ${uniqueChapters.length} unique chapters to generate questions for`);

  // Sort for reproducible ordering
  uniqueChapters.sort((a, b) =>
    a.subjectCode.localeCompare(b.subjectCode) || parseInt(a.chapterNumber) - parseInt(b.chapterNumber)
  );

  // Apply limit
  const toProcess = uniqueChapters.slice(0, LIMIT);
  console.log(`   Processing: ${toProcess.length} chapters (limit=${LIMIT === Infinity ? 'none' : LIMIT})\n`);

  if (DRY_RUN) {
    console.log('🏃 DRY RUN — listing chapters that would be generated:\n');
    for (const ch of toProcess) {
      console.log(`  ${ch.subjectCode} Ch${ch.chapterNumber}: "${ch.unitTitle}" (${ch.videoTitles.length} videos)`);
    }
    console.log(`\n  Would generate: ${toProcess.length * QUESTIONS_PER_CHAPTER} questions total`);
    return;
  }

  // Load or init checkpoint
  const state = RESUME ? loadCheckpoint() : { done: {}, docs: [] };
  if (RESUME) {
    console.log(`♻️  Resuming: ${Object.keys(state.done).length} chapters done, ${state.docs.length} docs generated\n`);
  }

  const pending = toProcess.filter(ch => !state.done[`${ch.subjectCode}|${ch.chapterNumber}`]);
  console.log(`⏳ ${pending.length} chapters pending\n`);

  // Process chapters with concurrency
  let completed = Object.keys(state.done).length;
  const total = completed + pending.length;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const chunk = pending.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      chunk.map(async (ch) => {
        const key = `${ch.subjectCode}|${ch.chapterNumber}`;
        const label = `${ch.subjectCode} Ch${ch.chapterNumber} "${ch.unitTitle}"`;

        try {
          console.log(`  🔄 [${completed + 1}/${total}] ${label}`);
          const prompt = buildPrompt(ch);
          const raw = await callGemini(prompt);

          if (!Array.isArray(raw)) {
            console.log(`    ❌ ${label}: response not array`);
            return null;
          }

          // Validate and build docs
          const docs = [];
          let idx = 0;
          for (const q of raw) {
            const errs = validateQuestion(q, ch.unitTitle);
            if (errs.length > 0) {
              console.log(`    ⚠ Q${idx+1} skipped: ${errs.join(', ')}`);
            } else {
              docs.push(buildDoc(q, ch, idx));
            }
            idx++;
          }

          if (docs.length < 5) {
            console.log(`    ❌ ${label}: only ${docs.length} valid questions, need ≥5`);
            return null;
          }

          console.log(`    ✅ ${label}: ${docs.length} questions generated`);
          return { key, docs };
        } catch (err) {
          console.log(`    ❌ ${label}: ${err.message.slice(0, 150)}`);
          return null;
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        state.done[r.value.key] = true;
        state.docs.push(...r.value.docs);
        completed++;
      }
    }

    // Save checkpoint + CSV after each batch
    saveCheckpoint(state);
    writeCsv(state.docs);

    if (i + CONCURRENCY < pending.length) await sleep(DELAY_MS);
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Generated: ${state.docs.length} questions for ${Object.keys(state.done).length} chapters`);
  console.log(`${'═'.repeat(50)}\n`);

  // Verify uniqueness
  const uniqueTexts = new Set(state.docs.map(d => d.question.toLowerCase().trim()));
  console.log(`  Unique question texts: ${uniqueTexts.size} / ${state.docs.length}`);

  if (state.docs.length === 0) {
    console.log('⚠️  No questions generated. Aborting.');
    return;
  }

  // Delete old + write new to Firestore
  if (!SKIP_DELETE) {
    await deleteAllQuizzes();
  }
  await writeToFirestore(state.docs);

  // Final CSV backup
  writeCsv(state.docs);
  console.log(`\n📄 CSV backup: ${OUT_CSV}`);
  console.log('✅ Done!');
}

main().catch(err => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
