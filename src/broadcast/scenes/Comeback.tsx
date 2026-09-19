import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { ComebackPayload } from '../../../shared/arena/events';
import { CauseLine } from './MovementLanes';
import { composedClause, polylinePoints, rankPath, rankPathPoints, type RankStep } from './movement';
import './movement.css';

/**
 * Sequence 11 — the climb back.
 *
 * **The one place in the whole broadcast where a chart earns its place**,
 * because here the shape IS the story: a school that was 12th and is now 3rd
 * has a line, and no arrangement of two numbers says what that line says in a
 * second and a half.
 *
 * Every point on it happened. `ComebackPayload` carries only the worst rank and
 * the current one, which on its own would be a straight line — a decoration.
 * The intermediate points come from the events the DIRECTOR composed into this
 * scene: each `SCHOOL_OVERTAKE` and `BIGGEST_CLIMBER` about the same school
 * carries a real `from` and `to`. Nothing is interpolated to make the curve
 * prettier, and a step that falls outside the climb is dropped rather than
 * drawn.
 *
 * The line draws itself with a transform wipe rather than a dashed-stroke
 * animation: one composited rect instead of a path repainted every frame for
 * forty-five minutes of projector time.
 */

const W = 960;
const H = 200;

type ComposedEvents = SceneProps['scene']['composed'];

/** The real rank steps this scene was handed, in the order they happened. */
function stepsOf(events: ComposedEvents): RankStep[] {
  const steps: RankStep[] = [];
  for (const event of events || []) {
    if (!event) continue;
    if (event.type === 'SCHOOL_OVERTAKE' || event.type === 'BIGGEST_CLIMBER') {
      const payload = event.payload as { from?: number; to?: number };
      if (typeof payload?.from === 'number' && typeof payload?.to === 'number') {
        steps.push({ from: payload.from, to: payload.to });
      }
    }
  }
  return steps;
}

export default function Comeback({ scene, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<ComebackPayload>(scene, 'COMEBACK');
  const wasRank = payload?.wasRank ?? 0;
  const nowRank = payload?.nowRank ?? 0;

  const ranks = rankPath(wasRank, nowRank, stepsOf(scene.composed));
  const points = rankPathPoints(ranks, W, H);
  const last = points[points.length - 1];

  return (
    <SceneFrame
      className={`mv-scene${reduceMotion ? ' mv-still' : ''}`}
      reduceMotion={reduceMotion}
      overline={t('REMONTÉE', 'REMONTE')}
      figure={<span className="mv-num">#{nowRank || '—'}</span>}
      support={(
        <>
          <span className="mv-short mv-name">{payload?.school.shortName || payload?.school.label}</span>
          {wasRank > 0
            ? <> · {t(`depuis la ${wasRank}e place`, `depi ${wasRank}yèm plas`)}</>
            : null}
        </>
      )}
      cause={<CauseLine scene={scene} t={t} extra={composedClause(scene, t)} />}
    >
      {points.length > 1 ? (
        <svg
          className="mv-chart"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={t(
            `De la ${wasRank}e à la ${nowRank}e place`,
            `Soti ${wasRank}yèm rive ${nowRank}yèm plas`,
          )}
        >
          {/* The two hairlines the climb ran between: best reached, and worst. */}
          <line className="mv-chart__rule" x1="0" y1="1" x2={W} y2="1" vectorEffect="non-scaling-stroke" />
          <line className="mv-chart__rule" x1="0" y1={H - 1} x2={W} y2={H - 1} vectorEffect="non-scaling-stroke" />

          <polyline
            className="mv-chart__line"
            points={polylinePoints(points)}
            vectorEffect="non-scaling-stroke"
          />

          {points.map((point, i) => (
            <rect
              key={`${point.x}-${point.y}-${i}`}
              className={`mv-chart__node${point === last ? ' mv-chart__node--now' : ''}`}
              x={point.x - 5}
              y={point.y - 5}
              width="10"
              height="10"
            />
          ))}

          <rect className="mv-chart__wipe" x="-6" y="-20" width={W + 12} height={H + 40} />
        </svg>
      ) : null}
    </SceneFrame>
  );
}
