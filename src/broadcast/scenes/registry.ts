/**
 * Which component speaks for which scene.
 *
 * Written once, in full, up front — every `SceneKind` the director can produce
 * has an entry here from the first day, pointing at a file that exists. That is
 * deliberate: if the registry grew as sequences were built, then adding a
 * sequence would mean editing this file, and several people building sequences
 * at once would collide on this one line-list instead of owning whole files.
 *
 * So a sequence is built by REPLACING its own file. Nothing else moves.
 */

import type { SceneKind } from '../../../shared/arena/director';
import type { SceneComponent } from '../sceneContract';

import Board from './Board';
import TournamentOpen from './TournamentOpen';
import RoundStart from './RoundStart';
import QuestionClosed from './QuestionClosed';
import LeadChange from './LeadChange';
import SchoolOvertake from './SchoolOvertake';
import PlayerEntersTop5 from './PlayerEntersTop5';
import PlayerLeavesTop5 from './PlayerLeavesTop5';
import PerfectRound from './PerfectRound';
import PlayerStreak from './PlayerStreak';
import SchoolStreak from './SchoolStreak';
import BiggestClimber from './BiggestClimber';
import Comeback from './Comeback';
import Tie from './Tie';
import PlayerCarry from './PlayerCarry';
import Halftime from './Halftime';
import FinalFive from './FinalFive';
import FinalQuestion from './FinalQuestion';
import Grading from './Grading';
import ChampionSchool from './ChampionSchool';
import ChampionIndividual from './ChampionIndividual';

export const SCENES: Record<SceneKind, SceneComponent> = {
  BOARD: Board,
  TOURNAMENT_OPEN: TournamentOpen,
  ROUND_START: RoundStart,
  QUESTION_CLOSED: QuestionClosed,
  LEAD_CHANGE: LeadChange,
  SCHOOL_OVERTAKE: SchoolOvertake,
  PLAYER_ENTERS_TOP_5: PlayerEntersTop5,
  PLAYER_LEAVES_TOP_5: PlayerLeavesTop5,
  PERFECT_ROUND: PerfectRound,
  PLAYER_STREAK: PlayerStreak,
  SCHOOL_STREAK: SchoolStreak,
  BIGGEST_CLIMBER: BiggestClimber,
  COMEBACK: Comeback,
  TIE: Tie,
  PLAYER_CARRY: PlayerCarry,
  HALFTIME: Halftime,
  FINAL_FIVE: FinalFive,
  FINAL_QUESTION: FinalQuestion,
  GRADING: Grading,
  CHAMPION_SCHOOL: ChampionSchool,
  CHAMPION_INDIVIDUAL: ChampionIndividual,
};
