import React from 'react';
import { Flame } from './icons';
import { useStreak } from '../hooks/useStreak';
import useStore from '../contexts/store';
import './StreakRail.css';

/** Local YYYY-MM-DD. Never use toISOString(): it shifts to UTC and, west of
 *  Greenwich (Haiti is UTC-5), marks "today" as yesterday all evening. */
function localKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const LETTERS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const LETTERS_HT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/**
 * The seven days of the current week, Monday-first, with today marked.
 * Monday-first matches how Haitian school weeks are written.
 */
function weekDays(today: Date) {
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { key: localKey(d), isToday: i === dow, isFuture: i > dow, letter: i };
  });
}

/**
 * The streak, as something you can lose.
 *
 * A bare number in the navbar is a score; a week of filled and unfilled days is
 * a gap you want to close. This is the only warm colour on the dashboard, so
 * the eye lands on the one thing that decays if the student stops coming back.
 */
export default function StreakRail() {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const { streak } = useStreak();

  const days = React.useMemo(() => weekDays(new Date()), []);
  const active = React.useMemo(
    () => new Set<string>(streak?.activeDays || []),
    [streak?.activeDays]
  );
  const frozen = React.useMemo(
    () => new Set<string>(streak?.frozenDays || []),
    [streak?.frozenDays]
  );

  const count = streak?.currentStreak || 0;
  const studiedToday = active.has(localKey(new Date()));
  const letters = isCreole ? LETTERS_HT : LETTERS_FR;

  // The line under the dots is the whole point: say what is at stake today,
  // not what the number is. It changes with the student's actual state.
  const note = studiedToday
    ? (isCreole ? 'Ou fè jodi a. Kenbe l.' : "C'est fait pour aujourd'hui.")
    : count > 0
      ? (isCreole
        ? `Yon leson jodi a pou kenbe ${count} jou yo.`
        : `Une leçon aujourd'hui pour garder tes ${count} jours.`)
      : (isCreole ? 'Kòmanse seri ou jodi a.' : 'Commence ta série aujourd\'hui.');

  // A chip, not a card: the count and the week at a glance. The sentence
  // that says what is at stake today is the tooltip and the label, so it is
  // still read out, just not printed as a paragraph.
  return (
    <aside
      className={`streak-rail${studiedToday ? ' streak-rail--done' : ''}`}
      aria-label={`${isCreole ? 'Seri ou' : 'Ta série'} : ${count} ${isCreole ? 'jou' : (count === 1 ? 'jour' : 'jours')}. ${note}`}
      title={note}
    >
      <span className="streak-rail__count" aria-hidden="true">
        <Flame size={14} strokeWidth={2.4} />
        <span className="streak-rail__num">{count}</span>
        <span className="streak-rail__unit">
          {isCreole ? 'jou' : (count === 1 ? 'jour' : 'jours')}
        </span>
      </span>

      <ol className="streak-rail__week" aria-hidden="true">
        {days.map((d, i) => {
          const isActive = active.has(d.key);
          const isFrozen = frozen.has(d.key);
          const state = isActive ? 'on' : isFrozen ? 'frozen' : d.isFuture ? 'future' : 'off';
          return (
            <li
              key={d.key}
              className="streak-rail__dot"
              data-state={state}
              data-today={d.isToday ? 'true' : undefined}
              title={letters[i]}
            />
          );
        })}
      </ol>
    </aside>
  );
}
