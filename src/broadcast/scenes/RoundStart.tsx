import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { RoundStartPayload } from '../../../shared/arena/events';
import { isOpeningQuestion, questionNumber } from '../rhythm';
import Board from './Board';
import './roundRhythm.css';

/**
 * Sequences 3 and 4 — the start, and every question transition after it.
 *
 * One event type, two sequences, and the split is the point. The first
 * `ROUND_START` of the night is the only one the room has not seen the shape of:
 * the rays accelerate once and settle, the board wipes in from the left rule,
 * and "QUESTION 1 / 25" lands. 1.6 seconds, because the match has not begun and
 * there is nothing to interrupt.
 *
 * Every `ROUND_START` after it is a transition, not an opening. It gets 900ms:
 * the board dims to 40% rather than leaving, the index rolls, the category word
 * crosses the screen and leaves, and the board comes back. Playing the opening
 * twenty-five times would make the start of the match indistinguishable from
 * its middle, and by question six the room would have stopped reading it.
 *
 * The board is rendered INSIDE both, dimmed rather than replaced. A transition
 * that swapped the board out for a title card would lose the standings for a
 * second at exactly the moment the audience is looking for their school.
 */
export default function RoundStart({ scene, data, elapsed, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<RoundStartPayload>(scene, 'ROUND_START');
  const index = payload?.index ?? data.tournament?.currentIndex ?? 0;
  const total = payload?.total ?? data.tournament?.questionCount ?? 0;
  const category = (payload?.category ?? '').trim();
  const { shown, total: outOf } = questionNumber(index, total);

  const opening = isOpeningQuestion(index);
  const boardProps = { scene, data, elapsed, reduceMotion, t };

  if (opening) {
    return (
      // The rays accelerate once and settle — the only time in the broadcast
      // they change speed, because the match starting is the only thing that
      // earns it. `.rr-scene--accelerate` is a marker, not an element: the
      // page's OWN ray field (`.live__rays`) is what actually moves — see
      // roundRhythm.css's `:has()` hook — so nothing here paints a second
      // ray field on top of it. Held for exactly 1.6s, outside reduced
      // motion; the class never appears when `reduceMotion` is true, which
      // is what keeps the page's field in its resting rotation for a viewer
      // who asked for less.
      <div className={reduceMotion ? 'rr-scene' : 'rr-scene rr-scene--accelerate'}>
        <SceneFrame
          reduceMotion={reduceMotion}
          overline={t('Question', 'Kesyon')}
          figure={(
            <span className="rr-figure">
              <span>{shown}</span>
              {outOf > 0 ? <span className="rr-figure__of">/ {outOf}</span> : null}
            </span>
          )}
          support={category ? <span className="rr-category">{category}</span> : null}
        />

        {/* The wipe: every lane arrives from the left rule, staggered, so the
            board assembles in one pass instead of appearing all at once. */}
        <div className={reduceMotion ? undefined : 'rb-board--wipe'}>
          <Board {...boardProps} />
        </div>
      </div>
    );
  }

  return (
    <div className="rr-scene">
      <SceneFrame
        reduceMotion={reduceMotion}
        overline={t('Question', 'Kesyon')}
        figure={(
          <span className="rr-figure">
            <IndexRoll shown={shown} reduceMotion={reduceMotion} />
            {outOf > 0 ? <span className="rr-figure__of">/ {outOf}</span> : null}
          </span>
        )}
      />

      {/* The category crosses and leaves. It never parks: a word that stopped
          here would be a second headline arguing with the index. */}
      {category ? (
        <div className="rr-cross" aria-live="off">{category}</div>
      ) : null}

      <div className={reduceMotion ? undefined : 'rb-board--dim'}>
        <Board {...boardProps} />
      </div>
    </div>
  );
}

/**
 * The counter roll.
 *
 * The number leaving travels up out of a clipped window while the number
 * arriving takes its place — one transform, no cross-fade, because a cross-fade
 * of two figures is a moment where the screen shows neither.
 *
 * The outgoing number is `shown - 1` rather than something remembered from the
 * last scene: this component mounts fresh for every `ROUND_START`, and a
 * remembered value would be wrong the first time a reconnecting stage joins
 * mid-match.
 */
function IndexRoll({ shown, reduceMotion }: { shown: number; reduceMotion: boolean }) {
  if (reduceMotion || shown <= 1) return <span>{shown}</span>;
  return (
    <span className="rr-roll">
      <span className="rr-roll__track rr-roll__track--rolling">
        <span aria-hidden="true">{shown - 1}</span>
        <span>{shown}</span>
      </span>
    </span>
  );
}
