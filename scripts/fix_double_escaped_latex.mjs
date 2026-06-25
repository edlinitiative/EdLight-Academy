// Fix double-escaped LaTeX commands in the exam corpus.
//
// THE BUG: some generated strings doubled the backslash of a LaTeX command, e.g.
//   parsed "$36\\sqrt{\\frac{2}{7}}$"   (two backslashes before "sqrt")
// KaTeX reads "\\" as a forced line-break, so "\\sqrt" renders the literal text
// "sqrt" instead of a radical. Students see "sqrtfrac".
//
// THE RULE (surgical, provably safe):
//   A *single* command is one backslash:            \sqrt          (odd run = 1)
//   A line-break THEN a command is three:            \\\sqrt        (odd run = 3)
//   A *doubled* command is two (or any even):        \\sqrt         (even run)  <-- corruption
//   A line-break in cases/pmatrix/align is "\\" followed by a space, "{", digit,
//   "&", content letter, or end-of-row — never directly by a known command word.
// So: an EVEN-length backslash run immediately followed by a KNOWN LaTeX command
// word is unambiguously a doubled command. Collapse that run to a single "\".
// Everything else (the 637 legitimate "\\" row separators) is left untouched.
//
// Usage:
//   node scripts/fix_double_escaped_latex.mjs           # dry-run, lists every change
//   node scripts/fix_double_escaped_latex.mjs --write    # apply to catalog + per-exam files

import fs from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const CATALOG = 'public/exam_catalog.json';
const EXAMS_DIR = 'public/exams';

// Known LaTeX control words seen across this corpus (multi-letter only — never a
// bare single content letter such as H, D, P that could follow a "\\" row break).
const CMDS = [
  'sqrt', 'dfrac', 'tfrac', 'frac', 'times', 'cdot', 'div', 'pm', 'mp',
  'leq', 'geq', 'neq', 'approx', 'equiv', 'sum', 'prod', 'int', 'lim', 'infty',
  'partial', 'nabla', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon',
  'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi',
  'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega', 'pi',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
  'vec', 'hat', 'bar', 'tilde', 'overline', 'underline', 'overrightarrow',
  'mathbb', 'mathrm', 'mathcal', 'mathbf', 'mathfrak', 'boldsymbol', 'operatorname',
  'left', 'right', 'begin', 'end', 'rightarrow', 'leftarrow', 'Rightarrow',
  'Leftarrow', 'leftrightarrow', 'longrightarrow', 'mapsto', 'to',
  'cos', 'sin', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp', 'min', 'max',
  'sup', 'inf', 'deg', 'arctan', 'arcsin', 'arccos', 'sinh', 'cosh', 'tanh',
  'forall', 'exists', 'notin', 'subset', 'subseteq', 'supset', 'cup', 'cap',
  'emptyset', 'angle', 'circ', 'prime', 'quad', 'qquad', 'oplus', 'otimes',
  'binom', 'choose', 'sqrt', 'overbrace', 'underbrace', 'lfloor', 'rfloor',
  'lceil', 'rceil', 'langle', 'rangle', 'cdots', 'ldots', 'vdots', 'ddots',
];
// Sort longest-first so e.g. "frac" is tried before "f"-prefixed shorter words.
const CMD_RE = new RegExp(`^(?:${[...new Set(CMDS)].sort((a, b) => b.length - a.length).join('|')})\\b`);

// Collapse an even-length backslash run that sits directly before a known command.
function fixStr(s) {
  const changes = [];
  const out = s.replace(/(\\+)(?=[A-Za-z])/g, (run, _bs, offset) => {
    const len = run.length;
    if (len < 2 || len % 2 !== 0) return run; // single command or line-break+command (odd): keep
    const after = s.slice(offset + len);
    if (!CMD_RE.test(after)) return run; // not a LaTeX command -> "\\" line-break before content: keep
    const word = (after.match(/^[A-Za-z]+/) || [''])[0];
    changes.push({ from: '\\'.repeat(len) + word, to: '\\' + word });
    return '\\';
  });
  return { out, changes };
}

// Recursively fix every string inside a node; returns total change count.
function fixNode(node, onChange, ctx) {
  if (node == null) return 0;
  if (typeof node === 'string') return 0; // strings are fixed via their parent (so we can write back)
  if (Array.isArray(node)) {
    let n = 0;
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === 'string') {
        const { out, changes } = fixStr(node[i]);
        if (changes.length) {
          node[i] = out;
          n += changes.length;
          onChange(ctx, changes, node[i]);
        }
      } else {
        n += fixNode(node[i], onChange, ctx);
      }
    }
    return n;
  }
  if (typeof node === 'object') {
    let n = 0;
    for (const k of Object.keys(node)) {
      if (typeof node[k] === 'string') {
        const { out, changes } = fixStr(node[k]);
        if (changes.length) {
          node[k] = out;
          n += changes.length;
          onChange({ ...ctx, field: k }, changes, node[k]);
        }
      } else {
        n += fixNode(node[k], onChange, { ...ctx, field: k });
      }
    }
    return n;
  }
  return 0;
}

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

let totalChanges = 0;
const changedExams = new Set();
const report = [];

for (const exam of catalog) {
  const before = totalChanges;
  totalChanges += fixNode(
    exam,
    (ctx, changes) => {
      for (const c of changes) report.push({ exam: exam.exam_id, field: ctx.field, ...c });
    },
    { field: '(root)' },
  );
  if (totalChanges > before && exam.exam_id) changedExams.add(exam.exam_id);
}

// Print the report.
for (const r of report) {
  console.log(`  ${r.exam}  [${r.field}]   ${r.from}  ->  ${r.to}`);
}
console.log('');
console.log(`Total corrupt command occurrences fixed: ${totalChanges}`);
console.log(`Exams affected: ${changedExams.size}  (${[...changedExams].join(', ')})`);

if (!WRITE) {
  console.log('\nDRY-RUN only. Re-run with --write to apply.');
  process.exit(0);
}

// Write the catalog back, pretty-printed (2-space) with a trailing newline.
fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`\n✓ wrote ${CATALOG}`);

// Patch each affected per-exam file (these are MINIFIED — JSON.stringify, no indent).
let patched = 0;
for (const exam of catalog) {
  if (!changedExams.has(exam.exam_id)) continue;
  const file = path.join(EXAMS_DIR, `${exam.exam_id}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`  WARN: per-exam file missing: ${file}`);
    continue;
  }
  fs.writeFileSync(file, JSON.stringify(exam), 'utf8');
  patched += 1;
}
console.log(`✓ patched ${patched} per-exam file(s) in ${EXAMS_DIR}/`);
