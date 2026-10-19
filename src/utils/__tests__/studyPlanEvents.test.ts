/**
 * P-2 / P-3 / E-13: a finished exam, practice or lesson advances the plan task
 * it corresponds to — the inverse of planTaskRoute.
 */
import { applyPlanEvent, applyTaskIdResult, planTaskMatchesEvent } from '../../../shared/studyPlanTasks';
import { computeSRS, scoreToQuality } from '../../services/studyPlanService';

const srs = { computeSRS, scoreToQuality };
const NOW = 1_900_000_000_000;

const exam = { type: 'exam', examId: 'bac-svt-2021', status: 'active', repetitions: 0, interval: 0, history: [] };
const chapter = { type: 'practice', taskId: 'practice-CHEM-NS1-U2', subjectCode: 'CHEM-NS1', unitId: 'U2', status: 'active', history: [] };
const course = { type: 'practice', taskId: 'practice-PHYS-NS1', subjectCode: 'PHYS-NS1', unitId: '', status: 'active', history: [] };
const video = { type: 'video', taskId: 'video-L7', courseId: 'chem-ns1', lessonId: 'L7', status: 'active', history: [] };
const legacyVideo = { type: 'video', taskId: 'video-L9', courseCode: 'CHEM-NSI', status: 'active', history: [] };

describe('planTaskMatchesEvent', () => {
  it('matches an exam by its id', () => {
    expect(planTaskMatchesEvent(exam, { kind: 'exam', examId: 'bac-svt-2021' })).toBe(true);
    expect(planTaskMatchesEvent(exam, { kind: 'exam', examId: 'other' })).toBe(false);
  });

  it('a chapter practice task needs that chapter; a course task takes any chapter', () => {
    expect(planTaskMatchesEvent(chapter, { kind: 'practice', course: 'chem-ns1', unit: 'U2' })).toBe(true);
    expect(planTaskMatchesEvent(chapter, { kind: 'practice', course: 'CHEM-NS1', unit: 'U3' })).toBe(false);
    expect(planTaskMatchesEvent(chapter, { kind: 'practice', course: 'CHEM-NS1', unit: '*' })).toBe(false);
    expect(planTaskMatchesEvent(course, { kind: 'practice', course: 'PHYS-NS1', unit: 'U5' })).toBe(true);
  });

  it('a video task is completed by finishing its lesson, resolving legacy course codes', () => {
    expect(planTaskMatchesEvent(video, { kind: 'lesson', courseId: 'chem-ns1', lessonId: 'L7' })).toBe(true);
    expect(planTaskMatchesEvent(video, { kind: 'lesson', courseId: 'chem-ns1', lessonId: 'L8' })).toBe(false);
    const resolveCourseId = (c: string) => (c === 'CHEM-NSI' ? 'chem-ns1' : undefined);
    expect(planTaskMatchesEvent(legacyVideo, { kind: 'lesson', courseId: 'chem-ns1', lessonId: 'L9' }, { resolveCourseId })).toBe(true);
  });
});

describe('applyPlanEvent', () => {
  it('advances only the matching tasks, with history and SRS', () => {
    const r = applyPlanEvent([exam, chapter, video], { kind: 'practice', course: 'CHEM-NS1', unit: 'U2' }, 90, NOW, srs);
    expect(r.changed).toBe(1);
    expect(r.tasks[0]).toBe(exam);
    expect(r.tasks[1].history).toEqual([{ scorePct: 90, quality: 5, answeredAt: NOW }]);
    expect(r.tasks[1].lastPracticedMs).toBe(NOW);
    expect(r.tasks[1].repetitions).toBe(1);
  });

  it('reports no change when nothing matches (no write)', () => {
    expect(applyPlanEvent([exam], { kind: 'lesson', courseId: 'x', lessonId: 'y' }, 100, NOW, srs).changed).toBe(0);
  });

  it('keeps the old id contract for exam results', () => {
    const r = applyTaskIdResult([chapter, exam], 'bac-svt-2021', 50, NOW, srs);
    expect(r.changed).toBe(1);
    expect(r.tasks[1].history).toHaveLength(1);
  });
});
