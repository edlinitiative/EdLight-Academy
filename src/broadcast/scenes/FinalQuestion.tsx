import React from 'react';
import SceneFrame from '../SceneFrame';
import { payloadOf, type SceneProps } from '../sceneContract';
import { staggerStyle } from '../finaleLogic';
import type { FinalQuestionPayload } from '../../../shared/arena/events';
import './finale.css';

/**
 * Sequence 15 — the last question. Three seconds, and the only time in the
 * whole broadcast that the rays stop turning.
 *
 * ── The ray stop ───────────────────────────────────────────────────────────
 * The ray field has rotated continuously behind every other scene — 240s per
 * revolution, slow enough that a still frame never repeats. Stopping it is the
 * one piece of motion language reserved for this moment, and it works precisely
 * because it is a removal: the room notices that something it was not
 * consciously watching has gone still.
 *
 * The field lives on `.live__rays` in src/pages/Live.css, which this scene does
 * not own and must not edit. So the scene raises `stage-rays-hold` on its own
 * root and `finale.css` pauses the field from there. Documented as a hook
 * rather than assumed: a page that hosts the stage somewhere other than inside
 * `.live` can key off the same class, or set `data-stage-rays="hold"` on any
 * ancestor, and get the same result. THE CLASS NAME IS THE CONTRACT — renaming
 * it silently removes the only beat in the show that is made of stillness.
 *
 * ── What is on screen ──────────────────────────────────────────────────────
 * What is at stake, per contender, and nothing else. No countdown, no question
 * text, no encouragement — the board goes to the edge and the centre states the
 * arithmetic: who leads, and what each of the others needs the last question to
 * do. A viewer who has just joined should be able to read this screen once and
 * know exactly what they are about to watch.
 */
export default function FinalQuestion({ scene, data, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<FinalQuestionPayload>(scene, 'FINAL_QUESTION');

  // Sorted by how far back they are, so the leader is first and the screen
  // reads top-down as the race actually stands.
  const atStake = (payload?.atStake ?? []).slice().sort((a, b) => (a.behind ?? 0) - (b.behind ?? 0));
  const fallback = data.standings?.schools ?? [];
  const leaderName = atStake[0]?.school.shortName
    ?? fallback[0]?.shortName
    ?? fallback[0]?.label
    ?? t('EN JEU', 'NAN JÈ');

  return (
    <SceneFrame
      // The marker the ray field is paused from. See the block comment above.
      className="stage-rays-hold finale-lastq"
      reduceMotion={reduceMotion}
      overline={t('DERNIÈRE QUESTION · CE QUI SE JOUE', 'DÈNYE KESYON · SA K AN JÈ')}
      figure={leaderName}
      support={t('EN TÊTE À UNE QUESTION DE LA FIN', 'ANTÈT AK YON SÈL KESYON KI RETE')}
    >
      <div className="finale">
        <ul className="finale-stakes">
          {atStake.map((row, i) => {
            const behind = Math.max(0, Math.round(row.behind ?? 0));
            const lead = i === 0 && behind === 0;
            return (
              <li
                key={row.school.key}
                className={`finale-stake${lead ? ' finale-stake--lead' : ''}`}
                style={staggerStyle(i + 1, reduceMotion)}
              >
                <span className="finale-stake__name">{row.school.shortName || row.school.label}</span>
                <span className="finale-stake__line">
                  {lead
                    ? t('GAGNE EN RÉPONDANT JUSTE', 'GENYEN SI YO REPONN KÒRÈK')
                    : t(
                      `À ${behind} ${behind === 1 ? 'POINT' : 'POINTS'} DU TITRE`,
                      `${behind} PWEN ANBA TIT LA`,
                    )}
                </span>
              </li>
            );
          })}
        </ul>

        {atStake.length === 0 ? (
          <p className="finale-detail">
            {t('Tout se joue sur cette question.', 'Tout ap jwe sou kesyon sa a.')}
          </p>
        ) : null}
      </div>
    </SceneFrame>
  );
}
