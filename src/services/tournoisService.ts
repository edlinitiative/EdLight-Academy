/**
 * tournoisService — the web side of user-created tournaments.
 *
 * READS go straight to Firestore through listeners (the rules decide who may
 * see what — see the Tournois block in firestore.rules). WRITES all go through
 * /api/tournois/*: the client never writes a tournament document, a score or a
 * roster row, and never sees an answer key before the server reveals it.
 *
 * `tick()` is how a page keeps a tournament on time without a secret: when its
 * countdown reaches the next deadline it asks the server to catch up, and the
 * server does only what the stored schedule already says should have happened.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { authedFetch, db, getIdToken } from './firebase';
import type { Schedule } from '../../shared/tournois/schedule';
import type { TournamentConfig } from '../../shared/tournois/config';
import type { PublicQuestion } from '../../shared/tournois/questions';
import type { Match } from '../../shared/tournois/bracket';

export type TournamentState = 'scheduled' | 'running' | 'finished' | 'cancelled';

export interface Tournament extends TournamentConfig {
  id: string;
  creatorUid: string;
  creatorName: string;
  pin: string;
  state: TournamentState;
  schedule: Schedule;
  nextDeadlineAt: number | null;
  playerCount: number;
  currentRound: number;
  closedThrough: number;
  bracketRounds: number;
  winner: { uid: string; displayName: string } | null;
  createdAt: number;
}

export interface LiveReveal {
  index: number;
  answer: number;
  explanation: string;
  explanationHt: string;
  counts: number[];
  answered: number;
  correct: number;
}

export interface LiveState {
  phase: 'lobby' | 'question' | 'reveal' | 'done';
  index: number;
  opensAt: number;
  closesAt: number;
  revealUntil: number;
  questionCount: number;
  questionMs: number;
  question: PublicQuestion | null;
  reveal: LiveReveal | null;
}

export interface StandingRow {
  uid: string;
  displayName: string;
  school: string | null;
  grade: string | null;
  points: number;
  correct: number;
  answered: number;
  rank: number;
}

export interface TeamRow {
  key: string;
  label: string;
  rank: number;
  score: number;
  counted: number;
  members: number;
  qualified: boolean;
  needed: number;
}

export interface Standings {
  rows: StandingRow[];
  teams: TeamRow[];
  total: number;
  final: boolean;
  updatedAt: number;
}

export interface RosterEntry {
  uid: string;
  displayName: string;
  school: string | null;
  grade: string | null;
  seed: number;
  joinedAt: number;
}

export interface MyTournament {
  tid: string;
  title: string;
  format: TournamentConfig['format'];
  startsAt: number;
  role: 'creator' | 'player';
}

// ── Listeners ─────────────────────────────────────────────────────────────

type Unsub = () => void;

export function watchTournament(tid: string, cb: (t: Tournament | null, err?: string) => void): Unsub {
  return onSnapshot(
    doc(db, 'userTournaments', tid),
    (s) => cb(s.exists() ? (s.data() as Tournament) : null),
    (err) => cb(null, err?.code === 'permission-denied' ? 'private' : 'error'),
  );
}

export function watchLive(tid: string, cb: (l: LiveState | null) => void): Unsub {
  return onSnapshot(doc(db, 'userTournaments', tid, 'live', 'state'), (s) => cb(s.exists() ? (s.data() as LiveState) : null), () => cb(null));
}

export function watchProgress(tid: string, cb: (p: { index: number; answered: number } | null) => void): Unsub {
  return onSnapshot(doc(db, 'userTournaments', tid, 'live', 'progress'), (s) => cb(s.exists() ? (s.data() as any) : null), () => cb(null));
}

export function watchStandings(tid: string, cb: (s: Standings | null) => void): Unsub {
  return onSnapshot(doc(db, 'userTournaments', tid, 'standings', 'current'), (s) => cb(s.exists() ? (s.data() as Standings) : null), () => cb(null));
}

export function watchRoster(tid: string, cb: (r: RosterEntry[]) => void): Unsub {
  return onSnapshot(
    query(collection(db, 'userTournaments', tid, 'roster'), orderBy('seed', 'asc'), limit(500)),
    (s) => cb(s.docs.map((d) => d.data() as RosterEntry)),
    () => cb([]),
  );
}

export function watchMatches(tid: string, cb: (m: Match[]) => void): Unsub {
  return onSnapshot(
    collection(db, 'userTournaments', tid, 'matches'),
    (s) => cb(s.docs.map((d) => d.data() as Match).sort((a, b) => a.round - b.round || a.slot - b.slot)),
    () => cb([]),
  );
}

// ── Lists ─────────────────────────────────────────────────────────────────

export async function listPublic(kind: 'open' | 'finished'): Promise<Tournament[]> {
  const base = collection(db, 'userTournaments');
  const q = kind === 'open'
    ? query(base, where('visibility', '==', 'public'), where('state', 'in', ['scheduled', 'running']), orderBy('startsAt', 'asc'), limit(30))
    : query(base, where('visibility', '==', 'public'), where('state', '==', 'finished'), orderBy('startsAt', 'desc'), limit(10));
  const s = await getDocs(q);
  return s.docs.map((d) => d.data() as Tournament);
}

export async function listMine(uid: string): Promise<MyTournament[]> {
  const s = await getDocs(query(collection(db, 'users', uid, 'myTournaments'), orderBy('startsAt', 'desc'), limit(30)));
  return s.docs.map((d) => d.data() as MyTournament);
}

export async function resolvePin(pin: string): Promise<string | null> {
  const clean = String(pin || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  try {
    const s = await getDoc(doc(db, 'tournamentPins', clean));
    return s.exists() ? (s.data().tid as string) : null;
  } catch {
    return null;
  }
}

// ── API ───────────────────────────────────────────────────────────────────

export interface ApiResult<T = any> {
  ok: boolean;
  error?: string;
  fields?: string[];
  data?: T;
}

async function post<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const r = await authedFetch(url, body);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data?.error || `http_${r.status}`, fields: data?.fields };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export interface Identity {
  displayName?: string | null;
  school?: string | null;
  grade?: string | null;
}

export const createTournament = (input: Record<string, unknown>) =>
  post<{ tid: string; pin: string; creatorJoined: boolean; joinError?: string }>('/api/tournois/create', input);

export const cancelTournament = (tid: string) => post('/api/tournois/create', { action: 'cancel', tid });

export const joinTournament = (target: { tid?: string; pin?: string }, who: Identity) =>
  post<{ tid: string; already: boolean }>('/api/tournois/join', { ...target, ...who });

export const liveAnswer = (tid: string, index: number, choice: number, clientShownAt: number) =>
  post('/api/tournois/play', { action: 'live-answer', tid, index, choice, clientShownAt });

export interface RoundStep {
  round: number;
  pos: number;
  count: number;
  question: PublicQuestion | null;
  servedAt: number | null;
  deadline: number | null;
  done: boolean;
  serverNow: number;
}

export const startRound = (tid: string) => post<RoundStep>('/api/tournois/play', { action: 'start', tid });

export const answerRound = (tid: string, round: number, pos: number, choice: number) =>
  post<RoundStep>('/api/tournois/play', { action: 'answer', tid, round, pos, choice });

export interface ReviewItem extends PublicQuestion {
  answer: number;
  explanation: string;
  explanationHt: string;
  choice: number | null;
  points: number;
}

export const reviewAnswers = (tid: string, round?: number) =>
  post<{ items: ReviewItem[] }>('/api/tournois/play', { action: 'review', tid, round });

/** Ask the server to catch up. Works signed out (spectators). Returns the server clock. */
export async function tick(tid: string): Promise<number | null> {
  try {
    const token = await getIdToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch('/api/tournois/tick', { method: 'POST', headers, body: JSON.stringify({ tid }) });
    const data = await r.json().catch(() => ({}));
    return typeof data?.serverNow === 'number' ? data.serverNow : null;
  } catch {
    return null;
  }
}

// ── Copy ──────────────────────────────────────────────────────────────────

export function errorMessage(code: string | undefined, isCreole: boolean): string {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  switch (code) {
    case 'not_found': return t('Tournoi introuvable. Vérifiez le PIN.', 'Nou pa jwenn tounwa a. Verifye PIN nan.');
    case 'pin_required': return t('Ce tournoi est privé : entrez son PIN.', 'Tounwa sa a prive : antre PIN li.');
    case 'closed': return t('Les inscriptions sont fermées.', 'Enskripsyon yo fèmen.');
    case 'full': return t('Ce tournoi est complet.', 'Tounwa sa a plen.');
    case 'school_required': return t('École contre école : indiquez votre école.', 'Lekòl kont lekòl : di ki lekòl ou.');
    case 'grade_required': return t('Classe contre classe : indiquez votre classe.', 'Klas kont klas : di ki klas ou.');
    case 'name_required': return t('Choisissez un pseudo pour le classement.', 'Chwazi yon non pou klasman an.');
    case 'not_enough_questions': return t('Pas assez de questions dans ces catégories — ajoutez-en une.', 'Pa gen ase kesyon nan kategori sa yo — ajoute youn.');
    case 'invalid': return t('Vérifiez les champs en rouge.', 'Verifye chan ki an wouj yo.');
    case 'rate_limit_exceeded': return t('Trop de tentatives. Réessayez plus tard.', 'Twòp esè. Eseye ankò pita.');
    case 'answers_closed': return t('Trop tard pour cette question.', 'Twò ta pou kesyon sa a.');
    case 'not_in_this_round': return t('Vous ne jouez pas cette manche (exempté ou éliminé).', 'Ou pa jwe manch sa a (egzante oswa elimine).');
    case 'no_open_round': return t('Aucune manche ouverte en ce moment.', 'Pa gen manch ki louvri kounye a.');
    case 'unauthorized': return t('Connectez-vous pour continuer.', 'Konekte pou kontinye.');
    case 'network': return t('Connexion perdue. Réessayez.', 'Koneksyon an koupe. Eseye ankò.');
    default: return t('Une erreur est survenue. Réessayez.', 'Gen yon erè. Eseye ankò.');
  }
}

export function formatLabel(f: TournamentConfig['format'], isCreole: boolean): string {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  switch (f) {
    case 'live': return t('En direct', 'An dirèk');
    case 'window': return t('Fenêtre ouverte', 'Fenèt louvri');
    case 'rounds': return t('Manches', 'Manch');
    case 'bracket': return t('Élimination', 'Eliminasyon');
    default: return f;
  }
}

export function shareUrl(t: Pick<Tournament, 'id' | 'pin' | 'visibility'>): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://academy.edlight.org';
  return t.visibility === 'private' ? `${origin}/tournois/rejoindre?pin=${t.pin}` : `${origin}/tournois/${t.id}`;
}
