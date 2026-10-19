/**
 * arena/_announce — the automatic championship pushes.
 * ────────────────────────────────────────────────────
 * The empty championship card in the app says "On te prévient dès qu'un
 * championnat est annoncé." Before this module the only way to keep that
 * promise was an admin remembering to call `/api/send-broadcast` by hand. Now
 * the two moments a student needs to hear about are pushed automatically, from
 * the one route that performs them (`api/arena/state.ts`):
 *
 *   · `draft → registration` — the championship is ANNOUNCED: it has a title
 *     and a date and schools can register. Pushed to EVERY user with a device
 *     (Expo token or web-push subscription) who has not opted out.
 *   · `registration → doors` — the DOORS OPEN, ~10 minutes before the first
 *     question. Pushed to the students REGISTERED for this tournament
 *     (`tournaments/{tid}/players`), who are the ones who can still miss it.
 *
 * ── At most once ───────────────────────────────────────────────────────────
 * Each push is CLAIMED before it is sent: a transaction stamps
 * `announcedPushAt` / `doorsPushAt` on the tournament document and refuses if
 * the stamp is already there. A retried request, a double-pressed console
 * button or a re-run can therefore never double-send. The trade-off is
 * deliberate: a function killed mid-fan-out leaves the stamp in place and the
 * rest of the audience un-pushed (at-most-once, never at-least-once). The
 * outcome is written back as `announcedPush` / `doorsPush` so a short run is
 * visible on the document rather than silent.
 *
 * ── Why not `sendPushToAllUsers` ───────────────────────────────────────────
 * The admin broadcast (`api/send-broadcast.ts` → `push.sendPushToAllUsers`)
 * scans `pushSubscriptions` once and delivers WEB push only: it never reaches
 * the native app's Expo tokens and it cannot skip a user who opted out. This
 * module reuses the same two per-user senders the competition notices use
 * (`sendExpoPushToUser`, `sendPushToUser`) so both platforms are reached and
 * the per-user opt-out is honoured.
 *
 * ── Opt-out ────────────────────────────────────────────────────────────────
 * `users/{uid}/settings/notifications.arenaAnnouncements === false` skips the
 * user. Absent means on, like every other server sender.
 *
 * ── Privacy ────────────────────────────────────────────────────────────────
 * The payload carries the tournament id and a fixed path, nothing personal.
 */

import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { sendExpoPushToUser } from '../_lib/expoPush';
import { isPushConfigured, sendPushToUser } from '../_lib/push';

type Row = Record<string, unknown>;

export type ArenaPushKind = 'announced' | 'doors';

/** Where the claim stamp and the outcome live on `tournaments/{tid}`. */
export const PUSH_FIELDS: Record<ArenaPushKind, { claim: string; outcome: string }> = {
  announced: { claim: 'announcedPushAt', outcome: 'announcedPush' },
  doors: { claim: 'doorsPushAt', outcome: 'doorsPush' },
};

/** Hard cap on recipients per run, and the time box the fan-out lives in. */
export const ARENA_PUSH_MAX_RECIPIENTS = 5000;
const CONCURRENCY = 20;
const BUDGET_MS = 25_000;

// ── Copy ────────────────────────────────────────────────────────────────────

const HAITI_TZ = 'America/Port-au-Prince';
const HT_DAYS = ['dimanch', 'lendi', 'madi', 'mèkredi', 'jedi', 'vandredi', 'samdi'];
const HT_MONTHS = [
  'janvye', 'fevriye', 'mas', 'avril', 'me', 'jen',
  'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm',
];
const FR_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const FR_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** Wall-clock parts in Haiti time — the date a student reads is the one on their own clock. */
function haitiParts(ms: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: HAITI_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const year = get('year'), month = get('month'), day = get('day');
  // The weekday from the Haiti calendar date, not from UTC.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { month: month - 1, day, weekday, hour: get('hour') % 24, minute: get('minute') };
}

/** "samedi 25 octobre à 18h" / "samdi 25 oktòb a 18è30" — Haiti time, no year; same hour style as the app's formatHour. */
export function formatArenaDate(ms: number, ht: boolean): string {
  const p = haitiParts(ms);
  const mm = p.minute ? String(p.minute).padStart(2, '0') : '';
  const time = `${p.hour}${ht ? 'è' : 'h'}${mm}`;
  return ht
    ? `${HT_DAYS[p.weekday]} ${p.day} ${HT_MONTHS[p.month]} a ${time}`
    : `${FR_DAYS[p.weekday]} ${p.day} ${FR_MONTHS[p.month]} à ${time}`;
}

/**
 * The push sentence for one kind, one language.
 *
 * The tournament title is the admin's public title (`titleHt` in Kreyòl when
 * one was given). Nothing about the reader is interpolated.
 */
export function arenaPushCopy(
  kind: ArenaPushKind,
  tournament: Row,
  ht: boolean,
  now: number,
): { title: string; body: string } {
  const fr = typeof tournament.title === 'string' && tournament.title ? tournament.title : 'Championnat EdLight';
  const name = ht && typeof tournament.titleHt === 'string' && tournament.titleHt ? tournament.titleHt : fr;
  const startsAt = typeof tournament.startsAt === 'number' ? tournament.startsAt : toMs(tournament.startsAt);

  if (kind === 'announced') {
    const when = startsAt ? ` — ${formatArenaDate(startsAt, ht)}` : '';
    return ht
      ? {
          title: 'Yo anonse yon nouvo chanpyona !',
          body: `${name}${when}. Enskri lekòl ou nan Arèn nan.`,
        }
      : {
          title: 'Un nouveau championnat est annoncé !',
          body: `${name}${when}. Inscris ton école dans l’Arène.`,
        };
  }

  const minutes = startsAt ? Math.round((startsAt - now) / 60_000) : 0;
  if (minutes >= 1) {
    return ht
      ? {
          title: 'Arèn nan louvri pòt li !',
          body: `${name} ap kòmanse nan ${minutes} minit. Antre kounye a pou w pa rate kòmansman an.`,
        }
      : {
          title: 'L’Arène ouvre ses portes !',
          body: `${name} commence dans ${minutes} minute${minutes > 1 ? 's' : ''}. Entre maintenant pour ne pas rater le départ.`,
        };
  }
  return ht
    ? { title: 'Arèn nan louvri pòt li !', body: `${name} ap kòmanse kounye a. Antre nan Arèn nan.` }
    : { title: 'L’Arène ouvre ses portes !', body: `${name} commence maintenant. Entre dans l’Arène.` };
}

function toMs(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function')
    return (v as { toMillis: () => number }).toMillis();
  return null;
}

// ── Claim ───────────────────────────────────────────────────────────────────

/**
 * Stamp the claim for `kind`, inside a transaction. Returns the tournament
 * document when THIS caller won the claim, null when it was already claimed
 * (or the tournament is gone). Only the winner may send.
 */
export async function claimArenaPush(
  db: Firestore,
  tid: string,
  kind: ArenaPushKind,
  now: number,
): Promise<Row | null> {
  const ref = db.doc(`tournaments/${tid}`);
  const field = PUSH_FIELDS[kind].claim;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = (snap.data() ?? {}) as Row;
    if (data[field] != null) return null;
    tx.update(ref, { [field]: Timestamp.fromMillis(now) });
    return data;
  });
}

// ── Audience ────────────────────────────────────────────────────────────────

/**
 * Every user that has at least one device: an Expo token on the user document
 * or a web-push subscription. Users with neither cannot be pushed and are not
 * read any further.
 */
async function everyoneWithADevice(db: Firestore): Promise<string[]> {
  const [users, subs] = await Promise.all([
    db.collection('users').get(),
    db.collectionGroup('pushSubscriptions').get(),
  ]);
  const out = new Set<string>();
  for (const doc of users.docs) {
    const tokens = (doc.data() as Row).expoPushTokens;
    if (Array.isArray(tokens) && tokens.length > 0) out.add(doc.id);
  }
  for (const doc of subs.docs) {
    // users/{uid}/pushSubscriptions/{id}
    const segments = doc.ref.path.split('/');
    if (segments[0] === 'users' && segments[1]) out.add(segments[1]);
  }
  return [...out];
}

/** The students registered for this tournament. */
async function registeredPlayers(db: Firestore, tid: string): Promise<string[]> {
  const snap = await db.collection(`tournaments/${tid}/players`).get();
  return snap.docs.map((d) => d.id);
}

// ── Delivery ────────────────────────────────────────────────────────────────

export interface ArenaPushOutcome {
  kind: ArenaPushKind;
  /** False when another run already claimed this push. */
  claimed: boolean;
  audience: number;
  pushed: number;
  optedOut: number;
  failed: number;
  /** True when the audience exceeded the cap or the time box ran out. */
  truncated: boolean;
}

async function deliver(
  db: Firestore,
  uid: string,
  kind: ArenaPushKind,
  tid: string,
  tournament: Row,
  now: number,
  counters: ArenaPushOutcome,
): Promise<void> {
  const [user, prefs] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`users/${uid}/settings/notifications`).get(),
  ]);
  const settings = (prefs.exists ? prefs.data() ?? {} : {}) as Row;
  if (settings.arenaAnnouncements === false) {
    counters.optedOut += 1;
    return;
  }
  const u = (user.data() ?? {}) as Row;
  const lang = settings.language || (u.prefs as Row | undefined)?.language || u.language;
  const { title, body } = arenaPushCopy(kind, tournament, lang === 'ht', now);
  const data = { type: 'arena', kind, tournamentId: tid, path: '/arena' };
  const [expo, web] = await Promise.all([
    sendExpoPushToUser(uid, { title, body, data }).catch((err) => {
      console.warn('[arena] expo push failed', err?.name ?? 'Error');
      return null;
    }),
    isPushConfigured()
      ? sendPushToUser(uid, { title, body, url: '/arena', tag: `arena-${kind}-${tid}`, data }).catch(
          (err) => {
            console.warn('[arena] web push failed', err?.name ?? 'Error');
            return null;
          },
        )
      : null,
  ]);
  // "Pushed" = at least one of the user's devices accepted the message.
  if ((expo?.sent ?? 0) + (web?.sent ?? 0) > 0) counters.pushed += 1;
}

/**
 * Claim, then push, then record what happened. Never rejects: a failed push
 * must never fail the state transition that triggered it.
 */
export async function announceArena(
  db: Firestore,
  tid: string,
  kind: ArenaPushKind,
  now: number = Date.now(),
): Promise<ArenaPushOutcome> {
  const outcome: ArenaPushOutcome = {
    kind,
    claimed: false,
    audience: 0,
    pushed: 0,
    optedOut: 0,
    failed: 0,
    truncated: false,
  };
  try {
    const tournament = await claimArenaPush(db, tid, kind, now);
    if (!tournament) return outcome;
    outcome.claimed = true;

    const all = kind === 'announced' ? await everyoneWithADevice(db) : await registeredPlayers(db, tid);
    const audience = all.slice(0, ARENA_PUSH_MAX_RECIPIENTS);
    outcome.audience = audience.length;
    outcome.truncated = all.length > audience.length;

    const started = Date.now();
    for (let i = 0; i < audience.length; i += CONCURRENCY) {
      if (Date.now() - started > BUDGET_MS) {
        outcome.truncated = true;
        break;
      }
      await Promise.all(
        audience.slice(i, i + CONCURRENCY).map((uid) =>
          deliver(db, uid, kind, tid, tournament, now, outcome).catch(() => {
            outcome.failed += 1;
          }),
        ),
      );
    }

    await db
      .doc(`tournaments/${tid}`)
      .update({
        [PUSH_FIELDS[kind].outcome]: {
          audience: outcome.audience,
          pushed: outcome.pushed,
          optedOut: outcome.optedOut,
          failed: outcome.failed,
          truncated: outcome.truncated,
        },
      })
      .catch(() => undefined);
  } catch (err) {
    console.error('[arena] announcement failed', (err as Error)?.name ?? 'Error');
  }
  return outcome;
}
