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
 * the page says, in words, which one it is and where the other one lives.
 *
 * Nothing here computes or reformats a rank, an XP total or a delta — the board
 * itself (src/components/Leaderboard.tsx) remains the single source of truth,
 * including its loading, empty-with-example and opt-in states.
 *
 * It lives in the Arène's night (Layout + styles/arenaNight.css) and shares
 * its header (ArenaPageHead). No panels: the board sits on the canvas, like
 * the learning side; the practice-XP vs championship distinction is plain
 * text after the board.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Zap } from '../components/icons';
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
          sub={t(
            'Les XP gagnés en jouant, classés chaque semaine — pour toi et pour ton école.',
            'XP ou ranmase lè w ap jwe, klase chak semèn — pou ou ak pou lekòl ou.',
          )}
          actions={<Link to="/jeux" className="an-go"><Zap size={18} aria-hidden="true" /> {t('Gagner des XP', 'Ranmase XP')}</Link>}
        />

        {/* Two columns from 1000px: your standing + the school race on the
            left, the board on the right — without stretching ranking rows
            across 1400px. On a phone the left column simply comes first. */}
        <div className="classement__layout">
          <div className="classement__side">
            <MySchoolCard where="classement" />
            <div id="ecoles" className="classement__race">
              <SchoolRanking showAllLink={false} />
            </div>
          </div>

          <div className="classement__main">
            <Leaderboard variant="full" periodToggle max={50} />
            {/* The weekly turnover, said once, quietly, under the board. */}
            <p className="classement__reset">
              {t(`La semaine se termine dans ${left} — le classement de la semaine repart à zéro lundi.`,
                `Semèn nan fini nan ${left} — klasman semèn nan rekòmanse a zewo lendi.`)}
            </p>

            {/* §6.7 — "Monthly tournament scores must never be visually
                confused with practice XP." Said in words, quietly, after the
                board: this page is practice XP; the championship is separate. */}
            <section className="classement__kinds" aria-labelledby="classement-kinds-title">
              <h2 id="classement-kinds-title" className="classement__sr-only">
                {t('Deux classements différents', 'De klasman diferan')}
              </h2>
              <p className="classement__kind">
                <strong>{t('Ce classement compte les XP de pratique.', 'Klasman sa a konte XP pratik.')}</strong>{' '}
                {t(
                  'Ils viennent des jeux et font monter ton niveau — ils ne donnent droit à aucun prix.',
                  'Yo soti nan jwèt yo epi yo fè nivo ou monte — yo pa bay dwa a okenn pri.',
                )}
              </p>
              <p className="classement__kind">
                <strong>{t('Le championnat interscolaire est à part.', 'Chanpyona ant lekòl yo apa.')}</strong>{' '}
                {t(
                  'Ses scores se jouent en direct, une soirée par mois, et donnent de vrais prix.',
                  'Pwen li yo jwe an dirèk, yon swa chak mwa, epi yo bay vre pri.',
                )}
              </p>
              <Link to="/arena/championnat" className="classement__kind-link">
                {t('Voir le championnat', 'Gade chanpyona a')}
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
