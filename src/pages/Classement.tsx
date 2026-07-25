/**
 * Classement — the dedicated, full-page leaderboard (route: /classement)
 * ──────────────────────────────────────────────────────────────────────
 * Parity with the mobile LeaderboardScreen: the board gets its own page with a
 * page header instead of being embedded in Profile. Reached from the Dashboard
 * "Classement" panel ("Voir tout") and the Profile entry link. Renders the
 * shared <Leaderboard> in its full form with the week/all period toggle.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import useStore from '../contexts/store';
import Leaderboard from '../components/Leaderboard';

export default function Classement() {
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <button
            className="button button--ghost button--sm"
            onClick={() => navigate(-1)}
            type="button"
            style={{ marginBottom: 12 }}
          >
            <ChevronLeft size={16} /> {t('Retour', 'Tounen')}
          </button>
          <h1 className="page-header__title">{t('Classement', 'Klasman')}</h1>
          <p className="page-header__subtitle">
            {t(
              'Voyez où vous vous situez — national, école, ville et département, cette semaine ou depuis toujours.',
              'Wè kote ou ye — nasyonal, lekòl, vil ak depatman, semèn sa a oswa depi tout tan.',
            )}
          </p>
        </div>

        <Leaderboard variant="full" periodToggle max={50} />
      </div>
    </section>
  );
}
