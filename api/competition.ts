import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  FieldPath,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import { requireAuthDecoded } from './_lib/requireAuth';
import { getDb } from './_lib/firebaseAdmin';
import { isAdminUid } from './arena/_shared';
import { enforceRateLimit, parseBody } from './tournois/_shared';
import {
  CompetitionError,
  ensure,
  id,
  schoolIdentifier,
  mutateCompetition,
} from './_lib/competition';
import { ensureInviteCode, resolvePeople } from './_lib/competitionPeople';
import {
  competitionFlags,
  competitionFlagsState,
  parseFlagChanges,
  recentFlagAudits,
  updateCompetitionFlags,
} from './_lib/platformConfig';
import type { CompetitionEvent, League } from '../shared/competition/platform';
import { seedSchools, schoolFromDoc, isApproved } from '../shared/schools';
import { leagueTable } from '../shared/leagues/standings';
import {
  officialPhase,
  userPhase,
  type CompetitionSummary,
} from '../shared/competition/model';

async function get(db: Firestore, path: string) {
  const s = await db.doc(path).get();
  return s.exists ? s.data()! : null;
}
export async function readEvent(
  db: Firestore,
  eventId: string,
  uid: string | null,
) {
  const e = (await get(
    db,
    `competitionEvents/${eventId}`,
  )) as CompetitionEvent | null;
  ensure(e, 'not_found', 404);
  const admin = uid ? await isAdminUid(db, uid) : false;
  const host =
    !!uid &&
    (e.ownerUid === uid ||
      ['manage', 'checkin'].includes(e.cohosts[uid]) ||
      admin);
  const manager =
    !!uid && (e.ownerUid === uid || e.cohosts[uid] === 'manage' || admin);
  const claim = uid ? await get(db, `entryClaims/${e.id}_${uid}`) : null;
  const member =
    uid && e.schoolKey
      ? await get(db, `schoolMemberships/${e.schoolKey}_${uid}`)
      : null;
  const myEntries = uid
    ? await db
        .collection(`competitionEvents/${e.id}/entries`)
        .where('starters', 'array-contains', uid)
        .limit(12)
        .get()
    : null;
  const captainEntries = uid
    ? await db
        .collection(`competitionEvents/${e.id}/entries`)
        .where('captainUid', '==', uid)
        .limit(12)
        .get()
    : null;
  const participant = !!claim || !!myEntries?.size || !!captainEntries?.size;
  ensure(
    host ||
      (e.state !== 'draft' &&
        (e as CompetitionEvent & { moderated?: boolean }).moderated !== true &&
        (e.audience === 'public' ||
          participant ||
          (e.audience === 'school' && member?.status === 'approved'))),
    'forbidden',
    403,
  );
  // Hosts (managers and check-in co-hosts) see every entry so they can
  // welcome attendees by name; others see only their own.
  const entries = host
    ? (
        await db.collection(`competitionEvents/${e.id}/entries`).limit(60).get()
      ).docs.map((d) => d.data())
    : [
        ...new Map(
          [...(myEntries?.docs || []), ...(captainEntries?.docs || [])].map(
            (d) => [d.id, d.data()],
          ),
        ).values(),
      ];
  const announcements = (
    await db
      .collection(`competitionEvents/${e.id}/announcements`)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get()
  ).docs.map((d) => d.data());
  // Result labels come from the entry (team name or the player's public
  // name); a missing label stays null and the client shows a localized
  // "Participation" — never the entry id, which is a uid for individuals.
  const publicResults = await Promise.all(
    e.resultRows.map(async (row) => {
      const entry = await get(
        db,
        `competitionEvents/${e.id}/entries/${row.entryId}`,
      );
      return { ...row, label: entry?.label || null };
    }),
  );
  const safe = {
    id: e.id,
    title: e.title,
    description: e.description,
    hostName: e.hostName,
    hostKind: e.hostKind,
    schoolKey: e.schoolKey,
    department: e.department,
    audience: e.audience,
    entryPolicy: e.entryPolicy,
    entryMode: e.entryMode,
    gameMode: e.gameMode ?? 'independent',
    delivery: e.delivery,
    state: e.state,
    config: e.config,
    registrationClosesAt: e.registrationClosesAt,
    revision: e.revision,
    entryCount: e.entryCount,
    tournamentId: e.tournamentId,
    resultStatus: e.resultStatus,
    resultRevision: e.resultRevision,
    resultRows: publicResults,
    reward: e.reward,
    externalUrl: e.externalUrl,
    venue: host || claim ? e.venue : '',
    instructions: host || claim ? e.instructions : '',
  };
  const following = uid
    ? !!(await get(db, `users/${uid}/competitionFollows/${e.id}`))
    : false;
  const engine = e.tournamentId
    ? await get(db, `userTournaments/${e.tournamentId}`)
    : null;
  const board = e.tournamentId
    ? await get(db, `userTournaments/${e.tournamentId}/standings/current`)
    : null;
  const disputes = manager
    ? (
        await db
          .collection(`competitionEvents/${e.id}/disputes`)
          .limit(30)
          .get()
      ).docs.map((d) => d.data())
    : [];
  const rewards =
    host || claim
      ? (
          await db
            .collection(`competitionEvents/${e.id}/rewards`)
            .limit(60)
            .get()
        ).docs
          .filter((d) => host || d.id === claim?.entryId)
          .map((d) => d.data())
      : [];
  const cohosts = manager ? e.cohosts || {} : {};
  const people = await resolvePeople(db, [
    ...entries.flatMap((entry) => [
      entry.captainUid as string,
      ...((entry.starters as string[]) || []),
    ]),
    ...Object.keys(cohosts),
  ]);
  return {
    event: safe,
    entries,
    cohosts,
    people,
    announcements,
    disputes,
    rewards,
    following,
    engineState: engine?.state ?? null,
    namedTeams: board?.namedTeams || [],
    role: manager
      ? 'manager'
      : host
        ? 'checkin'
        : claim
          ? 'participant'
          : 'viewer',
    eligible: !e.schoolKey || member?.status === 'approved',
    teamModesEnabled: (await competitionFlags(db)).teamModesEnabled,
    serverNow: Date.now(),
  };
}
async function directory(db: Firestore, body: Record<string, unknown>) {
  let q: Query = db.collection('competitionDirectory');
  if (body.schoolKey)
    q = q.where('schoolKey', '==', schoolIdentifier(body.schoolKey));
  if (body.department) {
    ensure(
      typeof body.department === 'string' && body.department.length <= 60,
      'invalid_department',
      400,
    );
    q = q.where('department', '==', body.department);
  }
  q = q.orderBy('startsAt', 'asc').orderBy(FieldPath.documentId()).limit(20);
  if (body.cursor) {
    const cursor = body.cursor as { startsAt: number; id: string };
    ensure(Number.isFinite(cursor.startsAt), 'invalid_cursor', 400);
    q = q.startAfter(cursor.startsAt, id(cursor.id));
  }
  const sources = await Promise.allSettled([
    q.get(),
    db
      .collection('userTournaments')
      .where('visibility', '==', 'public')
      .where('state', 'in', ['scheduled', 'running'])
      .orderBy('startsAt', 'asc')
      .limit(30)
      .get(),
    db
      .collection('tournaments')
      .where('state', 'in', [
        'registration',
        'doors',
        'live',
        'grading',
        'provisional',
        'final',
      ])
      .orderBy('startsAt', 'desc')
      .limit(10)
      .get(),
    db
      .collection('leagues')
      .where('public', '==', true)
      .where('state', 'in', ['active', 'closed'])
      .limit(20)
      .get(),
  ]);
  const events =
    sources[0].status === 'fulfilled'
      ? sources[0].value.docs.map((d) => d.data())
      : [];
  const summaries: CompetitionSummary[] = [];
  if (!body.schoolKey && !body.department && sources[1].status === 'fulfilled')
    for (const d of sources[1].value.docs) {
      const t = d.data();
      if (t.schemaVersion === 2) continue;
      summaries.push({
        key: `user_tournament:${d.id}`,
        source: { kind: 'user_tournament', id: d.id, schemaVersion: 1 },
        title: t.title,
        host: t.creatorName,
        phase: userPhase(t.state),
        startsAt: t.startsAt,
        endsAt: t.schedule?.endsAt ?? null,
        schoolKey: null,
        department: null,
        entryMode:
          t.teamRule === 'school'
            ? 'school_group'
            : t.teamRule === 'grade'
              ? 'grade_group'
              : 'individual',
        format: t.format,
        resultAuthority: 'app_computed',
        capabilities: {
          enter:
            ['scheduled', 'running'].includes(t.state) &&
            !(t.state === 'running' && t.format === 'bracket'),
          namedTeams: false,
          livePlay: t.format === 'live',
          windowPlay: t.format !== 'live',
          watch: true,
          checkIn: false,
          externalRegistration: false,
        },
        href: `/tournois/${d.id}`,
      });
    }
  if (!body.schoolKey && !body.department && sources[2].status === 'fulfilled')
    for (const d of sources[2].value.docs) {
      const t = d.data();
      summaries.push({
        key: `official_arena:${d.id}`,
        source: { kind: 'official_arena', id: d.id },
        title: t.title,
        host: 'EdLight',
        phase: officialPhase(t.state),
        startsAt: t.startsAt,
        endsAt: null,
        schoolKey: null,
        department: null,
        entryMode: 'school_group',
        format: 'live',
        resultAuthority: 'official_review',
        capabilities: {
          enter: t.state === 'registration',
          namedTeams: false,
          livePlay: true,
          windowPlay: false,
          watch: true,
          checkIn: false,
          externalRegistration: false,
        },
        href: `/arena/jouer/${d.id}`,
      });
    }
  const catalog = await db
    .collection('schools')
    .limit(500)
    .get()
    .catch(() => null);
  const schools = [
    ...new Map(
      [
        ...seedSchools(),
        ...(catalog?.docs || [])
          .map((d) => schoolFromDoc(d.data()))
          .filter((s) => s && isApproved(s)),
      ].map((s) => [s!.key, { key: s!.key, name: s!.name }]),
    ).values(),
  ];
  const last = events[events.length - 1];
  const { discoveryEnabled } = await competitionFlags(db);
  const leagues =
    sources[3].status === 'fulfilled'
      ? sources[3].value.docs
          .map((d) => ({
            id: d.id,
            title: d.data().title,
            schoolKey: d.data().schoolKey,
          }))
          .filter(
            (l) =>
              (!body.schoolKey || l.schoolKey === body.schoolKey) &&
              !body.department,
          )
      : [];
  return {
    schools,
    events: discoveryEnabled ? events : [],
    summaries,
    leagues: discoveryEnabled ? leagues : [],
    errors: sources.flatMap((r, i) =>
      r.status === 'rejected'
        ? [['events', 'individual', 'official', 'leagues'][i]]
        : [],
    ),
    cursor:
      events.length === 20 && last
        ? { startsAt: last.startsAt, id: last.id }
        : null,
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const body = parseBody(req);
  const action = String(body.action || 'directory');
  const publicRead = ['directory', 'event', 'league', 'school'].includes(
    action,
  );
  let actor: { uid: string; name?: string } | null = null;
  if (!publicRead || req.headers.authorization) {
    actor = await requireAuthDecoded(req, res);
    if (!actor) return;
  }
  try {
    const db = getDb();
    if (
      !(await enforceRateLimit(
        res,
        actor?.uid ??
          String(
            req.headers['x-real-ip'] || req.socket?.remoteAddress || 'guest',
          ),
        publicRead
          ? 'competition-read'
          : action === 'mine' ||
              action === 'team' ||
              action === 'invite' ||
              action === 'platform-config'
            ? 'competition-read'
            : 'competition-write',
      ))
    )
      return;
    let out: unknown;
    switch (action) {
      case 'directory':
        out = await directory(db, body);
        break;
      case 'event':
        out = await readEvent(db, id(body.eventId), actor?.uid ?? null);
        break;
      case 'mine': {
        const uid = actor!.uid;
        const [inbox, teams, memberships, roles, invitations, myTournaments] =
          await Promise.all([
            db
              .collection(`users/${uid}/competitionInbox`)
              .orderBy('updatedAt', 'desc')
              .limit(60)
              .get(),
            db
              .collection('teams')
              .where('members', 'array-contains', uid)
              .limit(30)
              .get(),
            db
              .collection('schoolMemberships')
              .where('uid', '==', uid)
              .limit(30)
              .get(),
            db
              .collection('schoolRoles')
              .where('uid', '==', uid)
              .limit(30)
              .get(),
            db
              .collection('teamInvites')
              .where('recipientUid', '==', uid)
              .limit(30)
              .get(),
            db
              .collection(`users/${uid}/myTournaments`)
              .orderBy('startsAt', 'desc')
              .limit(30)
              .get(),
          ]);
        const admin = await isAdminUid(db, uid);
        const membershipRequests = [];
        for (const role of roles.docs
          .filter((d) => d.data().status === 'approved')
          .slice(0, 10)) {
          const requests = await db
            .collection('schoolMemberships')
            .where('schoolKey', '==', role.data().schoolKey)
            .where('status', '==', 'pending')
            .limit(30)
            .get();
          membershipRequests.push(...requests.docs.map((d) => d.data()));
        }
        const moderationReports = admin
          ? (
              await db
                .collection('competitionReports')
                .where('state', '==', 'open')
                .limit(30)
                .get()
            ).docs.map((d) => ({ id: d.id, ...d.data() }))
          : [];
        const teamDocs = teams.docs.map((d) => d.data());
        const [people, inviteCode, flags] = await Promise.all([
          resolvePeople(db, [
            ...membershipRequests.map((r) => r.uid as string),
            ...teamDocs
              .filter((t) => t.captainUid === uid)
              .flatMap((t) => (t.members as string[]) || []),
          ]),
          ensureInviteCode(db, uid),
          competitionFlags(db),
        ]);
        out = {
          uid,
          inviteCode,
          people,
          admin,
          membershipRequests,
          moderationReports,
          creationEnabled: flags.creationEnabled,
          teamModesEnabled: flags.teamModesEnabled,
          inbox: inbox.docs.map((d) => d.data()),
          teams: teamDocs,
          memberships: memberships.docs.map((d) => d.data()),
          roles: roles.docs.map((d) => d.data()),
          invitations: invitations.docs.map((d) => d.data()),
          myTournaments: myTournaments.docs.map((d) => d.data()),
        };
        break;
      }
      case 'school': {
        const schoolKey = schoolIdentifier(body.schoolId);
        const membership = actor
          ? await get(db, `schoolMemberships/${schoolKey}_${actor.uid}`)
          : null;
        const events = await db
          .collection('competitionDirectory')
          .where('schoolKey', '==', schoolKey)
          .orderBy('startsAt', 'asc')
          .limit(20)
          .get();
        const teams =
          membership?.status === 'approved'
            ? (
                await db
                  .collection('teams')
                  .where('schoolKey', '==', schoolKey)
                  .where('visibility', '==', 'school')
                  .limit(30)
                  .get()
              ).docs
                .filter((d) => d.data().moderated !== true)
                .map((d) => ({
                  id: d.id,
                  name: d.data().name,
                  memberCount: d.data().members.length,
                }))
            : [];
        const privateSchoolEvents =
          membership?.status === 'approved'
            ? (
                await db
                  .collection('competitionEvents')
                  .where('schoolKey', '==', schoolKey)
                  .where('audience', '==', 'school')
                  .where('state', 'in', ['published', 'closed'])
                  .limit(20)
                  .get()
              ).docs.map((d) => ({ id: d.id, title: d.data().title }))
            : [];
        out = {
          schoolKey,
          member: membership?.status === 'approved',
          events: [...events.docs.map((d) => d.data()), ...privateSchoolEvents],
          teams,
        };
        break;
      }
      case 'team': {
        const team = await get(db, `teams/${id(body.teamId)}`);
        ensure(team, 'not_found', 404);
        const member =
          actor && team.schoolKey
            ? await get(db, `schoolMemberships/${team.schoolKey}_${actor.uid}`)
            : null;
        ensure(
          team.members.includes(actor!.uid) ||
            (team.visibility === 'school' && member?.status === 'approved'),
          'forbidden',
          403,
        );
        const invites =
          team.captainUid === actor!.uid
            ? (
                await db
                  .collection('teamInvites')
                  .where('teamId', '==', team.id)
                  .limit(30)
                  .get()
              ).docs.map((d) => d.data())
            : [];
        const requests =
          team.captainUid === actor!.uid
            ? (
                await db
                  .collection(`teams/${team.id}/requests`)
                  .where('status', '==', 'pending')
                  .limit(30)
                  .get()
              ).docs.map((d) => d.data())
            : [];
        out = team.members.includes(actor!.uid)
          ? {
              team,
              invites,
              requests,
              people: await resolvePeople(db, [
                ...team.members,
                ...invites.map((i) => i.recipientUid as string),
                ...requests.map((r) => r.uid as string),
              ]),
            }
          : {
              team: {
                id: team.id,
                name: team.name,
                schoolKey: team.schoolKey,
                memberCount: team.members.length,
              },
              canRequest: true,
            };
        break;
      }
      case 'invite': {
        const invite = await get(db, `teamInvites/${id(body.inviteId)}`);
        ensure(invite, 'not_found', 404);
        ensure(
          invite.recipientUid === actor!.uid || invite.senderUid === actor!.uid,
          'wrong_account',
          403,
        );
        out = {
          invite: {
            ...invite,
            status:
              invite.status === 'pending' && Date.now() >= invite.expiresAt
                ? 'expired'
                : invite.status,
          },
          people: await resolvePeople(db, [
            invite.senderUid,
            invite.recipientUid,
          ]),
        };
        break;
      }
      case 'league': {
        const league = (await get(
          db,
          `leagues/${id(body.leagueId)}`,
        )) as League | null;
        ensure(league, 'not_found', 404);
        let participant = false;
        const invitedTeams: Array<{ id: string; label: string }> = [];
        if (actor) {
          const teams = await db
            .collection('teams')
            .where('members', 'array-contains', actor.uid)
            .limit(30)
            .get();
          participant = teams.docs.some((d) =>
            league.entrants.some((e) => e.id === d.id),
          );
          for (const team of teams.docs.filter(
            (d) => d.data().captainUid === actor?.uid,
          )) {
            const invite = await get(
              db,
              `leagueInvites/${league.id}_${team.id}`,
            );
            if (invite?.captainUid === actor.uid)
              invitedTeams.push({ id: team.id, label: team.data().name });
          }
        }
        ensure(
          (league.public && league.state !== 'draft') ||
            actor?.uid === league.ownerUid ||
            participant ||
            invitedTeams.length > 0,
          'forbidden',
          403,
        );
        const { ownerUid, ...safe } = league;
        out = {
          league: safe,
          invitedTeams,
          manager: ownerUid === actor?.uid,
          table: leagueTable(league.entrants, league.fixtures),
        };
        break;
      }
      // Admin console "Compétitions" (src/pages/admin/AdminCompetitionSettings.tsx).
      case 'platform-config':
      case 'platform-config-set': {
        const uid = actor!.uid;
        if (!(await isAdminUid(db, uid))) {
          res.status(403).json({ error: 'not_admin' });
          return;
        }
        let state;
        if (action === 'platform-config-set') {
          const changes = parseFlagChanges(body.changes);
          ensure(changes, 'invalid_changes', 400);
          state = await updateCompetitionFlags(db, uid, changes);
        } else state = await competitionFlagsState(db);
        const audit = await recentFlagAudits(db);
        out = {
          flags: state,
          audit,
          people: await resolvePeople(db, [
            state.updatedBy,
            ...audit.map((a) => a.by),
          ]),
        };
        break;
      }
      default:
        out = await mutateCompetition(
          db,
          actor!.uid,
          actor!.name || '',
          body,
          Date.now(),
        );
    }
    res.status(200).json({ ok: true, ...(out as object) });
  } catch (error) {
    if (error instanceof CompetitionError)
      res.status(error.status).json({ error: error.code });
    else {
      console.error('[competition] request failed', {
        action,
        name: error instanceof Error ? error.name : 'Error',
      });
      res.status(503).json({ error: 'service_unavailable' });
    }
  }
}
