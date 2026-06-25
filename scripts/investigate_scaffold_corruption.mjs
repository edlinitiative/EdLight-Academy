#!/usr/bin/env node
// Investigation only — dumps every mid-token {{n}} case and answer-leak case
// in math exams with full context. Read-only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');

const PLACEHOLDER_RE = /\{\{\s*\d+\s*\}\}/g;
const MIDTOKEN_RE = /[A-Za-z0-9]\{\{\s*\d+\s*\}\}|\{\{\s*\d+\s*\}\}[A-Za-z0-9]/g;

function isMathExam(e) {
  return /math/i.test(e.subject || e.subject_name || e.subject_code || '');
}
function qText(q) {
  return String(q.prompt || q.question || q.text || q.statement || '');
}

const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));

const midtokenCases = [];
const leakCases = [];

for (const f of files) {
  let e;
  try { e = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
  if (!isMathExam(e)) continue;
  for (const sec of e.sections || []) {
    const qs = sec.questions || [];
    for (let qi = 0; qi < qs.length; qi++) {
      const q = qs[qi];
      const st = q.scaffold_text || '';
      const prompt = qText(q);
      const model = q.model_answer || q.solution || '';

      // mid-token
      if (st) {
        const matches = [...st.matchAll(MIDTOKEN_RE)];
        if (matches.length) {
          // capture ±18 chars around each glued placeholder
          const contexts = matches.map((m) => {
            const start = Math.max(0, m.index - 18);
            const end = Math.min(st.length, m.index + m[0].length + 18);
            return st.slice(start, end).replace(/\n/g, '⏎');
          });
          midtokenCases.push({
            file: f, qi, type: q.type,
            glued: matches.map((m) => m[0]),
            contexts,
            placeholders: (st.match(PLACEHOLDER_RE) || []).length,
            blanks: q.scaffold_blanks,
            answerParts: q.answer_parts,
          });
        }
      }

      // leak
      if (model && prompt && String(model).length > 20 && prompt.includes(String(model).slice(0, 20))) {
        leakCases.push({
          file: f, qi, type: q.type,
          prompt: prompt.slice(0, 140).replace(/\n/g, '⏎'),
          model: String(model).slice(0, 140).replace(/\n/g, '⏎'),
          scaffoldHead: st.slice(0, 100).replace(/\n/g, '⏎'),
        });
      }
    }
  }
}

console.log('################ MID-TOKEN CASES:', midtokenCases.length, '################');
for (const c of midtokenCases) {
  console.log(`\n── ${c.file}  q#${c.qi}  (${c.type})  glued=[${c.glued.join(', ')}]  placeholders=${c.placeholders}`);
  c.contexts.forEach((ctx, i) => console.log(`   ctx: …${ctx}…`));
  console.log(`   blanks      : ${JSON.stringify(c.blanks)}`);
  console.log(`   answer_parts: ${JSON.stringify((c.answerParts || []).map((p) => ({ l: p.label, a: p.answer, opt: p.options ? 1 : 0 })))}`);
}

console.log(`\n\n################ LEAK CASES: ${leakCases.length} ################`);
for (const c of leakCases.slice(0, 30)) {
  console.log(`\n── ${c.file}  q#${c.qi}  (${c.type})`);
  console.log(`   prompt: ${c.prompt}`);
  console.log(`   model : ${c.model}`);
}

// Pattern stats for mid-token
const buckets = { digitBefore: 0, letterBefore: 0, digitAfter: 0, letterAfter: 0 };
for (const c of midtokenCases) {
  for (const g of c.glued) {
    if (/^\d\{\{/.test(g)) buckets.digitBefore++;
    else if (/^[A-Za-z]\{\{/.test(g)) buckets.letterBefore++;
    else if (/\}\}\d$/.test(g)) buckets.digitAfter++;
    else if (/\}\}[A-Za-z]$/.test(g)) buckets.letterAfter++;
  }
}
console.log('\n\n################ MID-TOKEN PATTERN BUCKETS ################');
console.log(JSON.stringify(buckets, null, 2));
