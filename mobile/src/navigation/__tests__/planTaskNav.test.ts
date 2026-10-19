import { planTaskNavAction } from '../planTaskNav';
import { examStackRoot } from '../navHelpers';

describe('planTaskNavAction: a study-plan task opens its own screen', () => {
  it('exam → Exams › ExamOverview for that paper (slug level), root kept underneath', () => {
    expect(planTaskNavAction({ type: 'exam', examId: 'ex_42', level: 'baccalaureat' })).toEqual({
      tab: 'Exams',
      params: { screen: 'ExamOverview', params: { level: 'terminale', examId: 'ex_42' }, initial: false },
    });
  });

  it('practice → Courses › Quizzes with a handoff naming the course and chapter', () => {
    expect(planTaskNavAction({ type: 'practice', subjectCode: 'CHEM-NSIV', unitId: 'U3' })).toEqual({
      tab: 'Courses',
      params: { screen: 'Quizzes', params: { handoff: { course: 'CHEM-NSIV', unit: 'U3' } }, initial: false },
    });
  });

  it('video → Courses › CourseDetail at the lesson, course code resolved to its id', () => {
    const resolve = (c: string) => (c === 'PHYS-NSII' ? 'phys-ns2' : undefined);
    expect(planTaskNavAction({ type: 'video', taskId: 'video-les_9', courseCode: 'PHYS-NSII' }, resolve)).toEqual({
      tab: 'Courses',
      params: { screen: 'CourseDetail', params: { courseId: 'phys-ns2', lessonId: 'les_9' }, initial: false },
    });
  });

  it('no id → no action (row is not tappable), never a tab root', () => {
    expect(planTaskNavAction({ type: 'exam' })).toBeNull();
    expect(planTaskNavAction({ type: 'practice' })).toBeNull();
    expect(planTaskNavAction({ type: 'video', courseCode: 'X' }, () => undefined)).toBeNull();
  });
});

describe('examStackRoot', () => {
  it('ExamsNavigator resets to ExamLanding; QuizNavigator (quiz-primary grades) to Quizzes', () => {
    const nav = (routeNames: string[]) => ({ getState: () => ({ routeNames }) });
    expect(examStackRoot(nav(['ExamLanding', 'ExamBrowser', 'ExamOverview']))).toBe('ExamLanding');
    expect(examStackRoot(nav(['Quizzes', 'ExamBrowser', 'ExamOverview']))).toBe('Quizzes');
    expect(examStackRoot({})).toBe('ExamLanding');
  });
});
