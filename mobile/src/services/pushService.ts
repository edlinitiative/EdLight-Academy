import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import useStore from '../contexts/store';

// ─── Expo push token registration ────────────────────────────────────────────
// Remote push only works in a dev/EAS build — Expo Go (SDK 53+) cannot receive
// remote notifications, so we skip silently there. See mobile/PUSH_NOTIFICATIONS.md.

const PUSH_TOKEN_KEY = '@edlight:expo_push_token';

let warnedNoProjectId = false;

/** True when running inside the Expo Go client (no remote push support). */
function isExpoGo(): boolean {
  const ownership = (Constants as any)?.appOwnership;
  const execEnv = (Constants as any)?.executionEnvironment;
  return ownership === 'expo' || execEnv === 'storeClient';
}

function getProjectId(): string | undefined {
  return (
    (Constants as any)?.expoConfig?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId
  );
}

/**
 * Register this device for Expo push notifications and store the token on the
 * Firestore user doc (`expoPushTokens` array — a user can have several devices).
 * Best-effort: returns null and never throws, so it can never break sign-in.
 */
export async function registerForPushNotifications(uid: string): Promise<string | null> {
  try {
    if (!uid || isExpoGo()) return null;

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;

    const projectId = getProjectId();
    if (!projectId) {
      if (!warnedNoProjectId) {
        warnedNoProjectId = true;
        console.warn('[push] No EAS projectId in app config — skipping push registration.');
      }
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return null;

    await updateDoc(doc(db, 'users', uid), {
      expoPushTokens: arrayUnion(token),
      pushTokenUpdatedAt: serverTimestamp(),
      // Lets the send-push script pick the right language per user.
      language: useStore.getState().language,
    });

    // Remember this device's token so we can remove it on logout.
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token).catch(() => {});
    return token;
  } catch (err) {
    console.warn('[push] Registration failed (non-fatal):', err);
    return null;
  }
}

/**
 * Remove this device's push token from the user doc (called before sign-out).
 * Best-effort — never throws.
 */
export async function unregisterPushToken(uid: string): Promise<void> {
  try {
    if (!uid) return;
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return;
    await updateDoc(doc(db, 'users', uid), {
      expoPushTokens: arrayRemove(token),
      pushTokenUpdatedAt: serverTimestamp(),
    });
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {
    // best-effort — never block logout
  }
}
