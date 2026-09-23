import React from 'react';
import { School as SchoolIcon, Trophy, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import useStore from '../../contexts/store';
import SchoolRanking from '../../components/SchoolRanking';
import { TFn } from './content';

/**
 * The school race, on the landing page.
 *
 * It replaces "Toujours savoir quoi faire ensuite" — three generic steps and a
 * repeat of the catalogue figures the next section shows anyway. For a
 * student in Haiti the question that makes signing up worth it is not "how
 * does the app work" but "where does MY school stand", so the page shows the
 * real board (the same public ranking /arena uses) and one button: represent
 * your school. Signing up then asks for the school straight away.
 */
export default function SchoolRaceSection({ t }: { t: TFn }) {
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setShowAuthModal = useStore((s) => s.setShowAuthModal);

  const points = [
    { icon: <Trophy size={18} aria-hidden="true" />, text: t('Chaque quiz, jeu et examen rapporte des points à ton école.', 'Chak quiz, jwèt ak egzamen bay lekòl ou pwen.') },
    { icon: <Users size={18} aria-hidden="true" />, text: t('Invite ta classe : plus vous êtes nombreux, plus l’école monte.', 'Envite klas ou : plis nou anpil, plis lekòl la monte.') },
    { icon: <SchoolIcon size={18} aria-hidden="true" />, text: t('Une fois par mois, la finale se joue en direct entre écoles.', 'Yon fwa pa mwa, final la jwe an dirèk ant lekòl yo.') },
  ];

  return (
    <section className="lp-section lp-race">
      <div className="lp-container lp-race__layout">
        <div className="lp-race__copy" data-reveal>
          <span className="lp-tag lp-tag--amber">
            <Trophy size={14} aria-hidden="true" />
            {t('La ligue des écoles', 'Lig lekòl yo')}
          </span>
          <h2 className="lp-section__title">
            {t('Quelle école sera première ce mois-ci ?', 'Ki lekòl ki pral premye mwa sa a ?')}
          </h2>
          <ul className="lp-race__points">
            {points.map((p) => (
              <li key={p.text}>
                <span className="lp-race__icon">{p.icon}</span>
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
          <div className="lp-race__actions">
            <button
              type="button"
              className="lp-btn lp-btn--primary lp-btn--lg"
              onClick={() => { setActiveTab('signup'); setShowAuthModal(true); }}
            >
              <SchoolIcon size={18} aria-hidden="true" />
              {t('Représenter mon école', 'Reprezante lekòl mwen')}
            </button>
            <Link to="/arena" className="lp-btn lp-btn--ghost lp-btn--lg">
              {t('Voir l’Arène', 'Gade Arèn nan')}
            </Link>
          </div>
        </div>
        <div className="lp-race__board" data-reveal>
          <SchoolRanking max={6} />
          {/* The mockup's callout: a missing school is the reason to sign up —
              the sign-in step lets a student add it. */}
          <p className="lp-race__callout">
            <SchoolIcon size={18} aria-hidden="true" />
            <span>{t('Ton école n’apparaît pas encore ?', 'Lekòl ou poko parèt ?')}</span>
            <button type="button" onClick={() => { setActiveTab('signup'); setShowAuthModal(true); }}>
              {t('La faire grimper →', 'Fè l monte →')}
            </button>
          </p>
        </div>
      </div>
    </section>
  );
}
