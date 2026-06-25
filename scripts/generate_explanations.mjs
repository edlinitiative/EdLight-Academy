#!/usr/bin/env node
/**
 * generate_explanations.mjs
 *
 * Fills the missing pedagogical "why" — a brief, grounded explanation of why
 * the correct answer is correct — for the 74% of questions that ship without
 * one. The cross-subject audit flagged this as the biggest remaining gap,
 * worst on auto-graded Physique / Chimie / Mathématiques.
 *
 * Scope (auto-gradable only):
 *   • Includes calculation, fill_blank, short_answer, true_false, multiple_*.
 *   • Excludes essay and matching by default — a free-composition "why the
 *     answer is correct" doesn't fit (those are manual-graded; their guidance
 *     lives in model_answer). Override with --include-essay / --include-matching.
 *   • Only questions that are GROUNDED (have correct / answer_parts /
 *     final_answer / model_answer) are eligible, so the model explains a known
 *     answer instead of guessing niche Haitian-bac content.
 *
 * Durability (mirrors generate_blank_distractors.mjs):
 *   • Reads GEMINI_API_KEY from the environment, then .env.local, then .env.
 *     No key is ever committed.
 *   • gemini-2.5-flash with thinkingBudget:0 + responseMimeType JSON.
 *   • Quota-aware backoff (honors RetryInfo), batched calls with index-keyed
 *     output so a dropped/re-ordered item can never land on the wrong question.
 *   • Writes each touched per-exam file immediately and mirrors the 27 MB
 *     catalog by exam_id; flushes on SIGINT/SIGTERM. Resumable: a re-run simply
 *     skips questions that already have an explanation.
 *   • LaTeX in explanations is preserved (the UI renders it); single-backslash
 *     control-char corruption from JSON is repaired on parse.
 *
 * Usage:
 *   node scripts/generate_explanations.mjs                       # dry-run, all eligible
 *   node scripts/generate_explanations.mjs --write                # apply
 *   node scripts/generate_explanations.mjs --write --limit=200    # cap this run
 *   node scripts/generate_explanations.mjs --write --subjects=Physique,Chimie,Mathématiques,SVT,Informatique
 *   …optional: --batch=6 --concurrency=4 --delay=400 --model=gemini-2.5-flash
 *              --include-essay --include-matching --verbose
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const EXAM_DIR = path.join(ROOT, 'public', 'exams');
const CATALOG = path.join(ROOT, 'public', 'exam_catalog.json');

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const flag = (name) => process.argv.includes(`--${name}`);

const WRITE = flag('write');
const VERBOSE = flag('verbose');
const CLEAN = flag('clean');
const LIMIT = Number(arg('limit', Infinity)) || Infinity;
const BATCH = Math.max(1, Number(arg('batch', 6)) || 6);
const CONCURRENCY = Math.max(1, Number(arg('concurrency', 4)) || 4);
const DELAY = Number(arg('delay', 400)) || 0; // pause between dispatch waves (ms)
const MODEL = arg('model', 'gemini-2.5-flash');
const INCLUDE_ESSAY = flag('include-essay');
const INCLUDE_MATCHING = flag('include-matching');
const SUBJECTS = arg('subjects', '').split(',').map((s) => s.trim()).filter(Boolean);
const SUBJECT_FILTER = SUBJECTS.length ? new Set(SUBJECTS) : null;

const MATH_SUBJECTS = new Set(['Mathématiques', 'Physique', 'Chimie', 'SVT', 'Informatique']);
const EXCLUDED_TYPES = new Set([
  ...(INCLUDE_ESSAY ? [] : ['essay']),
  ...(INCLUDE_MATCHING ? [] : ['matching']),
]);

// ── API key (env → .env.local → .env), quotes stripped, no logging of value ──
function loadEnvKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  for (const file of ['.env.local', '.env']) {
    try {
      const txt = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const m = txt.match(/^\s*GEMINI_API_KEY\s*=\s*(.+)\s*$/m);
      if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
    } catch { /* file absent */ }
  }
  return '';
}
const KEY = loadEnvKey();
if (!KEY) {
  console.error('ERROR: GEMINI_API_KEY not found (checked env, .env.local, .env).');
  process.exit(1);
}
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── LaTeX/JSON repair (shared with the distractor generator) ─────────────────
function repairInvalidJsonEscapes(raw) {
  return raw.replace(/\\(?![\\"/bfnrtu])/g, '\\\\');
}
function cleanLatexString(s) {
  return String(s ?? '')
    .replace(/\x08(?=[a-zA-Z])/g, '\\b')
    .replace(/\x09(?=[a-zA-Z])/g, '\\t')
    .replace(/\x0b(?=[a-zA-Z])/g, '\\v')
    .replace(/\x0c(?=[a-zA-Z])/g, '\\f')
    .replace(/\x0d(?=[a-zA-Z])/g, '\\r')
    .trim();
}

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\$[^$]*\$/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// LLM "I can't answer without the source" non-answers (FR / ES / EN).
const REFUSAL_RE = /\b(sin (el |la |los |las )?(texto|frase|imagen|parrafo|documento)|necesito (el |la |mas |más )?(texto|frase|informacion)|no puedo (dar|proporcionar|responder|generar|determinar)|sans (le |la )?(texte|document|image)|je ne peux pas|impossible de (repondre|determiner)|i (need|cannot|can ?not|can'?t|am unable)|without (the )?(text|passage|image|document|context)|requires? the (text|passage)|provide the (text|passage)|as an ai|en tant qu'?ia)\b/i;

// Deflections: the model hedges that it lacks the SOURCE (text / passage /
// figure / phrase) even though an authoritative answer WAS provided. These are
// non-explanations — reject them so a resume re-run regenerates a real one (or
// leaves the question clean). Source-ANCHORED on purpose: a method description
// ("Pour déterminer X, il faut calculer Y") or MCQ reasoning ("les autres ne
// sont pas spécifiquement liées à Z") is legitimate and must NOT be flagged.
const SRC = '(texte|passage|document|extrait|[ée]nonc[ée]|figures?|phrases?|images?|sch[ée]ma|donn[ée]es?)';
const DEFLECTION_RE = new RegExp('(' +
  'je ne peux pas (r[ée]pondre|d[ée]terminer|fournir|chiffrer|calculer|cr[ée]er|analyser)' +
  '|sans [^.]{0,40}' + SRC + '[^.]{0,40}(impossible|on ne peut|je ne peux|ne peut [êe]tre)' +
  '|(impossible|on ne peut pas)[^.]{0,40}sans [^.]{0,20}(' + SRC + '|cr[ée][ée]e?s?|fournie?s?)' +
  '|sans les (phrases?|figures?|arbres?|analyses?|donn[ée]es?|informations?)[^.]{0,30}(cr[ée][ée]|fourni|impossible|on ne peut)' +
  '|(n[ée]cessaire|besoin|il faut|faudrait|n[ée]cessite|indispensable) [^.]{0,18}(avoir |disposer )?(acc[èe]s|se r[ée]f[ée]rer|lire|conna[iî]tre|l[’\']int[ée]gralit[ée]|le contenu)[^.]{0,18}' + SRC +
  '|(avoir |disposer d[’\']?)?acc[èe]s (au|[àa] l[’\']?|aux) ' + SRC +
  '|se r[ée]f[ée]rer (au|[àa] l[’\']?|aux) ' + SRC +
  '|d[’\']avoir (acc[èe]s|le contenu|l[’\']int[ée]gralit[ée])' +
  '|' + SRC + '[^.]{0,22}(est|sont|n[’\']est|semble|serait|s[’\']av[èe]re) [^.]{0,15}(manquant|incomplet|tronqu[ée]|absent|indisponible|non (fourni|disponible|pr[ée]sent))' +
  '|' + SRC + ' (manquant|absent)' +
  '|ne (contient|fournit|donne|pr[ée]cise|mentionne|comprend) (pas|aucune?) [^.]{0,40}(n[ée]cessaire|requis|pour (r[ée]pondre|d[ée]terminer)|[àa] (la |cette )?question|[àa] analyser)' +
  '|n[’\']est pas (fournie?|mentionn[ée]e?|pr[ée]cis[ée]e?|indiqu[ée]e?|disponible)s? dans [^.]{0,15}' + SRC +
  '|n[’\']y a (pas|aucune?) [^.]{0,30}(' + SRC + '|[ée]l[ée]ment|source)[^.]{0,20}(disponible|fourni|pour r[ée]pondre)' +
  '|pas d[’\']information disponible dans le ' + SRC +
  '|d[ée]pend(ent|ant|ra)? [^.]{0,40}(' + SRC + ')[^.]{0,20}(incomplet|fourni|d[ée]crit|exprim[ée]|en question)' +
  '|d[ée]pend(ent|ant)? [^.]{0,30}(maladie|pathologie) sp[ée]cifique' +
  '|sp[ée]cifiques? [àa] chaque (maladie|pathologie)' +
  '|chaque (maladie|pathologie) (pr[ée]sente|poss[èe]de) un' +
  '|sp[ée]cifiques? [àa] (la |chaque |une? )?(maladie|pathologie) (sp[ée]cifique|[ée]tudi[ée]e?|d[ée]crite?|en question)' +
  ')', 'i');

const nonEmpty = (v) => v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim().length > 0);
const isGrounded = (q) => nonEmpty(q.correct) || nonEmpty(q.answer_parts) || nonEmpty(q.final_answer) || nonEmpty(q.model_answer);

function optionsToText(opts) {
  if (!opts) return '';
  if (Array.isArray(opts)) return opts.map((o, i) => `${String.fromCharCode(97 + i)}) ${o}`).join('  ');
  if (typeof opts === 'object') return Object.entries(opts).map(([k, v]) => `${k}) ${v}`).join('  ');
  return '';
}

// One compact, grounded context block per question. An authoritative answer is
// ALWAYS surfaced (correct → final_answer → model_answer → answer_parts) so the
// model explains a known answer instead of deflecting to "the source text".
function buildItemContext(q, subject, n, passage) {
  const lines = [`[${n}] (${subject} · ${q.type})`];
  if (passage) lines.push(`Passage (context): ${String(passage).replace(/\s+/g, ' ').slice(0, 650)}`);
  const qtext = String(q._displayText || q.question || '').replace(/\s+/g, ' ').slice(0, 420);
  lines.push(`Question: ${qtext}`);
  const opts = optionsToText(q.options);
  if (opts) lines.push(`Options: ${opts.slice(0, 320)}`);

  // Authoritative answer (ground truth) — always present (caller drops !grounded).
  const ground = [
    nonEmpty(q.correct) && String(q.correct),
    nonEmpty(q.final_answer) && String(q.final_answer),
    nonEmpty(q.model_answer) && String(q.model_answer),
  ].filter(Boolean)[0] || (Array.isArray(q.answer_parts)
    ? q.answer_parts.map((p) => p && p.answer).filter(Boolean).join(', ') : '');
  lines.push(`ANSWER (authoritative — treat as correct): ${ground.replace(/\s+/g, ' ').slice(0, 300)}`);

  if (Array.isArray(q.answer_parts) && q.answer_parts.length) {
    const steps = q.answer_parts.slice(0, 8)
      .map((p) => `${p.label || '·'}: ${String(p.answer ?? '').slice(0, 90)}`).join(' | ');
    lines.push(`Key points: ${steps.slice(0, 500)}`);
  }
  return lines.join('\n');
}

function buildPrompt(items) {
  const head = [
    'You are an expert teacher writing brief answer explanations (the pedagogical "why")',
    'for Haitian baccalauréat exam questions. Each item includes an AUTHORITATIVE answer.',
    'Explain in FRENCH why THAT answer is correct. Treat the given answer as ground truth:',
    'never contradict it and never re-derive a different one.',
    '',
    'RULES:',
    '- French only. 1–3 sentences, ≤ 55 words. Concise and exam-focused.',
    '- State the key reason: the rule, definition, formula, or computation step.',
    '- For maths / physics / chemistry, include the decisive formula or step in LaTeX ($…$).',
    '- If options are listed, note briefly why the right one beats the tempting wrong one.',
    '- The answer is ALWAYS given to you. NEVER say it depends on a missing text, source,',
    '  passage, or context, and never say information is missing — explain the GIVEN answer.',
    '- Do NOT restate the question verbatim. Write it as feedback shown AFTER the student answers.',
    '',
    `Return ONLY a JSON array of exactly ${items.length} objects, one per item, in order:`,
    '[{"i":1,"explanation":"…"}, {"i":2,"explanation":"…"}, …]',
    '',
    'ITEMS:',
  ].join('\n');
  return `${head}\n${items.map((it, k) => buildItemContext(it.q, it.subject, k + 1, it.passage)).join('\n\n')}`;
}

async function callGemini(prompt) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
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
        if (VERBOSE) console.log(`    (${res.status}, waiting ${Math.round(waitMs / 1000)}s, attempt ${attempt + 1})`);
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) {
        if (VERBOSE) console.log(`    (HTTP ${res.status}: ${(await res.text()).slice(0, 160)})`);
        return null;
      }
      const data = await res.json();
      if (data?.candidates?.[0]?.finishReason === 'MAX_TOKENS' && !data?.candidates?.[0]?.content) return null;
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
      if (VERBOSE) console.log(`    (fetch error: ${e.message})`);
      await sleep(2000 * (attempt + 1));
    }
  }
  return null;
}

// Parse [{i, explanation}] → Map(i → cleaned explanation). Tolerant of fences/escapes.
function parseExplanations(text) {
  if (!text) return null;
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let arr = tryParse(text);
  if (arr === undefined) {
    const m = text.match(/\[[\s\S]*\]/);
    const candidate = m ? m[0] : text;
    arr = tryParse(candidate);
    if (arr === undefined) arr = tryParse(repairInvalidJsonEscapes(candidate));
  }
  if (!Array.isArray(arr)) return null;
  const out = new Map();
  for (const o of arr) {
    if (!o || typeof o !== 'object') continue;
    const i = Number(o.i);
    if (!Number.isInteger(i)) continue;
    const expl = cleanLatexString(o.explanation);
    if (expl) out.set(i, expl);
  }
  return out.size ? out : null;
}

// An explanation that QUOTES the actual answer from the source (« … » / "…" /
// '…') or shows a real math expression ($…digit…$) is answer-PROVIDING even if it
// also says "refer to the text". Never treat those as deflections — they help the
// student. (A short quoted term like «mot» is too short to be an answer.)
function hasAnswerContent(t) {
  return /[«"“”][^«»"“”]{8,}[»"“”]/.test(t)
    || /['‘’]\p{L}[^'‘’]{6,}['‘’]/u.test(t)
    || /\$[^$]*\d[^$]*\$/.test(t);
}

// A good explanation: substantive, not a refusal/deflection (unless it actually
// quotes the answer or shows math), and not a bare echo of the question.
function acceptExplanation(expl, q) {
  if (!expl || typeof expl !== 'string') return false;
  const t = expl.trim();
  if (t.length < 20 || t.length > 700) return false;
  if ((REFUSAL_RE.test(t) || DEFLECTION_RE.test(t)) && !hasAnswerContent(t)) return false;
  const e = norm(t);
  const qn = norm(q._displayText || q.question);
  if (e && qn && (e === qn || (qn.length > 25 && e === qn))) return false;
  return true;
}

// ── Collect eligible questions across all per-exam files ─────────────────────
function collect() {
  const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));
  const exams = [];
  const items = [];
  for (const f of files) {
    let e; try { e = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
    const subject = e.subject || '(unknown)';
    if (SUBJECT_FILTER && !SUBJECT_FILTER.has(subject)) continue;
    const wrapper = { f, e, subject };
    exams.push(wrapper);
    for (const sec of e.sections || []) {
      const passage = sec.passage || sec.passage_reconstructed || '';
      for (const q of sec.questions || []) {
        if (nonEmpty(q.explanation)) continue;          // resume: already has one
        if (EXCLUDED_TYPES.has(q.type)) continue;
        if (!isGrounded(q)) continue;
        items.push({ q, subject, wrapper, passage });
      }
    }
  }
  // Priority: math/science first (the audit's worst gap), then everything else.
  items.sort((a, b) => (MATH_SUBJECTS.has(b.subject) ? 1 : 0) - (MATH_SUBJECTS.has(a.subject) ? 1 : 0));
  return { exams, items };
}

async function main() {
  if (CLEAN) return runClean();
  const { items } = collect();
  const capped = Number.isFinite(LIMIT) ? items.slice(0, LIMIT) : items;
  console.log('='.repeat(64));
  console.log(`EXPLANATION GENERATOR  ${WRITE ? '(WRITE)' : '(dry-run)'}  model=${MODEL}`);
  console.log('='.repeat(64));
  console.log(`Eligible (grounded, no explanation): ${items.length}`);
  console.log(`This run: ${capped.length}  batch=${BATCH} concurrency=${CONCURRENCY} delay=${DELAY}ms`);
  if (SUBJECT_FILTER) console.log(`Subjects: ${[...SUBJECT_FILTER].join(', ')}`);
  console.log(`Excluding types: ${[...EXCLUDED_TYPES].join(', ') || '(none)'}`);
  if (!capped.length) { console.log('Nothing to do.'); return; }

  // Batch the flat item list.
  const batches = [];
  for (let i = 0; i < capped.length; i += BATCH) batches.push(capped.slice(i, i + BATCH));

  const changedExams = new Set();
  const samples = [];
  let processed = 0, ok = 0, failed = 0;
  const startTime = Date.now();

  const writeExam = (w) => {
    try { fs.writeFileSync(path.join(EXAM_DIR, w.f), JSON.stringify(w.e)); }
    catch (e) { console.error('  WARN write', w.f, e.message); }
  };
  function mirrorCatalog() {
    if (!WRITE || changedExams.size === 0 || !fs.existsSync(CATALOG)) return;
    try {
      const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
      if (!Array.isArray(catalog)) return;
      const byId = new Map();
      for (const w of changedExams) byId.set(w.e.exam_id || w.e.id, w.e);
      let n = 0;
      for (let i = 0; i < catalog.length; i++) {
        const src = byId.get(catalog[i].exam_id || catalog[i].id);
        if (src) { catalog[i] = src; n += 1; }
      }
      fs.writeFileSync(CATALOG, JSON.stringify(catalog));
      console.log(`  Catalog mirrored: ${n} exam(s).`);
    } catch (e) { console.error('WARN: catalog mirror failed:', e.message); }
  }

  let flushing = false;
  const onSignal = (sig) => {
    if (flushing) process.exit(130);
    flushing = true;
    console.log(`\n${sig} — ${ok} written so far, flushing catalog…`);
    mirrorCatalog();
    process.exit(130);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  async function runBatch(batch) {
    const text = await callGemini(buildPrompt(batch));
    const map = parseExplanations(text);
    const touched = new Set();
    for (let k = 0; k < batch.length; k++) {
      processed += 1;
      const expl = map ? map.get(k + 1) : null;
      if (!acceptExplanation(expl, batch[k].q)) { failed += 1; continue; }
      batch[k].q.explanation = expl;
      ok += 1;
      if (WRITE) { changedExams.add(batch[k].wrapper); touched.add(batch[k].wrapper); }
      if (samples.length < 16) {
        samples.push({ subject: batch[k].subject, type: batch[k].q.type,
          q: String(batch[k].q.question || '').replace(/\s+/g, ' ').slice(0, 72), expl });
      }
    }
    if (WRITE) for (const w of touched) writeExam(w);
  }

  try {
    let mirrorCounter = 0;
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const wave = batches.slice(i, i + CONCURRENCY);
      await Promise.all(wave.map(runBatch));
      const pct = ((processed / capped.length) * 100).toFixed(0);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  ${pct}% (${processed}/${capped.length}) — ${ok} ok, ${failed} failed — ${elapsed}s`);
      if (WRITE && ++mirrorCounter % 8 === 0) mirrorCatalog();
      if (DELAY && i + CONCURRENCY < batches.length) await sleep(DELAY);
    }
  } finally {
    mirrorCatalog();
  }

  console.log('-'.repeat(64));
  console.log(`Processed ${processed} — generated ${ok}, failed ${failed} (${((100 * ok) / Math.max(1, processed)).toFixed(0)}% yield)`);
  if (samples.length) {
    console.log('-'.repeat(64));
    console.log('SAMPLES:');
    for (const s of samples) {
      console.log(`\n  [${s.subject}/${s.type}] ${s.q}`);
      console.log(`     → ${s.expl}`);
    }
    console.log('');
  }
  console.log(WRITE ? 'Applied. Re-run audit_pedagogy.mjs to confirm coverage.' : 'Dry-run — pass --write to apply.');
}

// ── Clean mode: remove already-written explanations that are refusals or
// deflections (better a null than a "I need the text" non-explanation). Nulls
// them in BOTH per-exam files and the catalog. Run after a generation pass when
// the gate has been tightened. Use --write to persist; otherwise dry-run.
function runClean() {
  const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));
  const bySubject = {};
  const samples = [];
  const changed = new Map();
  let scanned = 0, removed = 0;

  for (const f of files) {
    let e; try { e = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
    const subject = e.subject || '(unknown)';
    if (SUBJECT_FILTER && !SUBJECT_FILTER.has(subject)) continue;
    let examChanged = false;
    for (const sec of e.sections || []) {
      for (const q of sec.questions || []) {
        if (!nonEmpty(q.explanation)) continue;
        scanned += 1;
        const t = String(q.explanation);
        if ((REFUSAL_RE.test(t) || DEFLECTION_RE.test(t)) && !hasAnswerContent(t)) {
          removed += 1;
          bySubject[subject] = (bySubject[subject] || 0) + 1;
          if (samples.length < 12) samples.push({ subject, q: String(q.question || '').replace(/\s+/g, ' ').slice(0, 64), e: t.replace(/\s+/g, ' ').slice(0, 90) });
          if (WRITE) { q.explanation = null; examChanged = true; }
        }
      }
    }
    if (examChanged) { changed.set(e.exam_id || e.id, e); fs.writeFileSync(path.join(EXAM_DIR, f), JSON.stringify(e)); }
  }

  if (WRITE && changed.size && fs.existsSync(CATALOG)) {
    try {
      const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
      if (Array.isArray(catalog)) {
        let n = 0;
        for (let i = 0; i < catalog.length; i++) {
          const src = changed.get(catalog[i].exam_id || catalog[i].id);
          if (src) { catalog[i] = src; n += 1; }
        }
        fs.writeFileSync(CATALOG, JSON.stringify(catalog));
        console.log(`Catalog mirrored: ${n} exam(s).`);
      }
    } catch (err) { console.error('WARN: catalog mirror failed:', err.message); }
  }

  console.log('='.repeat(64));
  console.log(`EXPLANATION CLEAN ${WRITE ? '(applied)' : '(dry-run)'}`);
  console.log('='.repeat(64));
  console.log(`Scanned explanations : ${scanned}`);
  console.log(`Deflections removed  : ${removed}`);
  console.log('-'.repeat(64));
  Object.entries(bySubject).sort((a, b) => b[1] - a[1]).forEach(([s, n]) => console.log(`  ${s.padEnd(24)} ${n}`));
  console.log('-'.repeat(64));
  console.log('SAMPLES removed:');
  for (const s of samples) { console.log(`  [${s.subject}] ${s.q}`); console.log(`     ✗ ${s.e}`); }
  console.log(WRITE ? '\nApplied. Re-run with --write (no --clean) to regenerate freshly-nulled items.' : '\nDry-run — pass --write to apply.');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });