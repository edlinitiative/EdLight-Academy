/**
 * SchoolRanking — the schools, ranked, with the student's own highlighted.
 *
 * The Arène is a monthly live event, but the race between schools runs every
 * day on the same all-time board the school scope of the leaderboard uses. So
 * the Arène tab always has something to show: between editions it is this.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useCollectives } from '../hooks/useLeaderboard';
import { normalizeName } from '../../shared/leaderboardAgg';
import './MySchoolCard.css';

const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

export default function SchoolRanking({ max = 10 }: { max?: number }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { profile } = useTrivia();
  const mineKey = profile?.leaderboard?.school ? normalizeName(profile.leaderboard.school) : null;
  const { groups, isLoading } = useCollectives('school', 'all');

  const top = groups.slice(0, max);
  const mine = mineKey ? groups.find((g) => g.key === mineKey) : null;
  const mineOutside = mine && mine.rank > max;

  return (
    <section className="school-rank" aria-labelledby="school-rank-title">
      <div className="school-rank__head">
        <h2 id="school-rank-title">{t('Classement des écoles', 'Klasman lekòl yo')}</h2>
        <Link to="/classement" className="school-rank__all">
          {t('Tout voir', 'Wè tout')} <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {isLoading ? (
        <p className="school-rank__empty">{t('Chargement…', 'N ap chaje…')}</p>
      ) : top.length === 0 ? (
        <p className="school-rank__empty">
          {t('Aucune école classée pour l’instant — la première place est libre.', 'Poko gen lekòl nan klasman an — premye plas la lib.')}
        </p>
      ) : (
        <ol className="school-rank__list">
          {top.map((g) => (
            <li key={g.key} className={g.key === mineKey ? 'is-mine' : undefined}>
              <span className="school-rank__pos">{g.rank}</span>
              <span className="school-rank__name">
                {g.label}
                <small>{g.members} {g.members === 1 ? t('élève', 'elèv') : t('élèves', 'elèv')}</small>
              </span>
              <span className="school-rank__xp">{nf(g.totalXp)} XP</span>
            </li>
          ))}
          {mineOutside && mine && (
            <li className="is-mine school-rank__gap">
              <span className="school-rank__pos">{mine.rank}</span>
              <span className="school-rank__name">
                {mine.label}
                <small>{mine.members} {mine.members === 1 ? t('élève', 'elèv') : t('élèves', 'elèv')}</small>
              </span>
              <span className="school-rank__xp">{nf(mine.totalXp)} XP</span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
