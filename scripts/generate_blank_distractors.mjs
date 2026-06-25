#!/usr/bin/env node
/**
 * generate_blank_distractors.mjs
 *
 * Completes the "complex answers become dropdowns" rule for the blanks that a
 * deterministic rule cannot handle: open math expressions (factorizations,
 * regression lines, root lists, set notations, descriptive phrases). For each
 * blank tagged `kind: 'open'`, it asks an LLM for 3 plausible-but-wrong
 * distractors in the same notation as the correct answer, validates them, then
 * writes `options` (correct + distractors, shuffled) and flips `kind` to
 * 'dropdown'. Blanks that already have options, or that are number/text/dropdown
 * kind, are left untouched.
 *
 * Why this is a separate, opt-in pass (not run automatically):
 *   • Good math distractors require an LLM — a dropdown with weak/garbage
 *     distractors is pedagogically worse than a text box, so we never fabricate
 *     them deterministically.
 *   • It needs a valid GEMINI_API_KEY (the key is read ONLY from the
 *     environment; no committed key). It makes hundreds of API calls.
 *
 * Usage:
 *   GEMINI_API_KEY=xxxx node scripts/generate_blank_distractors.mjs            # dry-run (no writes)
 *   GEMINI_API_KEY=xxxx node scripts/generate_blank_distractors.mjs --write     # apply
 *   …optional: --limit=50 (cap blanks this run), --model=gemini-2.5-flash
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');
const CATALOG = path.join(__dirname, '..', 'public', 'exam_catalog.json');

const WRITE = process.argv.includes('--write');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity;
const MODEL = (process.argv.find((a) => a.startsWith('--model=')) || '').split('=')[1] || 'gemini-2.5-flash';
// Free-tier gemini-2.5-flash is ~10 requests/min, so pace ~1 call / 6.5s by default.
const DELAY = Number((process.argv.find((a) => a.startsWith('--delay=')) || '').split('=')[1]) || 6500;

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('ERROR: GEMINI_API_KEY is not set in the environment.');
  console.error('       This pass needs a valid key. Export it first:');
  console.error('         export GEMINI_API_KEY=<your-key>');
  process.exit(1);
}
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

const RENDER_TYPES = new Set(['calculation', 'fill_blank']);
function isMathExam(e) { return /math/i.test(e.subject || ''); }

function normalize(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/^\$+|\$+$/g, '').replace(/\\,/g, '').replace(/\s+/g, ' ').trim();
}

async function callGemini(prompt) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 768,
      responseMimeType: 'application/json',
      // gemini-2.5-* are thinking models; without this the budget is spent on
      // hidden reasoning and the JSON array never finishes (MAX_TOKENS).
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        let waitMs = (Number(res.headers.get('retry-after')) || 0) * 1000;
        try {
          const j = await res.clone().json();
          const ri = (j?.error?.details || []).find((d) => /RetryInfo/.test(d['@type'] || ''));
          const m = ri && /([\d.]+)s/.exec(ri.retryDelay || '');
          if (m) waitMs = Math.max(waitMs, Math.ceil(parseFloat(m[1]) * 1000) + 500);
        } catch { /* body not JSON */ }
        waitMs = res.status === 429 ? Math.max(waitMs, 12000) : Math.max(waitMs, 4000 * (attempt + 1));
        if (process.env.DISTRACTOR_VERBOSE) console.log(`    (${res.status}, waiting ${Math.round(waitMs / 1000)}s, attempt ${attempt + 1})`);
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.candidates?.[0]?.finishReason === 'MAX_TOKENS') return null;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text;
    } catch { await sleep(2000 * (attempt + 1)); }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildPrompt(question, label, answer) {
  return [
    'You write distractor options for a math fill-in-the-blank turned into a multiple-choice dropdown.',
    'Return ONLY a JSON array of exactly 3 strings — plausible but DEFINITELY WRONG alternatives to the correct answer.',
    'Rules:',
    '- Same notation/format as the correct answer (LaTeX if the answer uses LaTeX, same units, same structure).',
    '- Each distractor must be mathematically WRONG and NOT equivalent to the correct answer.',
    '- Make them tempting (common student mistakes: sign errors, off-by-one, swapped terms, wrong coefficient).',
    '- No explanations, no labels, no duplicates. JSON array of 3 strings only.',
    '',
    `Question: ${question}`,
    `Step asked: ${label}`,
    `Correct answer: ${answer}`,
  ].join('\n');
}

// LaTeX commands collide with JSON's backslash-escape rules when the model emits
// single backslashes. Two failure modes, both repaired here:
//   • \t \f \n \b \r \v are VALID JSON escapes, so "\to" parses to <TAB>+"o",
//     silently corrupting \to, \frac, \nabla, \vec, … into control characters.
//   • \l \m \s \a … are INVALID escapes, so "\lim" makes JSON.parse throw.
function repairInvalidJsonEscapes(raw) {
  // Double any backslash that begins an invalid JSON escape (i.e. a LaTeX command),
  // while leaving already-correct \\ and real escapes (\" \/ \b \f \n \r \t \u) alone.
  return raw.replace(/\\(?![\\"/bfnrtu])/g, '\\\\');
}
function cleanLatexString(s) {
  // A single-backslash LaTeX command (\b \t \f \r) gets unescaped by JSON.parse
  // into one control byte, collapsing the backslash+first-letter. Restore it ONLY
  // when followed by a letter (LaTeX commands continue with letters). 0x0a is
  // deliberately excluded: in prose it is a real newline, not a corrupted \n...
  return String(s ?? '')
    .replace(/\x08(?=[a-zA-Z])/g, '\\b')  // \begin, \beta
    .replace(/\x09(?=[a-zA-Z])/g, '\\t')  // \to, \times, \text, \tan
    .replace(/\x0b(?=[a-zA-Z])/g, '\\v')  // \vec
    .replace(/\x0c(?=[a-zA-Z])/g, '\\f')  // \frac, \forall
    .replace(/\x0d(?=[a-zA-Z])/g, '\\r')  // \rho, \rightarrow
    .trim();
}
function parseDistractors(text, answer) {
  if (!text) return null;
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let arr = tryParse(text);
  if (arr === undefined) {
    const m = text.match(/\[[\s\S]*\]/);
    const candidate = m ? m[0] : text;
    arr = tryParse(candidate);
    if (arr === undefined) arr = tryParse(repairInvalidJsonEscapes(candidate)); // recover \lim, \frac, …
  }
  if (!Array.isArray(arr)) return null;
  const ansN = normalize(answer);
  const seen = new Set([ansN]);
  const out = [];
  for (const d of arr) {
    const s = cleanLatexString(d);
    if (!s) continue;
    const n = normalize(s);
    if (!n || seen.has(n)) continue;       // drop blanks, equals-answer, dupes
    seen.add(n);
    out.push(s);
  }
  return out.length >= 2 ? out.slice(0, 3) : null; // need at least 2 good distractors
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Collect every open blank (dedupe identical question+label+answer to save calls).
function collectOpenBlanks(exam, f) {
  const items = [];
  for (const sec of exam.sections || []) {
    for (const q of sec.questions || []) {
      if (!RENDER_TYPES.has(q.type)) continue;
      if (!q.scaffold_text || !Array.isArray(q.answer_parts)) continue;
      q.answer_parts.forEach((p, i) => {
        if (!p || Array.isArray(p.options)) return;
        if (p.kind !== 'open') return;
        items.push({ part: p, question: q.question || q._displayText || '', label: p.label || `Étape ${i + 1}`, answer: p.answer, file: f });
      });
    }
  }
  return items;
}

async function main() {
  const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));
  const exams = [];
  for (const f of files) {
    let e; try { e = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
    if (!isMathExam(e)) continue;
    exams.push({ f, e, blanks: collectOpenBlanks(e, f) });
  }

  const allBlanks = exams.flatMap((x) => x.blanks);
  console.log(`Open blanks to process: ${allBlanks.length}${LIMIT < Infinity ? ` (capped at ${LIMIT})` : ''}`);
  console.log(`Mode: ${WRITE ? 'WRITE' : 'DRY-RUN'}  Model: ${MODEL}`);

  let done = 0, ok = 0, failed = 0;
  const cache = new Map(); // answer+label+question -> options
  const samples = [];
  const changedExams = new Set(); // exam wrappers {f,e} whose files gained options

  const writeExam = (x) => {
    try { fs.writeFileSync(path.join(EXAM_DIR, x.f), JSON.stringify(x.e)); }
    catch (e) { console.error('  WARN write', x.f, e.message); }
  };

  // Mirror changed exams into the 27MB catalog by exam_id so a prebuild re-split
  // keeps the new options. Safe to call repeatedly / on interrupt.
  function mirrorCatalog() {
    if (!WRITE || changedExams.size === 0 || !fs.existsSync(CATALOG)) return;
    try {
      const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
      if (!Array.isArray(catalog)) return;
      const byId = new Map();
      for (const x of changedExams) byId.set(x.e.exam_id || x.e.id, x.e);
      let n = 0;
      for (let i = 0; i < catalog.length; i++) {
        const src = byId.get(catalog[i].exam_id || catalog[i].id);
        if (src) { catalog[i] = src; n += 1; }
      }
      fs.writeFileSync(CATALOG, JSON.stringify(catalog));
      console.log(`Catalog mirrored: ${n} exam(s) updated.`);
    } catch (e) { console.error('WARN: catalog mirror failed:', e.message); }
  }

  // Flush durably even if the run is killed (SIGTERM/SIGINT). Per-exam files are
  // already written per-win; this also pushes them into the catalog.
  let flushing = false;
  const onSignal = (sig) => {
    if (flushing) process.exit(130);
    flushing = true;
    console.log(`\n${sig} — converted ${ok} so far, flushing catalog…`);
    mirrorCatalog();
    process.exit(130);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  try {
    for (const x of exams) {
      if (done >= LIMIT) break;
      for (const b of x.blanks) {
        if (done >= LIMIT) break;
        done += 1;
        const cacheKey = `${b.question}||${b.label}||${b.answer}`;
        let options = cache.get(cacheKey);
        if (!options) {
          const text = await callGemini(buildPrompt(b.question, b.label, b.answer));
          const distractors = parseDistractors(text, b.answer);
          if (!distractors) {
            failed += 1;
            if (process.env.DISTRACTOR_VERBOSE) console.log(`  ✗ ${done}: ${String(b.answer).slice(0, 48)}`);
            continue;
          }
          options = shuffle([cleanLatexString(b.answer), ...distractors]);
          cache.set(cacheKey, options);
          await sleep(DELAY); // pace to respect the rate limit
        }
        b.part.options = options;
        b.part.kind = 'dropdown';
        ok += 1;
        if (WRITE) { writeExam(x); changedExams.add(x); } // persist each win immediately
        if (samples.length < 15) {
          samples.push({ q: String(b.question).slice(0, 80), label: b.label, answer: b.answer, options });
        }
        if (ok % 10 === 0) console.log(`  …${ok} converted, ${failed} failed (${done} processed)`);
      }
    }
  } finally {
    mirrorCatalog(); // normal completion or thrown error
  }

  console.log('-'.repeat(56));
  console.log(`Processed: ${done}  converted: ${ok}  failed: ${failed}`);
  if (samples.length) {
    console.log('-'.repeat(56));
    console.log('SAMPLES (correct answer marked ✓):');
    for (const s of samples) {
      console.log(`\n  Q: ${s.q}`);
      console.log(`  step: ${s.label}`);
      for (const o of s.options) {
        const mark = normalize(o) === normalize(s.answer) ? '✓' : ' ';
        console.log(`     [${mark}] ${o}`);
      }
    }
    console.log('');
  }
  console.log(WRITE ? 'Applied. Re-run audit + classifier to confirm.' : 'Dry-run — pass --write to apply.');
}

main().catch((e) => { console.error(e); process.exit(1); });
