import {
  parseScaffoldAnswer,
  parseTemplatedSlots,
  reconstructTemplate,
  reconstructMatrix,
  isMatrixPart,
  gradeScaffoldBlanks,
  gradeScaffoldAnswer,
  gradeSingleQuestion,
  gradeExam,
} from '../examUtils';

// A math question that ALSO carries a single `correct` value. Before the
// interactive-scaffold fix, the scaffold JSON answer was sent to the single
// `correct` matcher and always scored 0. These tests lock in the new behavior.
function makeScaffoldQuestion(overrides: Record<string, unknown> = {}) {
  return {
    type: 'calculation',
    points: 2,
    correct: '2/3',
    scaffold_text: 'Simplifier la fraction : numérateur {{0}}, résultat {{1}}',
    scaffold_blanks: [{ label: 'Numérateur' }, { label: 'Résultat' }],
    answer_parts: [
      { label: 'Numérateur', answer: '6', alternatives: [] },
      { label: 'Résultat', answer: '2/3', alternatives: [] },
    ],
    ...overrides,
  };
}

const MATH = { subject: 'Mathématiques' };

describe('parseScaffoldAnswer', () => {
  it('parses a scaffold payload into its value array', () => {
    expect(parseScaffoldAnswer(JSON.stringify({ scaffold: ['6', '2/3'] }))).toEqual(['6', '2/3']);
  });
  it('returns null for non-scaffold answers', () => {
    expect(parseScaffoldAnswer('plain text')).toBeNull();
    expect(parseScaffoldAnswer(JSON.stringify({ steps: [] }))).toBeNull();
    expect(parseScaffoldAnswer('')).toBeNull();
  });
});

describe('gradeScaffoldAnswer', () => {
  it('grades all-correct blanks as correct despite a single `correct` value', () => {
    const q = makeScaffoldQuestion();
    const r = gradeScaffoldAnswer(q, JSON.stringify({ scaffold: ['6', '2/3'] }), MATH);
    expect(r).not.toBeNull();
    expect(r!.status).toBe('correct');
    expect(r!.awarded).toBe(2);
  });

  it('awards proportional partial credit', () => {
    const q = makeScaffoldQuestion();
    const r = gradeScaffoldAnswer(q, JSON.stringify({ scaffold: ['6', '1'] }), MATH);
    expect(r!.status).toBe('partial');
    expect(r!.awarded).toBe(1); // 1 of 2 blanks correct → half of 2 pts
  });

  it('treats an all-blank scaffold as unanswered', () => {
    const q = makeScaffoldQuestion();
    const r = gradeScaffoldAnswer(q, JSON.stringify({ scaffold: ['', ''] }), MATH);
    expect(r!.status).toBe('unanswered');
    expect(r!.awarded).toBe(0);
  });

  it('grades a dropdown selection by matching the chosen option', () => {
    const q = makeScaffoldQuestion({
      points: 1,
      correct: 'Géométrique',
      scaffold_text: 'La suite est {{0}}',
      scaffold_blanks: [{ label: 'Nature' }],
      answer_parts: [
        {
          label: 'Nature',
          answer: 'Géométrique',
          options: ['arithmétique', 'géométrique', 'ni arithmétique ni géométrique'],
          kind: 'dropdown',
        },
      ],
    });
    const right = gradeScaffoldAnswer(q, JSON.stringify({ scaffold: ['géométrique'] }), MATH);
    expect(right!.status).toBe('correct');
    const wrong = gradeScaffoldAnswer(q, JSON.stringify({ scaffold: ['arithmétique'] }), MATH);
    expect(wrong!.status).toBe('incorrect');
  });

  it('returns null for a non-scaffold answer', () => {
    const q = makeScaffoldQuestion();
    expect(gradeScaffoldAnswer(q, '2/3', MATH)).toBeNull();
  });
});

describe('gradeSingleQuestion with scaffold answers', () => {
  it('routes scaffold JSON through blank grading, not the single-answer matcher', () => {
    const q = makeScaffoldQuestion();
    const r = gradeSingleQuestion(q, JSON.stringify({ scaffold: ['6', '2/3'] }), null, MATH);
    expect(r.status).toBe('correct');
    expect(r.result.awarded).toBe(2);
    expect(r.result.blankResults).toHaveLength(2);
  });
});

describe('gradeExam with scaffolded math questions', () => {
  it('scores a math scaffold by blanks even when `correct` is set', () => {
    const q = makeScaffoldQuestion();
    const { summary, results } = gradeExam(
      [q],
      { 0: JSON.stringify({ scaffold: ['6', '2/3'] }) },
      {},
      MATH,
    );
    expect(results[0].status).toBe('correct');
    expect(summary.earnedPoints).toBe(2);
    expect(summary.autoGraded).toBe(1);
  });

  it('does not regress plain single-answer questions', () => {
    const mcq = { type: 'multiple_choice', points: 1, correct: 'b' };
    const { results } = gradeExam([mcq], { 0: 'b' }, {}, MATH);
    expect(results[0].status).toBe('correct');
  });
});

// ── Inline fill-in templates ("answer written out with holes") ──────────────
function makeTemplatedQuestion(overrides: Record<string, unknown> = {}) {
  return {
    type: 'calculation',
    points: 1,
    correct: ']-\\infty, 0[ \\cup ]0, +\\infty[',
    scaffold_text: 'Ensemble de définition : {{0}}',
    scaffold_blanks: [{ label: 'Ensemble de définition' }],
    answer_parts: [
      {
        label: 'Ensemble de définition',
        answer: ']-\\infty, 0[ \\cup ]0, +\\infty[',
        kind: 'fill',
        template: ']{0}, {1}[ \\cup ]{2}, {3}[',
        slots: [
          { answer: '-\\infty', kind: 'text', alternatives: ['-infini', '-inf'] },
          { answer: '0', kind: 'number' },
          { answer: '0', kind: 'number' },
          { answer: '+\\infty', kind: 'text', alternatives: ['+infini', 'infini', 'inf'] },
        ],
      },
    ],
    ...overrides,
  };
}

const slots = (...vals: string[]) => JSON.stringify({ slots: vals });
// Wrap a single blank's value into the question-level {scaffold:[…]} payload.
const oneBlank = (blankValue: string) => JSON.stringify({ scaffold: [blankValue] });

describe('parseTemplatedSlots', () => {
  it('parses a templated payload into its slot array', () => {
    expect(parseTemplatedSlots(slots('-\\infty', '0', '0', '+\\infty')))
      .toEqual(['-\\infty', '0', '0', '+\\infty']);
  });
  it('returns null for non-templated values', () => {
    expect(parseTemplatedSlots('0')).toBeNull();
    expect(parseTemplatedSlots(JSON.stringify({ scaffold: ['x'] }))).toBeNull();
    expect(parseTemplatedSlots('')).toBeNull();
  });
});

describe('reconstructTemplate', () => {
  it('substitutes slot values into the template markers', () => {
    expect(reconstructTemplate(']{0}, {1}[ \\cup ]{2}, {3}[', ['-\\infty', '0', '0', '+\\infty']))
      .toBe(']-\\infty, 0[ \\cup ]0, +\\infty[');
  });
  it('marks missing slots with a box glyph', () => {
    expect(reconstructTemplate('{0}+{1}', ['2'])).toBe('2+□');
  });
});

describe('templated (fill-in) scaffold grading', () => {
  it('is correct only when every slot matches', () => {
    const q = makeTemplatedQuestion();
    const r = gradeScaffoldAnswer(q, oneBlank(slots('-\\infty', '0', '0', '+\\infty')), MATH);
    expect(r!.status).toBe('correct');
    expect(r!.awarded).toBe(1);
  });

  it('accepts tolerant slot alternatives (e.g. "infini" for +\\infty)', () => {
    const q = makeTemplatedQuestion();
    const r = gradeScaffoldAnswer(q, oneBlank(slots('-infini', '0', '0', 'infini')), MATH);
    expect(r!.status).toBe('correct');
  });

  it('marks the blank wrong when any single slot is wrong', () => {
    const q = makeTemplatedQuestion();
    const r = gradeScaffoldAnswer(q, oneBlank(slots('-\\infty', '0', '1', '+\\infty')), MATH);
    expect(r!.status).toBe('incorrect');
    expect(r!.awarded).toBe(0);
  });

  it('treats an untouched templated blank as unanswered', () => {
    const q = makeTemplatedQuestion();
    const r = gradeScaffoldAnswer(q, oneBlank(''), MATH); // blank never filled
    expect(r!.status).toBe('unanswered');
  });

  it('reconstructs the user answer for feedback display', () => {
    const q = makeTemplatedQuestion();
    const [res] = gradeScaffoldBlanks(
      [slots('-\\infty', '0', '0', '+\\infty')],
      q.answer_parts,
      MATH,
    );
    expect(res.correct).toBe(true);
    expect(res.userValue).toBe(']-\\infty, 0[ \\cup ]0, +\\infty[');
  });

  it('grades end-to-end through gradeExam', () => {
    const q = makeTemplatedQuestion();
    const { summary, results } = gradeExam([q], { 0: oneBlank(slots('-\\infty', '0', '0', '+\\infty')) }, {}, MATH);
    expect(results[0].status).toBe('correct');
    expect(summary.earnedPoints).toBe(1);
  });
});
// ── Matrix grid blanks (fill each cell inside brackets) ───────────────────
function makeMatrixQuestion(overrides: Record<string, unknown> = {}) {
  return {
    type: 'calculation',
    points: 1,
    correct: 'matrix',
    scaffold_text: 'Forme matricielle : {{0}}',
    scaffold_blanks: [{ label: 'Forme matricielle' }],
    answer_parts: [
      {
        label: 'Forme matricielle',
        answer: '$\\begin{pmatrix} 0 & 1 \\\\ -1 & 0 \\end{pmatrix}$',
        kind: 'matrix',
        matrix: { rows: 2, cols: 2 },
        slots: [
          { answer: '0', kind: 'number' }, { answer: '1', kind: 'number' },
          { answer: '-1', kind: 'number' }, { answer: '0', kind: 'number' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('isMatrixPart', () => {
  it('detects a matrix part and rejects a plain one', () => {
    expect(isMatrixPart(makeMatrixQuestion().answer_parts[0])).toBe(true);
    expect(isMatrixPart({ answer: '5' })).toBe(false);
  });
});

describe('reconstructMatrix', () => {
  it('rebuilds a pmatrix string from row-major slot values', () => {
    expect(reconstructMatrix({ rows: 2, cols: 2 }, ['0', '1', '-1', '0']))
      .toBe('\\begin{pmatrix} 0 & 1 \\\\ -1 & 0 \\end{pmatrix}');
  });
  it('uses a placeholder for empty cells', () => {
    expect(reconstructMatrix({ rows: 1, cols: 2 }, ['7']))
      .toBe('\\begin{pmatrix} 7 & \\square \\end{pmatrix}');
  });
});

describe('matrix grid grading', () => {
  it('is correct only when every cell matches', () => {
    const q = makeMatrixQuestion();
    const r = gradeScaffoldAnswer(q, oneBlank(slots('0', '1', '-1', '0')), MATH);
    expect(r!.status).toBe('correct');
    expect(r!.awarded).toBe(1);
  });

  it('marks the blank wrong when any single cell is wrong', () => {
    const q = makeMatrixQuestion();
    const r = gradeScaffoldAnswer(q, oneBlank(slots('0', '1', '1', '0')), MATH);
    expect(r!.status).toBe('incorrect');
    expect(r!.awarded).toBe(0);
  });

  it('treats an unfilled grid as unanswered', () => {
    const q = makeMatrixQuestion();
    const r = gradeScaffoldAnswer(q, oneBlank(''), MATH);
    expect(r!.status).toBe('unanswered');
  });

  it('reconstructs the user matrix for feedback display', () => {
    const q = makeMatrixQuestion();
    const [res] = gradeScaffoldBlanks([slots('0', '1', '-1', '0')], q.answer_parts, MATH);
    expect(res.correct).toBe(true);
    expect(res.userValue).toBe('\\begin{pmatrix} 0 & 1 \\\\ -1 & 0 \\end{pmatrix}');
  });
});