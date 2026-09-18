import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { QuestionClosedPayload } from '../../../shared/arena/events';
import { formatSeconds, hairlineScale, questionNumber } from '../rhythm';
import Board from './Board';
import './roundRhythm.css';

/**
 * Sequence 5 — the round result.
 *
 * The question has closed. The board brightens out of the dim it was left in by
 * the transition, the share of the room that got it right fills as a hairline,
 * and the fastest correct answer is named at the bottom left. 2.2 seconds.
 *
 * The composition is deliberate and easy to get wrong. There are three numbers
 * available — the percentage, the fastest time, and the question index — and
 * only ONE of them may be the biggest thing on screen. The percentage wins,
 * because it is the only one that describes the room rather than an individual;
 * the time sits small beside the name it belongs to, and the index is an
 * overline. Set two of them large and the screen asks the audience to choose
 * what the last thirty seconds meant.
 *
 * The hairline fills rather than appearing. That fill is the only motion here,
 * and it is information: a bar that lands at 38% having travelled there says
 * "most of the room missed this" in a way the figure alone does not.
 */
export default function QuestionClosed({ scene, data, elapsed, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<QuestionClosedPayload>(scene, 'QUESTION_CLOSED');
  const pct = payload?.correctPct ?? 0;
  const { shown, total } = questionNumber(
    payload?.index ?? data.tournament?.currentIndex ?? 0,
    data.tournament?.questionCount ?? 0,
  );

  // Under reduced motion the hairline lands complete rather than travelling.
  // The fraction is the information; only the journey to it is decoration.
  const fill = hairlineScale(pct, elapsed, { delayMs: 180, immediate: reduceMotion });
  const fastest = payload?.fastest ?? null;

  return (
    <div className="rr-scene">
      <SceneFrame
        reduceMotion={reduceMotion}
        overline={total > 0
          ? `${t('Question', 'Kesyon')} ${shown} / ${total}`
          : `${t('Question', 'Kesyon')} ${shown}`}
        figure={`${Math.round(Math.min(100, Math.max(0, pct)))}%`}
        support={t('de bonnes réponses', 'bon repons')}
        cause={fastest ? (
          <span className="rq-fastest">
            <span>{t('Réponse la plus rapide', 'Repons ki pi rapid')}</span>
            <span className="rq-fastest__name">{fastest.displayName}</span>
            {fastest.schoolShort ? <span className="rq-fastest__school">{fastest.schoolShort}</span> : null}
            <span className="rq-fastest__ms">{formatSeconds(payload?.fastestMs ?? 0)}</span>
          </span>
        ) : (
          // Named honestly rather than hidden. A missing fastest answer means
          // nobody answered correctly, and that is worth saying out loud.
          <span className="rq-fastest">
            {t('Aucune bonne réponse sur cette question', 'Pa gen okenn bon repons sou kesyon sa a')}
          </span>
        )}
      >
        <div className="rq-hairline" aria-hidden="true">
          <span
            className="rq-hairline__fill"
            style={{ ['--rq-fill' as string]: String(fill) }}
          />
        </div>
      </SceneFrame>

      <div className={reduceMotion ? undefined : 'rb-board--brighten'}>
        <Board scene={scene} data={data} elapsed={elapsed} reduceMotion={reduceMotion} t={t} />
      </div>
    </div>
  );
}
