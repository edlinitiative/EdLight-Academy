import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useStore from '../contexts/store';

// ─── Foreground handler ───────────────────────────────────────────────────────
// Controls how notifications appear when the app is in the foreground.
// Call this once at module load (before any component mounts).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const DAILY_REMINDER_KEY = '@edlight:daily_reminder_id';
const NOTIF_ENABLED_KEY = '@edlight:notifications_enabled';

// Bilingual copy — same inline t(fr, ht) house pattern as the screens, but we
// read the language from the store directly since we're outside React.
const t = (fr: string, ht: string) => (useStore.getState().language === 'ht' ? ht : fr);

// ─── User preference (source of truth for the Profile toggle) ───────────────

/**
 * Whether notifications are enabled for this user.
 * - '@edlight:notifications_enabled' unset (null) → enabled by default, as long
 *   as the OS permission is granted (notifications work out of the box).
 * - 'false' → user opted out via the Profile toggle.
 * - 'true'  → user explicitly opted in.
 */
export async function areNotificationsEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(NOTIF_ENABLED_KEY);
    if (val === 'false') return false;
    if (val === 'true') return true;
    // Unset — default to enabled when the OS permission is granted.
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/** Persist the user's notifications preference (Profile toggle). */
export async function setNotificationsEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(NOTIF_ENABLED_KEY, String(value));
}

/**
 * Internal guard used by every notify/schedule function:
 * OS permission granted AND the user has not opted out.
 */
async function canNotify(): Promise<boolean> {
  try {
    const [{ status }, pref] = await Promise.all([
      Notifications.getPermissionsAsync(),
      AsyncStorage.getItem(NOTIF_ENABLED_KEY),
    ]);
    return status === 'granted' && pref !== 'false';
  } catch {
    return false;
  }
}

// ─── Permissions ─────────────────────────────────────────────────────────────

/**
 * Request notification permission and configure Android channels.
 * Returns true when permission is granted (or was already granted).
 * Safe to call multiple times — idempotent.
 */
export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Promise.all([
      Notifications.setNotificationChannelAsync('default', {
        name: 'EdLight Academy',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0857A6',
      }),
      Notifications.setNotificationChannelAsync('reminders', {
        name: "Rappels d'étude",
        importance: Notifications.AndroidImportance.DEFAULT,
        description: 'Rappels quotidiens pour vos révisions',
      }),
      Notifications.setNotificationChannelAsync('achievements', {
        name: 'Succès et badges',
        importance: Notifications.AndroidImportance.HIGH,
        description: 'Notifications pour vos accomplissements',
      }),
    ]);
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  if (status === 'denied') return false; // user explicitly denied — don't ask again

  const { status: requested } = await Notifications.requestPermissionsAsync();
  return requested === 'granted';
}

// ─── Immediate notifications ──────────────────────────────────────────────────

export async function notifyAchievement(_userId: string, achievement: any): Promise<void> {
  if (!(await canNotify())) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: t('Nouveau succès ! 🎉', 'Nouvo siksè ! 🎉'),
      body: t(
        `Tu as gagné le badge « ${achievement.name} » ! ${achievement.icon || ''}`,
        `Ou genyen badj « ${achievement.name} » ! ${achievement.icon || ''}`,
      ).trim(),
      sound: true,
      data: { type: 'achievement', badgeId: achievement.badgeId },
      ...(Platform.OS === 'android' ? { channelId: 'achievements' } : {}),
    },
    trigger: null,
  });
}

export async function notifyStreak(_userId: string, streakDays: number): Promise<void> {
  if (!(await canNotify())) return;

  const messages: Record<number, string> = {
    7: t("🔥 Incroyable ! Tu as une série de 7 jours d'étude !", '🔥 Enkwayab ! Ou gen yon seri 7 jou etid !'),
    30: t('⚡ Légendaire ! 30 jours de révision consécutifs !', '⚡ Lejandè ! 30 jou revizyon youn apre lòt !'),
    100: t('👑 Héros ! 100 jours de série atteints !', '👑 Ewo ! Ou rive nan yon seri 100 jou !'),
  };
  const body = messages[streakDays]
    ?? t(`🔥 Tu es sur une série de ${streakDays} jours !`, `🔥 Ou sou yon seri ${streakDays} jou !`);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: t('Série en cours ! 🔥', 'Seri ou an mach ! 🔥'),
      body,
      sound: true,
      data: { type: 'streak', streakDays },
      ...(Platform.OS === 'android' ? { channelId: 'achievements' } : {}),
    },
    trigger: null,
  });
}

// ─── Scheduled reminders ──────────────────────────────────────────────────────

/**
 * Cancel the current daily study reminder (if any) and schedule a new one.
 * Persists the notification ID so it can be cancelled later.
 */
export async function scheduleDailyStudyReminder(hour = 18, minute = 0): Promise<void> {
  if (!(await canNotify())) return;

  await cancelDailyStudyReminder();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: t("C'est l'heure de réviser ! 📚", 'Li lè pou revize ! 📚'),
      body: t(
        'Continuez vos révisions et gardez votre série active.',
        'Kontinye revizyon ou yo epi kenbe seri ou aktif.',
      ),
      sound: true,
      data: { type: 'study-reminder' },
      ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    } as any,
  });

  await AsyncStorage.setItem(DAILY_REMINDER_KEY, id);
}

/** Cancel the persisted daily study reminder. */
export async function cancelDailyStudyReminder(): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(DAILY_REMINDER_KEY);
    if (existing) {
      await Notifications.cancelScheduledNotificationAsync(existing);
      await AsyncStorage.removeItem(DAILY_REMINDER_KEY);
    }
  } catch {
    // best-effort
  }
}

/**
 * Schedule a one-time trivia reminder for the next day at 10:00 AM.
 * Re-scheduling is idempotent — we cancel the previous one first.
 */
export async function scheduleTriviaReminder(): Promise<void> {
  if (!(await canNotify())) return;

  // Cancel existing trivia reminders to avoid duplicates
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if ((n.content.data as any)?.type === 'trivia-reminder') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: t('Quiz du jour disponible ! 🎯', 'Quiz jodi a disponib ! 🎯'),
      body: t(
        'Testez vos connaissances et grimpez dans le classement.',
        'Teste konesans ou epi monte nan klasman an.',
      ),
      sound: true,
      data: { type: 'trivia-reminder' },
      ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: tomorrow,
    } as any,
  });
}

/** Notify that the user has moved up on the leaderboard (best-effort). */
export async function notifyLeaderboardRank(rank: number): Promise<void> {
  if (!(await canNotify())) return;
  if (rank > 10) return; // only notify for top 10

  const icon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏆';
  const top = rank <= 3 ? '3' : '10';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: t(`${icon} Tu es #${rank} du classement !`, `${icon} Ou #${rank} nan klasman an !`),
      body: t(
        `Continue ainsi pour rester dans le top ${top} cette semaine.`,
        `Kontinye konsa pou rete nan top ${top} semèn sa a.`,
      ),
      sound: false,
      data: { type: 'leaderboard' },
      ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
    },
    trigger: null,
  });
}

// ─── Preferences (stub — extend with Firestore later) ────────────────────────

export async function getUserNotificationPreferences(_userId: string) {
  return {
    studyReminders: true,
    achievementNotifications: true,
    weeklyProgress: true,
  };
}
