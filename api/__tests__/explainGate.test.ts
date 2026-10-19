/**
 * "Explique-moi" lifts Sandra's never-reveal-the-answer rule. The context that
 * asks for it is client-asserted, so these pin what the SERVER requires before
 * it grants that: a verifiable, already-corrected question for this uid, no
 * live competition round, and the server's own copy of the key.
 */
import { FakeDb } from './helpers/fakeFirestore';
import { gateQuestionContext, type GateDeps } from '../_lib/explainGate';
import { buildSandraSystemPrompt } from '../_lib/sandraPrompt';
import { sanitizeQuestionContext, type QuestionContext } from '../../shared/explainContext';

const UID = 'stu1';
const NOW = 1_800_000_000_000;
const EXAM_ID = 'ex_abc';

const exam = {
  exam_id: EXAM_ID,
  sections: [
    {
      section_title: 'Partie A',
      questions: [
        { number: 1, type: 'multiple_choice', question: 'Combien font 2 + 2 ?', options: { a: '3', b: '4' }, correct: 'b', explanation: 'On additionne.' },
        { number: 2, type: 'short_answer', question: 'Dérivée de x^2 ?', correct: '2x', explanation: 'Règle de puissance.' },
      ],
    },
  ],
};

const FORGED = 'FORGED-KEY-42';

function ctx(over: Partial<QuestionContext> & Record<string, unknown>): QuestionContext {
  return sanitizeQuestionContext({
    surface: 'practice',
    question: 'Une question quelconque',
    studentAnswer: 'ma réponse',
    expectedAnswer: FORGED,
    explanation: 'explication forgée',
    status: 'incorrect',
    ...over,
  })!;
}

function deps(db: FakeDb, fetchExam: GateDeps['fetchExam'] = async (id) => (id === EXAM_ID ? exam : null)): GateDeps {
  return { db: db as any, fetchExam, now: NOW };
}

function submittedExam(db: FakeDb) {
  db.store.set(`users/${UID}/examResults/${EXAM_ID}`, { answers: { 0: 'a', 1: '3x' }, submitted_at_ms: NOW - 1000 });
  db.store.set(`users/${UID}/examAttempts/${EXAM_ID}`, { status: 'submitted' });
}

const examCtx = (questionId = '0') => ctx({ surface: 'exam_results', examId: EXAM_ID, questionId, question: 'texte client' });

describe('explainGate', () => {
  it('unknown source (no ids): no exception, forged key kept out of prompt and retrieval', async () => {
    const g = await gateQuestionContext(ctx({}), UID, deps(new FakeDb()));
    expect(g.verified).toBe(false);
    expect(g.explain).toBeUndefined();
    expect(g.retrievalQuery).not.toContain(FORGED);
    const prompt = buildSandraSystemPrompt({ lang: 'fr', chunks: [], tutorQuestion: g.tutor });
    expect(prompt).not.toContain(FORGED);
    expect(prompt).not.toContain('explication forgée');
    expect(prompt).not.toContain('déjà été corrigée');
    expect(prompt).not.toContain('DÉJÀ été montrée');
    expect(prompt).toContain('Ne donne NI la réponse finale');
  });

  it('arena / tournament / duel style ids: no exception', async () => {
    const db = new FakeDb();
    for (const questionId of ['arena_t1_3', 'duel:abc:2', 'tq-live-7']) {
      const g = await gateQuestionContext(ctx({ questionId }), UID, deps(db));
      expect(g.verified).toBe(false);
      expect(g.reason).toBe('question_not_found');
    }
  });

  it('exam question without a submitted result: no exception', async () => {
    const g = await gateQuestionContext(examCtx(), UID, deps(new FakeDb()));
    expect(g.verified).toBe(false);
    expect(g.reason).toBe('exam_not_submitted');
    expect(g.retrievalQuery).toBe('texte client');
  });

  it('exam retake in progress (old result kept, attempt in_progress): no exception', async () => {
    const db = new FakeDb();
    submittedExam(db);
    db.store.set(`users/${UID}/examAttempts/${EXAM_ID}`, { status: 'in_progress' });
    const g = await gateQuestionContext(examCtx(), UID, deps(db));
    expect(g.verified).toBe(false);
    expect(g.reason).toBe('exam_not_submitted');
  });

  it('exam submitted: exception granted with the SERVER key and text, forged key ignored', async () => {
    const db = new FakeDb();
    submittedExam(db);
    const g = await gateQuestionContext(examCtx('0'), UID, deps(db));
    expect(g.verified).toBe(true);
    expect(g.reason).toBe('verified_exam');
    expect(g.explain!.question).toBe('Combien font 2 + 2 ?');
    expect(g.explain!.expectedAnswer).toBe('B) 4');
    expect(g.explain!.explanation).toBe('On additionne.');
    expect(g.explain!.studentAnswer).toBe('A) 3');
    expect(g.retrievalQuery).not.toContain(FORGED);
    const prompt = buildSandraSystemPrompt({ lang: 'fr', chunks: [], questionContext: g.explain });
    expect(prompt).toContain('Réponse attendue (corrigé officiel) : B) 4');
    expect(prompt).not.toContain(FORGED);
  });

  it('exam submitted but the question index does not exist: no exception', async () => {
    const db = new FakeDb();
    submittedExam(db);
    const g = await gateQuestionContext(examCtx('9'), UID, deps(db));
    expect(g.verified).toBe(false);
    expect(g.reason).toBe('question_not_found');
  });

  it('another student\'s submission does not count', async () => {
    const db = new FakeDb();
    db.store.set(`users/other/examResults/${EXAM_ID}`, { answers: {} });
    const g = await gateQuestionContext(examCtx(), UID, deps(db));
    expect(g.verified).toBe(false);
  });

  it('practice bank question: server copy used, forged key ignored', async () => {
    const db = new FakeDb();
    db.store.set('quizzes/qz1', {
      question: 'Quelle est la capitale d\'Haïti ?',
      options: '["Cap-Haïtien","Port-au-Prince","Jacmel"]',
      correct_answer: 'B',
      explanation: 'Port-au-Prince est la capitale.',
      subject_code: 'HIST-NS1',
    });
    const g = await gateQuestionContext(ctx({ questionId: 'qz1', question: 'texte trafiqué' }), UID, deps(db));
    expect(g.verified).toBe(true);
    expect(g.reason).toBe('verified_bank');
    expect(g.explain!.question).toBe('Quelle est la capitale d\'Haïti ?');
    expect(g.explain!.expectedAnswer).toBe('Port-au-Prince');
    expect(g.explain!.explanation).toBe('Port-au-Prince est la capitale.');
    expect(JSON.stringify(g)).not.toContain(FORGED);
  });

  it('active user-tournament round: downgraded even for a verified question', async () => {
    const db = new FakeDb();
    submittedExam(db);
    db.store.set(`users/${UID}/myTournaments/t1`, { tid: 't1', startsAt: NOW - 60_000 });
    db.store.set('userTournaments/t1', { state: 'running', schedule: { startsAt: NOW - 60_000, endsAt: NOW + 3_600_000 } });
    const g = await gateQuestionContext(examCtx(), UID, deps(db));
    expect(g.verified).toBe(false);
    expect(g.reason).toBe('competition_live');
    expect(g.explain).toBeUndefined();
  });

  it('lazily-ticked tournament still "scheduled" past its start counts as live', async () => {
    const db = new FakeDb();
    db.store.set(`users/${UID}/myTournaments/t1`, { tid: 't1', startsAt: NOW - 60_000 });
    db.store.set('userTournaments/t1', { state: 'scheduled', schedule: { endsAt: NOW + 60_000 } });
    db.store.set('quizzes/qz1', { question: 'Q', correct_answer: 'x' });
    const g = await gateQuestionContext(ctx({ questionId: 'qz1' }), UID, deps(db));
    expect(g.reason).toBe('competition_live');
  });

  it('finished tournaments and far-future ones do not downgrade', async () => {
    const db = new FakeDb();
    submittedExam(db);
    db.store.set(`users/${UID}/myTournaments/t1`, { tid: 't1', startsAt: NOW - 86_400_000 });
    db.store.set('userTournaments/t1', { state: 'finished', schedule: { endsAt: NOW - 3_600_000 } });
    db.store.set(`users/${UID}/myTournaments/t2`, { tid: 't2', startsAt: NOW + 86_400_000 });
    db.store.set('userTournaments/t2', { state: 'scheduled', schedule: { endsAt: NOW + 90_000_000 } });
    const g = await gateQuestionContext(examCtx(), UID, deps(db));
    expect(g.verified).toBe(true);
  });

  it('live Arena championship the student is registered in: downgraded', async () => {
    const db = new FakeDb();
    submittedExam(db);
    db.store.set('tournaments/arena1', { state: 'live' });
    db.store.set(`tournaments/arena1/players/${UID}`, { school: 'x' });
    const g = await gateQuestionContext(examCtx(), UID, deps(db));
    expect(g.reason).toBe('competition_live');
  });

  it('live Arena the student is NOT in does not downgrade', async () => {
    const db = new FakeDb();
    submittedExam(db);
    db.store.set('tournaments/arena1', { state: 'live' });
    const g = await gateQuestionContext(examCtx(), UID, deps(db));
    expect(g.verified).toBe(true);
  });

  it('fails closed when verification throws', async () => {
    const db = new FakeDb();
    submittedExam(db);
    const g = await gateQuestionContext(examCtx(), UID, deps(db, async () => { throw new Error('network'); }));
    expect(g.verified).toBe(false);
    expect(g.reason).toBe('error');
  });

  it('a legacy numeric exam id is not verifiable', async () => {
    const db = new FakeDb();
    db.store.set(`users/${UID}/examResults/12`, { answers: {} });
    const g = await gateQuestionContext(ctx({ surface: 'exam_results', examId: '12', questionId: '0' }), UID, deps(db));
    expect(g.verified).toBe(false);
    expect(g.reason).toBe('unverifiable');
  });
});
