import { gradeExamPendingEssays } from '../../../../shared/essayRegrade';

const questions = [
  { type: 'multiple_choice', points: 2, options: { a: '1', b: '2' }, correct: 'b' },
  { type: 'essay', points: 10, question: 'Disserte.' },
  { type: 'short_answer', points: 4, question: 'Cite un auteur.', correct: 'Descartes' },
];

describe('gradeExamPendingEssays with immediate-mode results', () => {
  it('keeps pre-graded results and never re-queues them for the grader', () => {
    const answers = { 0: 'b', 1: 'Un long texte de dissertation pour le test.', 2: 'Kant' };
    const preGraded = { 2: { status: 'partial', result: { awarded: 2, maxPoints: 4 } } };
    const g = gradeExamPendingEssays(questions, answers, { subject: 'Philosophie' }, preGraded);
    expect(g.results[2]).toBe(preGraded[2]);
    expect(g.pending).not.toContain(2);
    expect(g.pending).toContain(1);
  });

  it('behaves as before without pre-graded results', () => {
    const g = gradeExamPendingEssays(questions, { 0: 'b' }, {});
    expect(g.results[0].status).toBe('correct');
  });
});
