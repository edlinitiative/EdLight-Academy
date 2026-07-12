/**
 * Build the Sandra knowledge base (`sandraKb` Firestore collection).
 *
 * Reads live content — courses (skipping `hidden`), the quiz bank, and the exam
 * JSONs under public/exams — turns each into flat text chunks via the pure
 * builders in ./sandra_kb_chunks.mjs, embeds them with Gemini
 * `text-embedding-004`, and writes one vector doc per chunk (doc id = sourceId).
 * Stale docs (sourceIds no longer produced) are deleted so the collection
 * mirrors current content.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT_JSON=… GEMINI_API_KEY=… node scripts/build_sandra_kb.mjs
 *   node scripts/build_sandra_kb.mjs --dry-run   # counts only, no embed, no write
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  service-account JSON (same as other scripts)
 *   GEMINI_API_KEY / LLM_API_KEY   embedding key
 *   LLM_EMBED_MODEL                override embed model (default text-embedding-004)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { chunkCourse, chunkQuiz, chunkExamQuestion } from './sandra_kb_chunks.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMS_DIR = join(__dirname, '..', 'public', 'exams');

// ---- Embedding config (mirrors api/_lib/llm.ts embed() — kept in sync by hand) ----
const EMBED_MODEL = process.env.LLM_EMBED_MODEL || 'text-embedding-004';
const EMBED_BATCH_SIZE = 100; // Gemini batchEmbedContents hard limit.

/** Embed texts with Gemini batchEmbedContents; one vector per input, in order. */
async function embed(texts) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key: set GEMINI_API_KEY (or LLM_API_KEY) for embeddings.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`;
  const vectors = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const payload = {
      requests: batch.map((t) => ({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text: t }] } })),
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Gemini embed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    const embeddings = body?.embeddings || [];
    if (embeddings.length !== batch.length) {
      throw new Error(`Gemini embed returned ${embeddings.length} vectors for ${batch.length} texts`);
    }
    for (const e of embeddings) vectors.push(e?.values || []);
    console.log(`  embedded ${Math.min(i + batch.length, texts.length)}/${texts.length}`);
  }
  return vectors;
}

/** Normalize a quiz `subject_code` (e.g. "CHEM-NSI") into a course id ("chem-ns1"). */
function normCourseId(subjectCode) {
  if (!subjectCode) return '';
  const m = String(subjectCode).match(/^([A-Za-z]+)-NS(IV|III|II|I)$/i);
  if (!m) return String(subjectCode).toLowerCase();
  const subj = m[1].toLowerCase();
  const roman = m[2].toUpperCase();
  const lvl = roman === 'I' ? '1' : roman === 'II' ? '2' : roman === 'III' ? '3' : '4';
  return `${subj}-ns${lvl}`;
}

/** Load and chunk every exam JSON under public/exams. */
function buildExamChunks() {
  if (!existsSync(EXAMS_DIR)) {
    console.warn(`  (no exams dir at ${EXAMS_DIR}; skipping exams)`);
    return [];
  }
  const files = readdirSync(EXAMS_DIR).filter((f) => f.endsWith('.json'));
  const chunks = [];
  for (const file of files) {
    let exam;
    try {
      exam = JSON.parse(readFileSync(join(EXAMS_DIR, file), 'utf8'));
    } catch (err) {
      console.warn(`  skipping unreadable exam ${file}: ${err.message}`);
      continue;
    }
    const meta = {
      examId: exam.exam_id || file.replace(/\.json$/, ''),
      subject: exam.subject || '',
      level: exam.level || '',
      courseId: '', // exams don't map cleanly to an NS course id
    };
    for (const section of exam.sections || []) {
      for (const q of section.questions || []) {
        chunks.push(...chunkExamQuestion(q, meta));
      }
    }
  }
  return chunks;
}

async function main() {
  // Fail fast BEFORE any Firestore/credential work — applies to --dry-run too.
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set');
    process.exit(1);
  }

  const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const app = initializeApp({ credential: cert(cred) });
  const db = getFirestore(app);

  // ---- Gather chunks ----
  console.log('Reading courses…');
  const courseSnap = await db.collection('courses').get();
  const courseChunks = [];
  let skippedHidden = 0;
  courseSnap.forEach((d) => {
    const data = { id: d.id, ...d.data() };
    if (data.hidden) { skippedHidden += 1; return; }
    courseChunks.push(...chunkCourse(data));
  });

  console.log('Reading quizzes…');
  const quizSnap = await db.collection('quizzes').get();
  const quizChunks = [];
  quizSnap.forEach((d) => {
    const data = { id: d.id, ...d.data() };
    quizChunks.push(...chunkQuiz(data, normCourseId(data.subject_code)));
  });

  console.log('Reading exams…');
  const examChunks = buildExamChunks();

  const chunks = [...courseChunks, ...quizChunks, ...examChunks];

  // De-dupe by sourceId (doc id must be unique); last one wins.
  const bySource = new Map();
  for (const c of chunks) bySource.set(c.sourceId, c);
  const unique = [...bySource.values()];

  console.log('\n=== CHUNK COUNTS ===');
  console.log(`  courses:  ${courseChunks.length} (skipped ${skippedHidden} hidden courses)`);
  console.log(`  quizzes:  ${quizChunks.length}`);
  console.log(`  exams:    ${examChunks.length}`);
  console.log(`  total:    ${chunks.length}  (unique sourceIds: ${unique.length})`);

  if (DRY_RUN) {
    console.log('\n--dry-run: no embeddings requested, nothing written.');
    return;
  }

  // ---- Embed ----
  console.log(`\nEmbedding ${unique.length} chunks with ${EMBED_MODEL}…`);
  const vectors = await embed(unique.map((c) => c.text));

  // ---- Write ----
  console.log('Writing sandraKb docs…');
  const col = db.collection('sandraKb');
  let batch = db.batch();
  let ops = 0;
  const keepIds = new Set();
  for (let i = 0; i < unique.length; i += 1) {
    const c = unique[i];
    keepIds.add(c.sourceId);
    batch.set(col.doc(c.sourceId), {
      text: c.text,
      embedding: FieldValue.vector(vectors[i]),
      courseId: c.courseId,
      level: c.level,
      subject: c.subject,
      type: c.type,
      sourceId: c.sourceId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    ops += 1;
    if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();

  // ---- Delete stale docs ----
  console.log('Removing stale docs…');
  const existing = await col.get();
  let delBatch = db.batch();
  let delOps = 0;
  let deleted = 0;
  for (const doc of existing.docs) {
    if (keepIds.has(doc.id)) continue;
    delBatch.delete(doc.ref);
    delOps += 1;
    deleted += 1;
    if (delOps >= 400) { await delBatch.commit(); delBatch = db.batch(); delOps = 0; }
  }
  if (delOps > 0) await delBatch.commit();

  console.log(`\nDone. Wrote ${unique.length} docs, deleted ${deleted} stale docs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
