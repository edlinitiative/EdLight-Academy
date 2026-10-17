import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, RotateCcw } from '../../icons';
import { evidenceLabel, trackJourney } from '../../../utils/learningJourney';
import useStore from '../../../contexts/store';
import type { SummaryRow } from './ProgressSummary';

/**
 * PhoneGlance — the phone's answer to the desktop sidebar (audit 2026-10-17,
 * finding #5). On a phone the sidebar falls below the whole subject list, so
 * review and progress — half of the learning loop — were a long scroll away.
 *
 * Right under the continuation it shows, compactly and from the same data the
 * sidebar uses:
 *   1. the due-review entry, with the real count (or an honest "nothing due",
 *      "loading" or "could not load" — never a made-up 0);
 *   2. a progress summary: one line per course worked in, completed over the
 *      real total, with a thin bar.
 * Then the page continues with the (compact) subject collection.
 *
 * Phone only (≤ 720px, journeyHome.css); desktop keeps its sidebar. The two
 * sidebar cards are hidden on phone instead, so nothing is said twice.
 * Secondary styling throughout: the continuation keeps the one primary.
 */

type Props = {
  /** Due review questions; null while loading, 'failed' when unreadable. */
  due: number | null | 'failed';
  /** Where the due questions come from, already named for students. */
  dueFrom: string[];
  onRetryReview: () => void;
  rows: SummaryRow[];
  progressLoading: boolean;
  progressFailed: boolean;
  subjectName: (code: string) => string;
  levelLabel: (lv: string) => string;
  courseLevel: (c: any) => string;
  L: (fr: string, ht: string) => string;
};

export default function PhoneGlance({
  due, dueFrom, onRetryReview, rows, progressLoading, progressFailed, subjectName, levelLabel, courseLevel, L,
}: Props) {
  const isCreole = useStore((s) => s.language) === 'ht';
  const completedWord = (n: number) => {
    const w = evidenceLabel('completed', isCreole).toLowerCase();
    return !isCreole && n > 1 ? `${w}s` : w;
  };

  let review: React.ReactNode;
  if (due === null) {
    review = (
      <div className="jh-glance__row jh-glance__row--static" role="status">
        <span className="jh-glance__icon" aria-hidden="true"><RotateCcw size={18} /></span>
        <span className="jh-glance__text"><strong>{L('À revoir', 'Pou revize')}</strong><span>{L('Chargement…', 'N ap chaje…')}</span></span>
      </div>
    );
  } else if (due === 'failed') {
    review = (
      <div className="jh-glance__row jh-glance__row--static">
        <span className="jh-glance__icon" aria-hidden="true"><RotateCcw size={18} /></span>
        <span className="jh-glance__text"><strong>{L('À revoir', 'Pou revize')}</strong><span>{L('La liste n’a pas pu se charger.', 'Lis la pa t ka chaje.')}</span></span>
        <button type="button" className="jh-glance__retry" onClick={onRetryReview}>{L('Réessayer', 'Eseye ankò')}</button>
      </div>
    );
  } else if (due === 0) {
    review = (
      <div className="jh-glance__row jh-glance__row--static">
        <span className="jh-glance__icon" aria-hidden="true"><RotateCcw size={18} /></span>
        <span className="jh-glance__text"><strong>{L('Rien à revoir', 'Anyen pou revize')}</strong><span>{L('Une question manquée reviendra ici.', 'Yon kesyon ou rate ap tounen isit la.')}</span></span>
      </div>
    );
  } else {
    review = (
      <Link
        to="/revision"
        className="jh-glance__row"
        onClick={() => trackJourney('learning_next_action_selected', { source: 'home_phone', action: 'review', due })}
      >
        <span className="jh-glance__icon jh-glance__icon--due" aria-hidden="true"><RotateCcw size={18} /></span>
        <span className="jh-glance__text">
          <strong>{L(`${due} question${due > 1 ? 's' : ''} à revoir`, `${due} kesyon pou revize`)}</strong>
          {dueFrom.length > 0 && <span>{dueFrom.join(' · ')}</span>}
        </span>
        <ChevronRight size={18} aria-hidden="true" className="jh-glance__chev" />
      </Link>
    );
  }

  let progress: React.ReactNode;
  if (progressLoading) {
    progress = <p className="jh-glance__muted" role="status">{L('Chargement…', 'N ap chaje…')}</p>;
  } else if (progressFailed) {
    progress = <p className="jh-glance__muted">{L('Ta progression s’affichera quand les cours seront chargés.', 'Pwogrè ou ap parèt lè kou yo chaje.')}</p>;
  } else if (rows.length === 0) {
    progress = <p className="jh-glance__muted">{L('Ta progression apparaîtra ici dès ta première leçon.', 'Pwogrè ou ap parèt isit la depi premye leson ou.')}</p>;
  } else {
    progress = (
      <ul className="jh-glance__prog">
        {rows.slice(0, 3).map(({ course, summary: s }) => {
          const name = `${subjectName(course.subject)} ${levelLabel(courseLevel(course))}`;
          const pct = s.total ? Math.round((s.completed / s.total) * 100) : 0;
          const facts = L(`${s.completed}/${s.total} ${completedWord(s.completed)}`, `${s.completed}/${s.total} ${completedWord(s.completed)}`);
          return (
            <li key={s.courseId}>
              <Link to={`/courses/${course.id}`} className="jh-glance__course">
                <span className="jh-glance__course-top">
                  <strong>{name}</strong>
                  <span>{facts}</span>
                </span>
                <span className="jh-prog__bar" role="img" aria-label={L(`${name} : ${s.completed} leçons terminées sur ${s.total}`, `${name} : ${s.completed} leson fini sou ${s.total}`)}>
                  <span className="jh-prog__fill" style={{ width: `${pct}%` }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="jh-glance" aria-labelledby="jh-glance-title">
      <h2 id="jh-glance-title" className="jh-sr">{L('Révision et progression', 'Revizyon ak pwogrè')}</h2>
      {review}
      <div className="jh-glance__block">
        <p className="jh-glance__label">{L('Ta progression', 'Pwogrè ou')}</p>
        {progress}
      </div>
    </section>
  );
}
