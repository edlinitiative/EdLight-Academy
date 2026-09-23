/**
 * ExamCountdown — "how long until *my* national exam?"
 * ────────────────────────────────────────────────────
 * The mockups' `J-84` card. The data behind it (`src/config/examSchedule.ts`)
 * had been written, documented as powering exactly this, and rendered by
 * nothing reachable: the three components that imported it — Countdown,
 * DashHeroStrip, HomeWidgets — are themselves imported by no page. This is the
 * first mounted reader of that file.
 *
 * Two things it deliberately does NOT do:
 *
 * 1. It never guesses an exam for a learner. `gradeProfile()` defaults an
 *    unknown grade to the Bac, which is the right default for a study plan and
 *    the wrong one for a countdown — telling a 7ᵉ student their Bac is in 84
 *    days is a lie about their year. No grade, or a grade with no exam level,
 *    renders nothing at all.
 *
 * 2. It never presents an unpublished date as the official calendar. A student
 *    who plans their revision around a date we estimated, believing it
 *    published, is the harm this card could actually do. So an UNCONFIRMED
 *    session carries an "indicative" pill against its date and a line telling
 *    the learner where the real answer lives (their school).
 *
 *    A session marked `confirmed` in examSchedule.ts comes from the MENFP's
 *    published calendar, and then the caveat is not merely unnecessary but
 *    misleading — hedging a real date teaches a student to distrust the one
 *    number here that is solid. The caveat is therefore tied to the flag, so
 *    it disappears by itself the day someone enters the published dates.
 *    Nothing here claims an endorsement either way.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock } from './icons';
import { ExamSession, getNextExamSession } from '../config/examSchedule';
import { GRADES, gradeProfile } from '../../shared/trackConfig';
import useStore from '../contexts/store';
import './ExamCountdown.css';

/* gradeProfile() and EXAM_SESSIONS name the same three exams differently —
   `baccalaureat`/`9eme_af`/`universite` against the `/exams/:level` URL
   segments `terminale`/`9e`/`university`. The two vocabularies have to be
   bridged somewhere; doing it here keeps both files untouched. */
const SESSION_LEVEL_FOR_EXAM_LEVEL: Record<string, string> = {
  baccalaureat: 'terminale',
  '9eme_af': '9e',
  universite: 'university',
};

export interface ExamCountdownInfo {
  /** The matched session, including its `daysRemaining`. */
  session: ExamSession & { daysRemaining: number };
  /** `/exams/:level` URL segment — the session's own `level`. */
  level: string;
  /** Whole days from today. 0 = today, 1 = tomorrow. Never negative. */
  days: number;
  phase: 'today' | 'tomorrow' | 'upcoming';
}

/**
 * The next exam session *this learner sits*, or null when there is none to
 * show. Pure, and takes `from` so the arithmetic can be tested against a fixed
 * today rather than the real clock.
 *
 * Returns null when: no grade is known; the grade has no exam level (7ᵉ, 8ᵉ,
 * NS1–NS3); no session of that level is scheduled (POSTBAC — the list has no
 * `university` session at all); or the list has run out of future dates.
 */
export function resolveExamCountdown(
  grade: string | null | undefined,
  from: Date = new Date(),
): ExamCountdownInfo | null {
  /* gradeProfile()'s `default:` branch answers `baccalaureat` for anything it
     does not recognise — null, but also a stale or mistyped code left in a
     persisted store. That default is right for a study plan (some plan beats
     none) and wrong for a countdown, where it would announce a Bac date to a
     learner we cannot actually place. So only a grade the picker itself offers
     is trusted; everything else is treated as "we don't know". */
  if (!grade || !GRADES.some((g) => g.code === grade)) return null;

  const examLevel = gradeProfile(grade).examLevel;
  if (!examLevel) return null;

  const level = SESSION_LEVEL_FOR_EXAM_LEVEL[examLevel];
  if (!level) return null;

  const session = getNextExamSession(level, from);
  if (!session) return null;

  /* getNextExamSession() falls back to the soonest session of ANY level when
     the requested one has none left. That fallback is right for a generic
     "next exam" strip and wrong here: it would show a POSTBAC learner the 9ᵉ
     exam. Scoping is the whole point of this card, so the fallback is
     rejected rather than rendered. */
  if (session.level !== level) return null;

  /* A session runs over several days, and getNextExamSession keeps it current
     until its last one. So on day 2 of a four-day Bac `daysRemaining` is
     already negative — the exam has started, not passed. "C'est aujourd'hui"
     is true on every day of the window, and the count is clamped so the card
     can never print a negative number of days. */
  const days = Math.max(0, session.daysRemaining);
  return {
    session,
    level: session.level,
    days,
    phase: days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'upcoming',
  };
}

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const MONTHS_HT = [
  'janvye', 'fevriye', 'mas', 'avril', 'me', 'jen',
  'jiyè', 'out', 'septanm', 'oktòb', 'novanm', 'desanm',
];

/** "29 juin 2026" / "29 jen 2026". Returns null on a malformed ISO date. */
export function formatSessionDate(dateISO: string, isCreole: boolean): string | null {
  const [y, m, d] = (dateISO || '').split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return null;
  const month = (isCreole ? MONTHS_HT : MONTHS_FR)[m - 1];
  return `${d} ${month} ${y}`;
}

export default function ExamCountdown({ className }: { className?: string }) {
  const grade = useStore((s) => s.grade);
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const info = resolveExamCountdown(grade);
  if (!info) return null;

  const { session, level, days, phase } = info;
  const label = isCreole ? session.labelHt : session.label;
  const date = formatSessionDate(session.dateISO, isCreole);

  /* The headline. "J-0" as a number is the one thing this card must not say on
     the day itself — the learner is sitting the exam, not counting to it. */
  const headline =
    phase === 'today'
      ? t("Aujourd'hui", 'Jodi a')
      : phase === 'tomorrow'
      ? t('Demain', 'Demen')
      : `J-${days}`;

  const spoken =
    phase === 'today'
      ? t(`${label}, c'est aujourd'hui`, `${label}, se jodi a`)
      : phase === 'tomorrow'
      ? t(`${label}, c'est demain`, `${label}, se demen`)
      : t(`${days} jours avant ${label}`, `${days} jou anvan ${label}`);

  return (
    <Link
      to={`/exams/${level}`}
      className={['pf-card', 'xcd', className].filter(Boolean).join(' ')}
      aria-label={
        session.confirmed
          ? t(`${spoken}. Préparer cet examen.`, `${spoken}. Prepare egzamen sa a.`)
          : t(
              `${spoken}. Date indicative, à confirmer auprès de votre école. Préparer cet examen.`,
              `${spoken}. Dat endikatif, tcheke avèk lekòl ou pou konfime. Prepare egzamen sa a.`,
            )
      }
    >
      <span className="pf-tile pf-tile--md pf-tile--azure xcd__tile" aria-hidden="true">
        <CalendarClock size={22} />
      </span>

      <span className="xcd__body">
        <span className="pf-eyebrow xcd__eyebrow">
          {t('Objectif examen', 'Objektif egzamen')}
        </span>

        <span className="xcd__line">
          <b className={`xcd__count${phase === 'upcoming' ? '' : ' xcd__count--word'}`}>
            {headline}
          </b>
          <span className="xcd__label">{label}</span>
        </span>

        {/* The qualifier sits against the date, not in a footnote: the date is
            the claim, so the caveat has to be the next thing read. */}
        <span className="xcd__when">
          {date && <span className="xcd__date">{date}</span>}
          {!session.confirmed && (
            <span className="pf-pill pf-pill--amber xcd__flag">
              {t('Date indicative', 'Dat endikatif')}
            </span>
          )}
        </span>

        {!session.confirmed && (
          <span className="xcd__caveat">
            {t(
              'À confirmer auprès de votre école : le calendrier peut changer.',
              'Tcheke avèk lekòl ou pou konfime : kalandriye a ka chanje.',
            )}
          </span>
        )}
      </span>

      <span className="pf-link xcd__cta" aria-hidden="true">
        {t('Préparer cet examen', 'Prepare egzamen sa a')}
      </span>
    </Link>
  );
}
