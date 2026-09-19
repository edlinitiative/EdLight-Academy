import React from 'react';
import SceneFrame from '../SceneFrame';
import ProvisionalNotice from '../ProvisionalNotice';
import { payloadOf, type SceneProps } from '../sceneContract';
import {
  PODIUM_SLOTS,
  PODIUM_STEP_MS,
  accuracyPct,
  avgSeconds,
  rankLabel,
  revealState,
} from '../finaleLogic';
import type { ChampionIndividualPayload, IndividualStanding } from '../../../shared/arena/events';
import './finale.css';

/**
 * Sequence 18 — the individual podium. Third, second, first, three seconds
 * apart.
 *
 * The school champion is a collective result; this one has a face. It is also
 * the prize money's screen — section M's $100, the two data top-ups — which is
 * why the provisional notice matters more here than anywhere else in the
 * programme, and why it sits inside the frame rather than beneath it.
 *
 * ── Three numbers, none of them the headline ───────────────────────────────
 * Section K asks each step to carry score, accuracy and average time, and
 * section K also forbids two things competing for the biggest type on a screen.
 * Both hold because the display slot goes to the NAME: the three figures sit
 * together on one mono line beneath it, the same size as each other, none of
 * them shouting. A podium where the score were set at 132px would be a
 * scoreboard with a person attached, which is the opposite of what this scene
 * is for.
 *
 * ── Accuracy is a percentage of the questions ASKED ────────────────────────
 * Not of questions answered. A player who skipped ten and got fifteen right did
 * not shoot 100%, and on a screen announcing prize winners that distinction is
 * the difference between a statistic and a claim. It needs `questionCount`, so
 * the line is simply omitted when the tournament document has not arrived.
 */
export default function ChampionIndividual({ scene, data, elapsed, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<ChampionIndividualPayload>(scene, 'CHAMPION_INDIVIDUAL');
  const podium = (payload?.podium ?? data.standings?.individuals ?? []).slice(0, PODIUM_SLOTS);

  const { revealed, current, complete } = revealState<IndividualStanding>(podium, elapsed, {
    slots: PODIUM_SLOTS,
    stepMs: PODIUM_STEP_MS,
    reduceMotion,
  });

  const questionCount = data.tournament?.questionCount ?? 0;
  const accuracy = accuracyPct(current, questionCount);
  const rank = current?.rank || (podium.length - revealed.length + 1);

  // Everything already announced, back in rank order so the podium reads as a
  // podium rather than as the order it happened to be revealed in.
  const settled = revealed
    .filter((p) => p !== current)
    .slice()
    .sort((a, b) => (a.rank || 0) - (b.rank || 0));

  if (!current) {
    return (
      <SceneFrame
        reduceMotion={reduceMotion}
        overline={t('PODIUM INDIVIDUEL', 'PODYÒM ENDIVIDYÈL')}
        figure={t('À VENIR', 'AP VINI')}
      />
    );
  }

  return (
    <SceneFrame
      key={current.uid}
      className="finale-champion"
      reduceMotion={reduceMotion}
      tone={complete ? 'gold' : 'default'}
      overline={rankLabel(rank, t)}
      figure={current.displayName}
      support={(
        <span className="finale-stats">
          <span>{`${Math.round(current.score)} ${t('PTS', 'PWEN')}`}</span>
          {accuracy !== null ? <span>{`${accuracy}%`}</span> : null}
          <span>{`${avgSeconds(current.avgMs)} s`}</span>
          <span>{current.schoolShort}</span>
        </span>
      )}
    >
      <div className="finale">
        {settled.length > 0 ? (
          <ol className="finale-podium">
            {settled.map((player) => (
              <li key={player.uid} className="finale-podium__row">
                <span>{rankLabel(player.rank, t)}</span>
                <span className="finale-podium__name">{player.displayName}</span>
                <span>{`${Math.round(player.score)} · ${player.schoolShort}`}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {complete ? <ProvisionalNotice state={data.tournament?.state} t={t} /> : null}
      </div>
    </SceneFrame>
  );
}
