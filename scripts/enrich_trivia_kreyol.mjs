#!/usr/bin/env node
/**
 * enrich_trivia_kreyol.mjs
 *
 * Makes trivia fully playable in Kreyòl: adds `optionsHt` (answer options,
 * index-aligned with `options`) and `explanationHt` (Kreyòl explanation) to
 * every hand-written question in mobile/src/data/triviaData.ts, and fills any
 * missing `qHt`. The generated geography categories get template Kreyòl
 * explanations in their builders (see triviaData.ts) and are NOT touched here.
 *
 * Same conventions as enrich_trivia_explanations.mjs:
 *   • Line-based: each bank item is a single-line object literal; the script
 *     evaluates it, asks Gemini for the Kreyòl fields, and splices them back
 *     into the same line. File structure untouched.
 *   • Idempotent: lines already containing `optionsHt:` are skipped.
 *   • Gemini key from env → .env.local → .env; gemini-2.5-flash with
 *     thinkingBudget: 0; batched JSON keyed by index; quota-aware backoff.
 *   • HARD validation: optionsHt.length must equal options.length or the item
 *     is dropped (never a misaligned splice).
 *
 * Usage:
 *   node scripts/enrich_trivia_kreyol.mjs                 # dry-run
 *   node scripts/enrich_trivia_kreyol.mjs --write         # apply
 *   …optional: --limit=40 --batch=12 --model=gemini-2.5-flash --banks=A,B
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
const BATCH = Math.max(1, Number(arg('batch', 12)) || 12);
const MODEL = arg('model', 'gemini-2.5-flash');
const MAX_LEN = 140;

const ALL_BANKS = [
  'HAITI_HISTORY', 'HAITI_GEO', 'HAITI_CULTURE', 'HAITI_PEOPLE', 'HAITI_PROVERBS',
  'SCIENCES', 'HAITI_SYMBOLS', 'HAITI_SPORT',
  'MATHS_ECLAIR', 'CHIMIE_SYMBOLES', 'BIO_CORPS', 'ANGLAIS_VOCAB',
];
const BANKS = arg('banks', '') ? arg('banks', '').split(',') : ALL_BANKS;

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

const src = fs.readFileSync(DATA, 'utf8');
const lines = src.split('\n');

function bankRange(name) {
  const start = lines.findIndex((l) => l.startsWith(`const ${name} = [`));
  if (start === -1) return null;
  let end = start;
  while (end < lines.length && lines[end].trim() !== '];') end++;
  return { start: start + 1, end };
}

function parseItem(line) {
  const t = line.trim().replace(/,\s*$/, '');
  if (!t.startsWith('{') || !t.endsWith('}')) return null;
  try {
    return new Function(`return (${t});`)();
  } catch {
    return null;
  }
}

/**
 * Purely non-translatable options (numbers, chemical symbols, single years,
 * math expressions) — skip the LLM for optionsHt and reuse the FR array,
 * but still ask for explanationHt.
 */
function optionsAreUniversal(options) {
  return options.every((o) => /^[0-9\s.,%×÷+\-=²³/!°]+$/.test(String(o)) || /^[A-Z][a-z]?$/.test(String(o)));
}

// ── Collect work ─────────────────────────────────────────────────────────────
const work = []; // { lineNo, bank, item, needsOptions, optionsHt?, explanationHt?, qHt? }
let already = 0;
for (const bank of BANKS) {
  const range = bankRange(bank);
  if (!range) { console.warn(`bank not found: ${bank}`); continue; }
  for (let i = range.start; i < range.end; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('{')) continue;
    if (/\boptionsHt\s*:/.test(line)) { already++; continue; }
    const item = parseItem(line);
    if (!item || !Array.isArray(item.options)) { console.warn(`unparseable line ${i + 1} in ${bank}`); continue; }
    const universal = optionsAreUniversal(item.options);
    work.push({
      lineNo: i,
      bank,
      item,
      needsOptions: !universal,
      optionsHt: universal ? [...item.options] : undefined,
    });
  }
}

const todo = work.slice(0, LIMIT);
console.log(`banks: ${BANKS.length} · already kreyòl: ${already} · to enrich: ${todo.length}${Number.isFinite(LIMIT) ? ` (limit ${LIMIT})` : ''} · universal-options (no option translation): ${todo.filter((w) => !w.needsOptions).length}`);

// ── Gemini ───────────────────────────────────────────────────────────────────
const KEY = findKey();
let inTokens = 0, outTokens = 0;

async function generateBatch(items) {
  const list = items.map((w, i) => {
    const parts = [
      `${i}. Q(fr): ${w.item.q}`,
      w.item.qHt ? null : `   (qHt manquant — fournis "qHt")`,
      w.needsOptions ? `   options: ${JSON.stringify(w.item.options)}` : null,
      `   explication(fr): ${w.item.explanation || '(aucune)'}`,
    ].filter(Boolean);
    return parts.join('\n');
  }).join('\n');
  const wantQht = items.some((w) => !w.item.qHt);
  const prompt = `Tradui an kreyòl ayisyen (òtograf ofisyèl) chak eleman quiz ki anba a.
Pou chak endèks, retounen yon objè JSON avèk:
- "explanationHt": tradiksyon eksplikasyon franse a (max 120 karaktè, yon sèl fraz)
${todo.some((w) => w.needsOptions) ? '- "optionsHt": tablo ki gen MENM longè ak "options", eleman pa eleman. KENBE non pwòp, senbòl chimik, chif, dat, ekspresyon matematik JAN YO YE (pa tradui "Pb", "42", "Accra", "1804"). Tradui sèlman mo/fraz ki ka tradui.' : ''}
${wantQht ? '- "qHt": tradiksyon kesyon an si yo mande l' : ''}
Si yon eleman pa gen "options" nan lis la, pa retounen "optionsHt" pou li.
Repons JSON strik: {"0": {...}, "1": {...}, …}

${list}`;
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

if (todo.length && !KEY) {
  console.error('ERROR: GEMINI_API_KEY not found (env, .env.local, .env).');
  process.exit(1);
}

let dropped = 0;
for (let off = 0; off < todo.length; off += BATCH) {
  const slice = todo.slice(off, off + BATCH);
  const out = await generateBatch(slice);
  for (let i = 0; i < slice.length; i++) {
    const w = slice[i];
    const o = out[String(i)];
    if (!o || typeof o !== 'object') { dropped++; console.warn(`  no result for "${w.item.q.slice(0, 50)}…"`); continue; }
    let e = typeof o.explanationHt === 'string' ? o.explanationHt.trim() : '';
    if (e.length > MAX_LEN) e = e.slice(0, MAX_LEN - 1).replace(/\s+\S*$/, '') + '…';
    w.explanationHt = e || undefined;
    if (!w.item.qHt && typeof o.qHt === 'string' && o.qHt.trim()) w.qHt = o.qHt.trim();
    if (w.needsOptions) {
      const oh = Array.isArray(o.optionsHt) ? o.optionsHt.map((x) => String(x)) : null;
      // HARD alignment check — a misaligned option array would corrupt gameplay.
      if (oh && oh.length === w.item.options.length && oh.every((x) => x.trim().length > 0)) {
        w.optionsHt = oh;
      } else {
        dropped++;
        console.warn(`  optionsHt misaligned for "${w.item.q.slice(0, 50)}…" — options skipped`);
      }
    }
  }
  const done = Math.min(off + BATCH, todo.length);
  console.log(`  ${done}/${todo.length} · tokens in=${inTokens} out=${outTokens}`);
}

// ── Splice ───────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
let wrote = 0;
for (const w of todo) {
  const line = lines[w.lineNo];
  // Per-field presence checks so a re-run over a PARTIAL line (e.g. it got
  // explanationHt but its optionsHt was dropped) never duplicates a field.
  const additions = [];
  if (w.qHt && !/\bqHt\s*:/.test(line)) additions.push(`qHt: "${esc(w.qHt)}"`);
  if (w.optionsHt && !/\boptionsHt\s*:/.test(line)) additions.push(`optionsHt: [${w.optionsHt.map((o) => `"${esc(o)}"`).join(', ')}]`);
  if (w.explanationHt && !/\bexplanationHt\s*:/.test(line)) additions.push(`explanationHt: "${esc(w.explanationHt)}"`);
  if (!additions.length) continue;
  lines[w.lineNo] = line.replace(/\s*}\s*,?\s*$/, (m) => `, ${additions.join(', ')}${m.trimStart()}`.replace(/^,/, ','));
  if (!/explanationHt|optionsHt/.test(lines[w.lineNo])) console.warn(`splice failed at line ${w.lineNo + 1}`);
  else wrote++;
}

const cost = (inTokens * 0.3 + outTokens * 2.5) / 1e6;
console.log(`\n${WRITE ? 'Writing' : 'Would write'} ${wrote} items (${dropped} dropped/partial).`);
console.log(`Gemini usage: ${inTokens} in / ${outTokens} out ≈ $${cost.toFixed(3)}`);

if (WRITE && wrote) {
  fs.writeFileSync(DATA, lines.join('\n'));
  console.log(`Wrote ${DATA}`);
} else if (!WRITE) {
  for (const w of todo.filter((x) => x.explanationHt).slice(0, 3)) {
    console.log(`  e.g. [${w.bank}] ${w.item.q.slice(0, 60)} → ${w.explanationHt}${w.optionsHt && w.needsOptions ? ` · optionsHt: ${JSON.stringify(w.optionsHt)}` : ''}`);
  }
  console.log('Re-run with --write to apply.');
}
