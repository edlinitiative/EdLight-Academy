import { mathToText } from './mathText';
import { bulletize } from './proseMarks';

/**
 * A text run split into the pieces a wrapping row can flow: words (each with
 * its trailing space), unbreakable inline-math tokens, and hard line breaks.
 *
 * A run used to be ONE MathText box in the row, so a long run took the whole
 * line and the blank fell under it instead of mid-sentence — the web flows the
 * sentence around its inputs (FillBlankText), and so must the phone. Inline
 * math becomes readable Unicode in a single token: a KaTeX WebView has no
 * intrinsic width inside a wrapping row and collapses there.
 */
export type Piece = { kind: 'word' | 'math'; text: string } | { kind: 'break' };

export function flowPieces(content: string): Piece[] {
  const out: Piece[] = [];
  const src = bulletize(String(content ?? '')).replace(/\*\*([^*\n]+?)\*\*/g, '$1');
  for (const part of src.split(/(\$[^$]+\$)/)) {
    if (!part) continue;
    if (/^\$[^$]+\$$/.test(part)) {
      out.push({ kind: 'math', text: mathToText(part) });
      continue;
    }
    part.split('\n').forEach((line, li) => {
      if (li > 0) out.push({ kind: 'break' });
      for (const w of line.match(/\S+\s*|\s+/g) ?? []) out.push({ kind: 'word', text: w });
    });
  }
  return out;
}

