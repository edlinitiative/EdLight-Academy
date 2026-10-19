/**
 * Ownerless competitions: what happens when an organizer deletes their account
 * and nobody could inherit the event or league (see competitionAccountDeletion).
 *
 * Nobody is promoted by default — co-host powers include cancelling, check-in
 * and result reporting, so they are never handed to participants. Instead the
 * record is queued in `competitionOrphans/{id}` (server-only) and this sweep
 * finishes it through the ordinary engine actions, run with system authority:
 *
 *   online event        → closed as soon as the engine has final standings
 *   external result     → a reported result is confirmed after the grace
 *                         period; no result at all becomes no-contest
 *   other, past grace   → no-contest (the truthful outcome without a host)
 *   open dispute, league, or anything stuck past the alert age
 *                       → one alert to platform administrators
 *
 * Participants get the same inbox items and pushes as for an organizer's own
 * action. Scores are never edited and registrations are never deleted.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { CompetitionError, mutateCompetition } from './competition';
import { deliverCompetitionNotices } from './competitionNotify';
import type { CompetitionEvent } from '../../shared/competition/platform';

export const SYSTEM_COMPETITION_UID = 'system_competition';
export const ORPHAN_GRACE_MS = 48 * 3600000;
const ALERT_AFTER_MS = 14 * 86400000;
const SWEEP_LIMIT = 20;

type OrphanKind = 'event' | 'league';

export async function markOrphaned(
  db: Firestore,
  kind: OrphanKind,
  targetId: string,
  title: string,
  now: number,
) {
  await db
    .doc(`competitionOrphans/${kind}_${targetId}`)
    .set({ kind, targetId, title, since: now, alertedAt: null });
}

async function system(
  db: Firestore,
  action: string,
  body: Record<string, unknown>,
  now: number,
): Promise<boolean> {
  try {
    await mutateCompetition(
      db,
      SYSTEM_COMPETITION_UID,
      '',
      {
        action,
        operationId: `orphan_${action}_${body.eventId}_${now}`.slice(0, 128),
        ...body,
      },
      now,
      { system: true },
    );
    return true;
  } catch (error) {
    if (!(error instanceof CompetitionError)) throw error;
    console.warn('[competition] orphan step refused', { action, code: error.code });
    return false;
  }
}

/** One inbox item + push per platform administrator; sent once per orphan. */
async function alertAdmins(
  db: Firestore,
  kind: OrphanKind,
  targetId: string,
  title: string,
  now: number,
) {
  const admins = (
    await db.collection('users').where('role', '==', 'admin').limit(10).get()
  ).docs.map((d) => d.id);
  const batch = db.batch();
  for (const uid of admins)
    batch.set(db.doc(`users/${uid}/competitionInbox/orphan_${kind}_${targetId}`), {
      id: `orphan_${kind}_${targetId}`,
      kind,
      targetKind: kind,
      targetId,
      action: 'owner_missing',
      title,
      read: false,
      updatedAt: now,
    });
  await batch.commit();
  await deliverCompetitionNotices(
    db,
    admins.map((uid) => ({
      uid,
      action: 'owner_missing' as const,
      targetKind: kind,
      targetId,
      title,
    })),
    SYSTEM_COMPETITION_UID,
  );
}

/** Returns true when the event no longer needs the sweep. */
async function settleEvent(db: Firestore, e: CompetitionEvent, since: number, now: number) {
  if (e.state === 'closed' || e.state === 'cancelled') return true;
  const disputes = await db
    .collection(`competitionEvents/${e.id}/disputes`)
    .where('state', '==', 'open')
    .limit(1)
    .get();
  if (!disputes.empty) return false;
  const pastGrace = now >= Math.max(since, e.config.startsAt) + ORPHAN_GRACE_MS;
  if (e.tournamentId) {
    const engine = (await db.doc(`userTournaments/${e.tournamentId}`).get()).data();
    if (engine?.state === 'finished' && !engine.standingsDirty)
      return system(db, 'event-close', { eventId: e.id }, now);
    if (engine?.state === 'cancelled') return true;
    return false;
  }
  if (e.delivery === 'external' && e.resultStatus === 'confirmed')
    return system(db, 'event-close', { eventId: e.id }, now);
  if (!pastGrace) return false;
  if (e.delivery === 'external' && e.resultStatus === 'reported') {
    if (!(await system(db, 'event-confirm-result', { eventId: e.id, revision: e.resultRevision }, now)))
      return false;
    return system(db, 'event-close', { eventId: e.id }, now);
  }
  return system(db, 'event-no-contest', { eventId: e.id }, now);
}

/** Finish what can be finished automatically; alert administrators about the rest, once. */
export async function sweepOrphans(db: Firestore, now: number) {
  const queued = await db.collection('competitionOrphans').limit(SWEEP_LIMIT).get();
  let settled = 0;
  for (const d of queued.docs) {
    const o = d.data() as {
      kind: OrphanKind;
      targetId: string;
      title: string;
      since: number;
      alertedAt: number | null;
    };
    try {
      let done = false;
      let needsPerson = o.kind === 'league';
      if (o.kind === 'event') {
        const e = (await db.doc(`competitionEvents/${o.targetId}`).get()).data() as
          | CompetitionEvent
          | undefined;
        done = !e || (await settleEvent(db, e, o.since, now));
        if (!done && e) {
          const open = await db
            .collection(`competitionEvents/${e.id}/disputes`)
            .where('state', '==', 'open')
            .limit(1)
            .get();
          needsPerson = !open.empty || now - o.since >= ALERT_AFTER_MS;
        }
      } else {
        const league = (await db.doc(`leagues/${o.targetId}`).get()).data();
        done = !league || league.state === 'closed';
      }
      if (done) {
        await d.ref.delete();
        settled += 1;
      } else if (needsPerson && !o.alertedAt) {
        await alertAdmins(db, o.kind, o.targetId, o.title, now);
        await d.ref.update({ alertedAt: now });
      }
    } catch (error) {
      console.error('[competition] orphan sweep failed', {
        kind: o.kind,
        name: error instanceof Error ? error.name : 'Error',
      });
    }
  }
  return { queued: queued.size, settled };
}
