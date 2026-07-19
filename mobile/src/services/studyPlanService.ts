/**
 * Study Plan Service — mobile
 * ───────────────────────────
 * Mirrors the web app's study-plan data flow (src/services/studyPlanService.js
 * + src/pages/StudyPlan.jsx on the web):
 *
 *   • Plans persist in Firestore at users/{uid}/studyPlans/{planId}
 *     (status 'active'; the newest active plan is THE plan).
 *   • AI-assisted generation via the SAME serverless endpoint as the web:
 *       POST https://academy.edlight.org/api/generate-plan
 *       Authorization: Bearer <firebase idToken>
 *       body     { track, subjects, performance, examCount,
 *                  preferences: { dailyMinutes, weeks } }
 *       response { plan: { title, description, weeklyGoals, dailyTargetMinutes,
 *                          tips[], schedule[] }, source: 'ai' | 'fallback' }
 *     401 → sign-in required, 429 → hourly rate limit hit.
 *   • Tasks are built client-side from the exam catalog index (+ quiz bank
 *     practice sets and course videos when available), seeded with prior exam
 *     results through SM-2 spaced repetition, then annotated with the AI
 *     schedule (week/day/focusArea/rationale) where subjects match.
 *   • Like the web, a generic AI failure is NOT fatal: we fall back to the
 *     locally-built plan. Only 401/429 (and a missing exam catalog) surface
 *     as errors to the screen.
 */

import { db, auth } from './firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { fetchCatalogIndex } from '../utils/examCatalog';
import { normalizeSubject } from '../utils/examUtils';
import { loadAllExamResultSummaries } from './examResults';
import { loadAppData } from './dataService';
import { TRACK_COEFFICIENTS, TRACKS } from '../config/trackConfig';

const PLAN_URL = 'https://academy.edlight.org/api/generate-plan';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TaskHistoryEntry {
  scorePct: number;
  quality: number;
  answeredAt: number;
}

export interface PlanTask {
  type: 'exam' | 'practice' | 'video';
  /** Exam tasks are keyed by examId, practice/video tasks by taskId. */
  examId?: string;
  taskId?: string;
  subject: string;
  difficulty: number;
  coefficient: number;
  priority: number;
  status: 'active' | 'mastered';
  // SM-2 spaced-repetition state
  interval: number;
  ease: number;
  repetitions: number;
  nextReviewMs: number;
  history: TaskHistoryEntry[];
  lastPracticedMs: number | null;
  // Type-specific display fields
  examTitle?: string;
  level?: string;
  year?: string | number;
  topics?: string[];
  subjectCode?: string;
  unitId?: string;
  unitTitle?: string;
  questionCount?: number;
  courseCode?: string;
  courseTitle?: string;
  videoTitle?: string;
  videoUrl?: string;
  duration?: number;
  // AI schedule annotations
  aiRationale?: string;
  aiFocusArea?: string;
  scheduledWeek?: number;
  scheduledDay?: number;
  [key: string]: any;
}

export interface StudyPlan {
  id: string;
  track: string;
  title: string;
  description?: string;
  tips?: string[];
  dailyTargetMinutes?: number;
  weeklyGoals?: number;
  tasks: PlanTask[];
  taskCount?: number;
  masteredCount?: number;
  status?: string;
  created_at_ms?: number;
  [key: string]: any;
}

export interface AiScheduleEntry {
  week?: number;
  day?: number;
  type?: string;
  subject?: string;
  focusArea?: string;
  examDifficulty?: number;
  rationale?: string;
}

export interface AiPlan {
  title?: string;
  description?: string;
  weeklyGoals?: number;
  dailyTargetMinutes?: number;
  tips?: string[];
  schedule?: AiScheduleEntry[];
}

export type PlanSource = 'ai' | 'fallback' | 'local';

export type AiPlanResult =
  | { kind: 'ok'; plan: AiPlan; source: 'ai' | 'fallback' }
  | { kind: 'auth' }
  | { kind: 'limit'; message: string }
  | { kind: 'error' };

export type GeneratePlanResult =
  | { kind: 'ok'; plan: StudyPlan; source: PlanSource }
  | { kind: 'auth' }
  | { kind: 'limit'; message: string }
  | { kind: 'network' };

export interface SubjectMastery {
  score: number;
  total: number;
  attempts: number;
  mastered: number;
  pct: number;
  masteredPct: number;
}

// ─── Constants (mirror web studyPlanService) ────────────────────────────────

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 60;
const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const DAY_MS = 86_400_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Shallow-strip undefined values (Firestore rejects `undefined`). */
function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as T;
}

function todayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function futureDayMs(days: number): number {
  return todayMs() + days * DAY_MS;
}

function coefficientsFor(track: string): Record<string, number> {
  return (TRACK_COEFFICIENTS as Record<string, Record<string, number>>)[track] || {};
}

// ─── SM-2 Spaced Repetition (mirror web) ────────────────────────────────────

export function computeSRS(
  task: { interval?: number; ease?: number; repetitions?: number },
  quality: number,
): { interval: number; ease: number; repetitions: number; nextReviewMs: number } {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { interval = 0, ease = DEFAULT_EASE, repetitions = 0 } = task;

  if (q < 3) {
    repetitions = 0;
    interval = MIN_INTERVAL;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 3;
    else interval = Math.round(interval * ease);
    repetitions += 1;
  }

  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ease = Math.max(MIN_EASE, ease);
  interval = Math.min(interval, MAX_INTERVAL);

  return {
    interval,
    ease: Math.round(ease * 100) / 100,
    repetitions,
    nextReviewMs: futureDayMs(interval),
  };
}

export function scoreToQuality(pct: number): number {
  if (pct >= 90) return 5;
  if (pct >= 75) return 4;
  if (pct >= 60) return 3;
  if (pct >= 40) return 2;
  if (pct >= 20) return 1;
  return 0;
}

// ─── Firestore CRUD (users/{uid}/studyPlans — same path as the web) ────────

const plansRef = (uid: string) => collection(db, 'users', uid, 'studyPlans');
const planDoc = (uid: string, planId: string) => doc(db, 'users', uid, 'studyPlans', planId);

export async function createStudyPlan(uid: string, planData: Record<string, any>): Promise<string> {
  if (!uid) throw new Error('uid required');
  const ref = doc(plansRef(uid));
  const plan = cleanUndefined({
    ...planData,
    status: 'active',
    created_at: serverTimestamp(),
    created_at_ms: Date.now(),
    updated_at: serverTimestamp(),
    updated_at_ms: Date.now(),
  });
  await setDoc(ref, plan);
  return ref.id;
}

/** Load the user's active study plan (most recent with status='active'). */
export async function loadActiveStudyPlan(uid: string): Promise<StudyPlan | null> {
  if (!uid) return null;
  const q = query(
    plansRef(uid),
    where('status', '==', 'active'),
    orderBy('created_at_ms', 'desc'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as StudyPlan;
}

export async function updateStudyPlan(uid: string, planId: string, patch: Record<string, any>): Promise<void> {
  if (!uid || !planId) return;
  await updateDoc(planDoc(uid, planId), cleanUndefined({
    ...patch,
    updated_at: serverTimestamp(),
    updated_at_ms: Date.now(),
  }));
}

export async function deleteStudyPlan(uid: string, planId: string): Promise<void> {
  if (!uid || !planId) return;
  await deleteDoc(planDoc(uid, planId));
}

// ─── Task scheduling helpers (mirror web) ───────────────────────────────────

/** Tasks scheduled for today (nextReviewMs ≤ end-of-today), mastered excluded. */
export function getTodayTasks(plan: StudyPlan | null): PlanTask[] {
  if (!plan?.tasks) return [];
  const endOfDay = todayMs() + DAY_MS - 1;
  return plan.tasks
    .filter((t) => t.status !== 'mastered' && (t.nextReviewMs || 0) <= endOfDay)
    .sort((a, b) => (a.nextReviewMs || 0) - (b.nextReviewMs || 0));
}

/** Tasks scheduled within the next N days (excluding today). */
export function getUpcomingTasks(plan: StudyPlan | null, days = 7): PlanTask[] {
  if (!plan?.tasks) return [];
  const startMs = todayMs() + DAY_MS;
  const endMs = startMs + days * DAY_MS;
  return plan.tasks
    .filter(
      (t) =>
        t.status !== 'mastered' &&
        (t.nextReviewMs || 0) >= startMs &&
        (t.nextReviewMs || 0) < endMs,
    )
    .sort((a, b) => (a.nextReviewMs || 0) - (b.nextReviewMs || 0));
}

/** Per-subject mastery breakdown from task history (mirror web). */
export function computeSubjectMastery(plan: StudyPlan | null): Record<string, SubjectMastery> {
  if (!plan?.tasks) return {};
  const mastery: Record<string, SubjectMastery> = {};

  for (const task of plan.tasks) {
    const subj = task.subject || 'Autre';
    if (!mastery[subj]) {
      mastery[subj] = { score: 0, total: 0, attempts: 0, mastered: 0, pct: 0, masteredPct: 0 };
    }
    const m = mastery[subj];
    m.total += 1;
    if (task.status === 'mastered') m.mastered += 1;

    const history = task.history || [];
    if (history.length > 0) {
      const recent = history.slice(-3);
      const best = Math.max(...recent.map((h) => h.scorePct || 0));
      m.score += best;
      m.attempts += history.length;
    }
  }

  for (const subj of Object.keys(mastery)) {
    const m = mastery[subj];
    m.pct = m.total > 0 ? Math.round(m.score / m.total) : 0;
    m.masteredPct = m.total > 0 ? Math.round((m.mastered / m.total) * 100) : 0;
  }
  return mastery;
}

// ─── Task building (mirror web studyPlanService + useStudyPlan) ─────────────

type ExistingResults = Record<string, { scorePct: number; answeredAt: number }>;

export function buildTasksFromExams(
  exams: any[],
  coefficients: Record<string, number> = {},
  existingResults: ExistingResults = {},
): PlanTask[] {
  const now = Date.now();

  return exams.map((exam) => {
    const examId = String(exam.exam_id || exam.id || '');
    const subject = normalizeSubject(exam.subject || '');
    const difficulty = exam.difficulty || 3;
    const coeff = coefficients[subject] || 1;
    const prior = existingResults[examId];

    const attemptBonus = prior ? -0.2 : 0.3;
    const priority = (coeff / 5) * 0.4 + (difficulty / 5) * 0.3 + attemptBonus + 0.3;

    let srsState = { interval: 0, ease: DEFAULT_EASE, repetitions: 0, nextReviewMs: now };
    let status: 'active' | 'mastered' = 'active';
    let history: TaskHistoryEntry[] = [];

    if (prior) {
      const quality = scoreToQuality(prior.scorePct ?? 0);
      srsState = computeSRS({ interval: 0, ease: DEFAULT_EASE, repetitions: 0 }, quality);
      history = [{ scorePct: prior.scorePct, quality, answeredAt: prior.answeredAt || now }];
      if (quality >= 4 && (prior.scorePct ?? 0) >= 80) status = 'mastered';
    }

    return {
      type: 'exam' as const,
      examId,
      subject,
      difficulty,
      coefficient: coeff,
      priority: Math.round(priority * 100) / 100,
      topics: exam.topics || [],
      examTitle: exam.exam_title || '',
      level: exam.level || '',
      year: exam.year || '',
      status,
      ...srsState,
      history,
      lastPracticedMs: prior ? (prior.answeredAt || now) : null,
    };
  });
}

const SUBJECT_TO_CODE_PREFIX: Record<string, string> = {
  chimie: 'CHEM', physique: 'PHYS', mathématiques: 'MATH', mathematiques: 'MATH',
  économie: 'ECON', economie: 'ECON', 'sciences physiques': 'PHYS',
  svt: 'CHEM', biologie: 'CHEM',
};

/** Practice tasks from the quiz-bank index ({ bySubject, byUnit }). */
export function buildPracticeTasksFromQuizBank(
  quizBankIndex: any,
  coefficients: Record<string, number> = {},
  trackSubjects: string[] = [],
  maxPerSubject = 3,
): PlanTask[] {
  if (!quizBankIndex?.bySubject) return [];

  const now = Date.now();
  const tasks: PlanTask[] = [];
  const bankKeys = Object.keys(quizBankIndex.bySubject);

  for (const subject of trackSubjects) {
    const normSubj = subject.toLowerCase().trim();
    const prefix = SUBJECT_TO_CODE_PREFIX[normSubj] || subject.toUpperCase().slice(0, 4);

    const matchingCodes = bankKeys.filter((k) => k.startsWith(prefix));
    if (matchingCodes.length === 0) continue;

    const coeff = coefficients[subject] || 1;
    let practiceCount = 0;

    for (const code of matchingCodes) {
      if (practiceCount >= maxPerSubject) break;
      const rows = quizBankIndex.bySubject[code] || [];
      if (rows.length === 0) continue;

      const unitKeys = Object.keys(quizBankIndex.byUnit || {}).filter((k) =>
        k.startsWith(code + '|'),
      );

      if (unitKeys.length > 0) {
        for (const unitKey of unitKeys) {
          if (practiceCount >= maxPerSubject) break;
          const unitRows = quizBankIndex.byUnit[unitKey] || [];
          if (unitRows.length < 2) continue;

          const unitId = unitKey.split('|')[1] || '';
          const sampleRow = unitRows[0] || {};
          const chapterTitle =
            sampleRow.Chapter_Title || sampleRow.chapter_title || sampleRow.video_title || '';

          tasks.push({
            type: 'practice',
            taskId: `practice-${code}-${unitId}`,
            subject,
            subjectCode: code,
            unitId,
            unitTitle: chapterTitle,
            questionCount: unitRows.length,
            difficulty: 3,
            coefficient: coeff,
            priority: Math.round(((coeff / 5) * 0.3 + 0.4) * 100) / 100,
            status: 'active',
            interval: 0,
            ease: DEFAULT_EASE,
            repetitions: 0,
            nextReviewMs: now + DAY_MS * practiceCount,
            history: [],
            lastPracticedMs: null,
          });
          practiceCount++;
        }
      } else {
        tasks.push({
          type: 'practice',
          taskId: `practice-${code}`,
          subject,
          subjectCode: code,
          unitId: '',
          unitTitle: '',
          questionCount: rows.length,
          difficulty: 3,
          coefficient: coeff,
          priority: Math.round(((coeff / 5) * 0.3 + 0.4) * 100) / 100,
          status: 'active',
          interval: 0,
          ease: DEFAULT_EASE,
          repetitions: 0,
          nextReviewMs: now,
          history: [],
          lastPracticedMs: null,
        });
        practiceCount++;
      }
    }
  }

  return tasks;
}

/** Video-watching tasks from courses relevant to the user's track. */
export function buildVideoTasks(
  courses: any[] = [],
  trackSubjects: string[] = [],
  maxPerSubject = 3,
): PlanTask[] {
  const now = Date.now();
  const tasks: PlanTask[] = [];

  for (const subject of trackSubjects) {
    const normSubj = subject.toLowerCase().trim();
    const prefix = SUBJECT_TO_CODE_PREFIX[normSubj] || subject.toUpperCase().slice(0, 4);

    const matchingCourses = courses.filter(
      (c) =>
        String(c.subject || '').toUpperCase().startsWith(prefix) ||
        String(c.code || '').toUpperCase().startsWith(prefix),
    );

    let videoCount = 0;
    for (const course of matchingCourses) {
      if (videoCount >= maxPerSubject) break;
      const modules = course.modules || [];
      for (const mod of modules) {
        if (videoCount >= maxPerSubject) break;
        const videoLessons = (mod.lessons || []).filter(
          (l: any) => l.type === 'video' && l.videoUrl,
        );
        for (const lesson of videoLessons) {
          if (videoCount >= maxPerSubject) break;
          tasks.push({
            type: 'video',
            taskId: `video-${lesson.id || course.id + '-' + mod.id}`,
            subject,
            courseCode: course.code || course.id,
            courseTitle: course.name || '',
            videoTitle: lesson.title || '',
            videoUrl: lesson.videoUrl || '',
            duration: lesson.duration || 15,
            difficulty: 1,
            coefficient: 1,
            priority: 0.2,
            status: 'active',
            interval: 0,
            ease: DEFAULT_EASE,
            repetitions: 0,
            nextReviewMs: now,
            history: [],
            lastPracticedMs: null,
          });
          videoCount++;
        }
      }
    }
  }

  return tasks;
}

/** Sort tasks: overdue first, then by priority, mastered last (mirror web). */
export function sortTasksByPriority(tasks: PlanTask[]): PlanTask[] {
  const now = Date.now();
  return [...tasks].sort((a, b) => {
    if (a.status === 'mastered' && b.status !== 'mastered') return 1;
    if (b.status === 'mastered' && a.status !== 'mastered') return -1;

    const aOverdue = (a.nextReviewMs || 0) <= now ? 1 : 0;
    const bOverdue = (b.nextReviewMs || 0) <= now ? 1 : 0;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;

    if (a.priority !== b.priority) return (b.priority || 0) - (a.priority || 0);
    return (a.nextReviewMs || 0) - (b.nextReviewMs || 0);
  });
}

/** Balanced exam subset for the plan, weighted by coefficient (mirror web). */
export function selectExamsForPlan(
  exams: any[],
  coefficients: Record<string, number>,
  maxCount = 40,
): any[] {
  const bySubject: Record<string, any[]> = {};
  for (const e of exams) {
    const s = normalizeSubject(e.subject);
    if (!bySubject[s]) bySubject[s] = [];
    bySubject[s].push(e);
  }

  const totalCoeff = Object.values(coefficients).reduce((s, v) => s + v, 0) || 1;
  const selected: any[] = [];

  for (const [subj, pool] of Object.entries(bySubject)) {
    const coeff = coefficients[subj] || 1;
    const slots = Math.max(1, Math.round((coeff / totalCoeff) * maxCount));
    const sorted = [...pool].sort((a, b) => (a.difficulty || 3) - (b.difficulty || 3));
    selected.push(...sorted.slice(0, slots));
  }

  if (selected.length > maxCount) {
    selected.sort(
      (a, b) =>
        (coefficients[normalizeSubject(b.subject)] || 1) -
        (coefficients[normalizeSubject(a.subject)] || 1),
    );
    return selected.slice(0, maxCount);
  }
  return selected;
}

/** Per-subject performance summary for the AI prompt (mirror web). */
export function buildPerformanceSummary(
  results: ExistingResults,
  exams: any[],
): Record<string, { avgScore: number; attempts: number }> {
  if (!results || !exams) return {};

  const bySubject: Record<string, { scores: number[]; attempts: number }> = {};
  for (const [examId, result] of Object.entries(results)) {
    const exam = exams.find((e) => String(e.exam_id || e.id) === examId);
    if (!exam) continue;
    const subj = normalizeSubject(exam.subject);
    if (!bySubject[subj]) bySubject[subj] = { scores: [], attempts: 0 };
    bySubject[subj].scores.push(result.scorePct || 0);
    bySubject[subj].attempts += 1;
  }

  const summary: Record<string, { avgScore: number; attempts: number }> = {};
  for (const [subj, data] of Object.entries(bySubject)) {
    const avg = data.scores.reduce((s, v) => s + v, 0) / data.scores.length;
    summary[subj] = { avgScore: Math.round(avg), attempts: data.attempts };
  }
  return summary;
}

/** Annotate locally-built tasks with the AI schedule (mirror web useStudyPlan). */
function annotateWithAiSchedule(tasks: PlanTask[], aiPlan: AiPlan | null): void {
  if (!aiPlan?.schedule?.length) return;

  const scheduleMap = new Map<string, AiScheduleEntry[]>();
  for (const entry of aiPlan.schedule) {
    const key = `${entry.subject}|${entry.examDifficulty || 3}`;
    if (!scheduleMap.has(key)) scheduleMap.set(key, []);
    scheduleMap.get(key)!.push(entry);
  }

  for (const task of tasks) {
    const key = `${task.subject}|${task.difficulty}`;
    const matches = scheduleMap.get(key);
    if (matches?.length) {
      const entry = matches.shift()!;
      task.aiRationale = entry.rationale || '';
      task.aiFocusArea = entry.focusArea || '';
      if (typeof entry.week === 'number') task.scheduledWeek = entry.week;
      if (typeof entry.day === 'number') task.scheduledDay = entry.day;
    }
  }
}

// ─── API: POST /api/generate-plan ───────────────────────────────────────────

export async function requestAiPlan(body: {
  track: string;
  subjects: string[];
  performance: Record<string, { avgScore: number; attempts: number }>;
  examCount: number;
  preferences: { dailyMinutes: number; weeks: number };
}): Promise<AiPlanResult> {
  const user = auth.currentUser;
  if (!user) return { kind: 'auth' };

  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    return { kind: 'auth' };
  }

  try {
    const res = await fetch(PLAN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401) return { kind: 'auth' };
    if (res.status === 429) {
      let msg = '';
      try {
        const data = await res.json();
        if (typeof data?.message === 'string') msg = data.message;
      } catch {}
      return { kind: 'limit', message: msg };
    }
    if (!res.ok) return { kind: 'error' };

    const data = await res.json();
    if (!data?.plan || typeof data.plan !== 'object') return { kind: 'error' };
    return { kind: 'ok', plan: data.plan as AiPlan, source: data.source === 'ai' ? 'ai' : 'fallback' };
  } catch {
    return { kind: 'error' };
  }
}

// ─── High-level generation (what the screen calls) ──────────────────────────

/**
 * Generate a study plan end-to-end and persist it to Firestore:
 * exam catalog → prior results → AI schedule → local task building → save.
 *
 * Returns 'auth' on 401 (sign in), 'limit' on 429 (hourly cap), 'network'
 * when the exam catalog cannot be loaded. A plain AI failure falls back to a
 * locally-built plan, exactly like the web.
 */
export async function generateStudyPlan(opts: {
  uid: string;
  track: string;
  weeks: number;
  dailyMinutes: number;
}): Promise<GeneratePlanResult> {
  const { uid, track, weeks, dailyMinutes } = opts;
  if (!uid || !auth.currentUser) return { kind: 'auth' };

  const coefficients = coefficientsFor(track);

  // 1 — exam catalog (slim index, cached in AsyncStorage)
  const allExams = await fetchCatalogIndex();
  const trackExams = allExams.filter(
    (e) => coefficients[normalizeSubject(e.subject)] !== undefined,
  );
  if (trackExams.length === 0) return { kind: 'network' };

  // 2 — prior exam results seed the SRS state + AI performance summary
  const existingResults: ExistingResults = {};
  try {
    const summaries = await loadAllExamResultSummaries(uid);
    for (const [examId, s] of Object.entries(summaries as Record<string, any>)) {
      if (s?.percentage === null || s?.percentage === undefined) continue;
      existingResults[examId] = {
        scorePct: Number(s.percentage) || 0,
        answeredAt: s.submittedAtMs || Date.now(),
      };
    }
  } catch {
    // Prior results are a nice-to-have; a fresh plan works without them.
  }

  // 3 — AI-assisted schedule (same endpoint + payload as the web)
  const ai = await requestAiPlan({
    track,
    subjects: Object.keys(coefficients),
    performance: buildPerformanceSummary(existingResults, trackExams),
    examCount: Math.min(trackExams.length, 40),
    preferences: { dailyMinutes, weeks },
  });
  if (ai.kind === 'auth') return { kind: 'auth' };
  if (ai.kind === 'limit') return ai;
  const aiPlan = ai.kind === 'ok' ? ai.plan : null;
  const source: PlanSource = ai.kind === 'ok' ? ai.source : 'local';

  // 4 — quiz bank + courses enrich the plan when available (optional)
  let quizBankIndex: any = null;
  let courses: any[] = [];
  try {
    const appData = await loadAppData();
    quizBankIndex = appData?.quizBank || null;
    courses = appData?.courses || [];
  } catch {
    // Exam-only plan is still a valid plan.
  }

  // 5 — build + persist (mirror web useStudyPlan generate mutation)
  const selected = selectExamsForPlan(trackExams, coefficients, 40);
  let tasks = buildTasksFromExams(selected, coefficients, existingResults);

  const trackSubjects = Object.keys(coefficients);
  if (quizBankIndex?.bySubject) {
    tasks = tasks.concat(
      buildPracticeTasksFromQuizBank(quizBankIndex, coefficients, trackSubjects, 3),
    );
  }
  if (courses.length) {
    tasks = tasks.concat(buildVideoTasks(courses, trackSubjects, 2));
  }

  annotateWithAiSchedule(tasks, aiPlan);
  tasks = sortTasksByPriority(tasks).map((t) => cleanUndefined(t));

  // Use the full filière label so the title never reads as a bare code like
  // "SVT" (which doubles as a subject name and confuses students).
  const trackLabel = TRACKS.find((tk) => tk.code === track)?.label ?? track;
  const planData = {
    track,
    title: aiPlan?.title || `Plan d'étude — Filière ${trackLabel}`,
    description: aiPlan?.description || '',
    tips: aiPlan?.tips || [],
    dailyTargetMinutes: aiPlan?.dailyTargetMinutes || dailyMinutes,
    weeklyGoals: aiPlan?.weeklyGoals || weeks,
    tasks,
    taskCount: tasks.length,
    masteredCount: tasks.filter((t) => t.status === 'mastered').length,
  };

  try {
    const planId = await createStudyPlan(uid, planData);
    return {
      kind: 'ok',
      plan: { id: planId, ...planData, status: 'active', created_at_ms: Date.now() },
      source,
    };
  } catch {
    return { kind: 'network' };
  }
}
