import {
  parseMatchingKey,
  parseMatchingSelections,
  gradeMatchingAnswer,
  gradeSingleQuestion,
  gradeExam,
} from '../examUtils';

// ── Question fixtures mirroring the real catalog shapes ─────────────────────

// "all-pairs": answer_parts hold "1-c" style pairs, options is a plain {a:txt}.
function explicitPairs(overrides: Record<string, unknown> = {}) {
  return {
    type: 'matching',
    points: 5,
    question: '1. Big 2. Small 3. Fast 4. Slow 5. Hot',
    options: { a: 'rapide', b: 'lent', c: 'grand', d: 'petit', e: 'chaud' },
    answer_parts: [
      { label: 'Matching pair 1', answer: '1-c' },
      { label: 'Matching pair 2', answer: '2-d' },
      { label: 'Matching pair 3', answer: '3-a' },
      { label: 'Matching pair 4', answer: '4-b' },
      { label: 'Matching pair 5', answer: '5-e' },
    ],
    ...overrides,
  };
}

// "all-bare": answer_parts hold positional bare letters; labels carry left text.
function positionalBare(overrides: Record<string, unknown> = {}) {
  return {
    type: 'matching',
    points: 5,
    question: '1. Convertible 2. Act out 3. Modest 4. Trendy 5. Invariably',
    options: {
      a: 'Currently fashionable',
      b: 'Always or almost always',
      c: 'Perform something',
      d: 'car with removable roof',
      e: 'Not large or excessive',
    },
    answer_parts: [
      { label: '1. Convertible', answer: 'd' },
      { label: '2. Act out', answer: 'c' },
      { label: '3. Modest', answer: 'e' },
      { label: '4. Trendy', answer: 'a' },
      { label: '5. Invariably', answer: 'b' },
    ],
    ...overrides,
  };
}

// "combined-string": one answer_part holds the whole mapping.
function combinedString(overrides: Record<string, unknown> = {}) {
  return {
    type: 'matching',
    points: 3,
    question: 'Column A: 1- Advice, 2- Outstanding, 3- Large',
    options: { a: 'big', b: 'excellent', c: 'guidance' },
    answer_parts: [{ label: 'Matching Pairs', answer: '1-c, 2-b, 3-a' }],
    ...overrides,
  };
}

describe('parseMatchingKey', () => {
  it('parses explicit "1-c" pairs with an options legend', () => {
    const parsed = parseMatchingKey(explicitPairs());
    expect(parsed).not.toBeNull();
    expect(parsed!.key).toEqual({ '1': 'c', '2': 'd', '3': 'a', '4': 'b', '5': 'e' });
    expect(parsed!.leftItems).toHaveLength(5);
    // Left text resolved from the numbered question stem.
    expect(parsed!.leftItems[0]).toEqual({ key: '1', text: 'Big' });
    // Right legend carries option text.
    expect(parsed!.rightOptions.find((o) => o.key === 'c')!.text).toBe('grand');
  });

  it('parses positional bare letters and reads left text from the part label', () => {
    const parsed = parseMatchingKey(positionalBare());
    expect(parsed!.key).toEqual({ '1': 'd', '2': 'c', '3': 'e', '4': 'a', '5': 'b' });
    expect(parsed!.leftItems[0]).toEqual({ key: '1', text: 'Convertible' });
  });

  it('explodes a combined single-string mapping into pairs', () => {
    const parsed = parseMatchingKey(combinedString());
    expect(parsed!.key).toEqual({ '1': 'c', '2': 'b', '3': 'a' });
    expect(parsed!.pairs).toHaveLength(3);
  });

  it('includes unmatched option keys as distractors in the legend', () => {
    // Answer only uses a,c,e but options also define b,d → all six selectable.
    const parsed = parseMatchingKey(explicitPairs());
    const keys = parsed!.rightOptions.map((o) => o.key).sort();
    expect(keys).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('ignores an options legend that describes the left column (disjoint keys)', () => {
    // Reversed "a-3" pairs: options are keyed a,b (the left side) → ignored,
    // right legend falls back to the numeric keys actually used.
    const parsed = parseMatchingKey({
      type: 'matching',
      points: 2,
      question: 'a. An island b. A surgeon',
      options: { a: 'An island', b: 'A surgeon' },
      answer_parts: [
        { label: 'Matching pair a', answer: 'a - 3' },
        { label: 'Matching pair b', answer: 'b - 1' },
      ],
    });
    expect(parsed!.key).toEqual({ a: '3', b: '1' });
    expect(parsed!.rightOptions.map((o) => o.key).sort()).toEqual(['1', '3']);
  });

  it('returns null for free-text / grouping answers (not letter matching)', () => {
    expect(
      parseMatchingKey({
        type: 'matching',
        points: 4,
        question: 'Asosye chak fraz...',
        answer_parts: [
          { label: '1', answer: 'Frankétienne' },
          { label: '2', answer: 'Georges Castera' },
        ],
      }),
    ).toBeNull();
  });

  it('returns null when there is no key, fewer than two pairs, or a non-matching type', () => {
    expect(parseMatchingKey({ type: 'matching', answer_parts: [] })).toBeNull();
    expect(parseMatchingKey({ type: 'matching', answer_parts: [{ answer: '1-c' }] })).toBeNull();
    expect(parseMatchingKey(explicitPairs({ type: 'multiple_choice' }))).toBeNull();
  });

  it('returns null for mixed positional + explicit shapes (avoids misalignment)', () => {
    expect(
      parseMatchingKey({
        type: 'matching',
        points: 2,
        question: 'x',
        answer_parts: [{ answer: 'd' }, { answer: '2-a' }],
      }),
    ).toBeNull();
  });
});

describe('parseMatchingSelections', () => {
  it('reads an object of selections', () => {
    expect(parseMatchingSelections({ '1': 'C', '2': 'd' })).toEqual({ '1': 'c', '2': 'd' });
  });
  it('reads a JSON string of selections', () => {
    expect(parseMatchingSelections('{"1":"c","2":"a"}')).toEqual({ '1': 'c', '2': 'a' });
  });
  it('reads a "1-c, 2-a" free-text string', () => {
    expect(parseMatchingSelections('1-c, 2-A')).toEqual({ '1': 'c', '2': 'a' });
  });
  it('returns null for empty / non-matching input and scaffold payloads', () => {
    expect(parseMatchingSelections('')).toBeNull();
    expect(parseMatchingSelections(null)).toBeNull();
    expect(parseMatchingSelections('{"scaffold":["x"]}')).toBeNull();
  });
});

describe('gradeMatchingAnswer', () => {
  it('awards full credit when every pair is correct', () => {
    const r = gradeMatchingAnswer(explicitPairs(), JSON.stringify({ '1': 'c', '2': 'd', '3': 'a', '4': 'b', '5': 'e' }));
    expect(r!.status).toBe('correct');
    expect(r!.awarded).toBe(5);
    expect(r!.blankResults.every((b) => b.correct)).toBe(true);
  });

  it('awards proportional partial credit', () => {
    const r = gradeMatchingAnswer(explicitPairs(), JSON.stringify({ '1': 'c', '2': 'd', '3': 'a' }));
    expect(r!.status).toBe('partial');
    expect(r!.awarded).toBe(3); // 3 of 5 correct → 3 pts
    expect(r!.blankResults.filter((b) => b.correct)).toHaveLength(3);
  });

  it('marks an all-wrong answer incorrect with zero credit', () => {
    const r = gradeMatchingAnswer(explicitPairs(), JSON.stringify({ '1': 'a', '2': 'a', '3': 'b', '4': 'c', '5': 'd' }));
    expect(r!.status).toBe('incorrect');
    expect(r!.awarded).toBe(0);
  });

  it('treats an empty selection as unanswered', () => {
    const r = gradeMatchingAnswer(explicitPairs(), JSON.stringify({}));
    expect(r!.status).toBe('unanswered');
    expect(r!.awarded).toBe(0);
  });

  it('grades a free-text "1-c, 2-d…" answer the same as the structured one', () => {
    const r = gradeMatchingAnswer(explicitPairs(), '1-c, 2-d, 3-a, 4-b, 5-e');
    expect(r!.status).toBe('correct');
    expect(r!.awarded).toBe(5);
  });

  it('returns null for a non-gradable matching (manual fallback)', () => {
    expect(
      gradeMatchingAnswer(
        { type: 'matching', points: 2, answer_parts: [{ answer: 'Frankétienne' }, { answer: 'Gary Victor' }] },
        '1-a',
      ),
    ).toBeNull();
  });
});

describe('matching routing through gradeSingleQuestion / gradeExam', () => {
  it('gradeSingleQuestion grades a matching answer', () => {
    const q = positionalBare();
    const r = gradeSingleQuestion(q, JSON.stringify({ '1': 'd', '2': 'c', '3': 'e', '4': 'a', '5': 'b' }), null);
    expect(r.status).toBe('correct');
    expect(r.result.awarded).toBe(5);
    expect(r.result.blankResults).toHaveLength(5);
  });

  it('gradeSingleQuestion leaves a non-gradable matching for manual review', () => {
    const q = { type: 'matching', points: 2, answer_parts: [{ answer: 'Frankétienne' }, { answer: 'Gary Victor' }] };
    const r = gradeSingleQuestion(q, '1-a, 2-b', null);
    expect(r.status).toBe('manual');
  });

  it('gradeExam auto-grades a matching question and counts the points', () => {
    const q = explicitPairs();
    const { summary, results } = gradeExam([q], { 0: JSON.stringify({ '1': 'c', '2': 'd', '3': 'a', '4': 'b', '5': 'e' }) });
    expect(summary.earnedPoints).toBe(5);
    expect(summary.totalPoints).toBe(5);
    expect(summary.autoGraded).toBe(1);
    expect(results[0].status).toBe('correct');
  });

  it('gradeExam counts an unanswered matching as unanswered', () => {
    const { summary } = gradeExam([explicitPairs()], {});
    expect(summary.unanswered).toBe(1);
  });
});
