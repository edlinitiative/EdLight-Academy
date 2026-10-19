import type { Firestore } from 'firebase-admin/firestore';
import {
  COMPETITION_FLAG_KEYS,
  resolveCompetitionFlags,
  type CompetitionConfigDoc,
  type CompetitionFlagAudit,
  type CompetitionFlagKey,
  type CompetitionFlags,
  type CompetitionFlagsState,
} from '../../shared/competition/flags';

/**
 * Runtime competition switches, editable from the admin console
 * (/admin/data/competitions). Server-only: `platformConfig/*` and
 * `platformConfigAudit/*` fall under the default-deny catch-all in
 * firestore.rules, so only the Admin SDK reads or writes them.
 *
 * The doc is cached per function instance for CACHE_MS; an admin write in the
 * same instance refreshes the cache at once, other instances catch up within
 * the TTL. The env defaults are re-read on every call (cheap, and tests flip
 * them), so behaviour is unchanged until an admin sets a flag.
 */
export const CONFIG_PATH = 'platformConfig/competition';
export const AUDIT_COLLECTION = 'platformConfigAudit';
const CACHE_MS = 30_000;

let cache: { doc: CompetitionConfigDoc | null; at: number } | null = null;

export function resetCompetitionFlagsCache(): void {
  cache = null;
}

async function storedConfig(db: Firestore): Promise<CompetitionConfigDoc | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.doc;
  try {
    const snap = await db.doc(CONFIG_PATH).get();
    const doc = snap.exists ? ((snap.data() as CompetitionConfigDoc) ?? null) : null;
    cache = { doc, at: now };
    return doc;
  } catch (error) {
    // A transient read failure keeps the last known value, else the env defaults.
    console.error('[platformConfig] read failed', {
      name: error instanceof Error ? error.name : 'Error',
    });
    return cache?.doc ?? null;
  }
}

export async function competitionFlagsState(db: Firestore): Promise<CompetitionFlagsState> {
  return resolveCompetitionFlags(await storedConfig(db), process.env);
}

/** The effective switches every competition path enforces. */
export async function competitionFlags(db: Firestore): Promise<CompetitionFlags> {
  return (await competitionFlagsState(db)).effective;
}

export type FlagChanges = Partial<Record<CompetitionFlagKey, boolean | null>>;

/** A non-empty map of known flags to true / false / null, or null when invalid. */
export function parseFlagChanges(changes: unknown): FlagChanges | null {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
  const entries = Object.entries(changes as Record<string, unknown>);
  if (
    !entries.length ||
    entries.some(
      ([k, v]) =>
        !(COMPETITION_FLAG_KEYS as readonly string[]).includes(k) ||
        !(typeof v === 'boolean' || v === null),
    )
  )
    return null;
  return changes as FlagChanges;
}

/**
 * Admin write. `changes` maps a flag to true/false (set here) or null (back to
 * the server default). One audit record per flag whose stored value changed,
 * committed in the same transaction as the config doc.
 */
export async function updateCompetitionFlags(
  db: Firestore,
  adminUid: string,
  changes: FlagChanges,
  now = Date.now(),
): Promise<CompetitionFlagsState> {
  const entries = Object.entries(changes);
  const ref = db.doc(CONFIG_PATH);
  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev: CompetitionConfigDoc = snap.exists ? (snap.data() as CompetitionConfigDoc) : {};
    const doc: CompetitionConfigDoc = {};
    for (const key of COMPETITION_FLAG_KEYS)
      if (typeof prev[key] === 'boolean') doc[key] = prev[key];
    const audits: Array<Omit<CompetitionFlagAudit, 'id'>> = [];
    for (const [key, value] of entries as Array<[CompetitionFlagKey, boolean | null]>) {
      const from = typeof prev[key] === 'boolean' ? (prev[key] as boolean) : null;
      if (from === value) continue;
      if (value === null) delete doc[key];
      else doc[key] = value;
      audits.push({ flag: key, from, to: value, by: adminUid, at: now });
    }
    if (!audits.length) return prev;
    const written = { ...doc, updatedAt: now, updatedBy: adminUid };
    tx.set(ref, written);
    for (const audit of audits) tx.set(db.collection(AUDIT_COLLECTION).doc(), audit);
    return written;
  });
  cache = { doc: next, at: Date.now() };
  return resolveCompetitionFlags(next, process.env);
}

export async function recentFlagAudits(db: Firestore, limit = 20): Promise<CompetitionFlagAudit[]> {
  const snap = await db.collection(AUDIT_COLLECTION).orderBy('at', 'desc').limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CompetitionFlagAudit, 'id'>) }));
}
