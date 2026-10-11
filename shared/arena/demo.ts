/**
 * A demo championship — ten fictional schools, simulated students, and the
 * REAL pipeline on top of them.
 *
 * Ted, 2026-10-10: "create a demo with demo schools so i can simulate the
 * tournament visually." The point is to see the evening before there is an
 * evening, so nothing here is a mock of the broadcast: answers are scored with
 * the production tiers (`tierFor`/`tierPoints`), schools and players are ranked
 * by `rankSchools`/`rankIndividuals`, and every movement on screen is what
 * `deriveEvents` says happened between two snapshots — the same function the
 * server's aggregator calls. Cadence events (open, round start, final
 * question, grading, champions) carry the same payloads advance.ts and
 * state.ts write. If the demo looks wrong, the real night would too.
 *
 * Everything is in memory and seeded, so a run is replayable and the page
 * needs no Firestore at all. The schools are invented and say so in their
 * names' context (the page labels the whole thing DÉMO); none is a real
 * school, so no real school is shown winning or losing.
 *
 * PURE: no React, no timers, no network. The page owns the clock.
 */

import {
  ARENA_EVENT_PRIORITY, ARENA_EVENT_TTL_MS, deriveEvents,
  type ArenaEvent, type ArenaEventType, type ArenaPlayerRef, type ArenaSchoolRef,
  type IndividualStanding, type SchoolStanding, type StandingsSnapshot,
} from './events';
import { rankIndividuals, rankSchools, tierFor, tierPoints } from './scoring';

export interface DemoSchool {
  key: string;
  label: string;
  shortName: string;
  commune: string;
  /** 0–1: how often its students answer correctly. */
  strength: number;
  /** Players the school brings. Some arrive late; a couple never do. */
  roster: number;
}

export interface DemoPlayer {
  uid: string;
  displayName: string;
  schoolKey: string;
  skill: number;
  /** Typical answer time in ms. */
  pace: number;
  /** When during doors this player arrives (0–1 of the doors window); >1 = no-show. */
  arrival: number;
  present: boolean;
  score: number;
  correct: number;
  answered: number;
  totalMs: number;
  fullTierCount: number;
  streak: number;
  /** Full-tier correct answers in the current round, to judge a perfect round. */
  roundFull: number;
  roundAsked: number;
  perfectRound: boolean;
  registeredAt: number;
  you?: boolean;
}

export type DemoState = 'doors' | 'live' | 'grading' | 'provisional' | 'final';

export interface DemoQuestionResult {
  index: number;
  correctPct: number;
  fastest: ArenaPlayerRef | null;
  fastestMs: number;
}

/** Fictional schools, spread over the map so arrivals light up the country. */
export const DEMO_SCHOOLS: DemoSchool[] = [
  { key: 'demo-soleil', label: 'Lycée du Soleil Levant', shortName: 'SOLEIL', commune: 'Port-au-Prince', strength: 0.78, roster: 9 },
  { key: 'demo-citadelle', label: 'Collège de la Citadelle', shortName: 'CITADELLE', commune: 'Cap-Haïtien', strength: 0.74, roster: 8 },
  { key: 'demo-flamboyant', label: 'Institution Flamboyant', shortName: 'FLAMBO', commune: 'Jacmel', strength: 0.7, roster: 8 },
  { key: 'demo-morne', label: 'Lycée du Morne Bleu', shortName: 'MORNE', commune: 'Hinche', strength: 0.66, roster: 7 },
  { key: 'demo-lakou', label: 'Collège Lakou Lespwa', shortName: 'LAKOU', commune: 'Les Cayes', strength: 0.72, roster: 8 },
  { key: 'demo-artibonite', label: 'Lycée Rivière d’Or', shortName: 'RIVDOR', commune: 'Gonaïves', strength: 0.63, roster: 7 },
  { key: 'demo-poete', label: 'Collège des Poètes', shortName: 'POÈTES', commune: 'Jérémie', strength: 0.69, roster: 7 },
  { key: 'demo-tortue', label: 'Institution La Tortue', shortName: 'TORTUE', commune: 'Port-de-Paix', strength: 0.6, roster: 6 },
  { key: 'demo-baie', label: 'Lycée de la Baie', shortName: 'BAIE', commune: 'Fort-Liberté', strength: 0.64, roster: 6 },
  { key: 'demo-lac', label: 'Collège du Lac', shortName: 'LAC', commune: 'Miragoâne', strength: 0.58, roster: 5 },
];

const FIRST = ['Anaïs', 'Jean', 'Ketly', 'Ricardo', 'Nadège', 'Wilson', 'Sabine', 'Peterson', 'Fabienne', 'Jeff',
  'Mirlande', 'Stanley', 'Djenny', 'Kervens', 'Roseline', 'Widmaer', 'Christela', 'Frantz', 'Ludmie', 'Mackenson',
  'Nathalie', 'Junior', 'Gaëlle', 'Rodney', 'Esther', 'Bertrand', 'Daphné', 'Ralph', 'Sherley', 'Dieuson'];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface DemoOptions {
  seed?: number;
  totalQuestions?: number;
  teamSize?: number;
  minPlayers?: number;
  /** Questions per round (perfect-round granularity). */
  roundSize?: number;
  /** Put "you" in this school. */
  youSchool?: string | null;
  youName?: string;
  now?: number;
}

export interface DemoSim {
  readonly schools: DemoSchool[];
  readonly players: DemoPlayer[];
  readonly totalQuestions: number;
  state: DemoState;
  /** Index of the question currently open or last closed; -1 before the first. */
  index: number;
  /** Is a question currently accepting answers. */
  open: boolean;
  snapshot: StandingsSnapshot | null;
  lastResult: DemoQuestionResult | null;
  /** Doors progress 0–1 → players arrive. Returns nothing (no events: doors are pre-show). */
  arrive(progress: number, now: number): void;
  /** doors → live. */
  start(now: number): ArenaEvent[];
  /** Open the next question. `category` is what the round-start scene names. */
  openNext(now: number, category?: string): ArenaEvent[];
  /** Close the open question: everyone (and optionally you) answers; the board moves. */
  close(now: number, you?: { correct: boolean; elapsedMs: number } | null): ArenaEvent[];
  /** live → grading. */
  grade(now: number): ArenaEvent[];
  /** grading → provisional: the champions. */
  publish(now: number): ArenaEvent[];
  /** provisional → final. */
  finalize(): void;
}

export function createDemo(opts: DemoOptions = {}): DemoSim {
  const seed = opts.seed ?? 20261010;
  const rand = mulberry32(seed);
  const totalQuestions = opts.totalQuestions ?? 12;
  const teamSize = opts.teamSize ?? 5;
  const minPlayers = opts.minPlayers ?? 5;
  const roundSize = opts.roundSize ?? 4;
  const t0 = opts.now ?? 0;

  const schools = DEMO_SCHOOLS.map((s) => ({ ...s }));
  const byKey = new Map(schools.map((s) => [s.key, s]));
  const players: DemoPlayer[] = [];
  let nameIdx = Math.floor(rand() * FIRST.length);
  for (const s of schools) {
    for (let i = 0; i < s.roster; i += 1) {
      const first = FIRST[nameIdx % FIRST.length];
      nameIdx += 7;
      const initial = String.fromCharCode(65 + Math.floor(rand() * 26));
      players.push({
        uid: `${s.key}-${i}`,
        displayName: `${first} ${initial}.`,
        schoolKey: s.key,
        skill: clamp(s.strength + (rand() - 0.5) * 0.3, 0.25, 0.97),
        pace: 4500 + rand() * 9000,
        // Most arrive during doors; roughly one in twelve never shows.
        arrival: rand() < 0.08 ? 2 : rand() * 0.95,
        present: false,
        score: 0, correct: 0, answered: 0, totalMs: 0, fullTierCount: 0, streak: 0,
        roundFull: 0, roundAsked: 0, perfectRound: false,
        registeredAt: t0 - 86_400_000 + Math.floor(rand() * 3_600_000),
      });
    }
  }
  if (opts.youSchool && byKey.has(opts.youSchool)) {
    players.push({
      uid: 'demo-you',
      displayName: opts.youName || 'Toi',
      schoolKey: opts.youSchool,
      skill: 0, pace: 0, arrival: 0, present: false,
      score: 0, correct: 0, answered: 0, totalMs: 0, fullTierCount: 0, streak: 0,
      roundFull: 0, roundAsked: 0, perfectRound: false,
      registeredAt: t0 - 86_400_000,
      you: true,
    });
  }

  let seq = 1;
  const qualifiedAt = new Map<string, number>();

  const schoolRef = (s: { key: string; label: string; shortName: string }): ArenaSchoolRef =>
    ({ key: s.key, label: s.label, shortName: s.shortName });
  const playerRef = (p: DemoPlayer): ArenaPlayerRef => ({
    uid: p.uid, displayName: p.displayName, schoolKey: p.schoolKey, schoolShort: byKey.get(p.schoolKey)!.shortName,
  });

  const roundOf = (index: number) => (index < 0 ? 0 : Math.floor(index / roundSize) + 1);

  /** The board, built the way api/arena/aggregate.ts buildSnapshot builds it. */
  function build(now: number): StandingsSnapshot {
    const present = players.filter((p) => p.present);
    const order = (a: DemoPlayer, b: DemoPlayer) =>
      b.score - a.score || a.totalMs - b.totalMs || b.correct - a.correct || a.uid.localeCompare(b.uid);

    const ranked = rankSchools(schools.map((s) => {
      const rows = present.filter((p) => p.schoolKey === s.key);
      if (rows.length >= minPlayers && !qualifiedAt.has(s.key)) qualifiedAt.set(s.key, now);
      return {
        key: s.key,
        label: s.label,
        playerScores: rows.map((r) => r.score),
        playerTotalMs: rows.map((r) => r.totalMs),
        playerCorrect: rows.map((r) => r.correct),
        qualifiedAt: qualifiedAt.get(s.key),
        presentCount: rows.length,
      };
    }), { teamSize, minPlayers });

    const schoolsOut: SchoolStanding[] = ranked.map((st) => {
      const s = byKey.get(st.key)!;
      const rows = present.filter((p) => p.schoolKey === st.key).sort(order);
      return {
        key: st.key,
        label: st.label,
        shortName: s.shortName,
        teamAvg: st.teamAvg,
        teamTotalMs: st.teamTotalMs,
        counted: st.counted,
        members: st.members,
        qualified: st.qualified,
        rank: st.rank,
        top5: rows.slice(0, teamSize).map((r) => r.uid),
      };
    });

    const individuals: IndividualStanding[] = rankIndividuals(present.map((p) => ({
      uid: p.uid,
      displayName: p.displayName,
      schoolKey: p.schoolKey,
      score: p.score,
      totalMs: p.totalMs,
      fullTierCount: p.fullTierCount,
      registeredAt: p.registeredAt,
    }))).map((st) => {
      const p = players.find((x) => x.uid === st.uid)!;
      return {
        uid: st.uid,
        displayName: st.displayName,
        schoolKey: st.schoolKey,
        schoolShort: byKey.get(st.schoolKey)!.shortName,
        score: st.score,
        correct: p.correct,
        avgMs: p.answered ? Math.round(p.totalMs / p.answered) : 0,
        rank: st.rank,
        streak: p.streak,
        perfectRound: p.perfectRound,
      };
    });

    return { seq, computedAt: now, schools: schoolsOut, individuals };
  }

  function envelope(type: ArenaEventType, payload: unknown, now: number, questionIndex: number): ArenaEvent {
    const ev = {
      seq,
      type,
      priority: ARENA_EVENT_PRIORITY[type],
      createdAt: now,
      round: roundOf(questionIndex),
      questionIndex,
      ttlMs: ARENA_EVENT_TTL_MS[type],
      payload,
    } as unknown as ArenaEvent;
    seq += 1;
    return ev;
  }

  const sim: DemoSim = {
    schools,
    players,
    totalQuestions,
    state: 'doors',
    index: -1,
    open: false,
    snapshot: null,
    lastResult: null,

    arrive(progress, now) {
      if (sim.state !== 'doors') return;
      for (const p of players) if (!p.present && (p.you || p.arrival <= progress)) p.present = true;
      sim.snapshot = build(now);
    },

    start(now) {
      sim.arrive(1, now);
      sim.state = 'live';
      const present = players.filter((p) => p.present);
      const schoolsIn = new Set(present.map((p) => p.schoolKey)).size;
      return [envelope('TOURNAMENT_OPEN', { schools: schoolsIn, players: present.length }, now, -1)];
    },

    openNext(now, category = '') {
      if (sim.state !== 'live' || sim.open || sim.index + 1 >= totalQuestions) return [];
      sim.index += 1;
      sim.open = true;
      const index = sim.index;
      const events = [envelope('ROUND_START', { index, total: totalQuestions, category }, now, index)];
      if (index === totalQuestions - 1 && sim.snapshot) {
        const ranked = sim.snapshot.schools.filter((s) => s.rank > 0).sort((a, b) => a.rank - b.rank);
        const lead = ranked[0];
        const atStake = ranked.slice(0, 4).map((s) => ({ school: schoolRef(s), behind: lead ? lead.teamAvg - s.teamAvg : 0 }));
        events.push(envelope('FINAL_QUESTION', { atStake }, now, index));
      }
      return events;
    },

    close(now, you) {
      if (!sim.open) return [];
      sim.open = false;
      const index = sim.index;
      const difficulty = 0.15 + rand() * 0.55;
      const roundStart = index % roundSize === 0;
      const roundEnd = (index + 1) % roundSize === 0 || index === totalQuestions - 1;
      let answered = 0;
      let right = 0;
      let fastest: DemoPlayer | null = null;
      let fastestMs = Infinity;

      for (const p of players) {
        p.perfectRound = false;
        if (!p.present) continue;
        if (roundStart) { p.roundFull = 0; p.roundAsked = 0; }
        p.roundAsked += 1;
        let correct: boolean;
        let elapsedMs: number;
        if (p.you) {
          if (!you) { p.streak = 0; continue; } // you did not answer
          correct = you.correct;
          elapsedMs = you.elapsedMs;
        } else {
          if (rand() < 0.04) { p.streak = 0; continue; } // a missed question
          correct = rand() < clamp(p.skill * (1.15 - difficulty), 0.05, 0.98);
          elapsedMs = Math.round(clamp(p.pace * (correct ? 0.85 : 1.15) * (0.6 + rand() * 0.9), 1800, 21_000));
        }
        answered += 1;
        p.answered += 1;
        p.totalMs += elapsedMs;
        if (correct) {
          const tier = tierFor(elapsedMs);
          p.score += tierPoints(tier);
          p.correct += 1;
          p.streak += 1;
          right += 1;
          if (tier === 'full') { p.fullTierCount += 1; p.roundFull += 1; }
          if (elapsedMs < fastestMs) { fastestMs = elapsedMs; fastest = p; }
        } else {
          p.streak = 0;
        }
        if (roundEnd && p.roundFull === p.roundAsked && p.roundAsked >= 2) p.perfectRound = true;
      }

      const result: DemoQuestionResult = {
        index,
        correctPct: answered ? Math.round((right / answered) * 100) : 0,
        fastest: fastest ? playerRef(fastest) : null,
        fastestMs: fastest ? fastestMs : 0,
      };
      sim.lastResult = result;

      const events: ArenaEvent[] = [envelope('QUESTION_CLOSED', result, now, index)];
      const previous = sim.snapshot;
      const next = build(now);
      const derived = deriveEvents(previous, next, {
        seq,
        round: roundOf(index),
        questionIndex: index,
        questionsRemaining: Math.max(0, totalQuestions - (index + 1)),
        totalQuestions,
        now,
      });
      seq += derived.length;
      next.seq = seq;
      sim.snapshot = next;
      return [...events, ...derived];
    },

    grade(now) {
      if (sim.state !== 'live') return [];
      sim.open = false;
      sim.state = 'grading';
      return [envelope('GRADING', { startedAt: now }, now, sim.index)];
    },

    publish(now) {
      if (sim.state !== 'grading' || !sim.snapshot) return [];
      sim.state = 'provisional';
      const board = sim.snapshot;
      const events: ArenaEvent[] = [];
      const champ = board.schools.filter((s) => s.rank === 1)[0];
      if (champ) {
        const top5 = champ.top5
          .map((uid) => players.find((p) => p.uid === uid))
          .filter(Boolean)
          .map((p) => playerRef(p as DemoPlayer));
        events.push(envelope('CHAMPION_SCHOOL', { school: schoolRef(champ), teamAvg: champ.teamAvg, top5 }, now, -1));
      }
      const podium = board.individuals.filter((i) => i.rank >= 1 && i.rank <= 3).slice(0, 3);
      if (podium.length) events.push(envelope('CHAMPION_INDIVIDUAL', { podium }, now, -1));
      return events;
    },

    finalize() {
      if (sim.state === 'provisional') sim.state = 'final';
    },
  };

  sim.snapshot = build(t0);
  return sim;
}
