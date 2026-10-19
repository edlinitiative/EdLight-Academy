/**
 * Review fixtures for the competition surfaces: the same `data` / `mine`
 * shapes the read endpoints return, fed through the real page builder
 * (shared/competition/workspace.ts → workspacePage). Used by the Arène
 * studio (/arena/studio#competitions) and the render tests. Every uid here
 * is long and random-looking on purpose, so a test can prove none is printed.
 */
import {
  workspacePage,
  type WorkspacePage,
  type WorkspaceTarget,
} from '../../../shared/competition/workspace';
import { DELETED_ACCOUNT_NAME } from '../../../shared/competition/deletedAccount';
import type { LiveState, RosterEntry, Standings, Tournament } from '../../../shared/tournois/models';

export const FIXTURE_UIDS = {
  me: 'uidMeQ8Lm2Pz9Rt4Ks8Vw1Yb3Zc5',
  bob: 'uidBobN5Hc6Jd0Fg2Qa7Ue4Ti9Wo1',
  cara: 'uidCaraM3Kp8Ls1Dz6Xn0Vb5Rq7Yt',
  dan: 'uidDanH4Gf9Je2Wq6Pk1Lz8Mx3Cv0',
  long: 'uidLongR7Ty2Ui8Op4As6Df0Gh1Jk',
  gone: 'deleted_0a1b2c3d4e5f6a7b',
};
const U = FIXTURE_UIDS;
const DAY = 86_400_000;

const people = {
  [U.me]: { name: 'Nadège Pierre-Louis', avatar: null },
  [U.bob]: { name: 'Bob Jean-Baptiste', avatar: null },
  [U.cara]: { name: DELETED_ACCOUNT_NAME, avatar: null },
  [U.long]: {
    name: 'Marie-Christine Évangéline Desrosiers-Saint-Fleurant',
    avatar: null,
  },
  // U.dan is unknown → "Participant / Patisipan".
};

const LONG_TITLE =
  'Coupe interscolaire de culture générale du Plateau Central — édition spéciale 2026';

const schools = [
  { key: 'lycee-petion', name: 'Lycée Alexandre Pétion' },
  { key: 'college-st-louis', name: 'Collège Saint-Louis de Gonzague' },
  {
    key: 'inst-long',
    name: 'Institution Mixte Évangélique des Frères Unis de Mirebalais',
  },
];

function eventData(now: number, role: string, extra: Record<string, any> = {}) {
  return {
    event: {
      id: 'ev1',
      title: LONG_TITLE,
      description:
        'Dix questions de culture générale, en direct depuis la salle polyvalente. Apportez un téléphone chargé.',
      hostName: 'Lycée Alexandre Pétion',
      hostKind: 'school',
      audience: 'school',
      entryPolicy: 'approval',
      entryMode: 'named_team',
      delivery: 'physical',
      state: 'published',
      revision: 3,
      venue: 'Salle polyvalente, Lycée Alexandre Pétion, Port-au-Prince',
      tournamentId: 'tour1',
      config: {
        format: 'live',
        questionCount: 10,
        secondsPerQuestion: 20,
        startsAt: now + 4 * DAY,
        categories: ['general'],
      },
      registrationClosesAt: now + 3 * DAY,
      resultStatus: 'pending',
      resultRows: [],
      reward: {
        description: 'Dictionnaires et calculatrices',
        provider: 'Librairie La Pléiade',
        contact: 'contact@exemple.ht',
      },
    },
    entries: [
      {
        id: 'team1',
        teamId: 'team1',
        captainUid: U.me,
        label: 'Les Lions du Plateau Central et de la Vallée de l’Artibonite',
        starters: [U.me, U.bob, U.cara],
        confirmed: [U.me],
        state: 'draft',
      },
      {
        id: 'team2',
        teamId: 'team2',
        captainUid: U.long,
        label: 'Les Aigles',
        starters: [U.long, U.dan, U.gone],
        confirmed: [U.long, U.dan, U.gone],
        state: 'registered',
      },
    ],
    cohosts: { [U.bob]: 'checkin' },
    people,
    announcements: [
      { message: 'Rendez-vous à 13 h 30 pour l’accueil des équipes.' },
    ],
    disputes: [],
    rewards: [{ entryId: 'team2', status: 'fulfillment_pending' }],
    namedTeams: [],
    role,
    eligible: true,
    following: false,
    ...extra,
  };
}

function mineBase(now: number, extra: Record<string, any> = {}) {
  return {
    uid: U.me,
    inviteCode: 'K7Q2M9XD',
    people,
    teams: [
      {
        id: 'team1',
        name: 'Les Lions du Plateau Central et de la Vallée de l’Artibonite',
        captainUid: U.me,
        members: [U.me, U.bob, U.cara, U.long],
      },
      { id: 'team3', name: 'Les Colibris', captainUid: U.bob, members: [U.bob, U.me] },
    ],
    memberships: [{ schoolKey: 'lycee-petion', status: 'approved' }],
    roles: [],
    admin: false,
    creationEnabled: true,
    inbox: [
      {
        id: 'n1',
        action: 'invited',
        title: 'Les Colibris',
        targetKind: 'invite',
        targetId: 'inv1',
        read: false,
      },
      {
        id: 'n2',
        action: 'postponed',
        title: LONG_TITLE,
        targetKind: 'event',
        targetId: 'ev1',
        read: false,
      },
      {
        id: 'n3',
        action: 'result_released',
        title: 'Quiz de rentrée',
        targetKind: 'event',
        targetId: 'ev0',
        read: true,
      },
    ],
    myTournaments: [{ tid: 'tour9', title: 'Revanche du vendredi' }],
    ...extra,
    now,
  };
}

export interface WorkspaceScenario {
  id: string;
  label: string;
  target: WorkspaceTarget;
  /** null → the page is still loading. */
  build: (now: number) => { data: any; mine: any } | null;
  uid?: string;
  error?: string;
  loading?: boolean;
  more?: boolean;
}

const manyEvents = (now: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    title: i % 3 === 0 ? LONG_TITLE : `Quiz du jeudi n° ${i + 1}`,
    hostName: i === 4 ? DELETED_ACCOUNT_NAME : schools[i % 3].name,
    entryMode: i % 2 ? 'named_team' : 'individual',
    startsAt: now + (i + 1) * DAY,
  }));

export const WORKSPACE_SCENARIOS: WorkspaceScenario[] = [
  {
    id: 'home',
    label: 'Accueil — activité, équipes, découverte',
    target: { kind: 'home' },
    uid: U.me,
    more: true,
    build: (now) => ({
      data: {
        events: manyEvents(now, 3),
        summaries: [
          {
            title: 'Revanche du vendredi',
            host: 'Bob Jean-Baptiste',
            format: 'live',
            href: '/tournois/tour9',
          },
        ],
        leagues: [{ id: 'lg1', title: 'Division pilote Ouest' }],
        schools,
      },
      mine: mineBase(now),
    }),
  },
  {
    id: 'home-empty',
    label: 'Accueil vide (nouveau compte)',
    target: { kind: 'home' },
    uid: U.me,
    build: (now) => ({
      data: { events: [], summaries: [] },
      mine: {
        uid: U.me,
        inviteCode: 'K7Q2M9XD',
        teams: [],
        memberships: [],
        inbox: [],
        creationEnabled: false,
        now,
      },
    }),
  },
  {
    id: 'home-guest',
    label: 'Accueil invité (non connecté)',
    target: { kind: 'home' },
    build: (now) => ({ data: { events: manyEvents(now, 2) }, mine: null }),
  },
  {
    id: 'home-many',
    label: 'Accueil — beaucoup de lignes',
    target: { kind: 'home' },
    uid: U.me,
    more: true,
    build: (now) => ({
      data: { events: manyEvents(now, 18), schools },
      mine: mineBase(now, {
        admin: true,
        membershipRequests: [
          { uid: U.long, schoolKey: 'inst-long', status: 'pending' },
          { uid: U.dan, schoolKey: 'lycee-petion', status: 'pending' },
        ],
        moderationReports: [{ id: 'r1', kind: 'team', reason: 'Nom offensant' }],
      }),
    }),
  },
  {
    id: 'event-participant',
    label: 'Événement — participant (titulaire à confirmer)',
    target: { kind: 'event', id: 'ev1' },
    uid: U.bob,
    build: (now) => ({
      data: eventData(now, 'participant'),
      mine: { ...mineBase(now), uid: U.bob, teams: [] },
    }),
  },
  {
    id: 'event-host',
    label: 'Événement — organisateur',
    target: { kind: 'event', id: 'ev1' },
    uid: U.me,
    build: (now) => ({
      data: eventData(now, 'manager', {
        disputes: [{ id: 'd1', reason: 'Question 4 ambiguë', state: 'open' }],
      }),
      mine: { ...mineBase(now), roles: [{ status: 'approved' }] },
    }),
  },
  {
    id: 'event-cohost',
    label: 'Événement — co-organisateur (accueil)',
    target: { kind: 'event', id: 'ev1' },
    uid: U.bob,
    build: (now) => ({
      data: eventData(now, 'checkin'),
      mine: { ...mineBase(now), uid: U.bob, teams: [] },
    }),
  },
  {
    id: 'team-captain',
    label: 'Équipe — capitaine',
    target: { kind: 'team', id: 'team1' },
    uid: U.me,
    build: (now) => ({
      data: {
        team: {
          id: 'team1',
          name: 'Les Lions du Plateau Central et de la Vallée de l’Artibonite',
          captainUid: U.me,
          members: [U.me, U.bob, U.cara, U.long, U.dan],
          visibility: 'school',
        },
        invites: [
          { id: 'i1', recipientUid: U.dan, senderUid: U.me, status: 'pending' },
        ],
        requests: [
          { uid: 'uidReqZ1x2c3v4b5n6m7a8s9d0f1', publicName: 'Ketsia Joseph', status: 'pending' },
        ],
        people,
      },
      mine: mineBase(now),
    }),
  },
  {
    id: 'team-member',
    label: 'Équipe — membre',
    target: { kind: 'team', id: 'team3' },
    uid: U.me,
    build: (now) => ({
      data: {
        team: {
          id: 'team3',
          name: 'Les Colibris',
          captainUid: U.bob,
          members: [U.bob, U.me, U.gone],
        },
        invites: [],
        requests: [],
        people,
      },
      mine: mineBase(now),
    }),
  },
  {
    id: 'invite',
    label: 'Invitation en attente',
    target: { kind: 'invite', id: 'inv1' },
    uid: U.me,
    build: (now) => ({
      data: {
        invite: {
          teamName: 'Les Colibris',
          status: 'pending',
          expiresAt: now + 6 * DAY,
          senderUid: U.bob,
          recipientUid: U.me,
          teamId: 'team3',
        },
        people,
      },
      mine: { uid: U.me },
    }),
  },
  {
    id: 'league',
    label: 'Ligue — classement et rencontres',
    target: { kind: 'league', id: 'lg1' },
    uid: U.me,
    build: (now) => {
      const entrants = [
        { id: 't1', label: 'Les Lions' },
        { id: 't2', label: 'Les Aigles de l’Institution Mixte de Mirebalais' },
        { id: 't3', label: 'Les Colibris' },
        { id: 't4', label: 'Les Mapou' },
      ];
      return {
        data: {
          league: {
            title: 'Division pilote Ouest',
            state: 'active',
            revision: 4,
            sourcePolicy: 'app_quiz_10x20_window24',
            entrants,
            fixtures: [
              { id: 'f1', home: 't1', away: 't2', startsAt: now - 7 * DAY, status: 'final', homeScore: 210, awayScore: 180, sourceKey: 'ev7' },
              { id: 'f2', home: 't3', away: 't4', startsAt: now + 2 * DAY, status: 'scheduled' },
            ],
          },
          table: entrants.map((e, i) => ({
            rank: i + 1,
            label: e.label,
            points: 9 - i * 3,
            played: 3,
            remaining: 3,
            wins: 3 - i,
            draws: 0,
            losses: i,
          })),
          manager: true,
        },
        mine: { uid: U.me },
      };
    },
  },
  {
    id: 'school',
    label: 'École — non-membre',
    target: { kind: 'school', id: 'lycee-petion' },
    uid: U.me,
    build: () => ({
      data: {
        schoolKey: 'lycee-petion',
        member: false,
        events: [{ id: 'ev1', title: LONG_TITLE }],
        teams: [],
      },
      mine: { uid: U.me },
    }),
  },
  {
    id: 'loading',
    label: 'Chargement',
    target: { kind: 'home' },
    uid: U.me,
    loading: true,
    build: () => null,
  },
  {
    id: 'error',
    label: 'Erreur réseau + réessayer',
    target: { kind: 'event', id: 'ev1' },
    uid: U.me,
    error: 'network',
    build: () => null,
  },
];

export function scenarioPage(
  s: WorkspaceScenario,
  now: number,
): WorkspacePage | null {
  const built = s.build(now);
  return built ? workspacePage(s.target, built.data, built.mine, now) : null;
}

export interface ProjectorScenario {
  id: string;
  label: string;
  event: { title?: string; delivery?: string } | null;
  live: LiveState | null;
  board: Standings | null;
  /** The board just before `board` — the studio replays the reorder from it. */
  boardBefore?: Standings | null;
  phase: string;
  teamRule?: string | null;
  error?: string;
}

const SCHOOL_NAMES = [
  'Lycée Alexandre Pétion',
  'Collège Saint-Louis de Gonzague',
  'Institution Mixte Évangélique des Frères Unis de Mirebalais',
  'Lycée National de Hinche',
  'Collège Notre-Dame du Perpétuel Secours',
  'Lycée Philippe Guerrier',
  'École Nationale de Lascahobas',
  'Collège Canado-Haïtien',
  'Lycée Toussaint Louverture',
  'Institution Saint-Louis de Bourdon',
  'Collège Pratique du Nord',
  'Lycée Jean-Jacques Dessalines',
];

const row = (uid: string, displayName: string, rank: number, points: number, school: string | null = null) => ({
  uid,
  displayName,
  school,
  grade: null,
  points,
  correct: 0,
  answered: 0,
  rank,
  avatar: null,
});

const rerank = <T extends { rank: number }>(list: T[], by: (r: T) => number): T[] =>
  [...list].sort((a, b) => by(b) - by(a)).map((r, i) => ({ ...r, rank: i + 1 }));

/** Twelve players (long names, a deleted account, schools) — before and after question 4. */
export function projectorRows(): { before: Standings['rows']; after: Standings['rows'] } {
  const base = [
    row(U.long, 'Marie-Christine Évangéline Desrosiers-Saint-Fleurant', 1, 4200, SCHOOL_NAMES[2]),
    row(U.bob, 'Bob Jean-Baptiste', 2, 3900, SCHOOL_NAMES[0]),
    row(U.gone, DELETED_ACCOUNT_NAME, 3, 3100, null),
    row(U.me, 'Nadège Pierre-Louis', 4, 2800, SCHOOL_NAMES[3]),
    ...Array.from({ length: 8 }, (_, i) =>
      row(`uidFill${i}x9c8v7b6n5m4a3s2d1`, `Joueur ${i + 5}`, i + 5, 2500 - i * 200, SCHOOL_NAMES[(i + 4) % SCHOOL_NAMES.length]),
    ),
  ];
  // Question 4: Nadège and "Joueur 7" answer fast, the leader misses.
  const gain: Record<string, number> = { [U.me]: 1500, uidFill2x9c8v7b6n5m4a3s2d1: 1300, [U.bob]: 400 };
  const after = rerank(base.map((r) => ({ ...r, points: r.points + (gain[r.uid] || 0) })), (r) => r.points);
  return { before: base, after };
}

/** School-vs-school squads (teamRule 'school'): the label is the school. */
export function projectorSchools(): { before: Standings['teams']; after: Standings['teams'] } {
  const before = SCHOOL_NAMES.slice(0, 10).map((name, i) => ({
    key: `sch${i}`,
    label: name,
    rank: i + 1,
    score: 9000 - i * 650,
    counted: 5,
    members: 5 + (i % 3),
    qualified: true,
    needed: 0,
  }));
  const bump: Record<string, number> = { sch3: 2100, sch6: 1800, sch0: 200 };
  const after = rerank(before.map((t) => ({ ...t, score: t.score + (bump[t.key] || 0) })), (t) => t.score);
  return { before, after };
}

export function projectorScenarios(now: number): ProjectorScenario[] {
  const question: LiveState = {
    phase: 'question',
    index: 3,
    opensAt: now - 5000,
    closesAt: now + 15000,
    revealUntil: now + 20000,
    questionCount: 10,
    questionMs: 20000,
    question: {
      q: 'Quelle est la capitale du département du Centre ?',
      qHt: 'Ki kapital depatman Sant lan ?',
      options: ['Hinche', 'Mirebalais', 'Lascahobas', 'Cerca-la-Source'],
      optionsHt: null,
      flagIso: null,
      category: 'geo',
    },
    reveal: null,
  };
  const reveal: LiveState = {
    ...question,
    phase: 'reveal',
    reveal: {
      index: 3,
      answer: 0,
      explanation: '',
      explanationHt: '',
      counts: [31, 9, 4, 2],
      answered: 46,
      correct: 31,
    },
  };
  const { before, after } = projectorRows();
  const sch = projectorSchools();
  const players = (rows: Standings['rows'], final = false): Standings => ({ rows, teams: [], total: rows.length, final, updatedAt: now });
  const squads = (teams: Standings['teams'], final = false): Standings => ({ rows: after, teams, total: teams.length, final, updatedAt: now });
  return [
    {
      id: 'lobby',
      label: 'Avant le coup d’envoi',
      event: { title: LONG_TITLE, delivery: 'app' },
      live: { ...question, phase: 'lobby', question: null, index: -1 },
      board: null,
      phase: 'scheduled',
    },
    {
      id: 'live',
      label: 'Question en cours + classement',
      event: { title: LONG_TITLE, delivery: 'app' },
      live: question,
      board: players(before),
      phase: 'running',
    },
    {
      id: 'live-low',
      label: 'Fin du chrono (≤ 5 s)',
      event: { title: 'Quiz de rentrée' },
      live: { ...question, closesAt: now + 4000 },
      board: players(before),
      phase: 'running',
    },
    {
      id: 'reveal',
      label: 'Révélation + reclassement',
      event: { title: 'Quiz de rentrée' },
      live: reveal,
      board: players(after),
      boardBefore: players(before),
      phase: 'running',
    },
    {
      id: 'schools',
      label: 'École contre école (10 écoles)',
      event: { title: 'Championnat du Plateau Central' },
      live: reveal,
      board: squads(sch.after),
      boardBefore: squads(sch.before),
      phase: 'running',
      teamRule: 'school',
    },
    {
      id: 'final',
      label: 'Résultat final (podium)',
      event: { title: 'Quiz de rentrée' },
      live: null,
      board: players(after, true),
      phase: 'finished',
    },
    {
      id: 'final-schools',
      label: 'Podium des écoles',
      event: { title: 'Championnat du Plateau Central' },
      live: null,
      board: squads(sch.after, true),
      phase: 'finished',
      teamRule: 'school',
    },
    {
      id: 'empty',
      label: 'Vide (en attente)',
      event: { title: 'Quiz de rentrée' },
      live: null,
      board: null,
      phase: 'scheduled',
    },
    {
      id: 'error',
      label: 'Erreur',
      event: null,
      live: null,
      board: null,
      phase: '',
      error: 'network',
    },
  ];
}

export interface RoomScenario {
  id: string;
  label: string;
  tour: Tournament;
  roster: RosterEntry[];
  live: LiveState | null;
  progress: { index: number; answered: number } | null;
  standings: Standings | null;
  standingsBefore?: Standings | null;
  me: string;
}

/** The tournament room (/tournois/:id) in its live phases, many players, school vs school. */
export function roomScenarios(now: number): RoomScenario[] {
  const pj = projectorScenarios(now);
  const at = (id: string) => pj.find((p) => p.id === id)!;
  const { before, after } = projectorRows();
  const sch = projectorSchools();
  const tour: Tournament = {
    title: 'Quiz de rentrée — Plateau Central',
    description: '',
    format: 'live',
    teamRule: 'school',
    teamSize: 5,
    visibility: 'public',
    categories: ['geo'],
    questionCount: 10,
    secondsPerQuestion: 20,
    startsAt: now - 5 * 60_000,
    windowHours: 0,
    roundHours: 0,
    roundCount: 0,
    maxPlayers: 60,
    creatorPlays: false,
    schemaVersion: 1,
    id: 'tFixtureRoom',
    creatorUid: U.bob,
    creatorName: 'M. Jean-Baptiste',
    pin: '482913',
    state: 'running',
    schedule: { format: 'live', startsAt: now - 5 * 60_000, endsAt: now + 10 * 60_000, questionMs: 20000, questionCount: 10, revealMs: 6000, rounds: [], roundMs: 0 },
    nextDeadlineAt: null,
    playerCount: after.length,
    currentRound: 0,
    closedThrough: 0,
    bracketRounds: 0,
    winner: null,
    createdAt: now - DAY,
  };
  const roster: RosterEntry[] = after.map((r, i) => ({ uid: r.uid, displayName: r.displayName, school: r.school, grade: null, seed: i, joinedAt: now - DAY }));
  const pjReveal = at('reveal').live!;
  const roomReveal: LiveState = { ...pjReveal, reveal: { ...pjReveal.reveal!, counts: [8, 2, 1, 1], answered: 12, correct: 8 } };
  const board = (rows: Standings['rows'], teams: Standings['teams'], final = false): Standings => ({ rows, teams, total: rows.length, final, updatedAt: now });
  return [
    {
      id: 'room-lobby', label: 'Salle — avant le départ',
      tour: { ...tour, state: 'scheduled', startsAt: now + 95_000 }, roster, live: at('lobby').live, progress: null, standings: null, me: U.me,
    },
    {
      id: 'room-live', label: 'Salle — question en cours',
      tour, roster, live: at('live').live, progress: { index: 3, answered: 17 }, standings: board(before, sch.before), me: U.me,
    },
    {
      id: 'room-reveal', label: 'Salle — révélation + reclassement',
      // The room has 12 players: its own vote counts.
      tour, roster, live: roomReveal, progress: null, standings: board(after, sch.after), standingsBefore: board(before, sch.before), me: U.me,
    },
    {
      id: 'room-final', label: 'Salle — podium final',
      tour: { ...tour, state: 'finished' }, roster, live: { ...roomReveal, phase: 'done' }, progress: null, standings: board(after, sch.after, true), me: U.me,
    },
  ];
}
