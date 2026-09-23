/**
 * Sprint solo — the pure parts, kept out of the component so they are tested.
 *
 * Everything here is the student's OWN record on THIS device: the error bank
 * is the questions they missed, the mastery list is computed from sprints they
 * actually played. Nothing is estimated or predicted — a category with no
 * answers simply does not appear.
 */
import type { TriviaQuestion } from '../../data/triviaData';

export type SprintQuestion = TriviaQuestion & { category?: string };

export const SPRINT_DURATIONS = [3, 5, 10] as const;

const BANK_KEY = 'edl-sprint-error-bank-v1';
const HISTORY_KEY = 'edl-sprint-history-v1';
const BANK_MAX = 100;
const HISTORY_MAX = 60;

/** Correct over answered, as a whole percent. null until something is answered. */
export function accuracy(correct: number, answered: number): number | null {
  if (!answered || answered <= 0) return null;
  return Math.round((Math.min(correct, answered) / answered) * 100);
}

/** 125 → "02:05". Never negative. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Stable identity for a question: its French text. */
export function questionKey(q: Pick<TriviaQuestion, 'q'>): string {
  return String(q?.q || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/* ── Storage (wrapped: private windows and blocked storage must not break play) ── */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/* ── Error bank ───────────────────────────────────────────────────────────── */
export type BankItem = { key: string; question: SprintQuestion; missedAt: number; misses: number };

export function loadBank(): BankItem[] {
  const v = read<BankItem[]>(BANK_KEY, []);
  return Array.isArray(v) ? v.filter((b) => b && b.key && b.question) : [];
}

/** A snapshot of only the fields a replay needs. */
function snapshot(q: SprintQuestion): SprintQuestion {
  return {
    q: q.q, qHt: q.qHt, options: q.options, answer: q.answer,
    ...(q.optionsHt ? { optionsHt: q.optionsHt } : {}),
    ...(q.explanation ? { explanation: q.explanation } : {}),
    ...(q.explanationHt ? { explanationHt: q.explanationHt } : {}),
    ...(q.flag ? { flag: q.flag } : {}),
    ...(q.flagIso ? { flagIso: q.flagIso } : {}),
    ...(q.category ? { category: q.category } : {}),
  };
}

/**
 * Apply one session to the bank: misses are added (or their count bumped and
 * moved to the front), questions answered correctly are removed — so a
 * "zéro faute" session empties the bank as it goes.
 */
export function updateBank(
  bank: BankItem[],
  results: { question: SprintQuestion; correct: boolean }[],
  now = Date.now(),
): BankItem[] {
  const map = new Map(bank.map((b) => [b.key, b]));
  for (const r of results) {
    const key = questionKey(r.question);
    if (!key) continue;
    if (r.correct) {
      map.delete(key);
    } else {
      const prev = map.get(key);
      map.delete(key);
      map.set(key, { key, question: snapshot(r.question), missedAt: now, misses: (prev?.misses || 0) + 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.missedAt - a.missedAt).slice(0, BANK_MAX);
}

export function saveBank(bank: BankItem[]) { write(BANK_KEY, bank); }

/* ── History → mastery ────────────────────────────────────────────────────── */
export type SprintSession = { at: number; byCategory: Record<string, { correct: number; answered: number }> };

export function loadHistory(): SprintSession[] {
  const v = read<SprintSession[]>(HISTORY_KEY, []);
  return Array.isArray(v) ? v.filter((s) => s && s.byCategory) : [];
}

export function sessionFromResults(results: { question: SprintQuestion; correct: boolean }[], at = Date.now()): SprintSession {
  const byCategory: SprintSession['byCategory'] = {};
  for (const r of results) {
    const c = r.question.category || 'mixed';
    byCategory[c] = byCategory[c] || { correct: 0, answered: 0 };
    byCategory[c].answered += 1;
    if (r.correct) byCategory[c].correct += 1;
  }
  return { at, byCategory };
}

export function appendHistory(history: SprintSession[], session: SprintSession): SprintSession[] {
  if (!Object.keys(session.byCategory).length) return history;
  return [...history, session].slice(-HISTORY_MAX);
}

export function saveHistory(history: SprintSession[]) { write(HISTORY_KEY, history); }

export type MasteryRow = { category: string; correct: number; answered: number; pct: number };

/** Per category, summed over every recorded sprint, weakest first. */
export function mastery(history: SprintSession[]): MasteryRow[] {
  const acc: Record<string, { correct: number; answered: number }> = {};
  for (const s of history) {
    for (const [c, v] of Object.entries(s.byCategory || {})) {
      acc[c] = acc[c] || { correct: 0, answered: 0 };
      acc[c].correct += v.correct || 0;
      acc[c].answered += v.answered || 0;
    }
  }
  return Object.entries(acc)
    .filter(([, v]) => v.answered > 0)
    .map(([category, v]) => ({ category, ...v, pct: accuracy(v.correct, v.answered) as number }))
    .sort((a, b) => a.pct - b.pct || b.answered - a.answered);
}

/* ── Scratchpad, one per session ──────────────────────────────────────────── */
export const scratchKey = (sessionId: string) => `edl-sprint-scratch-${sessionId}`;
export function loadScratch(sessionId: string): string {
  try { return window.localStorage.getItem(scratchKey(sessionId)) || ''; } catch { return ''; }
}
export function saveScratch(sessionId: string, text: string) {
  try { window.localStorage.setItem(scratchKey(sessionId), text); } catch { /* storage unavailable */ }
}
