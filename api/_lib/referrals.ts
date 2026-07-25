/**
 * Shared helpers for the two-sided referral program.
 * ---------------------------------------------------------------------------
 * Files in `api/_lib/` are NOT deployed as endpoints (Vercel ignores paths
 * beginning with `_`), so this is safe to import from any function under api/.
 *
 * Data model (all writes are server-side, via the Admin SDK — see firestore.rules):
 *   users/{uid}.referralCode        — the caller's own share code (server-set)
 *   users/{uid}.referredBy          — set once when the caller redeems a code
 *   referralCodes/{CODE}            — { uid, createdAt } lookup so signup can
 *                                     resolve CODE → referrer uid, and the doc id
 *                                     guarantees code uniqueness (create-if-absent)
 *   referrals/{referrerUid}_{referredUid}
 *                                   — { referrerUid, referredUid, status, createdAt }
 *
 * Rewards (two-sided):
 *   • streak freezes live in users/{uid}/streaks/global.streakFreezes — the
 *     referral cap is higher (REFERRAL_FREEZE_CAP) than the client's own +1
 *     award logic (max 2) so referral rewards can stack a little further.
 *   • XP lives in users/{uid}/gamification/profile.xp — Academy's real,
 *     user-visible cumulative XP (level is DERIVED from it via
 *     triviaService.levelInfo(xp)). Incremented with FieldValue.increment,
 *     mirroring how triviaService writes the profile doc.
 */
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';

/**
 * Referral-code alphabet: uppercase, WITHOUT the ambiguous glyphs 0/O/1/I/L so a
 * code read aloud or typed by hand is unambiguous.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;

/** Referral rewards can lift the freeze balance up to this cap (client logic caps its own +1 award at 2). */
export const REFERRAL_FREEZE_CAP = 5;

/** XP granted to the referrer when a referral is confirmed. */
export const REFERRER_XP = 100;
/** XP granted to the referred (new) user when they redeem a code. */
export const REFERRED_XP = 50;

/** Public link a learner shares — the client reads `?ref=CODE` at signup. */
export function referralLink(code: string): string {
  return `https://academy.edlight.org/?ref=${code}`;
}

/** Generate one random candidate code from the unambiguous alphabet. */
export function generateCode(length = CODE_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Normalize a user-supplied code: uppercase + strip anything outside the
 * alphabet (so "e-d l" style paste noise or lowercase input still resolves).
 * Returns '' if nothing valid remains.
 */
export function normalizeCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, '');
  return cleaned.slice(0, CODE_LENGTH);
}

/**
 * Ensure the caller has a referral code, creating one atomically if absent.
 * Idempotent: returns the existing code when the user already has one.
 *
 * Runs entirely inside a single transaction so two concurrent calls for the
 * same user can't mint two codes, and the referralCodes/{CODE} reservation is
 * collision-safe (candidates are checked before writing; on the vanishingly
 * unlikely event all candidates collide, it throws and the caller retries).
 */
export async function ensureReferralCode(db: Firestore, uid: string): Promise<string> {
  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async (tx: Transaction) => {
    const userSnap = await tx.get(userRef);
    const existing = userSnap.data()?.referralCode;
    if (typeof existing === 'string' && existing.length === CODE_LENGTH) {
      return existing;
    }

    // Generate a handful of candidates and read them all up-front (Firestore
    // requires every read to precede any write inside a transaction).
    const candidates = Array.from({ length: 6 }, () => generateCode());
    const codeRefs = candidates.map((c) => db.collection('referralCodes').doc(c));
    const codeSnaps = await Promise.all(codeRefs.map((ref) => tx.get(ref)));

    const freeIndex = codeSnaps.findIndex((s) => !s.exists);
    if (freeIndex === -1) {
      // All 6 collided — astronomically unlikely (~1 in 31^6 each). Bail so the
      // HTTP handler can retry with a fresh batch rather than reuse a code.
      throw new Error('referral_code_collision');
    }

    const code = candidates[freeIndex];
    tx.set(codeRefs[freeIndex], { uid, createdAt: FieldValue.serverTimestamp() });
    tx.set(userRef, { referralCode: code }, { merge: true });
    return code;
  });
}

/**
 * Apply a referral reward to one user: bump their streak-freeze balance by one
 * (capped at REFERRAL_FREEZE_CAP) and increment their cumulative XP.
 * Seeds the streaks/global and gamification/profile docs if missing (merge writes).
 *
 * The freeze bump reads-then-writes inside a transaction so the cap holds under
 * concurrency; XP uses FieldValue.increment (monotonic, like leaderboard/award).
 */
export async function applyReferralReward(
  db: Firestore,
  uid: string,
  xp: number,
): Promise<void> {
  const streakRef = db.collection('users').doc(uid).collection('streaks').doc('global');
  const profileRef = db.collection('users').doc(uid).collection('gamification').doc('profile');

  // Freeze token — capped, so read current then set (not a blind increment).
  await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(streakRef);
    const current = Number(snap.data()?.streakFreezes) || 0;
    const next = Math.min(current + 1, REFERRAL_FREEZE_CAP);
    tx.set(
      streakRef,
      { streakFreezes: next, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });

  // XP — Academy's user-visible cumulative XP; level is derived from it.
  // Monotonic accumulation (FieldValue.increment); merge seeds the profile doc
  // if missing, and the client backfills the rest via defaultTriviaProfile().
  await profileRef.set(
    {
      xp: FieldValue.increment(xp),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
