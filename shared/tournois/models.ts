import type { Schedule } from './schedule';
import type { TournamentConfig } from './config';
import type { PublicQuestion } from './questions';
import type { GameMode, TeamGameMode } from '../teams/modes';

export type TournamentState =
  | 'scheduled'
  | 'running'
  | 'finished'
  | 'cancelled';

export interface Tournament extends TournamentConfig {
  schemaVersion?: 1 | 2;
  competitionEventId?: string;
  /** Absent: independent answers. Team modes are played through the team actions only. */
  gameMode?: GameMode;
  teamPolicy?: string;
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
  /** Present on a class-vs-class fixture: entry is through Mes classes only. */
  classFixtureId?: string;
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
  /** Chosen avatar wire string when known; absent → the seeded face. */
  avatar?: string | null;
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

/** One locked named team on a board (independent, shared-answer or relay scoring). */
export interface NamedTeamRow {
  id: string;
  label: string;
  starters: string[];
  points: number;
  correct: number;
  totalMs: number;
  /** Independent: starters with no answer. */
  missing: number;
  rank: number;
  /** Present for shared-answer and relay teams. */
  gameMode?: TeamGameMode;
  /** Team modes: questions the team did not answer. */
  missed?: number;
  /** Independent: per starter. Relay: per slot. Shared: empty. */
  contributions: Array<{
    uid: string;
    points: number;
    correct: number;
    answered: number;
    totalMs: number;
    missed?: number;
  }>;
}

export interface Standings {
  namedTeams?: NamedTeamRow[];
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
  /** teamRule 'class': public team key + label of the verified class. */
  classKey?: string | null;
  classLabel?: string | null;
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
