import React, { useRef } from 'react';
import type { SceneProps } from '../sceneContract';
import { ambientFact, rankMovement, schoolHue } from '../rhythm';
import type { SchoolStanding } from '../../../shared/arena/events';
import './roundRhythm.css';

/**
 * The resting state — the board, and the thing every other scene returns to.
 *
 * The director treats this as home rather than as a scene among scenes, which
 * is the architectural difference between a broadcast and a notification feed:
 * something always has the screen, and what it returns to is the standings
 * already settled into their new order. A takeover that hands back to a board
 * mid-animation reads as a glitch; a takeover that hands back to a board which
 * has ALREADY absorbed the change reads as the change having happened.
 *
 * That is why this component has no idea which takeover just ended. It renders
 * whatever `data.standings` currently says, and because the standings document
 * has already been updated by the time the takeover finishes, the board is
 * correct the instant it returns — with no replay, no catch-up and no second
 * animation of a movement the room has already been shown.
 *
 * Three things live here and nowhere else:
 *
 *  1. **The lanes.** Hairlines, not cards, at a FIXED height — because the
 *     travel below is measured in whole lanes.
 *  2. **The travel.** When the order changes while the board is on screen, the
 *     rows that moved travel from where they were. A row never teleports,
 *     because the travel is the information.
 *  3. **The ambient callout.** When the director says the board has rested too
 *     long, it says something TRUE rather than sitting still.
 */

/** Eight lanes is what fits at 1080p with the names still readable from a wall. */
const BOARD_LANES = 8;

export default function Board({ data, scene, reduceMotion, t }: SceneProps) {
  const standings = data.standings;

  // Only schools that can actually compete are in the race. An unqualified
  // school carries `rank: 0`, and putting it in a ranked list would tell the
  // room it is losing when it has not started.
  const racing: SchoolStanding[] = (standings?.schools ?? [])
    .filter((s) => s && s.rank > 0)
    .slice()
    .sort((a, b) => a.rank - b.rank);

  const lanes = racing.slice(0, BOARD_LANES);
  const waiting = (standings?.schools ?? []).length - racing.length;

  // ── The travel ────────────────────────────────────────────────────────────
  //
  // Derived during render from a ref rather than in an effect, and this is
  // load-bearing. An effect runs AFTER paint: the board would paint once in the
  // settled order, then jump back to the old offset and travel — a teleport
  // followed by an animation, which is exactly the thing the travel exists to
  // prevent. Computed here, the first paint already carries the offset.
  //
  // Only refs are mutated, and a repeated render at the same `seq` is a no-op,
  // so a double-invoked render in StrictMode produces the same result.
  const orderRef = useRef<{ seq: number; keys: string[] }>({ seq: -1, keys: [] });
  const movesRef = useRef<Map<string, number>>(new Map());
  const seq = standings?.seq ?? -1;
  if (seq !== orderRef.current.seq) {
    const keys = lanes.map((s) => s.key);
    movesRef.current = rankMovement(orderRef.current.keys, keys);
    orderRef.current = { seq, keys };
  }
  const moves = reduceMotion ? null : movesRef.current;

  const fact = scene.needsAmbient ? ambientFact(standings) : null;

  if (lanes.length === 0) {
    return (
      <div className="rb-board">
        <p className="rb-board__empty">{t('En attente des écoles…', 'N ap tann lekòl yo…')}</p>
      </div>
    );
  }

  return (
    <div className="rb-board">
      <ol className="rb-board__lanes" aria-label={t('Classement des écoles', 'Klasman lekòl yo')}>
        {lanes.map((school, i) => {
          const rows = moves?.get(school.key) ?? 0;
          return (
            <li
              // Keyed by the standings seq as well as the school, so a lane that
              // moved remounts and its travel plays. Keyed by school alone, React
              // would reconcile the row in place and the animation — the whole
              // point of the update — would never restart.
              key={`${school.key}:${seq}`}
              className={`rb-lane${school.rank === 1 ? ' rb-lane--leader' : ''}`}
              data-moved={rows > 0 ? 'up' : rows < 0 ? 'down' : undefined}
              style={{
                ['--rb-rows' as string]: String(rows),
                ['--rb-hue' as string]: String(schoolHue(school.key)),
                ['--rb-index' as string]: String(i),
              }}
            >
              <span className="rb-lane__edge" aria-hidden="true" />
              <span className="rb-lane__rank">{school.rank}</span>
              <span className="rb-lane__id">
                <span className="rb-lane__short">{school.shortName || school.label}</span>
                <span className="rb-lane__full">{school.label}</span>
              </span>
              <span className="rb-lane__score">{Math.round(school.teamAvg ?? 0)}</span>
            </li>
          );
        })}
      </ol>

      {waiting > 0 ? (
        <p className="rb-board__note">
          {t(
            `${waiting} école${waiting > 1 ? 's' : ''} pas encore qualifiée${waiting > 1 ? 's' : ''}`,
            `${waiting} lekòl poko kalifye`,
          )}
        </p>
      ) : null}

      {fact ? <AmbientLine fact={fact} t={t} /> : null}
    </div>
  );
}

/**
 * What a resting board says when it has been resting too long.
 *
 * Every branch is a fact already in the standings. There is deliberately no
 * "else" that invents something: when nothing true is available the caller
 * renders nothing, and a board that simply sits there is far better than a
 * board that has learned to fill silence.
 */
function AmbientLine({
  fact,
  t,
}: {
  fact: NonNullable<ReturnType<typeof ambientFact>>;
  t: (fr: string, ht: string) => string;
}) {
  if (fact.kind === 'race') {
    const { ahead, behind, gap } = fact.race;
    return (
      <div className="rb-ambient">
        <span className="rb-ambient__label">{t('Course la plus serrée', 'Kous ki pi sere')}</span>
        <span className="rb-ambient__text">
          <span className="rb-ambient__figure">{Math.round(gap)}</span>
          {' '}
          {t('points séparent', 'pwen separe')}
          {' '}
          {ahead.shortName || ahead.label}
          {' '}
          {t('et', 'ak')}
          {' '}
          {behind.shortName || behind.label}
        </span>
      </div>
    );
  }

  const { player } = fact;
  return (
    <div className="rb-ambient">
      <span className="rb-ambient__label">{t('Série en cours', 'Seri k ap kontinye')}</span>
      <span className="rb-ambient__text">
        {player.displayName}
        {player.schoolShort ? ` · ${player.schoolShort}` : ''}
        {' — '}
        <span className="rb-ambient__figure">{player.streak}</span>
        {' '}
        {t('bonnes réponses de suite', 'bon repons youn dèyè lòt')}
      </span>
    </div>
  );
}
