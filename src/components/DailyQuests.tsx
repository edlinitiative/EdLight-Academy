/**
 * Quêtes quotidiennes — the mockups' "Quêtes Quotidiennes & Défis", built only
 * out of things the app can actually see.
 *
 * Read services/dailyQuests.ts first: it owns the rule that a quest may only
 * exist if some timestamped record already proves it was done, and it is where
 * every number below is counted. This file is the surface — copy, links, the
 * pf-* card, and the one write there is.
 *
 * FOUR THINGS IT WILL NOT DO
 *
 * · It shows a signed-out visitor nothing. A quest needs a student; a teaser
 *   with a bar at 0/3 would be a promise made to a row in nobody's account.
 * · It prints no figure it did not count. There is no "2 847 élèves ont
 *   terminé cette quête", no percentile, no rank, no tier.
 * · It never renders a quest whose progress it cannot observe. The candidate
 *   list is exactly five, and each one names the record it reads.
 * · When the reads fail it says so, and shows nothing else. A quest stuck at
 *   0/3 because Firestore was unreachable is worse than no quest at all.
 *
 * THE DAY. The header counts down to LOCAL midnight — the same boundary
 * streakService.todayStr draws, via dailyQuests.dayKey. If the two disagreed,
 * a student at 23:59 would be told their quests had reset while the streak
 * still counted the day, or the reverse. Under `prefers-reduced-motion` the
 * countdown is computed once and left alone rather than ticking.
 *
 * THE XP. Completion is paid by triviaService.claimQuestXp — the service that
 * owns the gamification profile — so there is no second currency and no write
 * to the XP field from out here. The claim is idempotent server-side (it
 * re-reads the profile's claim list), which is what lets this auto-claim from
 * an effect without fearing a replay.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Brain,
  CalendarCheck,
  Check,
  ChevronRight,
  ClipboardCheck,
  Hourglass,
  ListChecks,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import useStore from '../contexts/store';
import { useAppData } from '../hooks/useData';
import { loadReviewMap } from '../services/reviewService';
import { readMastery } from '../services/masteryService';
import { listRecentQuizAttempts, listRecentExamAttempts } from '../services/userActivity';
import {
  loadTriviaProfile,
  getDailyChallengeState,
  getDailyQuestClaims,
  claimQuestXp,
} from '../services/triviaService';
import { gradeProfile } from '../config/trackConfig';
import { courseLessonIds, summarize } from '../../shared/mastery';
import {
  buildDailyQuests,
  dayKey,
  msUntilDayEnd,
  splitCountdown,
  unclaimedQuests,
  claimedXp,
  remainingXp,
  type DailyQuest,
  type QuestId,
} from '../services/dailyQuests';
import './DailyQuests.css';

/** gradeProfile().examLevel → the level's URL slug. The same three-entry label
 *  mapping Practice.tsx carries — a mapping, not state. */
const EXAM_LEVEL_TO_SLUG: Record<string, string> = {
  baccalaureat: 'terminale',
  universite: 'university',
  '9eme_af': '9e',
};

/** How many recent rows to look at. A day's work is nowhere near either bound,
 *  and both queries are ordered newest-first, so this is a ceiling, not a filter. */
const QUIZ_ATTEMPT_LOOKBACK = 40;
const EXAM_ATTEMPT_LOOKBACK = 20;

const QUEST_ICON: Record<QuestId, React.ReactNode> = {
  review: <Brain size={20} aria-hidden="true" />,
  lessons: <TrendingUp size={20} aria-hidden="true" />,
  'unit-quiz': <ListChecks size={20} aria-hidden="true" />,
  'daily-challenge': <CalendarCheck size={20} aria-hidden="true" />,
  'exam-paper': <ClipboardCheck size={20} aria-hidden="true" />,
};

/** True while the visitor has asked for less movement. Static in jsdom. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);
  return reduced;
}

/**
 * A clock that only moves when it is allowed to. It drives both the countdown
 * and the day key, so a student who leaves the page open past midnight gets the
 * next day's quests rather than an expired set.
 */
function useMinuteClock(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

export default function DailyQuests() {
  const language = useStore((s) => s.language);
  const uid = useStore((s) => s.user?.uid);
  const grade = useStore((s) => s.grade);
  const isCreole = language === 'ht';
  const t = useCallback((fr: string, ht: string) => (isCreole ? ht : fr), [isCreole]);

  const reduced = usePrefersReducedMotion();
  const now = useMinuteClock(!reduced);
  const day = dayKey(now);

  const qc = useQueryClient();

  // ── The four stores, all of which someone else already owns ───────────────
  // `mastery-lessons` is deliberately the same query key /practice uses for its
  // suggestion, so the two share one read of the one shared mastery document.
  const reviewQuery = useQuery({
    queryKey: ['review-map', uid],
    queryFn: () => loadReviewMap(uid!),
    enabled: !!uid,
  });
  const masteryQuery = useQuery({
    queryKey: ['mastery-lessons', uid],
    queryFn: () => readMastery(uid),
    enabled: !!uid,
  });
  const profileQuery = useQuery({
    queryKey: ['trivia-profile', uid],
    queryFn: () => loadTriviaProfile(uid),
    enabled: !!uid,
    staleTime: 60 * 1000,
  });
  const attemptsQuery = useQuery({
    queryKey: ['quest-attempt-log', uid],
    queryFn: async () => {
      const [quizzes, exams] = await Promise.all([
        listRecentQuizAttempts(uid, QUIZ_ATTEMPT_LOOKBACK),
        listRecentExamAttempts(uid, EXAM_ATTEMPT_LOOKBACK),
      ]);
      return {
        quizTimes: quizzes.map((r) => Number(r.attemptedAtMs)).filter(Number.isFinite),
        examTimes: exams.map((r) => Number(r.updated_at_ms)).filter(Number.isFinite),
      };
    },
    enabled: !!uid,
    staleTime: 60 * 1000,
  });

  const { data: appData } = useAppData();
  const courses: any[] = appData?.courses || [];

  const profile = profileQuery.data;
  const examLevel = gradeProfile(grade).examLevel || null;

  const observations = useMemo(
    () => ({
      day,
      uid: uid || '',
      review: reviewQuery.data || {},
      mastery: masteryQuery.data || {},
      quizAttemptTimes: attemptsQuery.data?.quizTimes || [],
      examAttemptTimes: attemptsQuery.data?.examTimes || [],
      dailyChallengeDone: getDailyChallengeState(profile, day).completedToday,
      examLevel,
      claimed: getDailyQuestClaims(profile, day) as QuestId[],
    }),
    [day, uid, reviewQuery.data, masteryQuery.data, attemptsQuery.data, profile, examLevel],
  );

  const ready =
    !!uid &&
    !reviewQuery.isPending &&
    !masteryQuery.isPending &&
    !profileQuery.isPending &&
    !attemptsQuery.isPending;

  const failed =
    reviewQuery.isError || masteryQuery.isError || profileQuery.isError || attemptsQuery.isError;

  const quests = useMemo(
    () => (ready && !failed ? buildDailyQuests(observations) : []),
    [ready, failed, observations],
  );

  /**
   * The course this student is furthest into without having finished it — the
   * one an "advance a lesson" quest should point at. Counted from the same
   * mastery map, with shared/mastery's own helpers; null when no course has a
   * trace of work yet, in which case the quest links to the catalogue instead
   * of naming a course we have no reason to name.
   */
  const ongoingCourse = useMemo(() => {
    const progress = masteryQuery.data;
    if (!progress || courses.length === 0) return null;
    let best: { id: string; name: string; started: number } | null = null;
    for (const course of courses) {
      if (course?.comingSoon) continue;
      const lessonIds = courseLessonIds(course);
      if (lessonIds.length === 0) continue;
      const s = summarize(lessonIds, progress);
      if (s.started === 0 || s.mastered >= s.total) continue;
      if (!best || s.started > best.started) {
        best = {
          id: course.id || course.code || '',
          name: course.name || course.title || course.code || '',
          started: s.started,
        };
      }
    }
    return best && best.id ? best : null;
  }, [masteryQuery.data, courses]);

  // ── Paying for what is finished ───────────────────────────────────────────
  // One claim per quest per day. `claimQuestXp` re-reads the stored claim list
  // before adding anything, so the guard below is only there to stop us firing
  // the same request twice while the first is still in flight.
  const inFlight = useRef<Set<string>>(new Set());
  const [justEarned, setJustEarned] = useState(0);

  useEffect(() => {
    if (!uid) return;
    const pending = unclaimedQuests(quests);
    if (pending.length === 0) return;
    let cancelled = false;

    (async () => {
      let awarded = 0;
      for (const quest of pending) {
        const key = `${day}:${quest.id}`;
        if (inFlight.current.has(key)) continue;
        inFlight.current.add(key);
        try {
          const res = await claimQuestXp(uid, { questId: quest.id, xp: quest.xp, today: day });
          awarded += res?.awarded || 0;
          // `profile: null` is the service's error path — as opposed to "already
          // paid", which comes back with the profile. Only the error is worth
          // retrying, so only the error releases the guard.
          if (!res || res.profile === null) inFlight.current.delete(key);
        } catch {
          inFlight.current.delete(key);
        }
      }
      if (cancelled || awarded === 0) return;
      setJustEarned((n) => n + awarded);
      qc.invalidateQueries({ queryKey: ['trivia-profile', uid] });
      qc.invalidateQueries({ queryKey: ['global-streak'] });
    })();

    return () => { cancelled = true; };
  }, [uid, day, quests, qc]);

  // ── States ────────────────────────────────────────────────────────────────

  // A quest belongs to a student. There is nothing honest to show a visitor.
  if (!uid) return null;

  if (failed) {
    return (
      <section className="quests quests--quiet" role="status" aria-labelledby="quests-title">
        <h2 className="quests__title-sr" id="quests-title">
          {t('Quêtes du jour', 'Kèt jodi a')}
        </h2>
        <p className="quests__note">
          {t(
            'Nous n’arrivons pas à lire votre travail d’aujourd’hui, donc nous ne pouvons pas vous proposer de quêtes. Tout le reste de la page fonctionne.',
            'Nou pa rive li travay ou fè jodi a, konsa nou pa ka pwopoze ou kèt. Tout rès paj la ap mache.',
          )}
        </p>
      </section>
    );
  }

  if (!ready) {
    return (
      <section className="quests quests--quiet" role="status" aria-busy="true" aria-labelledby="quests-title">
        <h2 className="quests__title-sr" id="quests-title">
          {t('Quêtes du jour', 'Kèt jodi a')}
        </h2>
        <p className="quests__note">
          {t('Nous lisons ce que vous avez déjà fait aujourd’hui…', 'N ap li sa ou deja fè jodi a…')}
        </p>
      </section>
    );
  }

  if (quests.length === 0) return null;

  const { hours, minutes } = splitCountdown(msUntilDayEnd(day, now));
  const clock = `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  const doneCount = quests.filter((q) => q.complete).length;
  const allDone = doneCount === quests.length;
  const banked = claimedXp(quests);
  const left = remainingXp(quests);

  return (
    <section className="quests pf-card" aria-labelledby="quests-title">
      <div className="pf-head quests__head">
        <span className="quests__head-text">
          <span className="pf-eyebrow">{t('Quêtes du jour', 'Kèt jodi a')}</span>
          <h2 className="pf-head__title" id="quests-title">
            {allDone
              ? t('Tout est fait pour aujourd’hui', 'Tout bagay fèt pou jodi a')
              : t(
                  `${doneCount} sur ${quests.length} terminée${doneCount === 1 ? '' : 's'}`,
                  `${doneCount} sou ${quests.length} fini`,
                )}
          </h2>
        </span>
        {/* The mockups' "Expire dans 06h 42m" — to LOCAL midnight, the same
            boundary the streak uses, so the two can never contradict. */}
        <span className="pf-pill pf-pill--slate quests__clock">
          <Hourglass size={13} aria-hidden="true" />
          {t(`Expire dans ${clock}`, `L ap fini nan ${clock}`)}
        </span>
      </div>

      <ul className="quests__list">
        {quests.map((quest) => (
          <QuestRow
            key={quest.id}
            quest={quest}
            t={t}
            examSlug={(examLevel && EXAM_LEVEL_TO_SLUG[examLevel]) || ''}
            course={ongoingCourse}
          />
        ))}
      </ul>

      <p className="quests__note">
        {banked > 0
          ? t(
              `${banked} XP ajoutés à votre compte aujourd’hui${left > 0 ? ` · ${left} XP encore en jeu` : ''}.`,
              `${banked} XP ajoute nan kont ou jodi a${left > 0 ? ` · ${left} XP toujou an jwèt` : ''}.`,
            )
          : t(`${left} XP en jeu aujourd’hui.`, `${left} XP an jwèt jodi a.`)}
      </p>

      {justEarned > 0 && (
        <p className="quests__earned" role="status">
          <Sparkles size={15} aria-hidden="true" />
          {t(`+${justEarned} XP`, `+${justEarned} XP`)}
        </p>
      )}
    </section>
  );
}

// ── One quest ───────────────────────────────────────────────────────────────

type Copy = {
  eyebrow: string;
  title: string;
  desc: string;
  cta: string;
  to: string;
  state?: Record<string, unknown>;
};

function questCopy(
  quest: DailyQuest,
  t: (fr: string, ht: string) => string,
  examSlug: string,
  course: { id: string; name: string } | null,
): Copy {
  const n = quest.target;
  switch (quest.id) {
    case 'review':
      return {
        eyebrow: t('Vos propres erreurs', 'Pwòp erè ou yo'),
        title: t(
          `Corrigez ${n} question${n === 1 ? '' : 's'} que vous aviez ratée${n === 1 ? '' : 's'}`,
          `Korije ${n} kesyon ou te rate`,
        ),
        desc: t(
          'Compté sur votre liste de révision : une question que vous aviez ratée et que vous répondez juste aujourd’hui, où que ce soit.',
          'Konte sou lis revizyon ou : yon kesyon ou te rate epi ou reponn kòrèk jodi a, kèlkeswa kote a.',
        ),
        cta: t('Ouvrir Revizyon', 'Louvri Revizyon'),
        to: '/revision',
      };
    case 'lessons':
      return {
        eyebrow: t('Progression', 'Pwogrè'),
        title: t(
          `Faites monter ${n} leçon${n === 1 ? '' : 's'} d’un cran`,
          `Fè ${n} leson monte yon degre`,
        ),
        desc: course
          ? t(
              `Compté sur votre suivi de maîtrise : une leçon monte quand vos exercices battent votre meilleur score. ${course.name} est le cours où vous êtes le plus avancé sans l’avoir fini.`,
              `Konte sou swivi metriz ou : yon leson monte lè egzèsis ou yo bat pi bon nòt ou. ${course.name} se kou kote ou pi avanse san ou poko fini l.`,
            )
          : t(
              'Compté sur votre suivi de maîtrise : une leçon monte quand vos exercices battent votre meilleur score — 70 % pour « familier », 100 % pour le cran au-dessus.',
              'Konte sou swivi metriz ou : yon leson monte lè egzèsis ou yo bat pi bon nòt ou — 70 % pou « familye », 100 % pou degre ki anwo a.',
            ),
        cta: course ? t(`Ouvrir ${course.name}`, `Louvri ${course.name}`) : t('Ouvrir mes cours', 'Louvri kou m yo'),
        to: course ? `/courses/${course.id}` : '/courses',
      };
    case 'unit-quiz':
      return {
        eyebrow: t('Série d’unité', 'Seri inite'),
        title: t('Terminez une série de questions dans une leçon', 'Fini yon seri kesyon nan yon leson'),
        desc: t(
          'Compté sur vos tentatives enregistrées : ce sont les séries lancées depuis une leçon, les seules dont la note est gardée.',
          'Konte sou tantativ ou yo ki anrejistre : se seri ou lanse depi nan yon leson, sèl yo ki kenbe nòt la.',
        ),
        cta: course ? t(`Ouvrir ${course.name}`, `Louvri ${course.name}`) : t('Ouvrir mes cours', 'Louvri kou m yo'),
        to: course ? `/courses/${course.id}` : '/courses',
      };
    case 'daily-challenge':
      return {
        eyebrow: t('Défi du jour', 'Defi jodi a'),
        title: t('Terminez le défi du jour', 'Fini defi jodi a'),
        desc: t(
          'Compté sur votre profil de jeu : dix questions, une seule fois par jour. Le défi paie déjà son propre bonus, donc la quête n’ajoute qu’un petit supplément.',
          'Konte sou pwofil jwèt ou : dis kesyon, yon sèl fwa pa jou. Defi a deja peye pwòp bonis li, kidonk kèt la ajoute yon ti siplemantè sèlman.',
        ),
        cta: t('Jouer le défi', 'Jwe defi a'),
        to: '/jeux',
        state: { startDaily: true },
      };
    case 'exam-paper':
      return {
        eyebrow: t('Épreuve officielle', 'Eprèv ofisyèl'),
        title: t('Travaillez une épreuve de votre niveau', 'Travay yon eprèv nan nivo ou'),
        desc: t(
          'Compté sur votre copie enregistrée : dès que vos réponses sont sauvegardées, la quête est remplie. Vous n’êtes pas obligé de finir l’épreuve aujourd’hui.',
          'Konte sou kopi ou ki anrejistre : depi repons ou yo sove, kèt la fini. Ou pa oblije fini eprèv la jodi a.',
        ),
        cta: t('Ouvrir les épreuves', 'Louvri eprèv yo'),
        to: examSlug ? `/exams/${examSlug}` : '/exams',
      };
    default:
      return { eyebrow: '', title: '', desc: '', cta: '', to: '/practice' };
  }
}

function QuestRow({
  quest,
  t,
  examSlug,
  course,
}: {
  quest: DailyQuest;
  t: (fr: string, ht: string) => string;
  examSlug: string;
  course: { id: string; name: string } | null;
}) {
  const copy = questCopy(quest, t, examSlug, course);
  const pct = quest.target > 0 ? Math.round((Math.min(quest.done, quest.target) / quest.target) * 100) : 0;

  return (
    <li className={`quests__item${quest.complete ? ' is-done' : ''}`}>
      <span
        className={`pf-tile pf-tile--${quest.complete ? 'emerald' : quest.tone} pf-tile--md quests__icon`}
        aria-hidden="true"
      >
        {quest.complete ? <Check size={20} /> : QUEST_ICON[quest.id]}
      </span>

      <div className="quests__body">
        <span className="pf-eyebrow quests__eyebrow">{copy.eyebrow}</span>
        <h3 className="quests__name">{copy.title}</h3>
        <div className="quests__progress">
          <span
            className={`pf-meter quests__meter${quest.complete ? ' quests__meter--done' : ''}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={quest.target}
            aria-valuenow={Math.min(quest.done, quest.target)}
            aria-label={copy.title}
          >
            <span className="pf-meter__fill" style={{ width: `${pct}%` }} />
          </span>
          <span className="quests__count">
            {quest.done} / {quest.target}
          </span>
        </div>
      </div>

      <div className="quests__aside">
        {quest.complete ? (
          <span className="pf-pill pf-pill--emerald quests__reward">
            <Check size={13} aria-hidden="true" />
            {quest.claimed
              ? t(`+${quest.xp} XP obtenus`, `+${quest.xp} XP jwenn`)
              : t(`+${quest.xp} XP`, `+${quest.xp} XP`)}
          </span>
        ) : (
          <span className="pf-pill pf-pill--azure quests__reward">
            <Sparkles size={13} aria-hidden="true" />
            {t(`${quest.xp} XP`, `${quest.xp} XP`)}
          </span>
        )}
        <Link className="quests__go" to={copy.to} state={copy.state}>
          {quest.complete ? t('Y retourner', 'Retounen ladan l') : copy.cta}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}
