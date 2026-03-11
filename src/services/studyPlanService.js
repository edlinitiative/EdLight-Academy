/**
 * Study Plan Service
 * ──────────────────
 * CRUD for personalised study plans stored in Firestore:
 *   users/{uid}/studyPlans/{planId}
 *
 * Each plan contains a list of *tasks* (exam-based practice items) with
 * spaced-repetition scheduling driven by SM-2–inspired intervals.
 *
 * Public API:
 *   • createStudyPlan(uid, planData)       → planId
 *   • loadStudyPlan(uid, planId)           → plan
 *   • loadActiveStudyPlan(uid)             → plan | null
 *   • updateStudyPlan(uid, planId, patch)  → void
 *   • deleteStudyPlan(uid, planId)         → void
 *   • recordTaskResult(uid, planId, taskId, result)  → void  (SRS reschedule)
 *   • computeSubjectMastery(uid)           → { subject → { score, total, pct, coeff } }
 *   • getTodayTasks(plan)                  → task[]
 *   • getUpcomingTasks(plan, days)         → task[]
 */

import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
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

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum interval in days after first correct answer */
const MIN_INTERVAL = 1;
/** Maximum interval cap (days) */
const MAX_INTERVAL = 60;
/** Default ease factor (SM-2) */
const DEFAULT_EASE = 2.5;
/** Minimum ease factor */
const MIN_EASE = 1.3;

const DAY_MS = 86_400_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function cleanUndefined(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/** Start of today in ms (midnight local). */
function todayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Start of a day N days from now. */
function futureDayMs(days) {
  return todayMs() + days * DAY_MS;
}

// ─── SM-2 Spaced Repetition ────────────────────────────────────────────────

/**
 * Compute the next review schedule for a task after a practice attempt.
 *
 * @param {Object} task  — current task state (interval, ease, repetitions, …)
 * @param {number} quality — 0-5 quality score (0=total fail, 5=perfect)
 * @returns {{ interval, ease, repetitions, nextReviewMs }}
 */
export function computeSRS(task, quality) {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { interval = 0, ease = DEFAULT_EASE, repetitions = 0 } = task;

  if (q < 3) {
    // Failed: reset repetitions, short interval
    repetitions = 0;
    interval = MIN_INTERVAL;
  } else {
    // Success
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 3;
    } else {
      interval = Math.round(interval * ease);
    }
    repetitions += 1;
  }

  // Update ease factor (SM-2 formula)
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

/**
 * Convert exam score percentage (0-100) to SM-2 quality (0-5).
 */
export function scoreToQuality(pct) {
  if (pct >= 90) return 5;
  if (pct >= 75) return 4;
  if (pct >= 60) return 3;
  if (pct >= 40) return 2;
  if (pct >= 20) return 1;
  return 0;
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

const plansRef = (uid) => collection(db, 'users', uid, 'studyPlans');
const planDoc = (uid, planId) => doc(db, 'users', uid, 'studyPlans', planId);

/**
 * Create a new study plan.
 * @param {string} uid
 * @param {Object} planData - { track, subjects, tasks[], title, ... }
 * @returns {string} planId
 */
export async function createStudyPlan(uid, planData) {
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

/**
 * Load a specific study plan.
 */
export async function loadStudyPlan(uid, planId) {
  if (!uid || !planId) return null;
  const snap = await getDoc(planDoc(uid, planId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Load the user's active study plan (most recent with status='active').
 */
export async function loadActiveStudyPlan(uid) {
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
  return { id: d.id, ...d.data() };
}

/**
 * Partial-update a study plan document.
 */
export async function updateStudyPlan(uid, planId, patch) {
  if (!uid || !planId) return;
  await updateDoc(planDoc(uid, planId), cleanUndefined({
    ...patch,
    updated_at: serverTimestamp(),
    updated_at_ms: Date.now(),
  }));
}

/**
 * Delete a study plan.
 */
export async function deleteStudyPlan(uid, planId) {
  if (!uid || !planId) return;
  await deleteDoc(planDoc(uid, planId));
}

// ─── Task scheduling helpers ────────────────────────────────────────────────

/**
 * Record a task result and reschedule via SRS.
 *
 * @param {string} uid
 * @param {string} planId
 * @param {string} taskId   — the exam_id the student practised
 * @param {Object} result   — { scorePct, answeredAt, ... }
 */
export async function recordTaskResult(uid, planId, taskId, result) {
  const plan = await loadStudyPlan(uid, planId);
  if (!plan) return;

  const tasks = plan.tasks || [];
  const idx = tasks.findIndex((t) => t.examId === taskId);
  if (idx === -1) return;

  const task = tasks[idx];
  const quality = scoreToQuality(result.scorePct ?? 0);
  const srs = computeSRS(task, quality);

  const history = task.history || [];
  history.push({
    scorePct: result.scorePct,
    quality,
    answeredAt: result.answeredAt || Date.now(),
  });

  tasks[idx] = {
    ...task,
    ...srs,
    history,
    lastPracticedMs: Date.now(),
    status: srs.repetitions >= 3 && quality >= 4 ? 'mastered' : 'active',
  };

  await updateStudyPlan(uid, planId, { tasks });
}

/**
 * Get tasks scheduled for today (nextReviewMs ≤ end-of-today).
 */
export function getTodayTasks(plan) {
  if (!plan?.tasks) return [];
  const endOfDay = todayMs() + DAY_MS - 1;
  return plan.tasks
    .filter((t) => t.status !== 'mastered' && (t.nextReviewMs || 0) <= endOfDay)
    .sort((a, b) => (a.nextReviewMs || 0) - (b.nextReviewMs || 0));
}

/**
 * Get tasks scheduled within the next N days (excluding today).
 */
export function getUpcomingTasks(plan, days = 7) {
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

// ─── Subject mastery computation ────────────────────────────────────────────

/**
 * Compute per-subject mastery from a study plan's task history.
 *
 * Returns Map<subject, { score, total, pct, attempts, mastered }>.
 */
export function computeSubjectMastery(plan) {
  if (!plan?.tasks) return {};

  const mastery = {};

  for (const task of plan.tasks) {
    const subj = task.subject || 'Autre';
    if (!mastery[subj]) {
      mastery[subj] = { score: 0, total: 0, attempts: 0, mastered: 0 };
    }

    const m = mastery[subj];
    m.total += 1;

    if (task.status === 'mastered') {
      m.mastered += 1;
    }

    const history = task.history || [];
    if (history.length > 0) {
      // Use best recent score
      const recent = history.slice(-3);
      const best = Math.max(...recent.map((h) => h.scorePct || 0));
      m.score += best;
      m.attempts += history.length;
    }
  }

  // Compute percentages
  for (const subj of Object.keys(mastery)) {
    const m = mastery[subj];
    m.pct = m.total > 0 ? Math.round(m.score / m.total) : 0;
    m.masteredPct = m.total > 0 ? Math.round((m.mastered / m.total) * 100) : 0;
  }

  return mastery;
}

// ─── Plan generation helpers ────────────────────────────────────────────────

/**
 * Build initial task list from exam catalog data.
 *
 * @param {Object[]} exams          — filtered exam objects from catalog
 * @param {Object}   coefficients   — { subject → coefficient } from trackConfig
 * @param {Object}   existingResults — { examId → { scorePct } } from prior attempts
 * @returns {Object[]} tasks ready for a study plan
 */
export function buildTasksFromExams(exams, coefficients = {}, existingResults = {}) {
  const now = Date.now();

  return exams.map((exam) => {
    const examId = exam.exam_id || exam.id || '';
    const subject = exam.subject || '';
    const difficulty = exam.difficulty || 3;
    const coeff = coefficients[subject] || 1;
    const prior = existingResults[examId];

    // Priority score: higher coefficient + higher difficulty + not yet attempted
    const attemptBonus = prior ? -0.2 : 0.3;
    const priority = (coeff / 5) * 0.4 + (difficulty / 5) * 0.3 + attemptBonus + 0.3;

    // If already attempted, seed SRS from prior score
    let srsState = {
      interval: 0,
      ease: DEFAULT_EASE,
      repetitions: 0,
      nextReviewMs: now, // due immediately
    };
    let status = 'active';
    let history = [];

    if (prior) {
      const quality = scoreToQuality(prior.scorePct ?? 0);
      srsState = computeSRS({ interval: 0, ease: DEFAULT_EASE, repetitions: 0 }, quality);
      history = [{ scorePct: prior.scorePct, quality, answeredAt: prior.answeredAt || now }];
      if (quality >= 4 && (prior.scorePct ?? 0) >= 80) {
        status = 'mastered';
      }
    }

    return {
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

/**
 * Sort tasks by SRS scheduling priority: overdue first, then by priority score.
 */
export function sortTasksByPriority(tasks) {
  const now = Date.now();
  return [...tasks].sort((a, b) => {
    // Mastered items go last
    if (a.status === 'mastered' && b.status !== 'mastered') return 1;
    if (b.status === 'mastered' && a.status !== 'mastered') return -1;

    // Overdue items first
    const aOverdue = (a.nextReviewMs || 0) <= now ? 1 : 0;
    const bOverdue = (b.nextReviewMs || 0) <= now ? 1 : 0;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;

    // Then by priority (higher first)
    if (a.priority !== b.priority) return (b.priority || 0) - (a.priority || 0);

    // Then by next review date
    return (a.nextReviewMs || 0) - (b.nextReviewMs || 0);
  });
}
