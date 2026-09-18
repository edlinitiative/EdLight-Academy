import React from 'react';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { TiePayload } from '../../../shared/arena/events';
import MovementLanes, { rankedSchools, type LaneRow } from './MovementLanes';
import { laneWindow, tieMarginAt } from './movement';
import './movement.css';

/**
 * Sequence 12 — too close to call.
 *
 * Two lanes isolated and everything else dimmed to a trace. The dimming is the
 * scene: a tie is not a fact about two schools, it is a fact about the DISTANCE
 * between them, and that distance is only visible once the rest of the board
 * stops competing for the eye.
 *
 * So the margin is set between the two lanes, which is where the gap physically
 * is, and it counts DOWN onto the true figure while the two hairlines converge
 * on it — they start apart and settle where the standings actually put them, so
 * the frame the scene holds on is the true one.
 *
 * The rest of the board is dimmed, never removed. A stage that deleted the
 * other schools to make a point would be editing the standings.
 */

const LANES = 6;
const COUNT = { delayMs: 260, durationMs: 1500 };
/** How far apart the two lanes start, in lane heights. Small on purpose. */
const CONVERGE = 0.34;

export default function Tie({ scene, data, elapsed, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<TiePayload>(scene, 'TIE');
  const pair = payload?.schools ?? null;
  const keys = pair ? [pair[0]?.key, pair[1]?.key] : [];

  const schools = rankedSchools(data.standings);
  const tiedRanks = schools.filter((s) => keys.includes(s.key)).map((s) => s.rank);
  const window = laneWindow(schools.length, tiedRanks, LANES);
  const visible = schools.filter((s) => s.rank >= window.start && s.rank <= window.end);

  const upper = tiedRanks.length > 0 ? Math.min(...tiedRanks) : 0;
  const lower = tiedRanks.length > 0 ? Math.max(...tiedRanks) : 0;

  const rows: LaneRow[] = visible.map((school) => {
    const tied = keys.includes(school.key);
    return {
      key: school.key,
      rank: school.rank,
      shortName: school.shortName || school.label,
      label: school.label,
      teamAvg: school.teamAvg,
      focus: tied,
      dim: !tied,
      // The two start apart and close on each other as they settle.
      travel: tied && upper !== lower
        ? (school.rank === upper ? -CONVERGE : CONVERGE)
        : undefined,
    };
  });

  const margin = tieMarginAt(payload?.margin ?? 0, elapsed, COUNT, reduceMotion);
  const upperKey = visible.find((s) => s.rank === upper)?.key;

  const gap = (
    <li className="mv-gap" key="mv-gap">
      <span className="mv-gap__figure mv-num">{margin.toFixed(2)}</span>
      <span className="mv-gap__label">{t('% D’ÉCART', '% DIFERANS')}</span>
    </li>
  );

  return (
    <div className={`mv-scene${reduceMotion ? ' mv-still' : ''}`}>
      <div className="mv-head">
        <span className="stage-scene__overline">{t('ÉGALITÉ EN TÊTE', 'EGALITE NAN TÈT LA')}</span>
        {pair
          ? (
            <span className="mv-card__line">
              <span className="mv-short mv-name">{pair[0]?.shortName}</span>
              {' — '}
              <span className="mv-short mv-name">{pair[1]?.shortName}</span>
            </span>
          )
          : null}
      </div>

      {rows.length > 0
        ? <MovementLanes rows={rows} interposeAfter={upperKey} interpose={gap} />
        : (
          <div className="mv-gap">
            <span className="mv-gap__figure mv-num">{margin.toFixed(2)}</span>
            <span className="mv-gap__label">{t('% D’ÉCART', '% DIFERANS')}</span>
          </div>
        )}
    </div>
  );
}
