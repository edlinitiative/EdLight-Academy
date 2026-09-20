/**
 * arena/review — the integrity review's pure decisions.
 *
 * Two questions, both asked by three surfaces at once (the review endpoint,
 * the finalisation gate in `api/arena/state.ts`, and the run console), so both
 * are answered here rather than three times:
 *
 *   · What does a pile of raw integrity flags actually say about a player?
 *   · What is still unresolved on the podium — i.e. why can this tournament
 *     not be finalised yet?
 *
 * CONTEXT, from an external audit (E8): `eligible: false` was read in four
 * places and written in none, `flags` were recorded and shown to nobody, and
 * `provisional → final` — the transition that releases the prize money — had
 * no gate whatsoever. This module is the half of the fix that can be tested
 * without a Firestore.
 *
 * Pure and framework-free. `now` is always passed in.
 */

import {
  currentHolder,
  effectiveClaimState,
  HOLDING_STATES,
  type ClaimRecord,
} from './claims';

// ── Flags ───────────────────────────────────────────────────────────────────

/**
 * The shapes `integrityFlags()` writes, in `api/arena/_shared.ts`:
 *
 *   impossible:{questionIndex}          an answer that arrived before it could
 *                                       have been read
 *   fast:{questionIndex}                faster than FAST_ANSWER_MS
 *   focus:{questionIndex}:{losses}      the app lost focus mid-question
 *   device:{questionIndex}              this answer came from a different
 *                                       device than the previous one
 *   attest:{questionIndex}              an App Check token was presented and
 *                                       did not verify
 *
 * Parsed rather than trusted: a reviewer reads a count, and a count that
 * silently includes a flag shape nobody recognises is worse than one that
 * admits it skipped something.
 */
export interface FlagSummary {
  total: number;
  impossible: number;
  fast: number;
  focus: number;
  /** Mid-tournament device switches. A dead phone looks like this too. */
  device: number;
  /** Answers whose attestation was presented and failed. Absence is not here. */
  attest: number;
  /** The largest single focus-loss reading, not the sum. */
  worstFocusLosses: number;
  /** Distinct question indices carrying at least one flag, ascending. */
  questions: number[];
}

const EMPTY_SUMMARY: FlagSummary = {
  total: 0, impossible: 0, fast: 0, focus: 0, device: 0, attest: 0, worstFocusLosses: 0, questions: [],
};

const asIndex = (raw: string | undefined): number | null => {
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

export function flagSummary(flags: unknown): FlagSummary {
  if (!Array.isArray(flags)) return { ...EMPTY_SUMMARY, questions: [] };

  const out: FlagSummary = { ...EMPTY_SUMMARY, questions: [] };
  const questions = new Set<number>();

  for (const raw of flags) {
    if (typeof raw !== 'string') continue;
    const [kind, indexPart, countPart] = raw.split(':');
    const index = asIndex(indexPart);
    if (index === null) continue;

    if (kind === 'impossible') out.impossible += 1;
    else if (kind === 'fast') out.fast += 1;
    else if (kind === 'device') out.device += 1;
    else if (kind === 'attest') out.attest += 1;
    else if (kind === 'focus') {
      out.focus += 1;
      const losses = Number(countPart);
      if (Number.isFinite(losses)) out.worstFocusLosses = Math.max(out.worstFocusLosses, losses);
    } else continue; // a flag shape this version does not know: not counted.

    out.total += 1;
    questions.add(index);
  }

  out.questions = [...questions].sort((a, b) => a - b);
  return out;
}

/**
 * Is this player worth a reviewer's attention at all?
 *
 * Deliberately not a score or a threshold. Section M flags, it does not judge:
 * a notification, a phone call and a low battery all look like tabbing out to
 * an AI, so the only thing this can honestly say is "there is something here
 * to read".
 */
export function needsReview(flags: unknown): boolean {
  return flagSummary(flags).total > 0;
}

// ── The finalisation gate ───────────────────────────────────────────────────

export type ReviewDecision = 'cleared' | 'disqualified';

export type BlockerReason =
  /** Two or more finishers share a paying rank and nobody has adjudicated it. */
  | 'tie_unresolved'
  /** Somebody still has time to claim, or has claimed and not been verified. */
  | 'claim_unresolved'
  /** The prize is vacated (expired/rejected) or was never assigned — it has to
   *  roll down, or be written off on purpose. */
  | 'prize_unassigned'
  /** A flagged player is in the money and no decision has been recorded. */
  | 'unreviewed_flags'
  /** Review disqualified them and they are somehow still holding the prize. */
  | 'disqualified_holder';

export interface FinalBlocker {
  /** The PAYING rank this concerns. */
  rank: number;
  /** Who it concerns. Empty when the problem is that nobody holds the prize. */
  uids: string[];
  why: BlockerReason;
}

export interface FinalGateInput {
  /** The announced board: `standings/current.individuals`, uid + rank only. */
  individuals: Array<{ uid: string; rank: number }>;
  claims: ClaimRecord[];
  /** `prizes.individual`, in cents, index 0 being rank 1. */
  prizeCents: readonly number[];
  /** Recorded review verdicts by uid. Absent means nobody has ruled. */
  decisions: Record<string, ReviewDecision | undefined>;
  /** Raw `flags` arrays off the player rows, by uid. */
  flags: Record<string, string[] | undefined>;
  now: number;
}

/**
 * Everything standing between this tournament and `final`.
 *
 * SCOPED TO THE MONEY, on purpose. `final` is the transition that releases the
 * prizes, so what gates it is the state of the paying ranks — not every flag
 * in the tournament. A `fast:` flag on a student who finished 200th is
 * information for a reviewer; holding the podium hostage to it would mean
 * clearing hundreds of rows by hand at midnight, which in practice means the
 * gate gets overridden every single time and therefore protects nothing.
 *
 * An empty list means every paying rank is settled: one undisputed finisher,
 * their claim verified (or verified by whoever it rolled down to), and no
 * unexamined flags on anyone in the money.
 */
export function finalBlockers(input: FinalGateInput): FinalBlocker[] {
  const { individuals, claims, prizeCents, decisions, flags, now } = input;
  const out: FinalBlocker[] = [];

  for (let i = 0; i < prizeCents.length; i += 1) {
    const rank = i + 1;
    const cents = prizeCents[i];
    // A rank that pays nothing cannot leave anybody unpaid.
    if (typeof cents !== 'number' || !Number.isFinite(cents) || cents <= 0) continue;

    const finishers = individuals.filter((row) => row.rank === rank);
    // Nobody reached this rank — three prizes and two finishers is a real
    // outcome for a first event, and it must not hold the tournament open.
    if (finishers.length === 0) continue;

    // A disqualified finisher is out of the running, so they cannot be half of
    // a tie that still needs adjudicating.
    const contenders = finishers.filter((row) => decisions[row.uid] !== 'disqualified');
    if (contenders.length > 1) {
      out.push({ rank, uids: contenders.map((c) => c.uid), why: 'tie_unresolved' });
      continue;
    }

    const holder = currentHolder(claims, rank, now);
    const state = effectiveClaimState(holder, now);

    // Nobody holds it: either the placeholder was never written, or the window
    // ran out / the claim was rejected and the roll-down has not happened.
    // Both are "this money has no owner", which is not a state to finalise in.
    if (!holder || state === null || !HOLDING_STATES.includes(state)) {
      out.push({ rank, uids: contenders.map((c) => c.uid), why: 'prize_unassigned' });
      continue;
    }

    if (decisions[holder.uid] === 'disqualified') {
      out.push({ rank, uids: [holder.uid], why: 'disqualified_holder' });
      continue;
    }

    // 'open' — the published window is still running and the student has not
    // answered yet. 'claimed' — they have, and the verification call has not
    // happened. Only 'verified' is done.
    if (state !== 'verified') {
      out.push({ rank, uids: [holder.uid], why: 'claim_unresolved' });
      continue;
    }

    // Everyone in the money at this rank, flagged and unruled.
    const unreviewed = [...new Set([holder.uid, ...contenders.map((c) => c.uid)])]
      .filter((uid) => needsReview(flags[uid]) && decisions[uid] === undefined);
    if (unreviewed.length > 0) {
      out.push({ rank, uids: unreviewed, why: 'unreviewed_flags' });
    }
  }

  return out;
}

// ── The corrected official board ────────────────────────────────────────────

export interface CorrectedBoard<T extends { uid: string; rank: number; schoolKey?: string }> {
  individuals: T[];
  /** Who was taken off the board, in the order they appeared on it. */
  removed: T[];
  /**
   * Schools that lost a scoring contributor. Their MEAN cannot be corrected
   * from the announced board — it is the average of a best-five the board does
   * not carry — so they are named rather than silently left wrong.
   */
  affectedSchools: string[];
}

/**
 * The announced board, minus the disqualified, with the gaps closed.
 *
 * DERIVED FROM THE ANNOUNCED BOARD, not recomputed from the player rows. Two
 * reasons, and the second is the important one:
 *
 *  · `aggregateOne` refuses to run in `provisional` on purpose — rewriting
 *    `standings/current` there would edit a board that has already been read
 *    out on a stream.
 *  · Roll-down's whole defensibility rests on the prize moving DOWN THE BOARD
 *    PEOPLE WATCHED. A re-derived board could order two students differently
 *    from the one that was announced, and then the corrected result and the
 *    prize that was paid would disagree about who finished third.
 *
 * So this removes rows and closes the gaps. It never re-scores anybody.
 *
 * Ties survive: two students who shared rank 2 on the announced board still
 * share a rank after someone above them is removed. A tie group is detected by
 * equal ORIGINAL rank, so the function needs no access to the tiebreak chain
 * that produced it — which is exactly the point, since re-implementing that
 * chain here is how the two copies drift.
 */
export function correctIndividuals<T extends { uid: string; rank: number; schoolKey?: string }>(
  individuals: readonly T[],
  disqualified: ReadonlySet<string>,
): CorrectedBoard<T> {
  const removed = individuals.filter((row) => disqualified.has(row.uid));
  const kept = individuals.filter((row) => !disqualified.has(row.uid));

  const out: T[] = [];
  let previousOriginalRank: number | null = null;
  let previousNewRank = 0;

  kept.forEach((row, i) => {
    const newRank = row.rank === previousOriginalRank ? previousNewRank : i + 1;
    previousOriginalRank = row.rank;
    previousNewRank = newRank;
    out.push({ ...row, rank: newRank });
  });

  const affectedSchools = [...new Set(
    removed.map((row) => row.schoolKey).filter((k): k is string => typeof k === 'string' && k !== ''),
  )];

  return { individuals: out, removed, affectedSchools };
}
