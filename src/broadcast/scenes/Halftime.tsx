import React from 'react';
import SceneFrame from '../SceneFrame';
import { payloadOf, type SceneProps } from '../sceneContract';
import {
  avgSeconds,
  climberFrom,
  halftimeExtras,
  marginPhrase,
  marginSentence,
  staggerStyle,
} from '../finaleLogic';
import type { HalftimePayload } from '../../../shared/arena/events';
import './finale.css';

/**
 * Sequence 13 — halftime. Its own screen, and the longest thing in the
 * broadcast that is not a question.
 *
 * Halftime is where a two-hour tournament stops being a scoreboard and becomes
 * a story somebody can tell. Everything here is a fact the host can read out
 * without inventing anything, which is why the layout is a summary rather than
 * a celebration: the margin at the top, the top three underneath it, and five
 * superlatives beside them.
 *
 * ── Why the margin is the headline ─────────────────────────────────────────
 * "30 POINTS SÉPARENT #1 ET #2" is the single most useful sentence at the
 * midpoint — it is what tells the room whether the second half is a race or a
 * procession, and it is the line section K quotes verbatim. So the gap gets the
 * display type and the schools get their own, smaller lanes beneath it. One
 * number is the biggest thing on screen: the margin. The teamAvgs are set in
 * mono at lane size and never compete with it.
 *
 * ── Why cards can be missing ───────────────────────────────────────────────
 * The biggest climber needs two snapshots to exist, and the stage holds one.
 * Rather than print a made-up climb, the card is simply absent and the grid
 * closes up around it — `climberFrom` reads a `BIGGEST_CLIMBER` the emitter may
 * have composed into this scene and returns null when there is none. A screen
 * whose entire claim is that it only says true things cannot afford one
 * invented statistic at the exact moment the most people are watching.
 */
export default function Halftime({ scene, data, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<HalftimePayload>(scene, 'HALFTIME');
  const schools = payload?.top ?? data.standings?.schools ?? [];
  const top3 = schools.slice(0, 3);
  const margin = payload?.margin
    ?? (top3.length >= 2 ? (top3[0]?.teamAvg ?? 0) - (top3[1]?.teamAvg ?? 0) : 0);
  const phrase = marginPhrase(margin, 1, 2, t);

  const climber = climberFrom(scene.composed);
  const { fastest, perfect, totals } = halftimeExtras(data.standings, data.places);
  const mvp = payload?.mvp ?? null;

  const index = payload?.questionIndex ?? data.tournament?.currentIndex ?? 0;
  const total = payload?.totalQuestions ?? data.tournament?.questionCount ?? 0;

  // Counts come from the tournament document when it has them: `places` only
  // holds the people we could put on a map, and reporting that as the crowd
  // would quietly shrink the tournament by everyone whose commune is unknown.
  const players = data.tournament?.counts.players || totals.players;
  const schoolCount = data.tournament?.counts.schools || totals.schools;

  const cards: Array<{ label: string; value: string; detail: string; gain?: boolean }> = [];

  if (mvp) {
    cards.push({
      label: t('MVP', 'MVP'),
      value: mvp.displayName,
      detail: `${mvp.schoolShort} · ${Math.round(mvp.score)} ${t('PTS', 'PWEN')}`,
    });
  }
  if (climber?.school) {
    cards.push({
      label: t('PLUS GRANDE REMONTÉE', 'PI GWO MONTE'),
      value: climber.school.shortName,
      detail: t(`${climber.from}e → ${climber.to}e`, `${climber.from}yèm → ${climber.to}yèm`),
      gain: true,
    });
  }
  if (fastest) {
    cards.push({
      label: t('LE PLUS RAPIDE, ET JUSTE', 'PI RAPID, EPI KÒRÈK'),
      value: `${avgSeconds(fastest.avgMs)} s`,
      detail: `${fastest.displayName} · ${fastest.schoolShort}`,
    });
  }
  if (perfect.length > 0) {
    cards.push({
      label: t('SANS FAUTE', 'SAN FOT'),
      value: String(perfect.length),
      detail: perfect.map((p) => p.displayName).join(' · '),
    });
  }
  cards.push({
    label: t('PARTICIPATION', 'PATISIPASYON'),
    value: players.toLocaleString('fr-FR'),
    detail: t(
      `${schoolCount} écoles · ${totals.communes} communes`,
      `${schoolCount} lekòl · ${totals.communes} komin`,
    ),
  });

  // An exact tie, or a gap under a point, puts words in the display slot where
  // a number normally sits. Those do not fit at 132px, so the slot steps down —
  // it is still the biggest thing on screen, which is what section K asks.
  const figureIsWords = !/^\d+$/.test(phrase.figure);

  return (
    <SceneFrame
      className={figureIsWords ? 'finale-words' : ''}
      reduceMotion={reduceMotion}
      overline={t(`MI-TEMPS · QUESTION ${index} / ${total}`, `MITAN MATCH · KESYON ${index} / ${total}`)}
      figure={phrase.figure}
      support={phrase.words}
    >
      <div className="finale finale-halftime">
        <ol className="finale-ranks finale-halftime__ranks">
          {top3.map((school, i) => (
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
              {/* The gap to the lane below, stated rather than left to be eyeballed. */}
              {i + 1 < top3.length ? (
                <li className="finale-gap" style={staggerStyle(i + 1, reduceMotion)}>
                  {marginSentence(
                    (school.teamAvg ?? 0) - (top3[i + 1].teamAvg ?? 0),
                    school.rank || i + 1,
                    top3[i + 1].rank || i + 2,
                    t,
                  )}
                </li>
              ) : null}
            </React.Fragment>
          ))}
        </ol>

        <div className="finale-cards finale-halftime__cards">
          {cards.map((card, i) => (
            <div
              key={card.label}
              className="finale-card"
              // Staggered 55ms apart, continuing the cascade the lanes started,
              // so halftime reads as one screen assembling rather than two.
              style={staggerStyle(top3.length + i + 1, reduceMotion)}
            >
              <div className="finale-label">{card.label}</div>
              <div className={`finale-value finale-card__value${card.gain ? ' finale-gain' : ''}`}>
                {card.value}
              </div>
              <div className="finale-detail finale-card__detail">{card.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </SceneFrame>
  );
}
