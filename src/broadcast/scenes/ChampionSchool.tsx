import React from 'react';
import SceneFrame from '../SceneFrame';
import ProvisionalNotice from '../ProvisionalNotice';
import { payloadOf, type SceneProps } from '../sceneContract';
import {
  CHAMPION_SLOTS,
  REVEAL_STEP_MS,
  rankLabel,
  revealState,
  staggerStyle,
} from '../finaleLogic';
import type { ChampionSchoolPayload, SchoolStanding } from '../../../shared/arena/events';
import './finale.css';

/**
 * Sequence 17 — the school champion, revealed from fifth up, one every 2.5
 * seconds, hard cuts between.
 *
 * This is the clip. Everything else in the broadcast is watched live once; this
 * is the frame that gets screenshotted, reposted and sent to a school's
 * WhatsApp group for a year. It is built accordingly: one card at a time, no
 * chrome, and the champion's frame complete enough to stand alone with no
 * context — short name, team average, the five students by name.
 *
 * ── Why hard cuts ──────────────────────────────────────────────────────────
 * A cross-fade between fifth and fourth would be a transition, and a transition
 * says "these are two views of one thing". These are five separate verdicts. A
 * hard cut is how a broadcast says "and now, this" — so the intermediate cards
 * are mounted with no entrance at all, and only the champion gets the shared
 * 320ms landing. Motion exists to say what changed, and the thing that changed
 * when the champion appears is the entire tournament.
 *
 * No ray sweep, deliberately. A sweep marks a gain and nothing else, and
 * spending it on the biggest moment of the night would retroactively make every
 * overtake earlier in the match look like it was also a championship.
 *
 * ── The reveal order comes from the board, the champion from the event ──────
 * `data.standings` carries all five schools; the event carries the winner with
 * the authoritative `teamAvg` and its five players. The countdown reads the
 * board, the final card prefers the payload — if those two ever disagree, the
 * event is what the server actually decided and the board is a snapshot that
 * may be one write behind.
 */
export default function ChampionSchool({ scene, data, elapsed, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<ChampionSchoolPayload>(scene, 'CHAMPION_SCHOOL');
  const ranked = (data.standings?.schools ?? []).slice(0, CHAMPION_SLOTS);

  const { revealed, current, complete } = revealState<SchoolStanding>(ranked, elapsed, {
    slots: CHAMPION_SLOTS,
    stepMs: REVEAL_STEP_MS,
    reduceMotion,
  });

  const champion = payload?.school ?? null;
  // A board that never arrived still has a winner: the event carries one. The
  // countdown simply has nothing to count down, so the champion lands straight
  // away rather than the scene rendering an empty frame on the biggest moment
  // of the night.
  const landed = complete || ranked.length === 0;
  const shortName = landed
    ? (champion?.shortName ?? current?.shortName ?? current?.label ?? '')
    : (current?.shortName ?? current?.label ?? '');
  const fullName = landed ? (champion?.label ?? current?.label ?? '') : (current?.label ?? '');
  const teamAvg = landed
    ? Math.round(payload?.teamAvg ?? current?.teamAvg ?? 0)
    : Math.round(current?.teamAvg ?? 0);
  const rank = current?.rank || (ranked.length - revealed.length + 1);

  const five = payload?.top5 ?? [];

  return (
    <SceneFrame
      // Keyed on the card, not the scene: React would otherwise reconcile each
      // reveal into the last one and the champion's landing — the only
      // entrance in the sequence — would never play.
      key={current?.key ?? 'champion'}
      className="finale-champion"
      // The intermediate cards are cuts: `reduceMotion` here means "no
      // entrance", which is exactly what a hard cut is. Only the champion
      // lands.
      reduceMotion={reduceMotion || !landed}
      tone={landed ? 'gold' : 'default'}
      overline={landed
        ? t('CHAMPIONS INTER-ÉCOLES', 'CHANPYON ANT LEKÒL')
        : rankLabel(rank, t)}
      figure={shortName}
      support={landed
        ? t(`MOYENNE D'ÉQUIPE ${teamAvg}`, `MWAYÈN EKIP ${teamAvg}`)
        : `${fullName} · ${teamAvg}`}
    >
      <div className="finale">
        {/* Where we are in the countdown, for anyone who joined mid-reveal. */}
        <div className="finale-slots" aria-hidden>
          {ranked.map((school, i) => (
            <span
              key={school.key}
              className={`finale-slot${i < revealed.length ? ' finale-slot--done' : ''}`}
            />
          ))}
        </div>

        {landed && five.length > 0 ? (
          <ol className="finale-five">
            {five.map((player, i) => (
              <li key={player.uid} style={staggerStyle(i + 1, reduceMotion)}>{player.displayName}</li>
            ))}
          </ol>
        ) : null}

        {/* Reduced motion collapsed the countdown, so the schools it would have
            shown one at a time are listed instead. The holds go; the result
            does not. */}
        {complete && reduceMotion && ranked.length > 1 ? (
          <ol className="finale-ranks">
            {ranked.map((school) => (
              <li key={school.key} className="finale-rank">
                <span className="finale-rank__pos">{school.rank}</span>
                <span className="finale-rank__name">{school.shortName || school.label}</span>
                <span className="finale-rank__score">{Math.round(school.teamAvg ?? 0)}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {/* In the frame, not under it: this is the one that gets cropped. */}
        {landed ? <ProvisionalNotice state={data.tournament?.state} t={t} /> : null}
      </div>
    </SceneFrame>
  );
}
