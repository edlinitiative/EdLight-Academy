import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import useStore from '../contexts/store';

/**
 * Cours | Pratiquer — the phone's way between the two halves of Apprendre.
 *
 * The bottom bar went from six tabs to the native app's five, and Pratiquer
 * folded into Apprendre. This switch sits at the top of /courses and
 * /practice on phones only (hidden ≥768px, where the top nav has both).
 */
export default function LearnSwitch() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const { pathname } = useLocation();
  const onPractice = /^\/(practice|quizzes)(\/|$)/.test(pathname);
  return (
    <nav className="learn-switch" aria-label={isCreole ? 'Aprann' : 'Apprendre'}>
      <Link to="/courses" className={onPractice ? '' : 'is-on'} aria-current={onPractice ? undefined : 'page'}>
        {isCreole ? 'Kou' : 'Cours'}
      </Link>
      <Link to="/practice" className={onPractice ? 'is-on' : ''} aria-current={onPractice ? 'page' : undefined}>
        {isCreole ? 'Pratike' : 'Pratiquer'}
      </Link>
    </nav>
  );
}
