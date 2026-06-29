import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Nouveau succès ! 🎉',
      body: `Tu as gagné le badge « ${achievement.name} » ! ${achievement.icon || ''}`.trim(),
      sound: true,
      data: { type: 'achievement', badgeId: achievement.badgeId },
      ...(Platform.OS === 'android' ? { channelId: 'achievements' } : {}),
    },
    trigger: null,
  });
}

export async function notifyStreak(_userId: string, streakDays: number): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const messages: Record<number, string> = {
    7: "🔥 Incroyable ! Tu as une série de 7 jours d'étude !",
    30: '⚡ Légendaire ! 30 jours de révision consécutifs !',
    100: '👑 Héros ! 100 jours de série atteints !',
  };
  const body = messages[streakDays] ?? `🔥 Tu es sur une série de ${streakDays} jours !`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Série en cours ! 🔥',
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
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  await cancelDailyStudyReminder();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "C'est l'heure de réviser ! 📚",
      body: 'Continuez vos révisions et gardez votre série active.',
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
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

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
      title: 'Quiz du jour disponible ! 🎯',
      body: 'Testez vos connaissances et grimpez dans le classement.',
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
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  if (rank > 10) return; // only notify for top 10

  const icon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏆';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${icon} Tu es #${rank} du classement !`,
      body: `Continue ainsi pour rester dans le top ${rank <= 3 ? '3' : '10'} cette semaine.`,
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
