/**
 * Vercel serverless function: POST /api/arena/school-location
 * ────────────────────────────────────────────────────────────────────────────
 * An admin states WHERE A SCHOOL IS. One fact, typed by a person.
 *
 * ── WHY THIS ENDPOINT EXISTS AT ALL ─────────────────────────────────────────
 *
 * `shared/data/schools-seed.json` carries 94 schools and not one commune, and
 * its own header says why: an earlier version inferred the commune from the
 * ESLP application's "Addresse de residence" — where the STUDENT lives — and
 * Saint-Louis de Gonzague came out as two schools, because sixteen applicants
 * to one school live in sixteen different places. The seed was rebuilt with no
 * location rather than a wrong one.
 *
 * So there is no derivation to re-enable and nothing here computes a location.
 * A school's commune arrives one way: a human says it. Until someone does, the
 * school has no location, the map does not place it, and the stage says so.
 * The counterpart to that promise is that saying it has to be EASY — hence one
 * endpoint, one field, no queue.
 *
 * ── WHY IT IS AN ENDPOINT AND NOT A CLIENT WRITE ────────────────────────────
 *
 * `firestore.rules` does allow an admin's browser to update `schools/{id}`
 * (`allow update, delete: if isAdmin()`), so this is not routing around a
 * denial. It is routing around what a rule CANNOT check: that the commune is
 * one of the 140 in the one vocabulary. Rules cannot hold that list, and a
 * free-typed "Port au Prince" is not a typo the admin sees — it is a school
 * that silently never appears on the broadcast map, because the map joins on
 * spelling. The vocabulary has to be enforced somewhere that can hold it.
 *
 * Admin is verified the same way `api/arena/questions.ts` verifies it: reading
 * `users/{uid}.role` with the Admin SDK, never a client claim, failing closed.
 *
 * Request body (Authorization: Bearer <Firebase ID token>):
 *   { key: string,            // schoolKey() — the key the board groups by
 *     commune: string | null, // a commune from haitiGeo.ts, or null to unsay it
 *     name?: string }         // required only when no school document exists yet
 *
 * Response 200: { ok: true, key, commune, department, updated, created }
 * Errors: 400 invalid_key · 400 invalid_commune · 400 missing_name ·
 *         401 · 403 not_admin · 429 · 405 · 500 write_failed.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { checkRateLimit } from '../_lib/rateLimit';
import { getDb } from '../_lib/firebaseAdmin';
import { findCommune } from '../../shared/haitiCommunes';
import { isValidSchoolKey, parseBody } from './_shared';

/** Matches the `name` bounds `firestore.rules` enforces on a created school. */
const NAME_MIN = 4;
const NAME_MAX = 90;

export interface SchoolLocationInput {
  key: string;
  /** Canonical commune, or null when the admin is clearing a location. */
  commune: string | null;
  /** Canonical département of that commune. Null alongside a null commune. */
  department: string | null;
  name: string;
}

/**
 * Validate one submission.
 *
 * Exported so the same rules can be unit-tested without a Firestore, and so a
 * test can assert the one thing that matters most here: an unrecognised
 * commune is REFUSED, not stored, not corrected, not guessed at.
 *
 * `commune: null` is explicitly valid and means "nobody knows". An admin who
 * realises they entered a guess must be able to take it back — a location you
 * can only ever add is a location nobody dares add.
 */
export function validateSchoolLocation(
  raw: unknown,
): { ok: true; value: SchoolLocationInput } | { ok: false; reason: 'key' | 'commune' | 'name' } {
  const body = (raw ?? {}) as Record<string, unknown>;

  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!isValidSchoolKey(key)) return { ok: false, reason: 'key' };

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : '';
  if (name !== '' && name.length < NAME_MIN) return { ok: false, reason: 'name' };

  const raw_commune = body.commune;
  // Undefined and empty string mean the same thing as null here. A form that
  // posts '' when a select is cleared must clear the location, not fail.
  if (raw_commune === null || raw_commune === undefined || raw_commune === '') {
    return { ok: true, value: { key, commune: null, department: null, name } };
  }
  if (typeof raw_commune !== 'string') return { ok: false, reason: 'commune' };

  // The fold is the same accent/case-insensitive one the profile picker uses,
  // so an admin who types "petion-ville" gets Pétion-Ville rather than a
  // rejection — but a commune that is not on the list is refused outright.
  // Accepting it would put a name on a school that no map can place.
  const resolved = findCommune(raw_commune);
  if (!resolved) return { ok: false, reason: 'commune' };

  return {
    ok: true,
    value: { key, commune: resolved.commune, department: resolved.department, name },
  };
}

/**
 * A Firestore document id for a school the seed knows but Firestore does not.
 *
 * The 94 seeded schools ship inside the app as JSON and have NO document until
 * something writes one. Derived from the key rather than auto-generated so that
 * two admins setting the same school's commune at the same moment write the
 * same document instead of creating two schools with one key — which is the
 * duplicate-school failure this whole area of the product is built to avoid.
 */
export function schoolDocId(key: string): string {
  return `k-${key.replace(/\s+/g, '-')}`;
}

async function isAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await getDb().doc(`users/${uid}`).get();
    return snap.exists && (snap.data() as { role?: string })?.role === 'admin';
  } catch {
    // A failed role lookup is NOT an admin. This writes the name of a place
    // onto a broadcast; the safe direction on an error is always "no".
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const decoded = await requireAuthDecoded(req, res);
  if (!decoded) return;

  const { allowed } = await checkRateLimit(decoded.uid, 'arena-schools');
  if (!allowed) {
    res.status(429).json({ error: 'rate_limit_exceeded' });
    return;
  }

  if (!(await isAdmin(decoded.uid))) {
    res.status(403).json({ error: 'not_admin' });
    return;
  }

  const parsed = validateSchoolLocation(parseBody(req));
  if (!parsed.ok) {
    res.status(400).json({ error: `invalid_${parsed.reason}` });
    return;
  }
  const { key, commune, department, name } = parsed.value;

  const db = getDb();

  try {
    const location = {
      commune,
      department,
      // WHO said so and WHEN. A location with no author is a location nobody
      // can question later, and "where did this come from" is precisely the
      // question the residence-derived addresses could not answer.
      communeSetBy: decoded.uid,
      communeSetAt: FieldValue.serverTimestamp(),
    };

    const snap = await db.collection('schools').where('key', '==', key).get();

    if (snap.empty) {
      if (!name) {
        // A seeded school has no document yet, so creating one needs its name.
        // The server will not invent it from the key: `schoolKey()` is lossy
        // (accents stripped, punctuation collapsed) and a name rebuilt from it
        // would be a different school's name on the stage.
        res.status(400).json({ error: 'missing_name' });
        return;
      }
      await db.doc(`schools/${schoolDocId(key)}`).set(
        {
          key,
          name,
          ...location,
          // An admin-authored school is canonical by definition — the review
          // this status exists for is the person doing the writing.
          status: 'approved',
          createdBy: decoded.uid,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      res.status(200).json({ ok: true, key, commune, department, updated: 0, created: 1 });
      return;
    }

    // EVERY document carrying this key, not just the first. `mergeSchools()`
    // resolves a key held by two documents by preferring whichever knows its
    // commune — so updating one of a pair would make which location wins a coin
    // toss decided by Firestore's iteration order.
    const batch = db.batch();
    for (const doc of snap.docs) batch.set(doc.ref, location, { merge: true });
    await batch.commit();

    res.status(200).json({ ok: true, key, commune, department, updated: snap.size, created: 0 });
  } catch (err) {
    console.error('[arena/school-location] error:', err);
    res.status(500).json({ error: 'write_failed' });
  }
}
