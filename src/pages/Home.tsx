import React from 'react';
/* The shared page visual language (tone variables, card, tile, pill, meter).
   `pf` goes on the outermost element below because that is where it declares
   them. Home.css composes on top of it. */
import '../styles/pf.css';
import './Home.css';
import { useT } from './home/content';
import ResumeBanner from '../components/ResumeBanner';
import ExamCountdown from '../components/ExamCountdown';
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
      {/* The countdown is scoped to the learner, not to the session: it shows
          only when the store knows a grade that actually sits an exam, and
          ExamCountdown returns null otherwise, so this wrapper collapses to an
          empty div for everyone else.

          It is deliberately NOT gated on `isAuthenticated`. This page renders
          only for signed-out visitors — HomeRoute sends authenticated learners
          to Dashboard instead — so an auth gate here would be unreachable code,
          which is the same "built and pointed at by nothing" failure this card
          exists to undo. The grade picker runs before sign-up, so a signed-out
          visitor who has told us their year is exactly the person with an exam
          to count down to. (The signed-in surface is Dashboard.tsx, outside
          this change.)

          Above the resume banner because it is the frame — the horizon being
          worked towards — and the banner is the next step inside it. */}
      <div className="lp-container lp-exam-countdown">
        <ExamCountdown />
      </div>
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
