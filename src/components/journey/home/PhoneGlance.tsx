import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from '../../icons';
import { trackJourney } from '../../../utils/learningJourney';
import useStore from '../../../contexts/store';
import { factsLine, type SummaryRow } from './ProgressSummary';

/**
 * PhoneGlance — the phone's answer to the desktop sidebar (audit 2026-10-17,
 * finding #5). On a phone the sidebar falls below the whole subject list, so
 * review and progress — half of the learning loop — were a long scroll away.
 *
 * Right under the continuation it shows, compactly and from the same data the
 * sidebar uses:
 *   1. "À revoir": the due-review entry with the real count and where it
 *      comes from (or an honest "loading" / "could not load"); hidden when
 *      nothing is due, like the desktop card;
 *   2. "Ta progression": the desktop rows (name, bar, evidence facts over the
 *      real total); hidden until there is evidence — a new student sees no
 *      zeroes.
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

  // Review: hidden when nothing is due (the desktop card is hidden too); the
  // honest loading / could-not-load states still show, never a made-up 0.
  let review: React.ReactNode = null;
  if (due === null) {
    review = <p className="jh-glance__muted" role="status">{L('Chargement…', 'N ap chaje…')}</p>;
  } else if (due === 'failed') {
    review = (
      <div className="jh-glance__fail">
        <p className="jh-glance__muted">{L('La liste n’a pas pu se charger.', 'Lis la pa t ka chaje.')}</p>
        <button type="button" className="jh-glance__retry" onClick={onRetryReview}>{L('Réessayer', 'Eseye ankò')}</button>
      </div>
    );
  } else if (due > 0) {
    review = (
      <Link
        to="/revision"
        className="jh-glance__row"
        onClick={() => trackJourney('learning_next_action_selected', { source: 'home_phone', action: 'review', due })}
      >
        <span className="jh-glance__text">
          <strong>{L(`${due} question${due > 1 ? 's' : ''} à revoir`, `${due} kesyon pou revize`)}</strong>
          {dueFrom.length > 0 && <span>{dueFrom.join(' · ')}</span>}
        </span>
        <ChevronRight size={20} aria-hidden="true" className="jh-glance__chev" />
      </Link>
    );
  }

  // Progress: hidden until there is evidence (no zeroes for a new student).
  let progress: React.ReactNode = null;
  if (progressLoading) {
    progress = <p className="jh-glance__muted" role="status">{L('Chargement…', 'N ap chaje…')}</p>;
  } else if (progressFailed) {
    progress = <p className="jh-glance__muted">{L('Ta progression s’affichera quand les cours seront chargés.', 'Pwogrè ou ap parèt lè kou yo chaje.')}</p>;
  } else if (rows.length > 0) {
    progress = (
      <ul className="jh-prog__list">
        {rows.slice(0, 3).map(({ course, summary: s }) => {
          const name = `${subjectName(course.subject)} ${levelLabel(courseLevel(course))}`;
          const pct = s.total ? Math.round((s.completed / s.total) * 100) : 0;
          return (
            <li key={s.courseId}>
              <Link to={`/courses/${course.id}`} className="jh-prog__row jh-glance__course">
                <strong className="jh-prog__name">{name}</strong>
                <span className="jh-prog__bar" role="img" aria-label={L(`${name} : ${s.completed} leçons terminées sur ${s.total}`, `${name} : ${s.completed} leson fini sou ${s.total}`)}>
                  <span className="jh-prog__fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="jh-prog__facts">{factsLine(s, isCreole)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  if (!review && !progress) return null;
  return (
    <div className="jh-glance">
      {review && (
        <section className="jh-card jh-glance__card" aria-labelledby="jh-glance-review">
          <h2 id="jh-glance-review" className="jh-card__title">{L('À revoir', 'Pou revize')}</h2>
          {review}
        </section>
      )}
      {progress && (
        <section className="jh-card jh-glance__card" aria-labelledby="jh-glance-prog">
          <h2 id="jh-glance-prog" className="jh-card__title">{L('Ta progression', 'Pwogrè ou')}</h2>
          {progress}
        </section>
      )}
    </div>
  );
}
