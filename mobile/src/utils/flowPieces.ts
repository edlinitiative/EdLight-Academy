import { mathToRuns, runsToText, type MathRun } from './mathText';
import { bulletize } from './proseMarks';

/**
 * A text run split into the pieces a wrapping row can flow: words (each with
 * its trailing space), unbreakable inline-math tokens, and hard line breaks.
 *
 * A run used to be ONE MathText box in the row, so a long run took the whole
 * line and the blank fell under it instead of mid-sentence — the web flows the
 * sentence around its inputs (FillBlankText), and so must the phone. Inline
 * math becomes text in a single token: a KaTeX WebView has no intrinsic width
 * inside a wrapping row and collapses there.
 *
 * Every piece carries `runs` (from `mathToRuns`) so exponents and indices are
 * drawn, not spelled ("x_G"); `text` is the same content as one string.
 */
export type Piece = { kind: 'word' | 'math'; text: string; runs: MathRun[] } | { kind: 'break' };

const piece = (kind: 'word' | 'math', runs: MathRun[]): Piece => ({ kind, runs, text: runsToText(runs) });

export function flowPieces(content: string): Piece[] {
  const out: Piece[] = [];
  const src = bulletize(String(content ?? '')).replace(/\*\*([^*\n]+?)\*\*/g, '$1');
  for (const part of src.split(/(\$[^$]+\$)/)) {
    if (!part) continue;
    if (/^\$[^$]+\$$/.test(part)) {
      out.push(piece('math', mathToRuns(part)));
      continue;
    }
    // Prose may still carry undelimited LaTeX ("U_n", "\ldots", an orphaned
    // `$`): convert the whole run first, then cut it into words, so a script
    // stays glued to the word it belongs to.
    part.split('\n').forEach((line, li) => {
      if (li > 0) out.push({ kind: 'break' });
      let word: MathRun[] = [];
      const flush = () => { if (word.length) out.push(piece('word', word)); word = []; };
      for (const run of mathToRuns(line.replace(/(?:\\(?:ldots|dots|cdots)\s*)+/g, (m) => ((m.match(/\\/g) ?? []).length > 1 ? '…… ' : '… ')))) {
        if (run.script) { word.push(run); continue; }
        for (const tok of run.text.match(/\S+\s*|\s+/g) ?? []) {
          word.push({ text: tok });
          if (/\s$/.test(tok)) flush();
        }
      }
      flush();
    });
  }
  return out;
}
