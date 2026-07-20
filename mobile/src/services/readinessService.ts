/**
 * Exam Readiness Service
 * ──────────────────────
 * Turns a learner's per-subject performance into a single, coefficient-weighted
 * "Exam Readiness Score" — the flagship metric parents, students and schools
 * all understand at a glance ("Exam Readiness: 74%").
 *
 * This module is intentionally PURE (no Firebase / React imports) so it can be
 * unit-tested in isolation and reused on the server later. The `useReadiness`
 * hook is responsible for assembling the inputs from exam results + study-plan
 * mastery and feeding them here.
 *
 * Public API:
 *   • computeReadiness({ subjectStats, coefficients })   → readiness summary
 *   • readinessBand(score)                               → band descriptor
 *   • aggregateExamResultsBySubject(results, subjectMap) → { subject → stat }
 *   • masteryToSubjectStats(mastery)                     → { subject → stat }
 *   • mergeSubjectStats(...sources)                      → [{ subject, pct, attempts }]
 */

function clamp(n: number, min: number, max: number) {
  if (typeof n !== 'number' || Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function toNumberOrNull(v: any) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && !Number.isNaN(n) ? n : null;
}

// ─── Readiness bands ────────────────────────────────────────────────────────
// Ordered by ascending threshold. Picks the highest band whose `min` ≤ score.

export const READINESS_BANDS = [
  { id: 'start',     min: 0,  color: '#ef4444', tone: 'danger',    label: 'À démarrer',        labelHt: 'Pou kòmanse' },
  { id: 'building',  min: 40, color: '#f97316', tone: 'warning',   label: 'En construction',   labelHt: 'N ap bati' },
  { id: 'ontrack',   min: 60, color: '#eab308', tone: 'caution',   label: 'Sur la bonne voie', labelHt: 'Sou bon chimen' },
  { id: 'almost',    min: 75, color: '#22c55e', tone: 'good',      label: 'Presque prêt',      labelHt: 'Prèske prè' },
  { id: 'ready',     min: 90, color: '#10b981', tone: 'excellent', label: 'Prêt pour le Bac',  labelHt: 'Prè pou Bak' },
];

/** Return the band descriptor for a 0–100 readiness score. */
export function readinessBand(score: number) {
  const s = clamp(score, 0, 100);
  let band = READINESS_BANDS[0];
  for (const b of READINESS_BANDS) {
    if (s >= b.min) band = b;
  }
  return band;
}

// ─── Input aggregation helpers ──────────────────────────────────────────────

/**
 * Group raw exam-result documents into per-subject averages.
 *
 * @param {Array}  results       — [{ id|exam_id, percentage|scorePct|summary.percentage, subject? }]
 * @param {Object} subjectByExamId — { exam_id → canonical subject } (from catalog)
 * @returns {Object} { subject → { pct, attempts } }
 */
export function aggregateExamResultsBySubject(results: any[] = [], subjectByExamId: Record<string, string> = {}) {
  const acc: Record<string, { sum: number; count: number }> = {};
  for (const r of results || []) {
    if (!r) continue;
    const examId = r.id || r.exam_id;
    const subject = r.subject || subjectByExamId[examId];
    if (!subject) continue;

    const pct = toNumberOrNull(
      r.percentage ?? r.scorePct ?? (r.summary && r.summary.percentage),
    );
    if (pct == null) continue;

    if (!acc[subject]) acc[subject] = { sum: 0, count: 0 };
    acc[subject].sum += clamp(pct, 0, 100);
    acc[subject].count += 1;
  }

  const out: Record<string, { pct: number; attempts: number }> = {};
  for (const [subject, v] of Object.entries(acc)) {
    out[subject] = { pct: Math.round(v.sum / v.count), attempts: v.count };
  }
  return out;
}

/**
 * Convert study-plan mastery (`computeSubjectMastery`) into the shared
 * { subject → { pct, attempts } } shape. Subjects never practised (attempts 0)
 * are dropped so they don't dilute the blended score with phantom 0%s.
 */
export function masteryToSubjectStats(mastery: Record<string, any> = {}) {
  const out: Record<string, { pct: number; attempts: number }> = {};
  for (const [subject, m] of Object.entries(mastery)) {
    if (!m) continue;
    const attempts = m.attempts || 0;
    if (attempts <= 0) continue;
    out[subject] = { pct: clamp(Math.round(m.pct || 0), 0, 100), attempts };
  }
  return out;
}

/**
 * Blend several { subject → { pct, attempts } } sources into a single,
 * attempts-weighted list. Sources with more attempts pull the average toward
 * their value (so a 12-question mock exam outweighs a single practice quiz).
 */
export function mergeSubjectStats(...sources: (Record<string, any> | null | undefined)[]) {
  const merged: Record<string, { weightedSum: number; weight: number; attempts: number }> = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [subject, s] of Object.entries(src)) {
      if (!s) continue;
      const attempts = s.attempts || 0;
      const weight = Math.max(attempts, 1); // single-source subjects still count
      if (!merged[subject]) merged[subject] = { weightedSum: 0, weight: 0, attempts: 0 };
      merged[subject].weightedSum += clamp(s.pct || 0, 0, 100) * weight;
      merged[subject].weight += weight;
      merged[subject].attempts += attempts;
    }
  }
  return Object.entries(merged).map(([subject, v]) => ({
    subject,
    pct: v.weight > 0 ? Math.round(v.weightedSum / v.weight) : 0,
    attempts: v.attempts,
  }));
}

// ─── Core readiness computation ─────────────────────────────────────────────

/**
 * Compute the coefficient-weighted Exam Readiness Score.
 *
 * @param {Object}   opts
 * @param {Array}    opts.subjectStats  — [{ subject, pct, attempts }]
 * @param {Object}   opts.coefficients  — { subject → Bac coefficient } for the track
 *
 * @returns {{
 *   overall: number,            // 0–100 weighted readiness
 *   hasData: boolean,           // at least one subject with attempts
 *   band: object,               // readiness band descriptor
 *   subjects: Array,            // every track subject, sorted by coefficient
 *   focus: object | null,       // highest-impact subject to work on next
 *   strongest: object | null,   // best-performing subject (with data)
 *   totalAttempts: number,
 *   subjectsWithData: number,
 *   subjectsTracked: number,
 * }}
 */
export function computeReadiness({ subjectStats = [] as any[], coefficients = {} as Record<string, number> } = {}) {
  const statsBySubject = new Map();
  for (const s of subjectStats || []) {
    if (!s || !s.subject) continue;
    statsBySubject.set(s.subject, {
      pct: clamp(Math.round(s.pct || 0), 0, 100),
      attempts: s.attempts || 0,
    });
  }

  // The union of the track's coefficient subjects and any subject the learner
  // already has data for (covers universal subjects outside the track table).
  const subjectNames = new Set([
    ...Object.keys(coefficients || {}),
    ...statsBySubject.keys(),
  ]);

  const subjects = [];
  let weightedSum = 0;
  let weightTotal = 0;
  let totalAttempts = 0;

  for (const name of subjectNames) {
    const coeff = (coefficients && coefficients[name]) ?? 1;
    const stat = statsBySubject.get(name);
    const hasData = !!stat && stat.attempts > 0;
    const pct = hasData ? stat.pct : 0;
    const attempts = stat ? stat.attempts : 0;

    totalAttempts += attempts;
    if (hasData) {
      weightedSum += pct * coeff;
      weightTotal += coeff;
    }

    subjects.push({ subject: name, pct, coeff, attempts, hasData });
  }

  const overall = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;
  const hasData = weightTotal > 0;

  // Sort: highest coefficient first, then weakest score first within a tier so
  // the list reads as a priority order.
  subjects.sort((a, b) => (b.coeff - a.coeff) || (a.pct - b.pct) || a.subject.localeCompare(b.subject));

  // "Focus this week" = the subject where improvement moves the needle most:
  // impact = coefficient × remaining gap. Un-started high-coefficient subjects
  // (pct 0) naturally float to the top, nudging learners to start them.
  let focus = null;
  let focusImpact = -1;
  let strongest = null;
  for (const s of subjects) {
    const impact = s.coeff * (100 - s.pct);
    if (impact > focusImpact) {
      focusImpact = impact;
      focus = s;
    }
    if (s.hasData && (!strongest || s.pct > strongest.pct)) strongest = s;
  }
  // Never nag about an already-excellent subject.
  if (focus && focus.pct >= 90) focus = null;

  return {
    overall,
    hasData,
    band: readinessBand(overall),
    subjects,
    focus: focus
      ? { subject: focus.subject, pct: focus.pct, coeff: focus.coeff, hasData: focus.hasData }
      : null,
    strongest: strongest ? { subject: strongest.subject, pct: strongest.pct } : null,
    totalAttempts,
    subjectsWithData: subjects.filter((s) => s.hasData).length,
    subjectsTracked: subjects.length,
  };
}
