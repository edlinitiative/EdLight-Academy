import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Brain, ChevronRight, ClipboardCheck, Hourglass, ListChecks, Timer } from 'lucide-react';
import useStore from '../contexts/store';
import { useAppData } from '../hooks/useData';
import { loadDueReviewIds } from '../services/reviewService';
import { readMastery } from '../services/masteryService';
import { courseLessonIds, summarize } from '../../shared/mastery';
import { gradeProfile } from '../config/trackConfig';
import './Practice.css';

/**
 * /practice — the hub §6.4 asks for: choose by learning need, not by feature.
 *
 * Three things this page is required to get right, and how it does:
 *
 * 1. QUIZZES AND EXAMS ARE NOT INTERCHANGEABLE. They are not siblings in one
 *    grid any more. Everything untimed and unrecorded lives under
 *    "S'entraîner"; the full official paper lives under its own heading that
 *    says what an exam costs you (a clock, a saved attempt). The grouping is
 *    the statement — a sentence students skip cannot carry it.
 *
 * 2. EVERY ENTRY POINT STATES FOUR FACTS: purpose, expected time WHEN KNOWN,
 *    timed or not, and whether results are saved. Each `facts` entry below is
 *    a fact about code that exists — the 10 of a Revizyon session is
 *    `SESSION_LIMIT` in Revision.tsx, the three tries are `MAX_ATTEMPTS` in
 *    DirectBankQuiz, the exam clock is `duration_minutes` on the paper. Where
 *    a duration is per-exam and not knowable here, the fact says the duration
 *    is shown before you start rather than inventing a number.
 *
 * 3. THE SUGGESTION NEVER DIAGNOSES. `useEvidence` below reads the two real
 *    stores (the shared review map and the ONE shared mastery doc) and returns
 *    a state, one of which is "we do not have enough of your work to say".
 *    That state is a first-class outcome, not a fallback — §3 forbids
 *    inventing a weakness to fill this space.
 */

type Fact = string;

type PracticeChoice = {
  href: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  /** Purpose/time/timed/saved — see the header comment. Rendered in full at every width. */
  facts: Fact[];
  primary?: boolean;
  /** Shown under the card when the activity is not the priority for this grade. */
  aside?: string;
};

/** gradeProfile().examLevel → the level path, so a student lands on their own papers. */
const EXAM_LEVEL_TO_PATH: Record<string, string> = {
  baccalaureat: '/exams/terminale',
  universite: '/exams/university',
  '9eme_af': '/exams/9e',
};

/**
 * Enough recorded lessons in one course before that course may be named.
 * Below this the honest answer is "we don't know yet" — two graded exercises
 * are not a picture of a student.
 */
const MIN_COURSE_RECORDS = 3;
/** Enough recorded lessons overall before we look for a course at all. */
const MIN_TOTAL_RECORDS = 5;

type Evidence =
  | { kind: 'signed-out' }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'review'; count: number }
  | { kind: 'thin' }
  | { kind: 'course'; name: string; href: string; started: number; total: number; mastered: number };

/**
 * What we can honestly say about this student's practice, from the stores that
 * already own the answer. No second progress model lives here (§10): the
 * review map and the mastery doc are read, never re-derived.
 */
function useEvidence(): Evidence {
  const userId = useStore((state) => state.user?.uid);

  const dueQuery = useQuery({
    queryKey: ['due-review-ids', userId],
    queryFn: () => loadDueReviewIds(userId!),
    enabled: !!userId,
  });

  // users/{uid}/mastery/lessons — the ONE doc the phone writes too. Never the
  // per-course progress doc, which only knows "video watched".
  const masteryQuery = useQuery({
    queryKey: ['mastery-lessons', userId],
    queryFn: () => readMastery(userId),
    enabled: !!userId,
  });

  const { data: appData, isLoading: coursesLoading, isError: coursesError } = useAppData();
  const courses: any[] = appData?.courses || [];

  return useMemo<Evidence>(() => {
    if (!userId) return { kind: 'signed-out' };
    if (dueQuery.isPending || masteryQuery.isPending || (coursesLoading && !appData)) {
      return { kind: 'loading' };
    }
    if (dueQuery.isError) return { kind: 'unavailable' };

    const due = dueQuery.data ?? [];
    if (due.length > 0) return { kind: 'review', count: due.length };

    const progress = masteryQuery.data ?? {};
    const recorded = Object.keys(progress).length;
    // The courses list is what maps a lesson id to a course. Without it we
    // cannot name a subject — and that is an outage, not thin evidence.
    if (coursesError && courses.length === 0) return { kind: 'unavailable' };
    if (recorded < MIN_TOTAL_RECORDS || courses.length === 0) return { kind: 'thin' };

    let weakest: { course: any; started: number; total: number; mastered: number; points: number } | null = null;
    for (const course of courses) {
      const lessonIds = courseLessonIds(course);
      if (lessonIds.length === 0) continue;
      const summary = summarize(lessonIds, progress);
      if (summary.started < MIN_COURSE_RECORDS) continue;
      if (!weakest || summary.points < weakest.points) {
        weakest = {
          course,
          started: summary.started,
          total: summary.total,
          mastered: summary.mastered,
          points: summary.points,
        };
      }
    }
    if (!weakest) return { kind: 'thin' };

    const code = weakest.course.code || weakest.course.id || '';
    return {
      kind: 'course',
      name: weakest.course.name || weakest.course.title || code,
      href: code ? `/quizzes?course=${encodeURIComponent(code)}` : '/quizzes',
      started: weakest.started,
      total: weakest.total,
      mastered: weakest.mastered,
    };
  }, [
    userId,
    dueQuery.isPending, dueQuery.isError, dueQuery.data,
    masteryQuery.isPending, masteryQuery.data,
    coursesLoading, coursesError, appData, courses,
  ]);
}

export default function Practice() {
  const language = useStore((state) => state.language);
  const userId = useStore((state) => state.user?.uid);
  const grade = useStore((state) => state.grade);
  const toggleAuthModal = useStore((state) => state.toggleAuthModal);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const evidence = useEvidence();
  const profile = gradeProfile(grade);
  /** `examLevel: null` (7ᵉ/8ᵉ, NS1–NS3) means official papers are not this grade's errand. */
  const examsRelevant = profile.examLevel !== null;
  const examHref = (profile.examLevel && EXAM_LEVEL_TO_PATH[profile.examLevel]) || '/exams';

  const dueCount = evidence.kind === 'review' ? evidence.count : 0;
  /** Exactly one card is visually strongest (§7). Mistakes win when there are any. */
  const primaryKey = dueCount > 0 ? 'review' : examsRelevant ? 'exam' : 'drill';

  const trainingChoices: PracticeChoice[] = [
    {
      href: '/revision',
      icon: <Brain size={23} aria-hidden="true" />,
      eyebrow: t('À partir de vos erreurs', 'Soti nan erè ou yo'),
      title: t('Revoir ce que vous avez manqué', 'Revize sa ou te rate'),
      description: t(
        'Une session bâtie uniquement avec les questions que vous avez ratées. Une bonne réponse retire la question de la liste.',
        'Yon sesyon ki fèt sèlman ak kesyon ou te rate yo. Yon bon repons retire kesyon an nan lis la.',
      ),
      facts: [
        dueCount > 0
          ? t(`${dueCount} question${dueCount === 1 ? '' : 's'} en attente`, `${dueCount} kesyon k ap tann`)
          : t('Vos erreurs arrivent ici après une pratique', 'Erè ou yo rive isit la apre yon pratik'),
        t('Jusqu’à 10 questions par session', 'Jiska 10 kesyon pou chak sesyon'),
        t('Non chronométré', 'San kwonomèt'),
        t('Aucune note ; la liste est enregistrée', 'Pa gen nòt ; lis la anrejistre'),
        t('Compte requis', 'Ou bezwen yon kont'),
      ],
      primary: primaryKey === 'review',
    },
    {
      href: '/quizzes',
      icon: <ListChecks size={23} aria-hidden="true" />,
      eyebrow: t('Pratique courte', 'Pratik kout'),
      title: t('S’entraîner par matière', 'Pratike pa matyè'),
      description: t(
        'Choisissez une matière, un niveau et une unité, puis enchaînez les questions une par une avec une correction immédiate.',
        'Chwazi yon matyè, yon nivo ak yon inite, epi fè kesyon yo youn apre lòt ak koreksyon touswit.',
      ),
      facts: [
        t('Une question à la fois, autant que vous voulez', 'Yon kesyon alafwa, otan ou vle'),
        t('Non chronométré', 'San kwonomèt'),
        t('Trois essais avec indices', 'Twa esè ak endis'),
        t('Aucune note enregistrée', 'Pa gen nòt ki anrejistre'),
      ],
      primary: primaryKey === 'drill',
    },
    {
      href: '/quizzes?mode=quiz',
      icon: <Timer size={23} aria-hidden="true" />,
      eyebrow: t('Se tester', 'Teste tèt ou'),
      title: t('Faire un quiz de 10 questions', 'Fè yon kwiz 10 kesyon'),
      description: t(
        'Un ensemble fixe de 10 questions sur une unité, du début à la fin, avec votre score à l’arrivée.',
        'Yon seri fiks 10 kesyon sou yon inite, depi kòmansman jiska fen, ak nòt ou nan fen an.',
      ),
      facts: [
        t('10 questions, choisies dans l’unité', '10 kesyon, chwazi nan inite a'),
        t('Non chronométré', 'San kwonomèt'),
        t('Score affiché à la fin', 'Nòt parèt nan fen an'),
        t('Score non enregistré', 'Nòt la pa anrejistre'),
      ],
    },
  ];

  const examChoice: PracticeChoice = {
    href: examHref,
    icon: <ClipboardCheck size={23} aria-hidden="true" />,
    eyebrow: t('Épreuve officielle', 'Egzamen ofisyèl'),
    title: t('Passer un examen blanc', 'Pase yon egzamen blan'),
    description: t(
      'Un sujet officiel complet, avec ses consignes et son barème. Vous voyez la durée et le nombre de points avant de commencer.',
      'Yon sijè ofisyèl konplè, ak konsiy li ak barèm li. Ou wè dire a ak konbyen pwen anvan ou kòmanse.',
    ),
    facts: [
      t('Durée affichée avant de commencer', 'Dire a parèt anvan ou kòmanse'),
      t('Chronométré quand l’épreuve a une durée', 'Gen kwonomèt lè egzamen an gen yon dire'),
      t('Tentative et note enregistrées', 'Tantativ ak nòt anrejistre'),
      t('Compte requis pour enregistrer', 'Ou bezwen yon kont pou anrejistre'),
    ],
    primary: primaryKey === 'exam',
    aside: examsRelevant
      ? undefined
      : t(
          'Les épreuves officielles couvrent la 9ᵉ, le Baccalauréat et les concours. À votre niveau, l’entraînement ci-dessus est plus utile — l’accès reste ouvert.',
          'Egzamen ofisyèl yo se pou 9yèm, Bakaloreya ak konkou yo. Nan nivo ou, pratik anwo a pi itil — men aksè a rete ouvè.',
        ),
  };

  const trainingGroup = (
    <section className="practice-group" aria-labelledby="practice-train">
      <div className="practice-group__head">
        <h2 className="practice-group__title" id="practice-train">{t('S’entraîner', 'Pratike')}</h2>
        <p className="practice-group__purpose">
          {t(
            'Pour apprendre : aucune note n’est enregistrée, rien n’est chronométré, et la correction arrive tout de suite.',
            'Pou aprann : pa gen nòt ki anrejistre, pa gen kwonomèt, epi koreksyon an rive touswit.',
          )}
        </p>
      </div>
      <div className="practice-hub__grid">
        {trainingChoices.map((choice) => (
          <ChoiceCard key={choice.href} choice={choice} />
        ))}
      </div>
    </section>
  );

  const examGroup = (
    <section
      className={`practice-group${examsRelevant ? '' : ' practice-group--quiet'}`}
      aria-labelledby="practice-exam"
    >
      <div className="practice-group__head">
        <h2 className="practice-group__title" id="practice-exam">
          {t('Se mettre en conditions d’examen', 'Mete ou nan kondisyon egzamen')}
        </h2>
        <p className="practice-group__purpose">
          {t(
            'Ce n’est pas un quiz : un examen mesure où vous en êtes sur une épreuve entière, il est chronométré quand l’épreuve l’est, et votre tentative reste dans votre historique.',
            'Se pa yon kwiz : yon egzamen mezire kote ou ye sou yon eprèv antye, li gen kwonomèt lè eprèv la genyen youn, epi tantativ ou rete nan istorik ou.',
          )}
        </p>
      </div>
      <div className="practice-hub__grid practice-hub__grid--single">
        <ChoiceCard choice={examChoice} />
      </div>
      {examChoice.aside && <p className="practice-group__aside">{examChoice.aside}</p>}
    </section>
  );

  return (
    <section className="section practice-hub">
      <div className="container practice-hub__container">
        <header className="practice-hub__header">
          <span className="practice-hub__eyebrow">{t('Pratique', 'Pratik')}</span>
          <h1>{t('De quoi avez-vous besoin aujourd’hui ?', 'Kisa ou bezwen travay jodi a?')}</h1>
          <p>
            {t(
              'Chaque entrée dit ce qu’elle mesure, si elle est chronométrée et ce qui est enregistré, pour que vous choisissiez en connaissance de cause.',
              'Chak antre di sa l ap mezire, si gen kwonomèt epi kisa ki anrejistre, pou ou ka chwazi ak konesans.',
            )}
          </p>
        </header>

        <Suggestion evidence={evidence} t={t} onSignIn={toggleAuthModal} signedIn={!!userId} />

        {/* §5: grade emphasis is preserved as ORDER. NS4/9ᵉ/Post-Bac lead with
            the paper they are sitting; 7ᵉ/8ᵉ and NS1–NS3 (examLevel: null) lead
            with training and get the exam block quieted, never removed (§11:
            no feature becomes unreachable). */}
        {examsRelevant ? <>{examGroup}{trainingGroup}</> : <>{trainingGroup}{examGroup}</>}

        {/* Planning is neither training nor an exam, so it is a row, not a
            fifth equal-weight card. §6.1: a plan you made is not a
            recommendation, and the copy says who made it. */}
        <Link to="/study-plan" className="practice-plan">
          <span className="practice-plan__icon"><Hourglass size={20} aria-hidden="true" /></span>
          <span className="practice-plan__text">
            <span className="practice-plan__title">{t('Ouvrir mon plan d’étude', 'Louvri plan etid mwen')}</span>
            <span className="practice-plan__note">
              {t(
                'Créé par vous à partir de votre filière et de vos résultats · sans chronomètre · enregistré sur votre compte',
                'Ou menm ki kreye l ak filyè ou ak rezilta ou · san kwonomèt · anrejistre nan kont ou',
              )}
            </span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function ChoiceCard({ choice }: { choice: PracticeChoice }) {
  return (
    <Link
      to={choice.href}
      className={`practice-choice${choice.primary ? ' practice-choice--primary' : ''}`}
    >
      <span className="practice-choice__icon">{choice.icon}</span>
      <span className="practice-choice__eyebrow">{choice.eyebrow}</span>
      <h3 className="practice-choice__title">{choice.title}</h3>
      <p className="practice-choice__desc">{choice.description}</p>
      <span className="practice-choice__footer">
        {/* The facts stay in the DOM at every width: they are the reason to
            pick one entry over another, so the phone must not drop them. */}
        <ul className="practice-choice__facts">
          {choice.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        <ChevronRight size={18} aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * The one suggestion on this page — and the one place §3 is easiest to break.
 * Each branch renders only what the store actually returned; "we do not have
 * enough of your work" is a real answer with a real next action, never a
 * guessed subject.
 */
function Suggestion({
  evidence,
  t,
  onSignIn,
  signedIn,
}: {
  evidence: Evidence;
  t: (fr: string, ht: string) => string;
  onSignIn: () => void;
  signedIn: boolean;
}) {
  const eyebrow = t('Par où commencer', 'Kote pou kòmanse');

  if (evidence.kind === 'loading') {
    return (
      <div className="practice-suggest" aria-busy="true" role="status">
        <span className="practice-suggest__eyebrow">{eyebrow}</span>
        <p className="practice-suggest__body">
          {t('Nous lisons votre travail enregistré…', 'N ap li travay ou ki anrejistre…')}
        </p>
      </div>
    );
  }

  if (evidence.kind === 'signed-out') {
    return (
      <div className="practice-suggest">
        <span className="practice-suggest__eyebrow">{eyebrow}</span>
        <p className="practice-suggest__body">
          {t(
            'Sans compte, vos erreurs et vos leçons travaillées ne sont pas enregistrées — nous ne pouvons donc rien vous suggérer. Vous pouvez quand même vous entraîner ci-dessous.',
            'San yon kont, erè ou yo ak leson ou travay yo pa anrejistre — konsa nou pa ka sijere ou anyen. Ou ka toujou pratike anba a.',
          )}
        </p>
        {/* Signing in happens in a modal on this page, so the destination the
            student wanted is exactly where they already are (§8). */}
        <button type="button" className="practice-suggest__action" onClick={onSignIn}>
          {t('Se connecter', 'Konekte')}
        </button>
      </div>
    );
  }

  if (evidence.kind === 'unavailable') {
    return (
      <div className="practice-suggest" role="status">
        <span className="practice-suggest__eyebrow">{eyebrow}</span>
        <p className="practice-suggest__body">
          {t(
            'Nous n’arrivons pas à lire votre travail enregistré pour le moment. Les entrées ci-dessous fonctionnent toutes ; seule la suggestion manque.',
            'Nou pa rive li travay ou ki anrejistre kounye a. Tout antre anba yo ap mache ; se sèlman sijesyon an ki manke.',
          )}
        </p>
      </div>
    );
  }

  if (evidence.kind === 'review') {
    const n = evidence.count;
    return (
      <div className="practice-suggest practice-suggest--lead">
        <span className="practice-suggest__eyebrow">{eyebrow}</span>
        <p className="practice-suggest__body">
          {t(
            `${n} question${n === 1 ? '' : 's'} que vous avez ratée${n === 1 ? '' : 's'} vous attend${n === 1 ? '' : 'ent'}. Ce sont vos propres réponses, enregistrées pendant vos exercices.`,
            `${n} kesyon ou te rate ap tann ou. Se repons ou menm, ki anrejistre pandan egzèsis ou yo.`,
          )}
        </p>
        <Link className="practice-suggest__action" to="/revision">
          {t('Revoir mes erreurs', 'Revize erè m yo')}
        </Link>
      </div>
    );
  }

  if (evidence.kind === 'course') {
    const { name, href, started, total, mastered } = evidence;
    return (
      <div className="practice-suggest practice-suggest--lead">
        <span className="practice-suggest__eyebrow">{eyebrow}</span>
        <p className="practice-suggest__body">
          {t(
            `En ${name}, ${started} leçon${started === 1 ? '' : 's'} sur ${total} portent une trace de travail et ${mastered} ${mastered === 1 ? 'est maîtrisée' : 'sont maîtrisées'}. C’est ce que vos exercices enregistrent — pas un diagnostic de vos difficultés.`,
            `Nan ${name}, ${started} leson sou ${total} gen mak travay epi ${mastered} metrize. Se sa egzèsis ou yo anrejistre — se pa yon dyagnostik sou difikilte ou.`,
          )}
        </p>
        <Link className="practice-suggest__action" to={href}>
          {t(`S’entraîner en ${name}`, `Pratike nan ${name}`)}
        </Link>
      </div>
    );
  }

  // 'thin' — the honest state §6.4 asks for by name.
  return (
    <div className="practice-suggest">
      <span className="practice-suggest__eyebrow">{eyebrow}</span>
      <p className="practice-suggest__body">
        {signedIn
          ? t(
              'Nous n’avons pas encore assez de traces de votre travail pour vous suggérer une matière. Choisissez-en une : à partir de là, nous nous appuierons sur ce que vous ferez.',
              'Nou poko gen ase mak travay ou pou nou sijere ou yon matyè. Chwazi youn : apati la, n ap apiye sou sa w ap fè.',
            )
          : t(
              'Choisissez une matière pour commencer.',
              'Chwazi yon matyè pou kòmanse.',
            )}
      </p>
      <Link className="practice-suggest__action" to="/quizzes">
        {t('Choisir une matière', 'Chwazi yon matyè')}
      </Link>
    </div>
  );
}
