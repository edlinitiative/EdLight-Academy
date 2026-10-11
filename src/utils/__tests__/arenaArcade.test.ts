import { buildSchool } from '../schoolBuilding';
import {
  STORY_CHAPTERS, isUnlocked, recordStage, nextStage, starsFor, totalStars, parseProgress, MAX_STARS,
} from '../../../shared/arenaStory';
import { TRIVIA_QUESTIONS } from '../../data/triviaData';

describe('schoolBuilding', () => {
  it('draws the same building for the same name, whatever the case/spacing', () => {
    expect(buildSchool('Lycée Pétion')).toEqual(buildSchool('  lycée pétion '));
  });

  it('draws different buildings for different schools', () => {
    const a = JSON.stringify(buildSchool('Lycée Pétion').rects);
    const b = JSON.stringify(buildSchool('Collège Saint-Pierre').rects);
    expect(a).not.toEqual(b);
  });

  it('keeps every rect inside its own canvas, at any floor count', () => {
    for (const name of ['A', 'Lycée Toussaint Louverture', 'Institution Saint-Louis de Gonzague', 'x'.repeat(80)]) {
      for (const floors of [1, 3, 8, 50, -2]) {
        const b = buildSchool(name, { floors, night: true });
        expect(b.floors).toBeGreaterThanOrEqual(1);
        expect(b.floors).toBeLessThanOrEqual(8);
        for (const r of b.rects) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(b.width);
          expect(r.y + r.h).toBeLessThanOrEqual(b.height);
        }
      }
    }
  });

  it('more floors make a taller building (the skyline reads as a score)', () => {
    expect(buildSchool('Lycée', { floors: 6 }).height).toBeGreaterThan(buildSchool('Lycée', { floors: 2 }).height);
  });
});

describe('Mode Histoire', () => {
  it('has ten départements, each with 3 stages and a boss whose themes all exist', () => {
    expect(STORY_CHAPTERS).toHaveLength(10);
    const banks = TRIVIA_QUESTIONS as Record<string, any[]>;
    for (const ch of STORY_CHAPTERS) {
      expect(ch.stages).toHaveLength(3);
      for (const st of [...ch.stages, ch.bossStage]) {
        expect(st.pass).toBeLessThanOrEqual(st.count);
        const pool = st.themes.reduce((n, t) => {
          expect(banks[t]).toBeDefined();
          return n + banks[t].length;
        }, 0);
        expect(pool).toBeGreaterThanOrEqual(st.count);
      }
    }
    expect(new Set(STORY_CHAPTERS.map((c) => c.id)).size).toBe(10);
  });

  it('opens one stage at a time, and the next chapter only after the boss', () => {
    let p = {};
    expect(isUnlocked(p, 0, 0)).toBe(true);
    expect(isUnlocked(p, 0, 1)).toBe(false);
    expect(isUnlocked(p, 1, 0)).toBe(false);
    for (let s = 0; s < 3; s += 1) p = recordStage(p, 0, s, 1);
    expect(isUnlocked(p, 1, 0)).toBe(false);
    expect(nextStage(p)).toEqual({ chapter: 0, stage: 3 });
    p = recordStage(p, 0, 3, 2);
    expect(isUnlocked(p, 1, 0)).toBe(true);
    expect(nextStage(p)).toEqual({ chapter: 1, stage: 0 });
  });

  it('refuses to record a locked stage and never lowers stars on replay', () => {
    const locked = recordStage({}, 3, 2, 3);
    expect(totalStars(locked)).toBe(0);
    let p = recordStage({}, 0, 0, 3);
    p = recordStage(p, 0, 0, 1);
    expect(totalStars(p)).toBe(3);
  });

  it('a failed stage earns no stars; a perfect one earns three', () => {
    const st = STORY_CHAPTERS[0].stages[0];
    expect(starsFor(st.pass - 1, st)).toBe(0);
    expect(starsFor(st.pass, st)).toBe(1);
    expect(starsFor(st.count, st)).toBe(3);
  });

  it('parses junk storage into an empty campaign, and clamps bad star values', () => {
    expect(parseProgress(null)).toEqual({});
    expect(parseProgress('x')).toEqual({});
    expect(parseProgress({ ouest: [9, -1, 'a'] })).toEqual({ ouest: [3, 0, 0, 0] });
    expect(MAX_STARS).toBe(120);
  });
});
