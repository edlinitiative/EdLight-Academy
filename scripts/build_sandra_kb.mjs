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
const RESUME = process.argv.includes('--resume');
const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMS_DIR = join(__dirname, '..', 'public', 'exams');

// ---- Embedding config (mirrors api/_lib/llm.ts embed() — kept in sync by hand) ----
// gemini-embedding-001 replaces the retired text-embedding-004. Vectors are
// requested at 768 dims (the Firestore index dimension) and re-normalized,
// since sub-3072-dim outputs of this model are not unit length.
const EMBED_MODEL = process.env.LLM_EMBED_MODEL || 'gemini-embedding-001';
const EMBED_DIM = 768;
const EMBED_BATCH_SIZE = 100; // Gemini batchEmbedContents hard limit.

const normalizeVector = (v) => {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Embed texts with Gemini batchEmbedContents; one vector per input, in order.
 * Retries 429/5xx with a growing wait — the free tier meters tokens per
 * minute, so patience (not failure) is the right response to quota errors.
 */
async function embed(texts) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key: set GEMINI_API_KEY (or LLM_API_KEY) for embeddings.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`;
  const vectors = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const payload = {
      requests: batch.map((t) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: t }] },
        outputDimensionality: EMBED_DIM,
      })),
    };
    let body = null;
    for (let attempt = 1; ; attempt += 1) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) { body = await res.json(); break; }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= 8) {
        throw new Error(`Gemini embed ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const waitSec = Math.min(15 * attempt, 70);
      console.log(`  quota/server error ${res.status} — waiting ${waitSec}s (attempt ${attempt}/8)…`);
      await res.text().catch(() => {});
      await sleep(waitSec * 1000);
    }
    const embeddings = body?.embeddings || [];
    if (embeddings.length !== batch.length) {
      throw new Error(`Gemini embed returned ${embeddings.length} vectors for ${batch.length} texts`);
    }
    for (const e of embeddings) vectors.push(normalizeVector(e?.values || []));
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
    (exam.sections || []).forEach((section, i) => {
      (section.questions || []).forEach((q, j) => {
        chunks.push(...chunkExamQuestion(q, { ...meta, sectionNo: i + 1, qIndex: j + 1 }));
      });
    });
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

  const col = db.collection('sandraKb');
  const keepIds = new Set(unique.map((c) => c.sourceId));

  // ---- Resume support: skip chunks already written on a previous run ----
  // (--resume trusts existing docs; a run without it re-embeds everything.)
  let todo = unique;
  if (RESUME) {
    console.log('\n--resume: listing already-written docs…');
    const refs = await col.listDocuments();
    const done = new Set(refs.map((r) => r.id));
    todo = unique.filter((c) => !done.has(c.sourceId));
    console.log(`  ${unique.length - todo.length} already in sandraKb, ${todo.length} to embed.`);
  }

  // ---- Embed + write interleaved, one API batch at a time ----
  // A quota error or crash mid-run loses at most one batch; re-run with
  // --resume to continue where it stopped.
  console.log(`\nEmbedding ${todo.length} chunks with ${EMBED_MODEL}…`);
  for (let i = 0; i < todo.length; i += EMBED_BATCH_SIZE) {
    const slice = todo.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embed(slice.map((c) => c.text));
    const batch = db.batch();
    slice.forEach((c, j) => {
      batch.set(col.doc(c.sourceId), {
        text: c.text,
        embedding: FieldValue.vector(vectors[j]),
        courseId: c.courseId,
        level: c.level,
        subject: c.subject,
        type: c.type,
        sourceId: c.sourceId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    console.log(`  embedded+written ${Math.min(i + slice.length, todo.length)}/${todo.length}`);
  }

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
