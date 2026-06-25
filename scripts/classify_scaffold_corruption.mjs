#!/usr/bin/env node
// Read-only: precise classification of corruption to choose a fix strategy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAM_DIR = path.join(__dirname, '..', 'public', 'exams');
const MIDTOKEN_RE = /[A-Za-z0-9]\{\{\s*\d+\s*\}\}|\{\{\s*\d+\s*\}\}[A-Za-z0-9]/g;
const PLACEHOLDER_RE = /\{\{\s*\d+\s*\}\}/g;
const RENDER_TYPES = new Set(['calculation', 'fill_blank']); // these now render scaffold for math

function isMathExam(e) { return /math/i.test(e.subject || ''); }
function qText(q) { return String(q.prompt || q.question || q.text || ''); }

const files = fs.readdirSync(EXAM_DIR).filter((f) => f.startsWith('ex_') && f.endsWith('.json'));

const midByType = {};
const leakByType = {};
let midRenderable = 0, midRenderableCleanParts = 0;
let leakRenderable = 0;
const overlap = new Set();
const midFiles = new Set(), leakFiles = new Set();
let leakScaffoldEqualsModel = 0;

for (const f of files) {
  let e; try { e = JSON.parse(fs.readFileSync(path.join(EXAM_DIR, f), 'utf8')); } catch { continue; }
  if (!isMathExam(e)) continue;
  for (const sec of e.sections || []) {
    const qs = sec.questions || [];
    for (let qi = 0; qi < qs.length; qi++) {
      const q = qs[qi];
      const st = q.scaffold_text || '';
      const prompt = qText(q);
      const model = q.model_answer || q.solution || '';
      const key = `${f}#${qi}`;

      const hasMid = st && MIDTOKEN_RE.test(st);
      MIDTOKEN_RE.lastIndex = 0;
      if (hasMid) {
        midByType[q.type] = (midByType[q.type] || 0) + 1;
        midFiles.add(f);
        if (RENDER_TYPES.has(q.type)) {
          midRenderable++;
          // are answer_parts "clean" = count matches placeholder count and every part has a non-empty answer?
          const ph = (st.match(PLACEHOLDER_RE) || []).length;
          const aps = q.answer_parts || [];
          const allHaveAnswers = aps.length > 0 && aps.every((p) => p && String(p.answer || '').trim());
          if (aps.length === q.scaffold_blanks?.length && allHaveAnswers) midRenderableCleanParts++;
        }
      }

      const hasLeak = model && prompt && String(model).length > 20 && prompt.includes(String(model).slice(0, 20));
      if (hasLeak) {
        leakByType[q.type] = (leakByType[q.type] || 0) + 1;
        leakFiles.add(f);
        if (RENDER_TYPES.has(q.type)) leakRenderable++;
        if (st && model && st.slice(0, 40) === String(model).slice(0, 40)) leakScaffoldEqualsModel++;
      }

      if (hasMid && hasLeak) overlap.add(key);
    }
  }
}

console.log('MID-TOKEN by type   :', JSON.stringify(midByType));
console.log('  renderable (calc/fill_blank):', midRenderable, ' of which answer_parts clean:', midRenderableCleanParts);
console.log('  distinct files:', midFiles.size);
console.log('');
console.log('LEAK by type        :', JSON.stringify(leakByType));
console.log('  renderable (calc/fill_blank):', leakRenderable);
console.log('  scaffold_text head == model head:', leakScaffoldEqualsModel);
console.log('  distinct files:', leakFiles.size);
console.log('');
console.log('Overlap (both mid + leak):', overlap.size);
