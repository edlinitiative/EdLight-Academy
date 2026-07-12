/**
 * api/_lib/sandraTools.ts — Sandra's server-side tools.
 * ---------------------------------------------------------------------------
 * Declares the three function-calling tool schemas the chat endpoint hands to
 * `chatWithTools()` and builds their executors:
 *
 *   • get_student_progress — aggregate the student's exam results.
 *   • recommend_exams      — pick catalog exams by level/subject, excluding
 *                            ones already completed.
 *   • save_study_plan      — generate + persist a real study plan doc under
 *                            users/{uid}/studyPlans (with an overwrite guard).
 *
 * Every executor is scoped to the AUTHENTICATED uid passed by the endpoint —
 * the model never chooses whose data is touched. Plan docs mirror the shape
 * written by src/services/studyPlanService.ts (`createStudyPlan` +
 * `buildTasksFromExams`), proven by a parity test in
 * src/utils/__tests__/sandraTools.test.ts.
 *
 * The exam catalog is fetched over HTTP from the deployment's own origin
 * because public/ is not bundled into serverless functions.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './firebaseAdmin';
import type { ToolDef } from './llm';
import { generatePlanCore } from './planGeneration';

// ─── Tool schemas ────────────────────────────────────────────────────────────

export const SANDRA_TOOL_DEFS: ToolDef[] = [
  {
    name: 'get_student_progress',
    description:
      "Consulte la progression réelle de l'élève : moyenne par matière, nombre de tentatives et les 5 derniers examens complétés. À utiliser avant de conseiller des priorités de révision ou de construire un plan d'étude.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'recommend_exams',
    description:
      "Recommande des examens blancs du catalogue EdLight adaptés au niveau (et à la matière) de l'élève, en excluant ceux qu'il a déjà complétés. Retourne des liens à présenter en markdown.",
    parameters: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          enum: ['baccalaureat', '9eme_af', 'universite'],
          description: "Niveau scolaire de l'élève ('baccalaureat' = terminale).",
        },
        subject: {
          type: 'string',
          description: "Matière souhaitée, ex. 'Chimie' ou 'Mathématiques' (optionnel).",
        },
        count: {
          type: 'number',
          description: "Nombre d'examens à recommander (défaut 3, maximum 5).",
        },
      },
      required: ['level'],
    },
  },
  {
    name: 'save_study_plan',
    description:
      "Génère et enregistre le plan d'étude personnalisé de l'élève à partir de ses résultats réels. À n'appeler qu'après avoir recueilli en conversation les matières, le nombre de semaines et les minutes disponibles par jour. Si un plan actif existe déjà, l'outil renvoie existingPlan sans rien écrire : demande confirmation à l'élève avant de rappeler avec confirmReplace: true.",
    parameters: {
      type: 'object',
      properties: {
        subjects: {
          type: 'array',
          items: { type: 'string' },
          description: "Matières à réviser, ex. ['Chimie', 'Physique'].",
        },
        weeks: { type: 'number', description: 'Durée du plan en semaines.' },
        dailyMinutes: { type: 'number', description: "Minutes d'étude disponibles par jour." },
        confirmReplace: {
          type: 'boolean',
          description:
            "true UNIQUEMENT si l'élève a explicitement confirmé le remplacement de son plan actif existant.",
        },
      },
      required: ['subjects', 'weeks', 'dailyMinutes'],
    },
  },
];

// ─── Shared helpers ──────────────────────────────────────────────────────────

interface ToolCtx {
  uid: string;
  origin: string; // e.g. https://edlightacademy.com — catalog is fetched from here
}

export interface CatalogExam {
  exam_id: string;
  exam_title: string;
  level: string;
  subject: string;
  year?: string;
  difficulty?: number;
  topics?: string[];
}

/** Route mapping mirrored from src/pages/StudyPlan.tsx (URL_LEVEL_MAP). */
const URL_LEVEL_MAP: Record<string, string> = {
  baccalaureat: 'terminale',
  '9eme_af': '9e',
  universite: 'university',
};

function levelToRoute(level: string): string {
  return URL_LEVEL_MAP[level] || 'terminale';
}

/** Accept the aliases the model is likely to use for catalog levels. */
const LEVEL_ALIASES: Record<string, string> = {
  baccalaureat: 'baccalaureat',
  bac: 'baccalaureat',
  terminale: 'baccalaureat',
  '9e': '9eme_af',
  '9eme': '9eme_af',
  '9eme_af': '9eme_af',
  universite: 'universite',
  university: 'universite',
};

/** Lowercase + strip accents, for fuzzy subject matching. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function subjectMatches(catalogSubject: string | undefined, wanted: string): boolean {
  const a = norm(catalogSubject || '');
  const b = norm(wanted);
  return !!a && !!b && (a.includes(b) || b.includes(a));
}

async function fetchCatalog(origin: string): Promise<CatalogExam[]> {
  const res = await fetch(`${origin}/exam_catalog_index.json`);
  if (!res.ok) throw new Error(`Catalogue d'examens indisponible (HTTP ${res.status}).`);
  return (await res.json()) as CatalogExam[];
}

interface ExamResultRow {
  examId: string;
  subject: string;
  pct: number | null;
  when: number | null;
}

/** Read users/{uid}/examResults into lightweight rows (admin SDK). */
async function loadExamResults(uid: string): Promise<ExamResultRow[]> {
  const snap = await getDb().collection('users').doc(uid).collection('examResults').get();
  return snap.docs.map((d) => {
    const data = (d.data() || {}) as Record<string, any>;
    const pct = data.summary?.percentage ?? data.percentage ?? null;
    return {
      examId: d.id,
      subject: (data.subject as string) || 'Autre',
      pct: typeof pct === 'number' ? pct : null,
      when: (data.submitted_at_ms as number) ?? (data.created_at_ms as number) ?? null,
    };
  });
}

function cleanUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as T;
}

// ─── Server mirror of studyPlanService's task builder ────────────────────────
// Kept byte-for-byte compatible with src/services/studyPlanService.ts
// (computeSRS / scoreToQuality / buildTasksFromExams / sortTasksByPriority).
// A parity fixture test guards against drift.

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 60;
const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const DAY_MS = 86_400_000;

function todayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function futureDayMs(days: number): number {
  return todayMs() + days * DAY_MS;
}

interface SRSState {
  interval: number;
  ease: number;
  repetitions: number;
  nextReviewMs: number;
}

function computeSRSServer(
  task: { interval?: number; ease?: number; repetitions?: number },
  quality: number,
): SRSState {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { interval = 0, ease = DEFAULT_EASE, repetitions = 0 } = task;

  if (q < 3) {
    repetitions = 0;
    interval = MIN_INTERVAL;
  } else {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 3;
    } else {
      interval = Math.round(interval * ease);
    }
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

function scoreToQualityServer(pct: number): number {
  if (pct >= 90) return 5;
  if (pct >= 75) return 4;
  if (pct >= 60) return 3;
  if (pct >= 40) return 2;
  if (pct >= 20) return 1;
  return 0;
}

export interface PlanTask extends SRSState {
  type: 'exam';
  examId: string;
  subject: string;
  difficulty: number;
  coefficient: number;
  priority: number;
  topics: string[];
  examTitle: string;
  level: string;
  year: string;
  status: string;
  history: Array<{ scorePct?: number; quality: number; answeredAt: number }>;
  lastPracticedMs: number | null;
}

export interface PriorResult {
  scorePct?: number;
  answeredAt?: number;
}

/** Server mirror of studyPlanService.buildTasksFromExams. */
export function buildTasksFromExamsServer(
  exams: Array<Record<string, any>>,
  coefficients: Record<string, number> = {},
  existingResults: Record<string, PriorResult> = {},
): PlanTask[] {
  const now = Date.now();

  return exams.map((exam) => {
    const examId: string = exam.exam_id || exam.id || '';
    const subject: string = exam.subject || '';
    const difficulty: number = exam.difficulty || 3;
    const coeff = coefficients[subject] || 1;
    const prior = existingResults[examId];

    const attemptBonus = prior ? -0.2 : 0.3;
    const priority = (coeff / 5) * 0.4 + (difficulty / 5) * 0.3 + attemptBonus + 0.3;

    let srsState: SRSState = {
      interval: 0,
      ease: DEFAULT_EASE,
      repetitions: 0,
      nextReviewMs: now,
    };
    let status = 'active';
    let history: PlanTask['history'] = [];

    if (prior) {
      const quality = scoreToQualityServer(prior.scorePct ?? 0);
      srsState = computeSRSServer({ interval: 0, ease: DEFAULT_EASE, repetitions: 0 }, quality);
      history = [{ scorePct: prior.scorePct, quality, answeredAt: prior.answeredAt || now }];
      if (quality >= 4 && (prior.scorePct ?? 0) >= 80) {
        status = 'mastered';
      }
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
      lastPracticedMs: prior ? prior.answeredAt || now : null,
    };
  });
}

/** Server mirror of studyPlanService.sortTasksByPriority. */
function sortTasksByPriorityServer(tasks: PlanTask[]): PlanTask[] {
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

// ─── get_student_progress ────────────────────────────────────────────────────

async function getStudentProgress(uid: string): Promise<unknown> {
  const rows = await loadExamResults(uid);
  if (rows.length === 0) {
    return { perSubject: [], totalAttempts: 0, recent: [], note: 'aucun examen complété' };
  }

  const bySubject = new Map<string, { attempts: number; sum: number; graded: number }>();
  for (const r of rows) {
    const s = bySubject.get(r.subject) || { attempts: 0, sum: 0, graded: 0 };
    s.attempts += 1;
    if (r.pct != null) {
      s.sum += r.pct;
      s.graded += 1;
    }
    bySubject.set(r.subject, s);
  }

  const perSubject = [...bySubject.entries()]
    .map(([subject, s]) => ({
      subject,
      attempts: s.attempts,
      avgPct: s.graded > 0 ? Math.round(s.sum / s.graded) : null,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const recent = [...rows]
    .sort((a, b) => (b.when || 0) - (a.when || 0))
    .slice(0, 5)
    .map(({ examId, subject, pct, when }) => ({ examId, subject, pct, when }));

  return { perSubject, totalAttempts: rows.length, recent };
}

// ─── recommend_exams ─────────────────────────────────────────────────────────

const RECOMMEND_DEFAULT = 3;
const RECOMMEND_MAX = 5;

async function recommendExams(ctx: ToolCtx, args: Record<string, unknown>): Promise<unknown> {
  const level = LEVEL_ALIASES[norm(String(args.level ?? ''))];
  if (!level) {
    throw new Error(
      "Paramètre level invalide — valeurs acceptées : 'baccalaureat', '9eme_af', 'universite'.",
    );
  }
  const subject = typeof args.subject === 'string' ? args.subject : '';
  const rawCount = Number(args.count);
  const count = Math.min(
    Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : RECOMMEND_DEFAULT,
    RECOMMEND_MAX,
  );

  const [catalog, results] = await Promise.all([
    fetchCatalog(ctx.origin),
    loadExamResults(ctx.uid),
  ]);
  const completed = new Set(results.map((r) => r.examId));

  return catalog
    .filter(
      (e) =>
        e.level === level &&
        !completed.has(e.exam_id) &&
        (!subject || subjectMatches(e.subject, subject)),
    )
    .sort((a, b) => (a.difficulty ?? 3) - (b.difficulty ?? 3))
    .slice(0, count)
    .map((e) => ({
      examId: e.exam_id,
      title: e.exam_title,
      subject: e.subject,
      level: e.level,
      year: e.year ?? '',
      url: `/exams/${levelToRoute(e.level)}/${e.exam_id}`,
    }));
}

// ─── save_study_plan ─────────────────────────────────────────────────────────

/** Cap of catalog exams scheduled per requested subject. */
const EXAMS_PER_SUBJECT = 6;

async function saveStudyPlan(ctx: ToolCtx, args: Record<string, unknown>): Promise<
  | { saved: false; existingPlan: { title: string; createdAt: number | null }; instruction: string }
  | { saved: true; title: string; taskCount: number; url: string }
> {
  const subjects = Array.isArray(args.subjects)
    ? (args.subjects as unknown[]).map((s) => String(s)).filter(Boolean)
    : [];
  const weeks = Number(args.weeks);
  const dailyMinutes = Number(args.dailyMinutes);
  if (subjects.length === 0) {
    throw new Error('Paramètre subjects manquant — au moins une matière est requise.');
  }
  if (!(weeks > 0) || !(dailyMinutes > 0)) {
    throw new Error('Paramètres weeks et dailyMinutes requis (nombres positifs).');
  }
  const confirmReplace = args.confirmReplace === true;

  const db = getDb();
  const userRef = db.collection('users').doc(ctx.uid);
  const plansCol = userRef.collection('studyPlans');

  // Overwrite guard — same "most recent active plan" semantics as
  // studyPlanService.loadActiveStudyPlan.
  const activeSnap = await plansCol
    .where('status', '==', 'active')
    .orderBy('created_at_ms', 'desc')
    .limit(1)
    .get();
  const active = activeSnap.empty ? null : activeSnap.docs[0];
  if (active && !confirmReplace) {
    const data = (active.data() || {}) as Record<string, any>;
    // The model sometimes retries WITHOUT confirmReplace after the student
    // confirms, then reports success on this guard response. Ship explicit
    // saved:false + an in-band instruction — tool results ground the model
    // far more reliably than system-prompt rules alone.
    return {
      saved: false,
      existingPlan: {
        title: (data.title as string) || "Plan d'étude",
        createdAt: (data.created_at_ms as number) ?? null,
      },
      instruction:
        "AUCUN plan n'a été enregistré. Ne dis PAS que le plan a été créé. Si l'élève vient de confirmer le remplacement, rappelle save_study_plan avec les mêmes paramètres PLUS confirmReplace: true. Sinon, demande d'abord sa confirmation.",
    };
  }

  const [userSnap, rows, catalog] = await Promise.all([
    userRef.get(),
    loadExamResults(ctx.uid),
    fetchCatalog(ctx.origin),
  ]);
  const userData = (userSnap.exists ? userSnap.data() : null) as Record<string, any> | null;
  const track = String(userData?.track || 'SVT');

  // Real progress → PlanRequest performance + SRS seeds.
  const perf = new Map<string, { sum: number; graded: number; attempts: number }>();
  const existingResults: Record<string, PriorResult> = {};
  for (const r of rows) {
    const s = perf.get(r.subject) || { sum: 0, graded: 0, attempts: 0 };
    s.attempts += 1;
    if (r.pct != null) {
      s.sum += r.pct;
      s.graded += 1;
      existingResults[r.examId] = { scorePct: r.pct, answeredAt: r.when ?? Date.now() };
    }
    perf.set(r.subject, s);
  }
  const performance: Record<string, { avgScore?: number; attempts?: number }> = {};
  for (const [subject, s] of perf) {
    performance[subject] =
      s.graded > 0
        ? { avgScore: Math.round(s.sum / s.graded), attempts: s.attempts }
        : { attempts: s.attempts };
  }

  // Select catalog exams per requested subject, easiest first.
  const seen = new Set<string>();
  const selected: CatalogExam[] = [];
  for (const subj of subjects) {
    const matches = catalog
      .filter((e) => subjectMatches(e.subject, subj))
      .sort((a, b) => (a.difficulty ?? 3) - (b.difficulty ?? 3))
      .slice(0, EXAMS_PER_SUBJECT);
    for (const e of matches) {
      if (!seen.has(e.exam_id)) {
        seen.add(e.exam_id);
        selected.push(e);
      }
    }
  }

  const { plan } = await generatePlanCore({
    track,
    subjects,
    performance,
    examCount: selected.length,
    dailyMinutes,
    weeks,
  });

  const tasks = sortTasksByPriorityServer(
    buildTasksFromExamsServer(selected as Array<Record<string, any>>, {}, existingResults),
  );

  const now = Date.now();

  // Deactivate the replaced plan (same status the web app's archive action uses)
  // so exactly one plan stays active.
  if (active) {
    await active.ref.update({
      status: 'archived',
      updated_at: FieldValue.serverTimestamp(),
      updated_at_ms: now,
    });
  }

  const title = plan?.title || `Plan d'étude, ${track}`;
  const ref = plansCol.doc();
  await ref.set(
    cleanUndefined({
      track,
      title,
      description: plan?.description || '',
      tips: plan?.tips || [],
      dailyTargetMinutes: plan?.dailyTargetMinutes || dailyMinutes,
      weeklyGoals: plan?.weeklyGoals || weeks,
      tasks,
      taskCount: tasks.length,
      masteredCount: tasks.filter((t) => t.status === 'mastered').length,
      createdBy: 'sandra',
      status: 'active',
      created_at: FieldValue.serverTimestamp(),
      created_at_ms: now,
      updated_at: FieldValue.serverTimestamp(),
      updated_at_ms: now,
    }),
  );

  return { saved: true, title, taskCount: tasks.length, url: '/study-plan' };
}

// ─── Executor factory ────────────────────────────────────────────────────────

/**
 * Build the per-request tool executor. `ctx.uid` comes from the endpoint's
 * verified auth token — never from the model — and every Firestore path is
 * derived from it. At most one plan write is allowed per request; errors are
 * thrown and converted to `{ error }` tool results by the chatWithTools loop.
 */
export function createToolExecutor(ctx: {
  uid: string;
  origin: string;
}): (name: string, args: Record<string, unknown>) => Promise<unknown> {
  let planSaved = false;

  return async (name, args = {}) => {
    switch (name) {
      case 'get_student_progress':
        return getStudentProgress(ctx.uid);
      case 'recommend_exams':
        return recommendExams(ctx, args);
      case 'save_study_plan': {
        if (planSaved) {
          return { error: 'Un plan a déjà été enregistré pendant cette requête.' };
        }
        const out = await saveStudyPlan(ctx, args);
        if ('saved' in out && out.saved) planSaved = true;
        return out;
      }
      default:
        throw new Error(`Outil inconnu : ${name}`);
    }
  };
}
