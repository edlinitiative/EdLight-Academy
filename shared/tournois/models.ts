import type { Schedule } from './schedule';
import type { TournamentConfig } from './config';
import type { PublicQuestion } from './questions';

export type TournamentState =
  | 'scheduled'
  | 'running'
  | 'finished'
  | 'cancelled';

export interface Tournament extends TournamentConfig {
  schemaVersion?: 1 | 2;
  competitionEventId?: string;
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

export interface Standings {
  namedTeams?: ReturnType<typeof import('../teams/policy').rankNamedTeams>;
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
