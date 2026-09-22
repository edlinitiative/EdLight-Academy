import React from 'react';
import { Calculator, FlaskConical, Lock, TrendingUp, Zap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowIcon, CatalogSubject, SubjectCode, TFn, useCatalogSummary } from './content';

/* The mockups open every row with a pastel icon tile. One tone per subject,
   all six drawn from pf's tone axis — no new hue enters the app. */
const SUBJECT_TILE: Record<SubjectCode, { tone: string; icon: React.ReactNode }> = {
  ECON: { tone: 'emerald', icon: <TrendingUp size={24} /> },
  MATH: { tone: 'azure', icon: <Calculator size={24} /> },
  CHEM: { tone: 'violet', icon: <FlaskConical size={24} /> },
  PHYS: { tone: 'amber', icon: <Zap size={24} /> },
};

/** One subject: its real levels, its real lesson count, its real units. */
function SubjectRow({ subject, t }: { subject: CatalogSubject; t: TFn }) {
  const openLevels = subject.levels.filter((l) => !l.comingSoon).length;
  const tile = SUBJECT_TILE[subject.code];

  return (
    <li className="lp-subject" data-reveal>
      <span className={`pf-tile pf-tile--${tile.tone} lp-tile lp-tile--48`} aria-hidden="true">
        {tile.icon}
      </span>

      <div className="lp-subject__body">
        <div className="lp-subject__head">
          <h3 className="lp-subject__name">{subject.name}</h3>
          <p className={`lp-subject__meta${subject.comingSoon ? ' lp-subject__meta--soon' : ''}`}>
            {subject.comingSoon
              ? t('En préparation', 'N ap prepare l')
              : t(
                  // French marks the plural; Kreyòl does not.
                  `${subject.lessons} leçon${subject.lessons > 1 ? 's' : ''} · ${openLevels} niveau${openLevels > 1 ? 'x' : ''}`,
                  `${subject.lessons} leson · ${openLevels} nivo`,
                )}
          </p>
        </div>

        {subject.units.length > 0 && (
          <p className="lp-subject__units">{subject.units.join(' · ')}</p>
        )}
      </div>

      <ul className="lp-subject__levels">
        {subject.levels.map((level) =>
          level.comingSoon ? (
            <li key={level.id}>
              <span className="lp-level lp-level--soon">
                {level.label}
                <small>
                  <Lock size={9} aria-hidden="true" /> {t('bientôt', 'talè')}
                </small>
              </span>
            </li>
          ) : (
            <li key={level.id}>
              <Link className="lp-level" to={`/courses/${level.id}`}>
                {level.label}
                <small>
                  {level.lessons}{' '}
                  {level.lessons > 1 ? t('leçons', 'leson') : t('leçon', 'leson')}
                </small>
              </Link>
            </li>
          ),
        )}
      </ul>
    </li>
  );
}

/**
 * The catalogue, stated rather than illustrated.
 *
 * Previously four equal-weight image cards with hand-written lesson counts,
 * all four linking to the same `/courses` page. Now one open section of
 * compact subject rows read from the catalogue snapshot (§7: compact rows over
 * repeated cards), where every number is the catalogue's own and every level
 * links to that actual course. Levels not yet open say so instead of being
 * quietly counted in.
 */
export default function CoursesSection({ t }: { t: TFn }) {
  const navigate = useNavigate();
  const { summary, isLoading, isError, isEmpty } = useCatalogSummary(t);

  return (
    <section className="lp-section lp-courses">
      <div className="lp-container">
        <header className="lp-section__head lp-section__head--row" data-reveal>
          <div>
            <span className="lp-eyebrow">
              <span className="lp-eyebrow__dot" aria-hidden="true" />
              {t('Le programme', 'Pwogram lan')}
            </span>
            <h2 className="lp-section__title lp-section__title--sm">
              {t('Quatre matières, du NS I au NS IV', 'Kat matyè, soti NS I rive NS IV')}
            </h2>
            <p className="lp-section__lede">
              {t(
                'Des leçons en vidéo, des quiz et des examens blancs, sur le programme du Nouveau Secondaire. L’application est en français et en créole.',
                'Leson an videyo, quiz ak egzamen blan, sou pwogram Nouvo Segondè a. Aplikasyon an an franse ak an kreyòl.',
              )}
            </p>
          </div>
          <button className="lp-link" onClick={() => navigate('/courses')}>
            {t('Voir tout le catalogue', 'Wè tout katalòg la')}
            <ArrowIcon size={16} />
          </button>
        </header>

        {/* §8: loading keeps the section's meaning; a failure says what
            happened and still offers the catalogue. */}
        {isLoading && (
          <p className="lp-subjects__note" role="status">
            {t('Chargement du programme…', 'N ap chaje pwogram lan…')}
          </p>
        )}

        {(isError || isEmpty) && (
          <p className="lp-subjects__note">
            {t(
              'Le détail du programme n’a pas pu être chargé. Le catalogue complet reste accessible.',
              'Nou pa t ka chaje detay pwogram lan. Tout katalòg la toujou disponib.',
            )}{' '}
            <Link className="lp-link lp-link--inline" to="/courses">
              {t('Ouvrir le catalogue', 'Louvri katalòg la')}
            </Link>
          </p>
        )}

        {summary && (
          <ul className="lp-subjects">
            {summary.subjects.map((subject) => (
              <SubjectRow key={subject.code} subject={subject} t={t} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
