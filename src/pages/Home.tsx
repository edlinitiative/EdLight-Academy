import React from 'react';
import './Home.css';
import { useT } from './home/content';
import HeroSection from './home/HeroSection';
import PillarsSection from './home/PillarsSection';
import CoursesSection from './home/CoursesSection';
import ExperienceSection from './home/ExperienceSection';
import TestimonialsSection from './home/TestimonialsSection';
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
    <div className="lp">
      <HeroSection t={t} />
      <PillarsSection t={t} />
      <CoursesSection t={t} />
      <ExperienceSection t={t} />
      <TestimonialsSection t={t} />
      <CtaSection t={t} />
    </div>
  );
}
