/**
 * The finale's arithmetic, asserted.
 *
 * Sequences 13 to 20 cannot be watched: the stage is not on a route yet, and
 * even once it is, the only performance that matters happens once, live, in
 * front of everyone. So the parts that can be wrong — the reveal cadence, the
 * sentence a host reads aloud, which school is picked as "most improved" — are
 * pure functions and are checked here rather than by staring at a screen.
 *
 * The boundaries are where the bugs are, so those are what this file is mostly
 * made of: the instant a reveal step flips, a margin that rounds to zero
 * without being zero, a superlative computed from an empty board.
 */

import {
  CHAMPION_SLOTS,
  PODIUM_SLOTS,
  PODIUM_STEP_MS,
  POSTGAME_CYCLE_MS,
  POSTGAME_STATS_MS,
  REVEAL_STEP_MS,
  TEASER_HOLD_MS,
  accuracyPct,
  avgSeconds,
  championsLine,
  championsTitle,
  climberFrom,
  fastestAccurate,
  halftimeExtras,
  isProvisional,
  marginPhrase,
  marginSentence,
  marginsBetween,
  participationByCommune,
  participationTotals,
  perfectPerformers,
  postGameBeat,
  rankLabel,
  revealCount,
  revealOrder,
  revealState,
  staggerStyle,
  superlatives,
  teaserBeat,
} from '../../broadcast/finaleLogic';
import type {
  ArenaEvent,
  IndividualStanding,
  SchoolStanding,
  StandingsSnapshot,
} from '../../../shared/arena/events';
import type { MapPlace } from '../../broadcast/sceneContract';

const fr = (f: string): string => f;
const t = (f: string, _h: string) => f;
const ht = (_f: string, h: string) => h;

const school = (over: Partial<SchoolStanding> & { key: string }): SchoolStanding => ({
  label: `Collège ${over.key}`,
  shortName: over.key.toUpperCase(),
  teamAvg: 0,
  counted: 5,
  members: 8,
  qualified: true,
  rank: 0,
  top5: [],
  ...over,
});

const player = (over: Partial<IndividualStanding> & { uid: string }): IndividualStanding => ({
  displayName: over.uid,
  schoolKey: 'a',
  schoolShort: 'A',
  score: 0,
  correct: 0,
  avgMs: 0,
  rank: 0,
  ...over,
});

// ── Sequence 17: reveal from 5th up, one per 2.5s ──────────────────────────

describe('revealCount — the champion cadence', () => {
  it('shows the first slot immediately, not after the first step', () => {
    // An empty screen for 2.5 seconds reads as a stalled stream, not suspense.
    expect(revealCount(0, 5)).toBe(1);
    expect(revealCount(1, 5)).toBe(1);
  });

  it('advances exactly on each 2.5s boundary', () => {
    expect(revealCount(REVEAL_STEP_MS - 1, 5)).toBe(1);
    expect(revealCount(REVEAL_STEP_MS, 5)).toBe(2);
    expect(revealCount(2 * REVEAL_STEP_MS, 5)).toBe(3);
    expect(revealCount(3 * REVEAL_STEP_MS, 5)).toBe(4);
    expect(revealCount(4 * REVEAL_STEP_MS, 5)).toBe(5);
  });

  it('lands the champion at 10s and never goes past the last slot', () => {
    expect(revealCount(10_000, 5)).toBe(5);
    expect(revealCount(60_000, 5)).toBe(5);
    expect(revealCount(Number.MAX_SAFE_INTEGER, 5)).toBe(5);
  });

  it('survives a board with fewer than five schools', () => {
    expect(revealCount(0, 2)).toBe(1);
    expect(revealCount(REVEAL_STEP_MS, 2)).toBe(2);
    expect(revealCount(9_999, 2)).toBe(2);
    expect(revealCount(0, 0)).toBe(0);
  });

  it('never returns a negative or NaN count from a junk clock', () => {
    expect(revealCount(-5_000, 5)).toBe(1);
    expect(revealCount(Number.NaN, 5)).toBe(1);
    expect(revealCount(0, Number.NaN)).toBe(0);
  });

  it('uses the podium step when asked — three players over nine seconds', () => {
    expect(revealCount(0, 3, PODIUM_STEP_MS)).toBe(1);
    expect(revealCount(PODIUM_STEP_MS, 3, PODIUM_STEP_MS)).toBe(2);
    expect(revealCount(2 * PODIUM_STEP_MS, 3, PODIUM_STEP_MS)).toBe(3);
    expect(revealCount(2 * PODIUM_STEP_MS - 1, 3, PODIUM_STEP_MS)).toBe(2);
  });
});

describe('revealOrder — worst of the shortlist first', () => {
  const ranked = [1, 2, 3, 4, 5, 6, 7];

  it('takes the top five and reverses them', () => {
    expect(revealOrder(ranked)).toEqual([5, 4, 3, 2, 1]);
    expect(CHAMPION_SLOTS).toBe(5);
  });

  it('does not mutate the board it was handed', () => {
    // `standings.schools` is live state; an in-place reverse here would
    // reorder the leaderboard underneath the scene reading it.
    const input = [1, 2, 3];
    revealOrder(input);
    expect(input).toEqual([1, 2, 3]);
  });

  it('handles a podium of three', () => {
    expect(revealOrder(['a', 'b', 'c'], PODIUM_SLOTS)).toEqual(['c', 'b', 'a']);
    expect(PODIUM_SLOTS).toBe(3);
  });

  it('returns an empty list for an empty board', () => {
    expect(revealOrder([])).toEqual([]);
  });
});

describe('revealState — what is on screen at a given moment', () => {
  const ranked = ['1st', '2nd', '3rd', '4th', '5th'];

  it('opens on 5th and closes on the champion', () => {
    expect(revealState(ranked, 0).current).toBe('5th');
    expect(revealState(ranked, 0).complete).toBe(false);
    expect(revealState(ranked, 4 * REVEAL_STEP_MS).current).toBe('1st');
    expect(revealState(ranked, 4 * REVEAL_STEP_MS).complete).toBe(true);
  });

  it('accumulates the cards already revealed, in reveal order', () => {
    expect(revealState(ranked, 2 * REVEAL_STEP_MS).revealed).toEqual(['5th', '4th', '3rd']);
  });

  it('gives a reduced-motion viewer the whole result at once', () => {
    // The contract: remove the travel and the HOLDS, never the information.
    const state = revealState(ranked, 0, { reduceMotion: true });
    expect(state.current).toBe('1st');
    expect(state.complete).toBe(true);
    expect(state.revealed).toHaveLength(5);
  });

  it('is not complete when there is nothing to reveal', () => {
    const state = revealState([], 999_999);
    expect(state.current).toBeNull();
    expect(state.complete).toBe(false);
  });
});

// ── The margin sentence ────────────────────────────────────────────────────

describe('marginSentence — the line the host reads out', () => {
  it('writes section K\'s own example', () => {
    expect(marginSentence(30, 1, 2, t)).toBe('30 POINTS SÉPARENT #1 ET #2');
  });

  it('agrees the verb in the singular for one point', () => {
    expect(marginSentence(1, 1, 2, t)).toBe('1 POINT SÉPARE #1 ET #2');
    expect(marginSentence(1.4, 2, 3, t)).toBe('1 POINT SÉPARE #2 ET #3');
  });

  it('rounds to the nearest point', () => {
    expect(marginSentence(29.6, 1, 2, t)).toBe('30 POINTS SÉPARENT #1 ET #2');
    expect(marginSentence(2.49, 3, 4, t)).toBe('2 POINTS SÉPARENT #3 ET #4');
  });

  it('says égalité only when the gap is genuinely zero', () => {
    expect(marginSentence(0, 1, 2, t)).toBe('ÉGALITÉ ENTRE #1 ET #2');
  });

  it('never reports a real gap as a tie just because it rounds to nothing', () => {
    // 0.4 points is still an order on the board. Printing "égalité" on a screen
    // a host reads from is a mistake the stream cannot take back.
    expect(marginSentence(0.4, 1, 2, t)).toBe("MOINS D'UN POINT SÉPARE #1 ET #2");
    expect(marginSentence(0.01, 1, 2, t)).not.toContain('ÉGALITÉ');
  });

  it('reads a reversed pair as a distance, not a negative number', () => {
    expect(marginSentence(-12, 2, 1, t)).toBe('12 POINTS SÉPARENT #2 ET #1');
  });

  it('is written in Kreyòl too, with the Kreyòl conjunction', () => {
    expect(marginSentence(30, 1, 2, ht)).toBe('30 PWEN SEPARE #1 AK #2');
    expect(marginSentence(0, 1, 2, ht)).toBe('MENM PWEN ANT #1 AK #2');
    expect(marginSentence(0.3, 1, 2, ht)).toBe('MWENS PASE 1 PWEN SEPARE #1 AK #2');
  });

  it('splits into one figure and its words, so only one thing is display type', () => {
    expect(marginPhrase(30, 1, 2, t)).toEqual({ figure: '30', words: 'POINTS SÉPARENT #1 ET #2' });
  });
});

describe('marginsBetween', () => {
  it('reports each gap to the lane below', () => {
    const top = [
      school({ key: 'a', teamAvg: 120, rank: 1 }),
      school({ key: 'b', teamAvg: 90, rank: 2 }),
      school({ key: 'c', teamAvg: 88.5, rank: 3 }),
    ];
    expect(marginsBetween(top)).toEqual([30, 1.5]);
  });

  it('never produces a negative gap from an out-of-order board', () => {
    const top = [school({ key: 'a', teamAvg: 10 }), school({ key: 'b', teamAvg: 40 })];
    expect(marginsBetween(top)).toEqual([0]);
  });

  it('has no gaps to report for one school or none', () => {
    expect(marginsBetween([school({ key: 'a' })])).toEqual([]);
    expect(marginsBetween([])).toEqual([]);
  });
});

// ── Player figures ─────────────────────────────────────────────────────────

describe('accuracyPct', () => {
  it('is a share of the questions ASKED, not of those answered', () => {
    // A player who skipped ten and got fifteen right did not shoot 100%.
    expect(accuracyPct(player({ uid: 'p', correct: 15 }), 25)).toBe(60);
  });

  it('is omitted rather than guessed when the total is unknown', () => {
    expect(accuracyPct(player({ uid: 'p', correct: 15 }), 0)).toBeNull();
    expect(accuracyPct(null, 25)).toBeNull();
  });
});

describe('avgSeconds', () => {
  it('prints one decimal with a comma, as both languages write it', () => {
    expect(avgSeconds(6_420)).toBe('6,4');
    expect(avgSeconds(0)).toBe('0,0');
  });

  it('clamps a nonsense duration to zero rather than printing it', () => {
    expect(avgSeconds(-500)).toBe('0,0');
    expect(avgSeconds(Number.NaN)).toBe('0,0');
  });
});

describe('fastestAccurate — the superlative that cannot reward guessing', () => {
  const field = [
    player({ uid: 'guesser', correct: 0, avgMs: 900, score: 0 }),
    player({ uid: 'quick', correct: 18, avgMs: 4_200, score: 900 }),
    player({ uid: 'slow', correct: 24, avgMs: 9_000, score: 1_400 }),
  ];

  it('ignores somebody who is fast because they are not trying', () => {
    expect(fastestAccurate(field)?.uid).toBe('quick');
  });

  it('breaks a dead heat on who was right more often', () => {
    const tied = [
      player({ uid: 'a', correct: 10, avgMs: 5_000 }),
      player({ uid: 'b', correct: 19, avgMs: 5_000 }),
    ];
    expect(fastestAccurate(tied)?.uid).toBe('b');
  });

  it('returns null rather than a placeholder on an empty board', () => {
    expect(fastestAccurate([])).toBeNull();
    expect(fastestAccurate([player({ uid: 'x', correct: 4, avgMs: 0 })])).toBeNull();
  });
});

describe('perfectPerformers', () => {
  const field = [
    player({ uid: 'a', perfectRound: true, rank: 4 }),
    player({ uid: 'b', rank: 1 }),
    player({ uid: 'c', perfectRound: true, rank: 2 }),
  ];

  it('names only those the aggregator actually marked, best rank first', () => {
    expect(perfectPerformers(field).map((p) => p.uid)).toEqual(['c', 'a']);
  });

  it('caps the list so a card cannot become a wall of names', () => {
    const many = Array.from({ length: 9 }, (_, i) => player({ uid: `p${i}`, perfectRound: true, rank: i }));
    expect(perfectPerformers(many)).toHaveLength(4);
    expect(perfectPerformers(many, 2)).toHaveLength(2);
  });
});

// ── Participation by commune ───────────────────────────────────────────────

const places: MapPlace[] = [
  { id: 's1', name: 'Jacmel', kind: 'school', label: 'CODOSA' },
  { id: 'p1', name: 'Jacmel', kind: 'player' },
  { id: 'p2', name: 'Jacmel', kind: 'player' },
  { id: 'p3', name: 'Cap-Haïtien', kind: 'player' },
  { id: 's2', name: 'Cap-Haïtien', kind: 'school', label: 'SLDG' },
  { id: 's3', name: 'Les Cayes', kind: 'school', label: 'NDPS' },
  { id: 'x', name: '   ', kind: 'player' },
];

describe('participationByCommune', () => {
  it('counts players and schools separately, never as one presence number', () => {
    // The two answer different questions — where the crowd is, and where the
    // institutions are — and conflating them is how a school gets pinned to a
    // town it has never been in.
    expect(participationByCommune(places)).toEqual([
      { name: 'Jacmel', players: 2, schools: 1 },
      { name: 'Cap-Haïtien', players: 1, schools: 1 },
      { name: 'Les Cayes', players: 0, schools: 1 },
    ]);
  });

  it('drops a place with no usable name instead of printing a blank row', () => {
    expect(participationByCommune(places).some((c) => !c.name.trim())).toBe(false);
  });

  it('totals the board', () => {
    expect(participationTotals(places)).toEqual({ players: 3, schools: 3, communes: 3 });
    expect(participationTotals([])).toEqual({ players: 0, schools: 0, communes: 0 });
  });
});

// ── Sequence 19: the superlatives board ────────────────────────────────────

const snapshot = (over: Partial<StandingsSnapshot> = {}): StandingsSnapshot => ({
  seq: 1,
  computedAt: 0,
  schools: [],
  individuals: [],
  ...over,
});

describe('superlatives — selected from the standings, never invented', () => {
  const current = snapshot({
    schools: [
      school({ key: 'a', rank: 1, teamAvg: 120 }),
      school({ key: 'b', rank: 2, teamAvg: 110 }),
      school({ key: 'c', rank: 3, teamAvg: 90 }),
    ],
    individuals: [
      player({ uid: 'p1', schoolKey: 'a', schoolShort: 'A', correct: 20, avgMs: 5_000, perfectRound: true, rank: 1 }),
      player({ uid: 'p2', schoolKey: 'a', schoolShort: 'A', correct: 18, avgMs: 3_100, perfectRound: true, rank: 2 }),
      player({ uid: 'p3', schoolKey: 'c', schoolShort: 'C', correct: 17, avgMs: 7_000, perfectRound: true, rank: 3 }),
      player({ uid: 'p4', schoolKey: 'b', schoolShort: 'B', correct: 12, avgMs: 6_000, rank: 4 }),
    ],
  });

  const before = snapshot({
    schools: [
      school({ key: 'c', rank: 1 }),
      school({ key: 'a', rank: 2 }),
      school({ key: 'b', rank: 5 }),
    ],
  });

  it('picks the school that climbed furthest, not the one that ended highest', () => {
    const out = superlatives(current, places, before);
    expect(out.mostImproved?.school.key).toBe('b');
    expect(out.mostImproved).toMatchObject({ from: 5, to: 2, gained: 3 });
  });

  it('omits most-improved entirely when there is nothing to compare against', () => {
    // The stage keeps one snapshot. Inventing a climb from it would be a made-up
    // statistic on a screen whose only claim is that it says true things.
    expect(superlatives(current, places).mostImproved).toBeNull();
    expect(superlatives(current, places, snapshot()).mostImproved).toBeNull();
  });

  it('does not treat a school newly entering the ranking as a climber', () => {
    const newcomer = snapshot({ schools: [school({ key: 'a', rank: 3 })] });
    const unranked = snapshot({ schools: [school({ key: 'a', rank: 0 })] });
    expect(superlatives(newcomer, [], unranked).mostImproved).toBeNull();
  });

  it('picks the fastest accurate player as the fastest average', () => {
    expect(superlatives(current, places).fastest?.uid).toBe('p2');
  });

  it('counts perfect rounds by school and picks the deepest bench', () => {
    expect(superlatives(current, places).mostPerfect).toEqual({ key: 'a', shortName: 'A', count: 2 });
  });

  it('returns nulls and empty lists rather than throwing on no standings at all', () => {
    const empty = superlatives(null, []);
    expect(empty.mostImproved).toBeNull();
    expect(empty.fastest).toBeNull();
    expect(empty.mostPerfect).toBeNull();
    expect(empty.communes).toEqual([]);
    expect(empty.totals.communes).toBe(0);
  });

  it('carries participation by commune, which is what the map draws', () => {
    expect(superlatives(current, places).communes[0]).toEqual({ name: 'Jacmel', players: 2, schools: 1 });
  });
});

describe('halftimeExtras', () => {
  it('gathers exactly the cards halftime can support', () => {
    const extras = halftimeExtras(
      snapshot({
        individuals: [
          player({ uid: 'a', correct: 9, avgMs: 4_000, perfectRound: true, rank: 1 }),
          player({ uid: 'b', correct: 9, avgMs: 2_500, rank: 2 }),
        ],
      }),
      places,
    );
    expect(extras.fastest?.uid).toBe('b');
    expect(extras.perfect.map((p) => p.uid)).toEqual(['a']);
    expect(extras.totals.communes).toBe(3);
  });

  it('is empty rather than absent when the board has not arrived', () => {
    expect(halftimeExtras(null, [])).toEqual({
      fastest: null,
      perfect: [],
      totals: { players: 0, schools: 0, communes: 0 },
    });
  });
});

describe('climberFrom', () => {
  const event = (type: string): ArenaEvent => ({
    type,
    payload: { school: { key: 'a', label: 'A', shortName: 'A' }, gained: 3, from: 6, to: 3, causedBy: [] },
    seq: 1,
    priority: 6,
    createdAt: 0,
    round: 1,
    questionIndex: 1,
    ttlMs: 10_000,
  } as unknown as ArenaEvent);

  it('reads a climber the emitter composed into the scene', () => {
    expect(climberFrom([event('HALFTIME'), event('BIGGEST_CLIMBER')])?.from).toBe(6);
  });

  it('returns null rather than a fabricated climb when none was composed', () => {
    expect(climberFrom([event('HALFTIME')])).toBeNull();
    expect(climberFrom(undefined)).toBeNull();
    expect(climberFrom([])).toBeNull();
  });
});

// ── Sequences 19 → 20: the post-game clock ─────────────────────────────────

describe('postGameBeat', () => {
  it('holds the superlatives for thirty seconds', () => {
    expect(postGameBeat(0).phase).toBe('stats');
    expect(postGameBeat(29_999).phase).toBe('stats');
    expect(postGameBeat(POSTGAME_STATS_MS).phase).toBe('teaser');
  });

  it('runs the teaser for eight, then starts over', () => {
    expect(postGameBeat(37_999).phase).toBe('teaser');
    expect(postGameBeat(POSTGAME_CYCLE_MS).phase).toBe('stats');
    expect(postGameBeat(POSTGAME_CYCLE_MS).phaseElapsed).toBe(0);
  });

  it('loops rather than going blank, however long the screen stays up', () => {
    // A stage in a school hall an hour later must still be showing the result.
    expect(postGameBeat(POSTGAME_CYCLE_MS * 40 + 5_000).phase).toBe('stats');
    expect(postGameBeat(POSTGAME_CYCLE_MS * 40 + 33_000).phase).toBe('teaser');
  });

  it('reports how far into the current phase it is', () => {
    expect(postGameBeat(POSTGAME_STATS_MS + 4_000).phaseElapsed).toBe(4_000);
  });

  it('treats a junk clock as the start', () => {
    expect(postGameBeat(-1).phase).toBe('stats');
    expect(postGameBeat(Number.NaN).phaseElapsed).toBe(0);
  });
});

describe('teaserBeat', () => {
  it('holds the champions line before the challenge lands', () => {
    expect(teaserBeat(0)).toBe('champions');
    expect(teaserBeat(TEASER_HOLD_MS - 1)).toBe('champions');
    expect(teaserBeat(TEASER_HOLD_MS)).toBe('challenge');
    expect(teaserBeat(7_999)).toBe('challenge');
  });
});

describe('championsLine', () => {
  const september = new Date(2026, 8, 18, 20, 30).getTime();

  it('writes section K\'s own line', () => {
    expect(championsLine('CODOSA', september, t)).toBe('CODOSA — CHAMPIONS DE SEPTEMBRE');
  });

  it('has a real Kreyòl month rather than a French one under Kreyòl copy', () => {
    expect(championsLine('CODOSA', september, ht)).toBe('CODOSA — CHANPYON SEPTANM');
    expect(championsTitle(new Date(2026, 6, 1).getTime(), ht)).toBe('CHANPYON JIYÈ');
  });

  it('uppercases a short name that arrived in mixed case', () => {
    expect(championsLine('Codosa', september, t)).toContain('CODOSA');
  });

  it('is the name plus the title, so a frame can set them separately', () => {
    expect(championsLine('CODOSA', september, t)).toBe(`CODOSA — ${championsTitle(september, t)}`);
  });
});

describe('rankLabel', () => {
  it('calls first place what the room calls it', () => {
    expect(rankLabel(1, t)).toBe('CHAMPION');
    expect(rankLabel(1, ht)).toBe('CHANPYON');
  });

  it('numbers the rest in both languages', () => {
    expect(rankLabel(2, t)).toBe('2E PLACE');
    expect(rankLabel(3, ht)).toBe('3YÈM PLAS');
    expect(rankLabel(5, t)).toBe('5E PLACE');
  });
});

// ── The provisional line ───────────────────────────────────────────────────

describe('isProvisional — the announcement section M depends on', () => {
  it('treats every state before final as provisional', () => {
    for (const state of ['draft', 'registration', 'doors', 'live', 'grading', 'provisional']) {
      expect(isProvisional(state)).toBe(true);
    }
  });

  it('is provisional when the state is missing, never confirmed by default', () => {
    // The champion frames are the ones that get screenshotted. Defaulting the
    // other way would put "confirmed" on a podium nobody has verified.
    expect(isProvisional(undefined)).toBe(true);
    expect(isProvisional(null)).toBe(true);
    expect(isProvisional('')).toBe(true);
  });

  it('clears only at final, which is the state that releases prize money', () => {
    expect(isProvisional('final')).toBe(false);
  });
});

// ── The staggered entrance ─────────────────────────────────────────────────

describe('staggerStyle', () => {
  it('spaces cards 55ms apart at the shared 320ms enter', () => {
    expect(staggerStyle(0, false).animation).toBe('stage-enter 320ms cubic-bezier(0.16, 1, 0.3, 1) 0ms both');
    expect(staggerStyle(3, false).animation).toContain('165ms both');
  });

  it('declares the travel distance so the keyframe cannot drift from the constant', () => {
    expect((staggerStyle(1, false) as Record<string, string>)['--stage-travel']).toBe('14px');
  });

  it('removes the motion entirely for a viewer who asked for less', () => {
    expect(staggerStyle(4, true)).toEqual({ animation: 'none' });
  });
});

// A guard so the helpers above cannot quietly stop being used.
describe('translation helpers', () => {
  it('pick the side they claim to', () => {
    expect(fr('x')).toBe('x');
    expect(t('a', 'b')).toBe('a');
    expect(ht('a', 'b')).toBe('b');
  });
});
