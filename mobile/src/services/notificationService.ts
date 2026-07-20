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
        lightColor: '#1B6FE0',
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

// ─── Engagement reminder bundle ───────────────────────────────────────────────
// A recurring set of re-engagement nudges to bring students back, centred on the
// daily quiz/défi and the weekly leaderboard. Copy rotates by weekday so the
// notifications never feel repetitive.

const android = (channelId: string) =>
  Platform.OS === 'android' ? ({ channelId } as const) : ({} as const);

/** Data.type values owned by the engagement bundle — cleared before rescheduling. */
const ENGAGEMENT_TYPES = new Set(['study-reminder', 'daily-quiz', 'leaderboard', 'trivia-reminder']);

/** A rotating daily-quiz message for each weekday (expo weekday: 1=Sun … 7=Sat). */
function quizCopyForWeekday(weekday: number): { title: string; body: string } {
  const copy: Array<{ title: string; body: string }> = [
    { // 1 · Sunday
      title: t('🎯 Quiz du dimanche', '🎯 Quiz dimanch'),
      body: t('Commence la journée avec le défi du jour. +50 XP !', 'Kòmanse jounen an ak defi jodi a. +50 XP !'),
    },
    { // 2 · Monday
      title: t('🚀 Nouvelle semaine, nouveau défi !', '🚀 Nouvo semèn, nouvo defi !'),
      body: t('Attaque le quiz du jour et prends de l’avance.', 'Atake quiz jodi a epi pran devan.'),
    },
    { // 3 · Tuesday
      title: t('🧠 Prêt pour le défi du jour ?', '🧠 Ou pare pou defi jodi a ?'),
      body: t('Teste tes connaissances en 2 minutes.', 'Teste konesans ou nan 2 minit.'),
    },
    { // 4 · Wednesday
      title: t('🔥 Garde ta série !', '🔥 Kenbe seri ou !'),
      body: t('Un quiz rapide aujourd’hui pour ne pas la perdre.', 'Yon quiz rapid jodi a pou ou pa pèdi l.'),
    },
    { // 5 · Thursday
      title: t('⚡ +50 XP t’attendent', '⚡ +50 XP ap tann ou'),
      body: t('Fais le défi du jour et grimpe dans le classement.', 'Fè defi jodi a epi monte nan klasman an.'),
    },
    { // 6 · Friday
      title: t('🎉 Quiz du vendredi !', '🎉 Quiz vandredi !'),
      body: t('Termine la semaine en tête. Joue maintenant.', 'Fini semèn nan an tèt. Jwe kounye a.'),
    },
    { // 7 · Saturday
      title: t('🎯 Le défi du jour est prêt', '🎯 Defi jodi a pare'),
      body: t('Quelques questions pour rester au top ce week-end.', 'Kèk kesyon pou rete an tèt wikenn sa a.'),
    },
  ];
  return copy[(weekday - 1) % 7];
}

/** Cancel every reminder owned by the engagement bundle. */
export async function cancelEngagementReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => ENGAGEMENT_TYPES.has((n.content.data as any)?.type))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
    await AsyncStorage.removeItem(DAILY_REMINDER_KEY);
  } catch {
    // best-effort
  }
}

/**
 * Schedule the full recurring re-engagement set. Idempotent — cancels the
 * previous bundle first, so it's safe to call on sign-in, on toggling
 * notifications on, and on a language change (to refresh the copy).
 *
 * Cadence (kept deliberately light to avoid notification fatigue):
 *   • Daily quiz/défi nudge — 10:00, copy rotates by weekday → Jeux (daily-quiz)
 *   • Daily study reminder — 18:00 → Cours (study-reminder)
 *   • Weekly leaderboard kickoff — Monday 09:00 → Jeux (leaderboard)
 *   • Weekly last-chance — Sunday 19:00 → Jeux (leaderboard)
 */
export async function scheduleEngagementReminders(): Promise<void> {
  if (!(await canNotify())) return;
  await cancelEngagementReminders();

  const WEEKLY = Notifications.SchedulableTriggerInputTypes.WEEKLY;
  const DAILY = Notifications.SchedulableTriggerInputTypes.DAILY;

  // 1 · Daily quiz/défi — one weekly trigger per day so the copy can rotate.
  for (let weekday = 1; weekday <= 7; weekday++) {
    const c = quizCopyForWeekday(weekday);
    await Notifications.scheduleNotificationAsync({
      content: { title: c.title, body: c.body, sound: true, data: { type: 'daily-quiz' }, ...android('reminders') },
      trigger: { type: WEEKLY, weekday, hour: 10, minute: 0 } as any,
    });
  }

  // 2 · Daily study reminder — evening.
  const studyId = await Notifications.scheduleNotificationAsync({
    content: {
      title: t("C'est l'heure de réviser ! 📚", 'Li lè pou revize ! 📚'),
      body: t(
        'Continuez vos révisions et gardez votre série active.',
        'Kontinye revizyon ou yo epi kenbe seri ou aktif.',
      ),
      sound: true,
      data: { type: 'study-reminder' },
      ...android('reminders'),
    },
    trigger: { type: DAILY, hour: 18, minute: 0 } as any,
  });
  await AsyncStorage.setItem(DAILY_REMINDER_KEY, studyId);

  // 3 · Weekly leaderboard hooks — Monday kickoff + Sunday last-chance.
  await Notifications.scheduleNotificationAsync({
    content: {
      title: t('Nouveau classement ! 🏆', 'Nouvo klasman ! 🏆'),
      body: t(
        'Nouvelle semaine, nouvelle chance de grimper. Joue un quiz !',
        'Nouvo semèn, nouvo chans pou monte. Jwe yon quiz !',
      ),
      sound: true,
      data: { type: 'leaderboard' },
      ...android('reminders'),
    },
    trigger: { type: WEEKLY, weekday: 2, hour: 9, minute: 0 } as any,
  });
  await Notifications.scheduleNotificationAsync({
    content: {
      title: t('Dernière chance ! ⏰', 'Dènye chans ! ⏰'),
      body: t(
        'Le classement se termine ce soir. Gagne des points maintenant !',
        'Klasman an fini aswè a. Genyen pwen kounye a !',
      ),
      sound: true,
      data: { type: 'leaderboard' },
      ...android('reminders'),
    },
    trigger: { type: WEEKLY, weekday: 1, hour: 19, minute: 0 } as any,
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
