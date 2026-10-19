/**
 * Essay grading after submit + "Corriger maintenant" (shared/essayRegrade.ts,
 * shared/essayGradeCore.ts, and the `ungraded` status in shared/examUtils.ts).
 *
 * The guarantees under test:
 *   • a failed grader call is never a 0: `ungraded`, out of the percentage;
 *   • web and mobile send the SAME request body;
 *   • a regrade updates the stored result once, atomically, only for items
 *     still ungraded on the same attempt (idempotent across taps/devices);
 *   • a regrade writes nothing but the result's verdicts and summary (no XP,
 *     mastery or review side effects to count twice).
 */
import { gradeExam, gradeSingleQuestion } from '../../../shared/examUtils';
import { classifyEssayResponse, parseEssayScoreRatio, leanEssayFeedback } from '../../../shared/essayGradeCore';
import {
  applyEssayGrades,
  buildEssayGradeBody,
  createEssayGradingRegistry,
  EssayGradeError,
  essayJobsFromDoc,
  gradeExamPendingEssays,
  needsEssayGrade,
  runEssayGrading,
  type ApplyResult,
  type EssayGradingDeps,
} from '../../../shared/essayRegrade';

const ESSAY = 'Le roman haïtien. '.repeat(40);

const questions = [
  { type: 'multiple_choice', question: 'Capitale ?', options: { a: 'Port-au-Prince', b: 'Cap' }, correct: 'a', points: 2 },
  {
    type: 'essay', question: 'Dissertez : la liberté a-t-elle des limites ?', points: 10,
    final_answer: 'La liberté est limitée par celle des autres',
    answer_parts: [{ label: 'Thèse', answer: 'La liberté a des limites' }],
    sectionInstructions: 'Traitez un sujet au choix.',
  },
  { type: 'short_answer', question: 'Auteur de Gouverneurs de la rosée ?', correct: 'Jacques Roumain', points: 2 },
  { type: 'essay', question: 'Texte manquant', correct: 'Texte manquant', points: 5 },
];
const answers: Record<number, string> = { 0: 'a', 1: ESSAY, 2: 'Jacques Roumain', 3: 'quelque chose' };

const GRADED = { graded: true, isCorrect: true, score: '7/10', ratio: 0.7, feedback: 'Bonne copie.', criteria: [{ label: 'Thèse', level: 2, evidence: 'x', comment: 'ok' }], strengths: ['Clair'], improvements: ['Exemples'], provider: 'gemini (x)', rubricProfile: 'dissertation' };
const FAILED = { graded: false, isCorrect: false, score: 'N/A', wordStatus: 'ok', feedback: 'échec' };
const TOO_SHORT = { graded: false, isCorrect: false, score: 'N/A', wordStatus: 'too_short', feedback: 'Réponse très courte.' };

describe('what a grader response means', () => {
  it('only a readable score is a grade', () => {
    expect(classifyEssayResponse(GRADED)).toBe('graded');
    expect(classifyEssayResponse({ isCorrect: false, score: '4/10' })).toBe('graded'); // older shape
    expect(classifyEssayResponse(FAILED)).toBe('failed');
    expect(classifyEssayResponse({ isCorrect: false, feedback: 'Évaluation automatique indisponible.', score: 'N/A' })).toBe('failed');
    expect(classifyEssayResponse(null)).toBe('failed');
    expect(classifyEssayResponse(TOO_SHORT)).toBe('too_short');
    expect(parseEssayScoreRatio('6,5/10')).toBeCloseTo(0.65);
  });

  it('a failed call is ungraded, never 0, and too short is a real 0', () => {
    expect(gradeSingleQuestion(questions[1], ESSAY, FAILED).status).toBe('ungraded');
    expect(gradeSingleQuestion(questions[1], ESSAY, TOO_SHORT).status).toBe('incorrect');
    const ok = gradeSingleQuestion(questions[1], ESSAY, GRADED);
    expect(ok.status).toBe('correct');
    expect(ok.result.awarded).toBe(7);
  });

  it('ungraded items are left out of the percentage and reported as pending', () => {
    const pre = { 1: gradeSingleQuestion(questions[1], ESSAY, FAILED) };
    const { summary } = gradeExam(questions, answers, pre);
    // MCQ 2/2 + short answer 2/2 + placeholder essay 0/5 (manual): 4/9.
    expect(summary.totalPoints).toBe(9);
    expect(summary.earnedPoints).toBe(4);
    expect(summary.ungraded).toBe(1);
    expect(summary.pendingPoints).toBe(10);
  });

  it('a fully graded paper keeps its historical summary shape', () => {
    const { summary } = gradeExam(questions, answers, { 1: gradeSingleQuestion(questions[1], ESSAY, GRADED) });
    expect(summary).not.toHaveProperty('ungraded');
    expect(summary).not.toHaveProperty('pendingPoints');
  });
});

describe('the request body (identical on web and mobile)', () => {
  it('carries the question, reference, rubric points, type, subject and level', () => {
    const body = buildEssayGradeBody(questions[1], ESSAY, { subject: 'Philosophie', level: 'Baccalauréat' });
    expect(body).toEqual({
      question: 'Dissertez : la liberté a-t-elle des limites ?',
      context: 'Traitez un sujet au choix.',
      answer: ESSAY,
      modelAnswer: 'Thèse: La liberté a des limites',
      answerParts: [{ label: 'Thèse', answer: 'La liberté a des limites' }],
      type: 'essay',
      subject: 'Philosophie',
      level: 'Baccalauréat',
    });
    expect(JSON.stringify(body)).not.toContain('undefined');
  });
});

describe('which items need the grader', () => {
  it('essays always, short answers with a reference, never a placeholder key', () => {
    expect(needsEssayGrade(questions[1], ESSAY, { status: 'ungraded' })).toBe(true);
    expect(needsEssayGrade(questions[1], ESSAY, { status: 'manual' })).toBe(true);
    // Old mobile paper: the essay was text-matched against final_answer.
    expect(needsEssayGrade(questions[1], ESSAY, { status: 'incorrect' })).toBe(true);
    // Old web paper: the failed call was read as 0.
    expect(needsEssayGrade(questions[1], ESSAY, { status: 'incorrect', essayFeedback: { score: 'N/A' } })).toBe(true);
    expect(needsEssayGrade(questions[1], ESSAY, { status: 'partial', essayFeedback: GRADED })).toBe(false);
    expect(needsEssayGrade(questions[1], ESSAY, { status: 'incorrect', essayFeedback: TOO_SHORT })).toBe(false);
    // A short answer the local grader marked stays marked.
    expect(needsEssayGrade(questions[2], 'Roumain', { status: 'incorrect' })).toBe(false);
    expect(needsEssayGrade(questions[3], 'quelque chose', { status: 'manual' })).toBe(false);
    expect(needsEssayGrade(questions[1], '', { status: 'ungraded' })).toBe(false);
    expect(needsEssayGrade(questions[1], '{"scaffold":["a"]}', { status: 'manual' })).toBe(false);
  });
});

describe('mobile submit: essays wait as ungraded instead of manual 0', () => {
  it('holds the essay out of the score and grades everything else as before', () => {
    const graded = gradeExamPendingEssays(questions, answers, {});
    expect(graded.pending).toEqual([1]);
    expect(graded.results[1].status).toBe('ungraded');
    expect(graded.results[0].status).toBe('correct');
    expect(graded.results[3].status).toBe('manual');
    expect(graded.summary.totalPoints).toBe(9);
    expect(graded.summary.pendingPoints).toBe(10);
  });

  it('is exactly gradeExam when there is nothing to wait for', () => {
    const qs = [questions[0], questions[2]];
    const ans = { 0: 'b', 1: 'Roumain' };
    const { pending, ...rest } = gradeExamPendingEssays(qs, ans);
    expect(pending).toEqual([]);
    expect(rest).toEqual(gradeExam(qs, ans, {}));
  });
});

// ── Stored documents ────────────────────────────────────────────────────────

function mobileDoc(stamp = 1000) {
  const graded = gradeExamPendingEssays(questions, answers, {});
  return {
    exam_id: 'x', subject: 'Philosophie', answers, created_at_ms: stamp,
    summary: graded.summary,
    results: graded.results.map((r: any) => ({ status: r.status, awarded: r.result.awarded, maxPoints: r.result.maxPoints })),
  };
}

function webDoc(stamp = 2000) {
  return {
    exam_id: 'x', answers, created_at_ms: stamp, submitted_at_ms: stamp,
    preGradedResults: { 1: { status: 'incorrect', result: { awarded: 0, maxPoints: 10 }, essayFeedback: { isCorrect: false, score: 'N/A' } } },
    summary: { percentage: 31 },
  };
}

describe('applying grades to a stored result', () => {
  it('mobile shape: rewrites the verdict, the lean feedback and the summary', () => {
    const doc = mobileDoc();
    const out = applyEssayGrades(questions, doc, { 1: GRADED }, { attemptStamp: 1000, now: 5 }) as Extract<ApplyResult, { kind: 'patch' }>;
    expect(out.kind).toBe('patch');
    expect(out.applied).toEqual([1]);
    expect(Object.keys(out.patch).sort()).toEqual(['essay_graded_at_ms', 'results', 'summary']);
    const r1 = (out.patch.results as any[])[1];
    expect(r1).toMatchObject({ status: 'correct', awarded: 7, maxPoints: 10 });
    expect(r1.essayFeedback.score).toBe('7/10');
    expect(r1.essayFeedback).not.toHaveProperty('provider');
    const summary = out.patch.summary as any;
    expect(summary.totalPoints).toBe(19);
    expect(summary.earnedPoints).toBe(11);
    expect(summary).not.toHaveProperty('ungraded');
  });

  it('web shape: rewrites preGradedResults and keeps the other entries', () => {
    const out = applyEssayGrades(questions, webDoc(), { 1: GRADED }, { attemptStamp: 2000 }) as any;
    expect(out.kind).toBe('patch');
    expect(out.patch.preGradedResults[1]).toMatchObject({ status: 'correct', result: { awarded: 7, maxPoints: 10 } });
    expect(out.patch.results).toBeUndefined();
  });

  it('is idempotent: applying the same grade twice changes nothing the second time', () => {
    const doc: any = mobileDoc();
    const first = applyEssayGrades(questions, doc, { 1: GRADED }, { attemptStamp: 1000 }) as any;
    const after = { ...doc, ...first.patch };
    expect(applyEssayGrades(questions, after, { 1: { ...GRADED, score: '2/10' } }, { attemptStamp: 1000 })).toEqual({ kind: 'unchanged' });
  });

  it('refuses a document that now belongs to another attempt (a retake)', () => {
    expect(applyEssayGrades(questions, mobileDoc(9999), { 1: GRADED }, { attemptStamp: 1000 })).toEqual({ kind: 'stale' });
    expect(applyEssayGrades(questions, null, { 1: GRADED }, { attemptStamp: 1000 })).toEqual({ kind: 'stale' });
  });

  it('never replaces one non-grade with another', () => {
    expect(applyEssayGrades(questions, mobileDoc(), { 1: FAILED }, { attemptStamp: 1000 })).toEqual({ kind: 'unchanged' });
  });

  it('finds the work in both shapes, including old papers', () => {
    expect(essayJobsFromDoc(questions, mobileDoc())).toEqual([1]);
    expect(essayJobsFromDoc(questions, webDoc())).toEqual([1]);
    expect(essayJobsFromDoc(questions, { answers, created_at_ms: 1 })).toEqual([1]);
  });
});

// ── The run, with fake I/O ──────────────────────────────────────────────────

function fakeStore(initial: any) {
  let doc = initial;
  const writes: any[] = [];
  const deps = (gradeOne: EssayGradingDeps['gradeOne']): EssayGradingDeps => ({
    gradeOne,
    readResult: async () => doc,
    commit: async (mutate) => {
      const r = mutate(doc);
      if (r.kind === 'patch') {
        writes.push(r.patch);
        doc = { ...doc, ...r.patch };
      }
      return r;
    },
  });
  return { deps, writes, get doc() { return doc; } };
}

describe('runEssayGrading', () => {
  it('grades, then writes ONE patch with the new score', async () => {
    const store = fakeStore(mobileDoc());
    const gradeOne = jest.fn(async () => GRADED);
    const out = await runEssayGrading(store.deps(gradeOne), { questions, subject: 'Philosophie', level: 'Baccalauréat' });
    expect(out).toEqual({ status: 'graded', graded: 1, failed: 0, rateLimited: false });
    expect(gradeOne).toHaveBeenCalledTimes(1);
    expect((gradeOne.mock.calls[0] as any[])[0].subject).toBe('Philosophie');
    expect(store.writes).toHaveLength(1);
    expect(store.doc.summary.percentage).toBe(58);
  });

  it('a second run finds nothing to do and calls nobody', async () => {
    const store = fakeStore(mobileDoc());
    await runEssayGrading(store.deps(async () => GRADED), { questions });
    const again = jest.fn(async () => GRADED);
    expect(await runEssayGrading(store.deps(again), { questions })).toEqual({ status: 'nothing' });
    expect(again).not.toHaveBeenCalled();
    expect(store.writes).toHaveLength(1);
  });

  it('offline: nothing is written and the item stays ungraded (retry offered)', async () => {
    const store = fakeStore(mobileDoc());
    const out = await runEssayGrading(store.deps(async () => { throw new EssayGradeError('network'); }), { questions });
    expect(out).toEqual({ status: 'failed', failed: 1, rateLimited: false, offline: true });
    expect(store.writes).toHaveLength(0);
    expect(store.doc.results[1].status).toBe('ungraded');
  });

  it('reports a rate limit distinctly', async () => {
    const store = fakeStore(mobileDoc());
    const out = await runEssayGrading(store.deps(async () => { throw new EssayGradeError('rate_limit'); }), { questions });
    expect(out).toMatchObject({ status: 'failed', rateLimited: true, offline: false });
  });

  it('a graded:false answer from the API is a failure, not a 0', async () => {
    const store = fakeStore(mobileDoc());
    const out = await runEssayGrading(store.deps(async () => FAILED), { questions });
    expect(out.status).toBe('failed');
    expect(store.writes).toHaveLength(0);
  });

  it('another device graded it between read and commit: unchanged, no double write', async () => {
    const base = mobileDoc();
    let doc: any = base;
    const deps: EssayGradingDeps = {
      gradeOne: async () => GRADED,
      readResult: async () => base,
      commit: async (mutate) => {
        // The other device's commit landed first.
        const other = applyEssayGrades(questions, base, { 1: { ...GRADED, score: '9/10' } }, { attemptStamp: 1000 }) as any;
        doc = { ...base, ...other.patch };
        return mutate(doc);
      },
    };
    const out = await runEssayGrading(deps, { questions });
    expect(out).toEqual({ status: 'graded', graded: 0, failed: 0, rateLimited: false });
    expect(doc.results[1].awarded).toBe(9);
  });

  it('a retake in between is never overwritten', async () => {
    const base = mobileDoc(1000);
    const deps: EssayGradingDeps = {
      gradeOne: async () => GRADED,
      readResult: async () => base,
      commit: async (mutate) => mutate(mobileDoc(2000)),
    };
    expect(await runEssayGrading(deps, { questions })).toEqual({ status: 'stale' });
  });
});

describe('one run per paper', () => {
  it('a double tap joins the running grade instead of calling the grader twice', async () => {
    const registry = createEssayGradingRegistry();
    const store = fakeStore(mobileDoc());
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const gradeOne = jest.fn(async () => { await gate; return GRADED; });
    const a = registry.run('u:x', () => runEssayGrading(store.deps(gradeOne), { questions }));
    const b = registry.run('u:x', () => runEssayGrading(store.deps(gradeOne), { questions }));
    expect(registry.isRunning('u:x')).toBe(true);
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(rb);
    expect(gradeOne).toHaveBeenCalledTimes(1);
    expect(store.writes).toHaveLength(1);
    expect(registry.isRunning('u:x')).toBe(false);
    expect(registry.lastOutcome('u:x')).toEqual(ra);
  });

  it('notifies listeners when a run starts and ends, and survives a thrown run', async () => {
    const registry = createEssayGradingRegistry();
    const seen: boolean[] = [];
    const unsub = registry.subscribe((key) => seen.push(registry.isRunning(key)));
    const out = await registry.run('k', async () => { throw new Error('boom'); });
    unsub();
    expect(out.status).toBe('failed');
    expect(seen).toEqual([true, false]);
  });
});

describe('stored feedback is lean and Firestore-safe', () => {
  it('drops undefined and unbounded fields', () => {
    const lean = leanEssayFeedback({ ...GRADED, criteria: [{ label: 'A', level: 1, comment: undefined }], extra: 'x' });
    expect(JSON.stringify(lean)).not.toContain('undefined');
    expect(lean).not.toHaveProperty('provider');
    expect(lean).not.toHaveProperty('extra');
    expect(lean.criteria).toEqual([{ label: 'A', level: 1 }]);
  });
});
