import * as Notifications from 'expo-notifications';
import { Platform, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useStore from '../contexts/store';
import {
  decidePermissionAction, prePromptCopy, parseStudyReminder,
  type NotificationAskReason, type NotificationAskResult, type PermissionAction,
} from '../settings/notificationPermission';
import { hasPromptHost, showPrePrompt } from '../settings/notificationPrompt';
import { registerForPushNotifications } from './pushService';

export type { NotificationAskReason, NotificationAskResult } from '../settings/notificationPermission';

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
/** Set the moment the OS dialog is shown — it is never shown a second time. */
const OS_PROMPT_SHOWN_KEY = '@edlight:notif_os_prompt_shown';
/** The student's chosen study-reminder hour ('7', '19', …) or 'off'. */
const STUDY_REMINDER_KEY = '@edlight:study_reminder_hour';

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

/** Android channels must exist before scheduling (and before the Android 13 dialog). */
async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
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
  } catch {
    // best-effort
  }
}

async function osPromptShown(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(OS_PROMPT_SHOWN_KEY)) === '1'; } catch { return false; }
}

/**
 * Where the permission stands, as the UI should treat it:
 * 'granted' | 'preprompt' (can still be asked, with our explanation first) |
 * 'settings' (refused — only the system settings can change it).
 */
export async function getNotificationPermissionAction(): Promise<PermissionAction> {
  try {
    const os = await Notifications.getPermissionsAsync();
    return decidePermissionAction(
      { status: os.status, canAskAgain: (os as any).canAskAgain },
      { osPromptShown: await osPromptShown() },
    );
  } catch {
    return 'settings';
  }
}

/**
 * NON-PROMPTING since 2026-10-17 (audit #9). Ensures channels and reports
 * whether permission is already granted; it no longer opens the OS dialog,
 * so the legacy call in App.tsx's auth listener can never surprise a student
 * at sign-in. To ask, use `askForNotifications(reason)`.
 * @deprecated use getNotificationPermissionAction() / askForNotifications().
 */
export async function requestPermissions(): Promise<boolean> {
  await ensureChannels();
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/** Open this app's page in the system settings (iOS + Android). */
export async function openNotificationSettings(): Promise<void> {
  try { await Linking.openSettings(); } catch { /* nothing else to try */ }
}

async function confirmWithStudent(reason: NotificationAskReason, mode: 'ask' | 'settings'): Promise<boolean> {
  if (hasPromptHost()) return showPrePrompt(reason, mode);
  // No sheet mounted (e.g. very early in launch) — a native alert carries the same copy.
  const copy = prePromptCopy(reason, mode, useStore.getState().language === 'ht');
  return new Promise((resolve) => {
    Alert.alert(copy.title, copy.body, [
      { text: copy.cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: copy.confirm, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/**
 * THE way to ask for notification permission — call it only from a choice the
 * student just made (audit #9):
 *   - 'study-reminder'  they picked a reminder time (StudyPlanScreen)
 *   - 'arena-event'     they followed an Arena event (Arena screens)
 *   - 'profile'         they switched notifications on in Profile
 *
 * Flow: already granted → 'granted'. Otherwise a short explanation sheet
 * (FR/HT, reason-specific) comes first; the OS dialog is shown only after
 * "Activer", and at most once in the app's life. If permission was refused
 * before, the sheet offers "Ouvrir les réglages" instead and the OS is never
 * re-prompted.
 *
 * On 'granted' the device preference is switched on and this device's push
 * token is registered for the signed-in student. Reminder scheduling stays
 * with the caller (study reminder / Arena alerts / engagement bundle).
 *
 * @param options.offerSettings  default true. Pass false to get 'blocked'
 *   back silently (no sheet) when permission was refused before.
 */
export async function askForNotifications(
  reason: NotificationAskReason,
  options: { offerSettings?: boolean } = {},
): Promise<NotificationAskResult> {
  await ensureChannels();
  const action = await getNotificationPermissionAction();

  if (action === 'granted') {
    await onPermissionGranted();
    return 'granted';
  }

  if (action === 'settings') {
    if (options.offerSettings === false) return 'blocked';
    const open = await confirmWithStudent(reason, 'settings');
    if (open) await openNotificationSettings();
    return 'blocked';
  }

  const yes = await confirmWithStudent(reason, 'ask');
  if (!yes) return 'declined';

  try { await AsyncStorage.setItem(OS_PROMPT_SHOWN_KEY, '1'); } catch { /* still never re-asked this session */ }
  let granted = false;
  try {
    const res = await Notifications.requestPermissionsAsync();
    granted = res.status === 'granted';
  } catch {
    granted = false;
  }
  if (!granted) return 'denied';
  await onPermissionGranted();
  return 'granted';
}

async function onPermissionGranted(): Promise<void> {
  try { await setNotificationsEnabled(true); } catch { /* best-effort */ }
  const uid = useStore.getState().user?.uid;
  if (uid) {
    registerForPushNotifications(uid).catch(() => {});
  }
}

// ─── Study reminder (the student's own choice of time) ──────────────────────

/**
 * The chosen study-reminder hour: a number, null when explicitly off, or
 * undefined when never chosen (the engagement bundle then uses its 18h default).
 */
export async function getStudyReminderHour(): Promise<number | null | undefined> {
  try { return parseStudyReminder(await AsyncStorage.getItem(STUDY_REMINDER_KEY)); } catch { return undefined; }
}

async function cancelStudyReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => (n.content.data as any)?.type === 'study-reminder')
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
    await AsyncStorage.removeItem(DAILY_REMINDER_KEY);
  } catch {
    // best-effort
  }
}

async function scheduleStudyReminderAt(hour: number): Promise<void> {
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: t("C'est l'heure de réviser", 'Li lè pou revize'),
      body: t(
        'Ton plan du jour t’attend. Quelques minutes suffisent pour garder ta série.',
        'Plan jodi a ap tann ou. Kèk minit ase pou kenbe seri ou.',
      ),
      sound: true,
      data: { type: 'study-reminder' },
      ...(Platform.OS === 'android' ? { channelId: 'reminders' } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0 } as any,
  });
  await AsyncStorage.setItem(DAILY_REMINDER_KEY, id);
}

/**
 * Save the student's study-reminder choice and (re)schedule it.
 * `hour` null = off. Asks for permission through askForNotifications when
 * needed; returns that outcome ('granted' when the reminder is now scheduled).
 * The choice is saved even when permission is not granted, so it applies the
 * moment notifications are enabled later.
 */
export async function setStudyReminder(hour: number | null): Promise<NotificationAskResult | 'off'> {
  try { await AsyncStorage.setItem(STUDY_REMINDER_KEY, hour == null ? 'off' : String(hour)); } catch { /* keep going */ }
  await cancelStudyReminders();
  if (hour == null) return 'off';
  const result = await askForNotifications('study-reminder');
  if (result !== 'granted') return result;
  // The student explicitly asked for this reminder — it is an opt-in even if
  // the Profile switch had been off.
  try { await AsyncStorage.setItem(NOTIF_ENABLED_KEY, 'true'); } catch { /* best-effort */ }
  await scheduleStudyReminderAt(hour);
  return 'granted';
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
  const copy: { title: string; body: string }[] = [
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
 *   • Daily quiz/défi nudge — 06:00, copy rotates by weekday → Jeux (daily-quiz)
 *   • Daily study reminder — 18:00 → Cours (study-reminder)
 *   • Weekly leaderboard kickoff — Monday 09:00 → Jeux (leaderboard)
 *   • Weekly last-chance — Sunday 19:00 → Jeux (leaderboard)
 */
export async function scheduleEngagementReminders(): Promise<void> {
  if (!(await canNotify())) return;
  await cancelEngagementReminders();

  const WEEKLY = Notifications.SchedulableTriggerInputTypes.WEEKLY;

  // 1 · Daily quiz/défi — one weekly trigger per day so the copy can rotate.
  //     Fires early (06:00) so students see it first thing, per user request.
  for (let weekday = 1; weekday <= 7; weekday++) {
    const c = quizCopyForWeekday(weekday);
    await Notifications.scheduleNotificationAsync({
      content: { title: c.title, body: c.body, sound: true, data: { type: 'daily-quiz' }, ...android('reminders') },
      trigger: { type: WEEKLY, weekday, hour: 6, minute: 0 } as any,
    });
  }

  // 2 · Daily study reminder — at the student's chosen hour (StudyPlan), 18:00
  //     by default, or not at all when they switched it off.
  const chosen = await getStudyReminderHour();
  if (chosen !== null) {
    await scheduleStudyReminderAt(chosen ?? 18);
  }

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
