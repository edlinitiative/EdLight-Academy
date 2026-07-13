/**
 * Firestore-backed sliding-window rate limiter for AI endpoints.
 *
 * Documents live in `_rateLimits/{uid}_{endpoint}`.  The collection name starts
 * with `_` so Firestore security rules can deny all client-side access.
 *
 * Design:
 *  - One document per (user, endpoint) — keyed by uid + endpoint name.
 *  - The document stores a `windowStart` timestamp and a hit `count`.
 *  - When a new window begins the document is overwritten from scratch.
 *  - Uses `FieldValue.increment()` for the hot path so concurrent requests
 *    are handled atomically without a transaction.
 *  - Fails open: if Firestore is unreachable the request is allowed through.
 */

import { getDb, isAdminConfigured } from './firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

interface Limit { max: number; windowSec: number }

const LIMITS: Record<string, Limit> = {
  'grade-essay':    { max: 20, windowSec: 3600 },
  'grade-scaffold': { max: 30, windowSec: 3600 },
  'generate-plan':  { max: 5,  windowSec: 3600 },
  'generate-quiz':  { max: 10, windowSec: 3600 },
  'chat':           { max: 30, windowSec: 3600 },
  'email-plan':     { max: 3,  windowSec: 86400 },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms when the window resets
}

export async function checkRateLimit(
  uid: string,
  endpoint: string,
): Promise<RateLimitResult> {
  // Skip if Firebase Admin is not configured (local dev without service account)
  if (!isAdminConfigured()) return { allowed: true, remaining: 999, resetAt: 0 };

  const limit = LIMITS[endpoint];
  if (!limit) return { allowed: true, remaining: 999, resetAt: 0 };

  const now = Date.now();
  const windowMs = limit.windowSec * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;

  try {
    const db = getDb();
    const ref = db.collection('_rateLimits').doc(`${uid}_${endpoint}`);
    const snap = await ref.get();
    const data = snap.data();

    if (!data || data.windowStart !== windowStart) {
      // First hit in this window — write the document
      await ref.set({
        uid,
        endpoint,
        count: 1,
        windowStart,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { allowed: true, remaining: limit.max - 1, resetAt };
    }

    if (data.count >= limit.max) {
      return { allowed: false, remaining: 0, resetAt };
    }

    // Increment atomically
    await ref.update({
      count: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { allowed: true, remaining: limit.max - (data.count + 1), resetAt };
  } catch (err) {
    // Fail open — a broken rate limiter is better than a broken feature
    console.warn('[rateLimit] Firestore error, allowing request:', err);
    return { allowed: true, remaining: 999, resetAt: 0 };
  }
}
