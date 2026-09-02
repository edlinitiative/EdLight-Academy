import React from 'react';
import { Target, ChevronRight, Lock, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { chapterTestReady, type MasterySummary } from '../../shared/mastery';
import './ChapterTestCard.css';

/**
 * The chapter test entry point — one per unit, at the end of its lesson list.
 *
 * WHY THIS EXISTS AS ITS OWN THING. A chapter test used to be reachable on the
 * web only where someone had authored a `type: 'quiz'` lesson into the course
 * structure, and an audit of production found that had happened in exactly
 * three courses (phys-ns2/3/4). In the other nine — all of Math, all of Econ,
 * chem-ns1 — a lesson could climb to `proficient` and then stop forever, with
 * the next-step chain pointing at a test that did not exist. The quiz bank, on
 * the other hand, has unit-wide questions for every subject (2834 rows, all
 * carrying a unit and lesson number), so nothing needed authoring: the test
 * only needed somewhere to be offered from.
 *
 * It is a UNIT-LEVEL action rather than an extra row in the lesson list on
 * purpose. Adding a lesson would inflate every course's lesson denominator and
 * visibly drop the progress percentage of every student mid-term — and a
 * chapter test isn't a lesson anyway. It's the gate at the end of one.
 *
 * Mirrors the mobile app's unit row (mobile/src/screens/CourseDetailScreen),
 * down to the readiness rule, which is shared so the two can't drift.
 */
export default function ChapterTestCard({ summary, onStart, unitTitle }: {
  /** Mastery across the unit's lessons — decides the gate and the subtitle. */
  summary: MasterySummary;
  onStart: () => void;
  unitTitle?: string;
}) {
  const { t } = useTranslation();
  const ready = chapterTestReady(summary);
  const allMastered = summary.total > 0 && summary.mastered === summary.total;

  // Nothing to say about a unit with no lessons.
  if (!summary || summary.total === 0) return null;

  const subtitle = allMastered
    ? t('courses.chapterTestDone', 'Chapitre maîtrisé — repasse le test quand tu veux')
    : ready
      ? t('courses.chapterTestReady', 'Passe tes leçons au niveau maîtrisé')
      : t('courses.chapterTestLocked', "Fais d'abord les exercices d'une leçon");

  return (
    <button
      type="button"
      className={`chapter-test${ready ? '' : ' chapter-test--locked'}${allMastered ? ' chapter-test--done' : ''}`}
      onClick={onStart}
      disabled={!ready}
      aria-label={
        unitTitle
          ? `${t('courses.chapterTest', 'Test du chapitre')} — ${unitTitle}`
          : t('courses.chapterTest', 'Test du chapitre')
      }
    >
      <span className="chapter-test__icon" aria-hidden="true">
        {allMastered ? <Check size={17} /> : ready ? <Target size={17} /> : <Lock size={15} />}
      </span>
      <span className="chapter-test__body">
        <span className="chapter-test__title">{t('courses.chapterTest', 'Test du chapitre')}</span>
        <span className="chapter-test__sub">{subtitle}</span>
      </span>
      {ready && <ChevronRight className="chapter-test__chevron" size={16} aria-hidden="true" />}
    </button>
  );
}
