/** Server-only competition operations. All authority and retry receipts share the mutation transaction. */
import { createHash } from 'crypto';
import type {
  DocumentData,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import type {
  CompetitionEvent,
  EventEntry,
  Team,
  League,
} from '../../shared/competition/platform';
import { leagueTable, roundRobin } from '../../shared/leagues/standings';
import { rosterProblem, TEAM_POLICY } from '../../shared/teams/policy';
import { validateTournamentInput } from '../../shared/tournois/config';
import { buildSchedule } from '../../shared/tournois/schedule';
import {
  drawQuestions,
  type BankQuestion,
} from '../../shared/tournois/questions';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../../src/data/triviaData';
import { defaultAlias, isValidAlias } from '../../shared/alias';
import {
  seedSchoolByKey,
  schoolFromDoc,
  isApproved,
} from '../../shared/schools';
import { emptyPlayer } from '../tournois/_shared';
import { poolPlan, splitPools } from '../tournois/create';
import {
  shouldPush,
  type InboxAction,
} from '../../shared/competition/notifications';
import {
  deliverCompetitionNotices,
  type CompetitionNotice,
} from './competitionNotify';

export class CompetitionError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
export function ensure(
  condition: unknown,
  code: string,
  status = 409,
): asserts condition {
  if (!condition) throw new CompetitionError(code, status);
}
export function id(value: unknown): string {
  ensure(
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value),
    'invalid_id',
    400,
  );
  return value;
}
function text(value: unknown, max = 240): string {
  return typeof value === 'string'
    ? [...value.trim()]
        .filter((c) => c.charCodeAt(0) >= 32 && c !== '<' && c !== '>')
        .join('')
        .slice(0, max)
    : '';
}
function list(value: unknown): string[] {
  ensure(Array.isArray(value) && value.length <= 12, 'invalid_members', 400);
  return value.map(id);
}
export function schoolIdentifier(value: unknown): string {
  ensure(
    typeof value === 'string' &&
      value.length <= 180 &&
      /^[a-z0-9]+(?: [a-z0-9]+)*$/.test(value),
    'invalid_school',
    400,
  );
  return value;
}
async function canonicalSchool(tx: Transaction, db: Firestore, key: string) {
  const records = await tx.get(
    db.collection('schools').where('key', '==', key).limit(1),
  );
  const current = records.docs[0]
    ? schoolFromDoc(records.docs[0].data())
    : seedSchoolByKey(key);
  ensure(current && isApproved(current), 'school_unavailable', 404);
  return current;
}
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const eventRef = (db: Firestore, eventId: string) =>
  db.doc(`competitionEvents/${eventId}`);
const teamRef = (db: Firestore, teamId: string) => db.doc(`teams/${teamId}`);
/** Records the latest typed change per target; the actor's own records start read. */
function inbox(
  tx: Transaction,
  db: Firestore,
  uid: string,
  key: string,
  kind: string,
  targetId: string,
  title: string,
  now: number,
  action: InboxAction,
  read: boolean,
) {
  tx.set(db.doc(`users/${uid}/competitionInbox/${key}`), {
    id: key,
    kind,
    targetKind: kind === 'entry' ? 'event' : kind,
    targetId,
    action,
    title,
    read,
    updatedAt: now,
  });
}
/** Inbox writer bound to one mutation attempt; also queues the push-worthy subset. */
type Note = (
  uid: string,
  key: string,
  kind: 'entry' | 'event' | 'team' | 'invite' | 'league' | 'school',
  targetId: string,
  title: string,
  action: InboxAction,
) => void;
/** School keys contain spaces, so their inbox document id is a digest. */
const schoolInboxKey = (schoolKey: string) =>
  `school_${hash(schoolKey).slice(0, 24)}`;
async function data(
  tx: Transaction,
  db: Firestore,
  path: string,
): Promise<DocumentData | null> {
  const s = await tx.get(db.doc(path));
  return s.exists ? s.data()! : null;
}
async function schoolRole(
  tx: Transaction,
  db: Firestore,
  uid: string,
  schoolKey: string | null,
  admin: boolean,
) {
  if (admin) return true;
  if (!schoolKey) return false;
  const role = await data(tx, db, `schoolRoles/${schoolKey}_${uid}`);
  return role?.status === 'approved' && role?.role === 'host';
}
async function schoolMember(
  tx: Transaction,
  db: Firestore,
  uid: string,
  schoolKey: string,
) {
  const membership = await data(
    tx,
    db,
    `schoolMemberships/${schoolKey}_${uid}`,
  );
  return membership?.status === 'approved';
}
function manage(e: CompetitionEvent, uid: string, admin: boolean) {
  ensure(
    admin || e.ownerUid === uid || e.cohosts[uid] === 'manage',
    'forbidden',
    403,
  );
}
function registrationOpen(e: CompetitionEvent, now: number) {
  ensure(
    e.state === 'published' &&
      now < e.registrationClosesAt &&
      now < e.config.startsAt,
    'event_closed',
  );
}
function projection(e: CompetitionEvent) {
  return {
    id: e.id,
    title: e.title,
    hostName: e.hostName,
    hostKind: e.hostKind,
    schoolKey: e.schoolKey,
    department: e.department,
    audience: e.audience,
    entryMode: e.entryMode,
    delivery: e.delivery,
    state: e.state,
    startsAt: e.config.startsAt,
    format: e.config.format,
    registrationClosesAt: e.registrationClosesAt,
    tournamentId: e.tournamentId,
    updatedAt: e.updatedAt,
  };
}
function publishProjection(
  tx: Transaction,
  db: Firestore,
  e: CompetitionEvent,
) {
  const ref = db.doc(`competitionDirectory/${e.id}`);
  if (e.audience === 'public' && e.state !== 'draft')
    tx.set(ref, projection(e));
  else tx.delete(ref);
}

/** Prepare all dependent reads before any transaction writes. A changed source cannot leave stale league points. */
async function prepareLeagueInvalidation(
  tx: Transaction,
  db: Firestore,
  eventId: string,
  now: number,
  note: Note,
  startsAt?: number,
) {
  const source = await data(tx, db, `fixtureSources/${eventId}`);
  if (!source) return () => undefined;
  const league = (await data(
    tx,
    db,
    `leagues/${source.leagueId}`,
  )) as League | null;
  ensure(league, 'league_unavailable');
  const fixture = league.fixtures.find((f) => f.id === source.fixtureId);
  ensure(fixture, 'fixture_not_found');
  fixture.status = startsAt ? 'postponed' : 'disputed';
  fixture.homeScore = null;
  fixture.awayScore = null;
  fixture.revision++;
  if (startsAt) fixture.startsAt = startsAt;
  league.revision++;
  league.state = 'active';
  const table = leagueTable(league.entrants, league.fixtures);
  return () => {
    tx.set(db.doc(`leagues/${league.id}`), league);
    tx.set(db.doc(`leagues/${league.id}/standings/current`), {
      revision: league.revision,
      table,
      final: false,
      updatedAt: now,
    });
    tx.set(
      db.doc(`leagues/${league.id}/audit/source_${eventId}_${league.revision}`),
      { action: 'source_changed', eventId, fixture: { ...fixture }, at: now },
    );
    note(
      league.ownerUid,
      `league_${league.id}`,
      'league',
      league.id,
      league.title,
      'source_changed',
    );
  };
}

export async function mutateCompetition(
  db: Firestore,
  uid: string,
  displayName: string,
  body: Record<string, unknown>,
  now: number,
) {
  const action = String(body.action || '');
  const operationId = id(body.operationId);
  const digest = hash(JSON.stringify(body));
  const receiptRef = db.doc(
    `competitionMutations/${hash(`${uid}:${operationId}`)}`,
  );
  const generatedId = db.collection('competitionEvents').doc().id;
  // Pushes go out only for the attempt that actually committed here — never for a replayed receipt.
  let notices: CompetitionNotice[] = [];
  let executed = false;
  const output = await db.runTransaction(async (tx) => {
    notices = [];
    executed = false;
    const note: Note = (to, key, kind, targetId, title, change) => {
      inbox(tx, db, to, key, kind, targetId, title, now, change, to === uid);
      if (to !== uid && shouldPush(change))
        notices.push({
          uid: to,
          action: change,
          targetKind: kind === 'entry' ? 'event' : kind,
          targetId,
          title,
        });
    };
    const receipt = await tx.get(receiptRef);
    if (receipt.exists) {
      ensure(receipt.data()?.digest === digest, 'operation_conflict');
      return receipt.data()!.result;
    }
    if (
      ['team-create', 'event-save', 'league-create'].includes(action) &&
      !body.eventId
    )
      ensure(
        process.env.COMPETITION_CREATION_ENABLED === 'true',
        'pilot_not_enabled',
        403,
      );
    const user = await data(tx, db, `users/${uid}`);
    const admin = user?.role === 'admin';
    const publicIdentity = await data(
      tx,
      db,
      `leaderboards/all-time/entries/${uid}`,
    );
    const name =
      publicIdentity?.hidden !== true &&
      isValidAlias(publicIdentity?.displayName)
        ? String(publicIdentity!.displayName).slice(0, 40)
        : defaultAlias(displayName || user?.displayName) || 'Participant';
    let result: Record<string, unknown> = { ok: true };
    switch (action) {
      case 'team-create': {
        const teamName = text(body.name, 60);
        ensure(teamName.length >= 3, 'name_required', 400);
        const schoolKey = body.schoolKey
          ? schoolIdentifier(body.schoolKey)
          : null;
        ensure(
          body.visibility !== 'school' || schoolKey,
          'school_required',
          400,
        );
        if (schoolKey)
          ensure(
            await schoolMember(tx, db, uid, schoolKey),
            'membership_pending',
            403,
          );
        const team: Team = {
          id: generatedId,
          name: teamName,
          captainUid: uid,
          members: [uid],
          schoolKey,
          visibility:
            body.visibility === 'school' && schoolKey ? 'school' : 'private',
          revision: 1,
          createdAt: now,
        };
        tx.create(teamRef(db, team.id), team);
        note(uid, `team_${team.id}`, 'team', team.id, team.name, 'created');
        result = { ok: true, teamId: team.id };
        break;
      }
      case 'team-invite': {
        const team = (await data(
          tx,
          db,
          `teams/${id(body.teamId)}`,
        )) as Team | null;
        ensure(team && team.captainUid === uid, 'forbidden', 403);
        const recipientUid = id(body.recipientUid);
        ensure(
          recipientUid !== uid && !team.members.includes(recipientUid),
          'already_member',
        );
        ensure(team.members.length < 12, 'team_full');
        const recipient = await data(tx, db, `users/${recipientUid}`);
        ensure(recipient, 'recipient_not_found', 404);
        const blocked = await data(
          tx,
          db,
          `competitionBlocks/${recipientUid}_${uid}`,
        );
        ensure(!blocked, 'invitation_unavailable', 403);
        const invite = {
          id: generatedId,
          teamId: team.id,
          senderUid: uid,
          recipientUid,
          teamName: team.name,
          status: 'pending',
          expiresAt: now + 7 * 86400000,
          createdAt: now,
        };
        tx.create(db.doc(`teamInvites/${invite.id}`), invite);
        note(
          recipientUid,
          `invite_${invite.id}`,
          'invite',
          invite.id,
          team.name,
          'invited',
        );
        result = { ok: true, inviteId: invite.id };
        break;
      }
      case 'invite-respond':
      case 'invite-revoke': {
        const invite = await data(tx, db, `teamInvites/${id(body.inviteId)}`);
        ensure(invite, 'invitation_not_found', 404);
        const team = (await data(
          tx,
          db,
          `teams/${invite.teamId}`,
        )) as Team | null;
        ensure(team, 'team_not_found', 404);
        if (action === 'invite-revoke')
          ensure(team.captainUid === uid, 'forbidden', 403);
        else ensure(invite.recipientUid === uid, 'wrong_account', 403);
        ensure(invite.status === 'pending', `invitation_${invite.status}`);
        ensure(now < invite.expiresAt, 'invitation_expired');
        const accept = action === 'invite-respond' && body.accept === true;
        if (accept) {
          ensure(
            team.members.length < 12 || team.members.includes(uid),
            'team_full',
          );
          if (team.schoolKey)
            ensure(
              await schoolMember(tx, db, uid, team.schoolKey),
              'membership_pending',
              403,
            );
          tx.update(teamRef(db, team.id), {
            members: [...new Set([...team.members, uid])],
            revision: team.revision + 1,
          });
          note(uid, `team_${team.id}`, 'team', team.id, team.name, 'joined');
        }
        // The other party learns the outcome; the invitation record itself shows it too.
        const outcome: InboxAction =
          action === 'invite-revoke'
            ? 'invite_revoked'
            : accept
              ? 'invite_accepted'
              : 'invite_declined';
        note(
          invite.recipientUid,
          `invite_${invite.id}`,
          'invite',
          invite.id,
          team.name,
          outcome,
        );
        if (action === 'invite-respond')
          note(
            invite.senderUid,
            `team_${team.id}`,
            'team',
            team.id,
            team.name,
            outcome,
          );
        tx.update(db.doc(`teamInvites/${invite.id}`), {
          status:
            action === 'invite-revoke'
              ? 'revoked'
              : accept
                ? 'accepted'
                : 'declined',
          respondedAt: now,
        });
        result = { ok: true, teamId: team.id };
        break;
      }
      case 'team-transfer':
      case 'team-leave': {
        const team = (await data(
          tx,
          db,
          `teams/${id(body.teamId)}`,
        )) as Team | null;
        ensure(team && team.members.includes(uid), 'forbidden', 403);
        if (action === 'team-transfer') {
          const next = id(body.recipientUid);
          ensure(
            team.captainUid === uid &&
              next !== uid &&
              team.members.includes(next),
            'forbidden',
            403,
          );
          tx.update(teamRef(db, team.id), {
            captainUid: next,
            revision: team.revision + 1,
          });
          note(
            next,
            `team_${team.id}`,
            'team',
            team.id,
            team.name,
            'captain_transferred',
          );
        } else {
          ensure(team.captainUid !== uid, 'transfer_captain_first');
          tx.update(teamRef(db, team.id), {
            members: team.members.filter((m) => m !== uid),
            revision: team.revision + 1,
          });
          tx.delete(db.doc(`users/${uid}/competitionInbox/team_${team.id}`));
          note(
            team.captainUid,
            `team_${team.id}`,
            'team',
            team.id,
            team.name,
            'member_left',
          );
        }
        break;
      }
      case 'team-visibility':
      case 'recruitment-request':
      case 'recruitment-review': {
        const teamId = id(body.teamId),
          team = (await data(tx, db, `teams/${teamId}`)) as Team | null;
        ensure(team, 'not_found', 404);
        if (action === 'team-visibility') {
          ensure(team.captainUid === uid, 'captain_required', 403);
          ensure(
            body.visibility === 'private' ||
              (body.visibility === 'school' && team.schoolKey),
            'school_required',
            400,
          );
          tx.update(teamRef(db, teamId), {
            visibility: body.visibility,
            revision: team.revision + 1,
          });
          break;
        }
        if (action === 'recruitment-request') {
          ensure(
            team.visibility === 'school' &&
              team.schoolKey &&
              !team.members.includes(uid),
            'recruitment_unavailable',
          );
          ensure(
            await schoolMember(tx, db, uid, team.schoolKey),
            'membership_pending',
            403,
          );
          const blocked = await data(
            tx,
            db,
            `competitionBlocks/${team.captainUid}_${uid}`,
          );
          ensure(!blocked, 'recruitment_unavailable', 403);
          tx.set(db.doc(`teams/${teamId}/requests/${uid}`), {
            uid,
            publicName: name,
            status: 'pending',
            createdAt: now,
          });
          note(
            team.captainUid,
            `team_${teamId}`,
            'team',
            teamId,
            team.name,
            'recruitment_requested',
          );
          break;
        }
        ensure(team.captainUid === uid, 'captain_required', 403);
        const subjectUid = id(body.recipientUid),
          request = await data(
            tx,
            db,
            `teams/${teamId}/requests/${subjectUid}`,
          );
        ensure(request?.status === 'pending', 'request_unavailable');
        if (body.approve === true) {
          ensure(
            team.members.length < 12 || team.members.includes(subjectUid),
            'team_full',
          );
          ensure(
            team.schoolKey &&
              (await schoolMember(tx, db, subjectUid, team.schoolKey)),
            'membership_pending',
            403,
          );
          tx.update(teamRef(db, teamId), {
            members: [...new Set([...team.members, subjectUid])],
            revision: team.revision + 1,
          });
        }
        note(
          subjectUid,
          `team_${teamId}`,
          'team',
          teamId,
          team.name,
          body.approve === true ? 'recruitment_accepted' : 'recruitment_declined',
        );
        tx.update(db.doc(`teams/${teamId}/requests/${subjectUid}`), {
          status: body.approve === true ? 'accepted' : 'declined',
          reviewedAt: now,
        });
        break;
      }
      case 'event-follow': {
        const e = (await data(
          tx,
          db,
          `competitionEvents/${id(body.eventId)}`,
        )) as CompetitionEvent | null;
        ensure(e, 'not_found', 404);
        const claim = await data(tx, db, `entryClaims/${e.id}_${uid}`);
        const member = e.schoolKey
          ? await schoolMember(tx, db, uid, e.schoolKey)
          : false;
        ensure(
          e.state !== 'draft' &&
            (e.audience === 'public' ||
              e.ownerUid === uid ||
              claim ||
              (e.audience === 'school' && member)),
          'forbidden',
          403,
        );
        const ref = db.doc(`users/${uid}/competitionFollows/${e.id}`);
        // Server-only reverse index so announce/postpone/cancel can reach followers without a collection-group scan.
        const follower = db.doc(`competitionEvents/${e.id}/followers/${uid}`);
        if (body.follow === true) {
          tx.set(ref, { eventId: e.id, createdAt: now });
          tx.set(follower, { uid, createdAt: now });
          note(uid, `follow_${e.id}`, 'event', e.id, e.title, 'following');
        } else {
          tx.delete(ref);
          tx.delete(follower);
          tx.delete(db.doc(`users/${uid}/competitionInbox/follow_${e.id}`));
        }
        break;
      }
      case 'membership-request': {
        const schoolKey = schoolIdentifier(body.schoolKey);
        const school = await canonicalSchool(tx, db, schoolKey);
        const previous = await data(
          tx,
          db,
          `schoolMemberships/${schoolKey}_${uid}`,
        );
        ensure(previous?.status !== 'approved', 'already_approved');
        const hosts = await tx.get(
          db
            .collection('schoolRoles')
            .where('schoolKey', '==', schoolKey)
            .where('status', '==', 'approved')
            .limit(20),
        );
        tx.set(db.doc(`schoolMemberships/${schoolKey}_${uid}`), {
          uid,
          schoolKey,
          status: 'pending',
          requestedAt: now,
        });
        for (const host of hosts.docs)
          if (host.data().role === 'host')
            note(
              String(host.data().uid),
              schoolInboxKey(schoolKey),
              'school',
              schoolKey,
              school.name,
              'membership_requested',
            );
        break;
      }
      case 'membership-review':
      case 'school-host-review': {
        const schoolKey = schoolIdentifier(body.schoolKey),
          subjectUid = id(body.recipientUid);
        ensure(
          action === 'school-host-review'
            ? admin
            : await schoolRole(tx, db, uid, schoolKey, admin),
          'forbidden',
          403,
        );
        const school = await canonicalSchool(tx, db, schoolKey);
        tx.set(
          db.doc(
            `${action === 'school-host-review' ? 'schoolRoles' : 'schoolMemberships'}/${schoolKey}_${subjectUid}`,
          ),
          {
            uid: subjectUid,
            schoolKey,
            status: body.approve === true ? 'approved' : 'revoked',
            ...(action === 'school-host-review' ? { role: 'host' } : {}),
            reviewedBy: uid,
            reviewedAt: now,
          },
        );
        note(
          subjectUid,
          schoolInboxKey(schoolKey),
          'school',
          schoolKey,
          school.name,
          action === 'school-host-review'
            ? body.approve === true
              ? 'host_approved'
              : 'host_revoked'
            : body.approve === true
              ? 'membership_approved'
              : 'membership_revoked',
        );
        break;
      }
      case 'event-save': {
        const old = body.eventId
          ? ((await data(
              tx,
              db,
              `competitionEvents/${id(body.eventId)}`,
            )) as CompetitionEvent | null)
          : null;
        if (body.eventId) {
          ensure(old, 'not_found', 404);
          manage(old, uid, admin);
          ensure(old.state === 'draft', 'draft_required');
          ensure(old.revision === body.revision, 'revision_conflict');
        }
        const cfgInput = body.config as Record<string, unknown>;
        ensure(cfgInput && typeof cfgInput === 'object', 'invalid_config', 400);
        const valid = validateTournamentInput(
          { ...cfgInput, teamRule: 'solo', creatorPlays: false },
          now,
          TRIVIA_CATEGORIES.map((c) => c.id),
        );
        ensure(valid.ok, 'invalid_config', 400);
        ensure(valid.config.maxPlayers <= 60, 'pilot_capacity_exceeded', 400);
        const schoolKey = body.schoolKey
          ? schoolIdentifier(body.schoolKey)
          : null;
        const school = schoolKey
          ? await canonicalSchool(tx, db, schoolKey)
          : null;
        const delivery =
          body.delivery === 'physical' || body.delivery === 'external'
            ? body.delivery
            : 'online';
        const verifiedHost = await schoolRole(
          tx,
          db,
          old?.ownerUid ?? uid,
          schoolKey,
          admin,
        );
        if (delivery !== 'online')
          ensure(verifiedHost && schoolKey, 'verified_host_required', 403);
        if (schoolKey && !verifiedHost)
          ensure(await schoolMember(tx, db, old?.ownerUid ?? uid, schoolKey), 'membership_pending', 403);
        const entryMode =
          body.entryMode === 'named_team' ? 'named_team' : 'individual';
        ensure(
          entryMode !== 'named_team' ||
            ['live', 'window'].includes(valid.config.format),
          'unsupported_mode',
          400,
        );
        const audience =
          body.audience === 'school' || body.audience === 'private'
            ? body.audience
            : 'public';
        ensure(audience !== 'school' || schoolKey, 'school_required', 400);
        const registrationClosesAt = Number(body.registrationClosesAt);
        ensure(
          Number.isFinite(registrationClosesAt) &&
            registrationClosesAt > now &&
            registrationClosesAt <= valid.config.startsAt,
          'invalid_deadline',
          400,
        );
        const externalUrl = text(body.externalUrl, 500);
        ensure(
          delivery !== 'external' ||
            /^https:\/\/[a-z0-9][^\s]*$/i.test(externalUrl),
          'external_url_required',
          400,
        );
        // Pilot defaults to no material rewards; provider/contact are mandatory if offered.
        const rawReward = body.reward as Record<string, unknown> | undefined;
        const reward =
          rawReward && text(rawReward.description)
            ? {
                description: text(rawReward.description),
                provider: text(rawReward.provider, 80),
                contact: text(rawReward.contact),
              }
            : null;
        if (reward) {
          ensure(
            verifiedHost && reward.provider && reward.contact,
            'reward_provider_required',
            400,
          );
          ensure(delivery === 'external', 'rewards_external_only', 400);
        }
        const e: CompetitionEvent = {
          id: old?.id ?? generatedId,
          title: valid.config.title,
          description: valid.config.description,
          ownerUid: old?.ownerUid ?? uid,
          hostName: old?.hostName ?? name,
          hostKind: verifiedHost && schoolKey ? 'school' : 'student',
          schoolKey,
          department: school
            ? school.departement || null
            : text(body.department, 60) || null,
          audience,
          entryPolicy:
            body.entryPolicy === 'approval' || body.entryPolicy === 'invitation'
              ? body.entryPolicy
              : 'open',
          entryMode,
          delivery,
          state: 'draft',
          config: valid.config,
          registrationClosesAt,
          revision: (old?.revision ?? 0) + 1,
          entryCount: 0,
          tournamentId: null,
          cohosts: old?.cohosts ?? {},
          venue: text(body.venue),
          instructions: text(body.instructions, 1000),
          externalUrl,
          resultStatus: 'pending',
          resultRevision: 0,
          resultRows: [],
          reward,
          createdAt: old?.createdAt ?? now,
          updatedAt: now,
        };
        tx.set(eventRef(db, e.id), e);
        note(uid, `event_${e.id}`, 'event', e.id, e.title, 'draft_saved');
        result = { ok: true, eventId: e.id, revision: e.revision };
        break;
      }
      case 'event-publish': {
        const e = (await data(
          tx,
          db,
          `competitionEvents/${id(body.eventId)}`,
        )) as CompetitionEvent | null;
        ensure(e, 'not_found', 404);
        manage(e, uid, admin);
        ensure(
          e.state === 'draft' && e.revision === body.revision,
          'revision_conflict',
        );
        ensure(
          e.registrationClosesAt > now && e.config.startsAt > now + 120000,
          'schedule_expired',
        );
        if (e.hostKind === 'school' || e.delivery !== 'online')
          ensure(
            await schoolRole(tx, db, e.ownerUid, e.schoolKey, admin),
            'host_role_revoked',
            403,
          );
        const schedule = buildSchedule(e.config);
        if (e.delivery !== 'external') {
          const plan = poolPlan(e.config);
          const drawn = drawQuestions(
            TRIVIA_QUESTIONS as unknown as Record<string, BankQuestion[]>,
            e.config.categories,
            plan.pools * plan.perPool,
            Math.random,
          );
          const pools = splitPools(drawn, plan.pools, plan.min);
          ensure(pools, 'not_enough_questions', 400);
          const tid = e.id;
          tx.create(db.doc(`userTournaments/${tid}`), {
            ...e.config,
            schemaVersion: 2,
            competitionEventId: e.id,
            visibility: e.audience === 'public' ? 'public' : 'private',
            id: tid,
            creatorUid: e.ownerUid,
            creatorName: e.hostName,
            pin: '',
            state: 'scheduled',
            schedule,
            nextDeadlineAt: schedule.startsAt,
            playerCount: 0,
            currentRound: -1,
            closedThrough: -1,
            bracketRounds: 0,
            winner: null,
            standingsDirty: false,
            createdAt: now,
            updatedAt: now,
          });
          pools.forEach((items, r) =>
            tx.create(
              db.doc(
                `userTournaments/${tid}/questions/${e.config.format === 'live' ? 'live' : `r${r}`}`,
              ),
              { items },
            ),
          );
          if (e.config.format === 'live')
            tx.create(db.doc(`userTournaments/${tid}/live/state`), {
              phase: 'lobby',
              index: -1,
              opensAt: schedule.startsAt,
              closesAt: schedule.startsAt + schedule.questionMs,
              revealUntil:
                schedule.startsAt + schedule.questionMs + schedule.revealMs,
              questionCount: e.config.questionCount,
              questionMs: schedule.questionMs,
              question: null,
              reveal: null,
              updatedAt: now,
            });
          tx.create(db.doc(`userTournaments/${tid}/standings/current`), {
            rows: [],
            teams: [],
            total: 0,
            final: false,
            updatedAt: now,
          });
        }
        const updated: CompetitionEvent = {
          ...e,
          state: 'published',
          tournamentId: e.delivery === 'external' ? null : e.id,
          updatedAt: now,
          revision: e.revision + 1,
        };
        tx.set(eventRef(db, e.id), updated);
        publishProjection(tx, db, updated);
        note(e.ownerUid, `event_${e.id}`, 'event', e.id, e.title, 'published');
        result = { ok: true, eventId: e.id };
        break;
      }
      case 'roster-save': {
        const e = (await data(
          tx,
          db,
          `competitionEvents/${id(body.eventId)}`,
        )) as CompetitionEvent | null;
        ensure(e, 'not_found', 404);
        registrationOpen(e, now);
        const team = body.teamId
          ? ((await data(tx, db, `teams/${id(body.teamId)}`)) as Team | null)
          : null;
        ensure(
          e.entryMode === 'individual' ? !team : team?.captainUid === uid,
          'captain_required',
          403,
        );
        const starters =
          e.entryMode === 'individual' ? [uid] : list(body.starters);
        const entryId = team?.id ?? uid;
        const old = (await data(
          tx,
          db,
          `competitionEvents/${e.id}/entries/${entryId}`,
        )) as EventEntry | null;
        ensure(!old || old.state !== 'registered', 'roster_locked');
        if (team)
          ensure(
            !rosterProblem(starters, team.members, starters),
            'roster_incomplete',
          );
        const entry: EventEntry = {
          id: entryId,
          eventId: e.id,
          captainUid: uid,
          teamId: team?.id ?? null,
          label: team?.name ?? name,
          starters,
          confirmed: starters.includes(uid) ? [uid] : [],
          state: 'draft',
          revision: (old?.revision ?? 0) + 1,
          policyVersion: team ? TEAM_POLICY : 'individual-v1',
          rosterSchoolKey: e.schoolKey,
          lockedAt: null,
        };
        tx.set(db.doc(`competitionEvents/${e.id}/entries/${entryId}`), entry);
        note(uid, `entry_${e.id}_${entryId}`, 'entry', e.id, e.title, 'roster_saved');
        // Only newly listed starters are asked to confirm; a re-save does not re-ping the rest.
        for (const member of starters)
          if (member !== uid)
            note(
              member,
              `entry_${e.id}_${entryId}`,
              'entry',
              e.id,
              e.title,
              old?.starters.includes(member) ? 'roster_saved' : 'confirm_requested',
            );
        result = { ok: true, entryId };
        break;
      }
      case 'entry-confirm':
      case 'entry-register':
      case 'entry-withdraw':
      case 'entry-approve': {
        const e = (await data(
          tx,
          db,
          `competitionEvents/${id(body.eventId)}`,
        )) as CompetitionEvent | null;
        ensure(e, 'not_found', 404);
        registrationOpen(e, now);
        const entry = (await data(
          tx,
          db,
          `competitionEvents/${e.id}/entries/${id(body.entryId)}`,
        )) as EventEntry | null;
        ensure(entry, 'entry_not_found', 404);
        const ref = db.doc(`competitionEvents/${e.id}/entries/${entry.id}`);
        if (action === 'entry-confirm') {
          ensure(
            entry.state === 'draft' && entry.starters.includes(uid),
            'forbidden',
            403,
          );
          const confirmed = [...new Set([...entry.confirmed, uid])];
          tx.update(ref, { confirmed });
          note(
            entry.captainUid,
            `entry_${e.id}_${entry.id}`,
            'entry',
            e.id,
            e.title,
            entry.starters.every((m) => confirmed.includes(m))
              ? 'roster_ready'
              : 'starter_confirmed',
          );
          break;
        }
        if (action === 'entry-approve') {
          manage(e, uid, admin);
          ensure(entry.state === 'draft', 'roster_locked');
          tx.set(db.doc(`competitionEvents/${e.id}/approvals/${entry.id}`), {
            approved: body.approve === true,
            approvedBy: uid,
            approvedAt: now,
          });
          note(
            entry.captainUid,
            `entry_${e.id}_${entry.id}`,
            'entry',
            e.id,
            e.title,
            body.approve === true ? 'entry_approved' : 'entry_refused',
          );
          break;
        }
        ensure(entry.captainUid === uid, 'captain_required', 403);
        const engine = e.tournamentId
          ? await data(tx, db, `userTournaments/${e.tournamentId}`)
          : null;
        if (action === 'entry-withdraw') {
          ensure(entry.state === 'registered', 'not_registered');
          tx.update(ref, { state: 'withdrawn' });
          tx.update(eventRef(db, e.id), {
            entryCount: Math.max(0, e.entryCount - 1),
          });
          for (const member of entry.starters) {
            tx.delete(db.doc(`entryClaims/${e.id}_${member}`));
            if (e.tournamentId) {
              tx.delete(
                db.doc(`userTournaments/${e.tournamentId}/roster/${member}`),
              );
              tx.delete(
                db.doc(`userTournaments/${e.tournamentId}/players/${member}`),
              );
            }
          }
          if (engine && e.tournamentId)
            tx.update(db.doc(`userTournaments/${e.tournamentId}`), {
              playerCount: Math.max(
                0,
                engine.playerCount - entry.starters.length,
              ),
            });
          for (const member of entry.starters)
            note(
              member,
              `entry_${e.id}_${entry.id}`,
              'entry',
              e.id,
              e.title,
              'withdrawn',
            );
          break;
        }
        if (entry.state === 'registered') {
          result = { ok: true, entryId: entry.id, already: true };
          break;
        }
        ensure(entry.state === 'draft', 'draft_required');
        const team = entry.teamId
          ? ((await data(tx, db, `teams/${entry.teamId}`)) as Team | null)
          : null;
        if (entry.teamId) {
          ensure(team?.captainUid === uid, 'captain_required', 403);
          ensure(
            !rosterProblem(entry.starters, team.members, entry.confirmed),
            'roster_not_ready',
          );
        } else
          ensure(
            entry.starters.length === 1 && entry.starters[0] === uid,
            'invalid_roster',
          );
        const approval = await data(
          tx,
          db,
          `competitionEvents/${e.id}/approvals/${entry.id}`,
        );
        if (e.entryPolicy !== 'open')
          ensure(
            approval?.approved === true,
            e.entryPolicy === 'invitation'
              ? 'invitation_required'
              : 'approval_required',
            403,
          );
        ensure(
          e.entryCount <
            (e.entryMode === 'named_team'
              ? Math.min(50, Math.floor(e.config.maxPlayers / 3))
              : e.config.maxPlayers),
          'event_full',
        );
        const profiles: DocumentData[] = [];
        const publicNames: string[] = [];
        for (const member of entry.starters) {
          const claim = await data(tx, db, `entryClaims/${e.id}_${member}`);
          ensure(!claim, 'conflicting_entry');
          if (e.schoolKey)
            ensure(
              await schoolMember(tx, db, member, e.schoolKey),
              'membership_pending',
              403,
            );
          const profile = await data(tx, db, `users/${member}`);
          ensure(profile, 'member_unavailable', 400);
          profiles.push(profile);
          const alias = await data(
            tx,
            db,
            `leaderboards/all-time/entries/${member}`,
          );
          publicNames.push(
            alias?.hidden !== true && isValidAlias(alias?.displayName)
              ? String(alias!.displayName).slice(0, 40)
              : defaultAlias(profile.displayName) || 'Participant',
          );
        }
        ensure(
          !e.tournamentId || engine?.state === 'scheduled',
          'event_started',
        );
        ensure(
          !engine ||
            engine.playerCount + entry.starters.length <= engine.maxPlayers,
          'event_full',
        );
        entry.starters.forEach((member, i) => {
          tx.create(db.doc(`entryClaims/${e.id}_${member}`), {
            eventId: e.id,
            entryId: entry.id,
            uid: member,
            lockedAt: now,
          });
          if (engine && e.tournamentId) {
            const memberName = publicNames[i];
            tx.create(
              db.doc(`userTournaments/${e.tournamentId}/roster/${member}`),
              {
                uid: member,
                displayName: memberName,
                school: e.schoolKey,
                grade: null,
                seed: engine.playerCount + i + 1,
                joinedAt: now,
              },
            );
            tx.create(
              db.doc(`userTournaments/${e.tournamentId}/players/${member}`),
              emptyPlayer(member, memberName, e.schoolKey, null),
            );
            tx.set(db.doc(`users/${member}/myTournaments/${e.tournamentId}`), {
              tid: e.tournamentId,
              title: e.title,
              format: e.config.format,
              startsAt: e.config.startsAt,
              role: 'player',
              joinedAt: now,
            });
          }
        });
        tx.update(ref, { state: 'registered', lockedAt: now });
        tx.update(eventRef(db, e.id), {
          entryCount: e.entryCount + 1,
          updatedAt: now,
        });
        if (engine && e.tournamentId)
          tx.update(db.doc(`userTournaments/${e.tournamentId}`), {
            playerCount: engine.playerCount + entry.starters.length,
          });
        for (const member of entry.starters)
          note(
            member,
            `entry_${e.id}_${entry.id}`,
            'entry',
            e.id,
            e.title,
            'registered',
          );
        result = { ok: true, entryId: entry.id };
        break;
      }
      case 'event-cancel':
      case 'event-no-contest':
      case 'event-close':
      case 'event-cohost':
      case 'event-announce':
      case 'event-postpone': {
        const e = (await data(
          tx,
          db,
          `competitionEvents/${id(body.eventId)}`,
        )) as CompetitionEvent | null;
        ensure(e, 'not_found', 404);
        manage(e, uid, admin);
        if (e.hostKind === 'school')
          ensure(
            await schoolRole(tx, db, e.ownerUid, e.schoolKey, admin),
            'host_role_revoked',
            403,
          );
        const engine = e.tournamentId
          ? await data(tx, db, `userTournaments/${e.tournamentId}`)
          : null;
        const entries = await tx.get(
          db.collection(`competitionEvents/${e.id}/entries`),
        );
        const disputes = await tx.get(
          db
            .collection(`competitionEvents/${e.id}/disputes`)
            .where('state', '==', 'open')
            .limit(1),
        );
        // Bounded so participants + followers stay well inside one transaction's write limit.
        const followers = [
          'event-cancel',
          'event-no-contest',
          'event-postpone',
          'event-announce',
        ].includes(action)
          ? await tx.get(
              db.collection(`competitionEvents/${e.id}/followers`).limit(100),
            )
          : null;
        const invalidate = [
          'event-cancel',
          'event-no-contest',
          'event-postpone',
        ].includes(action)
          ? await prepareLeagueInvalidation(
              tx,
              db,
              e.id,
              now,
              note,
              action === 'event-postpone' ? Number(body.startsAt) : undefined,
            )
          : () => undefined;
        const updated = { ...e, revision: e.revision + 1, updatedAt: now };
        if (action === 'event-cohost') {
          ensure(e.ownerUid === uid || admin, 'forbidden', 403);
          const recipientUid = id(body.recipientUid);
          ensure(
            Object.keys(e.cohosts).length < 8 || e.cohosts[recipientUid],
            'cohost_limit',
          );
          if (body.role === 'remove') delete updated.cohosts[recipientUid];
          else {
            ensure(
              body.role === 'manage' || body.role === 'checkin',
              'invalid_role',
              400,
            );
            updated.cohosts[recipientUid] = body.role;
          }
          note(
            recipientUid,
            `event_${e.id}`,
            'event',
            e.id,
            e.title,
            body.role === 'remove' ? 'cohost_removed' : 'cohost_granted',
          );
        } else if (action === 'event-announce') {
          const message = text(body.message, 1000);
          ensure(message, 'message_required', 400);
          tx.create(
            db.doc(`competitionEvents/${e.id}/announcements/${generatedId}`),
            { id: generatedId, message, createdAt: now },
          );
        } else if (action === 'event-postpone') {
          ensure(
            e.state === 'published' &&
              now < e.config.startsAt &&
              (!engine || engine.state === 'scheduled'),
            'already_started',
          );
          const startsAt = Number(body.startsAt);
          ensure(
            Number.isFinite(startsAt) &&
              startsAt > now + 120000 &&
              startsAt < now + 60 * 86400000,
            'invalid_schedule',
            400,
          );
          updated.config = { ...e.config, startsAt };
          updated.registrationClosesAt = startsAt;
          updated.entryCount = 0;
          invalidate();
          // Reconfirmation is explicit: prior entries become drafts and claims/engine seats are released atomically.
          for (const row of entries.docs) {
            const entry = row.data() as EventEntry;
            tx.update(row.ref, {
              state: 'draft',
              confirmed: [],
              lockedAt: null,
              revision: entry.revision + 1,
            });
            for (const member of entry.starters) {
              tx.delete(db.doc(`entryClaims/${e.id}_${member}`));
              note(
                member,
                `entry_${e.id}_${entry.id}`,
                'entry',
                e.id,
                e.title,
                'reconfirm_needed',
              );
              if (e.tournamentId) {
                tx.delete(
                  db.doc(`userTournaments/${e.tournamentId}/roster/${member}`),
                );
                tx.delete(
                  db.doc(`userTournaments/${e.tournamentId}/players/${member}`),
                );
              }
            }
          }
          if (e.tournamentId) {
            const schedule = buildSchedule(updated.config);
            tx.update(db.doc(`userTournaments/${e.tournamentId}`), {
              startsAt,
              schedule,
              nextDeadlineAt: startsAt,
              playerCount: 0,
              updatedAt: now,
            });
            if (e.config.format === 'live')
              tx.update(
                db.doc(`userTournaments/${e.tournamentId}/live/state`),
                {
                  opensAt: startsAt,
                  closesAt: startsAt + schedule.questionMs,
                  revealUntil:
                    startsAt + schedule.questionMs + schedule.revealMs,
                },
              );
          }
        } else if (action === 'event-close') {
          ensure(disputes.empty, 'unresolved_disputes');
          ensure(
            e.state === 'published' &&
              (engine
                ? engine.state === 'finished' && !engine.standingsDirty
                : ['confirmed', 'no_contest'].includes(e.resultStatus)),
            'result_not_ready',
          );
          updated.state = 'closed';
        } else {
          ensure(e.state !== 'closed', 'already_closed');
          invalidate();
          updated.state = 'cancelled';
          updated.resultStatus =
            action === 'event-no-contest' ? 'no_contest' : e.resultStatus;
          if (e.tournamentId)
            tx.update(db.doc(`userTournaments/${e.tournamentId}`), {
              state: 'cancelled',
              nextDeadlineAt: null,
              winner: null,
              winningEntrants: [],
              updatedAt: now,
            });
          if (e.tournamentId)
            tx.set(
              db.doc(`userTournaments/${e.tournamentId}/standings/current`),
              { final: false, void: true },
              { merge: true },
            );
        }
        tx.set(eventRef(db, e.id), updated);
        publishProjection(tx, db, updated);
        tx.create(db.doc(`competitionEvents/${e.id}/audit/${generatedId}`), {
          action,
          actorUid: uid,
          revision: updated.revision,
          at: now,
        });
        // Co-host changes reach the co-host alone (above); everything else reaches every listed starter.
        const change: InboxAction | null =
          action === 'event-cancel'
            ? 'cancelled'
            : action === 'event-no-contest'
              ? 'no_contest'
              : action === 'event-close'
                ? 'closed'
                : action === 'event-announce'
                  ? 'announcement'
                  : null;
        if (change)
          for (const row of entries.docs)
            for (const member of (row.data() as EventEntry).starters)
              note(
                member,
                `entry_${e.id}_${row.id}`,
                'entry',
                e.id,
                e.title,
                change,
              );
        for (const row of followers?.docs ?? [])
          note(
            row.id,
            `follow_${e.id}`,
            'event',
            e.id,
            e.title,
            action === 'event-postpone' ? 'postponed' : change!,
          );
        break;
      }
      case 'checkin': {
        const e = (await data(
          tx,
          db,
          `competitionEvents/${id(body.eventId)}`,
        )) as CompetitionEvent | null;
        ensure(e, 'not_found', 404);
        ensure(
          e.delivery === 'physical' && e.state === 'published',
          'checkin_unavailable',
        );
        ensure(
          e.ownerUid === uid ||
            ['manage', 'checkin'].includes(e.cohosts[uid]) ||
            admin,
          'forbidden',
          403,
        );
        ensure(
          await schoolRole(tx, db, e.ownerUid, e.schoolKey, admin),
          'host_role_revoked',
          403,
        );
        const member = id(body.recipientUid),
          claim = await data(tx, db, `entryClaims/${e.id}_${member}`);
        ensure(claim, 'not_registered', 404);
        tx.set(db.doc(`competitionEvents/${e.id}/attendance/${member}`), {
          uid: member,
          checkedInAt: now,
          checkedInBy: uid,
        });
        break;
      }
      case 'event-report-result':
      case 'event-confirm-result': {
        const e = (await data(
          tx,
          db,
          `competitionEvents/${id(body.eventId)}`,
        )) as CompetitionEvent | null;
        ensure(e, 'not_found', 404);
        manage(e, uid, admin);
        ensure(
          e.delivery === 'external' &&
            ['published', 'closed'].includes(e.state),
          'external_event_required',
        );
        ensure(
          await schoolRole(tx, db, e.ownerUid, e.schoolKey, admin),
          'host_role_revoked',
          403,
        );
        ensure(e.resultRevision === body.revision, 'revision_conflict');
        const entries = await tx.get(
          db.collection(`competitionEvents/${e.id}/entries`),
        );
        const accepted = new Set(
          entries.docs
            .filter((d) => d.data().state === 'registered')
            .map((d) => d.id),
        );
        const rows = body.rows as Array<{ entryId: string; score: number }>;
        if (action === 'event-report-result')
          ensure(
            Array.isArray(rows) &&
              rows.length <= 50 &&
              rows.length > 0 &&
              new Set(rows.map((r) => r.entryId)).size === rows.length &&
              rows.every(
                (r) =>
                  accepted.has(r.entryId) &&
                  Number.isFinite(r.score) &&
                  r.score >= 0 &&
                  r.score <= 100,
              ),
            'invalid_result',
            400,
          );
        else
          ensure(
            e.resultStatus === 'reported' || e.resultStatus === 'disputed',
            'report_required',
          );
        if (action === 'event-confirm-result') {
          const disputes = await tx.get(
            db
              .collection(`competitionEvents/${e.id}/disputes`)
              .where('state', '==', 'open')
              .limit(1),
          );
          ensure(disputes.empty, 'unresolved_disputes');
        }
        const invalidate =
          action === 'event-report-result'
            ? await prepareLeagueInvalidation(tx, db, e.id, now, note)
            : () => undefined;
        const resultRows =
          action === 'event-report-result'
            ? rows.map((r) => ({ entryId: r.entryId, score: r.score }))
            : e.resultRows;
        invalidate();
        tx.update(eventRef(db, e.id), {
          resultStatus:
            action === 'event-report-result' ? 'reported' : 'confirmed',
          resultRows,
          resultRevision: e.resultRevision + 1,
          updatedAt: now,
        });
        tx.create(db.doc(`competitionEvents/${e.id}/audit/${generatedId}`), {
          action,
          actorUid: uid,
          revision: e.resultRevision + 1,
          resultRows,
          at: now,
        });
        // Only that a result exists — scores stay behind the event page's own permission check.
        for (const row of entries.docs)
          if (accepted.has(row.id))
            for (const member of (row.data() as EventEntry).starters)
              note(
                member,
                `entry_${e.id}_${row.id}`,
                'entry',
                e.id,
                e.title,
                action === 'event-report-result'
                  ? 'result_released'
                  : 'result_confirmed',
              );
        break;
      }
      case 'event-dispute': {
        const e = (await data(
          tx,
          db,
          `competitionEvents/${id(body.eventId)}`,
        )) as CompetitionEvent | null;
        ensure(e, 'not_found', 404);
        const claim = await data(tx, db, `entryClaims/${e.id}_${uid}`);
        ensure(claim, 'participant_required', 403);
        const reason = text(body.reason, 1000);
        ensure(reason.length >= 5, 'reason_required', 400);
        const invalidate = await prepareLeagueInvalidation(tx, db, e.id, now, note);
        invalidate();
        for (const organizer of [
          e.ownerUid,
          ...Object.keys(e.cohosts).filter((k) => e.cohosts[k] === 'manage'),
        ])
          note(organizer, `event_${e.id}`, 'event', e.id, e.title, 'dispute_opened');
        tx.create(db.doc(`competitionEvents/${e.id}/disputes/${generatedId}`), {
          id: generatedId,
          uid,
          reason,
          state: 'open',
          createdAt: now,
        });
        if (e.delivery === 'external')
          tx.update(eventRef(db, e.id), {
            resultStatus: 'disputed',
            updatedAt: now,
          });
        break;
      }
      case 'dispute-resolve': {
        const e = (await data(
          tx,
          db,
          `competitionEvents/${id(body.eventId)}`,
        )) as CompetitionEvent | null;
        ensure(e, 'not_found', 404);
        manage(e, uid, admin);
        const disputeId = id(body.disputeId);
        const dispute = await data(
          tx,
          db,
          `competitionEvents/${e.id}/disputes/${disputeId}`,
        );
        ensure(dispute, 'not_found', 404);
        const resolution = text(body.resolution, 1000);
        ensure(resolution.length >= 5, 'resolution_required', 400);
        tx.update(db.doc(`competitionEvents/${e.id}/disputes/${disputeId}`), {
          state: 'resolved',
          resolution,
          resolvedBy: uid,
          resolvedAt: now,
        });
        note(
          String(dispute.uid),
          `event_${e.id}`,
          'event',
          e.id,
          e.title,
          'dispute_resolved',
        );
        break;
      }
      case 'reward-update': {
        const e = (await data(
          tx,
          db,
          `competitionEvents/${id(body.eventId)}`,
        )) as CompetitionEvent | null;
        ensure(e?.reward, 'no_reward', 404);
        manage(e, uid, admin);
        const engine = e.tournamentId
          ? await data(tx, db, `userTournaments/${e.tournamentId}`)
          : null;
        ensure(
          engine
            ? engine.state === 'finished' && !engine.standingsDirty
            : e.resultStatus === 'confirmed',
          'result_not_final',
        );
        const entryId = id(body.entryId);
        const entry = await data(
          tx,
          db,
          `competitionEvents/${e.id}/entries/${entryId}`,
        );
        ensure(entry?.state === 'registered', 'entry_not_found', 404);
        const disputes = await tx.get(
          db
            .collection(`competitionEvents/${e.id}/disputes`)
            .where('state', '==', 'open')
            .limit(1),
        );
        ensure(disputes.empty, 'unresolved_disputes');
        const status = body.status;
        ensure(
          ['eligible', 'fulfillment_pending', 'fulfilled', 'disputed'].includes(
            String(status),
          ),
          'invalid_status',
          400,
        );
        tx.set(db.doc(`competitionEvents/${e.id}/rewards/${entryId}`), {
          entryId,
          status,
          reportedBy: uid,
          updatedAt: now,
        });
        break;
      }
      case 'league-create': {
        const schoolKey = schoolIdentifier(body.schoolKey);
        ensure(
          await schoolRole(tx, db, uid, schoolKey, admin),
          'verified_host_required',
          403,
        );
        const title = text(body.title, 60);
        ensure(title.length >= 3, 'title_required', 400);
        const league: League = {
          id: generatedId,
          title,
          ownerUid: uid,
          schoolKey,
          public: body.public === true,
          state: 'draft',
          entrants: [],
          fixtures: [],
          revision: 1,
          rosterPolicy: 'per-fixture-three',
          scoringPolicy: '3-1-0-difference-scored-v1',
          sourcePolicy:
            body.sourcePolicy === 'external_100_points_v1'
              ? 'external_100_points_v1'
              : 'app_quiz_10x20_window24',
          createdAt: now,
        };
        tx.create(db.doc(`leagues/${league.id}`), league);
        note(uid, `league_${league.id}`, 'league', league.id, league.title, 'created');
        result = { ok: true, leagueId: league.id };
        break;
      }
      case 'fixture-link':
      case 'league-enroll':
      case 'league-start':
      case 'fixture-update':
      case 'league-reopen':
      case 'league-close': {
        const league = (await data(
          tx,
          db,
          `leagues/${id(body.leagueId)}`,
        )) as League | null;
        ensure(league, 'not_found', 404);
        ensure(league.ownerUid === uid || admin, 'forbidden', 403);
        ensure(
          await schoolRole(tx, db, uid, league.schoolKey, admin),
          'host_role_revoked',
          403,
        );
        ensure(league.revision === body.revision, 'revision_conflict');
        if (action === 'league-enroll') {
          ensure(
            league.state === 'draft' && league.entrants.length < 12,
            'enrollment_closed',
          );
          const team = (await data(
            tx,
            db,
            `teams/${id(body.teamId)}`,
          )) as Team | null;
          ensure(
            team &&
              team.schoolKey === league.schoolKey &&
              team.members.length >= 3,
            'team_ineligible',
          );
          // A captain must explicitly consent to enrollment before an organizer adds the team.
          const consent = await data(
            tx,
            db,
            `leagueConsents/${league.id}_${team.id}`,
          );
          ensure(
            consent?.captainUid === team.captainUid,
            'captain_consent_required',
          );
          ensure(
            !league.entrants.some((e) => e.id === team.id),
            'already_enrolled',
          );
          league.entrants.push({ id: team.id, label: team.name });
          note(
            team.captainUid,
            `league_${league.id}`,
            'league',
            league.id,
            league.title,
            'league_enrolled',
          );
        } else if (action === 'fixture-link') {
          ensure(league.state === 'active', 'league_closed');
          const fixture = league.fixtures.find((f) => f.id === body.fixtureId);
          ensure(fixture && !fixture.sourceKey, 'fixture_already_linked');
          const event = (await data(
            tx,
            db,
            `competitionEvents/${id(body.eventId)}`,
          )) as CompetitionEvent | null;
          ensure(
            event &&
              event.state === 'draft' &&
              event.entryMode === 'named_team' &&
              event.schoolKey === league.schoolKey,
            'incompatible_source',
          );
          manage(event, uid, admin);
          ensure(
            league.sourcePolicy === 'external_100_points_v1'
              ? event.delivery === 'external'
              : event.delivery !== 'external' &&
                  event.config.format === 'window' &&
                  event.config.questionCount === 10 &&
                  event.config.secondsPerQuestion === 20 &&
                  event.config.windowHours === 24,
            'incompatible_scoring_policy',
          );
          ensure(
            event.config.startsAt === fixture.startsAt,
            'fixture_schedule_mismatch',
          );
          const source = await data(tx, db, `fixtureSources/${event.id}`);
          ensure(!source, 'source_already_counted');
          fixture.sourceKey = event.id;
          fixture.revision++;
          tx.create(db.doc(`fixtureSources/${event.id}`), {
            eventId: event.id,
            leagueId: league.id,
            fixtureId: fixture.id,
            declaredAt: now,
          });
        } else if (action === 'league-start') {
          ensure(league.state === 'draft', 'already_started');
          league.fixtures = roundRobin(
            league.entrants.map((e) => e.id),
            Number(body.startsAt),
            Number(body.intervalHours) * 3600000,
          );
          ensure(league.fixtures[0].startsAt > now, 'invalid_schedule', 400);
          league.state = 'active';
          const captains: string[] = [];
          for (const entrant of league.entrants) {
            const team = (await data(tx, db, `teams/${entrant.id}`)) as Team | null;
            if (team) captains.push(team.captainUid);
          }
          for (const captain of captains)
            note(
              captain,
              `league_${league.id}`,
              'league',
              league.id,
              league.title,
              'fixtures_scheduled',
            );
        } else if (action === 'league-reopen') {
          ensure(league.state === 'closed', 'already_active');
          const reason = text(body.reason, 1000);
          ensure(reason.length >= 5, 'reason_required', 400);
          league.state = 'active';
          tx.create(db.doc(`leagues/${league.id}/audit/${generatedId}`), {
            action,
            actorUid: uid,
            reason,
            at: now,
          });
        } else if (action === 'league-close') {
          ensure(
            league.state === 'active' &&
              league.fixtures.every(
                (f) => f.status === 'final' || f.status === 'no_contest',
              ),
            'unresolved_fixtures',
          );
          league.state = 'closed';
        } else {
          ensure(league.state === 'active', 'league_closed');
          const fixture = league.fixtures.find((f) => f.id === body.fixtureId);
          ensure(fixture, 'fixture_not_found', 404);
          const sides: string[] = [];
          for (const side of [fixture.home, fixture.away]) {
            const team = side
              ? ((await data(tx, db, `teams/${side}`)) as Team | null)
              : null;
            if (team) sides.push(team.captainUid);
          }
          ensure(
            [
              'postponed',
              'disputed',
              'no_contest',
              'final',
              'scheduled',
            ].includes(String(body.status)),
            'invalid_status',
            400,
          );
          const reason = text(body.reason, 1000);
          ensure(reason.length >= 5, 'reason_required', 400);
          if (body.status === 'final') {
            const source = await data(
              tx,
              db,
              `fixtureSources/${id(body.eventId)}`,
            );
            ensure(
              source?.leagueId === league.id &&
                source?.fixtureId === fixture.id,
              'fixture_source_not_declared',
            );
            const sourceEvent = (await data(
              tx,
              db,
              `competitionEvents/${id(body.eventId)}`,
            )) as CompetitionEvent | null;
            ensure(
              !league.fixtures.some(
                (f) => f.id !== fixture.id && f.sourceKey === body.eventId,
              ),
              'source_already_counted',
            );
            ensure(
              sourceEvent &&
                sourceEvent.entryMode === 'named_team' &&
                sourceEvent.schoolKey === league.schoolKey,
              'incompatible_source',
            );
            const openDisputes = await tx.get(
              db
                .collection(`competitionEvents/${sourceEvent.id}/disputes`)
                .where('state', '==', 'open')
                .limit(1),
            );
            ensure(openDisputes.empty, 'unresolved_disputes');
            const engine = sourceEvent.tournamentId
              ? await data(
                  tx,
                  db,
                  `userTournaments/${sourceEvent.tournamentId}`,
                )
              : null;
            const board = sourceEvent.tournamentId
              ? await data(
                  tx,
                  db,
                  `userTournaments/${sourceEvent.tournamentId}/standings/current`,
                )
              : null;
            ensure(
              sourceEvent.delivery === 'external'
                ? sourceEvent.resultStatus === 'confirmed'
                : engine?.state === 'finished' &&
                    board?.final === true &&
                    !engine.standingsDirty,
              'result_not_final',
            );
            const results =
              sourceEvent.delivery === 'external'
                ? sourceEvent.resultRows
                : (board?.namedTeams || []).map((r: DocumentData) => ({
                    entryId: r.id,
                    score: r.points,
                  }));
            const home = results.find(
                (r: { entryId: string }) => r.entryId === fixture.home,
              ),
              away = results.find(
                (r: { entryId: string }) => r.entryId === fixture.away,
              );
            ensure(
              home && away && results.length === 2,
              'incompatible_fixture',
            );
            fixture.homeScore = home.score;
            fixture.awayScore = away.score;
            fixture.sourceKey = sourceEvent.id;
          } else {
            fixture.homeScore = null;
            fixture.awayScore = null;
          }
          if (body.startsAt !== undefined) {
            ensure(Number(body.startsAt) > now, 'invalid_schedule');
            fixture.startsAt = Number(body.startsAt);
          }
          fixture.status = body.status as typeof fixture.status;
          fixture.revision++;
          tx.create(db.doc(`leagues/${league.id}/audit/${generatedId}`), {
            fixture: { ...fixture },
            actorUid: uid,
            reason,
            at: now,
          });
          for (const captain of sides)
            note(
              captain,
              `league_${league.id}`,
              'league',
              league.id,
              league.title,
              'fixture_updated',
            );
        }
        league.revision++;
        const table = leagueTable(league.entrants, league.fixtures);
        tx.set(db.doc(`leagues/${league.id}`), league);
        tx.set(db.doc(`leagues/${league.id}/standings/current`), {
          revision: league.revision,
          table,
          final: league.state === 'closed',
          updatedAt: now,
        });
        result = { ok: true, leagueId: league.id, revision: league.revision };
        break;
      }
      case 'league-invite': {
        const leagueId = id(body.leagueId),
          teamId = id(body.teamId);
        const league = (await data(
          tx,
          db,
          `leagues/${leagueId}`,
        )) as League | null;
        const team = (await data(tx, db, `teams/${teamId}`)) as Team | null;
        ensure(league && (league.ownerUid === uid || admin), 'forbidden', 403);
        ensure(
          await schoolRole(tx, db, league.ownerUid, league.schoolKey, admin),
          'host_role_revoked',
          403,
        );
        ensure(
          league.state === 'draft' && team?.schoolKey === league.schoolKey,
          'team_ineligible',
        );
        tx.set(db.doc(`leagueInvites/${leagueId}_${teamId}`), {
          leagueId,
          teamId,
          captainUid: team.captainUid,
          createdAt: now,
        });
        note(
          team.captainUid,
          `league_${leagueId}`,
          'league',
          leagueId,
          league.title,
          'league_invited',
        );
        break;
      }
      case 'league-consent': {
        const leagueId = id(body.leagueId),
          teamId = id(body.teamId);
        const league = (await data(
          tx,
          db,
          `leagues/${leagueId}`,
        )) as League | null;
        const team = (await data(tx, db, `teams/${teamId}`)) as Team | null;
        ensure(
          league?.state === 'draft' &&
            team?.captainUid === uid &&
            team.schoolKey === league.schoolKey,
          'forbidden',
          403,
        );
        const invite = await data(
          tx,
          db,
          `leagueInvites/${leagueId}_${teamId}`,
        );
        ensure(invite?.captainUid === uid, 'invitation_required', 403);
        tx.set(db.doc(`leagueConsents/${leagueId}_${teamId}`), {
          captainUid: uid,
          teamId,
          leagueId,
          at: now,
        });
        note(
          league.ownerUid,
          `league_${leagueId}`,
          'league',
          leagueId,
          league.title,
          'league_consent',
        );
        break;
      }
      case 'report-content': {
        const reason = text(body.reason, 1000);
        ensure(reason.length >= 5, 'reason_required', 400);
        const targetId = id(body.targetId);
        ensure(
          ['team', 'event', 'league'].includes(String(body.kind)),
          'invalid_kind',
          400,
        );
        tx.create(db.doc(`competitionReports/${generatedId}`), {
          uid,
          kind: body.kind,
          targetId,
          reason,
          state: 'open',
          createdAt: now,
        });
        break;
      }
      case 'moderation-review': {
        ensure(admin, 'forbidden', 403);
        const reportId = id(body.reportId);
        const report = await data(tx, db, `competitionReports/${reportId}`);
        ensure(report, 'not_found', 404);
        const resolution = text(body.resolution, 1000);
        ensure(resolution.length >= 5, 'resolution_required', 400);
        if (body.hide === true) {
          ensure(
            ['team', 'event', 'league'].includes(report.kind),
            'invalid_kind',
            400,
          );
          const path = `${report.kind === 'team' ? 'teams' : report.kind === 'event' ? 'competitionEvents' : 'leagues'}/${id(report.targetId)}`;
          const record = await data(tx, db, path);
          ensure(record, 'not_found', 404);
          tx.update(db.doc(path), { moderated: true });
          if (report.kind === 'event')
            tx.delete(db.doc(`competitionDirectory/${report.targetId}`));
          if (report.kind === 'league')
            tx.update(db.doc(path), { public: false });
        }
        tx.update(db.doc(`competitionReports/${reportId}`), {
          state: 'resolved',
          resolution,
          reviewerUid: uid,
          reviewedAt: now,
        });
        break;
      }
      case 'block-inviter': {
        const blockedUid = id(body.recipientUid);
        ensure(blockedUid !== uid, 'invalid_recipient', 400);
        tx.set(db.doc(`competitionBlocks/${uid}_${blockedUid}`), {
          uid,
          blockedUid,
          createdAt: now,
        });
        break;
      }
      case 'inbox-read': {
        // Only the caller's own records, only the read flag; unknown ids are ignored.
        const ids = body.ids;
        ensure(
          Array.isArray(ids) && ids.length > 0 && ids.length <= 60,
          'invalid_ids',
          400,
        );
        const rows = [];
        for (const key of new Set(ids.map(id)))
          rows.push(await tx.get(db.doc(`users/${uid}/competitionInbox/${key}`)));
        for (const row of rows) if (row.exists) tx.update(row.ref, { read: true });
        break;
      }
      default:
        throw new CompetitionError('invalid_action', 400);
    }
    tx.create(receiptRef, { uid, action, digest, result, createdAt: now });
    executed = true;
    return result;
  });
  if (executed && notices.length)
    await deliverCompetitionNotices(db, notices, uid).catch(() => undefined);
  return output;
}
