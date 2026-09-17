import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCollectives, getWeeklyTop, weekId, isValidAlias } from '../services/leaderboardService';
import { rankTeams, aggregateBy, normalizeName, TEAM_SIZE } from '../../shared/leaderboardAgg';
import { diffStandings, type LiveStanding } from '../../shared/liveStandings';
import { animateValue, flipReorder, prefersReducedMotion } from '../utils/webMotion';
import useStore from '../contexts/store';
import './Live.css';

/**
 * The live stage — the school race, made to be watched rather than read.
 *
 * This is the screen behind an Instagram Live: projected, streamed, and
 * screenshotted. That is a different job from the leaderboard page, which is
 * for one student checking their own rank. Here nobody scrolls, nobody taps,
 * and the only question is which school is winning — so the page answers that
 * in bars, at a size that survives a phone camera pointed at a laptop.
 *
 * It runs on the weekly school board, which is live data today. When the live
 * trivia event exists, the same stage renders the event's standings instead:
 * what changes is the feed, not this screen.
 */

/** Live means live. Long enough not to hammer the endpoint, short enough that a
 *  school overtaking another is seen within a breath of it happening. */
const POLL_MS = 12_000;

/**
 * Lanes on screen. Six, because a stage that scrolls is not a stage — on a
 * 1080p screen eight lanes push the last two and the ticker below the fold,
 * and nobody scrolls a stream. Six also keeps the bars long enough to read as
 * distance rather than as a progress meter.
 */
const LANES = 6;

function LaneScore({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;
    return animateValue({ from, to: value, duration: 900, onUpdate: (v) => setShown(Math.round(v)) });
  }, [value]);

  return <div className="live__score">{shown.toLocaleString('fr-FR')}</div>;
}

export default function Live() {
  const language = useStore((s) => s.language);
  const user = useStore((s) => s.user);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const { data: groups } = useQuery({
    queryKey: ['live-collectives'],
    queryFn: () => getCollectives('school', 'week'),
    refetchInterval: POLL_MS,
    staleTime: 0,
  });

  const { data: people } = useQuery({
    queryKey: ['live-people'],
    queryFn: () => getWeeklyTop(30, weekId()),
    refetchInterval: POLL_MS,
    staleTime: 0,
  });

  /*
   * Ranked on the best five, so one strong student cannot carry a school and a
   * big school cannot win on turnout alone — see shared/leaderboardAgg.
   *
   * The exhaustive ranking comes from the server, which counts every learner
   * rather than the fetched page. When that endpoint is unreachable the board
   * is aggregated locally from the individual entries instead — the same
   * fallback the Classement page uses. A stage stuck on placeholders reads as
   * a dead stream, and it is the one failure a live audience actually sees.
   */
  const standings = useMemo(() => {
    const source = (groups && groups.length > 0)
      ? groups
      : aggregateBy(people ?? [], 'school', 50);
    return rankTeams(source).slice(0, LANES);
  }, [groups, people]);

  // What changed since the last tick. Held in a ref rather than state so a poll
  // that changes nothing does not re-render the stage.
  const previousStandings = useRef<typeof standings | null>(null);
  const [lanes, setLanes] = useState<LiveStanding[]>([]);
  useEffect(() => {
    if (standings.length === 0) return;
    setLanes(diffStandings(previousStandings.current, standings));
    previousStandings.current = standings;
  }, [standings]);

  // FLIP: measure before the paint that reorders them, invert, then release.
  const laneEls = useRef(new Map<string, HTMLElement>());
  const laneTops = useRef(new Map<string, number>());
  useEffect(() => {
    laneTops.current = flipReorder(laneEls.current, laneTops.current);
  }, [lanes]);

  const myKey = useMemo(() => {
    const mine = (people ?? []).find((p: { id?: string; school?: string }) => p.id === user?.uid);
    return mine?.school ? normalizeName(mine.school) : null;
  }, [people, user?.uid]);

  const leaderXp = lanes[0]?.teamXp ?? 0;

  // The ticker is doubled so the loop has somewhere to travel to — the track
  // translates exactly -50%, which lands the copy where the original began.
  const carriers = useMemo(() => {
    const named = (people ?? [])
      .filter((p: { displayName?: string; school?: string }) => isValidAlias(p.displayName) && p.school)
      .slice(0, 12);
    return [...named, ...named];
  }, [people]);

  return (
    <div className="live">
      {/* The mark's own rays, at wall scale. Nothing blurred — the logo has
          no blur in it, and a soft glow is what made the first version of this
          page look like every other generated dark dashboard. */}
      <div className="live__rays" aria-hidden />
      <div className="live__horizon" aria-hidden />

      <div className="live__inner">
        <header className="live__head">
          <div className="live__brand">
            {/* The real mark, not a drawn approximation of it. */}
            <img className="live__mark" src="/assets/logo.png" alt="EdLight" />
            <div>
              <h1 className="live__title">{t('La course des écoles', 'Kous lekòl yo')}</h1>
              <p className="live__subtitle">
                {t(
                  `Chaque école est classée sur ses ${TEAM_SIZE} meilleurs élèves`,
                  `Chak lekòl klase sou ${TEAM_SIZE} pi bon elèv li yo`,
                )}
              </p>
            </div>
          </div>
          <span className="live__onair">
            <span className="live__onair-dot" />
            {t('En direct', 'An dirèk')}
          </span>
        </header>

        <section className="live__lanes" aria-label={t('Classement des écoles', 'Klasman lekòl yo')}>
          {lanes.length === 0 ? (
            Array.from({ length: 5 }, (_, i) => <div key={i} className="live__skeleton" />)
          ) : (
            lanes.map((school, i) => {
              const share = leaderXp > 0 ? Math.max(school.teamXp / leaderXp, 0.04) : 0.04;
              const climbed = school.rankDelta > 0;
              const classes = [
                'live__lane',
                i === 0 ? 'live__lane--leader' : '',
                myKey && school.key === myKey ? 'live__lane--mine' : '',
                climbed ? 'live__lane--climbed' : '',
              ].filter(Boolean).join(' ');

              return (
                <article
                  key={school.key}
                  className={classes}
                  ref={(el) => {
                    if (el) laneEls.current.set(school.key, el);
                    else laneEls.current.delete(school.key);
                  }}
                >
                  {/* A school short of five has rank 0, which is not a
                      position — but a dash where a number should be reads as
                      broken on a stage. It shows where it currently stands,
                      dimmed, and the line under the bar says it is not
                      official yet. */}
                  <div className={`live__rank${school.qualified ? '' : ' live__rank--provisional'}`}>
                    {school.rank || i + 1}
                  </div>

                  <div className="live__school">
                    <div className="live__name">
                      {school.label}
                      {school.rankDelta !== 0 && (
                        <span className={`live__delta live__delta--${climbed ? 'up' : 'down'}`}>
                          {climbed ? '+' : '−'}{Math.abs(school.rankDelta)}
                        </span>
                      )}
                    </div>
                    <div className="live__bar">
                      <div className="live__bar-fill" style={{ width: `${share * 100}%` }} />
                    </div>
                    {!school.qualified && (
                      <div className="live__needed">
                        {t(
                          `Encore ${school.needed} joueur${school.needed > 1 ? 's' : ''} pour se qualifier`,
                          `${school.needed} jwè ankò pou kalifye`,
                        )}
                      </div>
                    )}
                  </div>

                  <LaneScore value={school.teamXp} />
                </article>
              );
            })
          )}
        </section>

        {carriers.length > 0 && (
          <footer className="live__ticker" aria-label={t('Meilleurs élèves', 'Pi bon elèv yo')}>
            <div className="live__ticker-track">
              {carriers.map((p: { id?: string; displayName?: string; school?: string; xp?: number }, i) => (
                <span className="live__ticker-item" key={`${p.id}-${i}`}>
                  <span className="live__ticker-name">{p.displayName}</span>
                  <span className="live__ticker-school">{p.school}</span>
                  <span className="live__ticker-xp">{(p.xp ?? 0).toLocaleString('fr-FR')}</span>
                </span>
              ))}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

/** Exported for the route module to know whether motion is on at all. */
export { prefersReducedMotion };
