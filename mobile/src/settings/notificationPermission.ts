/**
 * Notification permission decisions — PURE (audit #9).
 *
 * The rule: the OS dialog is shown at most ONCE in the app's life, and only
 * after the student chose something that needs it (a study reminder, following
 * an Arena event, or the Profile switch) AND said yes to our own short
 * explanation first. After a denial we never ask the OS again; we point to the
 * system settings instead.
 */

export type NotificationAskReason = 'study-reminder' | 'arena-event' | 'profile';

/** What expo-notifications getPermissionsAsync() tells us (subset). */
export interface OsPermission {
  status: 'granted' | 'denied' | 'undetermined' | string;
  canAskAgain?: boolean;
}

/**
 * - 'granted'   nothing to ask
 * - 'preprompt' explain first; the OS dialog follows only on "Activer"
 * - 'settings'  the OS will not (or must not) ask again — offer "Ouvrir les réglages"
 */
export type PermissionAction = 'granted' | 'preprompt' | 'settings';

export function decidePermissionAction(os: OsPermission, opts: { osPromptShown: boolean }): PermissionAction {
  if (os.status === 'granted') return 'granted';
  if (os.status === 'denied') return 'settings';
  if (os.canAskAgain === false) return 'settings';
  // Android 13+ reports 'undetermined'-like states after one denial with
  // canAskAgain still true; our own flag is what guarantees "never re-prompt".
  if (opts.osPromptShown) return 'settings';
  return 'preprompt';
}

/** Outcome of askForNotifications — see services/notificationService. */
export type NotificationAskResult =
  /** permission is granted (now or already) */
  | 'granted'
  /** the student chose "Pas maintenant" on our explanation; the OS was not asked */
  | 'declined'
  /** the student saw the OS dialog and refused */
  | 'denied'
  /** permission was already refused; the settings path was offered (and maybe opened) */
  | 'blocked';

export interface PrePromptCopy {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
}

/** Short, reason-specific explanation shown BEFORE the OS dialog (or the settings path). */
export function prePromptCopy(
  reason: NotificationAskReason,
  mode: 'ask' | 'settings',
  isCreole: boolean,
): PrePromptCopy {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  if (mode === 'settings') {
    return {
      title: t('Notifications désactivées', 'Notifikasyon yo dezaktive'),
      body: t(
        'Elles sont coupées dans les réglages de ton téléphone. Pour les recevoir, active-les pour EdLight dans les réglages.',
        'Yo fèmen nan paramèt telefòn ou. Pou w resevwa yo, aktive yo pou EdLight nan paramèt yo.',
      ),
      confirm: t('Ouvrir les réglages', 'Louvri paramèt yo'),
      cancel: t('Plus tard', 'Pita'),
    };
  }
  const body: Record<NotificationAskReason, string> = {
    'study-reminder': t(
      'Un seul rappel par jour, à l’heure que tu as choisie, pour garder ton rythme de révision.',
      'Yon sèl rapèl pa jou, a lè ou chwazi a, pou kenbe ritm revizyon ou.',
    ),
    'arena-event': t(
      'On te prévient quand l’Arène ouvre et quand ton école joue, pour ne pas rater le départ.',
      'N ap avèti w lè Arèn nan louvri ak lè lekòl ou ap jwe, pou w pa rate kòmansman an.',
    ),
    profile: t(
      'Rappels d’étude, défi du jour et résultats de ton école. Tu peux les couper à tout moment dans ton profil.',
      'Rapèl etid, defi jodi a ak rezilta lekòl ou. Ou ka fèmen yo nenpòt ki lè nan pwofil ou.',
    ),
  };
  return {
    title: t('Activer les notifications ?', 'Aktive notifikasyon yo ?'),
    body: body[reason],
    confirm: t('Activer', 'Aktive'),
    cancel: t('Pas maintenant', 'Pa kounye a'),
  };
}

/** Study reminder times offered in the plan (24h clock). */
export const STUDY_REMINDER_HOURS = [6, 12, 17, 19] as const;

export function formatHour(hour: number, isCreole: boolean): string {
  const h = Math.max(0, Math.min(23, Math.round(hour)));
  return isCreole ? `${h}è` : `${h}h`;
}

/**
 * Parse the stored study-reminder setting.
 * null/garbage → undefined (never chosen: the engagement bundle keeps its 18h default);
 * 'off' → null (explicitly off); '7' → 7.
 */
export function parseStudyReminder(raw: string | null | undefined): number | null | undefined {
  if (raw == null) return undefined;
  if (raw === 'off') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : undefined;
}
