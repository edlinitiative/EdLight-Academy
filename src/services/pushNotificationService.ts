/**
 * Push / OS notification service.
 * ---------------------------------------------------------------------------
 * Bridges the app to the browser's Notification + Push APIs:
 *   • Feature detection + permission management (request must be user-gesture
 *     initiated to satisfy browser policy).
 *   • showLocalNotification(): raises an OS notification through the service
 *     worker so it appears even when the tab is backgrounded and so clicks are
 *     routed through the SW's `notificationclick` handler.
 *   • Web Push subscription (subscribe / unsubscribe / state). This is INERT
 *     until a VAPID public key is provided via `window.EDLIGHT_PUSH_VAPID_KEY`
 *     (see index.html) and a server-side sender is wired up — so it never errors
 *     in the default configuration, and flips on with no further client work.
 *
 * Subscriptions are stored per-device under `users/{uid}/pushSubscriptions/{id}`
 * so a backend can fan out reminders/announcements when one is added.
 */
import { auth, db } from './firebase';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const VAPID_PUBLIC_KEY: string =
  (typeof window !== 'undefined' && (window as any).EDLIGHT_PUSH_VAPID_KEY) || '';

/** True when the browser can show OS notifications at all. */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** True when the browser supports Web Push (SW + PushManager + Notification). */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** True only when a VAPID key is configured (server push is actually usable). */
export function isWebPushConfigured(): boolean {
  return isPushSupported() && !!VAPID_PUBLIC_KEY;
}

/** Current permission: 'default' | 'granted' | 'denied'. */
export function getPermission(): NotificationPermission {
  return isNotificationSupported() ? Notification.permission : 'denied';
}

/**
 * Ask the user for notification permission. MUST be triggered from a user
 * gesture (e.g. a button click) or browsers will silently reject it.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

async function getReadyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export interface LocalNotificationOptions extends NotificationOptions {
  /** Path to open when the notification is clicked (defaults to '/'). */
  url?: string;
}

/**
 * Show an OS notification. Prefers the service-worker registration (so it works
 * when backgrounded and routes clicks through the SW), falling back to a page
 * Notification. No-ops gracefully when permission isn't granted.
 */
export async function showLocalNotification(
  title: string,
  options: LocalNotificationOptions = {},
): Promise<boolean> {
  if (getPermission() !== 'granted') return false;

  const { url = '/', data, ...rest } = options;
  const opts: NotificationOptions = {
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    lang: 'fr',
    ...rest,
    data: { url, ...(data || {}) },
  };

  const reg = await getReadyRegistration();
  try {
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(title, opts);
      return true;
    }
    // Fallback: ask the controlling worker to display it.
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        payload: { title, ...opts },
      });
      return true;
    }
    // Last resort: a plain page notification (no SW click routing).
     
    new Notification(title, opts);
    return true;
  } catch {
    try {
       
      new Notification(title, opts);
      return true;
    } catch {
      return false;
    }
  }
}

/** Whether this device currently has an active push subscription. */
export async function getPushSubscriptionState(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await getReadyRegistration();
  if (!reg?.pushManager) return false;
  try {
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/**
 * Subscribe this device to Web Push and persist the subscription in Firestore.
 * Returns null (without throwing) when push isn't configured/supported or
 * permission isn't granted, so callers can treat it as a soft capability.
 */
export async function subscribeToPush(userId?: string): Promise<PushSubscription | null> {
  if (!isWebPushConfigured() || getPermission() !== 'granted') return null;

  const reg = await getReadyRegistration();
  if (!reg?.pushManager) return null;

  try {
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }
    if (userId) await saveSubscription(userId, subscription);
    return subscription;
  } catch (error) {
    console.warn('[Push] Subscription failed:', error);
    return null;
  }
}

/** Remove this device's push subscription locally and from Firestore. */
export async function unsubscribeFromPush(userId?: string): Promise<boolean> {
  const reg = await getReadyRegistration();
  if (!reg?.pushManager) return false;
  try {
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return true;
    const id = await endpointId(subscription.endpoint);
    await subscription.unsubscribe().catch(() => {});
    if (userId) {
      await deleteDoc(doc(db, 'users', userId, 'pushSubscriptions', id)).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

async function saveSubscription(userId: string, subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const id = await endpointId(subscription.endpoint);
  await setDoc(
    doc(db, 'users', userId, 'pushSubscriptions', id),
    {
      endpoint: subscription.endpoint,
      keys: json.keys || {},
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Stable, filesystem-safe Firestore doc id derived from the push endpoint. */
async function endpointId(endpoint: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
  } catch {
    // Fallback hash if SubtleCrypto is unavailable (non-secure context).
    let hash = 0;
    for (let i = 0; i < endpoint.length; i += 1) {
      hash = (hash << 5) - hash + endpoint.charCodeAt(i);
      hash |= 0;
    }
    return `ep${Math.abs(hash)}`;
  }
}

/** Convert a base64url VAPID key to the Uint8Array the Push API expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export interface ServerPushResult {
  /** False when the backend reports push/Admin isn't configured (HTTP 501). */
  configured: boolean;
  /** Number of this user's devices the server reached. */
  delivered: number;
}

/**
 * Ask the backend (POST /api/send-push) to deliver a notification to all of
 * THIS user's subscribed devices. Exercises the real server → push path (the
 * one that works when the app is closed). Returns null when the request can't
 * be made (signed out / offline / endpoint missing) so callers can fall back to
 * a local notification.
 */
export async function sendSelfTestPush(
  payload: { title: string; body?: string; url?: string; tag?: string } = {
    title: 'Test EdLight 🔔',
  },
): Promise<ServerPushResult | null> {
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return null;

    const resp = await fetch('/api/send-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        title: payload.title,
        body: payload.body || 'Notification de test depuis le serveur.',
        url: payload.url || '/dashboard',
        tag: payload.tag || 'server-test',
      }),
    });

    if (resp.status === 501) return { configured: false, delivered: 0 };
    if (!resp.ok) return null;

    const data = await resp.json().catch(() => ({}));
    return { configured: true, delivered: Number(data?.sent) || 0 };
  } catch {
    return null;
  }
}

