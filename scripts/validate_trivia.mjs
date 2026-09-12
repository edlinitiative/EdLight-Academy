/**
 * Check every trivia bank for the faults a reader would notice and a diff
 * would not.
 *
 *   node scripts/validate_trivia.mjs
 *
 * Run it after editing src/data/triviaData.ts, and from the nightly generator
 * before anything it produced is published. The generator has no human
 * reviewing its output, so this file is the only thing standing between a
 * malformed question and a student.
 *
 * What it refuses:
 *   · fewer or more than four options
 *   · an answer index outside those options
 *   · duplicate options inside one question (two identical choices, one of
 *     which is "correct", is unanswerable)
 *   · the same question text twice in a bank
 *   · a missing Kreyòl translation — this product is bilingual, and a question
 *     that exists in one language is broken for half its readers
 *   · an empty string anywhere
 *
 * What it reports without failing:
 *   · two questions in one bank with the SAME correct answer. Usually that is
 *     a paraphrase pair — "Comment appelle-t-on le prêtre vodou (homme) ?" and
 *     "Comment appelle-t-on le prêtre vodou masculin ?" both answer "houngan",
 *     and the duplicate-text check cannot see it because the strings differ.
 *     The culture bank held nine such clusters, twenty questions in all, and
 *     reading them turned up three that were not merely repeated but wrong.
 *     It is a report and not a failure because a shared answer is sometimes
 *     legitimate: "quelle est la capitale" and "où siège le gouvernement" are
 *     a fair pair, and the maths bank will answer "12" more than once. A
 *     person decides; this only makes the clusters visible.
 */
import { readFileSync } from 'node:fs';

const SRC = 'src/data/triviaData.ts';
const src = readFileSync(SRC, 'utf8');

/** Pull each `const NAME = [ … ]` bank out of the module by brace matching. */
function banks(text) {
  const out = {};
  for (const m of text.matchAll(/const ([A-Z_]+) = \[/g)) {
    let i = m.index + m[0].length - 1, depth = 0;
    for (; i < text.length; i += 1) {
      if (text[i] === '[') depth += 1;
      else if (text[i] === ']') { depth -= 1; if (depth === 0) break; }
    }
    const body = text.slice(m.index + m[0].length, i);
    if (/\bq:\s*["'`]/.test(body)) out[m[1]] = body;
  }
  return out;
}

const OBJ = /\{\s*q:\s*(["'])((?:\\.|(?!\1).)*)\1\s*,\s*qHt:\s*(["'])((?:\\.|(?!\3).)*)\3\s*,\s*options:\s*\[([^\]]*)\]\s*,\s*answer:\s*(\d+)\s*\}/g;

let problems = 0;
let counted = 0;
let sameAnswer = 0;
const clusters = [];

for (const [name, body] of Object.entries(banks(src))) {
  const seen = new Map();
  const byAnswer = new Map();
  let n = 0;
  for (const m of body.matchAll(OBJ)) {
    n += 1;
    const [q, qHt, rawOpts, answer] = [m[2], m[4], m[5], Number(m[6])];
    const opts = [...rawOpts.matchAll(/(["'])((?:\\.|(?!\1).)*)\1/g)].map((o) => o[2]);
    const fail = (why) => { problems += 1; console.log(`  ${name}: ${why}\n    ${q}`); };

    if (opts.length !== 4) fail(`${opts.length} options, expected 4`);
    if (!(answer >= 0 && answer < opts.length)) fail(`answer index ${answer} is outside the options`);
    if (new Set(opts).size !== opts.length) fail('two identical options');
    if (!qHt.trim()) fail('no Kreyòl translation');
    if (!q.trim()) fail('empty question');
    if (opts.some((o) => !o.trim())) fail('an empty option');

    /*
      A letter from an alphabet this product does not write in.

      Writing these by hand produced "Agent deноyau" — two Cyrillic letters
      inside a French distractor, invisible at a glance and unreadable on a
      phone. Listing the scripts that are always a mistake, rather than
      allow-listing the characters that are fine: the first version of this
      check took the second approach and rejected "1/3 + 1/3" and "E = mc²",
      because an allow-list of characters has to remember every symbol anyone
      will ever legitimately type, and it will not.

      Greek is excluded from the list: π belongs in the maths bank.
    */
    const WRONG_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Han}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Devanagari}\p{Script=Thai}]/u;
    for (const [where, text] of [['question', q], ['Kreyòl', qHt], ...opts.map((o) => ['option', o])]) {
      if (WRONG_SCRIPT.test(text)) fail(`a letter from another alphabet in the ${where}: ${text}`);
    }

    const key = q.replace(/\s+/g, ' ').trim().toLowerCase();
    if (seen.has(key)) fail(`duplicate of an earlier question in this bank`);
    else seen.set(key, true);

    const correct = opts[answer];
    if (correct) {
      const ak = correct.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!byAnswer.has(ak)) byAnswer.set(ak, []);
      byAnswer.get(ak).push(q);
    }
  }
  for (const [ans, qs] of byAnswer) {
    if (qs.length < 2) continue;
    sameAnswer += 1;
    clusters.push(`  ${name}: ${qs.length} questions answer "${ans}"\n${qs.map((x) => `      ${x}`).join('\n')}`);
  }
  counted += n;
  console.log(`${name.padEnd(22)} ${String(n).padStart(4)}`);
}

if (clusters.length) {
  console.log(`\n${sameAnswer} cluster(s) of questions sharing one answer — read them, they are usually paraphrases:\n`);
  for (const c of clusters) console.log(c);
}

console.log(`\n${counted} questions across ${Object.keys(banks(src)).length} hand-written banks`);
if (problems) { console.log(`\n${problems} PROBLEM(S)`); process.exit(1); }
console.log('all clean');
