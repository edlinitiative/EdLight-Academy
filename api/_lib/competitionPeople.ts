/**
 * Public identity for competition surfaces: a uid becomes { name, avatar } and
 * nothing else (never an email, never a full name).
 *
 *   name   = leaderboard alias when the entry is not hidden and valid,
 *            else defaultAlias(account name), else 'Participant'
 *            — the same rule the rest of the competition server uses.
 *   avatar = the student's chosen avatar (users/{uid}.avatar), re-sanitized
 *            with cleanAvatar; null → clients draw the seeded face.
 *
 * Invite codes: a short, case-insensitive code derived from the uid
 * (competitionInviteCodes/{code} → { uid }) so students share "K7Q2-M9XD"
 * instead of an account identifier. The mapping is server-only.
 */
import { createHash } from "crypto";
import type {
  DocumentData,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import { cleanAvatar } from "../../src/arena-art/avatars/avatarConfig";
import { defaultAlias, isValidAlias } from "../../shared/alias";

export interface PublicPerson {
  name: string;
  avatar: string | null;
}

/** Resolve one person from their leaderboard entry and profile documents. */
export function publicPerson(
  board: DocumentData | null | undefined,
  profile: DocumentData | null | undefined,
  fallbackName = "",
): PublicPerson {
  const name =
    board?.hidden !== true && isValidAlias(board?.displayName)
      ? String(board!.displayName).slice(0, 40)
      : defaultAlias(fallbackName || profile?.displayName) || "Participant";
  return {
    name,
    avatar: cleanAvatar(profile?.avatar) ?? cleanAvatar(board?.avatar),
  };
}

const TTL_MS = 60_000;
const cache = new Map<string, { person: PublicPerson; at: number }>();

/**
 * { uid → { name, avatar } } for up to `max` distinct uids, read in two
 * batched getAll calls. A warm instance reuses answers for a minute, so the
 * 15-second page refresh does not re-read every face.
 */
export async function resolvePeople(
  db: Firestore,
  uids: Iterable<string | null | undefined>,
  max = 90,
): Promise<Record<string, PublicPerson>> {
  const wanted = [
    ...new Set(
      [...uids].filter(
        (u): u is string =>
          typeof u === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(u),
      ),
    ),
  ].slice(0, max);
  const out: Record<string, PublicPerson> = {};
  const now = Date.now();
  const missing: string[] = [];
  for (const uid of wanted) {
    const hit = cache.get(uid);
    if (hit && now - hit.at < TTL_MS) out[uid] = hit.person;
    else missing.push(uid);
  }
  if (!missing.length) return out;
  try {
    const [boards, profiles] = await Promise.all([
      db.getAll(
        ...missing.map((u) => db.doc(`leaderboards/all-time/entries/${u}`)),
      ),
      db.getAll(...missing.map((u) => db.doc(`users/${u}`))),
    ]);
    missing.forEach((uid, i) => {
      const person = publicPerson(
        boards[i]?.exists ? boards[i].data() : null,
        profiles[i]?.exists ? profiles[i].data() : null,
      );
      out[uid] = person;
      cache.set(uid, { person, at: now });
    });
  } catch (error) {
    // Identity is decoration: a failed lookup leaves names to the client fallback.
    console.warn("[competition] people lookup failed", {
      count: missing.length,
      name: error instanceof Error ? error.name : "Error",
    });
  }
  if (cache.size > 5000) cache.clear();
  return out;
}

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Deterministic code for `uid`; `length` grows only on a (rare) collision. */
export function inviteCodeFor(uid: string, length = 8): string {
  const digest = createHash("sha256")
    .update(`edlight-competition-invite:${uid}`)
    .digest();
  let code = "";
  for (let i = 0; i < length; i++) code += ALPHABET[digest[i] % 32];
  return code;
}

export function normalizeInviteCode(value: unknown): string {
  return typeof value === "string"
    ? value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 16)
    : "";
}

const ensured = new Map<string, string>();

/** The caller's invite code, creating its mapping document once. */
export async function ensureInviteCode(
  db: Firestore,
  uid: string,
): Promise<string | null> {
  const known = ensured.get(uid);
  if (known) return known;
  try {
    for (const length of [8, 12, 16]) {
      const code = inviteCodeFor(uid, length);
      const ref = db.doc(`competitionInviteCodes/${code}`);
      const snap = await ref.get();
      if (snap.exists && snap.data()?.uid !== uid) continue;
      if (!snap.exists) await ref.create({ uid, createdAt: Date.now() });
      ensured.set(uid, code);
      return code;
    }
  } catch (error) {
    console.warn("[competition] invite code unavailable", {
      name: error instanceof Error ? error.name : "Error",
    });
  }
  return null;
}

/** uid behind an invite code, inside the mutation transaction. */
export async function resolveInviteCode(
  tx: Transaction,
  db: Firestore,
  value: unknown,
): Promise<string | null> {
  const code = normalizeInviteCode(value);
  if (code.length < 8) return null;
  const snap = await tx.get(db.doc(`competitionInviteCodes/${code}`));
  const uid = snap.exists ? snap.data()?.uid : null;
  return typeof uid === "string" ? uid : null;
}
