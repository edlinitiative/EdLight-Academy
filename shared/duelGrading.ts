/**
 * duelGrading — server-side scoring of "Défi d'un ami" (P0 validation D-8, D-9).
 * ─────────────────────────────────────────────────────────────────────────
 * A duel is a list of indexes into one category of the APP's trivia bank
 * (mobile/src/data/triviaData.ts — the web plays duels from that same file).
 * The score used to be whatever the client posted. Clients now post what they
 * picked for each question (the French option text, or null for a timeout)
 * and the server grades it against the same bank.
 *
 * Grading by option TEXT, not position: option order is shuffled per page
 * load and per play, and the generated decks draw random distractors, so
 * neither positions nor distractors are stable. The question text, its flag
 * and its correct answer are.
 *
 * `bankHash` fingerprints a category's bank in order (question + flag +
 * correct answer for each index). Two builds with the same hash replay the
 * same questions at the same indexes; a mismatch means the opponent would
 * answer different questions (D-9), and the server cannot grade a bank it
 * does not hold.
 */

export interface GradableQuestion {
  q?: unknown;
  flag?: unknown;
  options?: unknown;
  answer?: unknown;
}

/** Comparison form of an option / question text. */
export function normText(v: unknown): string {
  return String(v ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The correct option's text, or null when the entry is malformed. */
export function correctText(q: GradableQuestion | null | undefined): string | null {
  if (!q || !Array.isArray(q.options)) return null;
  const i = Number(q.answer);
  if (!Number.isInteger(i) || i < 0 || i >= q.options.length) return null;
  const t = q.options[i];
  return typeof t === 'string' ? t : t == null ? null : String(t);
}

/** Stable identity of one bank entry (independent of option order). */
export function gradingKey(q: GradableQuestion): string {
  return `${normText(q?.q)}␟${String(q?.flag ?? '')}␟${normText(correctText(q))}`;
}

/** FNV-1a 32-bit over the bank's keys, in order; `b` + 8 hex chars. */
export function bankHash(bank: GradableQuestion[] | null | undefined): string | null {
  if (!Array.isArray(bank) || bank.length === 0) return null;
  let h = 0x811c9dc5;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  bank.forEach((q, i) => { feed(`${i}:${gradingKey(q)}\n`); });
  return `b${h.toString(16).padStart(8, '0')}`;
}

export const BANK_HASH_RE = /^b[0-9a-f]{8}$/;

/**
 * Score a round from what was picked. Null when the round cannot be graded
 * against this bank: an index out of range, a malformed entry, or a picks list
 * that does not cover every question.
 */
export function gradeDuel(
  bank: GradableQuestion[] | null | undefined,
  idxs: number[],
  picks: unknown,
): { score: number; total: number } | null {
  if (!Array.isArray(bank) || !Array.isArray(idxs) || !idxs.length) return null;
  if (!Array.isArray(picks) || picks.length !== idxs.length) return null;
  let score = 0;
  for (let k = 0; k < idxs.length; k += 1) {
    const i = idxs[k];
    if (!Number.isInteger(i) || i < 0 || i >= bank.length) return null;
    const correct = correctText(bank[i]);
    if (correct == null) return null;
    const pick = picks[k];
    if (pick === null || pick === undefined) continue; // timeout
    if (typeof pick !== 'string' || pick.length > 500) return null;
    if (normText(pick) === normText(correct)) score += 1;
  }
  return { score, total: idxs.length };
}

export type ScoreDecision =
  | { ok: true; score: number; source: 'server' | 'client'; bankHash: string | null }
  | { ok: false; error: 'bank_mismatch' | 'invalid_answers' };

/**
 * Which score to record for one side of a duel.
 *
 *  • The server grades whenever it holds the bank the duel was minted on
 *    (its hash equals the duel's — or, for a duel minted before hashes, its
 *    indexes are in range) and the client sent its picks.
 *  • Otherwise (an app build whose bank differs from the server's, or an older
 *    build that sends only a score) the client's score is kept, clamped, and
 *    recorded as `source: 'client'` so it is visible as unverified. Older
 *    builds and duels already in flight keep working.
 *  • An opponent whose bank differs from the duel's would be answering other
 *    questions: refused (`bank_mismatch`, the app says "update").
 */
export function decideDuelScore(input: {
  serverBank: GradableQuestion[] | null | undefined;
  /** The duel's stored hash (accept), or undefined when minting (create). */
  duelHash?: string | null;
  clientHash?: unknown;
  idxs: number[];
  picks?: unknown;
  clientScore: number;
  total: number;
}): ScoreDecision {
  const serverHash = bankHash(input.serverBank);
  const clientHash = typeof input.clientHash === 'string' && BANK_HASH_RE.test(input.clientHash) ? input.clientHash : null;
  const duelHash = typeof input.duelHash === 'string' && BANK_HASH_RE.test(input.duelHash) ? input.duelHash : null;

  if (duelHash && clientHash && clientHash !== duelHash) return { ok: false, error: 'bank_mismatch' };

  // The bank the duel lives on: its stored hash, else the minting client's.
  const target = duelHash ?? clientHash ?? null;
  const serverHolds = !!serverHash && (target === null || target === serverHash);

  if (serverHolds && input.picks !== undefined && input.picks !== null) {
    const graded = gradeDuel(input.serverBank, input.idxs, input.picks);
    if (!graded) return { ok: false, error: 'invalid_answers' };
    return { ok: true, score: graded.score, source: 'server', bankHash: serverHash };
  }
  const clamped = Math.max(0, Math.min(Math.round(Number(input.clientScore)) || 0, input.total));
  return { ok: true, score: clamped, source: 'client', bankHash: target };
}

/** Client side: the picks list a server can grade (FR text per question). */
export function picksFrom<T>(answers: T[], textOf: (a: T) => string | null | undefined): Array<string | null> {
  return answers.map((a) => {
    const t = textOf(a);
    return typeof t === 'string' && t ? t : null;
  });
}
