import { createDemo, DEMO_SCHOOLS } from '../../../shared/arena/demo';
import { createDirector } from '../../../shared/arena/director';
import type { ArenaEvent } from '../../../shared/arena/events';

function playNight(seed: number, you?: string) {
  const sim = createDemo({ seed, youSchool: you, now: 0 });
  const events: ArenaEvent[] = [];
  let now = 1000;
  for (let i = 0; i <= 10; i += 1) sim.arrive(i / 10, now += 1000);
  events.push(...sim.start(now += 1000));
  for (let q = 0; q < sim.totalQuestions; q += 1) {
    events.push(...sim.openNext(now += 1000));
    events.push(...sim.close(now += 15000, you ? { correct: q % 2 === 0, elapsedMs: 6000 } : null));
  }
  events.push(...sim.grade(now += 1000));
  events.push(...sim.publish(now += 8000));
  sim.finalize();
  return { sim, events };
}

describe('demo championship', () => {
  it('uses ten fictional schools, none of them sharing a key', () => {
    expect(DEMO_SCHOOLS).toHaveLength(10);
    expect(new Set(DEMO_SCHOOLS.map((s) => s.key)).size).toBe(10);
    DEMO_SCHOOLS.forEach((s) => expect(s.key.startsWith('demo-')).toBe(true));
  });

  it('runs a whole night through the real pipeline, gapless and in order', () => {
    const { sim, events } = playNight(7);
    expect(sim.state).toBe('final');
    const seqs = events.map((e) => e.seq);
    seqs.forEach((s, i) => { if (i) expect(s).toBe(seqs[i - 1] + 1); });
    const types = new Set(events.map((e) => e.type));
    for (const t of ['TOURNAMENT_OPEN', 'ROUND_START', 'QUESTION_CLOSED', 'HALFTIME', 'FINAL_FIVE', 'FINAL_QUESTION', 'GRADING', 'CHAMPION_SCHOOL', 'CHAMPION_INDIVIDUAL']) {
      expect(types.has(t as any)).toBe(true);
    }
    // The board actually moved: at least one derived movement event happened.
    expect(events.some((e) => ['LEAD_CHANGE', 'SCHOOL_OVERTAKE', 'BIGGEST_CLIMBER', 'COMEBACK', 'PLAYER_ENTERS_TOP5'].includes(e.type))).toBe(true);
  });

  it('crowns the school ranked first on the final board', () => {
    const { sim, events } = playNight(11);
    const champ = events.find((e) => e.type === 'CHAMPION_SCHOOL') as any;
    const first = sim.snapshot!.schools.find((s) => s.rank === 1)!;
    expect(champ.payload.school.key).toBe(first.key);
  });

  it('is replayable from its seed', () => {
    const a = playNight(3).events.map((e) => [e.type, e.seq]);
    const b = playNight(3).events.map((e) => [e.type, e.seq]);
    expect(a).toEqual(b);
  });

  it('counts the visitor\'s own answers for the school they picked', () => {
    const { sim } = playNight(5, 'demo-lac');
    const you = sim.players.find((p) => p.you)!;
    expect(you.answered).toBe(sim.totalQuestions);
    expect(you.correct).toBe(Math.ceil(sim.totalQuestions / 2));
    expect(sim.snapshot!.individuals.some((i) => i.uid === 'demo-you')).toBe(true);
  });

  it('feeds the production director without it choking', () => {
    const { events } = playNight(9);
    const director = createDirector();
    let now = 0;
    director.push(events.map((e) => ({ ...e, createdAt: 0 })));
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i += 1) kinds.add(director.tick(now += 500).kind);
    expect(kinds.size).toBeGreaterThan(2);
  });
});
