/**
 * Essay-grader calibration harness: the agreement math (QWK, MAE, Pearson r,
 * agreement shares, per-criterion confusion), the upload parser, and the
 * batch's idempotency (same file → same run; a graded item is never graded or
 * counted twice; a held lease blocks a second tab; transient failures retry
 * then fail).
 */
import { FakeDb } from './helpers/fakeFirestore';
import {
  CALIBRATION_SAMPLE_CSV,
  calibrationCsv,
  calibrationMetrics,
  itemPair,
  meanAbsoluteError,
  parseCalibrationUpload,
  parseCsv,
  pearson,
  quadraticWeightedKappa,
  type CalibrationInput,
  type CalibrationItem,
  type GradedPair,
} from '../../shared/essayCalibration';
import {
  applyItemGrade,
  createRun,
  gradeCalibrationInput,
  LEASE_MS,
  MAX_ATTEMPTS,
  stepRun,
  type ItemGrade,
} from '../_lib/essayCalibrationRuns';
import { gradeEssay } from '../_lib/essayGrader';

describe('agreement math', () => {
  it('QWK: perfect = 1, reversed uniform = -1, hand-computed case = 0.8', () => {
    expect(quadraticWeightedKappa([0, 1, 2, 3], [0, 1, 2, 3], 0, 3)).toBeCloseTo(1);
    expect(quadraticWeightedKappa([0, 1, 2, 3], [3, 2, 1, 0], 0, 3)).toBeCloseTo(-1);
    // O = {(0,0),(0,1),(1,1),(2,2)}, hists a=[2,1,1] b=[1,2,1]: 1 − 0.25/1.25.
    expect(quadraticWeightedKappa([0, 0, 1, 2], [0, 1, 1, 2], 0, 2)).toBeCloseTo(0.8);
    expect(quadraticWeightedKappa([], [], 0, 20)).toBeNull();
    expect(quadraticWeightedKappa([5, 5], [5, 5], 0, 20)).toBeNull(); // undefined: no expected disagreement
  });

  it('QWK is symmetric and penalizes far misses more than near ones', () => {
    const t = [4, 8, 12, 16, 20, 10];
    const near = [5, 9, 11, 15, 19, 10];
    const far = [12, 16, 4, 8, 10, 20];
    expect(quadraticWeightedKappa(t, near, 0, 20)).toBeCloseTo(quadraticWeightedKappa(near, t, 0, 20) as number);
    expect(quadraticWeightedKappa(t, near, 0, 20)!).toBeGreaterThan(0.9);
    expect(quadraticWeightedKappa(t, far, 0, 20)!).toBeLessThan(0.2);
  });

  it('MAE and Pearson r', () => {
    expect(meanAbsoluteError([10, 12, 15], [11, 12, 12])).toBeCloseTo(4 / 3);
    expect(meanAbsoluteError([], [])).toBeNull();
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1);
    expect(pearson([1, 2, 3], [5, 5, 5])).toBeNull();
    expect(pearson([1, 2, 3, 4], [1, 3, 2, 4])).toBeCloseTo(0.8);
  });

  it('calibrationMetrics: shares, bias, target, per-criterion confusion, worst first', () => {
    const pairs: GradedPair[] = [
      { index: 0, teacher20: 10, ai20: 11, teacherCriteria: { Plan: 1 }, aiCriteria: { plan: 1 } },
      { index: 1, teacher20: 14, ai20: 14, teacherCriteria: { Plan: 2 }, aiCriteria: { Plan: 1 } },
      { index: 2, teacher20: 6, ai20: 12, teacherCriteria: { Plan: 0 }, aiCriteria: { Plan: 2 } },
      { index: 3, teacher20: 18, ai20: 16.5 },
    ];
    const m = calibrationMetrics(pairs);
    expect(m.n).toBe(4);
    expect(m.mae).toBeCloseTo((1 + 0 + 6 + 1.5) / 4, 2);
    expect(m.bias).toBeCloseTo((1 + 0 + 6 - 1.5) / 4, 2);
    expect(m.within2Share).toBeCloseTo(0.75);
    expect(m.exactShare).toBeCloseTo(0.25); // 14 = 14 only (16.5 rounds to 17)
    expect(m.adjacentShare).toBeCloseTo(0.75);
    expect(m.meetsTarget).toBe(false); // 75% < 80%
    expect(m.worst[0]).toMatchObject({ index: 2, error: 6 });
    expect(m.criteria).toHaveLength(1);
    expect(m.criteria[0]).toMatchObject({ label: 'Plan', n: 3 });
    expect(m.criteria[0].confusion).toEqual([[0, 0, 1], [0, 1, 0], [0, 1, 0]]);
    expect(m.criteria[0].exact).toBeCloseTo(1 / 3, 3);
  });

  it('meets the documented target when QWK ≥ 0.6 and ≥ 80% within ±2', () => {
    const pairs = [4, 6, 8, 10, 12, 14, 16, 18, 20, 9].map((t, index) => ({ index, teacher20: t, ai20: t + (index % 2 ? 1 : -1) }));
    expect(calibrationMetrics(pairs).meetsTarget).toBe(true);
  });

  it('itemPair rescales teacher and AI scores to 0–20', () => {
    const item: CalibrationItem = {
      index: 0, status: 'graded', attempts: 1,
      input: { studentText: 't', teacherScore: 7, maxScore: 10, prompt: 'p' },
      ai: { ratio: 0.55, graded: true, criteria: [{ label: 'Plan', level: 1 }] },
    };
    expect(itemPair(item)).toMatchObject({ teacher20: 14, ai20: 11, aiCriteria: { Plan: 1 } });
    expect(itemPair({ ...item, status: 'failed' })).toBeNull();
  });
});

describe('upload parsing', () => {
  it('CSV with quotes, doubled quotes, newlines inside a field, and ; delimiter', () => {
    expect(parseCsv('a,b\n"x, ""y""","line1\nline2"\n')).toEqual([['a', 'b'], ['x, "y"', 'line1\nline2']]);
    expect(parseCsv('a;b\n1;2,5\n')).toEqual([['a', 'b'], ['1', '2,5']]);
  });

  it('the anonymized sample template parses: 3 rows, teacher criterion levels, no errors', () => {
    const { rows, errors } = parseCalibrationUpload(CALIBRATION_SAMPLE_CSV);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ ref: 'copie-001', prompt: 'Le bonheur dépend-il de nous ?', teacherScore: 13, maxScore: 20 });
    expect(rows[0].criteria).toEqual({ 'Introduction et problématique': 2, Plan: 1, 'Argumentation et exemples': 1, Conclusion: 1 });
    expect(rows[2]).toMatchObject({ examId: 'EXAM_ID_DU_CATALOGUE', questionIndex: 4, teacherScore: 11.5 });
    expect(rows[2].criteria).toBeUndefined();
  });

  it('the documented template file is the one the admin page offers', () => {
    const fs = require('fs');
    const path = require('path');
    expect(fs.readFileSync(path.join(__dirname, '../../docs/design/essay-calibration-sample.csv'), 'utf8')).toBe(CALIBRATION_SAMPLE_CSV);
  });

  it('JSON rows with validation errors reported by row', () => {
    const { rows, errors } = parseCalibrationUpload(JSON.stringify([
      { examId: 'ex1', questionIndex: 2, studentText: 'ok', teacherScore: '12,5' },
      { studentText: 'no question', teacherScore: 3 },
      { prompt: 'p', studentText: 'x', teacherScore: 30, maxScore: 20 },
      { prompt: 'p', studentText: 'x', teacherScore: 3, criteria: { Plan: 3 } },
    ]));
    expect(rows).toEqual([{ examId: 'ex1', questionIndex: 2, studentText: 'ok', teacherScore: 12.5, maxScore: 20 }]);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4]);
  });

  it('CSV export carries scores and criteria but never the student text', () => {
    const items: CalibrationItem[] = [{
      index: 0, status: 'graded', attempts: 1,
      input: { ref: 'c1', studentText: 'SECRET TEXT', teacherScore: 10, maxScore: 20, prompt: 'p', criteria: { Plan: 2 } },
      ai: { ratio: 0.6, graded: true, criteria: [{ label: 'Plan', level: 1 }] },
    }];
    const csv = calibrationCsv(items);
    expect(csv).not.toContain('SECRET TEXT');
    expect(csv.split('\n')[0]).toContain('teacher:Plan,ai:Plan');
    expect(csv.split('\n')[1]).toBe('1,c1,,,graded,10,20,10,12,2,,,2,1');
  });
});

describe('batch idempotency', () => {
  const rows: CalibrationInput[] = [0, 1, 2, 3, 4, 5].map((i) => ({ ref: `c${i}`, prompt: 'P', studentText: `t${i}`, teacherScore: 10 + i, maxScore: 20 }));
  const admin = { uid: 'adm1' };
  const graded = (ratio = 0.5): ItemGrade => ({ kind: 'graded', ai: { ratio, graded: true, criteria: [] } });
  // Firestore retries contending transactions until they commit serially;
  // the fake does the same only when asked (two workers update the run doc).
  const newDb = () => { const db = new FakeDb(); db.serializeTransactions = true; return db; };
  const items = (db: FakeDb, runId: string) => db.childrenOf(`essayCalibration/${runId}/items`).map(([, d]) => d as CalibrationItem);

  it('the same rows map to the same run: a second upload does not duplicate items', async () => {
    const db = newDb();
    const a = await createRun(db as any, { rows, admin, now: 1 });
    const b = await createRun(db as any, { rows, admin, now: 2 });
    expect(a.existing).toBe(false);
    expect(b).toEqual({ runId: a.runId, existing: true });
    expect(items(db, a.runId)).toHaveLength(6);
    const other = await createRun(db as any, { rows: rows.slice(1), admin });
    expect(other.runId).not.toBe(a.runId);
    // Re-measuring the same set after a rubric change: a new name is a new run.
    const renamed = await createRun(db as any, { rows, admin, name: 'après changement' });
    expect(renamed.existing).toBe(false);
    expect(renamed.runId).not.toBe(a.runId);
  });

  it('steps grade each item exactly once, resume to completion, and a further step grades nothing', async () => {
    const db = newDb();
    const { runId } = await createRun(db as any, { rows, admin });
    const grade = jest.fn(async () => graded());
    const s1 = await stepRun(db as any, { runId, grade, maxItems: 4 });
    expect(s1).toMatchObject({ kind: 'ok', processed: 4, graded: 4, complete: false });
    // "Tab closed" here; a later step resumes.
    const s2 = await stepRun(db as any, { runId, grade, maxItems: 4 });
    expect(s2).toMatchObject({ processed: 2, graded: 6, total: 6, complete: true });
    const s3 = await stepRun(db as any, { runId, grade, maxItems: 4 });
    expect(s3).toMatchObject({ processed: 0, graded: 6 });
    expect(grade).toHaveBeenCalledTimes(6);
    expect(db.store.get(`essayCalibration/${runId}`)).toMatchObject({ status: 'complete', graded: 6, failed: 0, leaseId: null });
  });

  it('a grade applied twice to the same item is counted once', async () => {
    const db = newDb();
    const { runId } = await createRun(db as any, { rows, admin });
    expect(await applyItemGrade(db as any, runId, 0, graded(0.7), 5)).toBe('applied');
    expect(await applyItemGrade(db as any, runId, 0, graded(0.1), 6)).toBe('skipped');
    expect(db.store.get(`essayCalibration/${runId}`)?.graded).toBe(1);
    expect(items(db, runId)[0].ai?.ratio).toBe(0.7);
  });

  it('a live lease blocks a second tab; an expired lease is taken over', async () => {
    const db = newDb();
    const { runId } = await createRun(db as any, { rows, admin });
    db.store.set(`essayCalibration/${runId}`, { ...db.store.get(`essayCalibration/${runId}`), leaseId: 'other', leaseUntil: 10_000 });
    const grade = jest.fn(async () => graded());
    expect(await stepRun(db as any, { runId, grade, now: () => 5_000 })).toEqual({ kind: 'busy', leaseUntil: 10_000 });
    expect(grade).not.toHaveBeenCalled();
    const s = await stepRun(db as any, { runId, grade, now: () => 10_000 + LEASE_MS });
    expect(s).toMatchObject({ kind: 'ok', processed: 4 });
  });

  it('transient failures retry, then fail after MAX_ATTEMPTS; fatal ones fail at once', async () => {
    const db = newDb();
    const { runId } = await createRun(db as any, { rows: rows.slice(0, 2), admin });
    const grade = jest.fn(async (input: CalibrationInput): Promise<ItemGrade> =>
      input.ref === 'c0' ? { kind: 'retry', error: 'grader_unavailable' } : { kind: 'fatal', error: 'question_not_found' });
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await stepRun(db as any, { runId, grade });
    const [c0, c1] = items(db, runId).sort((a, b) => a.index - b.index);
    expect(c0).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS, error: 'grader_unavailable' });
    expect(c1).toMatchObject({ status: 'failed', attempts: 1, error: 'question_not_found' });
    expect(db.store.get(`essayCalibration/${runId}`)).toMatchObject({ failed: 2, graded: 0, status: 'complete' });
  });
});

describe('gradeCalibrationInput uses the production request shape', () => {
  const exam = {
    exam_id: 'ex1', subject: 'philosophie', level: 'baccalaureat',
    sections: [{ instructions: '', questions: [{ type: 'essay', question: 'Sujet : la liberté.' }] }],
  };

  it('exam rows: question from the flattened paper, the exam subject and level', async () => {
    const grade = jest.fn(async () => ({ ok: true as const, body: { graded: true, ratio: 0.65, criteria: [{ label: 'Plan', level: 2 }], wordStatus: 'ok', rubricProfile: 'dissertation' } }));
    const out = await gradeCalibrationInput(
      { examId: 'ex1', questionIndex: 0, studentText: 'Ma copie', teacherScore: 12, maxScore: 20 },
      { fetchExam: async () => exam, grade },
    );
    expect(out).toEqual({ kind: 'graded', ai: { ratio: 0.65, graded: true, wordStatus: 'ok', rubricProfile: 'dissertation', criteria: [{ label: 'Plan', level: 2 }] } });
    expect((grade.mock.calls[0] as unknown[])[0]).toMatchObject({ question: 'Sujet : la liberté.', answer: 'Ma copie', type: 'essay', level: 'Baccalauréat' });
  });

  it('unknown question → fatal; grader unavailable → retry; too short → graded 0', async () => {
    const input = { examId: 'ex1', questionIndex: 9, studentText: 'x', teacherScore: 1, maxScore: 20 };
    expect(await gradeCalibrationInput(input, { fetchExam: async () => exam, grade: jest.fn() })).toEqual({ kind: 'fatal', error: 'question_not_found' });
    const prompt = { prompt: 'P', studentText: 'x', teacherScore: 1, maxScore: 20 };
    expect(await gradeCalibrationInput(prompt, { fetchExam: async () => null, grade: async () => ({ ok: true, body: { graded: false, wordStatus: 'ok' } }) }))
      .toEqual({ kind: 'retry', error: 'grader_unavailable' });
    const short = await gradeCalibrationInput(prompt, { fetchExam: async () => null, grade: async () => ({ ok: true, body: { graded: false, wordStatus: 'too_short', ratio: 0.9 } }) });
    expect(short).toMatchObject({ kind: 'graded', ai: { ratio: 0, graded: false } });
  });
});

describe('gradeEssay: the one grader behind /api/grade-essay and the harness', () => {
  const long = Array.from({ length: 160 }, (_, i) => `mot${i}`).join(' ');

  it('missing fields, too-short text and no provider never call the model', async () => {
    const chat = jest.fn();
    expect(await gradeEssay({ answer: 'x' }, { chat })).toEqual({ ok: false, error: 'missing_fields' });
    const short = await gradeEssay({ question: 'Q', answer: 'trop court' }, { chat, config: { label: 'x' } as any });
    expect(short).toMatchObject({ ok: true, body: { graded: false, wordStatus: expect.stringMatching(/too_short|empty/) } });
    const none = await gradeEssay({ question: 'Q', answer: long }, { chat, config: null });
    expect(none).toMatchObject({ ok: true, body: { graded: false, score: 'N/A' } });
    expect(chat).not.toHaveBeenCalled();
  });

  it('a model judgement becomes a deterministic graded score; philosophy uses the dissertation profile', async () => {
    const chat = jest.fn(async () => ({ criteria: [], task_response: 2, organization: 1, language: 1, feedback: 'ok' }));
    const out = await gradeEssay({ question: 'La liberté', answer: long, subject: 'Philosophie' }, { chat, config: { label: 'test' } as any });
    expect(out.ok && out.body).toMatchObject({ graded: true, rubricProfile: 'dissertation', provider: 'test' });
    expect(out.ok && typeof out.body.ratio).toBe('number');
    expect((chat.mock.calls[0] as any[])[0]).toMatchObject({ temperature: 0 });
  });
});
