import React from 'react';
import { BadgeCheck, BookOpen, Brain, CheckCircle2 } from 'lucide-react';
import { TFn, useCatalogSummary } from './content';

export default function LearningJourneySection({ t }: { t: TFn }) {
  const { summary, isLoading } = useCatalogSummary(t);

  const steps = [
    {
      icon: <BookOpen size={22} aria-hidden="true" />,
      tone: 'azure',
      number: '01',
      step: t('Étape 1', 'Etap 1'),
      title: t('Apprenez avec un cap clair', 'Aprann ak yon objektif klè'),
      body: t(
        'Choisissez votre niveau et reprenez directement la leçon où vous vous êtes arrêté.',
        'Chwazi nivo ou epi kontinye dirèkteman nan leson kote ou te rete a.',
      ),
    },
    {
      icon: <Brain size={22} aria-hidden="true" />,
      tone: 'violet',
      number: '02',
      step: t('Étape 2', 'Etap 2'),
      title: t('Pratiquez selon votre besoin', 'Pratike selon bezwen ou'),
      body: t(
        'Quiz courts, révision des erreurs ou examen blanc : chaque format a un objectif distinct.',
        'Quiz kout, revizyon erè oswa egzamen blan: chak fòma gen yon objektif diferan.',
      ),
    },
    {
      icon: <CheckCircle2 size={22} aria-hidden="true" />,
      tone: 'emerald',
      number: '03',
      step: t('Étape 3', 'Etap 3'),
      title: t('Transformez le résultat en action', 'Transfòme rezilta a an aksyon'),
      body: t(
        'Voyez ce qui est acquis, ce qui mérite une révision et la meilleure suite possible.',
        'Wè sa ou metrize, sa pou revize ak pi bon sa pou fè apre.',
      ),
    },
  ];

  /* What the panel used to be: a mock app screenshot with a "Synchronisé"
     badge, a half-filled progress bar and "Reprenez exactement où vous étiez"
     — a student's progress invented for a visitor who has none (§3), under a
     heading the closing section already used word for word (§13). It is now
     the catalogue's own totals: the useful context a wide layout should carry,
     and nothing a visitor cannot verify by opening /courses. */
  const facts = summary
    ? [
        {
          value: String(summary.lessons),
          label: t('leçons vidéo disponibles', 'leson videyo disponib'),
        },
        {
          value: String(summary.courses),
          label: t('cours ouverts', 'kou ki louvri'),
        },
        {
          value: String(summary.subjects.length),
          label: t('matières', 'matyè'),
        },
        {
          value: 'NS I–IV',
          label: t('niveaux du Nouveau Secondaire', 'nivo Nouvo Segondè'),
        },
      ]
    : [];

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
              {t('Toujours savoir quoi faire ensuite.', 'Toujou konnen sa pou fè apre.')}
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
                <span className="lp-journey-step__rail">
                  <span className="lp-journey-step__number">{step.number}</span>
                  <span
                    className={`pf-tile pf-tile--${step.tone} pf-tile--md`}
                    aria-hidden="true"
                  >
                    {step.icon}
                  </span>
                </span>
                <span className="lp-journey-step__body">
                  <span className="lp-journey-step__head">
                    <strong className="lp-journey-step__title">{step.title}</strong>
                    <span className={`pf-pill pf-pill--${step.tone}`}>{step.step}</span>
                  </span>
                  <span className="lp-journey-step__text">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>

          <aside className="lp-facts" data-reveal>
            <div className="lp-facts__head">
              <h3 className="lp-facts__title">
                {t('Dans le catalogue aujourd’hui', 'Nan katalòg la jodi a')}
              </h3>
              <span className="lp-facts__live" aria-hidden="true" />
            </div>
            {facts.length > 0 ? (
              <dl className="lp-facts__list">
                {facts.map((fact) => (
                  <div key={fact.label} className="lp-facts__item">
                    <dt className="lp-facts__value">{fact.value}</dt>
                    <dd className="lp-facts__label">{fact.label}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="lp-facts__note" role={isLoading ? 'status' : undefined}>
                {isLoading
                  ? t('Chargement du catalogue…', 'N ap chaje katalòg la…')
                  : t(
                      'Les chiffres du catalogue n’ont pas pu être chargés.',
                      'Nou pa t ka chaje chif katalòg la.',
                    )}
              </p>
            )}
            <p className="lp-facts__foot">
              <span className="pf-tile pf-tile--amber pf-tile--sm" aria-hidden="true">
                <BadgeCheck size={16} />
              </span>
              {t(
                'Et les annales du Bac haïtien, corrigées question par question.',
                'Ak ansyen egzamen Bak ayisyen an, korije kesyon pa kesyon.',
              )}
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
