/**
 * Classement — the dedicated, full-page leaderboard (route: /classement)
 * ──────────────────────────────────────────────────────────────────────
 * Parity with the mobile LeaderboardScreen: the board gets its own page with a
 * page header instead of being embedded in Profile. Reached from the Dashboard
 * "Classement" panel ("Voir tout"), the Jeux hub and the Profile entry link.
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
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Swords, Zap } from 'lucide-react';
import useStore from '../contexts/store';
import Leaderboard from '../components/Leaderboard';
import './Classement.css';

export default function Classement() {
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  return (
    <section className="section classement">
      <div className="container classement__container">
        <button
          className="button button--ghost button--sm classement__back"
          onClick={() => navigate(-1)}
          type="button"
        >
          <ChevronLeft size={16} /> {t('Retour', 'Tounen')}
        </button>

        <header className="classement__header">
          <span className="classement__eyebrow">{t('Classement', 'Klasman')}</span>
          <h1 className="classement__title">{t('Où vous situez-vous ?', 'Kote ou ye?')}</h1>
          <p className="classement__lead">
            {t(
              'Les XP gagnés dans les jeux vous classent chaque semaine — au niveau national, et par école, ville et département.',
              'XP ou ranmase nan jwèt yo klase ou chak semèn — nan nivo nasyonal, epi pa lekòl, vil ak depatman.',
            )}
          </p>
        </header>

        {/* §6.7 — "Monthly tournament scores must never be visually confused
            with practice XP." Two named lanes, each with its own icon and
            colour, so the difference is carried by text first and colour
            second. The championship lane leaves for the app: Arena gameplay
            and registration are mobile-only (see the /arena route in App.tsx). */}
        <section className="classement__kinds" aria-labelledby="classement-kinds-title">
          <h2 id="classement-kinds-title" className="classement__sr-only">
            {t('Deux classements différents', 'De klasman diferan')}
          </h2>

          <div className="classement__kind classement__kind--xp">
            <span className="classement__kind-icon" aria-hidden="true">
              <Zap size={17} />
            </span>
            <div className="classement__kind-body">
              <p className="classement__kind-label">
                {t('XP de pratique', 'XP pratik')}
                <span className="classement__kind-here">{t('cette page', 'paj sa a')}</span>
              </p>
              <p className="classement__kind-text">
                {t(
                  'Les XP viennent des jeux. Ils font monter votre niveau et votre classement — ils ne donnent droit à aucun prix.',
                  'XP yo soti nan jwèt yo. Yo fè nivo ou ak klasman ou monte — yo pa bay dwa a okenn pri.',
                )}
              </p>
            </div>
          </div>

          <div className="classement__kind classement__kind--cup">
            <span className="classement__kind-icon" aria-hidden="true">
              <Swords size={17} />
            </span>
            <div className="classement__kind-body">
              <p className="classement__kind-label">
                {t('Championnat interscolaire', 'Chanpyona ant lekòl yo')}
              </p>
              <p className="classement__kind-text">
                {t(
                  'Ses scores sont comptés séparément et donnent de vrais prix. Inscription ici, participation dans l’application.',
                  'Pwen li yo konte apa epi yo bay vre pri. Enskri isit la, jwe nan aplikasyon an.',
                )}
              </p>
              {/* /arena, like every other championship entry point: the page
                  that explains the event and takes a registration, rather than
                  a QR code with no way back. */}
              <Link to="/arena" className="classement__kind-link">
                {t('Voir le championnat', 'Gade chanpyona a')}
                <ChevronRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <Leaderboard variant="full" periodToggle max={50} />

        <p className="classement__foot">
          <Link to="/jeux" className="classement__foot-link">
            {t('Jouer une partie pour gagner des XP', 'Jwe yon pati pou ranmase XP')}
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </p>
      </div>
    </section>
  );
}
