/**
 * chapterTestDraft — the chapter test survives the app being killed or put in
 * the background (P0 validation L-8). Same rules as the exam draft mirror
 * (shared/examDraft, F1): stored on the device, bound to the account that
 * started it, restored only for that account, and only while every drawn
 * question still exists in the bank (a draw that can't be rebuilt exactly is
 * discarded rather than half-restored).
 */
import type { PracticeCard } from './practiceCards';

export const CHAPTER_DRAFT_PREFIX = 'edlight-chapter-test-';
/** A test left for longer than this starts over (the bank may have moved on). */
export const CHAPTER_DRAFT_TTL_MS = 7 * 86_400_000;

export function chapterDraftKey(subjectCode: unknown, unitNo: unknown): string {
  return `${CHAPTER_DRAFT_PREFIX}${String(subjectCode ?? '')}-${String(unitNo ?? '')}`;
}

export interface ChapterTestDraft {
  uid: string;
  status: 'in_progress';
  cardIds: string[];
  answers: Record<string, number>;
  idx: number;
  updated_at_ms: number;
}

export function serializeChapterDraft(
  uid: string,
  cards: PracticeCard[],
  answers: Record<string, number>,
  idx: number,
  now = Date.now(),
): string {
  const draft: ChapterTestDraft = {
    uid,
    status: 'in_progress',
    cardIds: cards.map((c) => c.id),
    answers,
    idx,
    updated_at_ms: now,
  };
  return JSON.stringify(draft);
}

/** The draft to resume for `uid`, rebuilt from `pool`, or null. */
export function restoreChapterDraft(
  raw: string | null | undefined,
  uid: string | null | undefined,
  pool: PracticeCard[],
  now = Date.now(),
): { cards: PracticeCard[]; answers: Record<string, number>; idx: number } | null {
  if (!raw || !uid) return null;
  let d: Partial<ChapterTestDraft>;
  try { d = JSON.parse(raw); } catch { return null; }
  if (!d || d.uid !== uid || d.status !== 'in_progress' || !Array.isArray(d.cardIds) || d.cardIds.length === 0) return null;
  if (!Number.isFinite(d.updated_at_ms) || now - (d.updated_at_ms as number) > CHAPTER_DRAFT_TTL_MS) return null;
  const byId = new Map(pool.map((c) => [c.id, c]));
  const cards: PracticeCard[] = [];
  for (const id of d.cardIds) {
    const c = byId.get(id);
    if (!c) return null;
    cards.push(c);
  }
  const answers: Record<string, number> = {};
  for (const [id, v] of Object.entries(d.answers || {})) {
    const card = byId.get(id);
    if (card && Number.isInteger(v) && v >= 0 && v < card.options.length) answers[id] = v;
  }
  const idx = Math.max(0, Math.min(cards.length - 1, Math.floor(Number(d.idx) || 0)));
  return { cards, answers, idx };
}
