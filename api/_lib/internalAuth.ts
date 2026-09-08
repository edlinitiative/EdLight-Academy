/**
 * Shared-secret auth for the cross-platform internal endpoints (api/internal/*).
 * ---------------------------------------------------------------------------
 * EdLight runs three separate platforms on three separate Firebase projects:
 * the admissions platform (`edlight-apply`), this Academy (`edlight-academy`)
 * and EdLight Code (`code-490cd`). The admissions platform needs to read a
 * little from here — who the strongest learners are, and whether a candidate is
 * already known to us — to hand out Coursera licences without double-awarding.
 *
 * The chosen shape is a READ-ONLY lookup endpoint guarded by a shared secret,
 * deliberately in preference to handing the admissions platform a service
 * account for this project: Academy keeps sole custody of its own data, and
 * apply never holds a credential that could read (or write) anything here.
 *
 * Rules this module enforces:
 *   • The secret travels in a HEADER, never a query parameter — query strings
 *     land in Vercel's request logs, access logs and browser history.
 *   • Comparison is constant time AND length-blind: both sides are SHA-256'd
 *     first, so neither the secret's bytes nor its length leak through timing.
 *     (api/leaderboard/aggregate-snapshot.ts compares the CRON_SECRET with an
 *     early `length !==` return, which does leak length; digesting avoids it.)
 *   • A missing/blank INTERNAL_LOOKUP_SECRET fails CLOSED, and answers 401 like
 *     any other rejection rather than 503 — an unauthenticated caller must not
 *     be able to tell "not configured" from "wrong secret".
 *   • Rejections carry no reason. Every failure is the same opaque 401.
 *
 * Accepted headers (either one; both carry the same secret):
 *   Authorization: Bearer <INTERNAL_LOOKUP_SECRET>
 *   x-internal-secret: <INTERNAL_LOOKUP_SECRET>
 *
 * The Bearer form is the primary one — it is what the admissions side already
 * anticipates (`ACADEMY_LOOKUP_TOKEN`) and matches this repo's existing cron
 * convention. `x-internal-secret` mirrors the `x-cron-secret` alternative the
 * cron endpoints accept, for callers that cannot set Authorization.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Env var holding the secret. Set the SAME value here and on the caller. */
export const INTERNAL_SECRET_ENV = 'INTERNAL_LOOKUP_SECRET';

/** Refuse a secret short enough to be guessable, even if one is configured. */
const MIN_SECRET_LENGTH = 24;

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Constant-time, length-blind string equality.
 *
 * Hashing first makes both operands exactly 32 bytes, so `timingSafeEqual`
 * never throws on a length mismatch and the comparison itself reveals nothing
 * about how long the presented secret was.
 */
export function secretsMatch(presented: string, expected: string): boolean {
  if (!presented || !expected) return false;
  return timingSafeEqual(digest(presented), digest(expected));
}

/** The presented secret, from either accepted header. '' when absent. */
export function presentedSecret(headers: Record<string, unknown>): string {
  const auth = headers.authorization;
  const bearer = typeof auth === 'string' && /^Bearer\s+/i.test(auth)
    ? auth.replace(/^Bearer\s+/i, '').trim()
    : '';
  if (bearer) return bearer;
  const direct = headers['x-internal-secret'];
  return typeof direct === 'string' ? direct.trim() : '';
}

/**
 * Whether this request carries the configured internal secret.
 *
 * Pure apart from reading the env var, so it is unit-testable without a
 * VercelRequest. Fails closed when the secret is unset or too short.
 */
export function isInternalRequestAuthorized(
  headers: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = (env[INTERNAL_SECRET_ENV] || '').trim();
  if (expected.length < MIN_SECRET_LENGTH) return false;
  return secretsMatch(presentedSecret(headers || {}), expected);
}

/**
 * Gate an internal endpoint. Returns true when the caller may proceed;
 * otherwise it has already sent an opaque 401 and the handler must return.
 *
 * Call this FIRST — before the method check, before touching Firestore — so an
 * unauthenticated caller learns nothing at all, not even which methods exist.
 */
export function requireInternalSecret(req: VercelRequest, res: VercelResponse): boolean {
  // PII crosses this boundary; never let a proxy or browser retain a response.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (isInternalRequestAuthorized(req.headers as Record<string, unknown>)) return true;
  res.status(401).json({ error: 'unauthorized' });
  return false;
}
