/**
 * Classement — the dedicated, full-page leaderboard (route: /classement)
 * ──────────────────────────────────────────────────────────────────────
 * Parity with the mobile LeaderboardScreen: the board gets its own page with a
 * page header instead of being embedded in Profile. Reached from the Dashboard
 * "Classement" panel ("Voir tout"), the Jeux hub, the Arène and the Profile.
 * Renders the shared <Leaderboard> in its full form with the week/all toggle.
 *
 * The page's own job (redesign plan §6.7) is LABELLING, not ranking: it must be
 * impossible to mistake these practice-XP boards for the inter-school
 * championship, which awards real prizes and keeps its own separate scores. So
 * the two are put side by side, named, and only one of them is this page.
 *
 * Nothing here computes or reformats a rank, an XP total or a delta — the board
 * itself (src/components/Leaderboard.tsx) remains the single source of truth,
 * including its loading, empty-with-example and opt-in states.
 *
 * It lives in the Arène's night (Layout + styles/arenaNight.css) and shares
 * its header (ArenaPageHead).
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Swords, Zap } from '../components/icons';
import useStore from '../contexts/store';
import Leaderboard from '../components/Leaderboard';
import MySchoolCard from '../components/MySchoolCard';
import SchoolRanking from '../components/SchoolRanking';
import ArenaPageHead from '../components/arena/ArenaPageHead';
import './Classement.css';

/** Time left until the weekly board turns over (Monday 00:00, device time — as weekId keys it). */
export function untilWeekReset(now = new Date()): { days: number; hours: number } {
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  const daysToMonday = ((8 - next.getDay()) % 7) || 7;
  next.setDate(next.getDate() + daysToMonday);
  const ms = Math.max(0, next.getTime() - now.getTime());
  return { days: Math.floor(ms / 86_400_000), hours: Math.floor((ms % 86_400_000) / 3_600_000) };
}

export default function Classement() {
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const { days, hours } = untilWeekReset();
  const left = days > 0
    ? t(`${days} j ${hours} h`, `${days} j ${hours} è`)
    : hours > 0 ? t(`${hours} h`, `${hours} è`) : t('moins d’une heure', 'mwens pase inèdtan');

  return (
    <section className="section classement">
      <div className="container classement__container">
        <ArenaPageHead
          title={t('Classement', 'Klasman')}
          actions={<Link to="/jeux" className="an-go"><Zap size={18} aria-hidden="true" /> {t('Gagner des XP', 'Ranmase XP')}</Link>}
        />

        {/* Two columns from 1000px: the explanation on the left, the board on
            the right — without stretching ranking rows across 1400px. */}
        <div className="classement__layout">
          <div className="classement__side">
            <MySchoolCard where="classement" />
            <div id="ecoles" className="classement__race">
              <SchoolRanking showAllLink={false} />
            </div>

            {/* §6.7 — "Monthly tournament scores must never be visually
                confused with practice XP." Two named lanes, each with its own
                icon and colour, so the difference is carried by text first and
                colour second. */}
            <section className="classement__kinds" aria-labelledby="classement-kinds-title">
              <h2 id="classement-kinds-title" className="classement__sr-only">
                {t('Deux classements différents', 'De klasman diferan')}
              </h2>

              <div className="classement__kind classement__kind--xp an-panel">
                <span className="classement__kind-icon" aria-hidden="true">
                  <Zap size={20} />
                </span>
                <div className="classement__kind-body">
                  <p className="classement__kind-label">
                    {t('XP de pratique', 'XP pratik')}
                    <span className="classement__kind-here">{t('cette page', 'paj sa a')}</span>
                  </p>
                  <p className="classement__kind-text">
                    {t(
                      'Les XP viennent des jeux. Ils font monter ton niveau et ton classement — ils ne donnent droit à aucun prix.',
                      'XP yo soti nan jwèt yo. Yo fè nivo ou ak klasman ou monte — yo pa bay dwa a okenn pri.',
                    )}
                  </p>
                </div>
              </div>

              <div className="classement__kind classement__kind--cup an-panel an-panel--edge">
                <span className="classement__kind-icon" aria-hidden="true">
                  <Swords size={20} />
                </span>
                <div className="classement__kind-body">
                  <p className="classement__kind-label">
                    {t('Championnat interscolaire', 'Chanpyona ant lekòl yo')}
                  </p>
                  <p className="classement__kind-text">
                    {t(
                      'Ses scores sont comptés à part, une soirée par mois, en direct — et donnent de vrais prix.',
                      'Pwen li yo konte apa, yon swa chak mwa, an dirèk — epi yo bay vre pri.',
                    )}
                  </p>
                  <Link to="/arena/championnat" className="classement__kind-link">
                    {t('Voir le championnat', 'Gade chanpyona a')}
                    <ChevronRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </section>
          </div>

          <div className="classement__main an-panel">
            <p className="classement__reset">
              {t(`La semaine se termine dans ${left} — le classement de la semaine repart à zéro lundi.`,
                `Semèn nan fini nan ${left} — klasman semèn nan rekòmanse a zewo lendi.`)}
            </p>
            <Leaderboard variant="full" periodToggle max={50} />
          </div>
        </div>
      </div>
    </section>
  );
}
