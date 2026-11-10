/**
 * Exam display audit — what the PHONE actually shows for every string of every
 * exam in public/exams/*.json, run through the app's own rendering decisions.
 *
 *   npx tsx scripts/audit_exam_display.ts            # summary + samples
 *   npx tsx scripts/audit_exam_display.ts --json out  # every finding as JSON
 *
 * Surfaces modelled (all import the real mobile/shared code, no copies):
 *   - MathText: delimited text → KaTeX auto-render (each delimited formula must
 *     parse with throwOnError, the prose around it must be clean); otherwise
 *     → proseSegments + mathToText (the result must be clean).
 *   - Sentence-with-blanks (InlineFillBlank, engine Prompt with holes):
 *     BLANK_RE split → balanceMathAcrossBlanks → flowPieces → each piece clean.
 *   - Widget labels (mathToText), MCQ options (MathText).
 *
 * "Clean" = no LaTeX left for a student to read: no `$`, no backslash command,
 * no `{`/`}`, no `^`/`_` markup, no double-escaped noise.
 */
import fs from 'node:fs';
import path from 'node:path';
import katex from 'katex';
import { mathToRuns, type MathRun } from '../mobile/src/utils/mathText';
import { katexSource } from '../mobile/src/utils/mathRouting';
import { flowPieces } from '../mobile/src/utils/flowPieces';
import { proseSegments, stripProseMarks } from '../mobile/src/utils/proseMarks';
import { balanceMathAcrossBlanks } from '../shared/mathBlanks';
import { workedPart } from '../mobile/src/utils/scaffoldText';
import { hasTable, splitTables } from '../mobile/src/utils/tables';
import { examTextHtml } from '../src/utils/examTextHtml';

/** --web: audit what the website shows (src/utils/examTextHtml) instead. */
const WEB = process.argv.includes('--web');
import { compileQuestion } from '../shared/question/compile';
import { flattenQuestions, normalizeSubject } from '../shared/examUtils';

const BLANK_RE = /_{4,}|\.{4,}/g;
const DIR = path.join(__dirname, '..', 'public', 'exams');

type Finding = { exam: string; title: string; q: number; field: string; surface: string; problem: string; shown: string; source: string };
const findings: Finding[] = [];
const stats = { tables: 0, code: 0 };

/** What is left on screen that a student should never read. */
export function residue(shown: string): string | null {
  if (/(^|\W)rac\s*\{|\n(?:eq|eg)\b/.test(shown)) return 'corrupt-escape';
  // A price keeps its sign ("26$", "$5 and $10").
  if (/\$/.test(shown.replace(/\d\s?\$|\$\s?\d|\uFF04/g, ''))) return 'dollar';
  if (/\\[a-zA-Z]+/.test(shown)) return 'command';
  if (/\\[^a-zA-Z\s]/.test(shown) || /\\\s/.test(shown) || /\\$/.test(shown)) return 'backslash';
  // Braces around a set are content ("{0, 1, 2}", "ℝ ∖ {0}"); braces glued to
  // a symbol, or empty, are leftover LaTeX.
  // "bar{(A;1),(B;1)}" is the French barycentre notation, content not markup.
  if (/[\w^_]\{|\{\s*\}/.test(shown.replace(/\bbar\{/g, 'bar ('))) return 'brace';
  if (/(^|[^\s_])[\^_](?=[\w(])/.test(shown.replace(/_{2,}/g, ' '))) return 'script';
  return null;
}

/** KaTeX auto-render's split, simplified to the four delimiters MathText uses. */
function katexSplit(text: string): { math: string[]; prose: string } {
  const math: string[] = [];
  let prose = '';
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$]+?)\$/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    prose += text.slice(last, m.index) + ' ▢ ';
    math.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? '');
    last = m.index + m[0].length;
  }
  prose += text.slice(last);
  return { math, prose };
}

function checkMathText(ctx: Omit<Finding, 'surface' | 'problem' | 'shown'>, raw: string) {
  const text = String(raw ?? '');
  if (!text.trim()) return;
  if (WEB) { checkWeb(ctx, text); return; }
  // MathText draws tables as grids: prose blocks as usual, each cell as runs.
  if (hasTable(text)) {
    for (const b of splitTables(text)) {
      if (b.kind === 'text') { checkMathTextBody(ctx, b.text); continue; }
      if (b.kind === 'code') { stats.code += 1; continue; }
      for (const c of [...(b.header ?? []), ...b.rows.flat()]) {
        const shown = runsShown(mathToRuns(c.replace(/\*\*([^*]+)\*\*/g, '$1')));
        const r = residue(shown);
        if (r) findings.push({ ...ctx, surface: 'table-cell', problem: r, shown, source: c });
      }
      stats.tables += 1;
    }
    return;
  }
  checkMathTextBody(ctx, text);
}

function checkMathTextBody(ctx: Omit<Finding, 'surface' | 'problem' | 'shown'>, text: string) {
  if (!text.trim()) return;
  if (/^\s*\|[^|\n]*\|[^|\n]*\|.*$/m.test(text) && /^\s*\|?\s*:?-{2,}/m.test(text) || /\[Table:/.test(text) || /```/.test(text)) findings.push({ ...ctx, surface: 'table', problem: 'raw-table', shown: text.slice(0, 200), source: text.slice(0, 300) });
  const src = katexSource(stripProseMarks(text));
  if (src != null) {
    const { math, prose } = katexSplit(src);
    for (const f of math) {
      try {
        let warn = '';
        if (/\n\s*(?:rac\b|eq\b|eg\b)|(^|[^\\a-zA-Z])rac\s*\{/.test(f)) findings.push({ ...ctx, surface: 'katex', problem: 'corrupt-escape', shown: f.slice(0, 160), source: text.slice(0, 300) });
        // KaTeX accepts "C_parallel" but sets only the "p" low: a silent misprint.
        if (/(?<![\\a-zA-Z])[A-Za-z0-9)][_^][A-Za-z]{3,}(?![A-Za-z]*\{)/.test(f.replace(/\\[a-zA-Z]+/g, ' '))) findings.push({ ...ctx, surface: 'katex', problem: 'unbraced-script', shown: f.slice(0, 160), source: text.slice(0, 300) });
        katex.renderToString(f, { throwOnError: true, strict: (code: string) => { warn = warn || code; return 'ignore'; } });
        // Prose typed inside a formula: KaTeX sets it in math italics with no
        // spaces ("lavitesse"), which reads as broken on screen.
        if (warn === 'unicodeTextInMathMode' && /[À-ÿ]/.test(f.replace(/\\(?:text|mathrm|textbf|mbox)\{[^}]*\}/g, '')))
          findings.push({ ...ctx, surface: 'katex', problem: 'prose-in-math', shown: f.slice(0, 160), source: text.slice(0, 300) });
      } catch (e: any) {
        findings.push({ ...ctx, surface: 'katex', problem: 'katex-error', shown: `${f.slice(0, 120)}  ⟵ ${String(e?.message ?? e).slice(0, 80)}`, source: text.slice(0, 300) });
      }
    }
    const r = residue(prose);
    if (r) findings.push({ ...ctx, surface: 'katex-prose', problem: r, shown: prose.slice(0, 200), source: text.slice(0, 300) });
    return;
  }
  const shown = proseSegments(text).map((s) => runsShown(mathToRuns(s.text))).join('');
  const r = residue(shown);
  if (r) findings.push({ ...ctx, surface: 'plain', problem: r, shown: shown.slice(0, 200), source: text.slice(0, 300) });
}

/** The web's visible text: KaTeX's MathML source dropped, tags stripped. */
function checkWeb(ctx: Omit<Finding, 'surface' | 'problem' | 'shown'>, text: string) {
  const html = examTextHtml(text);
  if (/katex-error/.test(html)) findings.push({ ...ctx, surface: 'web-katex', problem: 'katex-error', shown: (html.match(/katex-error[^>]*>([^<]*)/)?.[1] ?? '').slice(0, 160), source: text.slice(0, 300) });
  const visible = html
    .replace(/<annotation[\s\S]*?<\/annotation>/g, '')
    .replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, '')
    .replace(/<pre class="exam-code">[\s\S]*?<\/pre>/g, ' ')
    .replace(/<\/?(?:sup|sub)>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const r = residue(visible) ?? (/^\s*\|.*\|\s*$/m.test(visible) && /^\s*\|?\s*:?-{2,}/m.test(visible) ? 'raw-table' : null);
  if (r) findings.push({ ...ctx, surface: 'web', problem: r, shown: visible.slice(0, 200), source: text.slice(0, 300) });
}

function checkFlow(ctx: Omit<Finding, 'surface' | 'problem' | 'shown'>, runs: string[]) {
  if (WEB) { balanceMathAcrossBlanks(runs).forEach((r, i) => checkWeb(ctx, i > 0 ? r.replace(/^\s*\(([^)]+)\)/, '') : r)); return; }
  const balanced = balanceMathAcrossBlanks(runs);
  balanced.forEach((run, i) => {
    let clean = run;
    if (i > 0) clean = clean.replace(/^\s*\(([^)]+)\)/, '');
    const shown = flowPieces(clean).map((p) => (p.kind === 'break' ? '\n' : runsShown(p.runs))).join('');
    const r = residue(shown);
    if (r) findings.push({ ...ctx, surface: 'flow', problem: r, shown: shown.slice(0, 200), source: runs.join(' ____ ').slice(0, 300) });
  });
}

/** What drawn runs put on screen: plain text, and each script on its own. */
const runsShown = (runs: MathRun[]) => runs.map((r) => (r.script ? ` ${r.text} ` : r.text)).join('');

const strField = (v: unknown) => (typeof v === 'string' ? v : '');

let exams = 0;
let questions = 0;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const exam = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  exams += 1;
  const subject = normalizeSubject(exam.subject);
  const title = String(exam.exam_title ?? file);
  for (const s of exam.sections ?? []) {
    const base = { exam: file, title, q: -1, source: '' };
    checkMathText({ ...base, field: 'section.title' }, strField(s.section_title ?? s.title));
    checkMathText({ ...base, field: 'section.instructions' }, strField(s.instructions));
    checkMathText({ ...base, field: 'section.passage' }, strField(s.passage));
  }
  const qs = flattenQuestions(exam) as any[];
  qs.forEach((q, qi) => {
    questions += 1;
    const ctx = (field: string) => ({ exam: file, title, q: qi + 1, field, source: '' });
    const text = String(q._displayText ?? q.question ?? '');
    const type = String(q.type ?? '').toLowerCase();
    let compiled: any = null;
    try { compiled = compileQuestion(q, { subject }); } catch { /* old inputs */ }
    const holes = compiled?.prompt?.some((b: any) => b.type === 'widget');
    if (compiled && holes) {
      const runs: string[] = [];
      let cur = '';
      for (const b of compiled.prompt) {
        if (b.type === 'text') cur += b.content;
        else if (b.type === 'widget') { runs.push(cur); cur = ''; }
      }
      runs.push(cur);
      checkFlow(ctx('prompt(engine)'), runs);
    } else if (type === 'fill_blank' && (text.match(BLANK_RE) ?? []).length > 0) {
      checkFlow(ctx('prompt(blanks)'), text.split(BLANK_RE));
    } else {
      checkMathText(ctx('question'), text);
    }
    for (const w of Object.values<any>(compiled?.widgets ?? {})) {
      if (w?.label) {
        if (WEB) { checkWeb(ctx('widget.label'), String(w.label)); continue; }
        const shown = runsShown(mathToRuns(String(w.label)));
        const r = residue(shown);
        if (r) findings.push({ ...ctx('widget.label'), surface: 'plain', problem: r, shown, source: String(w.label) });
      }
    }
    const opts = Array.isArray(q.options) ? q.options : q.options && typeof q.options === 'object' ? Object.values(q.options) : [];
    opts.forEach((o: any) => checkMathText(ctx('option'), typeof o === 'string' ? o : String(o?.text ?? o?.label ?? '')));
    checkMathText(ctx('explanation'), strField(q.explanation));
    checkMathText(ctx('correct_answer'), strField(q.correct_answer));
    checkMathText(ctx('final_answer'), strField(q.final_answer));
    if (Array.isArray(q.hints)) q.hints.forEach((h: any) => checkMathText(ctx('hint'), String(h ?? '')));
    if (Array.isArray(q.answer_parts)) q.answer_parts.forEach((p: any) => {
      checkMathText(ctx('answer_parts.label'), String(p?.label ?? ''));
      checkMathText(ctx('answer_parts.answer'), String(p?.answer ?? ''));
    });
    // ScaffoldAnswer shows the text through MathText, markers as ①②.
    // ScaffoldAnswer shows the worked part (before the first blank) on demand.
    if (typeof q.scaffold_text === 'string') checkMathText(ctx('scaffold_text'), workedPart(q.scaffold_text, text));
    if (Array.isArray(q.blanks)) q.blanks.forEach((b: any) => checkMathText(ctx('blank'), String(b?.label ?? b?.hint ?? (typeof b === 'string' ? b : ''))));
  });
}

const byKey = new Map<string, Finding[]>();
for (const f of findings) {
  const k = `${f.field} · ${f.surface} · ${f.problem}`;
  byKey.set(k, [...(byKey.get(k) ?? []), f]);
}
const affectedExams = new Set(findings.map((f) => f.exam)).size;
console.log(`exams ${exams} · questions ${questions} · tables drawn ${stats.tables} · diagrams ${stats.code} · findings ${findings.length} · exams affected ${affectedExams}`);
for (const [k, list] of [...byKey.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${String(list.length).padStart(5)}  ${k}`);
  const n = Number(process.env.SAMPLES ?? 3);
  for (const f of list.slice(0, n)) console.log(`        ${JSON.stringify(f.shown).slice(0, 170)}`);
}
const ji = process.argv.indexOf('--json');
if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify(findings, null, 1));
