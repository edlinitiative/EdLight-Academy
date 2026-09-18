import React from 'react';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { SchoolOvertakePayload } from '../../../shared/arena/events';
import MovementLanes, { CauseLine, rankedSchools, type LaneRow } from './MovementLanes';
import { composedClause, laneWindow, overtakeTravel } from './movement';
import './movement.css';

/**
 * Sequence 7 — one lane passes others.
 *
 * **No full takeover.** An overtake is something that happens TO the board, so
 * the board stays and the camera does not move: the lane lifts, travels past
 * the lanes it passed — which shift down in the same motion, because the
 * simultaneity is what makes it an overtake rather than two slides — a ray
 * sweep runs along it, and a `+2` chip lands. Then everything is simply where
 * it now is.
 *
 * The lanes are rendered in the order the standings have ALREADY settled into
 * and given the offset they have to start from; the keyframe carries them home.
 * A board that animated from the old order to the new would be showing a lie
 * for 640ms, and would contradict itself if the scene were cut mid-travel.
 *
 * Lanes are drawn here rather than by importing `Board`: the board is the
 * resting state and belongs to itself, and a scene that reached into it would
 * make the two impossible to change independently.
 */

/** As much board as reads at wall scale, widened when the climb needs it. */
const LANES = 8;

export default function SchoolOvertake({ scene, data, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<SchoolOvertakePayload>(scene, 'SCHOOL_OVERTAKE');
  const schools = rankedSchools(data.standings);

  const from = payload?.from ?? 0;
  const to = payload?.to ?? 0;
  const gained = from > to ? from - to : 0;

  const window = laneWindow(schools.length, [from, to], LANES);
  const visible = schools.filter((s) => s.rank >= window.start && s.rank <= window.end);
  const travel = overtakeTravel(from, to, visible.map((s) => s.rank), 1);

  const rows: LaneRow[] = visible.map((school, i) => {
    const move = travel[i];
    const isMover = move?.role === 'mover';
    return {
      key: school.key,
      rank: school.rank,
      shortName: school.shortName || school.label,
      label: school.label,
      teamAvg: school.teamAvg,
      travel: move?.offset ?? 0,
      // The ray sweep marks a GAIN. Only the lane that gained gets one.
      gain: isMover,
      focus: isMover,
      chip: isMover && gained > 0 ? <span className="mv-chip">+{gained}</span> : undefined,
    };
  });

  const passed = payload?.passed ?? [];

  return (
    <div className={`mv-scene${reduceMotion ? ' mv-still' : ''}`}>
      {rows.length > 0
        ? <MovementLanes rows={rows} />
        : (
          // No board to move — say the move in words rather than show nothing.
          <div className="mv-head">
            <span className="stage-scene__overline">{t('DÉPASSEMENT', 'DEPASE')}</span>
            <span className="mv-name mv-short">{payload?.school.shortName}</span>
            {gained > 0 ? <span className="mv-chip">+{gained}</span> : null}
          </div>
        )}

      <div className="stage-scene__cause">
        <CauseLine
          scene={scene}
          t={t}
          extra={[
            passed.length > 0
              ? t(
                `devant ${passed.map((s) => s.shortName).join(', ')}`,
                `devan ${passed.map((s) => s.shortName).join(', ')}`,
              )
              : null,
            composedClause(scene, t),
          ].filter(Boolean).join(' · ') || null}
        />
      </div>
    </div>
  );
}
