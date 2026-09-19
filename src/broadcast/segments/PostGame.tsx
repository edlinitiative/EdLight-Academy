import React from 'react';
import SceneFrame from '../SceneFrame';
import ProvisionalNotice from '../ProvisionalNotice';
import type { StageData } from '../sceneContract';
import {
  avgSeconds,
  championsTitle,
  postGameBeat,
  staggerStyle,
  superlatives,
  teaserBeat,
} from '../finaleLogic';
import type { StandingsSnapshot } from '../../../shared/arena/events';
import '../scenes/finale.css';

/**
 * Sequences 19 and 20 — the superlatives board, and the teaser for next month.
 *
 * ── Why these are not registry scenes ──────────────────────────────────────
 * Every other sequence is chosen by the director from an event. These two are
 * not: they run at `final`, when the feed has nothing left to deliver and the
 * director would be sitting on the board with an empty queue forever. So the
 * page renders them directly. Registering them would mean inventing synthetic
 * events to trigger scenes that have no trigger, and the director would then
 * have to be taught not to cut a thirty-second segment at its seven-second
 * `maxDwellMs` — two lies to make one component fit a mechanism it does not
 * belong to.
 *
 * ── Why it loops ───────────────────────────────────────────────────────────
 * 30s of stats, 8s of teaser, then round again. A screen in a school hall stays
 * up long after the stream ends, and the alternative to looping is a stage that
 * goes blank at the 38-second mark and stays blank all evening.
 *
 * ── The map ────────────────────────────────────────────────────────────────
 * "Participation by commune" is a map of Haiti, and it is the one statistic in
 * the whole tournament that is about the country rather than about the winners
 * — which is why it gets the larger half of the screen rather than a footnote
 * under the superlatives. The map component is built separately and arrives
 * through `mapSlot`; this segment reserves its space by aspect-ratio so the
 * layout does not jump when it mounts, prints the commune table beside it
 * either way, and states plainly how many schools could not be placed. A stage
 * that quietly drops the schools it has no coordinates for is a stage claiming
 * a smaller tournament than the one that happened.
 */
export interface PostGameProps {
  data: StageData;
  /** Milliseconds this segment has been on screen. From the stage's one tick. */
  elapsed: number;
  reduceMotion: boolean;
  t: (fr: string, ht: string) => string;
  /** `<HaitiMap …>`, wired in by the page. Absent is a supported state. */
  mapSlot?: React.ReactNode;
  /**
   * An earlier snapshot — the opening standings, say. Optional, and the "most
   * improved school" card is simply absent without it: improvement needs two
   * points in time and the stage keeps one, so the alternative to omitting the
   * card is printing a climb nobody made.
   */
  previousStandings?: StandingsSnapshot | null;
  /** "18 OCTOBRE", for the teaser. Absent says so rather than inventing a date. */
  nextDate?: string;
}

export default function PostGame({
  data,
  elapsed,
  reduceMotion,
  t,
  mapSlot,
  previousStandings,
  nextDate,
}: PostGameProps) {
  const { phase, phaseElapsed } = postGameBeat(elapsed);
  const stats = superlatives(data.standings, data.places, previousStandings ?? null);
  const champion = data.standings?.schools?.[0] ?? null;

  if (phase === 'teaser') {
    const beat = teaserBeat(phaseElapsed);
    const shortName = champion?.shortName || champion?.label || t('LES CHAMPIONS', 'CHANPYON YO');

    // The challenge is a sentence, not a name, so it takes a smaller display
    // size — the one-number rule is about hierarchy, and a phrase set at 132px
    // would simply run off a 1920 screen.
    return beat === 'champions' ? (
      <SceneFrame
        key="teaser-champions"
        className="finale-teaser"
        reduceMotion={reduceMotion}
        tone="gold"
        overline={data.tournament?.title ?? t('ARENA', 'ARENA')}
        figure={shortName}
        support={championsTitle(data.now, t)}
      >
        <div className="finale">
          <ProvisionalNotice state={data.tournament?.state} t={t} />
        </div>
      </SceneFrame>
    ) : (
      <SceneFrame
        key="teaser-challenge"
        className="finale-teaser finale-challenge"
        reduceMotion={reduceMotion}
        overline={t('PROCHAINE ÉDITION', 'PWOCHEN EDISYON')}
        figure={t('QUI PEUT LES DÉTRÔNER ?', 'KI MOUN KI KA PRAN PLAS YO ?')}
        support={(
          <span className="finale-teaser__date">
            {nextDate || t('DATE ANNONCÉE BIENTÔT', 'N AP ANONSE DAT LA BYENTÒ')}
          </span>
        )}
      />
    );
  }

  const facts: Array<{ label: string; value: string; detail: string; gain?: boolean }> = [];

  if (stats.mostImproved) {
    const { school, from, to } = stats.mostImproved;
    facts.push({
      label: t('PLUS FORTE PROGRESSION', 'PI GWO PWOGRÈ'),
      value: school.shortName || school.label,
      detail: t(`${from}e → ${to}e place`, `${from}yèm → ${to}yèm plas`),
      gain: true,
    });
  }
  if (stats.fastest) {
    facts.push({
      label: t('MOYENNE LA PLUS RAPIDE', 'MWAYÈN PI RAPID'),
      value: `${avgSeconds(stats.fastest.avgMs)} s`,
      detail: `${stats.fastest.displayName} · ${stats.fastest.schoolShort}`,
    });
  }
  if (stats.mostPerfect) {
    facts.push({
      label: t('PLUS DE TOURS SANS FAUTE', 'PLIS TOU SAN FOT'),
      value: stats.mostPerfect.shortName,
      detail: t(
        `${stats.mostPerfect.count} élève${stats.mostPerfect.count > 1 ? 's' : ''} sans faute`,
        `${stats.mostPerfect.count} elèv san fot`,
      ),
    });
  }

  const players = data.tournament?.counts.players || stats.totals.players;
  const schools = data.tournament?.counts.schools || stats.totals.schools;
  const topCommunes = stats.communes.slice(0, 6);
  const busiest = topCommunes[0]?.players ?? 0;

  return (
    <SceneFrame
      key="postgame-stats"
      reduceMotion={reduceMotion}
      overline={t('APRÈS LE MATCH', 'APRE MATCH LA')}
      figure={players.toLocaleString('fr-FR')}
      support={t(
        `élèves · ${schools} écoles · ${stats.totals.communes} communes`,
        `elèv · ${schools} lekòl · ${stats.totals.communes} komin`,
      )}
    >
      <div className="finale finale-postgame">
        <div className="finale-postgame__facts">
          <div className="finale-cards">
            {facts.map((fact, i) => (
              <div key={fact.label} className="finale-card" style={staggerStyle(i + 1, reduceMotion)}>
                <div className="finale-label">{fact.label}</div>
                <div className={`finale-value finale-card__value${fact.gain ? ' finale-gain' : ''}`}>
                  {fact.value}
                </div>
                <div className="finale-detail finale-card__detail">{fact.detail}</div>
              </div>
            ))}
          </div>
          <ProvisionalNotice state={data.tournament?.state} t={t} />
        </div>

        <div className="finale-postgame__map">
          <div className="finale-label">{t('PARTICIPATION PAR COMMUNE', 'PATISIPASYON PA KOMIN')}</div>
          <div className="finale-map-slot">
            {mapSlot ?? (
              <p className="finale-map-slot__empty">
                {t('Carte de la participation', 'Kat patisipasyon an')}
              </p>
            )}
          </div>

          <ol className="finale-communes">
            {topCommunes.map((commune, i) => (
              <li
                key={commune.name}
                className="finale-commune"
                style={staggerStyle(facts.length + i + 1, reduceMotion)}
              >
                <span className="finale-commune__name">{commune.name}</span>
                <span className="finale-commune__bar" aria-hidden>
                  {/* Scaled, not resized: a width transition here would lay out
                      the whole board on every frame. */}
                  <span
                    className="finale-commune__fill"
                    style={{ ['--finale-share' as string]: busiest > 0 ? commune.players / busiest : 0 }}
                  />
                </span>
                <span className="finale-commune__count">{commune.players.toLocaleString('fr-FR')}</span>
              </li>
            ))}
          </ol>

          {/* Said out loud rather than quietly dropped. */}
          {data.unplacedSchools > 0 ? (
            <p className="finale-detail">
              {t(
                `${data.unplacedSchools} école${data.unplacedSchools > 1 ? 's' : ''} sans commune connue`,
                `${data.unplacedSchools} lekòl san komin nou konnen`,
              )}
            </p>
          ) : null}
        </div>
      </div>
    </SceneFrame>
  );
}
