/**
 * The logic the phone's Arène shares with the web /arena (shared/): the city
 * layout, the pixel buildings and their merged paint layers, the story draw,
 * the Haiti outlines — plus the phone's cabinet table, checked against the
 * screens the navigator actually registers.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildSchool, paintLayers, type Rect } from '../../../../shared/arena/schoolBuilding';
import { cityLineup, farSkyline, floorsFor, towerTag } from '../../../../shared/arena/arcadeCity';
import { splitPodium } from '../../../../shared/arena/podium';
import { pickRival } from '../../../../shared/arena/rival';
import { rankTeams, type TeamStanding } from '../../../../shared/leaderboardAgg';
import {
  STORY_CHAPTERS, chapterGoStage, chapterRow, recordStage, stageOf, storyDraw,
} from '../../../../shared/arenaStory';
import { MAPPED_DEPARTMENTS, departmentCentroid, departmentPath } from '../../../../shared/geo/haitiDepartments';
import { TRIVIA_QUESTIONS } from '../../data/triviaData';
import { cabinetAction, cabinetCopy, GRID_CABINETS, type CabinetKey } from '../../components/arena/arcadeCabinets';

/** Paint rects onto a grid in order — the reference picture. */
function raster(width: number, height: number, rects: readonly Rect[]): string[] {
  const g = Array.from({ length: width * height }, () => '');
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) g[y * width + x] = r.c;
  return g;
}
/** Paint merged layers back into rects (each path segment is one rect). */
function layersToRects(layers: ReturnType<typeof paintLayers>): Rect[] {
  const out: Rect[] = [];
  for (const l of layers) {
    for (const m of l.d.matchAll(/M(-?\d+) (-?\d+)h(-?\d+)v(-?\d+)h-?\d+Z/g)) {
      out.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], c: l.c });
    }
  }
  return out;
}

const team = (key: string, teamXp: number, members = 5, rank = 0): TeamStanding => ({
  key, label: key.toUpperCase(), teamXp, counted: Math.min(5, members), members,
  qualified: members >= 5, needed: Math.max(0, 5 - members), rank,
});

describe('paintLayers — fewer native nodes, the identical picture', () => {
  it.each(['Lycée Pétion', 'Collège Saint-Pierre', 'Institution Saint-Louis de Gonzague', 'A', 'École Nationale de Jacmel'])(
    '%s paints pixel-for-pixel the same, day and night, at every height',
    (name) => {
      for (const night of [false, true]) {
        for (const floors of [1, 2, 4, 6, 8]) {
          const b = buildSchool(name, { floors, night });
          const layers = paintLayers(b.rects);
          expect(raster(b.width, b.height, layersToRects(layers))).toEqual(raster(b.width, b.height, b.rects));
          expect(layers.length).toBeLessThan(b.rects.length);
        }
      }
    },
  );

  it('keeps paint order when a colour reappears on top', () => {
    const rects: Rect[] = [
      { x: 0, y: 0, w: 4, h: 4, c: 'a' },
      { x: 1, y: 1, w: 2, h: 2, c: 'b' },
      { x: 1, y: 1, w: 1, h: 1, c: 'a' }, // over b → must be its own top layer
    ];
    const layers = paintLayers(rects);
    expect(layers.map((l) => l.c)).toEqual(['a', 'b', 'a']);
    expect(raster(4, 4, layersToRects(layers))).toEqual(raster(4, 4, rects));
  });
});

describe('the city street', () => {
  it('floors grow with team XP, 2 to 6', () => {
    expect(floorsFor(0, 0)).toBe(2);
    expect(floorsFor(0, 100)).toBe(2);
    expect(floorsFor(100, 100)).toBe(6);
    expect(floorsFor(50, 100)).toBe(4);
    expect(floorsFor(500, 100)).toBe(6);
  });

  it('puts the tallest in the middle and always brings the student’s school', () => {
    const standings = Array.from({ length: 9 }, (_, i) => team(`s${i}`, 1000 - i * 100, 5, i + 1));
    const mine = team('mine', 10, 2);
    const line = cityLineup(standings, mine);
    expect(line).toHaveLength(8);
    expect(line.some((s) => s.key === 'mine')).toBe(true);
    const top = line.reduce((a, b) => (b.teamXp > a.teamXp ? b : a));
    const mid = line.indexOf(top);
    expect(Math.abs(mid - (line.length - 1) / 2)).toBeLessThanOrEqual(1);
    expect(top.floors).toBe(6);
    expect(cityLineup(standings, standings[0])).toHaveLength(7);
    expect(cityLineup([], null)).toEqual([]);
  });

  it('tags a rank only for a qualified school', () => {
    expect(towerTag(team('a', 1, 5, 3), 5)).toBe('#3');
    expect(towerTag(team('b', 1, 3), 5)).toBe('3/5');
    expect(towerTag(team('c', 1, 9, 0), 5)).toBe('5/5');
  });

  it('draws the same far skyline every time', () => {
    expect(farSkyline()).toEqual(farSkyline());
    const blocks = farSkyline();
    expect(blocks[blocks.length - 1].x).toBeGreaterThan(1500);
  });

  it('the podium never numbers a school still forming its five', () => {
    const board = splitPodium(rankTeams([
      { key: 'a', label: 'A', members: 5, topMembers: [{ uid: '1', xp: 10 }] } as any,
      { key: 'b', label: 'B', members: 2, topMembers: [{ uid: '2', xp: 99 }] } as any,
    ]));
    expect(board.ranked.map((s) => s.key)).toEqual(['a']);
    expect(board.podium).toEqual([]);
    expect(board.forming.map((s) => s.key)).toEqual(['b']);
  });

  it('the rival is someone real who is ahead, never invented', () => {
    const entries = [
      { id: 'x', rank: 1, xp: 300, displayName: 'X', school: 'Other' },
      { id: 'y', rank: 2, xp: 200, displayName: 'Y', school: 'Mine' },
      { id: 'me', rank: 3, xp: 150, displayName: 'Me', school: 'Mine' },
    ];
    expect(pickRival({ entries, uid: 'me', myXp: 150, myRank: 3, school: 'Mine', pageSize: 50 }))
      .toMatchObject({ status: 'rival', scope: 'school', gap: 50, entry: { id: 'y' } });
    expect(pickRival({ entries, uid: null, myXp: 0, myRank: null, school: null, pageSize: 50 })).toEqual({ status: 'unknown' });
  });
});

describe('Mode Histoire on the phone banks', () => {
  const banks = TRIVIA_QUESTIONS as Record<string, any[]>;

  it('every stage theme exists in the phone’s trivia banks', () => {
    for (const ch of STORY_CHAPTERS) for (const st of [...ch.stages, ch.bossStage]) for (const th of st.themes) expect(banks[th]?.length).toBeGreaterThan(0);
  });

  it('storyDraw spreads a round over its themes, with no repeats', () => {
    let seed = 3;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const boss = STORY_CHAPTERS[9].bossStage;
    const picks = storyDraw(boss, banks, rand);
    expect(picks).toHaveLength(boss.count);
    expect(new Set(picks.map((p) => `${p.theme}:${p.idx}`)).size).toBe(boss.count);
    for (const th of boss.themes) expect(picks.some((p) => p.theme === th)).toBe(true);
    for (const p of picks) expect(banks[p.theme][p.idx]).toBeDefined();
  });

  it('a theme the banks do not have shortens the round instead of padding it', () => {
    expect(storyDraw({ themes: ['nope'], count: 6, timed: true, pass: 4 }, banks)).toEqual([]);
  });

  it('the big button plays the first open stage without stars', () => {
    let p = {};
    expect(chapterGoStage(p, 0)).toBe(0);
    p = recordStage(p, 0, 0, 2);
    expect(chapterGoStage(p, 0)).toBe(1);
    expect(chapterRow(p, 0)).toEqual([2, 0, 0, 0]);
    expect(chapterGoStage(p, 1)).toBeNull(); // chapter 2 still locked
    expect(stageOf(0, 3)).toBe(STORY_CHAPTERS[0].bossStage);
    expect(stageOf(99, 0)).toBeNull();
  });

  it('every chapter has an outline and a pin on the shared Haiti map', () => {
    expect(MAPPED_DEPARTMENTS).toHaveLength(10);
    for (const ch of STORY_CHAPTERS) {
      expect(departmentPath(ch.dept)).toMatch(/^M/);
      expect(departmentCentroid(ch.dept)).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    }
  });
});

describe('the cabinets', () => {
  const nav = fs.readFileSync(path.join(__dirname, '../../navigation/AppNavigator.tsx'), 'utf8');
  const screens = new Set(Array.from(nav.matchAll(/name="([A-Za-z]+)"/g), (m) => m[1]));
  const tour = (state: string) => ({ id: 'oct-2026', state, startsAt: 0, doorsAt: 0 }) as any;

  it('every navigate target is a registered screen', () => {
    const keys: CabinetKey[] = [...GRID_CABINETS, 'champ', 'activity'];
    const primaries: any[] = [
      { kind: 'none' },
      { kind: 'open', tournament: tour('registration') },
      { kind: 'rejoin', tournament: tour('doors') },
      { kind: 'rejoin', tournament: tour('live') },
      { kind: 'results', tournament: tour('provisional') },
      { kind: 'watch', tournament: tour('live') },
    ];
    for (const k of keys) {
      for (const p of primaries) {
        const a = cabinetAction(k, p);
        if (a.kind === 'navigate') expect(screens).toContain(a.screen);
      }
    }
  });

  it('routes each cabinet where the web routes it', () => {
    expect(cabinetAction('story', null)).toEqual({ kind: 'navigate', screen: 'ArenaStory' });
    expect(cabinetAction('room', null)).toEqual({ kind: 'navigate', screen: 'Tournois' });
    expect(cabinetAction('board', null)).toEqual({ kind: 'navigate', screen: 'Leaderboard' });
    expect(cabinetAction('duel', null)).toEqual({ kind: 'duel' });
    expect(cabinetAction('quick', null)).toEqual({ kind: 'navigate', screen: 'ArenaQuick' });
    expect(cabinetAction('mini', null)).toEqual({ kind: 'mini' });
    expect(cabinetAction('activity', null)).toEqual({ kind: 'navigate', screen: 'CompetitionWorkspace', params: { kind: 'home' } });
    expect(cabinetAction('champ', { kind: 'none' })).toEqual({ kind: 'navigate', screen: 'ArenaHub', params: { section: 'championnat' } });
    expect(cabinetAction('champ', { kind: 'rejoin', tournament: tour('live') })).toEqual({ kind: 'navigate', screen: 'ArenaLive', params: { tournamentId: 'oct-2026' } });
    expect(cabinetAction('champ', { kind: 'rejoin', tournament: tour('doors') })).toEqual({ kind: 'navigate', screen: 'ArenaDoors', params: { tournamentId: 'oct-2026' } });
    expect(cabinetAction('champ', { kind: 'open', tournament: tour('registration') })).toEqual({ kind: 'navigate', screen: 'ArenaLobby', params: { tournamentId: 'oct-2026' } });
  });

  it('every cabinet speaks French and Kreyòl, and never uses gold', () => {
    const fr = (f: string) => f;
    const ht = (_f: string, h: string) => h;
    for (const k of [...GRID_CABINETS, 'champ', 'activity'] as CabinetKey[]) {
      const a = cabinetCopy(k, fr, { storyNextDept: 'Ouest' });
      const b = cabinetCopy(k, ht, { storyNextDept: 'Ouest' });
      expect(a.title).toBeTruthy();
      expect(b.title).toBeTruthy();
      expect(a.sub).not.toEqual('');
      expect(a.accent.toUpperCase()).not.toBe('#FFC24A');
    }
  });
});
