#!/usr/bin/env node
/**
 * enrich_trivia_explanations.mjs
 *
 * Adds a one-sentence French `explanation` to every hand-written trivia
 * question in mobile/src/data/triviaData.ts, powering the post-round
 * "Revois tes erreurs" recap. The three generated geography categories
 * (capitals/currencies/flags) get template explanations in the builders and
 * are NOT touched here.
 *
 * How it works:
 *   • Line-based: each bank item is a single-line object literal; the script
 *     evaluates the line to read q/options/answer, asks Gemini for a short
 *     factual explanation of the correct answer, and splices
 *     `, explanation: "…"` back into the same line. File structure untouched.
 *   • Deterministic first: trivially computable maths items ("Combien font
 *     7 × 8 ?") are templated locally, no tokens spent.
 *   • Idempotent: lines already containing `explanation:` are skipped, so a
 *     re-run only fills gaps.
 *   • Same Gemini conventions as generate_explanations.mjs: key from env →
 *     .env.local → .env; gemini-2.5-flash with thinkingBudget: 0; batched
 *     JSON responses keyed by index so a dropped item can't land on the
 *     wrong question; quota-aware backoff.
 *
 * Usage:
 *   node scripts/enrich_trivia_explanations.mjs                 # dry-run
 *   node scripts/enrich_trivia_explanations.mjs --write         # apply
 *   node scripts/enrich_trivia_explanations.mjs --write --limit=40
 *   …optional: --batch=20 --model=gemini-2.5-flash --banks=HAITI_HISTORY,SCIENCES
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'mobile', 'src', 'data', 'triviaData.ts');

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const flag = (name) => process.argv.includes(`--${name}`);

const WRITE = flag('write');
const LIMIT = Number(arg('limit', Infinity)) || Infinity;
const BATCH = Math.max(1, Number(arg('batch', 20)) || 20);
const MODEL = arg('model', 'gemini-2.5-flash');
const MAX_LEN = 140; // hard ceiling; prompt asks for ≤120

const ALL_BANKS = [
  'HAITI_HISTORY', 'HAITI_GEO', 'HAITI_CULTURE', 'HAITI_PEOPLE', 'HAITI_PROVERBS',
  'SCIENCES', 'HAITI_SYMBOLS', 'HAITI_SPORT',
  'MATHS_ECLAIR', 'CHIMIE_SYMBOLES', 'BIO_CORPS', 'ANGLAIS_VOCAB',
];
const BANKS = arg('banks', '') ? arg('banks', '').split(',') : ALL_BANKS;

// ── Gemini key (env → .env.local → .env), same lookup as generate_explanations ──
function findKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
  }
  return null;
}

// ── Parse the file into bank line-ranges ─────────────────────────────────────
const src = fs.readFileSync(DATA, 'utf8');
const lines = src.split('\n');

function bankRange(name) {
  const start = lines.findIndex((l) => l.startsWith(`const ${name} = [`));
  if (start === -1) return null;
  let end = start;
  while (end < lines.length && lines[end].trim() !== '];') end++;
  return { start: start + 1, end }; // item lines are (start, end) exclusive
}

/** Evaluate a single-line item literal (trusted, our own file). */
function parseItem(line) {
  const t = line.trim().replace(/,\s*$/, '');
  if (!t.startsWith('{') || !t.endsWith('}')) return null;
  try {
    return new Function(`return (${t});`)();
  } catch {
    return null;
  }
}

// ── Deterministic maths templates — no tokens for pure arithmetic ────────────
function mathsTemplate(item) {
  const correct = item.options[item.answer];
  const m = item.q.match(/^Combien font (.+?) \?$/) || item.q.match(/^Combien vaut (.+?) \?$/);
  if (!m) return null;
  const expr = m[1].replace(/\s*\(.*\)\s*/, '').trim();
  // Only template plain arithmetic the answer restates (avoid fractions/π prose).
  if (!/^[0-9\s+\-×÷%²³!.,]+$/.test(expr)) return null;
  return `${expr} = ${correct}.`;
}

// ── Collect work items ───────────────────────────────────────────────────────
const work = []; // { lineNo, bank, q, correct, explanation? }
let already = 0;
for (const bank of BANKS) {
  const range = bankRange(bank);
  if (!range) { console.warn(`bank not found: ${bank}`); continue; }
  for (let i = range.start; i < range.end; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('{')) continue;
    if (/\bexplanation\s*:/.test(line)) { already++; continue; }
    const item = parseItem(line);
    if (!item || !Array.isArray(item.options)) { console.warn(`unparseable line ${i + 1} in ${bank}`); continue; }
    const correct = String(item.options[item.answer]);
    const tpl = bank === 'MATHS_ECLAIR' ? mathsTemplate(item) : null;
    work.push({ lineNo: i, bank, q: item.q, correct, explanation: tpl || undefined });
  }
}

const templated = work.filter((w) => w.explanation);
const needLlm = work.filter((w) => !w.explanation).slice(0, LIMIT);
console.log(`banks: ${BANKS.length} · already explained: ${already} · templated (maths): ${templated.length} · need LLM: ${needLlm.length}${Number.isFinite(LIMIT) ? ` (limit ${LIMIT})` : ''}`);

// ── Gemini call ──────────────────────────────────────────────────────────────
const KEY = findKey();
let inTokens = 0, outTokens = 0;

async function generateBatch(items) {
  const list = items.map((w, i) => `${i}. Q: ${w.q}\n   Bonne réponse: ${w.correct}`).join('\n');
  const prompt = `Pour chaque question de quiz ci-dessous, écris UNE phrase d'explication en français (max 120 caractères) qui dit pourquoi la bonne réponse est correcte, avec un fait précis. Pas de "car c'est la bonne réponse", pas de préambule. Pour les proverbes haïtiens, donne le sens du proverbe. Réponds en JSON strict: {"0": "…", "1": "…", …} — une entrée par index.\n\n${list}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      const wait = 2000 * (attempt + 1);
      console.log(`  ${res.status} — backing off ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    inTokens += j.usageMetadata?.promptTokenCount || 0;
    outTokens += (j.usageMetadata?.candidatesTokenCount || 0) + (j.usageMetadata?.thoughtsTokenCount || 0);
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(text);
  }
  throw new Error('Gemini: retries exhausted');
}

if (needLlm.length && !KEY) {
  console.error('ERROR: GEMINI_API_KEY not found (env, .env.local, .env) — only maths templates can be applied.');
  if (!templated.length) process.exit(1);
}

if (needLlm.length && KEY) {
  for (let off = 0; off < needLlm.length; off += BATCH) {
    const slice = needLlm.slice(off, off + BATCH);
    const out = await generateBatch(slice);
    for (let i = 0; i < slice.length; i++) {
      let e = typeof out[String(i)] === 'string' ? out[String(i)].trim() : '';
      if (e.length > MAX_LEN) e = e.slice(0, MAX_LEN - 1).replace(/\s+\S*$/, '') + '…';
      if (e) slice[i].explanation = e;
      else console.warn(`  no explanation returned for "${slice[i].q.slice(0, 50)}…"`);
    }
    const done = Math.min(off + BATCH, needLlm.length);
    console.log(`  ${done}/${needLlm.length} · tokens in=${inTokens} out=${outTokens}`);
  }
}

// ── Splice back into the file ────────────────────────────────────────────────
const ready = work.filter((w) => w.explanation);
for (const w of ready) {
  const line = lines[w.lineNo];
  const esc = w.explanation.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // Insert before the closing ` }` of the single-line literal (keep trailing comma).
  lines[w.lineNo] = line.replace(/\s*}\s*,?\s*$/, (m) => `, explanation: "${esc}"${m.trimStart()}`.replace(/^,/, ','));
  if (!/explanation/.test(lines[w.lineNo])) console.warn(`splice failed at line ${w.lineNo + 1}`);
}

// $0.30/1M input + $2.50/1M output for 2.5-flash
const cost = (inTokens * 0.3 + outTokens * 2.5) / 1e6;
console.log(`\n${WRITE ? 'Writing' : 'Would write'} ${ready.length} explanations (${templated.length} templated, ${ready.length - templated.length} generated).`);
console.log(`Gemini usage: ${inTokens} in / ${outTokens} out ≈ $${cost.toFixed(3)}`);

if (WRITE && ready.length) {
  fs.writeFileSync(DATA, lines.join('\n'));
  console.log(`Wrote ${DATA}`);
} else if (!WRITE) {
  for (const w of ready.slice(0, 5)) console.log(`  e.g. [${w.bank}] ${w.q} → ${w.explanation}`);
  console.log('Re-run with --write to apply.');
}
