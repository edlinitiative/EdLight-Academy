/**
 * teams/client — what the web room and the app show for shared-answer and
 * relay team play. Pure and platform-free: both renderers draw the same
 * model from the server's `team-state` view, so neither can invent a control
 * the server does not support (no pause, no extra turn, no client-side
 * authority). French/Kreyòl copy pairs, like shared/competition/labels.
 */
import type { PublicQuestion } from '../tournois/questions';

export type Copy = [string, string];

export interface TeamLeg {
  owner: string;
  start: number;
  end: number;
  openedAt: number;
  startedAt: number;
  endedAt: number;
  forfeited: boolean;
  /** When the owner must have started by (open, unstarted legs only). */
  startBy: number | null;
}

export interface TeamWindowView {
  round: number;
  pos: number;
  count: number;
  question: PublicQuestion | null;
  servedAt: number | null;
  deadline: number | null;
  done: boolean;
  begun: boolean;
  answered?: number;
  lastChoice?: { pos: number; choice: number; uid: string | null } | null;
  legs: TeamLeg[];
  turnMs: number;
  opensAt: number | null;
  closesAt: number | null;
}

export interface TeamLiveView {
  index: number;
  phase: 'lobby' | 'question' | 'reveal' | 'done';
  closesAt: number;
  owner: string | null;
  answer: { uid: string; choice: number } | null;
}

/** The server's `team-state` response (also returned by every team action). */
export interface TeamState {
  mode: 'shared' | 'relay';
  policy: string | null;
  entryId: string;
  label: string;
  starters: string[];
  captainUid: string;
  started: boolean;
  holderUid: string;
  deputyUid: string;
  authorityVersion: number;
  claimableAt: number | null;
  slots: string[];
  dutiesConfirmed: string[];
  rolesVersion: number;
  live?: TeamLiveView;
  window?: TeamWindowView;
  serverNow: number;
  recorded?: boolean;
  duplicate?: boolean;
}

type Post = <T>(url: string, body: unknown) => Promise<{ ok: boolean; error?: string; data?: T }>;

/** The team actions of POST /api/tournois/play, bound to a platform's authenticated `post`. */
export function createTeamPlayApi(post: Post) {
  const play = <T = TeamState>(body: Record<string, unknown>) => post<T>('/api/tournois/play', body);
  return {
    state: (tid: string) => play({ action: 'team-state', tid }),
    liveAnswer: (tid: string, index: number, choice: number, version: number, clientShownAt: number) =>
      play<{ recorded: boolean; duplicate: boolean; authorityVersion: number }>({
        action: 'team-live-answer', tid, index, choice, version, clientShownAt,
      }),
    start: (tid: string, version: number) => play({ action: 'team-start', tid, version }),
    answer: (tid: string, pos: number, choice: number, version: number) =>
      play({ action: 'team-answer', tid, round: 0, pos, choice, version }),
    transfer: (tid: string, to: string, version: number) => play({ action: 'team-transfer', tid, to, version }),
    claim: (tid: string, version: number) => play({ action: 'team-claim', tid, version }),
  };
}

/** How often a starter's screen asks for the team state (also its presence signal). */
export const TEAM_POLL_MS = 3_000;

const join = (sep: string, ...parts: Copy[]): Copy => [
  parts.map((p) => p[0]).join(sep),
  parts.map((p) => p[1]).join(sep),
];
const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
const clock = (ms: number): Copy => {
  const m = Math.max(0, Math.round(ms / 60000));
  const text = m >= 120 ? `${Math.round(m / 60)} h` : m >= 1 ? `${m} min` : `${seconds(ms)} s`;
  return [text, text];
};

export interface TeamPanelModel {
  /** One-line answer to "whose move is it?". */
  status: Copy;
  notes: Copy[];
  /** This device may submit the team's answer for the question on screen. */
  canAnswer: boolean;
  /** The question text may be shown (relay window: owner only). */
  showQuestion: boolean;
  canStart: boolean;
  startLabel: Copy;
  canClaim: boolean;
  /** Milliseconds until a claim becomes possible (shown as a countdown), or null. */
  claimIn: number | null;
  canTransfer: boolean;
  transferTo: string[];
  /** The option the team already sent for the question on screen. */
  teamChoice: number | null;
  /** The next deadline that matters to this player. */
  deadline: number | null;
}

/** Live relay: the 1-based question numbers a slot answers. */
export function relayLiveTurns(slots: string[], uid: string, questionCount: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < questionCount; i += 1) if (slots[i % slots.length] === uid) out.push(i + 1);
  return out;
}

const turnsCopy = (mine: number[]): Copy => [`Vos questions : ${mine.join(', ')}`, `Kesyon pa w : ${mine.join(', ')}`];

export function rolesSummary(s: Pick<TeamState, 'mode' | 'holderUid' | 'deputyUid' | 'slots'>, name: (uid: string) => string): Copy[] {
  if (s.mode === 'shared')
    return [
      [`Porte-parole : ${name(s.holderUid)}`, `Pòtpawòl : ${name(s.holderUid)}`],
      [`Suppléant : ${name(s.deputyUid)}`, `Ranplasan : ${name(s.deputyUid)}`],
    ];
  return s.slots.map((u, i): Copy => [`Relais ${i + 1} : ${name(u)}`, `Relè ${i + 1} : ${name(u)}`]);
}

/** The rule summary a starter reads before play (also the practice round's script). */
export function modeRules(mode: 'shared' | 'relay', format: 'live' | 'window'): Copy[] {
  if (mode === 'shared')
    return [
      ['Discutez librement : l’équipe envoie UNE réponse par question.', 'Nou ka diskite : ekip la voye YON sèl repons pou chak kesyon.'],
      ['Seul le porte-parole envoie. Les autres voient la même question et proposent.', 'Se pòtpawòl la sèl ki voye. Lòt yo wè menm kesyon an epi pwopoze.'],
      ['Le porte-parole peut passer la main à un coéquipier. Une réponse envoyée ne se change pas.', 'Pòtpawòl la ka pase men bay yon lòt manm. Yon repons ki voye pa chanje.'],
      ['S’il se déconnecte, le suppléant peut reprendre la main après 15 s, puis tout titulaire après 30 s. Le temps continue de courir.', 'Si li dekonekte, ranplasan an ka pran men an apre 15 s, epi nenpòt titilè apre 30 s. Tan an kontinye kouri.'],
    ];
  return format === 'live'
    ? [
        ['Chacun son tour : la question 1 au relais 1, la 2 au relais 2, la 3 au relais 3, et ainsi de suite.', 'Chak moun jwe tou pa l : kesyon 1 pou relè 1, 2 pou relè 2, 3 pou relè 3, konsa konsa.'],
        ['Seul le joueur dont c’est le tour peut répondre. Un tour sans réponse vaut zéro et la partie continue.', 'Se sèlman moun ki gen tou a ki ka reponn. Yon tou san repons vo zewo epi jwèt la kontinye.'],
        ['Pas de remplaçant : un coéquipier ne peut pas jouer votre tour.', 'Pa gen ranplasan : yon lòt manm pa ka jwe tou ou.'],
      ]
    : [
        ['Les questions sont partagées en trois relais joués l’un après l’autre.', 'Kesyon yo separe an twa relè ki jwe youn apre lòt.'],
        ['Quand votre relais s’ouvre, vous avez un délai pour le commencer ; sinon il compte zéro et le suivant s’ouvre.', 'Lè relè ou louvri, ou gen yon delè pou kòmanse l ; sinon li konte zewo epi pwochen an louvri.'],
        ['Une fois commencé, chaque question a son propre temps. Seul le joueur du relais voit ses questions.', 'Lè ou kòmanse, chak kesyon gen pwòp tan pa l. Se sèlman jwè relè a ki wè kesyon li yo.'],
        ['Pas de remplaçant : un coéquipier ne peut pas jouer votre relais.', 'Pa gen ranplasan : yon lòt manm pa ka jwe relè ou.'],
      ];
}

/** Derive what this starter can do now. `questionCount` is the event's. */
export function teamPanelModel(
  s: TeamState,
  uid: string,
  now: number,
  name: (uid: string) => string,
  questionCount: number,
): TeamPanelModel {
  const base: TeamPanelModel = {
    status: ['', ''],
    notes: [],
    canAnswer: false,
    showQuestion: false,
    canStart: false,
    startLabel: ['Commencer', 'Kòmanse'],
    canClaim: false,
    claimIn: null,
    canTransfer: false,
    transferTo: [],
    teamChoice: null,
    deadline: null,
  };
  if (!s.started) {
    return {
      ...base,
      status: ['Rôles prévus — ils seront figés au début.', 'Wòl yo prevwa — y ap fikse lè sa kòmanse.'],
      notes: [
        ...(s.mode === 'relay' && s.live
          ? [turnsCopy(relayLiveTurns(s.slots, uid, questionCount))]
          : []),
        ...rolesSummary(s, name),
      ],
    };
  }
  if (s.mode === 'shared') {
    const holder = s.holderUid === uid;
    const claimIn = s.claimableAt === null ? null : Math.max(0, s.claimableAt - now);
    const shared: TeamPanelModel = {
      ...base,
      canClaim: !holder && claimIn === 0,
      claimIn: !holder && claimIn ? claimIn : null,
      canTransfer: holder || s.captainUid === uid,
      transferTo: s.starters.filter((u) => u !== s.holderUid),
      notes: rolesSummary(s, name),
    };
    if (s.live) {
      const open = s.live.phase === 'question' && s.live.index >= 0;
      const sent = s.live.answer;
      return {
        ...shared,
        showQuestion: true,
        teamChoice: sent?.choice ?? null,
        canAnswer: holder && open && !sent && now < s.live.closesAt,
        deadline: open ? s.live.closesAt : null,
        status: sent
          ? [`Réponse de l’équipe envoyée par ${name(sent.uid)}. Révélation à la fin du temps.`, `${name(sent.uid)} voye repons ekip la. Repons lan ap parèt lè tan an fini.`]
          : holder
            ? ['Vous envoyez la réponse de l’équipe. Discutez, puis choisissez.', 'Se ou ki voye repons ekip la. Diskite, epi chwazi.']
            : [`${name(s.holderUid)} envoie la réponse de l’équipe. Proposez votre idée à voix haute.`, `${name(s.holderUid)} ap voye repons ekip la. Pwopoze lide ou.`],
      };
    }
    const w = s.window;
    if (!w) return shared;
    if (w.done) return { ...shared, canTransfer: false, canClaim: false, claimIn: null, status: ['Partie de l’équipe terminée. Correction à la clôture.', 'Pati ekip la fini. Koreksyon an lè fenèt la fèmen.'] };
    if (!w.begun)
      return {
        ...shared,
        canStart: holder,
        startLabel: ['Commencer la partie de l’équipe', 'Kòmanse pati ekip la'],
        status: holder
          ? ['Réunissez l’équipe, puis commencez : une seule tentative.', 'Rasanble ekip la, epi kòmanse : yon sèl chans.']
          : [`En attente : ${name(s.holderUid)} lance la partie de l’équipe.`, `N ap tann : ${name(s.holderUid)} ap lanse pati ekip la.`],
      };
    return {
      ...shared,
      showQuestion: true,
      canAnswer: holder && !!w.question && !!w.deadline && now < w.deadline,
      deadline: w.deadline,
      status: holder
        ? [`Question ${w.pos + 1}/${w.count} — vous envoyez la réponse de l’équipe.`, `Kesyon ${w.pos + 1}/${w.count} — se ou ki voye repons ekip la.`]
        : [`Question ${w.pos + 1}/${w.count} — ${name(s.holderUid)} envoie la réponse.`, `Kesyon ${w.pos + 1}/${w.count} — ${name(s.holderUid)} ap voye repons lan.`],
    };
  }
  // Relay
  if (s.live) {
    const turns = turnsCopy(relayLiveTurns(s.slots, uid, questionCount));
    const open = s.live.phase === 'question' && s.live.index >= 0;
    const owner = s.live.owner;
    const sent = s.live.answer;
    return {
      ...base,
      showQuestion: true,
      teamChoice: sent?.choice ?? null,
      canAnswer: open && owner === uid && !sent && now < s.live.closesAt,
      deadline: open ? s.live.closesAt : null,
      notes: [turns, ...rolesSummary(s, name)],
      status: !open || !owner
        ? ['Relais en direct : suivez le tableau.', 'Relè an dirèk : swiv tablo a.']
        : sent
          ? [`${name(sent.uid)} a répondu pour l’équipe.`, `${name(sent.uid)} reponn pou ekip la.`]
          : owner === uid
            ? ['C’est votre tour : répondez avant la fin du temps.', 'Se tou pa w : reponn anvan tan an fini.']
            : [`Tour de ${name(owner)}.`, `Tou ${name(owner)}.`],
    };
  }
  const w = s.window;
  if (!w) return base;
  const legs = w.legs;
  const legNotes = legs.map((leg, k): Copy => {
    const range = `${leg.start + 1}–${leg.end}`;
    const state: Copy = leg.forfeited
      ? ['forfait (zéro)', 'fòfè (zewo)']
      : leg.endedAt
        ? ['terminé', 'fini']
        : leg.startedAt
          ? ['en cours', 'ap jwe']
          : leg.openedAt
            ? ['à commencer', 'pou kòmanse']
            : ['à venir', 'ap vini'];
    return join(' · ', [`Relais ${k + 1} : ${name(leg.owner)} (questions ${range})`, `Relè ${k + 1} : ${name(leg.owner)} (kesyon ${range})`], state);
  });
  if (!w.begun)
    return {
      ...base,
      notes: rolesSummary(s, name),
      status: ['Le relais s’ouvre avec la fenêtre de jeu.', 'Relè a ap louvri ak fenèt jwèt la.'],
    };
  if (w.done) return { ...base, notes: legNotes, status: ['Relais terminé. Correction à la clôture.', 'Relè a fini. Koreksyon an lè fenèt la fèmen.'] };
  const leg = legs.find((l) => w.pos >= l.start && w.pos < l.end);
  if (!leg) return { ...base, notes: legNotes };
  if (leg.owner === uid) {
    if (!leg.startedAt)
      return {
        ...base,
        notes: legNotes,
        canStart: !!leg.startBy && now < leg.startBy,
        startLabel: ['Commencer mon relais', 'Kòmanse relè mwen'],
        deadline: leg.startBy,
        status: leg.startBy
          ? join(' ', ['C’est votre tour. Commencez dans', 'Se tou pa w. Kòmanse nan'], clock(leg.startBy - now))
          : ['C’est votre tour.', 'Se tou pa w.'],
      };
    return {
      ...base,
      notes: legNotes,
      showQuestion: true,
      canAnswer: !!w.question && !!w.deadline && now < w.deadline,
      deadline: w.deadline,
      status: [`Votre relais — question ${w.pos + 1}/${w.count}.`, `Relè ou — kesyon ${w.pos + 1}/${w.count}.`],
    };
  }
  const mine = legs.findIndex((l) => l.owner === uid);
  const current = legs.indexOf(leg);
  return {
    ...base,
    notes: legNotes,
    deadline: leg.startBy,
    status: mine > current
      ? [`Tour de ${name(leg.owner)}. Votre relais commence après.`, `Tou ${name(leg.owner)}. Relè ou kòmanse apre.`]
      : [`Tour de ${name(leg.owner)}.`, `Tou ${name(leg.owner)}.`],
  };
}

/** A local practice question: nothing is sent, nothing is scored. */
export const PRACTICE_QUESTION = {
  q: 'Quelle est la capitale d’Haïti ?',
  qHt: 'Ki kapital Ayiti ?',
  options: ['Cap-Haïtien', 'Port-au-Prince', 'Jacmel', 'Les Cayes'],
  optionsHt: ['Okap', 'Pòtoprens', 'Jakmèl', 'Okay'],
  answer: 1,
} as const;

/** The practice round's fixed script, step by step. */
export function practiceScript(mode: 'shared' | 'relay'): Copy[] {
  return mode === 'shared'
    ? [
        ['Entraînement : vous êtes le porte-parole. Discutez avec l’équipe, puis choisissez.', 'Antrennman : se ou ki pòtpawòl. Diskite ak ekip la, epi chwazi.'],
        ['Réponse envoyée : en vrai, le serveur l’accepte une seule fois pour toute l’équipe.', 'Repons voye : an vre, sèvè a aksepte l yon sèl fwa pou tout ekip la.'],
        ['La bonne réponse apparaît pour toute l’équipe à la fin du temps.', 'Bon repons lan parèt pou tout ekip la lè tan an fini.'],
      ]
    : [
        ['Entraînement : c’est votre tour de relais. Vous seul pouvez répondre.', 'Antrennman : se tou relè ou. Se ou sèl ki ka reponn.'],
        ['Réponse envoyée : le tour passe au relais suivant.', 'Repons voye : tou a pase bay pwochen relè a.'],
        ['Un tour sans réponse compte zéro ; personne ne peut le jouer à votre place.', 'Yon tou san repons konte zewo ; pèsonn pa ka jwe l pou ou.'],
      ];
}

/** Human time left until `deadline`, for status lines. */
export const timeLeft = (deadline: number, now: number): Copy => clock(deadline - now);
