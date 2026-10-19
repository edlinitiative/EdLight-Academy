/**
 * HomeSpotlightCard — the Dashboard's first content card while something
 * time-sensitive is on that the student can act on now: the Arène
 * championship (sign-up open → doors → live) or a tournament they are in that
 * is starting soon or running. One at a time (useHomeSpotlight decides).
 *
 * It replaces ArenaBanner, a plain row under the league/review/exam blocks.
 * Owner feedback (app build 61, same row): "when there is an event this should
 * be the main thing on the page … more colors and animations". Within the
 * no-hero-bands rule it is a CONTENT card, not a band: the Arène night, the
 * championship stage art, coral for the one action, and calm CSS motion
 * (breathing glow, live pulse, a sheen across the button) — all of it off
 * under prefers-reduced-motion, where the card is a complete still frame and
 * only the countdown keeps updating (it is information).
 *
 * Nothing invented: title, date, counts and states are the tournament's own.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from './icons';
import useStore from '../contexts/store';
import ArenaWorld from '../arena-art/environment/ArenaWorld';
import { ARENA_WEB_PLAY } from '../../shared/arena/webPlay';
import { haitiDateTime, spotlightCountdown } from '../../shared/homeSpotlight';
import { useHomeSpotlight, type WebHomeSpotlight } from '../hooks/useHomeSpotlight';
import './HomeSpotlightCard.css';

type T = (fr: string, ht: string) => string;

export interface WebSpotlightCopy {
  eyebrow: string;
  pill: string;
  live: boolean;
  line: string | null;
  countdownLabel: string | null;
  cta: string;
  to: string;
}

/** Pure copy + destination (exported for tests). */
export function webSpotlightCopy(item: WebHomeSpotlight, t: T): WebSpotlightCopy {
  if (item.kind === 'tournoi') {
    const live = item.urgency === 'live';
    return {
      eyebrow: t('Ton tournoi', 'Tounwa ou'),
      pill: live ? t('En direct', 'An dirèk') : t('Bientôt', 'Talè konsa'),
      live,
      line: live ? t('Ton tournoi a commencé. Les autres joueurs t’attendent.', 'Tounwa ou a kòmanse. Lòt jwè yo ap tann ou.') : null,
      countdownLabel: live ? null : t('Début dans', 'Li kòmanse nan'),
      cta: live ? t('Rejoindre maintenant', 'Antre kounye a') : t('Ouvrir le tournoi', 'Louvri tounwa a'),
      to: `/tournois/${encodeURIComponent(item.id)}`,
    };
  }
  const eyebrow = t('Championnat des écoles', 'Chanpyona lekòl yo');
  const countdownLabel = item.countdownKind === 'doors'
    ? t('Fin des inscriptions dans', 'Enskripsyon fèmen nan')
    : item.countdownKind === 'start' ? t('Coup d’envoi dans', 'Li kòmanse nan') : null;
  const play = ARENA_WEB_PLAY ? `/arena/jouer/${encodeURIComponent(item.id)}` : '/direct';
  switch (item.phase) {
    case 'live-play':
      return {
        eyebrow, pill: t('En direct', 'An dirèk'), live: true, countdownLabel: null,
        line: t('La partie est en cours. Ton école compte sur toi.', 'Pati a ap jwe. Lekòl ou konte sou ou.'),
        cta: t('Rejoindre maintenant', 'Antre kounye a'), to: play,
      };
    case 'live-watch':
      return {
        eyebrow, pill: t('En direct', 'An dirèk'), live: true, countdownLabel: null,
        line: t('Le championnat est en cours. Suis ton école en direct.', 'Chanpyona a ap jwe. Swiv lekòl ou an dirèk.'),
        cta: t('Regarder en direct', 'Gade an dirèk'), to: '/direct',
      };
    case 'doors':
      return {
        eyebrow, pill: t('Portes ouvertes', 'Pòt yo louvri'), live: true, countdownLabel,
        line: t('Entre maintenant pour compter parmi les présents.', 'Antre kounye a pou yo konte w prezan.'),
        cta: t('Entrer dans l’Arène', 'Antre nan Arèn nan'), to: '/arena/championnat',
      };
    case 'registered':
      return {
        eyebrow, pill: t('Tu es inscrit', 'Ou enskri'), live: false, countdownLabel,
        line: item.doc.minPlayers > 0
          ? t(`Invite ta classe : il faut ${item.doc.minPlayers} joueurs par école.`, `Envite klas ou : fòk gen ${item.doc.minPlayers} jwè pou chak lekòl.`)
          : t('Invite ta classe pour qualifier ton école.', 'Envite klas ou pou lekòl ou kalifye.'),
        cta: t('Voir mon équipe', 'Wè ekip mwen'), to: '/arena/championnat',
      };
    case 'register':
    default:
      return {
        eyebrow, pill: t('Inscriptions ouvertes', 'Enskripsyon louvri'), live: false, countdownLabel,
        line: null, cta: t('Inscris ton école', 'Enskri lekòl ou'), to: '/arena/championnat',
      };
  }
}

function useSecondClock(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Presentational card (exported for tests). */
export function SpotlightCardView({ item, isCreole }: { item: WebHomeSpotlight; isCreole: boolean }) {
  const t: T = (fr, ht) => (isCreole ? ht : fr);
  const copy = webSpotlightCopy(item, t);
  const now = useSecondClock(item.countdownTo != null);
  const remaining = item.countdownTo != null ? item.countdownTo - now : null;
  const countdown = remaining != null && remaining > 0 ? spotlightCountdown(remaining) : null;
  const when = haitiDateTime(item.startsAt, isCreole);

  const doc = item.kind === 'arena' ? item.doc : null;
  const title = doc && isCreole && doc.titleHt ? doc.titleHt : item.title;
  const schools = doc?.schools ?? 0;
  const players = doc?.players ?? 0;
  const qualified = Math.min(schools, doc?.qualifiedSchools ?? 0);
  const tPlayers = item.kind === 'tournoi' ? item.playerCount : null;

  return (
    <section className={`hs${copy.live ? ' hs--live' : ''}`} aria-label={`${copy.eyebrow} — ${title}`}>
      <div className="hs__art" aria-hidden="true">
        <ArenaWorld occasion={item.kind === 'arena' ? 'championship' : 'match'} layout="wide" />
      </div>
      <span className="hs__glow hs__glow--a" aria-hidden="true" />
      <span className="hs__glow hs__glow--b" aria-hidden="true" />
      <div className="hs__scrim" aria-hidden="true" />

      <div className="hs__inner">
        <div className="hs__top">
          <span className="hs__pill">
            <span className="hs__dot" aria-hidden="true" />
            {copy.pill}
          </span>
          <span className="hs__eyebrow">{copy.eyebrow}</span>
        </div>

        <div className="hs__body">
          <div className="hs__head">
            <h2 className="hs__title">{title}</h2>
            {when ? <p className="hs__when">{when}</p> : null}
            {copy.line ? <p className="hs__line">{copy.line}</p> : null}
          </div>

          {countdown && copy.countdownLabel ? (
            <div className="hs__count" data-testid="hs-countdown">
              <span className="hs__count-label">{copy.countdownLabel}</span>
              <span className="hs__count-value">{countdown}</span>
            </div>
          ) : null}
        </div>

        {schools > 0 ? (
          <div className="hs__progress" data-testid="hs-progress">
            <div className="hs__progress-row">
              <span>
                {schools === 1 ? t('1 école inscrite', '1 lekòl enskri') : t(`${schools} écoles inscrites`, `${schools} lekòl enskri`)}
                {players > 0 ? ` · ${t(`${players} joueurs`, `${players} jwè`)}` : ''}
              </span>
              {qualified > 0 ? (
                <span className="hs__qualified">{t(`${qualified} qualifiée${qualified > 1 ? 's' : ''}`, `${qualified} kalifye`)}</span>
              ) : null}
            </div>
            <div
              className="hs__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={schools}
              aria-valuenow={qualified}
              aria-label={t('Écoles qualifiées', 'Lekòl ki kalifye')}
            >
              <span style={{ width: `${Math.max(4, Math.round((qualified / schools) * 100))}%` }} />
            </div>
          </div>
        ) : tPlayers && tPlayers > 0 ? (
          <p className="hs__line">
            {t(`${tPlayers} joueur${tPlayers > 1 ? 's' : ''} inscrit${tPlayers > 1 ? 's' : ''}`, `${tPlayers} jwè enskri`)}
          </p>
        ) : null}

        <Link to={copy.to} className="hs__cta">
          <span>{copy.cta}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

export default function HomeSpotlightCard() {
  const isCreole = useStore((s: any) => s.language) === 'ht';
  const item = useHomeSpotlight();
  if (!item) return null;
  return <SpotlightCardView item={item} isCreole={isCreole} />;
}
