import type { TournamentConfig } from '../tournois/config';
import type { Fixture } from '../leagues/standings';
export interface Team {
  id: string;
  name: string;
  captainUid: string;
  members: string[];
  schoolKey: string | null;
  visibility: 'private' | 'school';
  revision: number;
  createdAt: number;
}
export interface CompetitionEvent {
  id: string;
  title: string;
  description: string;
  ownerUid: string;
  hostName: string;
  hostKind: 'student' | 'school';
  schoolKey: string | null;
  department: string | null;
  audience: 'public' | 'school' | 'private';
  entryPolicy: 'open' | 'approval' | 'invitation';
  entryMode: 'individual' | 'named_team';
  delivery: 'online' | 'physical' | 'external';
  state: 'draft' | 'published' | 'cancelled' | 'closed';
  config: TournamentConfig;
  registrationClosesAt: number;
  revision: number;
  entryCount: number;
  tournamentId: string | null;
  cohosts: Record<string, 'manage' | 'checkin'>;
  venue: string;
  instructions: string;
  externalUrl: string;
  resultStatus:
    | 'pending'
    | 'reported'
    | 'disputed'
    | 'confirmed'
    | 'no_contest';
  resultRevision: number;
  resultRows: Array<{ entryId: string; score: number }>;
  reward: { description: string; provider: string; contact: string } | null;
  createdAt: number;
  updatedAt: number;
}
export interface EventEntry {
  id: string;
  eventId: string;
  captainUid: string;
  teamId: string | null;
  label: string;
  starters: string[];
  confirmed: string[];
  state: 'draft' | 'registered' | 'withdrawn';
  revision: number;
  policyVersion: string;
  rosterSchoolKey: string | null;
  lockedAt: number | null;
}
export interface League {
  id: string;
  title: string;
  ownerUid: string;
  schoolKey: string;
  public: boolean;
  state: 'draft' | 'active' | 'closed';
  entrants: Array<{ id: string; label: string }>;
  fixtures: Fixture[];
  revision: number;
  rosterPolicy: 'per-fixture-three';
  scoringPolicy: '3-1-0-difference-scored-v1';
  sourcePolicy: 'app_quiz_10x20_window24' | 'external_100_points_v1';
  createdAt: number;
}
export interface InboxItem {
  id: string;
  kind: 'team' | 'invite' | 'event' | 'entry' | 'league';
  targetId: string;
  title: string;
  updatedAt: number;
}
