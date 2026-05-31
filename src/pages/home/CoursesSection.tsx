import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowIcon, getFeatured, subjectThumbs, TFn } from './content';

export default function CoursesSection({ t }: { t: TFn }) {
  const navigate = useNavigate();
  const featured = getFeatured(t);

  return (
    <section className="lp-section lp-courses">
      <div className="lp-container">
        <header className="lp-section__head lp-section__head--row" data-reveal>
          <div>
            <span className="lp-eyebrow lp-eyebrow--muted">{t('Catalogue', 'Katalòg')}</span>
            <h2 className="lp-section__title lp-section__title--sm">{t('Cours phares de la rentrée', 'Kou ki pi enpòtan')}</h2>
          </div>
          <button className="lp-link" onClick={() => navigate('/courses')}>
            {t('Voir tout le catalogue', 'Wè tout katalòg la')}
            <ArrowIcon size={16} />
          </button>
        </header>

        <div className="lp-courses__grid">
          {featured.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className="lp-course"
              data-reveal
              style={{ transitionDelay: `${i * 60}ms` }}
              onClick={() => navigate('/courses')}
              aria-label={`${t('Découvrir', 'Dekouvri')} ${c.name}`}
            >
              <div className="lp-course__media">
                <img src={subjectThumbs[c.subject]} alt={c.name} />
                <span className={`lp-course__badge lp-course__badge--${String(c.subject).toLowerCase()}`}>{c.level}</span>
              </div>
              <div className="lp-course__body">
                <h3 className="lp-course__title">{c.name}</h3>
                <p className="lp-course__desc">{c.desc}</p>
                <div className="lp-course__foot">
                  <span>{c.lessons} {t('leçons', 'leson')}</span>
                  <span className="lp-course__cta">{t('Découvrir →', 'Dekouvri →')}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
