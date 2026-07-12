/**
 * Tests for api/_lib/sandraTools.ts — Sandra's tool schemas + uid-scoped
 * executors (Task 3 of the Sandra v2 tool-calling plan).
 *
 * Everything with I/O is mocked: `_lib/firebaseAdmin` (fake in-memory
 * Firestore that RECORDS every path touched, so uid scoping is assertable),
 * `_lib/planGeneration` (virtual — built in a parallel task), `fetch` (exam
 * catalog), and the client-SDK deps of `src/services/studyPlanService`
 * (imported for real to prove the server-side task builder is a faithful
 * mirror of `buildTasksFromExams`).
 */

jest.mock('../../../api/_lib/firebaseAdmin', () => ({
  getDb: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ __serverTimestamp: true }),
  },
}));

// planGeneration.ts is being built in a parallel task — virtual mock.
jest.mock(
  '../../../api/_lib/planGeneration',
  () => ({ generatePlanCore: jest.fn() }),
  { virtual: true },
);

// Client-side deps of studyPlanService (imported only for the parity test).
jest.mock('../../services/firebase', () => ({ db: {}, auth: {} }));
jest.mock('../../services/streakService', () => ({ recordActivity: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), doc: jest.fn(), getDoc: jest.fn(), getDocs: jest.fn(),
  setDoc: jest.fn(), updateDoc: jest.fn(), deleteDoc: jest.fn(),
  query: jest.fn(), where: jest.fn(), orderBy: jest.fn(), limit: jest.fn(),
  serverTimestamp: jest.fn(),
}));

import {
  SANDRA_TOOL_DEFS,
  createToolExecutor,
  buildTasksFromExamsServer,
} from '../../../api/_lib/sandraTools';
import { getDb } from '../../../api/_lib/firebaseAdmin';
import { generatePlanCore } from '../../../api/_lib/planGeneration';
import { buildTasksFromExams } from '../../services/studyPlanService';

const getDbMock = getDb as jest.Mock;
const generatePlanCoreMock = generatePlanCore as jest.Mock;

// ─── Fake admin Firestore ────────────────────────────────────────────────────
// Docs seeded as { 'users/u1/examResults/ex-a': {...} }. Records every
// collection()/doc() path so tests can assert uid scoping, plus all writes.

interface FakeDbHandle {
  db: { collection: (name: string) => unknown };
  paths: string[];
  sets: Array<{ path: string; data: Record<string, unknown> }>;
  updates: Array<{ path: string; data: Record<string, unknown> }>;
}

function makeFakeDb(store: Record<string, Record<string, unknown>>): FakeDbHandle {
  const paths: string[] = [];
  const sets: FakeDbHandle['sets'] = [];
  const updates: FakeDbHandle['updates'] = [];
  let autoId = 0;

  function makeDoc(docPath: string) {
    paths.push(docPath);
    return {
      id: docPath.split('/').pop(),
      collection: (sub: string) => makeCollection(`${docPath}/${sub}`),
      async get() {
        const data = store[docPath];
        return { exists: !!data, id: docPath.split('/').pop(), data: () => data };
      },
      async set(data: Record<string, unknown>) {
        sets.push({ path: docPath, data });
        store[docPath] = data;
      },
      async update(data: Record<string, unknown>) {
        updates.push({ path: docPath, data });
        store[docPath] = { ...(store[docPath] || {}), ...data };
      },
    };
  }

  function makeSnap(p: string, d: Record<string, unknown>) {
    return { id: p.split('/').pop(), data: () => d, ref: makeDoc(p) };
  }

  function makeCollection(path: string) {
    paths.push(path);
    const filters: Array<{ field: string; value: unknown }> = [];
    let max = Infinity;
    const col = {
      doc: (id?: string) => makeDoc(`${path}/${id || `auto-${++autoId}`}`),
      where(field: string, _op: string, value: unknown) {
        filters.push({ field, value });
        return col;
      },
      orderBy() { return col; },
      limit(n: number) { max = n; return col; },
      async get() {
        const prefix = `${path}/`;
        let entries = Object.entries(store).filter(
          ([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'),
        );
        for (const f of filters) {
          entries = entries.filter(([, d]) => d[f.field] === f.value);
        }
        entries.sort(
          (a, b) => (Number(b[1].created_at_ms) || 0) - (Number(a[1].created_at_ms) || 0),
        );
        entries = entries.slice(0, max);
        const docs = entries.map(([p, d]) => makeSnap(p, d));
        return { empty: docs.length === 0, docs };
      },
    };
    return col;
  }

  return { db: { collection: (name: string) => makeCollection(name) }, paths, sets, updates };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ORIGIN = 'https://app.test';
const UID = 'student-1';

const CATALOG = [
  { exam_id: 'ex-chim-1', exam_title: 'Chimie Bac I', level: 'baccalaureat', subject: 'Chimie', year: '2019', difficulty: 2, topics: ['Acides'] },
  { exam_id: 'ex-chim-2', exam_title: 'Chimie Bac II', level: 'baccalaureat', subject: 'Chimie', year: '2020', difficulty: 4 },
  { exam_id: 'ex-chim-3', exam_title: 'Chimie Bac III', level: 'baccalaureat', subject: 'Chimie', year: '2021', difficulty: 1 },
  { exam_id: 'ex-chim-4', exam_title: 'Chimie Bac IV', level: 'baccalaureat', subject: 'Chimie', year: '2022', difficulty: 3 },
  { exam_id: 'ex-chim-5', exam_title: 'Chimie Bac V', level: 'baccalaureat', subject: 'Chimie', year: '2023', difficulty: 5 },
  { exam_id: 'ex-chim-6', exam_title: 'Chimie Bac VI', level: 'baccalaureat', subject: 'Chimie', year: '2024', difficulty: 3 },
  { exam_id: 'ex-chim-u', exam_title: 'Chimie Université', level: 'universite', subject: 'Chimie', year: '2018', difficulty: 3 },
  { exam_id: 'ex-math-1', exam_title: 'Maths Bac', level: 'baccalaureat', subject: 'Mathématiques', year: '2020', difficulty: 2 },
];

/** examResults docs for UID: two Chimie (40 %, 60 %) + four Mathématiques. */
function seedExamResults(): Record<string, Record<string, unknown>> {
  return {
    [`users/${UID}/examResults/ex-chim-3`]: {
      subject: 'Chimie', summary: { percentage: 40 }, submitted_at_ms: 1_000,
    },
    [`users/${UID}/examResults/ex-chim-old`]: {
      subject: 'Chimie', percentage: 60, created_at_ms: 2_000,
    },
    [`users/${UID}/examResults/ex-m1`]: { subject: 'Mathématiques', summary: { percentage: 80 }, submitted_at_ms: 3_000 },
    [`users/${UID}/examResults/ex-m2`]: { subject: 'Mathématiques', summary: { percentage: 70 }, submitted_at_ms: 4_000 },
    [`users/${UID}/examResults/ex-m3`]: { subject: 'Mathématiques', summary: { percentage: 60 }, submitted_at_ms: 5_000 },
    [`users/${UID}/examResults/ex-m4`]: { subject: 'Mathématiques', summary: { percentage: 90 }, submitted_at_ms: 6_000 },
    // Another student's data — must never be read or returned.
    'users/intruder/examResults/ex-x': { subject: 'Chimie', summary: { percentage: 99 }, submitted_at_ms: 9_000 },
  };
}

let fetchMock: jest.Mock;

function setup(store: Record<string, Record<string, unknown>>) {
  const handle = makeFakeDb(store);
  getDbMock.mockReturnValue(handle.db);
  return handle;
}

beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => CATALOG });
  (global as Record<string, unknown>).fetch = fetchMock;
  generatePlanCoreMock.mockResolvedValue({
    plan: {
      title: 'Plan Chimie 4 semaines',
      description: 'Un plan ciblé.',
      weeklyGoals: 4,
      dailyTargetMinutes: 60,
      tips: ['Astuce 1'],
      schedule: [],
    },
    source: 'ai',
  });
});

// ─── Tool schemas ────────────────────────────────────────────────────────────

describe('SANDRA_TOOL_DEFS', () => {
  it('declares exactly the three tools named by the prompt TOOLS_GUIDE', () => {
    expect(SANDRA_TOOL_DEFS.map((t) => t.name)).toEqual([
      'get_student_progress',
      'recommend_exams',
      'save_study_plan',
    ]);
    for (const def of SANDRA_TOOL_DEFS) {
      expect(typeof def.description).toBe('string');
      expect(def.description.length).toBeGreaterThan(0);
      expect((def.parameters as { type: string }).type).toBe('object');
    }
  });

  it('pins required parameters per tool', () => {
    const byName = Object.fromEntries(SANDRA_TOOL_DEFS.map((t) => [t.name, t.parameters as {
      properties: Record<string, unknown>; required?: string[];
    }]));
    expect(byName.get_student_progress.required || []).toEqual([]);
    expect(byName.recommend_exams.required).toEqual(['level']);
    expect(Object.keys(byName.recommend_exams.properties)).toEqual(
      expect.arrayContaining(['level', 'subject', 'count']),
    );
    expect(byName.save_study_plan.required).toEqual(['subjects', 'weeks', 'dailyMinutes']);
    expect(Object.keys(byName.save_study_plan.properties)).toEqual(
      expect.arrayContaining(['subjects', 'weeks', 'dailyMinutes', 'confirmReplace']),
    );
  });
});

// ─── get_student_progress ────────────────────────────────────────────────────

describe('get_student_progress', () => {
  it('returns the empty-state note when the student has no results', async () => {
    setup({});
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });
    const out = await exec('get_student_progress', {});
    expect(out).toEqual(expect.objectContaining({ perSubject: [], note: 'aucun examen complété' }));
  });

  it('aggregates per-subject averages, total attempts and the 5 most recent results', async () => {
    setup(seedExamResults());
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });
    const out = (await exec('get_student_progress', {})) as {
      perSubject: Array<{ subject: string; attempts: number; avgPct: number }>;
      totalAttempts: number;
      recent: Array<{ examId: string; subject: string; pct: number; when: number }>;
    };

    expect(out.totalAttempts).toBe(6);
    expect(out.perSubject).toEqual(expect.arrayContaining([
      { subject: 'Chimie', attempts: 2, avgPct: 50 }, // summary.percentage AND bare percentage both read
      { subject: 'Mathématiques', attempts: 4, avgPct: 75 },
    ]));
    expect(out.recent).toHaveLength(5); // capped at 5
    expect(out.recent[0]).toEqual({ examId: 'ex-m4', subject: 'Mathématiques', pct: 90, when: 6_000 });
    // Most-recent-first, and never another student's result
    expect(out.recent.map((r) => r.examId)).toEqual(['ex-m4', 'ex-m3', 'ex-m2', 'ex-m1', 'ex-chim-old']);
  });
});

// ─── recommend_exams ─────────────────────────────────────────────────────────

describe('recommend_exams', () => {
  it('fetches the catalog from the deployment origin', async () => {
    setup(seedExamResults());
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });
    await exec('recommend_exams', { level: 'baccalaureat' });
    expect(fetchMock).toHaveBeenCalledWith(`${ORIGIN}/exam_catalog_index.json`);
  });

  it('filters by level + fuzzy subject, excludes completed exams, sorts by difficulty asc, defaults to 3', async () => {
    setup(seedExamResults()); // ex-chim-3 already completed
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });
    const out = (await exec('recommend_exams', { level: 'baccalaureat', subject: 'chimie' })) as Array<{
      examId: string; title: string; url: string;
    }>;

    // ex-chim-3 (difficulty 1) excluded as already completed; remaining sorted asc.
    expect(out.map((e) => e.examId)).toEqual(['ex-chim-1', 'ex-chim-4', 'ex-chim-6']);
    expect(out[0]).toEqual({
      examId: 'ex-chim-1',
      title: 'Chimie Bac I',
      subject: 'Chimie',
      level: 'baccalaureat',
      year: '2019',
      url: '/exams/terminale/ex-chim-1', // 'baccalaureat' → route 'terminale'
    });
  });

  it('matches subjects accent-insensitively', async () => {
    setup({});
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });
    const out = (await exec('recommend_exams', { level: 'baccalaureat', subject: 'mathematiques' })) as Array<{ examId: string }>;
    expect(out.map((e) => e.examId)).toEqual(['ex-math-1']);
  });

  it("caps count at 5 and maps 'universite' to the 'university' route", async () => {
    setup({});
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });

    const capped = (await exec('recommend_exams', { level: 'baccalaureat', subject: 'Chimie', count: 99 })) as unknown[];
    expect(capped).toHaveLength(5);

    const uni = (await exec('recommend_exams', { level: 'universite' })) as Array<{ url: string }>;
    expect(uni[0].url).toBe('/exams/university/ex-chim-u');
  });

  it('rejects an unknown level with a French error', async () => {
    setup({});
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });
    await expect(exec('recommend_exams', { level: 'lycée' })).rejects.toThrow(/level invalide/i);
  });
});

// ─── save_study_plan ─────────────────────────────────────────────────────────

const SAVE_ARGS = { subjects: ['Chimie'], weeks: 4, dailyMinutes: 60 };

describe('save_study_plan', () => {
  it('returns existingPlan and writes NOTHING when an active plan exists without confirmReplace', async () => {
    const store = {
      ...seedExamResults(),
      [`users/${UID}/studyPlans/plan-old`]: { title: 'Ancien plan', status: 'active', created_at_ms: 111 },
    };
    const handle = setup(store);
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });

    const out = await exec('save_study_plan', SAVE_ARGS);

    expect(out).toEqual({ existingPlan: { title: 'Ancien plan', createdAt: 111 } });
    expect(handle.sets).toHaveLength(0);
    expect(handle.updates).toHaveLength(0);
    expect(generatePlanCoreMock).not.toHaveBeenCalled();
  });

  it('with confirmReplace archives the previous active plan and writes the new active plan', async () => {
    const store = {
      [`users/${UID}`]: { track: 'SMP' },
      ...seedExamResults(),
      [`users/${UID}/studyPlans/plan-old`]: { title: 'Ancien plan', status: 'active', created_at_ms: 111 },
    };
    const handle = setup(store);
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });

    const out = (await exec('save_study_plan', { ...SAVE_ARGS, confirmReplace: true })) as Record<string, unknown>;

    expect(out).toEqual({
      saved: true,
      title: 'Plan Chimie 4 semaines',
      taskCount: expect.any(Number),
      url: '/study-plan',
    });

    // Previous plan deactivated (same 'archived' status the web app uses)
    expect(handle.updates).toEqual([
      expect.objectContaining({
        path: `users/${UID}/studyPlans/plan-old`,
        data: expect.objectContaining({ status: 'archived' }),
      }),
    ]);

    // New doc mirrors createStudyPlan's field set
    expect(handle.sets).toHaveLength(1);
    const { path, data } = handle.sets[0];
    expect(path.startsWith(`users/${UID}/studyPlans/`)).toBe(true);
    expect(data).toEqual(expect.objectContaining({
      status: 'active',
      track: 'SMP',
      title: 'Plan Chimie 4 semaines',
      dailyTargetMinutes: 60,
      weeklyGoals: 4,
      created_at_ms: expect.any(Number),
      updated_at_ms: expect.any(Number),
      taskCount: (data.tasks as unknown[]).length,
    }));
    const tasks = data.tasks as Array<Record<string, unknown>>;
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0]).toEqual(expect.objectContaining({
      type: 'exam',
      examId: expect.any(String),
      subject: 'Chimie',
      nextReviewMs: expect.any(Number),
    }));
  });

  it('builds performance from the student results and passes gathered prefs to generatePlanCore', async () => {
    const store = { [`users/${UID}`]: { track: 'SMP' }, ...seedExamResults() };
    setup(store);
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });

    await exec('save_study_plan', SAVE_ARGS);

    expect(generatePlanCoreMock).toHaveBeenCalledWith(expect.objectContaining({
      track: 'SMP',
      subjects: ['Chimie'],
      weeks: 4,
      dailyMinutes: 60,
      examCount: expect.any(Number),
      performance: expect.objectContaining({
        Chimie: { avgScore: 50, attempts: 2 },
        'Mathématiques': { avgScore: 75, attempts: 4 },
      }),
    }));
  });

  it('seeds SRS for exams the student already attempted (completed exams are not scheduled as brand new)', async () => {
    const store = { ...seedExamResults() }; // ex-chim-3 done at 40 %
    const handle = setup(store);
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });

    await exec('save_study_plan', SAVE_ARGS);

    const tasks = handle.sets[0].data.tasks as Array<Record<string, unknown>>;
    const attempted = tasks.find((t) => t.examId === 'ex-chim-3');
    expect(attempted).toBeDefined();
    expect((attempted!.history as unknown[]).length).toBe(1); // seeded from prior result
    const fresh = tasks.find((t) => t.examId === 'ex-chim-1');
    expect((fresh!.history as unknown[]).length).toBe(0);
  });

  it('refuses a second save within the same request (one write per request)', async () => {
    const handle = setup(seedExamResults());
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });

    const first = (await exec('save_study_plan', SAVE_ARGS)) as { saved?: boolean };
    expect(first.saved).toBe(true);

    const second = (await exec('save_study_plan', { ...SAVE_ARGS, confirmReplace: true })) as { error?: string };
    expect(second.error).toEqual(expect.any(String));
    expect(handle.sets).toHaveLength(1); // still only the first write
  });

  it('rejects missing subjects/weeks/dailyMinutes', async () => {
    setup({});
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });
    await expect(exec('save_study_plan', { subjects: [], weeks: 4, dailyMinutes: 60 })).rejects.toThrow(/subjects/);
    await expect(exec('save_study_plan', { subjects: ['Chimie'], dailyMinutes: 60 })).rejects.toThrow(/weeks/);
  });
});

// ─── uid scoping ─────────────────────────────────────────────────────────────

describe('uid scoping', () => {
  it('never touches a Firestore path outside users/{ctx.uid} across all three tools', async () => {
    const store = {
      [`users/${UID}`]: { track: 'SVT' },
      ...seedExamResults(),
      'users/intruder/studyPlans/p': { title: 'x', status: 'active', created_at_ms: 5 },
    };
    const handle = setup(store);
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });

    await exec('get_student_progress', {});
    await exec('recommend_exams', { level: 'baccalaureat', subject: 'Chimie' });
    await exec('save_study_plan', SAVE_ARGS);

    expect(handle.paths.length).toBeGreaterThan(0);
    const offenders = handle.paths.filter(
      (p) => p !== 'users' && !p.startsWith(`users/${UID}`),
    );
    expect(offenders).toEqual([]);
    // And every write stayed under the authenticated uid too.
    for (const w of [...handle.sets, ...handle.updates]) {
      expect(w.path.startsWith(`users/${UID}/`)).toBe(true);
    }
  });

  it('throws on an unknown tool name', async () => {
    setup({});
    const exec = createToolExecutor({ uid: UID, origin: ORIGIN });
    await expect(exec('drop_database', {})).rejects.toThrow(/inconnu/i);
  });
});

// ─── buildTasksFromExams parity ──────────────────────────────────────────────

describe('buildTasksFromExamsServer parity with src/services/studyPlanService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-12T10:00:00'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('produces byte-for-byte the same tasks as the client buildTasksFromExams', () => {
    const exams = [
      { exam_id: 'ex-1', subject: 'Chimie', difficulty: 2, topics: ['Acides'], exam_title: 'Chimie 2019', level: 'baccalaureat', year: '2019' },
      { exam_id: 'ex-2', subject: 'Mathématiques', difficulty: 4, exam_title: 'Maths 2020', level: 'baccalaureat', year: '2020' },
      { exam_id: 'ex-3', subject: 'Physique', difficulty: 3, exam_title: 'Physique 2021', level: 'baccalaureat', year: '2021' },
    ];
    const coefficients = { Chimie: 4, 'Mathématiques': 5 };
    const existingResults = {
      'ex-1': { scorePct: 85, answeredAt: 1_750_000_000_000 }, // → mastered seed
      'ex-3': { scorePct: 35, answeredAt: 1_750_000_100_000 }, // → failed seed
    };

    const server = buildTasksFromExamsServer(exams, coefficients, existingResults);
    const client = buildTasksFromExams(exams, coefficients, existingResults);

    expect(server).toEqual(client);
    // Sanity: the fixture exercised both SRS seed paths.
    expect(server.find((t) => t.examId === 'ex-1')!.status).toBe('mastered');
    expect(server.find((t) => t.examId === 'ex-3')!.status).toBe('active');
    expect(server.find((t) => t.examId === 'ex-2')!.history).toEqual([]);
  });
});
