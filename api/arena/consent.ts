/**
 * Vercel serverless function: GET /api/arena/consent?tid=…&uid=…
 * ────────────────────────────────────────────────────────────────────────────
 * The only way anybody reads a parental consent form.
 *
 * `storage.rules` denies every client read of `arena-consent/**`, uploader
 * included. That is not an oversight to work around here — it is the whole
 * design. Storage rules cannot ask Firestore what `users/{uid}.role` says, and
 * this codebase has no admin custom claims, so a read rule expressible in
 * Storage would be either "any signed-in user" or a second, weaker definition
 * of "admin" than the one `firestore.rules`, `/api/arena/questions` and
 * `/api/arena/state` all share. One definition, one door.
 *
 * So an admin asks here, the role is checked against `users/{uid}.role` with
 * the Admin SDK, and the answer is a signed URL that expires in fifteen
 * minutes. Short on purpose: the URL is a bearer token for a document about a
 * child, and a link pasted into a chat at 19:00 should not still open at
 * midnight.
 *
 * Response (200): { ok, url, expiresAt, contentType, size, uploadedAt }
 * Errors: 400 invalid input · 401 unauthorized · 403 not_admin ·
 *         404 claim_not_found / no_consent_on_file · 429 · 503
 *         storage_not_configured · 502 signing failed.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getConsentBucket, getDb } from '../_lib/firebaseAdmin';
import { authorizeCronOrAdmin, isValidTournamentId, toMillis } from './_shared';
import { parseConsentPath } from './claim';

/** Long enough to open and read, short enough that a leaked link is stale. */
const URL_TTL_MS = 15 * 60_000;

type Row = Record<string, unknown>;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const db = getDb();
  // Admin only in practice: the cron has no reason to read a consent form, but
  // sharing one door keeps the definition of "admin" in a single place.
  const actor = await authorizeCronOrAdmin(req, res, db, 'arena-questions');
  if (!actor) return;

  const tid = String(req.query.tid ?? '');
  const uid = String(req.query.uid ?? '');
  if (!isValidTournamentId(tid) || !uid || uid.length > 128) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  try {
    const snap = await db.doc(`tournaments/${tid}/claims/${uid}`).get();
    if (!snap.exists) {
      res.status(404).json({ error: 'claim_not_found' });
      return;
    }
    const consent = ((snap.data() ?? {}) as Row).consent as Row | undefined;
    const path = consent?.path;

    // Re-validated rather than trusted, even though this endpoint wrote it.
    // The stored path decides which object gets signed, and a signing call
    // that takes whatever a document happens to contain is one bad write away
    // from handing out a signed URL to anything in the bucket.
    const parsed = parseConsentPath(path, tid, uid);
    if (!parsed.ok) {
      res.status(404).json({ error: 'no_consent_on_file' });
      return;
    }

    const expiresAt = Date.now() + URL_TTL_MS;
    const [url] = await getConsentBucket()
      .file(String(path))
      .getSignedUrl({ action: 'read', expires: expiresAt });

    // Logged because reading a document about a child is an event, not a page
    // view: if this is ever questioned, who opened it and when is the answer.
    console.info(`[arena/consent] ${actor.label} read ${tid}/${uid}`);

    res.status(200).json({
      ok: true,
      url,
      expiresAt,
      contentType: consent?.contentType ?? null,
      size: consent?.size ?? null,
      uploadedAt: toMillis(consent?.uploadedAt),
    });
  } catch (err) {
    if ((err as Error)?.message === 'storage_not_configured') {
      res.status(503).json({ error: 'storage_not_configured' });
      return;
    }
    console.error('[arena/consent] failed:', err);
    res.status(502).json({ error: 'signing_failed' });
  }
}
