import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { payloadOf, STAGGER_MS } from '../sceneContract';
import type { PerfectRoundPayload } from '../../../shared/arena/events';
import './movement.css';

/**
 * Sequence 10 — a round answered without a mistake.
 *
 * Full-bleed, and the only scene in this folder where the headline is a PHRASE
 * rather than a name or a number: "SANS FAUTE" is what the room says out loud,
 * and it is what a clip of this moment needs to carry on its own.
 *
 * The round's questions are shown as filled marks — the evidence, in the mark's
 * own square-ended geometry, filling one after another so the eye counts them.
 * Behind it, the ray burst at LOW intensity: this is a perfect round, not the
 * championship, and the stage has to keep somewhere to go.
 */

/**
 * The round is five questions. It is not in the payload — `PERFECT_ROUND`
 * carries only who and which round — so it is stated here as the format's own
 * constant rather than guessed from a count the scene cannot see.
 */
const ROUND_QUESTIONS = 5;

export default function PerfectRound({ scene, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<PerfectRoundPayload>(scene, 'PERFECT_ROUND');
  const round = payload?.roundIndex ?? 0;

  return (
    <SceneFrame
      className={`mv-scene${reduceMotion ? ' mv-still' : ''}`}
      reduceMotion={reduceMotion}
      tone="coral"
      overline={round > 0 ? t(`TOUR ${round}`, `TOU ${round}`) : t('TOUR PARFAIT', 'TOU PAFÈ')}
      figure={t('SANS FAUTE', 'SAN FOT')}
      support={(
        <>
          <span className="mv-name">{payload?.player.displayName}</span>
          {' · '}
          <span className="mv-short">{payload?.school.shortName || payload?.player.schoolShort}</span>
        </>
      )}
    >
      <span className="mv-burst" aria-hidden="true" />
      <div className="mv-marks" aria-hidden="true">
        {Array.from({ length: ROUND_QUESTIONS }, (_, i) => (
          <span
            key={i}
            className="mv-mark"
            style={reduceMotion ? undefined : { animationDelay: `${260 + i * STAGGER_MS}ms` }}
          />
        ))}
      </div>
    </SceneFrame>
  );
}
