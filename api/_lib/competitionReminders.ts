/**
 * Scheduled competition reminders.
 *
 * A server-only queue `competitionReminders/{eventId}_{kind}` holds one row per
 * pending reminder: { eventId, kind, dueAt, targetAt, revision } — never a
 * uid, a score or any message text. Rows are written inside the engine's own
 * transactions: `event-publish` schedules, `event-postpone` reschedules (the
 * row is rewritten with the new times), and cancel / no-contest / close remove
 * them. The per-minute cron (api/tournois/tick GET) sweeps due rows with one
 * single-field `dueAt <=` query (auto-indexed, no composite index).
 *
 * Sending is at most once: one transaction re-reads the row and the event,
 * drops the row when it no longer matches the live schedule (stale) or is too
 * late to be truthful (overdue), and otherwise deletes the row and writes the
 * inbox items together. Recipients are computed then, from the current entries.
 * Pushes go out after the commit through deliverCompetitionNotices, which
 * honors the `competitionUpdates === false` opt-out and the fan-out cap.
 *
 *   start_60             60 min before startsAt   → starters of registered
 *                                                    entries (push); public
 *                                                    event followers (inbox only)
 *   start_10             10 min before startsAt,  → starters of registered
 *                        live format only           entries (push)
 *   registration_closing 24 h (else 2 h) before   → captains + unconfirmed
 *                        registrationClosesAt       starters of draft entries
 *                                                    that may still register (push)
 */
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  deliverCompetitionNotices,
  type CompetitionNotice,
} from './competitionNotify';
import type {
  CompetitionEvent,
  EventEntry,
} from '../../shared/competition/platform';
import type { InboxAction } from '../../shared/competition/notifications';

export type ReminderKind = 'start_60' | 'start_10' | 'registration_closing';
export const REMINDER_KINDS: ReminderKind[] = [
  'start_60',
  'start_10',
  'registration_closing',
];
export const REMINDER_COLLECTION = 'competitionReminders';
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const SWEEP_LIMIT = 25;
/** Who is reminded: the cron acts as no person, so nobody is excluded as the actor. */
const REMINDER_ACTOR = 'system_competition';
/** Bounded so one reminder stays well inside a transaction's write limit. */
const MAX_RECIPIENTS = 400;

export interface ReminderRow {
  eventId: string;
  kind: ReminderKind;
  dueAt: number;
  /** The schedule time this reminder was computed from; a mismatch means stale. */
  targetAt: number;
  revision: number;
}

const ACTION: Record<ReminderKind, InboxAction> = {
  start_60: 'event_starting',
  start_10: 'event_starting_soon',
  registration_closing: 'registration_closing',
};

export const reminderRef = (db: Firestore, eventId: string, kind: ReminderKind) =>
  db.doc(`${REMINDER_COLLECTION}/${eventId}_${kind}`);

const targetOf = (e: CompetitionEvent, kind: ReminderKind) =>
  kind === 'registration_closing' ? e.registrationClosesAt : e.config.startsAt;

/** The latest moment a reminder is still truthful ("in 1 hour" must not arrive with 5 minutes left). */
function lastUsefulAt(row: ReminderRow): number {
  if (row.kind === 'start_60') return row.targetAt - 40 * MINUTE;
  if (row.kind === 'start_10') return row.targetAt - 5 * MINUTE;
  return row.targetAt - 30 * MINUTE;
}

/** The reminders a published event should have right now; only future due times are kept. */
export function reminderPlan(e: CompetitionEvent, now: number): ReminderRow[] {
  if (e.state !== 'published') return [];
  const rows: ReminderRow[] = [];
  const add = (kind: ReminderKind, dueAt: number) =>
    rows.push({
      eventId: e.id,
      kind,
      dueAt,
      targetAt: targetOf(e, kind),
      revision: e.revision,
    });
  const startsAt = e.config.startsAt;
  if (startsAt - HOUR > now) add('start_60', startsAt - HOUR);
  if (e.config.format === 'live' && startsAt - 10 * MINUTE > now)
    add('start_10', startsAt - 10 * MINUTE);
  const closes = e.registrationClosesAt;
  if (closes - 24 * HOUR > now) add('registration_closing', closes - 24 * HOUR);
  else if (closes - 2 * HOUR > now)
    add('registration_closing', closes - 2 * HOUR);
  return rows;
}

/** Write (or rewrite) every reminder row for the event; kinds no longer planned are removed. Writes only. */
export function scheduleReminders(
  tx: Transaction,
  db: Firestore,
  e: CompetitionEvent,
  now: number,
) {
  const plan = reminderPlan(e, now);
  for (const kind of REMINDER_KINDS) {
    const row = plan.find((r) => r.kind === kind);
    if (row) tx.set(reminderRef(db, e.id, kind), row);
    else tx.delete(reminderRef(db, e.id, kind));
  }
}

/** Cancel, no-contest and close: nothing left to remind about. Writes only. */
export function clearReminders(tx: Transaction, db: Firestore, eventId: string) {
  for (const kind of REMINDER_KINDS) tx.delete(reminderRef(db, eventId, kind));
}

type Outcome = 'sent' | 'stale' | 'overdue' | 'gone';

/** One reminder, at most once: the claim (row delete) and the inbox items commit together. */
async function sendReminder(
  db: Firestore,
  rowId: string,
  now: number,
): Promise<{ outcome: Outcome; notices: CompetitionNotice[] }> {
  const ref = db.doc(`${REMINDER_COLLECTION}/${rowId}`);
  let notices: CompetitionNotice[] = [];
  const outcome = await db.runTransaction(async (tx): Promise<Outcome> => {
    notices = [];
    const snap = await tx.get(ref);
    if (!snap.exists) return 'gone';
    const row = snap.data() as ReminderRow;
    const eventSnap = await tx.get(db.doc(`competitionEvents/${row.eventId}`));
    const e = eventSnap.exists ? (eventSnap.data() as CompetitionEvent) : null;
    if (
      !e ||
      e.state !== 'published' ||
      !REMINDER_KINDS.includes(row.kind) ||
      targetOf(e, row.kind) !== row.targetAt
    ) {
      tx.delete(ref);
      return 'stale';
    }
    if (now > lastUsefulAt(row)) {
      tx.delete(ref);
      return 'overdue';
    }
    const entries = (
      await tx.get(db.collection(`competitionEvents/${e.id}/entries`))
    ).docs.map((d) => d.data() as EventEntry);
    const action = ACTION[row.kind];
    // uid → inbox key; starters first so a follower who also plays gets the entry record.
    const pushTo = new Map<string, string>();
    const inboxOnly = new Map<string, string>();
    if (row.kind === 'registration_closing') {
      const cap =
        e.entryMode === 'named_team'
          ? Math.min(50, Math.floor(e.config.maxPlayers / 3))
          : e.config.maxPlayers;
      if (e.entryCount < cap)
        for (const entry of entries) {
          if (entry.state !== 'draft') continue;
          // Approval/invitation events: only entries the host already approved can still finish.
          if (e.entryPolicy !== 'open') {
            const approval = await tx.get(
              db.doc(`competitionEvents/${e.id}/approvals/${entry.id}`),
            );
            if (approval.data()?.approved !== true) continue;
          }
          const key = `entry_${e.id}_${entry.id}`;
          pushTo.set(entry.captainUid, key);
          for (const member of entry.starters)
            if (!entry.confirmed.includes(member)) pushTo.set(member, key);
        }
    } else {
      for (const entry of entries)
        if (entry.state === 'registered')
          for (const member of entry.starters)
            pushTo.set(member, `entry_${e.id}_${entry.id}`);
      // Followers only on public events: access to a narrower audience can lapse after following.
      if (row.kind === 'start_60' && e.audience === 'public') {
        const followers = await tx.get(
          db.collection(`competitionEvents/${e.id}/followers`).limit(100),
        );
        for (const f of followers.docs)
          if (!pushTo.has(f.id)) inboxOnly.set(f.id, `follow_${e.id}`);
      }
    }
    tx.delete(ref);
    let written = 0;
    const write = (uid: string, key: string, kind: 'entry' | 'event') => {
      if (written++ >= MAX_RECIPIENTS) return false;
      tx.set(db.doc(`users/${uid}/competitionInbox/${key}`), {
        id: key,
        kind,
        targetKind: 'event',
        targetId: e.id,
        action,
        title: e.title,
        read: false,
        updatedAt: now,
      });
      return true;
    };
    for (const [uid, key] of pushTo)
      if (write(uid, key, 'entry'))
        notices.push({
          uid,
          action,
          targetKind: 'event',
          targetId: e.id,
          title: e.title,
        });
    for (const [uid, key] of inboxOnly) write(uid, key, 'event');
    return 'sent';
  });
  return { outcome, notices };
}

/** Send every due reminder once; stale and overdue rows are dropped. Never throws per row. */
export async function sweepReminders(db: Firestore, now: number) {
  const due = await db
    .collection(REMINDER_COLLECTION)
    .where('dueAt', '<=', now)
    .orderBy('dueAt', 'asc')
    .limit(SWEEP_LIMIT)
    .get();
  const counts: Record<Outcome, number> = { sent: 0, stale: 0, overdue: 0, gone: 0 };
  for (const d of due.docs) {
    try {
      const { outcome, notices } = await sendReminder(db, d.id, now);
      counts[outcome] += 1;
      if (notices.length)
        await deliverCompetitionNotices(db, notices, REMINDER_ACTOR).catch(
          () => undefined,
        );
    } catch (error) {
      console.error('[competition] reminder failed', {
        name: error instanceof Error ? error.name : 'Error',
      });
    }
  }
  return { due: due.size, ...counts };
}
