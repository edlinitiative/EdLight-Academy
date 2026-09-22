/**
 * The shipped trivia bank must be gradeable.
 *
 * A student reported being marked wrong on answers they had got right. The
 * Firestore read path was fixed at its trust boundary
 * (`normalizeTriviaQuestion`), but the game's OTHER source — this in-repo bank
 * — never passes through it. TriviaGames grades with `idx === q.answer`, a
 * strict comparison against a number, so anything here that is not a valid
 * index is a question no student can ever get right.
 *
 * `randomizeBank()` makes that failure silent. It re-finds the correct option
 * after shuffling with `options.indexOf(correct)`. If the authored `answer` is
 * out of range, `options[answer]` is `undefined`, `indexOf` returns **-1**, and
 * the question ships with `answer: -1` — every option marked wrong, no error,
 * no warning. Duplicate option text hides the same way: `indexOf` returns the
 * first copy, not necessarily the one that was correct.
 *
 * So this walks the real exported bank rather than a fixture.
 */

import { TRIVIA_QUESTIONS, TRIVIA_CATEGORIES } from '../triviaData';

const bank = TRIVIA_QUESTIONS as Record<string, any[]>;
const categories = Object.keys(bank);

/** Identify a bad question well enough to find it in the source. */
const where = (catId: string, i: number, q: any) =>
  `${catId}[${i}] ${JSON.stringify(q?.q ?? '(no stem)').slice(0, 80)}`;

describe('the shipped trivia bank is gradeable', () => {
  it('ships at least one category with questions', () => {
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.some((c) => bank[c]?.length > 0)).toBe(true);
  });

  it('gives every question an answer index that points at a real option', () => {
    const broken: string[] = [];
    for (const catId of categories) {
      (bank[catId] || []).forEach((q, i) => {
        const opts = q?.options;
        if (!Array.isArray(opts)) { broken.push(`${where(catId, i, q)} — options is not an array`); return; }
        if (typeof q.answer !== 'number' || !Number.isInteger(q.answer)) {
          broken.push(`${where(catId, i, q)} — answer is ${JSON.stringify(q.answer)}, not an integer`);
          return;
        }
        // -1 is the signature of randomizeBank failing to re-find the answer.
        if (q.answer < 0 || q.answer >= opts.length) {
          broken.push(`${where(catId, i, q)} — answer ${q.answer} is outside 0..${opts.length - 1}`);
        }
      });
    }
    expect(broken).toEqual([]);
  });

  it('gives every question at least two non-empty options', () => {
    const broken: string[] = [];
    for (const catId of categories) {
      (bank[catId] || []).forEach((q, i) => {
        const opts = Array.isArray(q?.options) ? q.options : [];
        if (opts.length < 2) broken.push(`${where(catId, i, q)} — only ${opts.length} option(s)`);
        opts.forEach((o, oi) => {
          if (typeof o !== 'string' || !o.trim()) {
            broken.push(`${where(catId, i, q)} — option ${oi} is empty or not a string`);
          }
        });
      });
    }
    expect(broken).toEqual([]);
  });

  it('never repeats an option inside one question', () => {
    // Two identical options are unanswerable for the student and, worse, make
    // randomizeBank's indexOf ambiguous.
    const broken: string[] = [];
    for (const catId of categories) {
      (bank[catId] || []).forEach((q, i) => {
        const opts = Array.isArray(q?.options) ? q.options : [];
        const seen = new Map<string, number>();
        opts.forEach((o) => {
          const k = String(o).replace(/\s+/g, ' ').trim().toLowerCase();
          seen.set(k, (seen.get(k) || 0) + 1);
        });
        for (const [k, n] of seen) {
          if (n > 1) broken.push(`${where(catId, i, q)} — option "${k}" appears ${n} times`);
        }
      });
    }
    expect(broken).toEqual([]);
  });

  it('asks every question in both languages', () => {
    const broken: string[] = [];
    for (const catId of categories) {
      (bank[catId] || []).forEach((q, i) => {
        if (typeof q?.q !== 'string' || !q.q.trim()) broken.push(`${where(catId, i, q)} — no French stem`);
        if (typeof q?.qHt !== 'string' || !q.qHt.trim()) broken.push(`${where(catId, i, q)} — no Kreyòl stem`);
      });
    }
    expect(broken).toEqual([]);
  });

  it('only keys categories that the picker can actually show', () => {
    const known = new Set((TRIVIA_CATEGORIES as any[]).map((c) => c.id));
    const orphans = categories.filter((c) => !known.has(c) && (bank[c] || []).length > 0);
    expect(orphans).toEqual([]);
  });
});
