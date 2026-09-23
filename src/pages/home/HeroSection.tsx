import React from 'react';
import { TFn, useCatalogSummary } from './content';
import HeroSignup from './HeroSignup';
import { SampleQuestionCard } from './SampleQuestionSection';
import { useSiteHeadlineStats } from '../../hooks/useSiteStats';

const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

/**
 * The landing hero, laid out as Ted's mockup: a bold three-line headline, a
 * two-button call to action, a proof bar — and on the right a real exercise
 * the visitor can answer, in French or Kreyòl, before being asked for
 * anything.
 *
 * Every figure in the proof bar is live (siteStats + the catalogue snapshot).
 * The mockup's "+42 800 exercices / 120+ lycées / 0 Mo" were placeholders and
 * are not reproduced; a figure that has not loaded is simply not shown.
 */
export default function HeroSection({ t }: { t: TFn }) {
  const { activeStudentsThisTerm, exams } = useSiteHeadlineStats();
  const { summary } = useCatalogSummary(t);

  const proof = [
    activeStudentsThisTerm ? { value: `${nf(activeStudentsThisTerm)}+`, label: t('élèves inscrits', 'elèv enskri'), tone: 'azure' } : null,
    exams ? { value: nf(exams), label: t('sujets d’examen officiels', 'sijè egzamen ofisyèl'), tone: 'amber' } : null,
    summary?.lessons ? { value: nf(summary.lessons), label: t('leçons vidéo', 'leson videyo'), tone: 'emerald' } : null,
  ].filter(Boolean) as { value: string; label: string; tone: string }[];

  return (
    <section className="lp-hero lp-hero--bold">
      <div className="lp-hero__glow-a" aria-hidden="true" />
      <div className="lp-hero__glow-b" aria-hidden="true" />
      <div className="lp-container">
        <div className="lp-hero__layout">
          <div className="lp-hero__copy">
            <span className="lp-tag">
              <span className="lp-tag__dot" aria-hidden="true" />
              {t('Programme officiel MENFP · NS I à NS IV', 'Pwogram ofisyèl MENFP · NS I rive NS IV')}
            </span>

            <h1 className="lp-hero__title">
              {t('Réussis ton Bac.', 'Reyisi Bak ou.')}<br />
              {t('Domine tes matières.', 'Metrize matyè ou yo.')}<br />
              <span className="lp-hero__title-accent">{t('Gratuit et bilingue.', 'Gratis ak an de lang.')}</span>
            </h1>

            <p className="lp-hero__lede">
              {t(
                'Des leçons vidéo, des quiz corrigés et les vrais sujets d’examen, sur le programme haïtien — en français et en kreyòl.',
                'Leson videyo, quiz ki korije ak vrè sijè egzamen yo, sou pwogram ayisyen an — an franse ak an kreyòl.',
              )}
            </p>

            <HeroSignup t={t} inline />

            {proof.length > 0 && (
              <dl className="lp-proof">
                {proof.map((p) => (
                  <div key={p.label} className="lp-proof__item">
                    <dd className={`lp-proof__value lp-proof__value--${p.tone}`}>{p.value}</dd>
                    <dt className="lp-proof__label">{p.label}</dt>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="lp-hero__visual lp-hero__visual--quiz">
            <SampleQuestionCard t={t} />
          </div>
        </div>
      </div>
    </section>
  );
}
