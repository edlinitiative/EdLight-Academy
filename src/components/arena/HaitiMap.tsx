/*
 * The Arena's map of Haiti.
 *
 * A broadcast scene, not a data-viz widget. It carries TWO layers at once and
 * they are deliberately different objects:
 *
 *   SCHOOLS are the named actors. A hard square mark, a leader hairline, and
 *   the short name set in bold — the thing a viewer's eye lands on and the
 *   thing they cheer for. Schools are never merged into a count.
 *
 *   PLAYERS are the crowd. One disc per commune whose AREA grows with the
 *   number of students there, because forty students in Delmas have to read
 *   as weight rather than as forty identical dots stacked on one pixel. The
 *   count is set beside the disc in tabular mono once it is worth reading.
 *   Square versus disc means the two layers stay apart even when a school and
 *   a hundred players share one commune.
 *
 * Two facts about the real data shape the whole component:
 *
 *   1. Most schools have no location. All 94 seeded schools carry an empty
 *      commune; only schools a student typed in have one, and even then it is
 *      optional. So a large share of kind:'school' resolves to nothing. This
 *      component renders what it can place, COUNTS what it cannot, and hands
 *      that count back (onCoverage, and a line in the readout). It never
 *      guesses a position, and neither should the stage.
 *
 *      There are three answers here, not two. Placed. Unplaced — a data gap
 *      an admin closes by typing a commune. And OFF-MAP — the diaspora, who
 *      picked 'Diaspora / Étranger' because they are watching from Boston.
 *      Off-map is not missing data and is never counted as though it were:
 *      it gets a caption on the map ("+ 14 depuis l'étranger"), because the
 *      diaspora is the growth story and a player who disappears from the
 *      stage for living abroad is a bug.
 *
 *   2. A player's position is the student's own ville from their leaderboard
 *      profile. That is where the STUDENT is. It is not where their school
 *      is — students board and travel across communes — and nothing here
 *      treats one as a stand-in for the other.
 *
 * Motion follows the stage grammar in the design doc: enter 320ms on
 * cubic-bezier(0.16,1,0.3,1) with 14px of travel, exit 180ms, transform and
 * opacity only, no gradients, no glass, no particles, no neon, and coral spent
 * on one thing only — what is live right now. One number is the biggest thing
 * on screen, never two.
 */

import { useEffect, useMemo, useRef } from 'react';
import {
  MAPPED_DEPARTMENTS,
  MAP_VIEWBOX,
  MAP_WIDTH,
  buildMapLayers,
  crowdRadius,
  densityBounds,
  densityStep,
  departmentPath,
  layoutSchoolLabels,
  type MapCluster,
  type MapCoverage,
  type MapPlace,
  type PlaceKind,
} from '../../data/haitiMapGeometry';
import './HaitiMap.css';

export type { MapPlace, PlaceKind };

export interface HaitiMapProps {
  places: MapPlace[];
  /** 'arrivals' — dots appear as they come in, pre-show
   *  'density' — departments shaded by summed value, post-game
   *  'spotlight' — one place named huge, the rest receding */
  mode?: 'arrivals' | 'density' | 'spotlight';
  /** the place the spotlight is on — a MapPlace.id or a place name */
  focus?: string | null;
  className?: string;
  /**
   * Additive to the agreed contract: how many places could not be placed.
   * Fired whenever the counts change so the stage can say "12 écoles ·
   * 3 sans localisation" instead of silently losing three schools.
   */
  onCoverage?: (coverage: MapCoverage) => void;
}

/** Below this the disc alone says it; above it the figure earns its ink. */
const COUNT_THRESHOLD = 5;

const nf = new Intl.NumberFormat('fr-FR');

let uid = 0;

export default function HaitiMap({
  places,
  mode = 'arrivals',
  focus = null,
  className = '',
  onCoverage,
}: HaitiMapProps) {
  const titleId = useRef(`hmap-title-${(uid += 1)}`).current;

  // First paint stages the whole board in; everything after it is a single
  // thing arriving, which must not restage the board behind it.
  const firstPaint = useRef(true);
  useEffect(() => {
    firstPaint.current = false;
  }, []);

  const layout = useMemo(() => buildMapLayers(places), [places]);
  const labels = useMemo(() => layoutSchoolLabels(layout.clusters), [layout]);

  const maxDepartment = useMemo(
    () => Object.values(layout.byDepartment).reduce((m, v) => Math.max(m, v), 0),
    [layout],
  );

  const focused = useMemo(() => findFocus(layout.clusters, focus), [layout, focus]);

  const { coverage } = layout;
  const coverageKey = [
    coverage.schoolsPlaced, coverage.schoolsUnplaced,
    coverage.playersPlaced, coverage.playersUnplaced,
    coverage.offMapSchools, coverage.offMapPlayers,
  ].join('/');
  useEffect(() => {
    if (onCoverage) onCoverage(coverage);
    // coverageKey is the value identity of `coverage`; firing on the object
    // identity would re-fire on every poll that changed nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverageKey]);

  const showLabel = (schoolId: string, clusterKey: string) => {
    if (mode === 'spotlight') return !!focused && focused.cluster.key === clusterKey;
    if (mode === 'density') return labels.some((l) => l.id === schoolId && l.active);
    return true;
  };

  const staged = firstPaint.current;

  const headline = readout(mode, layout, focused);

  return (
    <figure className={`hmap hmap--${mode} ${className}`.trim()}>
      <div className="hmap__stage">
        <svg
          className="hmap__svg"
          viewBox={MAP_VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>{describe(layout, mode, focused)}</title>

          {/* Land. In density each département carries one of five flat
              steps; everywhere else it is bare land at step 0. */}
          <g className="hmap__land">
            {MAPPED_DEPARTMENTS.map((name) => {
              const d = departmentPath(name);
              if (!d) return null;
              const step = mode === 'density'
                ? densityStep(layout.byDepartment[name] || 0, maxDepartment)
                : 0;
              const dim = mode === 'spotlight' && focused && focused.cluster.department !== name;
              return (
                <path
                  key={name}
                  d={d}
                  className={`hmap__dept hmap__dept--s${step}${dim ? ' is-receded' : ''}`}
                />
              );
            })}
          </g>

          {/* The crowd. One disc per commune, area ∝ students there. */}
          <g className="hmap__crowd">
            {layout.clusters.map((c, i) => {
              if (!c.playerCount) return null;
              const r = crowdRadius(c.playerCount);
              const dim = mode === 'spotlight' && (!focused || focused.cluster.key !== c.key);
              return (
                <g
                  key={c.key}
                  className={`hmap__enter${dim ? ' is-receded' : ''}`}
                  style={enterStyle(staged, i)}
                >
                  <g
                    className={`hmap__crowd-mark${c.approximate ? ' is-approx' : ''}${c.active ? ' is-active' : ''}`}
                    style={{ transformOrigin: `${c.x}px ${c.y}px`, ['--hmap-scale' as string]: String(r / 10) }}
                  >
                    <circle cx={c.x} cy={c.y} r={10} vectorEffect="non-scaling-stroke" />
                  </g>
                  {c.playerCount >= COUNT_THRESHOLD && (() => {
                    // Ouanaminthe sits 20 units from the eastern edge; its
                    // count would hang off the canvas. Flip it inboard.
                    const flip = c.x + r + 40 > MAP_WIDTH;
                    return (
                      <text
                        className="hmap__crowd-count"
                        x={flip ? c.x - r - 7 : c.x + r + 7}
                        y={c.y}
                        textAnchor={flip ? 'end' : 'start'}
                        dominantBaseline="central"
                      >
                        {nf.format(c.playerCount)}
                      </text>
                    );
                  })()}
                </g>
              );
            })}
          </g>

          {/* The named actors. */}
          <g className="hmap__schools">
            {labels.map((l, i) => {
              const dim = mode === 'spotlight' && (!focused || focused.cluster.key !== l.clusterKey);
              const withLabel = showLabel(l.id, l.clusterKey);
              const up = l.textY < l.y;
              return (
                <g
                  key={l.id}
                  className={`hmap__school${l.active ? ' is-active' : ''}${dim ? ' is-receded' : ''}${l.approximate ? ' is-approx' : ''}`}
                  style={enterStyle(staged, i)}
                >
                  {withLabel && (
                    <>
                      <path
                        className="hmap__stem"
                        d={`M${l.x} ${up ? l.y - 6 : l.y + 6}L${l.x} ${l.textY + (up ? 5 : -5)}L${l.textX} ${l.textY + (up ? 5 : -5)}`}
                        vectorEffect="non-scaling-stroke"
                      />
                      <text
                        className="hmap__school-label"
                        x={l.textX + (l.anchor === 'end' ? -4 : 4)}
                        y={l.textY}
                        textAnchor={l.anchor}
                      >
                        {l.label}
                      </text>
                    </>
                  )}
                  <rect className="hmap__school-mark" x={l.x - 5} y={l.y - 5} width={10} height={10} vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
          </g>
        </svg>

        {/* The diaspora, kept on the broadcast without inventing a coordinate
            for it. A caption, never a pin. */}
        {offMapCount(coverage) > 0 && (
          <p className="hmap__offmap">
            <span className="hmap__offmap-figure">+{nf.format(offMapCount(coverage))}</span>
            <span>depuis l&apos;étranger</span>
          </p>
        )}
      </div>

      <figcaption className="hmap__readout">
        <div className="hmap__figure">
          <span className="hmap__figure-value">{headline.value}</span>
          <span className="hmap__figure-label">{headline.label}</span>
        </div>

        <dl className="hmap__facts">
          {headline.facts.map((f) => (
            <div className="hmap__fact" key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>

        {mode === 'density' && maxDepartment > 0 && (
          <div className="hmap__legend" aria-label="Échelle de participation">
            {densityBounds(maxDepartment).map((bound, i) => (
              <span className="hmap__legend-step" key={bound + ':' + i}>
                <i className={`hmap__swatch hmap__dept--s${i + 1}`} aria-hidden="true" />
                <b>{nf.format(bound)}</b>
              </span>
            ))}
          </div>
        )}

        {/* The roster is the phone fallback for the labels the map drops, and
            it is what a screen reader gets in every mode. */}
        <ul className="hmap__roster">
          {labels.map((l) => (
            <li key={l.id} className={l.active ? 'is-active' : undefined}>
              {l.label}
              {l.approximate ? ' · position approximative' : ''}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/* ── helpers ────────────────────────────────────────────────────────────── */

interface Focused {
  cluster: MapCluster;
  name: string;
  value: number;
}

function findFocus(clusters: MapCluster[], focus: string | null): Focused | null {
  if (!focus) return null;
  for (const c of clusters) {
    const school = c.schools.find((s) => s.id === focus || s.label === focus);
    if (school) {
      return { cluster: c, name: school.label, value: school.value || c.playerCount };
    }
  }
  const byName = clusters.find((c) => c.name === focus);
  if (byName) return { cluster: byName, name: byName.name, value: byName.playerCount };
  return null;
}

/**
 * The staged entrance only runs on the board's first paint. A school arriving
 * at 19:58 gets its own 320ms; it must not restage the twelve already there.
 */
function enterStyle(staged: boolean, index: number): React.CSSProperties {
  if (!staged) return undefined;
  return { animationDelay: `${Math.min(index, 22) * 38}ms` };
}

interface Readout {
  value: string;
  label: string;
  facts: Array<{ label: string; value: string }>;
}

function readout(
  mode: 'arrivals' | 'density' | 'spotlight',
  layout: ReturnType<typeof buildMapLayers>,
  focused: Focused | null,
): Readout {
  const { coverage } = layout;
  const unplaced = coverage.schoolsUnplaced + coverage.playersUnplaced;

  const facts: Array<{ label: string; value: string }> = [
    { label: 'Écoles', value: nf.format(layout.totalSchools) },
    { label: 'Communes', value: nf.format(layout.clusters.length) },
  ];
  if (unplaced > 0) {
    // A gap somebody can close: nobody typed the commune in.
    facts.push({ label: 'Sans localisation', value: nf.format(unplaced) });
  }
  if (offMapCount(coverage) > 0) {
    // Not a gap. Correct, permanent, and a different sentence entirely.
    facts.push({ label: "Depuis l'étranger", value: nf.format(offMapCount(coverage)) });
  }

  if (mode === 'spotlight' && focused) {
    return {
      value: nf.format(focused.value),
      label: focused.name,
      facts: [
        { label: 'Commune', value: focused.cluster.name },
        { label: 'Département', value: focused.cluster.department || '—' },
        { label: 'Joueurs ici', value: nf.format(focused.cluster.playerCount) },
      ],
    };
  }

  if (mode === 'density') {
    return {
      value: nf.format(layout.totalPlayerValue),
      label: 'Participation',
      facts,
    };
  }

  return { value: nf.format(layout.totalPlayers), label: 'Joueurs', facts };
}

function offMapCount(coverage: MapCoverage): number {
  return coverage.offMapSchools + coverage.offMapPlayers;
}

function describe(
  layout: ReturnType<typeof buildMapLayers>,
  mode: string,
  focused: Focused | null,
): string {
  if (mode === 'spotlight' && focused) {
    return `Carte d'Haïti — ${focused.name}, ${focused.cluster.name}.`;
  }
  const { coverage } = layout;
  const missing = coverage.schoolsUnplaced + coverage.playersUnplaced;
  const abroad = offMapCount(coverage);
  const tail = (missing > 0 ? ` ${missing} sans localisation.` : '')
    + (abroad > 0 ? ` ${abroad} depuis l'étranger.` : '');
  return `Carte d'Haïti — ${layout.totalPlayers} joueurs et ${layout.totalSchools} écoles sur ${layout.clusters.length} communes.${tail}`;
}
