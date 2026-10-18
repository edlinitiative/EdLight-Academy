import React, { useEffect, useRef, useState } from 'react';
import { EVIDENCE, evidenceLabel, trackJourney, type Evidence } from '../../../utils/learningJourney';
import useStore from '../../../contexts/store';
import { Skeleton } from '../../Skeleton';
import { readSnapshot, writeSnapshot, type CourseSummary, type Snapshot } from './homeJourney';

/**
 * ProgressSummary — LJ-10 on the existing Home surface (no new route).
 *
 * One line per course the student has actually worked in, each fact over its
 * real denominator and named with the shared EVIDENCE words:
 *   « Chimie NS I · 6 terminées sur 18 · 3 pratiquées · 2 maîtrisées »
 * The facts are separate statements — never summed into one blended score.
 *
 * Motion: the bar is drawn at its value. It moves only when the count has
 * changed since this student's last visit on this device, and then from the
 * previous value to the new one (reduced motion: no movement, same text).
 */

export type SummaryRow = { course: any; summary: CourseSummary };

type Props = {
  rows: SummaryRow[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  subjectName: (code: string) => string;
  levelLabel: (lv: string) => string;
  courseLevel: (c: any) => string;
  L: (fr: string, ht: string) => string;
  /** Extra class on the card (the workspace hides it on phones). */
  className?: string;
};

/** "6 terminées" / "1 terminée" / "6 fini". */
function count(n: number, e: Evidence, isCreole: boolean) {
  const word = evidenceLabel(e, isCreole).toLowerCase();
  return `${n} ${!isCreole && n > 1 ? `${word}s` : word}`;
}

export function factsLine(s: CourseSummary, isCreole: boolean): string {
  const sur = isCreole ? 'sou' : 'sur';
  const parts: string[] = [];
  if (s.completed > 0) parts.push(`${count(s.completed, 'completed', isCreole)} ${sur} ${s.total}`);
  else parts.push(`${count(s.opened, 'opened', isCreole)} ${sur} ${s.total}`);
  if (s.practised > 0) parts.push(count(s.practised, 'practised', isCreole));
  if (s.mastered > 0) parts.push(count(s.mastered, 'mastered', isCreole));
  return parts.join(' · ');
}

function Bar({ from, to, label }: { from: number; to: number; label: string }) {
  const [w, setW] = useState(from);
  useEffect(() => {
    if (from === to) { setW(to); return undefined; }
    // Two frames: the previous width must paint before the transition starts.
    let id2 = 0;
    const id = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setW(to)); });
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(id2); };
  }, [from, to]);
  return (
    <span className="jh-prog__bar" role="img" aria-label={label}>
      <span className="jh-prog__fill" style={{ width: `${w}%` }} />
    </span>
  );
}

export default function ProgressSummary({
  rows, loading, failed, onRetry, subjectName, levelLabel, courseLevel, L, className,
}: Props) {
  const uid = useStore((s) => s.user?.uid || null);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';

  // The previous visit's counts, read ONCE per mount when the data is ready,
  // then replaced by today's — so a revisit with nothing new shows no change.
  const [prev, setPrev] = useState<Snapshot | null>(null);
  const settled = useRef(false);
  useEffect(() => {
    if (loading || failed || !uid || settled.current) return;
    settled.current = true;
    setPrev(readSnapshot(uid));
    const snap: Snapshot = {};
    for (const { summary: s } of rows) snap[s.courseId] = { completed: s.completed, practised: s.practised, mastered: s.mastered };
    writeSnapshot(uid, snap);
  }, [loading, failed, uid, rows]);

  const opened = useRef(false);
  const onToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!(e.currentTarget as HTMLDetailsElement).open || opened.current) return;
    opened.current = true;
    trackJourney('progress_summary_opened', { source: 'home', courses: rows.length });
  };

  // Hidden until there is evidence: a new student is shown nothing rather
  // than a card of zeroes (Stitch web direction §1.4).
  if (!loading && !failed && rows.length === 0) return null;

  return (
    <section className={`jh-card jh-prog${className ? ` ${className}` : ''}`} aria-labelledby="jh-prog-title">
      <h2 id="jh-prog-title" className="jh-card__title">{L('Ta progression', 'Pwogrè ou')}</h2>

      {loading ? (
        <div aria-hidden="true" className="jh-prog__skel">
          {[0, 1].map((i) => (
            <div key={i}>
              <Skeleton width="45%" height={15} />
              <Skeleton width="100%" height={6} radius={6} style={{ margin: '0.5rem 0' }} />
              <Skeleton width="70%" height={13} />
            </div>
          ))}
        </div>
      ) : failed ? (
        <div className="jh-prog__empty">
          <p>{L('Ta progression n’a pas pu se charger. Rien n’est perdu : elle est enregistrée sur ton compte.',
            'Pwogrè ou pa t ka chaje. Anyen pa pèdi : li anrejistre sou kont ou.')}</p>
          <button type="button" className="jh-prog__retry" onClick={onRetry}>{L('Réessayer', 'Eseye ankò')}</button>
        </div>
      ) : (
        <ul className="jh-prog__list">
          {rows.map(({ course, summary: s }) => {
            const pct = s.total ? Math.round((s.completed / s.total) * 100) : 0;
            const before = prev?.[s.courseId];
            const fromPct = before && s.total && before.completed < s.completed
              ? Math.round((before.completed / s.total) * 100) : pct;
            const deltas: string[] = [];
            if (before) {
              const dc = s.completed - before.completed;
              const dp = s.practised - before.practised;
              const dm = s.mastered - before.mastered;
              if (dc > 0) deltas.push(`+${count(dc, 'completed', isCreole)}`);
              if (dp > 0) deltas.push(`+${count(dp, 'practised', isCreole)}`);
              if (dm > 0) deltas.push(`+${count(dm, 'mastered', isCreole)}`);
            }
            const name = `${subjectName(course.subject)} ${levelLabel(courseLevel(course))}`;
            const line = factsLine(s, isCreole);
            return (
              <li key={s.courseId} className="jh-prog__row">
                <strong className="jh-prog__name">{name}</strong>
                <Bar
                  key={`${s.courseId}-${fromPct}`}
                  from={fromPct}
                  to={pct}
                  label={L(`${name} : ${s.completed} leçons terminées sur ${s.total}`, `${name} : ${s.completed} leson fini sou ${s.total}`)}
                />
                <span className="jh-prog__facts">{line}</span>
                {deltas.length > 0 && (
                  <span className="jh-prog__delta">
                    {deltas.join(' · ')} {L('depuis ta dernière visite', 'depi dènye vizit ou')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="jh-prog__how" onToggle={onToggle}>
        <summary>{L('Que veulent dire ces mots ?', 'Kisa mo sa yo vle di ?')}</summary>
        <dl>
          {(Object.keys(EVIDENCE) as Evidence[]).map((e) => (
            <div key={e}>
              <dt>{evidenceLabel(e, isCreole)}</dt>
              <dd>{isCreole ? EVIDENCE[e].helpHt : EVIDENCE[e].helpFr}</dd>
            </div>
          ))}
        </dl>
        <p>{L('Chaque chiffre compte des leçons de ce cours. Ils ne s’additionnent pas et ne font pas une note.',
          'Chak chif konte leson nan kou sa a. Yo pa adisyone, e yo pa fè yon nòt.')}</p>
      </details>
    </section>
  );
}
