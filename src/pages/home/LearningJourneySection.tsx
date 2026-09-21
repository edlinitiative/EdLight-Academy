import React from 'react';
import { BookOpen, Brain, CheckCircle2, ChevronRight, PlayCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TFn } from './content';

export default function LearningJourneySection({ t }: { t: TFn }) {
  const navigate = useNavigate();

  const steps = [
    {
      icon: <BookOpen size={21} aria-hidden="true" />,
      number: '01',
      title: t('Apprenez avec un cap clair', 'Aprann ak yon objektif klè'),
      body: t(
        'Choisissez votre niveau et reprenez directement la leçon où vous vous êtes arrêté.',
        'Chwazi nivo ou epi kontinye dirèkteman nan leson kote ou te rete a.',
      ),
    },
    {
      icon: <Brain size={21} aria-hidden="true" />,
      number: '02',
      title: t('Pratiquez selon votre besoin', 'Pratike selon bezwen ou'),
      body: t(
        'Quiz courts, révision des erreurs ou examen blanc : chaque format a un objectif distinct.',
        'Quiz kout, revizyon erè oswa egzamen blan: chak fòma gen yon objektif diferan.',
      ),
    },
    {
      icon: <CheckCircle2 size={21} aria-hidden="true" />,
      number: '03',
      title: t('Transformez le résultat en action', 'Transfòme rezilta a an aksyon'),
      body: t(
        'Voyez ce qui est acquis, ce qui mérite une révision et la meilleure suite possible.',
        'Wè sa ou metrize, sa pou revize ak pi bon sa pou fè apre.',
      ),
    },
  ];

  return (
    <section className="lp-section lp-journey">
      <div className="lp-container">
        <div className="lp-journey__intro" data-reveal>
          <div>
            <span className="lp-eyebrow">
              <span className="lp-eyebrow__dot" />
              {t('Un parcours, pas un catalogue', 'Yon chemen, pa yon katalòg')}
            </span>
            <h2 className="lp-section__title">
              {t('Toujours savoir ', 'Toujou konnen ')}
              <span className="lp-text-accent">{t('quoi faire ensuite.', 'sa pou fè apre.')}</span>
            </h2>
          </div>
          <p className="lp-section__lede">
            {t(
              'EdLight relie les cours, la pratique et la révision pour éviter de vous laisser seul face à une grille de contenus.',
              'EdLight konekte kou, pratik ak revizyon pou li pa kite w poukont ou devan yon lis kontni.',
            )}
          </p>
        </div>

        <div className="lp-journey__layout">
          <ol className="lp-journey__steps">
            {steps.map((step) => (
              <li key={step.number} className="lp-journey-step" data-reveal>
                <span className="lp-journey-step__number">{step.number}</span>
                <span className="lp-journey-step__icon">{step.icon}</span>
                <span>
                  <strong>{step.title}</strong>
                  <span>{step.body}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="lp-product-preview" data-reveal aria-label={t('Aperçu du parcours étudiant', 'Apèsi chemen elèv la')}>
            <div className="lp-product-preview__top">
              <span>{t('Votre prochaine étape', 'Pwochen etap ou')}</span>
              <span className="lp-product-preview__status">{t('Synchronisé', 'Senkronize')}</span>
            </div>
            <div className="lp-product-preview__focus">
              <span className="lp-product-preview__subject">{t('Continuer le cours', 'Kontinye kou a')}</span>
              <strong>{t('Reprenez exactement où vous étiez', 'Kontinye egzakteman kote ou te rete')}</strong>
              <span className="lp-product-preview__line"><span /></span>
              <button type="button" onClick={() => navigate('/courses')}>
                <PlayCircle size={18} aria-hidden="true" />
                {t('Voir les cours', 'Gade kou yo')}
              </button>
            </div>
            <button className="lp-product-preview__row" type="button" onClick={() => navigate('/revision')}>
              <Brain size={20} aria-hidden="true" />
              <span>
                <strong>{t('Réviser mes erreurs', 'Revize erè mwen yo')}</strong>
                <small>{t('Une session ciblée à partir de vos réponses', 'Yon sesyon vize apati repons ou yo')}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
