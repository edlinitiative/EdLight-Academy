/**
 * Competition records on account deletion (called by api/users/delete.ts
 * BEFORE the users/{uid} tree and the Auth account are removed, because it
 * discovers work through users/{uid}/competitionInbox and myTournaments and
 * reuses engine actions that read the caller's profile and school role).
 *
 * POLICY — the integrity rules win: never edit a raw score, never delete a
 * registration, a locked roster, a result or an audit row. Identity is removed
 * from those instead.
 *
 *  DELETE (personal or pending, no integrity value)
 *    teamInvites sent or received (+ the recipient's inbox item), the user's
 *    team join requests, entryClaims, schoolMemberships, schoolRoles,
 *    competitionMutations receipts, competitionBlocks either way,
 *    event follower index docs (competitionEvents/{e}/followers/{uid}), draft
 *    events the user owns (never published, not a league fixture source) with their
 *    subcollections, draft individual entries (+ their approval), attendance
 *    at events that have not started, teams left with no member and no locked
 *    record, draft leagues with no entrant.
 *
 *  PSEUDONYMIZE (keep the record; uid → tombstone, name → DELETED_ACCOUNT_NAME)
 *    entries (captainUid, starters, confirmed; individual labels), dispute
 *    uid/resolvedBy (dispute `reason` cleared, `redacted: true`), event and
 *    league audit actorUid, rewards reportedBy, approvals approvedBy,
 *    attendance uid/checkedInBy, event ownerUid/hostName, competitionDirectory
 *    hostName, competitionReports uid/reviewerUid, membership/role reviewedBy,
 *    leagueInvites/leagueConsents captainUid, league ownerUid, and the
 *    tournament engine: roster/players/standings/winner names, plus their uid
 *    fields; team-mode records (entry roles/relaySlots/dutiesConfirmed,
 *    teamControl holder/deputy/slots/presence/transfers, teamAnswers uid,
 *    teamAttempts answeredBy/leg owners). Scores, points, ranks and result
 *    rows are copied untouched.
 *
 *  ENGINE KEYS that stay raw: Firestore document ids keyed by uid (individual
 *    entries/{uid}, roster/{uid}, players/{uid}, attempts/{r}_{uid},
 *    answers/{i}_{uid}, attendance kept for started events) — result rows and
 *    the engine address them by id, so moving them would rewrite results. In
 *    bracket tournaments the uid fields stay raw too (matches join on them);
 *    only names are replaced there.
 *
 *  HAND-OVERS
 *    Teams: the user leaves; a captain hands over to the longest-standing
 *    remaining member (members[] is append-only in join order, so index 0).
 *    The last member's team is deleted unless an entry of it was ever locked
 *    or it consented to a league; then it stays as { members: [],
 *    visibility: 'private', inactive: true } under a tombstone captain.
 *    Entries: draft rosters drop the user (a draft the user captained is
 *    withdrawn); a registered individual entry is withdrawn through the
 *    engine's own `entry-withdraw` while registration is open; a registered
 *    team entry the user captained follows the team's new captain. Started
 *    events are only pseudonymized.
 *    Owned published events: a `manage` co-host (lowest uid — the cohost map
 *    keeps no grant order) eligible to host it becomes owner; otherwise an
 *    event that has not started is cancelled through the engine's own
 *    `event-cancel` (registrants get the truthful cancellation, league
 *    fixtures are invalidated), and a started one is left for an admin.
 *    Owned leagues: draft + empty is deleted; otherwise the earliest approved
 *    host of the same school becomes owner, or a finished league is closed
 *    through `league-close`, or the league is left for an admin.
 *
 * Idempotent: every pass selects by the raw uid, which the first run replaces
 * or deletes, so a rerun finds nothing left to change.
 */
import { createHmac, randomBytes } from 'crypto';
import type {
  DocumentData,
  DocumentReference,
  Firestore,
  Query,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import type {
  CompetitionEvent,
  EventEntry,
  League,
  Team,
} from '../../shared/competition/platform';
import { DELETED_ACCOUNT_NAME } from '../../shared/competition/deletedAccount';
import { inviteCodeFor } from './competitionPeople';
import { deliverCompetitionNotices, type CompetitionNotice } from './competitionNotify';
import { markOrphaned } from './competitionOrphans';
import { defaultAlias, isValidAlias } from '../../shared/alias';
import { CompetitionError, mutateCompetition } from './competition';

/**
 * Non-reversible stand-in for a deleted uid: an HMAC keyed by the server secret
 * ACCOUNT_DELETION_SALT, stable across reruns. Never keyed by a public constant —
 * anyone holding a uid could otherwise recompute it and re-identify the records.
 */
export function deletedAccountTombstone(
  uid: string,
  secret = process.env.ACCOUNT_DELETION_SALT,
): string | null {
  if (!secret) return null;
  return `deleted_${createHmac('sha256', secret).update(uid).digest('hex').slice(0, 16)}`;
}

/**
 * Without the secret: a random tombstone, parked in server-only
 * `accountDeletions/{uid}` (clients can't write it, so nobody can plant another
 * account's tombstone) so a rerun reuses it; removed once the Auth account is gone.
 */
async function tombstoneFor(db: Firestore, uid: string): Promise<string> {
  const keyed = deletedAccountTombstone(uid);
  if (keyed) return keyed;
  const ref = db.doc(`accountDeletions/${uid}`);
  const kept = (await ref.get()).data()?.deletionTombstone;
  if (typeof kept === 'string' && /^deleted_[0-9a-f]{16}$/.test(kept)) return kept;
  const fresh = `deleted_${randomBytes(8).toString('hex')}`;
  await ref.set({ deletionTombstone: fresh }, { merge: true });
  return fresh;
}

/** Writer used by system-authored audit rows (no human actor). */
export const SYSTEM_ACTOR = 'system_account_deletion';

const PAGE = 400;

interface Ctx {
  db: Firestore;
  uid: string;
  tomb: string;
  now: number;
  warnings: string[];
  notices: CompetitionNotice[];
}

type Op = (b: FirebaseFirestore.WriteBatch) => void;

/** Buffered writes committed in batches well under Firestore's 500-op cap. */
class Writes {
  private ops: Op[] = [];
  constructor(private db: Firestore) {}
  update(ref: DocumentReference, data: DocumentData) {
    this.ops.push((b) => b.update(ref, data));
  }
  delete(ref: DocumentReference) {
    this.ops.push((b) => b.delete(ref));
  }
  set(ref: DocumentReference, data: DocumentData) {
    this.ops.push((b) => b.set(ref, data));
  }
  async flush() {
    while (this.ops.length) {
      const batch = this.db.batch();
      this.ops.splice(0, PAGE).forEach((op) => op(batch));
      await batch.commit();
    }
  }
}

async function get(db: Firestore, path: string): Promise<DocumentData | null> {
  const s = await db.doc(path).get();
  return s.exists ? s.data()! : null;
}

/** Re-run a uid-selecting query until it is empty; each pass must change what it matched. */
async function drain(
  query: () => Query,
  fn: (docs: QueryDocumentSnapshot[]) => Promise<void>,
) {
  for (let pass = 0; pass < 25; pass++) {
    const snap = await query().limit(PAGE).get();
    if (snap.empty) return;
    await fn(snap.docs);
    if (snap.size < PAGE) return;
  }
}

const swap = (list: string[] | undefined, from: string, to: string) =>
  (list || []).map((v) => (v === from ? to : v));

const started = (e: CompetitionEvent, engine: DocumentData | null, now: number) =>
  now >= e.config.startsAt || (!!engine && engine.state !== 'scheduled');

/** The public name the engine would give this account (mirrors mutateCompetition). */
async function publicName(db: Firestore, uid: string) {
  const alias = await get(db, `leaderboards/all-time/entries/${uid}`);
  if (alias?.hidden !== true && isValidAlias(alias?.displayName))
    return String(alias!.displayName).slice(0, 40);
  const user = await get(db, `users/${uid}`);
  return defaultAlias(user?.displayName) || 'Participant';
}

async function approvedHost(db: Firestore, uid: string, schoolKey: string | null) {
  if (!schoolKey) return false;
  const role = await get(db, `schoolRoles/${schoolKey}_${uid}`);
  return role?.status === 'approved' && role?.role === 'host';
}

/** The earliest-approved other host of a school: the automatic heir when no co-host can take over. */
async function schoolHostHeir(db: Firestore, schoolKey: string | null, uid: string) {
  if (!schoolKey) return undefined;
  const hosts = (
    await db.collection('schoolRoles').where('schoolKey', '==', schoolKey).limit(100).get()
  ).docs
    .map((r) => r.data())
    .filter((r) => r.uid !== uid && r.status === 'approved' && r.role === 'host')
    .sort((a, b) => (a.reviewedAt || 0) - (b.reviewedAt || 0));
  return hosts[0]?.uid as string | undefined;
}

/** The new owner's typed inbox item (and a push once the writes have landed). */
function ownershipNotice(
  w: Writes,
  db: Firestore,
  heir: string,
  kind: 'event' | 'league',
  targetId: string,
  title: string,
  now: number,
): CompetitionNotice {
  w.set(db.doc(`users/${heir}/competitionInbox/${kind}_${targetId}`), {
    id: `${kind}_${targetId}`,
    kind,
    targetKind: kind,
    targetId,
    action: 'ownership_received',
    title,
    read: false,
    updatedAt: now,
  });
  return { uid: heir, action: 'ownership_received', targetKind: kind, targetId, title };
}

/** Run one engine action as the departing account; a refusal is recorded, never thrown. */
async function engine(
  ctx: Ctx,
  action: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const key = [action, body.eventId, body.entryId, body.leagueId]
    .filter(Boolean)
    .join('_');
  try {
    await mutateCompetition(
      ctx.db,
      ctx.uid,
      '',
      { action, operationId: `acctdel_${key}`.slice(0, 128), ...body },
      ctx.now,
    );
    return true;
  } catch (e) {
    if (!(e instanceof CompetitionError)) throw e;
    ctx.warnings.push(`competition_${action}_${key}: ${e.code}`);
    return false;
  }
}

interface Discovery {
  events: Set<string>;
  tournaments: Set<string>;
  leagueAudit: DocumentReference[];
}

async function discover(ctx: Ctx, step: Step): Promise<Discovery> {
  const { db, uid } = ctx;
  const out: Discovery = {
    events: new Set(),
    tournaments: new Set(),
    leagueAudit: [],
  };
  const parentEvent = (ref: DocumentReference) => {
    const p = ref.path.split('/');
    return p[0] === 'competitionEvents' ? p[1] : null;
  };
  await step('discover_inbox', async () => {
    const s = await db
      .collection(`users/${uid}/competitionInbox`)
      .limit(500)
      .get();
    for (const d of s.docs)
      if (['event', 'entry'].includes(d.data().kind))
        out.events.add(String(d.data().targetId));
  });
  await step('discover_claims', async () => {
    const s = await db
      .collection('entryClaims')
      .where('uid', '==', uid)
      .limit(500)
      .get();
    s.docs.forEach((d) => out.events.add(String(d.data().eventId)));
  });
  await step('discover_owned', async () => {
    const s = await db
      .collection('competitionEvents')
      .where('ownerUid', '==', uid)
      .limit(500)
      .get();
    s.docs.forEach((d) => out.events.add(d.id));
  });
  if (/^[A-Za-z0-9_-]+$/.test(uid))
    await step('discover_cohosted', async () => {
      const s = await db
        .collection('competitionEvents')
        .where(`cohosts.${uid}`, 'in', ['manage', 'checkin'])
        .limit(500)
        .get();
      s.docs.forEach((d) => out.events.add(d.id));
    });
  // Collection-group lookups (firestore.indexes.json fieldOverrides). If an
  // index is not deployed yet, the inbox/claims/owner sources above still run.
  for (const [label, field, op] of [
    ['discover_captain_entries', 'captainUid', '=='],
    ['discover_starter_entries', 'starters', 'array-contains'],
  ] as const)
    await step(label, async () => {
      const s = await db
        .collectionGroup('entries')
        .where(field, op, uid)
        .limit(500)
        .get();
      s.docs.forEach((d) => {
        const e = parentEvent(d.ref);
        if (e) out.events.add(e);
      });
    });
  await step('discover_audit', async () => {
    const s = await db
      .collectionGroup('audit')
      .where('actorUid', '==', uid)
      .limit(500)
      .get();
    for (const d of s.docs) {
      const e = parentEvent(d.ref);
      if (e) out.events.add(e);
      else if (d.ref.path.startsWith('leagues/')) out.leagueAudit.push(d.ref);
    }
  });
  await step('discover_tournaments', async () => {
    const [mine, created] = await Promise.all([
      db.collection(`users/${uid}/myTournaments`).limit(500).get(),
      db
        .collection('userTournaments')
        .where('creatorUid', '==', uid)
        .limit(500)
        .get(),
    ]);
    mine.docs.forEach((d) => out.tournaments.add(d.id));
    created.docs.forEach((d) => out.tournaments.add(d.id));
  });
  return out;
}

type Step = (label: string, fn: () => Promise<void>) => Promise<void>;

/** Does any locked record (registered/withdrawn-after-lock entry, league consent) still name this team? */
async function teamIsLocked(ctx: Ctx, teamId: string, events: Set<string>) {
  const { db } = ctx;
  const consent = await db
    .collection('leagueConsents')
    .where('teamId', '==', teamId)
    .limit(1)
    .get();
  if (!consent.empty) return true;
  const locked = (d: DocumentData | null) =>
    !!d && (d.state === 'registered' || d.lockedAt != null);
  try {
    const s = await db
      .collectionGroup('entries')
      .where('teamId', '==', teamId)
      .limit(100)
      .get();
    if (s.docs.some((d) => locked(d.data()))) return true;
  } catch (e: any) {
    ctx.warnings.push(`competition_team_entries_index: ${e?.message || 'failed'}`);
  }
  for (const eventId of events)
    if (locked(await get(db, `competitionEvents/${eventId}/entries/${teamId}`)))
      return true;
  return false;
}

/** Leave every team; hand captaincy on; delete or retire a team left empty. */
async function teams(ctx: Ctx, events: Set<string>) {
  const { db, uid, tomb, now } = ctx;
  const heirs = new Map<string, string>();
  const removed = new Set<string>();
  const found = new Map<string, Team>();
  for (const q of [
    db.collection('teams').where('members', 'array-contains', uid),
    db.collection('teams').where('captainUid', '==', uid),
  ])
    (await q.limit(100).get()).docs.forEach((d) =>
      found.set(d.id, d.data() as Team),
    );
  for (const [teamId, seen] of found) {
    const lastOne =
      seen.captainUid === uid && seen.members.every((m) => m === uid);
    const locked = lastOne ? await teamIsLocked(ctx, teamId, events) : false;
    const ref = db.doc(`teams/${teamId}`);
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 'gone';
      const t = snap.data() as Team;
      if (!t.members.includes(uid) && t.captainUid !== uid) return 'done';
      const remaining = t.members.filter((m) => m !== uid);
      if (t.captainUid !== uid) {
        tx.update(ref, { members: remaining, revision: t.revision + 1 });
        return 'left';
      }
      if (remaining.length) {
        // members[] only ever appends (create, accepted invite, approved request): index 0 joined first.
        tx.update(ref, {
          members: remaining,
          captainUid: remaining[0],
          revision: t.revision + 1,
        });
        heirs.set(teamId, remaining[0]);
        return 'handed_over';
      }
      if (locked) {
        tx.update(ref, {
          members: [],
          captainUid: tomb,
          visibility: 'private',
          inactive: true,
          revision: t.revision + 1,
        });
        return 'retired';
      }
      return 'delete';
    });
    if (outcome === 'handed_over')
      await db
        .doc(`users/${heirs.get(teamId)}/competitionInbox/team_${teamId}`)
        .set({
          id: `team_${teamId}`,
          kind: 'team',
          targetKind: 'team',
          targetId: teamId,
          action: 'captain_transferred',
          title: seen.name,
          read: false,
          updatedAt: now,
        });
    if (outcome === 'delete') {
      const w = new Writes(db);
      for (const col of ['teamInvites', 'leagueInvites'])
        for (const d of (
          await db.collection(col).where('teamId', '==', teamId).limit(PAGE).get()
        ).docs) {
          w.delete(d.ref);
          if (col === 'teamInvites' && d.data().recipientUid)
            w.delete(
              db.doc(
                `users/${d.data().recipientUid}/competitionInbox/invite_${d.id}`,
              ),
            );
        }
      await w.flush();
      await db.recursiveDelete(ref);
      removed.add(teamId);
    }
  }
  return { heirs, removed };
}

/** Owned events: delete drafts, hand over or cancel live ones, then strip the owner's identity. */
async function ownedEvents(ctx: Ctx, events: Set<string>) {
  const { db, uid, tomb, now } = ctx;
  const deleted = new Set<string>();
  for (const eventId of events) {
    let e = (await get(db, `competitionEvents/${eventId}`)) as CompetitionEvent | null;
    if (!e || (e.ownerUid !== uid && !e.cohosts?.[uid])) continue;
    const ref = db.doc(`competitionEvents/${eventId}`);
    if (e.ownerUid !== uid) {
      // A co-host leaves: the same effect as the owner's `event-cohost` remove.
      const cohosts = { ...e.cohosts };
      delete cohosts[uid];
      await ref.update({ cohosts });
      continue;
    }
    if (e.state === 'draft' && !(await get(db, `fixtureSources/${eventId}`))) {
      await db.recursiveDelete(ref);
      await db.doc(`competitionDirectory/${eventId}`).delete();
      deleted.add(eventId);
      continue;
    }
    const tournament = e.tournamentId
      ? await get(db, `userTournaments/${e.tournamentId}`)
      : null;
    let heir: string | null = null;
    if (e.state === 'published' || e.state === 'draft') {
      for (const candidate of Object.keys(e.cohosts || {}).sort()) {
        if (candidate === uid || e.cohosts[candidate] !== 'manage') continue;
        const needsHost = e.hostKind === 'school' || e.delivery !== 'online';
        if (needsHost && !(await approvedHost(db, candidate, e.schoolKey)))
          continue;
        heir = candidate;
        break;
      }
      // No managing co-host: the school's own approved host keeps a school event going.
      if (!heir && e.hostKind === 'school')
        heir = (await schoolHostHeir(db, e.schoolKey, uid)) ?? null;
      if (!heir && !started(e, tournament, now)) {
        await engine(ctx, 'event-cancel', { eventId });
        e = (await get(db, `competitionEvents/${eventId}`)) as CompetitionEvent;
      }
      // A started event without an heir is finished automatically (competitionOrphans).
      if (!heir && e.state === 'published')
        await markOrphaned(db, 'event', eventId, e.title, now);
    }
    const owner = heir ?? tomb;
    const hostName = heir ? await publicName(db, heir) : DELETED_ACCOUNT_NAME;
    const cohosts = { ...(e.cohosts || {}) };
    delete cohosts[uid];
    if (heir) delete cohosts[heir];
    const w = new Writes(db);
    w.update(ref, {
      ownerUid: owner,
      hostName,
      cohosts,
      ...(heir ? { revision: e.revision + 1, updatedAt: now } : {}),
    });
    if (heir) {
      w.set(db.doc(`competitionEvents/${eventId}/audit/owner_${tomb}`), {
        action: 'owner-account-deleted',
        actorUid: SYSTEM_ACTOR,
        ownerUid: heir,
        revision: e.revision + 1,
        at: now,
      });
      ctx.notices.push(ownershipNotice(w, db, heir, 'event', eventId, e.title, now));
    }
    if (await get(db, `competitionDirectory/${eventId}`))
      w.update(db.doc(`competitionDirectory/${eventId}`), { hostName });
    if (e.tournamentId && tournament?.creatorUid === uid)
      w.update(db.doc(`userTournaments/${e.tournamentId}`), {
        creatorUid: owner,
        creatorName: hostName,
      });
    await w.flush();
  }
  return deleted;
}

/** Withdraw what is still pending, then pseudonymize every entry naming the user. */
async function entries(
  ctx: Ctx,
  events: Set<string>,
  heirs: Map<string, string>,
  removedTeams: Set<string>,
) {
  const { db, uid, tomb, now } = ctx;
  for (const eventId of events) {
    const e = (await get(db, `competitionEvents/${eventId}`)) as CompetitionEvent | null;
    if (!e) continue;
    const tournament = e.tournamentId
      ? await get(db, `userTournaments/${e.tournamentId}`)
      : null;
    const pending =
      (e.state === 'published' || e.state === 'draft') &&
      !started(e, tournament, now);
    const registrationOpen =
      e.state === 'published' && pending && now < e.registrationClosesAt;
    const mine = (x: EventEntry) =>
      x.captainUid === uid ||
      (x.starters || []).includes(uid) ||
      (x.confirmed || []).includes(uid);
    const load = async () =>
      (
        await db.collection(`competitionEvents/${eventId}/entries`).limit(100).get()
      ).docs.filter((d) => mine(d.data() as EventEntry));
    // Engine withdrawal first: it checks the real captain uid and releases claims and seats itself.
    for (const d of await load()) {
      const x = d.data() as EventEntry;
      if (
        registrationOpen &&
        x.state === 'registered' &&
        !x.teamId &&
        x.captainUid === uid
      )
        await engine(ctx, 'entry-withdraw', { eventId, entryId: x.id });
    }
    const w = new Writes(db);
    for (const d of await load()) {
      const x = d.data() as EventEntry;
      if (pending && x.state === 'draft') {
        if (!x.teamId || removedTeams.has(x.teamId)) {
          w.delete(d.ref);
          if (!x.teamId)
            w.delete(db.doc(`competitionEvents/${eventId}/approvals/${x.id}`));
          continue;
        }
        // A draft roster is still editable: drop the user; a draft they captained is withdrawn.
        w.update(d.ref, {
          starters: (x.starters || []).filter((m) => m !== uid),
          confirmed: (x.confirmed || []).filter((m) => m !== uid),
          ...(x.captainUid === uid
            ? { captainUid: tomb, state: 'withdrawn' }
            : {}),
          revision: x.revision + 1,
        });
        continue;
      }
      // Locked roster: names change, membership and state do not.
      const captain =
        x.captainUid === uid
          ? (x.teamId && heirs.get(x.teamId)) || tomb
          : x.captainUid;
      w.update(d.ref, {
        captainUid: captain,
        starters: swap(x.starters, uid, tomb),
        confirmed: swap(x.confirmed, uid, tomb),
        ...(x.teamId ? {} : { label: DELETED_ACCOUNT_NAME }),
        // Shared-answer / relay planning (EventEntry.roles, relaySlots, dutiesConfirmed).
        ...(x.roles
          ? {
              roles: {
                submitter: x.roles.submitter === uid ? tomb : x.roles.submitter,
                deputy: x.roles.deputy === uid ? tomb : x.roles.deputy,
              },
            }
          : {}),
        ...(x.relaySlots ? { relaySlots: swap(x.relaySlots, uid, tomb) } : {}),
        ...(x.dutiesConfirmed
          ? { dutiesConfirmed: swap(x.dutiesConfirmed, uid, tomb) }
          : {}),
      });
    }
    await w.flush();
  }
}

/** Disputes, audit, rewards, approvals and attendance of each event the user touched. */
async function eventRecords(
  ctx: Ctx,
  events: Set<string>,
  leagueAudit: DocumentReference[],
) {
  const { db, uid, tomb, now } = ctx;
  for (const eventId of events) {
    const e = (await get(db, `competitionEvents/${eventId}`)) as CompetitionEvent | null;
    if (!e) continue;
    const tournament = e.tournamentId
      ? await get(db, `userTournaments/${e.tournamentId}`)
      : null;
    const base = `competitionEvents/${eventId}`;
    const w = new Writes(db);
    const scan = async (col: string, max: number) =>
      (await db.collection(`${base}/${col}`).limit(max).get()).docs;
    for (const d of await scan('disputes', 200)) {
      const x = d.data();
      const patch: DocumentData = {};
      if (x.uid === uid) Object.assign(patch, { uid: tomb, reason: '', redacted: true });
      if (x.resolvedBy === uid) patch.resolvedBy = tomb;
      if (Object.keys(patch).length) w.update(d.ref, patch);
    }
    for (const d of await scan('audit', 500))
      if (d.data().actorUid === uid) w.update(d.ref, { actorUid: tomb });
    for (const d of await scan('rewards', 100))
      if (d.data().reportedBy === uid) w.update(d.ref, { reportedBy: tomb });
    for (const d of await scan('approvals', 100))
      if (d.data().approvedBy === uid) w.update(d.ref, { approvedBy: tomb });
    for (const d of await scan('attendance', 200)) {
      const x = d.data();
      if (d.id === uid && !started(e, tournament, now)) {
        w.delete(d.ref);
        continue;
      }
      const patch: DocumentData = {};
      if (x.uid === uid) patch.uid = tomb;
      if (x.checkedInBy === uid) patch.checkedInBy = tomb;
      if (Object.keys(patch).length) w.update(d.ref, patch);
    }
    await w.flush();
  }
  const w = new Writes(db);
  leagueAudit.forEach((ref) => w.update(ref, { actorUid: tomb }));
  await w.flush();
}

/** Tournament engine: replace names everywhere; replace uid fields unless a bracket joins on them. */
async function tournaments(ctx: Ctx, tids: Set<string>) {
  const { db, uid, tomb } = ctx;
  for (const tid of tids) {
    const t = await get(db, `userTournaments/${tid}`);
    if (!t) continue;
    const base = `userTournaments/${tid}`;
    const bracket = t.format === 'bracket';
    const key = bracket ? uid : tomb;
    const w = new Writes(db);
    const patch: DocumentData = {};
    if (t.creatorUid === uid)
      Object.assign(patch, { creatorUid: tomb, creatorName: DELETED_ACCOUNT_NAME });
    if (t.winner?.uid === uid)
      patch.winner = { ...t.winner, uid: key, displayName: DELETED_ACCOUNT_NAME };
    if (Object.keys(patch).length) w.update(db.doc(base), patch);
    for (const col of ['roster', 'players']) {
      const ref = db.doc(`${base}/${col}/${uid}`);
      if ((await ref.get()).exists)
        w.update(ref, { uid: key, displayName: DELETED_ACCOUNT_NAME, avatar: null });
    }
    // Team modes: one answer per team (submitter uid), the frozen control
    // record (holder, deputy, slots, presence, transfer log) and team attempts
    // (who answered each position, relay leg owners). Points stay untouched.
    // Control and attempt records are keyed by entry id, so they are read
    // directly from the user's own entries — never found by a bounded scan.
    if (t.gameMode === 'shared' || t.gameMode === 'relay') {
      const answers = await db
        .collection(`${base}/teamAnswers`)
        .where('uid', '==', uid)
        .limit(PAGE)
        .get();
      // One answer per question at most (≤ 99): reaching PAGE means something is wrong.
      if (answers.size >= PAGE) ctx.warnings.push('competition_team_answers_bound');
      answers.docs.forEach((d) => w.update(d.ref, { uid: tomb }));
      const entryIds = new Set<string>();
      if (t.competitionEventId)
        for (const member of [uid, tomb])
          for (const d of (
            await db
              .collection(`competitionEvents/${t.competitionEventId}/entries`)
              .where('starters', 'array-contains', member)
              .get()
          ).docs)
            entryIds.add(d.id);
      const sw = (v: unknown) => (v === uid ? tomb : v);
      for (const entryId of entryIds) {
        const c = await get(db, `${base}/teamControl/${entryId}`);
        if (c) {
          const lastSeen = { ...(c.lastSeen || {}) };
          if (uid in lastSeen) {
            lastSeen[tomb] = lastSeen[uid];
            delete lastSeen[uid];
          }
          w.update(db.doc(`${base}/teamControl/${entryId}`), {
            captainUid: sw(c.captainUid),
            starters: swap(c.starters || [], uid, tomb),
            slots: swap(c.slots || [], uid, tomb),
            holderUid: sw(c.holderUid),
            deputyUid: sw(c.deputyUid),
            lastSeen,
            transfers: (c.transfers || []).map((x: DocumentData) => ({ ...x, from: sw(x.from), to: sw(x.to) })),
          });
        }
        // Team modes run on live/window only: the single window round is 0.
        const a = await get(db, `${base}/teamAttempts/0_${entryId}`);
        if (a)
          w.update(db.doc(`${base}/teamAttempts/0_${entryId}`), {
            answeredBy: (a.answeredBy || []).map(sw),
            ...(a.legs ? { legs: a.legs.map((l: DocumentData) => ({ ...l, owner: sw(l.owner) })) } : {}),
          });
      }
    }
    if (!bracket)
      for (const col of ['attempts', 'answers'])
        for (const d of (
          await db.collection(`${base}/${col}`).where('uid', '==', uid).limit(PAGE).get()
        ).docs)
          w.update(d.ref, { uid: tomb });
    const board = await get(db, `${base}/standings/current`);
    if (board) {
      let changed = false;
      const rows = (board.rows || []).map((r: DocumentData) => {
        if (r.uid !== uid) return r;
        changed = true;
        return { ...r, uid: key, displayName: DELETED_ACCOUNT_NAME, avatar: null };
      });
      const namedTeams = (board.namedTeams || []).map((r: DocumentData) => {
        if (!(r.starters || []).includes(uid)) return r;
        changed = true;
        return {
          ...r,
          starters: swap(r.starters, uid, key),
          contributions: (r.contributions || []).map((c: DocumentData) =>
            c.uid === uid ? { ...c, uid: key } : c,
          ),
        };
      });
      if (changed)
        w.update(db.doc(`${base}/standings/current`), { rows, namedTeams });
    }
    if (bracket)
      for (const d of (await db.collection(`${base}/matches`).limit(300).get()).docs) {
        const m = d.data();
        const side = (s: DocumentData | null) =>
          s?.uid === uid ? { ...s, displayName: DELETED_ACCOUNT_NAME, avatar: null } : s;
        if (m.a?.uid === uid || m.b?.uid === uid)
          w.update(d.ref, { a: side(m.a), b: side(m.b) });
      }
    await w.flush();
  }
}

/** Shareable invite codes map straight to the uid, so they go entirely. */
async function inviteCodes(ctx: Ctx) {
  const { db, uid } = ctx;
  for (const length of [8, 12, 16]) {
    const ref = db.doc(`competitionInviteCodes/${inviteCodeFor(uid, length)}`);
    const snap = await ref.get();
    if (snap.exists && snap.data()?.uid === uid) await ref.delete();
  }
  // The hourly report counter is keyed by uid.
  await db.doc(`competitionReportAlerts/_reporter_${uid}`).delete();
}

/** Owned leagues and league invitations/consents. */
async function leagues(ctx: Ctx) {
  const { db, uid, tomb, now } = ctx;
  const owned = await db
    .collection('leagues')
    .where('ownerUid', '==', uid)
    .limit(100)
    .get();
  for (const d of owned.docs) {
    const league = d.data() as League;
    if (league.state === 'draft' && league.entrants.length === 0) {
      const w = new Writes(db);
      for (const col of ['leagueInvites', 'leagueConsents'])
        for (const x of (
          await db.collection(col).where('leagueId', '==', league.id).limit(PAGE).get()
        ).docs) {
          w.delete(x.ref);
          if (x.data().captainUid)
            w.delete(
              db.doc(`users/${x.data().captainUid}/competitionInbox/league_${league.id}`),
            );
        }
      await w.flush();
      await db.recursiveDelete(d.ref);
      continue;
    }
    const heir = await schoolHostHeir(db, league.schoolKey, uid);
    const resolved = league.fixtures.every(
      (f) => f.status === 'final' || f.status === 'no_contest',
    );
    if (!heir && league.state === 'active' && resolved)
      await engine(ctx, 'league-close', {
        leagueId: league.id,
        revision: league.revision,
      });
    // Unresolved fixtures need adjudication: the sweep alerts administrators once.
    else if (!heir && league.state !== 'closed')
      await markOrphaned(db, 'league', league.id, league.title, now);
    const w = new Writes(db);
    w.update(d.ref, { ownerUid: heir ?? tomb });
    if (heir) {
      w.set(db.doc(`leagues/${league.id}/audit/owner_${tomb}`), {
        action: 'owner-account-deleted',
        actorUid: SYSTEM_ACTOR,
        ownerUid: heir,
        at: now,
      });
      ctx.notices.push(ownershipNotice(w, db, heir, 'league', league.id, league.title, now));
    }
    await w.flush();
  }
  for (const col of ['leagueInvites', 'leagueConsents'])
    await drain(
      () => db.collection(col).where('captainUid', '==', uid),
      async (docs) => {
        const w = new Writes(db);
        docs.forEach((x) => w.update(x.ref, { captainUid: tomb }));
        await w.flush();
      },
    );
}

/** Purely personal or pending records: delete. Others' review/moderation stamps: tombstone. */
async function personal(ctx: Ctx, step: Step) {
  const { db, uid, tomb } = ctx;
  const remove = (col: string, field: string, alsoInbox = false) =>
    step(`delete_${col}_${field}`, () =>
      drain(
        () => db.collection(col).where(field, '==', uid),
        async (docs) => {
          const w = new Writes(db);
          for (const d of docs) {
            w.delete(d.ref);
            if (alsoInbox && d.data().recipientUid)
              w.delete(
                db.doc(`users/${d.data().recipientUid}/competitionInbox/invite_${d.id}`),
              );
          }
          await w.flush();
        },
      ),
    );
  const stamp = (col: string, field: string) =>
    step(`tombstone_${col}_${field}`, () =>
      drain(
        () => db.collection(col).where(field, '==', uid),
        async (docs) => {
          const w = new Writes(db);
          docs.forEach((d) => w.update(d.ref, { [field]: tomb }));
          await w.flush();
        },
      ),
    );
  // Join requests live under each team; a request needed school membership, so walk the user's schools.
  await step('team_requests', async () => {
    const schools = (
      await db.collection('schoolMemberships').where('uid', '==', uid).limit(100).get()
    ).docs.map((d) => String(d.data().schoolKey));
    const w = new Writes(db);
    for (const schoolKey of new Set(schools))
      for (const t of (
        await db.collection('teams').where('schoolKey', '==', schoolKey).limit(300).get()
      ).docs) {
        const ref = db.doc(`teams/${t.id}/requests/${uid}`);
        if ((await ref.get()).exists) w.delete(ref);
      }
    await w.flush();
  });
  // Follower reverse index competitionEvents/{e}/followers/{uid}, written in the same
  // transaction as users/{uid}/competitionFollows/{e} — so the follows list finds every one.
  await step('event_followers', async () => {
    const follows = await db
      .collection(`users/${uid}/competitionFollows`)
      .limit(500)
      .get();
    const w = new Writes(db);
    follows.docs.forEach((d) =>
      w.delete(db.doc(`competitionEvents/${d.id}/followers/${uid}`)),
    );
    await w.flush();
  });
  await remove('teamInvites', 'senderUid', true);
  await remove('teamInvites', 'recipientUid');
  await remove('entryClaims', 'uid');
  await remove('schoolMemberships', 'uid');
  await remove('schoolRoles', 'uid');
  await remove('competitionBlocks', 'uid');
  await remove('competitionBlocks', 'blockedUid');
  await stamp('schoolMemberships', 'reviewedBy');
  await stamp('schoolRoles', 'reviewedBy');
  await stamp('competitionReports', 'uid');
  await stamp('competitionReports', 'reviewerUid');
  // Last: the engine actions above wrote receipts under this uid.
  await remove('competitionMutations', 'uid');
}

/**
 * Apply the policy above for one account. Every step is best-effort and
 * reports into `warnings`; nothing here throws.
 */
export async function eraseCompetitionAccount(
  db: Firestore,
  uid: string,
  now: number,
): Promise<{ warnings: string[] }> {
  const ctx: Ctx = { db, uid, tomb: await tombstoneFor(db, uid), now, warnings: [], notices: [] };
  const step: Step = async (label, fn) => {
    try {
      await fn();
    } catch (e: any) {
      ctx.warnings.push(`competition_${label}: ${e?.message || 'failed'}`);
    }
  };
  const found = await discover(ctx, step);
  let heirs = new Map<string, string>();
  let removedTeams = new Set<string>();
  await step('teams', async () => {
    ({ heirs, removed: removedTeams } = await teams(ctx, found.events));
  });
  await step('owned_events', async () => {
    const deleted = await ownedEvents(ctx, found.events);
    deleted.forEach((id) => found.events.delete(id));
  });
  for (const eventId of found.events) {
    const e = await get(db, `competitionEvents/${eventId}`).catch(() => null);
    if (e?.tournamentId) found.tournaments.add(String(e.tournamentId));
  }
  await step('entries', () => entries(ctx, found.events, heirs, removedTeams));
  await step('event_records', () =>
    eventRecords(ctx, found.events, found.leagueAudit),
  );
  await step('tournaments', () => tournaments(ctx, found.tournaments));
  await step('leagues', () => leagues(ctx));
  await step('invite_codes', () => inviteCodes(ctx));
  await personal(ctx, step);
  await deliverCompetitionNotices(db, ctx.notices, uid);
  return { warnings: ctx.warnings };
}
