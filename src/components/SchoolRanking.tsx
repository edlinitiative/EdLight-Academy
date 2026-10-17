/**
 * SchoolRanking — "La course des écoles": the podium, your school, and the
 * bottom of the race.
 *
 * Ted: show the top three schools, and the bottom ones too — a school near the
 * bottom is a reason to play tonight. The bottom list only appears once there
 * are enough schools that it cannot overlap the podium (`raceEnds`), and every
 * figure is the shared best-five race (`useSchoolRace`), so this board, the
 * dashboard card and the Arène never disagree.
 *
 * A school without five players still has a place; it is labelled with how
 * many it has ("3/5"), which is the recruiting message.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from './icons';
import useStore from '../contexts/store';
import { useTriviaProfile } from '../hooks/useTriviaProfile';
import { useSchoolRace } from '../hooks/useSchoolRace';
import { normalizeName, raceEnds, TEAM_SIZE, type RaceStanding } from '../../shared/leaderboardAgg';
import './MySchoolCard.css';

const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

export default function SchoolRanking({ max: _max = 10, showAllLink = true }: { max?: number; showAllLink?: boolean }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const profile = useTriviaProfile();
  const mineKey = profile?.leaderboard?.school ? normalizeName(profile.leaderboard.school) : null;
  const { race, isLoading } = useSchoolRace();

  const { top, bottom } = raceEnds(race);
  const mine = mineKey ? race.find((s) => s.key === mineKey) || null : null;
  const mineShown = !!mine && (top.some((s) => s.key === mine.key) || bottom.some((s) => s.key === mine.key));

  const meta = (s: RaceStanding) => (s.qualified
    ? t(`${s.members} joueurs`, `${s.members} jwè`)
    : t(`${Math.min(s.members, TEAM_SIZE)}/${TEAM_SIZE} joueurs · pas encore qualifiée`, `${Math.min(s.members, TEAM_SIZE)}/${TEAM_SIZE} jwè · poko kalifye`));

  const row = (s: RaceStanding, extra = '') => (
    <li key={s.key} className={`school-rank__row${s.key === mineKey ? ' is-mine' : ''}${extra}`}>
      <span className={`school-rank__pos${s.place <= 3 ? ` school-rank__pos--${s.place}` : ''}`}>{s.place}</span>
      <span className="school-rank__name">
        <span className="school-rank__label">{s.label}{s.key === mineKey && <em>{t('Ton école', 'Lekòl ou')}</em>}</span>
        <small>{meta(s)}</small>
      </span>
      <span className="school-rank__xp">{nf(s.teamXp)} XP</span>
    </li>
  );

  return (
    <section className="school-rank" aria-labelledby="school-rank-title">
      <div className="school-rank__head">
        <h2 id="school-rank-title">{t('La course des écoles', 'Kous lekòl yo')}</h2>
        {showAllLink && (
          <Link to="/classement#ecoles" className="school-rank__all">
            {t('Tout voir', 'Wè tout')} <ChevronRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
      <p className="school-rank__rule">
        {t(`Chaque école compte ses ${TEAM_SIZE} meilleurs joueurs.`, `Chak lekòl konte ${TEAM_SIZE} pi bon jwè li yo.`)}
      </p>

      {isLoading ? (
        <p className="school-rank__empty">{t('Chargement…', 'N ap chaje…')}</p>
      ) : race.length === 0 ? (
        <p className="school-rank__empty">
          {t('Aucune école n’a encore joué — la première place est libre.', 'Poko gen lekòl ki jwe — premye plas la lib.')}
        </p>
      ) : (
        <>
          <ol className="school-rank__list school-rank__list--top" aria-label={t('En tête', 'An tèt')}>
            {top.map((s) => row(s))}
          </ol>

          {mine && !mineShown && (
            <ol className="school-rank__list school-rank__list--mine" aria-label={t('Ton école', 'Lekòl ou')} start={mine.place}>
              {row(mine)}
            </ol>
          )}

          {bottom.length > 0 && (
            <>
              <h3 className="school-rank__sub">{t('En bas de la course', 'Anba nan kous la')}</h3>
              <p className="school-rank__subline">
                {t('Chaque partie jouée par leurs élèves les fait remonter.', 'Chak pati elèv yo jwe fè yo remonte.')}
              </p>
              <ol className="school-rank__list school-rank__list--bottom" aria-label={t('En bas', 'Anba')}>
                {bottom.map((s) => row(s))}
              </ol>
            </>
          )}

          <p className="school-rank__count">
            {t(`${race.length} école${race.length > 1 ? 's' : ''} dans la course`, `${race.length} lekòl nan kous la`)}
          </p>
        </>
      )}
    </section>
  );
}
