/**
 * Shared Web Push helper for serverless API routes.
 * ---------------------------------------------------------------------------
 * Wraps the `web-push` library + VAPID configuration and fans a payload out to
 * every device a user has subscribed (stored under
 * `users/{uid}/pushSubscriptions/{id}` by the client). Dead subscriptions
 * (HTTP 404/410 from the push service) are pruned automatically.
 *
 * Required env vars (set in Vercel):
 *   VAPID_PUBLIC_KEY   — base64url public key (also exposed to the client)
 *   VAPID_PRIVATE_KEY  — base64url private key (server only — keep secret)
 *   VAPID_SUBJECT      — a mailto: or https: contact URL (optional, sensible default)
 */
import webpush, { type PushSubscription, type SendResult } from 'web-push';
import { getDb } from './firebaseAdmin';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contact@edlightacademy.com';

let configured = false;

/** True when both VAPID keys are present (server push is usable). */
export function isPushConfigured(): boolean {
  return !!VAPID_PUBLIC_KEY && !!VAPID_PRIVATE_KEY;
}

function ensureConfigured(): void {
  if (configured) return;
  if (!isPushConfigured()) {
    throw new Error('Web Push is not configured: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
}

export interface NotificationPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string; icon?: string }>;
  data?: Record<string, unknown>;
}

export interface UserPushResult {
  userId: string;
  sent: number;
  failed: number;
  pruned: number;
  total: number;
}

/**
 * Send a notification to all of a user's subscribed devices.
 * Resolves to per-user counts; never rejects on individual delivery failures.
 */
export async function sendPushToUser(
  userId: string,
  payload: NotificationPayload,
): Promise<UserPushResult> {
  ensureConfigured();

  const db = getDb();
  const subsSnap = await db.collection('users').doc(userId).collection('pushSubscriptions').get();

  const result: UserPushResult = {
    userId,
    sent: 0,
    failed: 0,
    pruned: 0,
    total: subsSnap.size,
  };
  if (subsSnap.empty) return result;

  const body = buildPayloadBody(payload);
  await Promise.all(subsSnap.docs.map((docSnap) => deliverToSubscriptionDoc(docSnap, body, result, userId)));
  return result;
}

export interface BroadcastResult {
  /** Distinct users that had at least one subscription. */
  users: number;
  /** Total subscription documents processed. */
  devices: number;
  sent: number;
  failed: number;
  pruned: number;
  /** True if more subscriptions exist than the cap processed this run. */
  truncated: boolean;
}

/**
 * Broadcast a notification to EVERY subscribed device across all users.
 *
 * Scans the `pushSubscriptions` collection group ONCE (no per-user re-reads)
 * and delivers directly to each subscription, pruning dead ones. Intended for
 * admin announcements; delivery is capped per run to stay within the function
 * time budget — `truncated` signals when a follow-up run is needed.
 */
export async function sendPushToAllUsers(
  payload: NotificationPayload,
  options: { maxDevices?: number } = {},
): Promise<BroadcastResult> {
  ensureConfigured();

  const maxDevices = Math.max(1, Math.min(options.maxDevices ?? 5000, 20000));
  const db = getDb();

  // Read one extra to detect truncation.
  const snap = await db.collectionGroup('pushSubscriptions').limit(maxDevices + 1).get();
  const docs = snap.docs.slice(0, maxDevices);
  const truncated = snap.size > maxDevices;

  const body = buildPayloadBody(payload);
  const counters = { sent: 0, failed: 0, pruned: 0 };
  const userIds = new Set<string>();

  // Bounded concurrency so a large audience doesn't open thousands of sockets.
  const CONCURRENCY = 25;
  for (let i = 0; i < docs.length; i += CONCURRENCY) {
    const batch = docs.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map((docSnap) => {
        const uid = docSnap.ref.parent.parent?.id;
        if (uid) userIds.add(uid);
        return deliverToSubscriptionDoc(docSnap, body, counters, uid || 'broadcast');
      }),
    );
  }

  return {
    users: userIds.size,
    devices: docs.length,
    sent: counters.sent,
    failed: counters.failed,
    pruned: counters.pruned,
    truncated,
  };
}

/** Serialize a payload into the JSON string the service worker `push` handler expects. */
function buildPayloadBody(payload: NotificationPayload): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body || '',
    url: payload.url || '/',
    tag: payload.tag,
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    requireInteraction: !!payload.requireInteraction,
    actions: payload.actions || [],
    data: payload.data || {},
  });
}

/**
 * Deliver one prepared body to a single subscription document, updating the
 * provided counters in place and pruning malformed/dead subscriptions.
 * Never throws — individual failures are absorbed into the counters.
 */
async function deliverToSubscriptionDoc(
  docSnap: FirebaseFirestore.QueryDocumentSnapshot,
  body: string,
  counters: { sent: number; failed: number; pruned: number },
  label: string,
): Promise<void> {
  const data = docSnap.data() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  if (!data.endpoint || !data.keys?.p256dh || !data.keys?.auth) {
    await docSnap.ref.delete().catch(() => {});
    counters.pruned += 1;
    return;
  }

  const subscription: PushSubscription = {
    endpoint: data.endpoint,
    keys: { p256dh: data.keys.p256dh, auth: data.keys.auth },
  };

  try {
    const sendResult: SendResult = await webpush.sendNotification(subscription, body, {
      TTL: 60 * 60 * 24, // keep for a day if the device is offline
      urgency: 'normal',
    });
    if (sendResult.statusCode >= 200 && sendResult.statusCode < 300) {
      counters.sent += 1;
    } else {
      counters.failed += 1;
    }
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    // 404 Not Found / 410 Gone => the subscription is permanently dead.
    if (statusCode === 404 || statusCode === 410) {
      await docSnap.ref.delete().catch(() => {});
      counters.pruned += 1;
    } else {
      counters.failed += 1;
      console.warn(`[push] delivery failed for ${label} (${statusCode ?? 'no-status'})`);
    }
  }
}
