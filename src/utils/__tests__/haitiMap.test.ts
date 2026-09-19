/**
 * The Arena map's geometry.
 *
 * What is worth testing about a hand-built map is not whether a coastline is
 * pretty — it is whether the DATA CONTRACT holds: every name the product can
 * produce resolves to something or to an honest nothing, nothing lands off
 * the canvas, nothing lands in the wrong half of the country, and the three
 * answers the stage words differently (placed / unplaced / off-map) never
 * bleed into each other.
 */

import { HAITI_DEPARTMENTS } from '../../data/haitiGeo';
import {
  MAPPED_DEPARTMENTS,
  MAP_HEIGHT,
  MAP_VIEWBOX,
  MAP_WIDTH,
  buildMapLayers,
  communePoint,
  crowdRadius,
  densityStep,
  departmentCentroid,
  departmentOf,
  departmentPath,
  isOffMap,
  layoutSchoolLabels,
  project,
  resolvePlace,
  type MapPlace,
} from '../../data/haitiMapGeometry';

const ALL_COMMUNES: string[] = HAITI_DEPARTMENTS.flatMap((d) => d.cities);
const REAL_DEPARTMENTS: string[] = HAITI_DEPARTMENTS
  .map((d) => d.name)
  .filter((n) => n !== 'Diaspora / Étranger');

const player = (name: string, id: string, extra: Partial<MapPlace> = {}): MapPlace =>
  ({ name, id, kind: 'player', ...extra });
const school = (name: string, id: string, label: string, extra: Partial<MapPlace> = {}): MapPlace =>
  ({ name, id, kind: 'school', label, ...extra });

/** Bounding box of a path, straight off the committed path string. */
function bbox(d: string) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < nums.length; i += 2) {
    xs.push(nums[i]);
    ys.push(nums[i + 1]);
  }
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };
}

describe('the canvas', () => {
  it('declares one viewBox and everything is drawn in it', () => {
    expect(MAP_VIEWBOX).toBe(`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`);
  });

  it('projects longitude east-positive and latitude south-positive', () => {
    const west = project(-74.2, 18.6);
    const east = project(-72.0, 18.6);
    const north = project(-72.5, 19.8);
    const south = project(-72.5, 18.2);
    expect(east.x).toBeGreaterThan(west.x);
    expect(south.y).toBeGreaterThan(north.y);
  });

  it('keeps the north-south scale honest — a degree of latitude is longer than a degree of longitude', () => {
    const lon = project(-73.0, 19.0).x - project(-74.0, 19.0).x;
    const lat = project(-73.0, 19.0).y - project(-73.0, 20.0).y;
    expect(lat).toBeGreaterThan(lon);
    // cos(19.1°) ≈ 0.945, so the ratio is ~1.058 — not an arbitrary stretch.
    expect(lat / lon).toBeCloseTo(1 / 0.944857, 3);
  });
});

describe('the ten départements', () => {
  it('all have geometry', () => {
    expect(MAPPED_DEPARTMENTS).toHaveLength(10);
    for (const name of MAPPED_DEPARTMENTS) {
      const d = departmentPath(name);
      expect(typeof d).toBe('string');
      expect(d!.startsWith('M')).toBe(true);
      expect(d!.endsWith('Z')).toBe(true);
    }
  });

  it('covers exactly the départements haitiGeo names, minus the diaspora bucket', () => {
    expect([...MAPPED_DEPARTMENTS].sort()).toEqual([...REAL_DEPARTMENTS].sort());
  });

  it('draws every départment inside the viewBox', () => {
    for (const name of MAPPED_DEPARTMENTS) {
      const b = bbox(departmentPath(name)!);
      expect(b.minX).toBeGreaterThanOrEqual(0);
      expect(b.minY).toBeGreaterThanOrEqual(0);
      expect(b.maxX).toBeLessThanOrEqual(MAP_WIDTH);
      expect(b.maxY).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });

  it('gives the islands their own rings — Gonâve with Ouest, Tortue with Nord-Ouest, Île-à-Vache with Sud', () => {
    expect((departmentPath('Ouest')!.match(/M/g) || []).length).toBe(2);
    expect((departmentPath('Nord-Ouest')!.match(/M/g) || []).length).toBe(2);
    expect((departmentPath('Sud')!.match(/M/g) || []).length).toBe(2);
    expect((departmentPath('Centre')!.match(/M/g) || []).length).toBe(1);
  });

  it('puts the country the right way round', () => {
    const north = departmentCentroid('Nord')!;
    const south = departmentCentroid('Sud-Est')!;
    const west = departmentCentroid("Grand'Anse")!;
    const east = departmentCentroid('Nord-Est')!;
    expect(north.y).toBeLessThan(south.y);
    expect(west.x).toBeLessThan(east.x);
  });

  it('every département name in HAITI_DEPARTMENTS resolves, except the diaspora which is off-map by design', () => {
    for (const d of HAITI_DEPARTMENTS) {
      if (d.name === 'Diaspora / Étranger') {
        expect(isOffMap(d.name)).toBe(true);
        expect(resolvePlace(d.name)).toBeNull();
        expect(departmentPath(d.name)).toBeNull();
      } else {
        expect(isOffMap(d.name)).toBe(false);
        const at = resolvePlace(d.name)!;
        expect(at).not.toBeNull();
        expect(at.precision).toBe('department');
      }
    }
  });

  it('memoises the path — the same string object comes back', () => {
    expect(departmentPath('Artibonite')).toBe(departmentPath('Artibonite'));
  });
});

describe('the 140 commune seats', () => {
  it('places every commune haitiGeo names', () => {
    const missing = ALL_COMMUNES.filter((c) => communePoint(c) === null);
    expect(missing).toEqual([]);
  });

  it('places all of them inside the viewBox', () => {
    for (const c of ALL_COMMUNES) {
      const p = communePoint(c)!;
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(MAP_WIDTH);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it('places each commune inside its own département, give or take the smoothing', () => {
    // The boundaries are smooth lines through the right corridor, not the real
    // jagged ones, so a seat can sit a few km over a drawn border. Landing
    // outside the département's BOX, though, means the coordinate is simply
    // in the wrong part of the country.
    const slack = 22; // user units ≈ 7 km
    const wrong: string[] = [];
    for (const c of ALL_COMMUNES) {
      const dept = departmentOf(c)!;
      const b = bbox(departmentPath(dept)!);
      const p = communePoint(c)!;
      if (
        p.x < b.minX - slack || p.x > b.maxX + slack
        || p.y < b.minY - slack || p.y > b.maxY + slack
      ) wrong.push(`${c} (${dept})`);
    }
    expect(wrong).toEqual([]);
  });

  it('knows which département each commune belongs to', () => {
    expect(departmentOf('Pétion-Ville')).toBe('Ouest');
    expect(departmentOf('Cap-Haïtien')).toBe('Nord');
    expect(departmentOf('Jérémie')).toBe("Grand'Anse");
    expect(departmentOf('nowhere at all')).toBeNull();
  });

  it('gets the landmarks in the right relation to each other', () => {
    const pap = communePoint('Port-au-Prince')!;
    const cap = communePoint('Cap-Haïtien')!;
    const cayes = communePoint('Les Cayes')!;
    const irois = communePoint('Les Irois')!;
    const ouanaminthe = communePoint('Ouanaminthe')!;
    const jacmel = communePoint('Jacmel')!;

    expect(cap.y).toBeLessThan(pap.y);            // Cap-Haïtien is north
    expect(jacmel.y).toBeGreaterThan(pap.y);      // Jacmel is on the south coast
    expect(cayes.x).toBeLessThan(pap.x);          // Les Cayes is west
    expect(irois.x).toBeLessThan(cayes.x);        // and Les Irois further west still
    expect(ouanaminthe.x).toBeGreaterThan(cap.x); // Ouanaminthe is the eastern border
    expect(irois.x).toBeLessThan(60);             // westernmost point of the country
  });

  it('matches free-typed spellings — accents, case and punctuation', () => {
    const canonical = communePoint('Pétion-Ville');
    expect(communePoint('petion ville')).toEqual(canonical);
    expect(communePoint('PETIONVILLE')).toEqual(canonical);
    expect(communePoint('Port au Prince')).toEqual(communePoint('Port-au-Prince'));
    expect(resolvePlace('port-au-prince')!.name).toBe('Port-au-Prince');
  });
});

describe('resolvePlace', () => {
  it('returns the commune seat when it knows one', () => {
    const at = resolvePlace('Gonaïves')!;
    expect(at.precision).toBe('commune');
    expect(at.department).toBe('Artibonite');
    expect(at).toMatchObject(communePoint('Gonaïves')!);
  });

  it('falls back to the département centroid for a name it can only place that far', () => {
    // A département name is exactly that case: no commune seat, but the data
    // point survives at département precision rather than being dropped.
    expect(communePoint('Nippes')).toBeNull();
    const at = resolvePlace('Nippes')!;
    expect(at.precision).toBe('department');
    expect(at).toMatchObject(departmentCentroid('Nippes')!);
  });

  it('returns null rather than throwing for anything it does not recognise', () => {
    for (const junk of ['', '   ', 'Kingston', 'Boston', '???', '12345', null, undefined]) {
      expect(() => resolvePlace(junk as string)).not.toThrow();
      expect(resolvePlace(junk as string)).toBeNull();
    }
  });

  it('refuses to place the diaspora anywhere', () => {
    expect(resolvePlace('Diaspora / Étranger')).toBeNull();
    expect(resolvePlace('diaspora etranger')).toBeNull();
  });
});

describe('the two layers', () => {
  it('keeps schools named and one-per-mark', () => {
    const layout = buildMapLayers([
      school('Cap-Haïtien', 's1', 'CODOSA'),
      school('Cap-Haïtien', 's2', 'SLDG'),
    ]);
    expect(layout.clusters).toHaveLength(1);
    expect(layout.clusters[0].schools.map((s) => s.label)).toEqual(['CODOSA', 'SLDG']);
    expect(layout.totalSchools).toBe(2);
  });

  it('aggregates a crowd of players into ONE mark per commune', () => {
    const crowd = Array.from({ length: 40 }, (_, i) => player('Delmas', `p${i}`));
    const layout = buildMapLayers(crowd);
    expect(layout.clusters).toHaveLength(1);
    expect(layout.clusters[0].playerCount).toBe(40);
    expect(layout.clusters[0].playerValue).toBe(40);
    expect(layout.totalPlayers).toBe(40);
  });

  it('carries both layers on one commune without merging them', () => {
    const layout = buildMapLayers([
      school('Jacmel', 's1', 'LNJ'),
      ...Array.from({ length: 12 }, (_, i) => player('Jacmel', `p${i}`)),
    ]);
    expect(layout.clusters).toHaveLength(1);
    const c = layout.clusters[0];
    expect(c.schools).toHaveLength(1);
    expect(c.playerCount).toBe(12);
  });

  it('never lets a school inflate the player density', () => {
    const layout = buildMapLayers([
      school('Hinche', 's1', 'ÉSH', { value: 99 }),
      player('Hinche', 'p1'),
    ]);
    expect(layout.byDepartment.Centre).toBe(1);
    expect(layout.totalPlayerValue).toBe(1);
  });

  it('sums player value by département', () => {
    const layout = buildMapLayers([
      player('Delmas', 'p1'), player('Pétion-Ville', 'p2'), player('Kenscoff', 'p3'),
      player('Cap-Haïtien', 'p4'),
    ]);
    expect(layout.byDepartment.Ouest).toBe(3);
    expect(layout.byDepartment.Nord).toBe(1);
  });

  it('flags a département-precision mark as approximate so the map can show it hollow', () => {
    const layout = buildMapLayers([school('Artibonite', 's1', 'GNV')]);
    expect(layout.clusters[0].approximate).toBe(true);
    const exact = buildMapLayers([school('Gonaïves', 's1', 'GNV')]);
    expect(exact.clusters[0].approximate).toBe(false);
  });

  it('orders clusters north to south so the label ladder is stable', () => {
    const layout = buildMapLayers([
      player('Les Cayes', 'p1'), player('Cap-Haïtien', 'p2'), player('Port-au-Prince', 'p3'),
    ]);
    expect(layout.clusters.map((c) => c.name)).toEqual(['Cap-Haïtien', 'Port-au-Prince', 'Les Cayes']);
  });
});

describe('coverage — three answers, never two', () => {
  it('counts what it placed', () => {
    const layout = buildMapLayers([
      school('Gonaïves', 's1', 'GNV'), player('Gonaïves', 'p1'),
    ]);
    expect(layout.coverage.schoolsPlaced).toBe(1);
    expect(layout.coverage.playersPlaced).toBe(1);
    expect(layout.coverage.schoolsUnplaced).toBe(0);
  });

  it('counts a school with no usable location instead of dropping it', () => {
    // The empty commune is the COMMON case — every one of the 94 seeded
    // schools has one — so it has to survive as a number, not vanish.
    const layout = buildMapLayers([
      school('Gonaïves', 's1', 'GNV'),
      school('', 's2', 'NOWHERE'),
      school('Ville Inconnue', 's3', 'HUH'),
    ]);
    expect(layout.totalSchools).toBe(3);
    expect(layout.coverage.schoolsPlaced).toBe(1);
    expect(layout.coverage.schoolsUnplaced).toBe(2);
    // Only the one that gave a name we could not match is worth reporting back.
    expect(layout.coverage.unknownNames).toEqual(['Ville Inconnue']);
    expect(layout.clusters).toHaveLength(1);
  });

  it('counts the whole seed as unplaced rather than showing an empty map as if nobody came', () => {
    const seeded = Array.from({ length: 94 }, (_, i) => school('', `seed${i}`, `S${i}`));
    const layout = buildMapLayers([...seeded, school('Les Cayes', 'live', 'LYCS')]);
    expect(layout.totalSchools).toBe(95);
    expect(layout.coverage.schoolsPlaced).toBe(1);
    expect(layout.coverage.schoolsUnplaced).toBe(94);
    expect(layout.coverage.offMapSchools).toBe(0);
  });

  it('keeps the diaspora OUT of the unplaced count — it is not a data gap', () => {
    const layout = buildMapLayers([
      ...Array.from({ length: 14 }, (_, i) => player('Diaspora / Étranger', `d${i}`)),
      school('Ville Inconnue', 's1', 'HUH'),
    ]);
    expect(layout.coverage.offMapPlayers).toBe(14);
    expect(layout.coverage.offMapValue).toBe(14);
    expect(layout.coverage.playersUnplaced).toBe(0);
    expect(layout.coverage.schoolsUnplaced).toBe(1);
    expect(layout.coverage.offMap).toHaveLength(14);
    expect(layout.coverage.offMap[0]).toEqual({
      name: 'Diaspora / Étranger', kind: 'player', value: 1,
    });
  });

  it('still counts the diaspora as present players — they are on the broadcast', () => {
    const layout = buildMapLayers([
      player('Delmas', 'p1'),
      player('Diaspora / Étranger', 'd1'),
    ]);
    expect(layout.totalPlayers).toBe(2);
    // ...but they are not on the map, and not in anyone's density.
    expect(layout.clusters).toHaveLength(1);
    expect(layout.totalPlayerValue).toBe(1);
  });

  it('survives an empty, missing or malformed places list', () => {
    expect(() => buildMapLayers([])).not.toThrow();
    expect(() => buildMapLayers(null as unknown as MapPlace[])).not.toThrow();
    const layout = buildMapLayers([null as unknown as MapPlace, player('Hinche', 'p1')]);
    expect(layout.totalPlayers).toBe(1);
  });
});

describe('the crowd mark', () => {
  it('grows with the square root of the count, so area reads as weight', () => {
    const r10 = crowdRadius(10) - 2.6;
    const r40 = crowdRadius(40) - 2.6;
    expect(r40 / r10).toBeCloseTo(2, 1);
  });

  it('never grows without bound and never draws a mark for nobody', () => {
    expect(crowdRadius(0)).toBe(0);
    expect(crowdRadius(100000)).toBeLessThanOrEqual(34);
    expect(crowdRadius(5)).toBeGreaterThan(crowdRadius(1));
  });
});

describe('density steps', () => {
  it('reserves step 0 for no data, which is not the same as very few', () => {
    expect(densityStep(0, 100)).toBe(0);
    expect(densityStep(1, 100)).toBe(1);
  });

  it('puts the maximum in the top step and never overflows it', () => {
    expect(densityStep(100, 100)).toBe(5);
    expect(densityStep(140, 100)).toBe(5);
  });

  it('is safe when there is no maximum yet', () => {
    expect(densityStep(3, 0)).toBe(0);
  });
});

describe('school labels', () => {
  const crowded = buildMapLayers([
    school('Delmas', 's1', 'CODOSA'),
    school('Pétion-Ville', 's2', 'SLDG'),
    school('Port-au-Prince', 's3', 'LNJ'),
    school('Tabarre', 's4', 'CSGT'),
  ]);

  it('gives every school a label anchored to its own mark', () => {
    const labels = layoutSchoolLabels(crowded.clusters);
    expect(labels).toHaveLength(4);
    for (const l of labels) {
      expect(l.textY).not.toBe(l.y);
      expect(l.textY).toBeGreaterThan(0);
      expect(l.textY).toBeLessThan(MAP_HEIGHT);
    }
  });

  it('separates names that would otherwise sit on top of each other', () => {
    const labels = layoutSchoolLabels(crowded.clusters);
    const rows = new Set(labels.map((l) => l.textY));
    expect(rows.size).toBe(labels.length);
  });

  it('is deterministic — the same clusters give the same layout', () => {
    expect(layoutSchoolLabels(crowded.clusters)).toEqual(layoutSchoolLabels(crowded.clusters));
  });

  it('flips a label on the eastern edge so it reads inward', () => {
    const east = buildMapLayers([school('Ouanaminthe', 's1', 'OUA')]);
    expect(layoutSchoolLabels(east.clusters)[0].anchor).toBe('end');
    const west = buildMapLayers([school('Jérémie', 's2', 'JER')]);
    expect(layoutSchoolLabels(west.clusters)[0].anchor).toBe('start');
  });

  it('carries the approximate flag through to the label', () => {
    const layout = buildMapLayers([school('Sud', 's1', 'SUD')]);
    expect(layoutSchoolLabels(layout.clusters)[0].approximate).toBe(true);
  });
});

/* ── The component ──────────────────────────────────────────────────────── */

describe('HaitiMap renders', () => {
  // .ts, not .tsx — createElement rather than JSX, which is enough to prove
  // the component mounts, draws the country, and reports its coverage.
  const { createElement: h } = require('react');
  const { render, screen, cleanup } = require('@testing-library/react');
  const HaitiMap = require('../../components/arena/HaitiMap').default;

  afterEach(() => cleanup());

  const places: MapPlace[] = [
    school('Cap-Haïtien', 's1', 'CODOSA', { value: 5 }),
    school('', 's2', 'NOWHERE'),
    ...Array.from({ length: 30 }, (_, i) => player('Delmas', `p${i}`)),
    ...Array.from({ length: 4 }, (_, i) => player('Diaspora / Étranger', `d${i}`)),
  ];

  it('draws all ten départements and the marks on top', () => {
    const { container } = render(h(HaitiMap, { places }));
    expect(container.querySelectorAll('path.hmap__dept')).toHaveLength(10);
    expect(container.querySelectorAll('.hmap__crowd-mark')).toHaveLength(1);
    expect(container.querySelectorAll('.hmap__school-mark')).toHaveLength(1);
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe(MAP_VIEWBOX);
  });

  it('captions the diaspora instead of pinning it', () => {
    const { container } = render(h(HaitiMap, { places }));
    const caption = container.querySelector('.hmap__offmap')!;
    expect(caption.textContent).toContain('+4');
    expect(caption.textContent).toContain("depuis l'étranger");
    // A caption on the map, never a pin: no extra mark was drawn for them.
    expect(container.querySelectorAll('.hmap__crowd-mark')).toHaveLength(1);
    // And it is worded apart from the fixable gap.
    expect(screen.getByText('Sans localisation')).toBeTruthy();
    expect(screen.getByText("Depuis l'étranger")).toBeTruthy();
  });

  it('hands the caller an honest coverage count, diaspora kept separate', () => {
    const seen: unknown[] = [];
    render(h(HaitiMap, { places, onCoverage: (c: unknown) => seen.push(c) }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      schoolsPlaced: 1,
      schoolsUnplaced: 1,
      playersPlaced: 30,
      playersUnplaced: 0,
      offMapPlayers: 4,
      offMapSchools: 0,
    });
  });

  it('shades départements only in density mode, and never with a gradient', () => {
    const plain = render(h(HaitiMap, { places, mode: 'arrivals' }));
    expect(plain.container.querySelectorAll('.hmap__dept--s0')).toHaveLength(10);
    cleanup();
    const dense = render(h(HaitiMap, { places, mode: 'density' }));
    expect(dense.container.querySelectorAll('.hmap__dept--s5').length).toBeGreaterThan(0);
    expect(dense.container.querySelectorAll('linearGradient, radialGradient')).toHaveLength(0);
    expect(dense.container.querySelectorAll('.hmap__legend-step').length).toBe(5);
  });

  it('names one place large in spotlight and recedes the rest', () => {
    const { container } = render(h(HaitiMap, { places, mode: 'spotlight', focus: 's1' }));
    expect(container.querySelector('.hmap__figure-label')!.textContent).toBe('CODOSA');
    expect(container.querySelectorAll('.hmap__crowd .is-receded').length).toBe(1);
  });

  it('survives a focus that matches nothing', () => {
    expect(() => render(h(HaitiMap, { places, mode: 'spotlight', focus: 'ghost' }))).not.toThrow();
  });
});
