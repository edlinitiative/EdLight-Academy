/**
 * EdLight Apply → Academy: the server-to-server decision webhook for the
 * "Ambassadeur EdLight Academy" programme.
 *
 *   POST /api/ambassadors?action=ambassador-application
 *   X-EdLight-Timestamp: <unix seconds>
 *   X-EdLight-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 *   { applicationId, academyEmail, school, schoolKey?, decision: 'approve' | 'revoke', reviewerName? }
 *
 * Authenticated ONLY by the signature (no Firebase token): the shared secret is
 * `AMBASSADOR_WEBHOOK_SECRET` here and `ACADEMY_AMBASSADOR_WEBHOOK_SECRET` on
 * Apply. The timestamp is inside the signed string, and a request more than
 * 5 minutes from the server clock is refused, so a captured request cannot be
 * replayed later. Retries inside the window are safe anyway: each
 * (applicationId, decision) is applied at most once (ledger in ambassadors.ts).
 *
 * Responses: 200 { ok: true, uid, replayed? } or { error: code } with
 *   invalid_signature · stale_request · not_configured · invalid_input ·
 *   account_not_found · email_unverified · school_full · already_ambassador · not_ambassador
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { AmbassadorError } from '../../shared/ambassadors';
import { seedSchoolByKey } from '../../shared/schools';
import { designateAmbassador, revokeAmbassador } from './ambassadors';

export const WEBHOOK_MAX_SKEW_MS = 5 * 60 * 1000;
export const APPLY_SOURCE = 'edlight-apply' as const;
/** `designatedBy` / `revokedBy` for changes made through Apply; the person is in `reviewerName`. */
export const APPLY_ACTOR = 'edlight-apply';

export type WebhookFailure = 'invalid_signature' | 'stale_request' | 'not_configured';

export function signAmbassadorWebhook(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
}

/** Constant-time over equal-length buffers; a length mismatch is simply a failure. */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8'), y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** null when the request is authentic and fresh, otherwise the failure code. */
export function verifyAmbassadorWebhook(input: {
  secret: string | undefined; timestamp: unknown; signature: unknown; rawBody: string; now: number;
}): WebhookFailure | null {
  const secret = (input.secret || '').trim();
  if (secret.length < 16) return 'not_configured';
  const ts = typeof input.timestamp === 'string' ? input.timestamp.trim() : '';
  const sig = typeof input.signature === 'string' ? input.signature.trim() : '';
  if (!/^\d{9,11}$/.test(ts) || !sig) return 'invalid_signature';
  // Signature first: an attacker must not learn anything about the clock window.
  if (!safeEqual(signAmbassadorWebhook(secret, ts, input.rawBody), sig)) return 'invalid_signature';
  if (Math.abs(input.now - Number(ts) * 1000) > WEBHOOK_MAX_SKEW_MS) return 'stale_request';
  return null;
}

export interface AmbassadorApplicationPayload {
  applicationId: string;
  academyEmail: string;
  school: string;
  schoolKey: string | null;
  decision: 'approve' | 'revoke';
  reviewerName: string | null;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function parseAmbassadorApplication(body: unknown): AmbassadorApplicationPayload {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const applicationId = text(b.applicationId, 128);
  const academyEmail = text(b.academyEmail, 254).toLowerCase();
  const decision = b.decision === 'approve' || b.decision === 'revoke' ? b.decision : null;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(applicationId) || !decision) throw new AmbassadorError('invalid_input');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(academyEmail)) throw new AmbassadorError('invalid_input');
  const schoolKey = text(b.schoolKey, 120) || null;
  // A known Academy school key wins: its canonical name groups with the school board.
  const school = (schoolKey && seedSchoolByKey(schoolKey)?.name) || text(b.school, 120);
  if (decision === 'approve' && school.length < 2) throw new AmbassadorError('invalid_input');
  return { applicationId, academyEmail, school, schoolKey, decision, reviewerName: text(b.reviewerName, 120) || null };
}

type AuthLike = { getUserByEmail(email: string): Promise<{ uid: string; emailVerified?: boolean }> };

/**
 * The Academy account behind the email the applicant gave. It must exist in
 * Firebase Auth with a VERIFIED email (`email_unverified` otherwise: an
 * unverified address proves nobody owns it, so anyone could have registered
 * it), AND have a `users/{uid}` profile (an account that has actually signed in
 * to Academy; designation stores the profile's first name). Apply separately
 * requires this email to be the applicant's own verified Apply sign-in email.
 * A missing account or profile is `account_not_found`.
 */
export async function resolveAcademyAccount(db: Firestore, auth: AuthLike, email: string): Promise<string> {
  let user: { uid: string; emailVerified?: boolean };
  try { user = await auth.getUserByEmail(email); } catch (err: any) {
    if (err?.code === 'auth/user-not-found' || err?.errorInfo?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-email') {
      throw new AmbassadorError('account_not_found');
    }
    throw err;
  }
  if (user.emailVerified !== true) throw new AmbassadorError('email_unverified');
  const profile = await db.doc(`users/${user.uid}`).get();
  if (!profile.exists) throw new AmbassadorError('account_not_found');
  return user.uid;
}

export async function processAmbassadorApplication(db: Firestore, auth: AuthLike, body: unknown, now: number) {
  const p = parseAmbassadorApplication(body);
  const uid = await resolveAcademyAccount(db, auth, p.academyEmail);
  const meta = { source: APPLY_SOURCE, applicationId: p.applicationId, reviewerName: p.reviewerName, ledgerId: `${p.applicationId}_${p.decision}` };
  try {
    return p.decision === 'approve'
      ? await designateAmbassador(db, APPLY_ACTOR, uid, p.school, now, meta)
      : await revokeAmbassador(db, APPLY_ACTOR, uid, now, meta);
  } catch (err) {
    // designateAmbassador re-checks the profile; a vanished one is still "no account".
    if (err instanceof AmbassadorError && err.code === 'not_found') throw new AmbassadorError('account_not_found');
    throw err;
  }
}

export const WEBHOOK_STATUS: Record<string, number> = {
  invalid_signature: 401, stale_request: 401, not_configured: 503, invalid_input: 400,
  account_not_found: 404, not_ambassador: 404, email_unverified: 403, school_full: 409, already_ambassador: 409,
};
