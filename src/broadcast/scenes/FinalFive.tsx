import React from 'react';
import SceneFrame from '../SceneFrame';
import { payloadOf, type SceneProps } from '../sceneContract';
import { CHAMPION_SLOTS, marginSentence, marginsBetween, staggerStyle } from '../finaleLogic';
import type { FinalFivePayload } from '../../../shared/arena/events';
import './finale.css';

/**
 * Sequence 14 — five questions left. Two seconds, and the board never looks the
 * same afterwards.
 *
 * This is a gear change, not a moment: nothing has happened, the standings are
 * exactly what they were a second ago. What changes is what the board is FOR.
 * Up to here it has been a ranking of everyone; from here it is a race between
 * five, and the screen says so by simply dropping everyone else.
 *
 * ── The margins become permanent ───────────────────────────────────────────
 * For the whole first hour a margin is a callout — it appears when something
 * happens and leaves with the scene that raised it. From the final five on, the
 * gap between each pair of lanes is printed between them and stays there,
 * because with five questions left the distance IS the story and a viewer
 * should never have to subtract two numbers in their head to find it.
 *
 * ── The wipe ───────────────────────────────────────────────────────────────
 * "5 QUESTIONS" arrives under a hairline scaled from the left edge. A rule that
 * grows is the cheapest possible way to say "from here", it composites on the
 * GPU, and it is emphatically not a ray sweep — sweeps are reserved for gains
 * and nobody has gained anything yet.
 */
export default function FinalFive({ scene, data, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<FinalFivePayload>(scene, 'FINAL_FIVE');
  const top = (payload?.top ?? data.standings?.schools ?? []).slice(0, CHAMPION_SLOTS);
  // The emitter's margins are authoritative; deriving them locally is the
  // fallback for a board that arrived without the event, not a second opinion.
  const margins = payload?.margins?.length ? payload.margins : marginsBetween(top);
  const remaining = payload?.questionsRemaining
    ?? Math.max(0, (data.tournament?.questionCount ?? 0) - ((data.tournament?.currentIndex ?? 0) + 1));

  return (
    <SceneFrame
      reduceMotion={reduceMotion}
      overline={t('DERNIÈRE LIGNE DROITE', 'DÈNYE LIY DWAT')}
      figure={String(remaining)}
      support={t('QUESTIONS RESTANTES · LE TOP 5 SEUL DÉCIDE', 'KESYON KI RETE · SE TOP 5 LA SÈLMAN KI DESIDE')}
    >
      <div className="finale">
        {reduceMotion ? null : <div className="finale-wipe" aria-hidden />}

        <ol className="finale-ranks">
          {top.map((school, i) => (
            <React.Fragment key={school.key}>
              <li
                className={`finale-rank${i === 0 ? ' finale-rank--lead' : ''}`}
                style={staggerStyle(i + 1, reduceMotion)}
              >
                <span className="finale-rank__pos">{school.rank || i + 1}</span>
                <span className="finale-rank__name">
                  {school.shortName || school.label}
                  <span className="finale-rank__full">{school.label}</span>
                </span>
                <span className="finale-rank__score">{Math.round(school.teamAvg ?? 0)}</span>
              </li>
              {i < margins.length && i + 1 < top.length ? (
                <li className="finale-gap" style={staggerStyle(i + 1, reduceMotion)}>
                  {marginSentence(margins[i], school.rank || i + 1, top[i + 1].rank || i + 2, t)}
                </li>
              ) : null}
            </React.Fragment>
          ))}
        </ol>
      </div>
    </SceneFrame>
  );
}
