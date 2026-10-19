import {
  DAY_MS,
  PLAN_SCHEDULE_VERSION,
  addLocalDays,
  cleanPlanText,
  cleanPlanTitle,
  dedupePlanTasks,
  examFitsTrack,
  estimateTaskMinutes,
  isTaskOverdue,
  planNeedsReschedule,
  planTaskLabels,
  planTaskRoute,
  planTaskWebPath,
  rescheduleStoredPlan,
  schedulePlanTasks,
  selectExamsForPlan,
  startOfLocalDay,
} from '../../../shared/studyPlanTasks';

const NOW = new Date(2026, 9, 19, 14, 30).getTime(); // 19 Oct 2026, 14:30 local
const TODAY = startOfLocalDay(NOW);
const dayIndex = (ms: number) => Math.round((startOfLocalDay(ms) - TODAY) / DAY_MS);

const exam = (id: string, extra: Record<string, any> = {}) => ({
  type: 'exam', examId: id, subject: 'SVT', status: 'active', history: [], lastPracticedMs: null,
  nextReviewMs: NOW, priority: 0.5, durationMinutes: 60, ...extra,
});

describe('planTaskRoute: each task type opens its own destination', () => {
  it('exam → that exam, with the catalog level mapped to its URL slug', () => {
    expect(planTaskRoute({ type: 'exam', examId: 'ex_1', level: 'baccalaureat' }))
      .toEqual({ kind: 'exam', examId: 'ex_1', levelSlug: 'terminale' });
    expect(planTaskRoute({ type: 'exam', examId: 'ex_2', level: 'universite' }))
      .toEqual({ kind: 'exam', examId: 'ex_2', levelSlug: 'university' });
    expect(planTaskRoute({ type: 'exam', examId: 'ex_3', level: '9eme_af' }))
      .toEqual({ kind: 'exam', examId: 'ex_3', levelSlug: '9e' });
    // Legacy tasks with no type are exams.
    expect(planTaskRoute({ examId: 'ex_4', level: '' })).toEqual({ kind: 'exam', examId: 'ex_4', levelSlug: 'terminale' });
  });

  it('practice → that course chapter, never a bare subject picker', () => {
    expect(planTaskRoute({ type: 'practice', subjectCode: 'CHEM-NSIV', unitId: 'U3' }))
      .toEqual({ kind: 'practice', course: 'CHEM-NSIV', unit: 'U3' });
    expect(planTaskRoute({ type: 'practice', subjectCode: 'MATH-NSI', unitId: '' }))
      .toEqual({ kind: 'practice', course: 'MATH-NSI' });
  });

  it('video → its lesson; the stored code resolves to the course id', () => {
    expect(planTaskRoute({ type: 'video', courseId: 'chem-ns1', lessonId: 'l7', courseCode: 'CHEM-NSI' }))
      .toEqual({ kind: 'lesson', courseId: 'chem-ns1', lessonId: 'l7' });
    // Legacy task: only the code + "video-<lessonId>" taskId were stored.
    const resolveCourseId = (c: string) => (c === 'CHEM-NSI' ? 'chem-ns1' : undefined);
    expect(planTaskRoute({ type: 'video', taskId: 'video-l9', courseCode: 'CHEM-NSI' }, { resolveCourseId }))
      .toEqual({ kind: 'lesson', courseId: 'chem-ns1', lessonId: 'l9' });
  });

  it('a task missing the id it needs is unavailable, not a generic page', () => {
    expect(planTaskRoute({ type: 'exam' })).toEqual({ kind: 'unavailable' });
    expect(planTaskRoute({ type: 'practice' })).toEqual({ kind: 'unavailable' });
    expect(planTaskRoute({ type: 'video', courseCode: 'BIO-X' }, { resolveCourseId: () => undefined }))
      .toEqual({ kind: 'unavailable' });
  });

  it('web paths', () => {
    expect(planTaskWebPath({ kind: 'exam', examId: 'ex_1', levelSlug: 'terminale' })).toBe('/exams/terminale/ex_1');
    expect(planTaskWebPath({ kind: 'practice', course: 'CHEM-NSI', unit: 'U2' })).toBe('/quizzes?course=CHEM-NSI&unit=U2');
    expect(planTaskWebPath({ kind: 'lesson', courseId: 'chem-ns1', lessonId: 'l7' })).toBe('/courses/chem-ns1?lesson=l7');
    expect(planTaskWebPath({ kind: 'unavailable' })).toBe('');
  });
});

describe('dedupe + labels', () => {
  it('drops a repeated exam or task, keeps the first', () => {
    const a = exam('ex_a');
    const out = dedupePlanTasks([a, exam('ex_b'), { ...a, priority: 9 }, { type: 'practice', taskId: 'p1' }, { type: 'practice', taskId: 'p1' }]);
    expect(out.map((t: any) => t.examId || t.taskId)).toEqual(['ex_a', 'ex_b', 'p1']);
    expect(out[0]).toBe(a);
  });

  it('tells same-titled papers apart by a topic of their own', () => {
    const tasks = [
      exam('ex_1', { topics: ['Génétique', 'Immunologie'] }),
      exam('ex_2', { topics: ['Génétique', 'Neurone'] }),
      exam('ex_3', { topics: ['Histologie'] }),
      exam('ex_4', { year: 2019 }),
    ];
    const base = (t: any) => (t.examId === 'ex_4' ? 'SVT · 2019' : 'SVT · Juin 2016');
    const labels = planTaskLabels(tasks, base);
    expect(labels.get('exam:ex_1')).toBe('SVT · Juin 2016 · Immunologie');
    expect(labels.get('exam:ex_2')).toBe('SVT · Juin 2016 · Neurone');
    expect(labels.get('exam:ex_3')).toBe('SVT · Juin 2016 · Histologie');
    expect(labels.get('exam:ex_4')).toBe('SVT · 2019');
  });

  it('falls back to "Sujet n" when topics cannot separate them', () => {
    const tasks = [exam('ex_1', { topics: ['Esthétique'] }), exam('ex_2', { topics: ['Esthétique'] }), exam('ex_3')];
    const labels = planTaskLabels(tasks, () => 'SVT · 2021', { subjectWord: 'Sujet' });
    expect([...labels.values()]).toEqual(['SVT · 2021 · Sujet 1', 'SVT · 2021 · Sujet 2', 'SVT · 2021 · Sujet 3']);
    expect(new Set(labels.values()).size).toBe(3);
  });
});

describe('selectExamsForPlan', () => {
  const coeff = { SVT: 4, Philosophie: 2 };
  const paper = (id: string, year: number, tracks: string[], subject = 'SVT', difficulty = 3) =>
    ({ exam_id: id, subject, year: String(year), tracks, difficulty });

  it('leaves out papers set for another filière', () => {
    expect(examFitsTrack(paper('a', 2019, ['SES', 'SMP']), 'SVT')).toBe(false);
    expect(examFitsTrack(paper('b', 2019, ['ALL']), 'SVT')).toBe(true);
    expect(examFitsTrack(paper('c', 2019, []), 'SVT')).toBe(true);
    expect(examFitsTrack(paper('d', 2015, ['SES', 'LLA', 'SMP']), 'LET')).toBe(true);
    expect(examFitsTrack(paper('e', 2021, ['BAC', 'PERMANENT']), 'SVT')).toBe(true);
  });

  it('spreads picks across years instead of three from one session', () => {
    const exams = [
      paper('s16a', 2016, ['SVT'], 'SVT', 1), paper('s16b', 2016, ['SVT'], 'SVT', 2), paper('s16c', 2016, ['SVT'], 'SVT', 2),
      paper('s21a', 2021, ['SVT']), paper('s21b', 2021, ['SVT']),
      paper('s22a', 2022, ['SVT']), paper('sOther', 2019, ['SES', 'SMP']),
      paper('p1', 2022, ['ALL'], 'Philosophie'), paper('p1', 2022, ['ALL'], 'Philosophie'),
    ];
    const picked = selectExamsForPlan(exams, coeff, 6, 'SVT');
    const ids = picked.map((e) => e.exam_id);
    expect(ids).not.toContain('sOther');
    expect(ids.filter((i) => i === 'p1')).toHaveLength(1);
    const svtYears = picked.filter((e) => e.subject === 'SVT').map((e) => e.year);
    expect(svtYears.slice(0, 3).sort()).toEqual(['2016', '2021', '2022']);
  });

  it('keeps a subject that has only other-filière papers rather than dropping it', () => {
    const picked = selectExamsForPlan([paper('x', 2019, ['SES'])], { SVT: 1 }, 5, 'SVT');
    expect(picked.map((e) => e.exam_id)).toEqual(['x']);
  });
});

describe('schedulePlanTasks', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) =>
    exam(`ex_${i}`, { subject: i % 2 ? 'SVT' : 'Philosophie' }));

  it('a new 43-task plan does not dump everything on today', () => {
    const out = schedulePlanTasks(many(43), { dailyMinutes: 60, weeks: 4, startMs: NOW });
    const today = out.filter((t) => dayIndex(t.nextReviewMs) === 0);
    expect(today).toHaveLength(1);
    // 60-minute papers, 60 min a day → one a day, every task on its own day.
    expect(new Set(out.map((t) => dayIndex(t.nextReviewMs))).size).toBe(43);
    expect(out.every((t) => t.nextReviewMs >= TODAY)).toBe(true);
    // Nothing is late on day one.
    expect(out.some((t) => isTaskOverdue(t, NOW))).toBe(false);
  });

  it('packs the daily budget and spreads short plans over the whole span', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) => ({ type: 'practice', taskId: `p${i}`, subject: 'Chimie', questionCount: 10, status: 'active', history: [] })),
    ];
    // 15 min each, 60 min/day → 4 a day → 2 days of work over a 1-week plan.
    const out = schedulePlanTasks(tasks, { dailyMinutes: 60, weeks: 1, startMs: NOW });
    const days = out.map((t) => dayIndex(t.nextReviewMs));
    expect(days.filter((d) => d === 0)).toHaveLength(4);
    expect(Math.max(...days)).toBeGreaterThan(1); // second day pushed out, not tomorrow
    expect(Math.max(...days)).toBeLessThan(7);
  });

  it('alternates subjects day to day', () => {
    const tasks = [
      exam('m1', { subject: 'Maths' }), exam('m2', { subject: 'Maths' }), exam('m3', { subject: 'Maths' }),
      exam('s1', { subject: 'SVT' }), exam('s2', { subject: 'SVT' }),
    ];
    const out = schedulePlanTasks(tasks, { dailyMinutes: 60, weeks: 1, startMs: NOW });
    expect(out.slice(0, 4).map((t) => t.subject)).toEqual(['Maths', 'SVT', 'Maths', 'SVT']);
  });

  it('keeps the spaced-repetition date of practised tasks and leaves mastered ones', () => {
    const practised = exam('done', { history: [{ scorePct: 50 }], lastPracticedMs: NOW - DAY_MS, nextReviewMs: addLocalDays(TODAY, 3) });
    const mastered = exam('m', { status: 'mastered', nextReviewMs: 123 });
    const out = schedulePlanTasks([practised, mastered, exam('new')], { dailyMinutes: 60, weeks: 2, startMs: NOW });
    expect(out.find((t) => t.examId === 'done')!.nextReviewMs).toBe(addLocalDays(TODAY, 3));
    expect(out.find((t) => t.examId === 'm')!.nextReviewMs).toBe(123);
    expect(out[out.length - 1].examId).toBe('m');
    expect(dayIndex(out.find((t) => t.examId === 'new')!.nextReviewMs)).toBe(0);
  });

  it('estimates minutes per task type within sane bounds', () => {
    expect(estimateTaskMinutes({ type: 'video', duration: 12 })).toBe(12);
    expect(estimateTaskMinutes({ type: 'practice', questionCount: 100 })).toBe(30);
    expect(estimateTaskMinutes({ type: 'exam', durationMinutes: 600 })).toBe(240);
    expect(estimateTaskMinutes({ type: 'exam' })).toBe(90);
  });
});

describe('stored plans and overdue', () => {
  it('legacy plans (no scheduleVersion) are respread once, duplicates removed', () => {
    const legacy = { dailyTargetMinutes: 60, weeklyGoals: 4, tasks: [exam('a'), exam('b'), exam('a'), exam('c')] };
    expect(planNeedsReschedule(legacy)).toBe(true);
    const patch = rescheduleStoredPlan(legacy, NOW);
    expect(patch.scheduleVersion).toBe(PLAN_SCHEDULE_VERSION);
    expect(patch.tasks).toHaveLength(3);
    expect(patch.tasks.filter((t) => dayIndex(t.nextReviewMs) === 0)).toHaveLength(1);
    expect(planNeedsReschedule({ ...legacy, ...patch })).toBe(false);
  });

  it('late means a past day, never earlier today', () => {
    expect(isTaskOverdue({ nextReviewMs: TODAY + 1000, status: 'active' }, NOW)).toBe(false);
    expect(isTaskOverdue({ nextReviewMs: TODAY - 1, status: 'active' }, NOW)).toBe(true);
    expect(isTaskOverdue({ nextReviewMs: TODAY - 1, status: 'mastered' }, NOW)).toBe(false);
  });
});

describe('house style', () => {
  it('no em dashes in plan titles or text', () => {
    expect(cleanPlanTitle("Plan d'étude — SVT")).toBe("Plan d'étude · SVT");
    expect(cleanPlanText('Révisez — puis testez.')).toBe('Révisez, puis testez.');
  });
});
