#!/usr/bin/env node
/**
 * add_fill_templates.mjs
 *
 * Turns the handful of remaining `kind:'open'` math blanks that are *structured*
 * (so a dropdown of full alternatives is awkward) into inline fill-in templates:
 * the answer is shown "written out with holes" and the student completes the key
 * pieces (a bound, a sign, an exponent…).
 *
 * Handles two families that the distractor pass intentionally skipped:
 *   • Interval unions:        ]a, b[ \cup ]c, d[   →  ]□, □[ ∪ ]□, □[   (4 holes)
 *   • Complex exponentials:   r e^{iθ}             →  □ e^{iθ}, θ = □    (2 holes)
 *
 * Each converted answer_part gains { template, slots, kind:'fill' } and KEEPS its
 * original `answer` (for "show answer" + holistic fallback grading). Matrices and
 * free prose are left as plain text inputs.
 *
 * Patches BOTH public/exams/<id>.json and public/exam_catalog.json so the prebuild
 * re-split keeps the templates. Offline (no API).
 *
 * Usage:
 *   node scripts/add_fill_templates.mjs           # dry-run (report + samples)
 *   node scripts/add_fill_templates.mjs --write    # apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');
const CATALOG = path.join(__dirname, '..', 'public', 'exam_catalog.json');
const WRITE = process.argv.includes('--write');

const isMathExam = (e) => /math/i.test(e.subject || '');
const stripDollars = (s) => String(s ?? '').trim().replace(/^\$+/, '').replace(/\$+$/, '').trim();
const widthFor = (s) => Math.min(8, Math.max(2, String(s).replace(/[\\{}]/g, '').length || 3));

// ── Slot builders (add tolerant alternatives so students can type plainly) ──
function boundSlot(raw) {
  const v = String(raw).trim();
  if (/^[-+]?\d+(?:[.,]\d+)?$/.test(v)) return { answer: v, kind: 'number', width: widthFor(v) };
  const slot = { answer: v, kind: 'text', width: widthFor(v) };
  const alts = new Set();
  if (/^-\s*\\infty$/.test(v) || /-\\infty/.test(v)) {
    ['-\\infty', '-infty', '-infini', '-inf', '-∞', '-oo'].forEach((a) => alts.add(a));
  } else if (/\\infty/.test(v)) {
    ['+\\infty', '\\infty', '+infini', 'infini', 'inf', '+inf', '∞', '+∞', 'oo'].forEach((a) => alts.add(a));
  }
  const ln = v.match(/\\ln\s*\(?\s*(\d+)\s*\)?/);
  if (ln) ['ln' + ln[1], 'ln(' + ln[1] + ')', '\\ln(' + ln[1] + ')', '\\ln ' + ln[1]].forEach((a) => alts.add(a));
  alts.delete(v);
  if (alts.size) slot.alternatives = [...alts];
  return slot;
}
function moduleSlot(raw) {
  const v = String(raw).trim();
  const slot = { answer: v, kind: 'text', width: widthFor(v) };
  const alts = new Set();
  const sq = v.match(/^(\d*)\s*\\sqrt\s*\{?(\d+)\}?$/);
  if (sq) {
    const c = sq[1] || '', r = sq[2];
    [`${c}\\sqrt{${r}}`, `${c}\\sqrt ${r}`, `${c}sqrt(${r})`, `${c}sqrt${r}`].forEach((a) => alts.add(a.trim()));
  }
  alts.delete(v);
  if (alts.size) slot.alternatives = [...alts];
  return slot;
}
function argSlot(raw) {
  const v = String(raw).trim();
  const slot = { answer: v, kind: 'text', width: widthFor(v) };
  const alts = new Set();
  const f = v.match(/\\frac\s*\{\s*\\?pi\s*\}\s*\{\s*(\d+)\s*\}/i) || v.match(/\\?pi\s*\/\s*(\d+)/i);
  if (f) { const d = f[1]; [`\\frac{\\pi}{${d}}`, `\\pi/${d}`, `pi/${d}`, `π/${d}`].forEach((a) => alts.add(a)); }
  alts.delete(v);
  if (alts.size) slot.alternatives = [...alts];
  return slot;
}

// ── Pattern → template builders. Return {template, slots} or null. ──
const RE_INTERVAL = /^([[\]])\s*([^,[\]]+?)\s*,\s*([^,[\]]+?)\s*([[\]])\s*\\cup\s*([[\]])\s*([^,[\]]+?)\s*,\s*([^,[\]]+?)\s*([[\]])$/;
const RE_EXP = /^(.+?)\s*e\^\{\s*i\s*(.+?)\s*\}$/;

function buildTemplate(rawAnswer) {
  const a = stripDollars(rawAnswer);

  const mi = a.match(RE_INTERVAL);
  if (mi) {
    const [, b1, lo1, hi1, b2, b3, lo2, hi2, b4] = mi;
    return {
      template: `${b1}{0}, {1}${b2} \\cup ${b3}{2}, {3}${b4}`,
      slots: [boundSlot(lo1), boundSlot(hi1), boundSlot(lo2), boundSlot(hi2)],
    };
  }

  const me = a.match(RE_EXP);
  if (me && /sqrt|\d|\\frac|pi/i.test(me[1])) {
    const mod = me[1].trim();
    const arg = me[2].trim();
    // Skip degenerate captures (e.g. argument that still holds a stray brace).
    if (!mod || !arg || /[{][^}]*$/.test(arg)) return null;
    return {
      template: `{0}\\,e^{i\\theta},\\ \\theta={1}`,
      slots: [moduleSlot(mod), argSlot(arg)],
    };
  }

  return null;
}

function main() {
  const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));
  const changed = new Map();
  let converted = 0, scanned = 0;
  const byKind = { interval: 0, exponential: 0 };
  const samples = [];

  for (const f of files) {
    let exam;
    try { exam = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
    if (!isMathExam(exam)) continue;
    let examChanged = false;

    for (const sec of exam.sections || []) {
      for (const q of sec.questions || []) {
        if (!q.scaffold_text || !Array.isArray(q.answer_parts)) continue;
        for (const p of q.answer_parts) {
          if (!p || p.template || Array.isArray(p.options)) continue; // already interactive
          if (p.kind !== 'open') continue;
          scanned += 1;
          const built = buildTemplate(p.answer);
          if (!built) continue;
          p.template = built.template;
          p.slots = built.slots;
          p.kind = 'fill';
          converted += 1;
          examChanged = true;
          byKind[built.slots.length === 4 ? 'interval' : 'exponential'] += 1;
          if (samples.length < 12) samples.push({ answer: p.answer, template: built.template, slots: built.slots });
        }
      }
    }
    if (examChanged) {
      changed.set(exam.exam_id || exam.id, exam);
      if (WRITE) fs.writeFileSync(path.join(EXAM_DIR, f), JSON.stringify(exam));
    }
  }

  if (WRITE && changed.size > 0 && fs.existsSync(CATALOG)) {
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
    } catch (e) { console.error('WARN: catalog mirror failed:', e.message); }
  }

  console.log(`Scanned ${scanned} open blanks. ${WRITE ? 'Converted' : 'Would convert'} ${converted} → fill templates`);
  console.log(`  interval unions: ${byKind.interval}   complex exponentials: ${byKind.exponential}`);
  for (const s of samples) {
    console.log(`\n  answer:   ${s.answer}`);
    console.log(`  template: ${s.template}`);
    console.log(`  slots:    ${s.slots.map((x) => x.answer + (x.alternatives ? ` (≈ ${x.alternatives.slice(0, 3).join(', ')})` : '')).join('  |  ')}`);
  }
  if (!WRITE && converted > 0) console.log('\nDry-run — pass --write to apply.');
}

main();
