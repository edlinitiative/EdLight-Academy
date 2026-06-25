#!/usr/bin/env node
/**
 * tag_scaffold_quality.mjs
 *
 * Lights up the authored "solution-with-blanks" scaffolds that the app currently
 * hides for non-math subjects. The audit found 4,180 non-math scaffolds rendering
 * as 0 interactive — blocked by two guards in usesScaffold():
 *   1. short_answer is hard-blocked, and
 *   2. non-math questions only scaffold when they have NO single `correct`.
 *
 * This pass evaluates each BLOCKED scaffold against a quality gate and writes an
 * explicit `scaffold_ready: true|false` flag. usesScaffold() then honors the flag.
 * We tag ONLY the blocked set, so the 717 already-working math scaffolds and any
 * currently-rendering scaffold are left untouched (no regression).
 *
 * Quality gate — a scaffold is READY only when ALL hold:
 *   • Structural: answer_parts present, length == scaffold_blanks length, and
 *     every part has a non-empty answer.
 *   • Not a refusal: no blank answer is an LLM "I need the text" non-answer.
 *   • Not a label echo: no blank answer is hidden inside its own ALWAYS-VISIBLE
 *     label (the student would just read it off the prompt). The solution prose
 *     in scaffold_text is NOT treated as a leak — the app keeps it behind a
 *     "Voir la démarche" reveal, exactly like every scaffold's answer key.
 *   • Not an open essay: inherently open summary/opinion/free-composition prompts
 *     are rejected only when their expected answers are long prose (true essays);
 *     short key-term answers under such prompts still grade fine.
 *
 * Patches BOTH public/exams/<id>.json and public/exam_catalog.json. Offline.
 *
 * Usage:
 *   node scripts/tag_scaffold_quality.mjs            # dry-run (report + samples)
 *   node scripts/tag_scaffold_quality.mjs --write     # apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');
const CATALOG = path.join(__dirname, '..', 'public', 'exam_catalog.json');
const WRITE = process.argv.includes('--write');

// Mirror the app (src/pages/ExamTake.tsx).
const MATH_SUBJECTS = new Set(['Mathématiques', 'Physique', 'Chimie', 'SVT', 'Informatique']);
const NATIVE_INPUT_TYPES = new Set(['multiple_choice', 'multiple_select', 'true_false', 'matching']);

const nonEmpty = (v) => {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0 && v.some((x) => String(x ?? '').trim());
  return String(v).trim().length > 0;
};
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\$[^$]*\$/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// LLM "I can't answer without the source" non-answers (FR / ES / EN).
const REFUSAL_RE = /\b(sin (el |la |los |las )?(texto|frase|imagen|parrafo|documento)|necesito (el |la |mas |más )?(texto|frase|informacion)|no puedo (dar|proporcionar|responder|generar|determinar)|sans (le |la )?(texte|document|image)|je ne peux pas|impossible de (repondre|determiner)|i (need|cannot|can ?not|can'?t|am unable)|without (the )?(text|passage|image|document|context)|requires? the (text|passage)|provide the (text|passage))\b/i;

// Inherently open prompts (summary / opinion / free composition) — not fillable.
const OPEN_TASK_RE = /\b(resum|résum|resumir|resumen|summar|opinion|opinión|votre avis|ton avis|a tu juicio|segun tu|según tu|imagine|imagina|imaginez|redige|rédige|redacta|redacte|compose|composez|invent|escrib[ae] (un|una|tu)|write (a|an|your) (paragraph|letter|essay|story|composition|text)|exprime|exprimez|describe in your own|dans tes propres mots|en tus propias palabras)\b/i;

function evaluateScaffold(q) {
  const parts = q.answer_parts || [];
  const blanks = q.scaffold_blanks || [];
  // Structural
  if (!Array.isArray(parts) || parts.length === 0) return { ready: false, reason: 'no_answer_parts' };
  if (parts.length !== blanks.length) return { ready: false, reason: 'blank_count_mismatch' };
  if (!parts.every((p) => p && nonEmpty(p.answer))) return { ready: false, reason: 'empty_answer' };

  // Refusal non-answers are always disqualifying.
  for (const p of parts) {
    if (REFUSAL_RE.test(String(p.answer))) return { ready: false, reason: 'refusal_answer' };
  }

  // Label echo — the answer is hidden inside its own ALWAYS-VISIBLE label, so the
  // student reads it straight off the prompt. (The scaffold_text solution prose is
  // NOT an upfront leak: the app hides it behind a "Voir la démarche" reveal, just
  // like every other scaffold's answer key — so we deliberately do not penalize it.)
  for (const p of parts) {
    const aNorm = norm(p.answer);
    const lNorm = norm(p.label);
    if (aNorm.length >= 4 && lNorm && (aNorm === lNorm || lNorm.includes(aNorm))) {
      return { ready: false, reason: 'label_echo' };
    }
  }

  // Open-composition prompts (résumé / opinion / free writing) are unfit only when
  // the expected answers are long prose — those are essays, not fillable blanks.
  // Short key-term answers under such prompts still grade fine (AI-graded if long).
  if (OPEN_TASK_RE.test(q.question || '')) {
    const avgLen = parts.reduce((s, p) => s + String(p.answer).length, 0) / parts.length;
    if (avgLen > 80) return { ready: false, reason: 'open_task' };
  }

  return { ready: true, reason: 'ok' };
}

// Is this question currently BLOCKED (has scaffold data but never renders interactive)?
function isBlocked(q, subject) {
  if (q.type === 'essay') return false;
  if (NATIVE_INPUT_TYPES.has(q.type)) return false;
  if (!nonEmpty(q.scaffold_text) || !nonEmpty(q.scaffold_blanks)) return false;
  if (q.type === 'short_answer') return true;                 // hard-blocked today
  if (!MATH_SUBJECTS.has(subject) && nonEmpty(q.correct)) return true; // non-math w/ correct
  return false;
}

function main() {
  const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));
  const changed = new Map();
  const bySubject = {};
  const reasons = {};
  let blocked = 0, ready = 0;
  const accepted = [], rejected = [];

  for (const f of files) {
    let ex;
    try { ex = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
    const subject = ex.subject || '(unknown)';
    let examChanged = false;

    for (const sec of ex.sections || []) {
      for (const q of sec.questions || []) {
        if (!isBlocked(q, subject)) continue;
        blocked += 1;
        const { ready: isReady, reason } = evaluateScaffold(q);
        reasons[reason] = (reasons[reason] || 0) + 1;
        (bySubject[subject] ||= { blocked: 0, ready: 0 });
        bySubject[subject].blocked += 1;
        if (isReady) { bySubject[subject].ready += 1; ready += 1; }

        if (WRITE) { if (q.scaffold_ready !== isReady) { q.scaffold_ready = isReady; examChanged = true; } }
        else { q.scaffold_ready = isReady; } // for in-memory sampling only

        const sample = {
          subject, type: q.type,
          q: String(q.question || '').replace(/\s+/g, ' ').slice(0, 70),
          parts: (q.answer_parts || []).map((p) => `${p.label}=${p.answer}`.replace(/\s+/g, ' ').slice(0, 50)),
          reason,
        };
        if (isReady && accepted.length < 8) accepted.push(sample);
        if (!isReady && rejected.length < 10) rejected.push(sample);
      }
    }
    if (examChanged) {
      changed.set(ex.exam_id || ex.id, ex);
      fs.writeFileSync(path.join(EXAM_DIR, f), JSON.stringify(ex));
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

  const pct = (n, d) => (d ? ((100 * n) / d).toFixed(0) + '%' : '—');
  console.log('='.repeat(72));
  console.log(`SCAFFOLD QUALITY TAGGER ${WRITE ? '(applied)' : '(dry-run)'}`);
  console.log('='.repeat(72));
  console.log(`Blocked scaffolds evaluated : ${blocked}`);
  console.log(`  → scaffold_ready = true   : ${ready} (${pct(ready, blocked)})  ← newly interactive`);
  console.log(`  → scaffold_ready = false  : ${blocked - ready} (${pct(blocked - ready, blocked)})  (stay text box)`);
  console.log('-'.repeat(72));
  console.log('PER SUBJECT (ready / blocked):');
  Object.entries(bySubject).sort((a, b) => b[1].blocked - a[1].blocked)
    .forEach(([s, r]) => console.log(`  ${s.padEnd(24)} ${String(r.ready).padStart(4)} / ${String(r.blocked).padStart(4)}  (${pct(r.ready, r.blocked)})`));
  console.log('-'.repeat(72));
  console.log('REJECTION / ACCEPT REASONS:');
  Object.entries(reasons).sort((a, b) => b[1] - a[1])
    .forEach(([r, n]) => console.log(`  ${r.padEnd(22)} ${n}`));
  console.log('-'.repeat(72));
  console.log('ACCEPTED samples (now interactive):');
  for (const s of accepted) { console.log(`  [${s.subject}/${s.type}] ${s.q}`); console.log(`     ${s.parts.join('  |  ')}`); }
  console.log('-'.repeat(72));
  console.log('REJECTED samples (stay text box):');
  for (const s of rejected) { console.log(`  [${s.reason}] [${s.subject}/${s.type}] ${s.q}`); console.log(`     ${s.parts.join('  |  ')}`); }
  console.log('='.repeat(72));
  if (!WRITE) console.log('Dry-run — pass --write to apply.');
}

main();
