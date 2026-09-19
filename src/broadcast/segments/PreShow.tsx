import React from 'react';
import SceneFrame from '../SceneFrame';
import type { MapPlace, StageData } from '../sceneContract';
import {
  formatCountdown,
  countdownParts,
  introCardAge,
  introIndexAt,
  schoolHue,
} from '../rhythm';
import '../scenes/roundRhythm.css';
import './preShow.css';

/**
 * Sequences 1 and 2 — the pre-show.
 *
 * ── Why this is not a registry scene ───────────────────────────────────────
 * The director chooses scenes from EVENTS. At `doors` there are no events yet:
 * the tournament is open, people are arriving, and the first `TOURNAMENT_OPEN`
 * may be minutes away. A scene kind for "nothing has happened yet" would mean
 * the director inventing an event that never occurred, which is exactly the
 * habit the whole event feed exists to prevent. So the page renders this
 * directly while `tournament.state` is at the doors, and hands the screen to
 * the director when the feed starts.
 *
 * ── The two sequences, and why they share a screen ─────────────────────────
 * Section K lists the countdown (1) and the school introductions (2) as
 * separate rows, but they run at the same time: the countdown holds until the
 * start, and the introductions cycle underneath it. The hierarchy that keeps
 * that from being two headlines is fixed here and nowhere else — **the clock is
 * the one biggest thing on screen**, and the introduction card is emphatic but
 * smaller. Set both at display size and the audience has to decide which of the
 * two the screen is about.
 *
 * ── Where the map goes ─────────────────────────────────────────────────────
 * `mapSlot` takes the larger half of the landscape split, beside the
 * introduction card and at the same height. That is not decoration: before a
 * tournament starts, the thing worth watching is who is here, and in Haiti that
 * means WHERE they are — a school's card and its point lighting up on the map
 * are meant to read as one statement. The map is built by another author; this
 * segment does not import it, renders whatever it is handed, and lays out
 * honestly when it is handed nothing.
 */

export interface PreShowProps {
  data: StageData;
  /** Milliseconds the pre-show has held the screen. Drives the 3s intro beat. */
  elapsed: number;
  reduceMotion: boolean;
  t: (fr: string, ht: string) => string;
  /**
   * The map of Haiti. Rendered as the right-hand half of the pre-show.
   *
   * Left as a slot rather than an import so the two can be built and reviewed
   * independently — and so a night where the map fails to load is a pre-show
   * with a wider clock rather than a blank screen.
   */
  mapSlot?: React.ReactNode;
}

/** A school as the pre-show needs it, from whichever source has it. */
interface IntroSchool {
  key: string;
  short: string;
  full: string;
  players: number;
  qualified: boolean;
  /** Commune, when we know it. Ties the card to the point on the map. */
  place?: string;
}

/**
 * The schools, from the standings where they exist and from the map places
 * otherwise.
 *
 * Both sources are real; neither is complete on its own. Standings carry the
 * player counts and qualification, and are what exists once anybody has
 * registered; `places` carries the commune, and is what the map is drawn from.
 * Sorted by short name so the cycle is stable — an order that shuffled as
 * registrations landed would re-introduce schools the room has already met.
 */
function introSchools(data: StageData): IntroSchool[] {
  const placeByLabel = new Map<string, MapPlace>();
  for (const p of data.places) {
    if (p.kind === 'school' && p.label) placeByLabel.set(p.label, p);
  }

  const fromStandings = (data.standings?.schools ?? []).map((s) => ({
    key: s.key,
    short: s.shortName || s.label,
    full: s.label,
    players: s.members ?? 0,
    qualified: !!s.qualified,
    place: placeByLabel.get(s.shortName)?.name,
  }));
  if (fromStandings.length > 0) {
    return fromStandings.sort((a, b) => a.short.localeCompare(b.short, 'fr'));
  }

  // Before the first standings document exists, the map is the only roll call
  // we have. Player counts are genuinely unknown here, so they are not shown
  // rather than shown as zero.
  return data.places
    .filter((p) => p.kind === 'school')
    .map((p) => ({
      key: p.id,
      short: p.label || p.name,
      full: p.label ? p.name : '',
      players: p.value ?? 0,
      qualified: !!p.active,
      place: p.name,
    }))
    .sort((a, b) => a.short.localeCompare(b.short, 'fr'));
}

export default function PreShow({ data, elapsed, reduceMotion, t, mapSlot }: PreShowProps) {
  const tournament = data.tournament;
  const schools = introSchools(data);

  const startsAt = tournament?.startsAt ?? 0;
  const remaining = startsAt > 0 ? startsAt - data.now : 0;
  const { done } = countdownParts(remaining);
  const knownStart = startsAt > 0;

  const index = introIndexAt(elapsed, schools.length);
  const current = index >= 0 ? schools[index] : null;
  // The sweep belongs to the cut, not to the card's whole three seconds.
  const justCut = introCardAge(elapsed) < 700;

  const players = tournament?.counts.players ?? 0;
  const schoolCount = tournament?.counts.schools ?? schools.length;

  return (
    // No ray element rendered here. The page's own `.live__rays` (Live.css)
    // already turns once every four minutes at rest — the exact field
    // section K asks for during the pre-show — so this segment inherits it
    // rather than painting an identical second copy on top, out of phase
    // with the first. See roundRhythm.css's header comment for the rest of
    // this story.
    <div className="rp">
      <header className="rp__head">
        <h1 className="rp__title">{tournament?.title || t('L’Arène', 'Arèn nan')}</h1>
        <span className="rp__doors">{t('Les portes sont ouvertes', 'Pòt yo louvri')}</span>
      </header>

      <div className="rp__body" data-map={mapSlot ? 'yes' : 'none'}>
        <div className="rp__left">
          <div className="rp__clock">
            <SceneFrame
              reduceMotion={reduceMotion}
              overline={
                !knownStart
                  ? t('Début à confirmer', 'Lè kòmansman an poko fikse')
                  : done
                    ? t('Début imminent', 'L ap kòmanse kounye a')
                    : t('Début dans', 'Kòmanse nan')
              }
              figure={
                <span role="timer" aria-live="off">
                  {knownStart ? formatCountdown(remaining) : '—'}
                </span>
              }
              support={t(
                'Le tournoi commence dès que les portes ferment.',
                'Tounwa a ap kòmanse kou pòt yo fèmen.',
              )}
            >
              <div className="rp__counts">
                <span className="ro-count">
                  <span className="ro-count__value">{schoolCount}</span>
                  <span className="ro-count__label">{t('écoles', 'lekòl')}</span>
                </span>
                <span className="ro-count">
                  <span className="ro-count__value">{players.toLocaleString('fr-FR')}</span>
                  <span className="ro-count__label">{t('joueurs', 'jouè')}</span>
                </span>
                {data.unplacedSchools > 0 ? (
                  // Never hidden. A school the map cannot place is still here,
                  // and silently dropping it from a count is how a school comes
                  // to believe it was left out of its own tournament.
                  <span className="ro-count">
                    <span className="ro-count__value">{data.unplacedSchools}</span>
                    <span className="ro-count__label">{t('hors carte', 'pa sou kat la')}</span>
                  </span>
                ) : null}
              </div>
            </SceneFrame>
          </div>

          {current ? (
            <SchoolIntroduction
              // Keyed by the card index, so each school is a hard cut rather
              // than React reconciling one name into the next.
              key={`${current.key}:${index}`}
              school={current}
              swept={justCut && !reduceMotion}
              t={t}
            />
          ) : (
            <p className="rp__empty">
              {t('Les écoles arrivent…', 'Lekòl yo ap rive…')}
            </p>
          )}
        </div>

        {/* The map of Haiti — schools arriving and lighting up where they are. */}
        {mapSlot ? <div className="rp__map">{mapSlot}</div> : null}
      </div>

      <ArrivalsTicker schools={schools} reduceMotion={reduceMotion} t={t} />
    </div>
  );
}

/**
 * Sequence 2 — one school, for three seconds, then a hard cut to the next.
 *
 * Short name huge because that is the identity a student recognises; the full
 * name beneath because the short name alone means nothing to a parent watching.
 * No crest and no school colour: section L is explicit that we must not
 * approximate either, and the hue on the edge bar is our own wayfinding rather
 * than a claim about the institution.
 */
function SchoolIntroduction({
  school,
  swept,
  t,
}: {
  school: IntroSchool;
  swept: boolean;
  t: (fr: string, ht: string) => string;
}) {
  return (
    <div
      className="rp-intro"
      style={{ ['--rp-hue' as string]: String(schoolHue(school.key)) }}
    >
      {swept ? <span className="rp-intro__sweep" aria-hidden="true" /> : null}
      <span className="rp-intro__edge" aria-hidden="true" />
      <span className="rp-intro__short">{school.short}</span>
      {school.full && school.full !== school.short ? (
        <span className="rp-intro__full">{school.full}</span>
      ) : null}
      <span className="rp-intro__meta">
        {school.players > 0 ? (
          <span>
            <span className="rp-intro__players">{school.players}</span>
            {' '}
            {t('joueurs', 'jouè')}
          </span>
        ) : null}
        {school.place ? <span>{school.place}</span> : null}
        <span
          className={`rp-intro__badge rp-intro__badge--${school.qualified ? 'qualified' : 'waiting'}`}
        >
          {school.qualified
            ? t('Qualifiée', 'Kalifye')
            : t('En attente', 'Ap tann')}
        </span>
      </span>
    </div>
  );
}

/**
 * The arrivals, crossing the foot of the screen.
 *
 * Duplicated once and translated by exactly half its width, which is what makes
 * a marquee seamless without measuring anything. The duration scales with the
 * number of schools so the reading speed stays constant whether eight schools
 * turned up or sixty.
 */
function ArrivalsTicker({
  schools,
  reduceMotion,
  t,
}: {
  schools: IntroSchool[];
  reduceMotion: boolean;
  t: (fr: string, ht: string) => string;
}) {
  if (schools.length === 0) {
    return (
      <div className="rp__ticker">
        <p className="rp__empty">{t('Aucune école n’est encore arrivée.', 'Poko gen lekòl ki rive.')}</p>
      </div>
    );
  }

  // Short lists have nothing to scroll past: they fit, so they sit still.
  const still = reduceMotion || schools.length < 6;
  const run = still ? schools : [...schools, ...schools];

  return (
    <div className="rp__ticker" aria-label={t('Écoles présentes', 'Lekòl ki la')}>
      <div
        className={`rp__ticker-track${still ? ' rp__ticker-track--still' : ''}`}
        style={{ ['--rp-ticker-s' as string]: `${Math.max(40, schools.length * 4)}s` }}
      >
        {run.map((s, i) => (
          <span className="rp__arrival" key={`${s.key}:${i}`} aria-hidden={!still && i >= schools.length}>
            <span className="rp__arrival-short">{s.short}</span>
            {s.place ? <span className="rp__arrival-place">{` · ${s.place}`}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}
