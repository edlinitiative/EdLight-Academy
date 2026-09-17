import { compileQuestion, splitKey, isPlaceholderKey } from '../../../shared/question/compile';
import { gradeQuestion, validate, isCorrect, parseNumeric } from '../../../shared/question/grade';
import { isSerializable, responseToStored, storedToResponse } from '../../../shared/question/serialize';

/**
 * The question IR — compiled from the shapes the real catalog actually uses.
 * Fixtures below are trimmed copies of real questions, not invented ones.
 */

describe('compileQuestion — the prompt is a document with holes', () => {
  it('turns mid-sentence blanks into widgets in reading order', () => {
    const q = compileQuestion({
      type: 'fill_blank',
      question: "Les atomes de l'éthane sont unis par une ____ liaison tandis qu'on trouve une ____ liaison.",
      correct: "simple, double",
      points: 4,
    }, { subject: 'Chimie' });

    const kinds = q.prompt.map((b) => b.type);
    // text, hole, text, hole, text — the field sits IN the sentence.
    expect(kinds).toEqual(['text', 'widget', 'text', 'widget', 'text']);
    expect(Object.keys(q.widgets)).toEqual(['blank1', 'blank2']);
    expect((q.widgets.blank1 as any).answer).toBe('simple');
    expect((q.widgets.blank2 as any).answer).toBe('double');
  });

  it('builds the step ladder from answer_parts — the key for 82.8% of the corpus', () => {
    const q = compileQuestion({
      type: 'calculation',
      question: 'Calculer la valeur de a.',
      answer_parts: [
        { label: 'Développement de la somme', answer: '55a + 15', alternatives: ['55a+15'] },
        { label: 'Valeur de a', answer: '1' },
      ],
      points: 10,
    }, { subject: 'Mathématiques' });

    expect(q.steps).toEqual(['step1', 'step2']);
    expect(q.widgets.step1.kind).toBe('text');
    expect((q.widgets.step1 as any).label).toBe('Développement de la somme');
    // "1" is a number, so it grades with tolerance rather than as loose text.
    expect(q.widgets.step2.kind).toBe('numeric');
  });

  it('reads a letter key for multiple choice, not just the option text', () => {
    const q = compileQuestion({
      type: 'multiple_choice',
      question: 'Formule du dioxyde de carbone ?',
      options: { a: 'CO', b: 'CO₂', c: 'C₂O' },
      correct: 'b',
      points: 1,
    }, { subject: 'Chimie' });
    expect((q.widgets.choice as any).answer).toBe(1);
  });

  it('keeps the teaching payload the app has never shown', () => {
    const q = compileQuestion({
      type: 'short_answer',
      question: 'Q',
      correct: 'x',
      hints: ['un', 'deux', 'trois'],
      explanation: 'parce que',
      model_answer: 'la réponse rédigée',
      approaches: ['autre méthode'],
      points: 2,
    });
    expect(q.hints).toHaveLength(3);
    expect(q.explanation).toBe('parce que');
    expect(q.modelAnswer).toBe('la réponse rédigée');
    expect(q.approaches).toEqual(['autre méthode']);
  });
});

describe('validation is not scoring', () => {
  const numeric = { kind: 'numeric' as const, id: 'n', answer: 12 };

  it('separates empty, malformed and wrong', () => {
    expect(validate(numeric, null).state).toBe('empty');
    expect(validate(numeric, '')).toEqual({ state: 'empty' });
    // "douze" is not a wrong number — it is not a number.
    expect(validate(numeric, 'douze')).toEqual({ state: 'invalid', reason: 'not-a-number' });
    expect(validate(numeric, '13').state).toBe('ok');
    expect(isCorrect(numeric, '13')).toBe(false);
  });
});

describe('numeric answers carry tolerance and units', () => {
  it('accepts comma decimals and an attached unit', () => {
    expect(parseNumeric('3,14 m')).toEqual({ value: 3.14, unit: 'm' });
    expect(parseNumeric('3.14m')).toEqual({ value: 3.14, unit: 'm' });
    expect(parseNumeric('abc')).toBeNull();
  });

  it('marks to the precision the answer was authored in', () => {
    // An integer is exact. A blanket relative tolerance would accept anything
    // within 1% — which on an answer like 21,872,500 is ±218,725, so plainly
    // wrong arithmetic passes. Found by auditing the corpus.
    const int = { kind: 'numeric' as const, id: 'n', answer: 100 };
    expect(isCorrect(int, '100')).toBe(true);
    expect(isCorrect(int, '100.5')).toBe(false);

    // Two authored decimals accept anything that rounds to them — including a
    // MORE precise answer, which is not a mistake.
    const dec = { kind: 'numeric' as const, id: 'n', answer: 3.14 };
    expect(isCorrect(dec, '3.14')).toBe(true);
    expect(isCorrect(dec, '3.14159')).toBe(true);
    expect(isCorrect(dec, '3.2')).toBe(false);

    // A question may still author its own tolerance, which always wins.
    const loose = { kind: 'numeric' as const, id: 'n', answer: 9.81, tolerance: 0.5 };
    expect(isCorrect(loose, '10')).toBe(true);
  });

  it('rejects a wrong unit', () => {
    const w = { kind: 'numeric' as const, id: 'n', answer: 3.14, unit: 'm' };
    expect(isCorrect(w, '3.14 m')).toBe(true);
    expect(isCorrect(w, '3.14 km')).toBe(false);
  });
});

describe('fuzzy matching is gated by subject', () => {
  it('forgives a typo in a language answer', () => {
    const q = compileQuestion(
      { type: 'short_answer', question: 'Q', correct: 'photosynthèse', points: 1 },
      { subject: 'SVT' },
    );
    // SVT is a maths-like subject here: strict.
    expect(isCorrect(q.widgets.answer, 'photosyntese')).toBe(false);

    const lang = compileQuestion(
      { type: 'short_answer', question: 'Q', correct: 'photosynthèse', points: 1 },
      { subject: 'Culture Générale' },
    );
    expect(isCorrect(lang.widgets.answer, 'photosyntese')).toBe(true);
  });
});

describe('partial credit', () => {
  const q = compileQuestion({
    type: 'calculation',
    question: 'Q',
    answer_parts: [{ answer: 'a' }, { answer: 'b' }, { answer: 'c' }],
    points: 9,
  }, { subject: 'Mathématiques' });

  it('awards marks per step rather than all-or-nothing', () => {
    const s = gradeQuestion(q, { step1: 'a', step2: 'b', step3: 'WRONG' });
    expect(s.earned).toBe(6);
    expect(s.possible).toBe(9);
    expect(s.allCorrect).toBe(false);
  });

  it('awards nothing for an empty response and never throws', () => {
    const s = gradeQuestion(q, {});
    expect(s.earned).toBe(0);
    expect(s.allCorrect).toBe(false);
  });

  it('marks the whole question right only when every step is', () => {
    expect(gradeQuestion(q, { step1: 'a', step2: 'b', step3: 'c' }).allCorrect).toBe(true);
  });
});

describe('essays are flagged for review, never marked wrong', () => {
  it('returns needsReview instead of zero-marking', () => {
    const q = compileQuestion({ type: 'essay', question: 'Disserte.', model_answer: 'm', points: 20 });
    const s = gradeQuestion(q, { answer: 'un long texte' });
    expect(s.widgets[0].correct).toBeNull();
    expect(s.needsReview).toBe(true);
  });
});

describe('splitKey — the separators the corpus actually uses', () => {
  it('splits only when the part count matches the blanks', () => {
    expect(splitKey("d'addition, de substitution", 2)).toEqual(["d'addition", 'de substitution']);
    expect(splitKey('for in', 2)).toEqual(['for', 'in']);
    // A single-blank key may legitimately contain a comma.
    expect(splitKey('Port-au-Prince, Haïti', 1)).toEqual(['Port-au-Prince, Haïti']);
  });

  it('does not cut a number in half', () => {
    // "2,4-Dinitrophénylhydrazine" is one reagent. Splitting on every comma
    // gave three parts for two blanks, so the key was dropped entirely.
    expect(splitKey('$C=O$, 2,4-Dinitrophénylhydrazine (DNPH)', 2))
      .toEqual(['$C=O$', '2,4-Dinitrophénylhydrazine (DNPH)']);
  });

  it('reads "et" and "and" as separators, but only as whole words', () => {
    expect(splitKey('propanal et propanone', 2)).toEqual(['propanal', 'propanone']);
    expect(splitKey('homeless and nowhere', 2)).toEqual(['homeless', 'nowhere']);
  });

  it('returns null rather than inventing keys it cannot justify', () => {
    // 49 questions write ONE answer for a two-blank sentence.
    expect(splitKey('le méthane ($CH_4$)', 2)).toBeNull();
  });
});

describe('a key that does not divide', () => {
  const raw = {
    type: 'fill_blank',
    question: 'Le composé ______ a pour formule ______.',
    correct: 'le méthane ($CH_4$)',
    points: 2,
  };

  it('asks for the answer once instead of two blanks nobody can fill', () => {
    // Splitting this key two ways produced two EMPTY answers, so the student
    // could type the right thing and still be marked wrong.
    const q = compileQuestion(raw, { subject: 'Chimie' });
    expect(Object.keys(q.widgets)).toEqual(['answer']);
    expect((q.widgets.answer as any).answer).toBe('le méthane ($CH_4$)');
    expect(gradeQuestion(q, { answer: 'le méthane ($CH_4$)' }).allCorrect).toBe(true);
  });

  it('falls back to answer_parts when they line up with the blanks', () => {
    const q = compileQuestion(
      { ...raw, correct: '', answer_parts: [{ answer: 'méthane' }, { answer: 'CH4' }] },
      { subject: 'Chimie' },
    );
    expect((q.widgets.blank1 as any).answer).toBe('méthane');
    expect((q.widgets.blank2 as any).answer).toBe('CH4');
  });
});

describe('keys that are not answers', () => {
  it('falls back to final_answer, the only key 48 questions have', () => {
    const q = compileQuestion(
      { type: 'short_answer', question: 'Q', final_answer: "S'excuser et réparer.", points: 5 },
      { subject: 'Philosophie' },
    );
    expect((q.widgets.answer as any).answer).toBe("S'excuser et réparer.");
  });

  it('sends a question to review rather than fail it against "Texte manquant"', () => {
    const q = compileQuestion(
      { type: 'short_answer', question: 'Q', final_answer: 'Incomplete Question', points: 5 },
      { subject: 'Art & Musique' },
    );
    expect(q.widgets.answer.kind).toBe('essay');
    expect(gradeQuestion(q, { answer: 'une réponse' }).needsReview).toBe(true);
  });

  it('matches placeholders exactly, never by pattern', () => {
    // A regex for "incomplète" or "voir" would swallow these real answers.
    expect(isPlaceholderKey('Dominance incomplète/codominance')).toBe(false);
    expect(isPlaceholderKey('Voir ne suffit pas pour savoir')).toBe(false);
    expect(isPlaceholderKey('Question incomplète')).toBe(true);
    expect(isPlaceholderKey('Texte manquant')).toBe(true);
  });

  it('leaves a question alone when answer_parts carry the real key', () => {
    // The placeholder sits in `correct`; the ladder is the actual answer.
    const q = compileQuestion({
      type: 'calculation',
      question: 'Q',
      correct: 'Voir les answer_parts',
      answer_parts: [{ answer: '12' }, { answer: '7' }],
      points: 4,
    }, { subject: 'Mathématiques' });
    expect(q.steps).toEqual(['step1', 'step2']);
    expect(gradeQuestion(q, { step1: '12', step2: '7' }).allCorrect).toBe(true);
  });
});

describe('answer_parts that are the blanks, not extra steps', () => {
  const raw = {
    type: 'fill_blank',
    question: "Les atomes sont unis par une ____ liaison et une ____ liaison.",
    correct: 'simple, double',
    answer_parts: [{ answer: 'une liaison simple' }, { answer: 'une liaison double' }],
    points: 4,
  };

  it('does not ask the same two answers twice', () => {
    // Compiling blanks AND a ladder made this four answers. Marks divide across
    // widgets, so a student who filled both blanks correctly scored 50% against
    // two steps they were never shown. 695 questions are shaped like this.
    const q = compileQuestion(raw, { subject: 'Chimie' });
    expect(Object.keys(q.widgets)).toEqual(['blank1', 'blank2']);
    expect(gradeQuestion(q, { blank1: 'simple', blank2: 'double' }).earned).toBe(4);
  });

  it('accepts the longer authored form as an alternative', () => {
    const q = compileQuestion(raw, { subject: 'Chimie' });
    expect(isCorrect(q.widgets.blank1, 'une liaison simple')).toBe(true);
    expect(isCorrect(q.widgets.blank1, 'simple')).toBe(true);
  });

  it('keeps a real step ladder when the counts do not line up', () => {
    const q = compileQuestion(
      { ...raw, answer_parts: [{ answer: 'a' }, { answer: 'b' }, { answer: 'c' }] },
      { subject: 'Chimie' },
    );
    expect(Object.keys(q.widgets)).toEqual(['blank1', 'blank2', 'step1', 'step2', 'step3']);
  });
});

describe('storing an answer as the one string an attempt has always been', () => {
  const twoBlanks = compileQuestion({
    type: 'fill_blank',
    question: 'Une ____ liaison et une ____ liaison.',
    correct: 'simple, double',
    points: 2,
  }, { subject: 'Chimie' });

  it('round-trips through the stored form', () => {
    const typed = { blank1: 'simple', blank2: 'double' };
    const stored = responseToStored(twoBlanks, typed);
    expect(stored).toBe('simple|double');
    expect(storedToResponse(twoBlanks, stored)).toEqual(typed);
  });

  it('reads a cleared question as unanswered, not as an empty answer', () => {
    // "||" is truthy, so leaving the key behind made the header count the
    // question as answered and under-report the unanswered warning on submit.
    expect(responseToStored(twoBlanks, { blank1: '', blank2: '' })).toBe('');
    expect(responseToStored(twoBlanks, { blank1: 'simple', blank2: '' })).toBe('simple|');
  });

  it('refuses a question whose answer contains the separator', () => {
    // "||" is the salt bridge in Zn|Zn²⁺||Cu²⁺|Cu — a real chemistry answer.
    const salty = compileQuestion({
      type: 'fill_blank',
      question: 'Le pont ____ relie ____ .',
      correct: '||, deux demi-piles',
      points: 2,
    }, { subject: 'Chimie' });
    expect(isSerializable(salty)).toBe(false);
    expect(isSerializable(twoBlanks)).toBe(true);
  });
});
