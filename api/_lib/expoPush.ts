/**
 * api/_lib/expoPush.ts — Expo push sender for the NATIVE mobile app.
 * ---------------------------------------------------------------------------
 * The mobile app registers Expo push tokens into `users/{uid}.expoPushTokens`
 * (an array — one entry per device; see mobile/src/services/pushService.ts).
 * Until now nothing server-side ever sent to them — push.ts covers only WEB
 * push (VAPID subscriptions from the PWA). This is the Expo counterpart.
 *
 * Plain HTTPS calls to the Expo Push API (no SDK dependency), chunked at the
 * API's 100-message limit. Tokens Expo reports as `DeviceNotRegistered` are
 * pruned from the user's array so dead devices don't accumulate.
 *
 * Needs no credentials: the Expo push endpoint authenticates by token
 * possession. Firestore admin must be configured (token reads + pruning).
 */
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './firebaseAdmin';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

export interface ExpoPushMessage {
  title: string;
  body: string;
  /** Routed by the app's notification-tap handler (App.tsx) — e.g. { screen: 'Trivia', daily: true }. */
  data?: Record<string, unknown>;
}

export interface ExpoPushResult {
  sent: number;
  pruned: number;
  failed: number;
}

const isExpoToken = (t: unknown): t is string =>
  typeof t === 'string' && /^(ExponentPushToken|ExpoPushToken)\[.+\]$/.test(t);

/**
 * Send one message to every Expo device a user has registered.
 * Never rejects on delivery problems — returns counts.
 */
export async function sendExpoPushToUser(
  uid: string,
  message: ExpoPushMessage,
): Promise<ExpoPushResult> {
  const db = getDb();
  const snap = await db.collection('users').doc(uid).get();
  const tokens = ((snap.data()?.expoPushTokens as unknown[]) || []).filter(isExpoToken);
  const result: ExpoPushResult = { sent: 0, pruned: 0, failed: 0 };
  if (!tokens.length) return result;

  for (let i = 0; i < tokens.length; i += CHUNK) {
    const batch = tokens.slice(i, i + CHUNK);
    let tickets: Array<{ status: string; details?: { error?: string } }> = [];
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          batch.map((to) => ({ to, title: message.title, body: message.body, sound: 'default', data: message.data ?? {} })),
        ),
      });
      const json = (await res.json()) as { data?: typeof tickets };
      tickets = json.data ?? [];
    } catch (err) {
      console.warn(`[expoPush] send failed for ${uid}:`, err);
      result.failed += batch.length;
      continue;
    }

    for (let j = 0; j < batch.length; j += 1) {
      const ticket = tickets[j];
      if (!ticket) {
        result.failed += 1;
      } else if (ticket.status === 'ok') {
        result.sent += 1;
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        result.pruned += 1;
        // Best-effort prune — a dead token must never fail the run.
        await snap.ref
          .set({ expoPushTokens: FieldValue.arrayRemove(batch[j]) }, { merge: true })
          .catch(() => {});
      } else {
        result.failed += 1;
      }
    }
  }
  return result;
}
