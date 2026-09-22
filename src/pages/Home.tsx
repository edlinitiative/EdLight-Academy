import React from 'react';
/* The shared page visual language (tone variables, card, tile, pill, meter).
   `pf` goes on the outermost element below because that is where it declares
   them. Home.css composes on top of it. */
import '../styles/pf.css';
import './Home.css';
import { useT } from './home/content';
import ResumeBanner from '../components/ResumeBanner';
import HeroSection from './home/HeroSection';
import SampleQuestionSection from './home/SampleQuestionSection';
import LearningJourneySection from './home/LearningJourneySection';
import CoursesSection from './home/CoursesSection';
import CtaSection from './home/CtaSection';

/**
 * Marketing landing page.
 *
 * Composed of independent, self-contained sections under `./home/*`.
 * The bilingual `t` helper is resolved once here and threaded down so every
 * section stays in sync with the active language. Scroll-reveal animations are
 * handled globally by Layout via the `data-reveal` attribute.
 */
export default function Home() {
  const t = useT();

  return (
    <div className="lp pf">
      <HeroSection t={t} />
      <div className="container resume-banner-wrap">
        <ResumeBanner />
      </div>
      {/* Before the pitch, not after it: the fastest way to answer "is this
          for me, and is it really in Kreyòl" is to hand over the thing. */}
      <SampleQuestionSection t={t} />
      <LearningJourneySection t={t} />
      <CoursesSection t={t} />
      <CtaSection t={t} />
    </div>
  );
}
