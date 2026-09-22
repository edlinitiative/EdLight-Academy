import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Brain,
  Calculator,
  ChevronRight,
  ClipboardCheck,
  Compass,
  Flame,
  FlaskConical,
  Hourglass,
  LineChart,
  ListChecks,
  Sparkles,
  Target,
  Timer,
  WifiOff,
  Zap,
} from 'lucide-react';
import useStore from '../contexts/store';
import { useAppData } from '../hooks/useData';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import DailyQuests from '../components/DailyQuests';
import { loadDueReviewIds } from '../services/reviewService';
import { readMastery } from '../services/masteryService';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { courseLessonIds, summarize } from '../../shared/mastery';
import { gradeProfile } from '../config/trackConfig';
import '../styles/pf.css';
import './Practice.css';

/**
 * /practice — the hub §6.4 asks for: choose by learning need, not by feature.
 *
 * Five things this page is required to get right, and how it does:
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
 *
 * 4. EVERY NUMBER ON THIS PAGE IS COUNTED, NEVER QUOTED. The subject and level
 *    chips are built from the courses the catalogue actually serves; the unit
 *    and lesson counts are `modules.length` on that course; the exam counts are
 *    rows of `/exam_catalog_index.json` filtered by level and subject, with the
 *    genuinely-absent `duration_minutes` reported as "non chronométré" rather
 *    than guessed. Nothing here is a marketing figure, so nothing here can go
 *    stale against the content.
 *
 * 5. POINTS AND STREAK ARE READ, NOT INVENTED, AND THEIR SCOPE IS STATED.
 *    XP comes from the gamification profile, which the games, the daily
 *    challenge and a finished daily quest write to. The streak comes from
 *    users/{uid}/streaks/global, which a saved exam attempt, the study plan, a
 *    game and a claimed quest write to — and practice quizzes, which save
 *    nothing, still do not. The strip says exactly that, because a "study
 *    streak" that silently ignores studying is a lie.
 *
 * 6. THE DAILY QUESTS BELOW THE STRIP COUNT, THEY DO NOT CLAIM. Each one's
 *    progress is derived from a timestamped record something else already
 *    wrote — see services/dailyQuests.ts, which is the whole argument.
 */

type Fact = string;

/** The six pf tones. Practice uses four, one per entry point, so the icon tile
 *  identifies the activity at a glance without introducing a hue of its own. */
type Tone = 'azure' | 'amber' | 'emerald' | 'rose' | 'violet' | 'slate';

type PracticeChoice = {
  href: string;
  icon: React.ReactNode;
  tone: Tone;
  eyebrow: string;
  title: string;
  description: string;
  /** Purpose/time/timed/saved — see the header comment. Rendered in full at every width. */
  facts: Fact[];
  /** One counted figure about the current subject/level, or null when we cannot count one. */
  stat?: string | null;
  primary?: boolean;
  /** Shown under the card when the activity is not the priority for this grade. */
  aside?: string;
};

/** gradeProfile().examLevel → the level's URL slug, so a student lands on their own papers. */
const EXAM_LEVEL_TO_SLUG: Record<string, string> = {
  baccalaureat: 'terminale',
  universite: 'university',
  '9eme_af': '9e',
};

/** A student's class → the catalog level that carries their programme. Mirrors
 *  the same four-entry literal in Quizzes.tsx and Courses.tsx: a label mapping,
 *  not state. 7ᵉ/8ᵉ/9ᵉ/Post-Bac have no `NS*` course of their own. */
const GRADE_TO_LEVEL: Record<string, string> = {
  NS1: 'NSI', NS2: 'NSII', NS3: 'NSIII', NS4: 'NSIV',
};

const LEVEL_ORDER = ['NSI', 'NSII', 'NSIII', 'NSIV'];

/** Subject codes as the catalogue emits them → the two names we need for them.
 *  `exam` is the literal `subject` string in exam_catalog_index.json, which is
 *  what /exams/:level/matiere/:subject matches on. */
const SUBJECTS: Record<string, { fr: string; ht: string; exam: string }> = {
  MATH: { fr: 'Mathématiques', ht: 'Matematik', exam: 'Mathématiques' },
  CHEM: { fr: 'Chimie', ht: 'Chimi', exam: 'Chimie' },
  PHYS: { fr: 'Physique', ht: 'Fizik', exam: 'Physique' },
  ECON: { fr: 'Économie', ht: 'Ekonomi', exam: 'Économie' },
};

/** Chip order when several subjects are open. Anything unlisted follows. */
const SUBJECT_ORDER = ['MATH', 'CHEM', 'PHYS', 'ECON'];

/** A glyph per subject, as the mockups' selector tiles carry one. Decoration
 *  only — the chip's own text is the accessible name, and a subject with no
 *  glyph simply renders without one. */
const SUBJECT_ICON: Record<string, React.ReactNode> = {
  MATH: <Calculator size={15} aria-hidden="true" />,
  CHEM: <FlaskConical size={15} aria-hidden="true" />,
  PHYS: <Zap size={15} aria-hidden="true" />,
  ECON: <LineChart size={15} aria-hidden="true" />,
};

/** Where the filter is remembered between visits. */
const FILTER_KEY = 'edlight.practice.filter';

/** French elision: "de Chimie" but "d’Économie". Creole needs no equivalent. */
function ofFr(name: string) {
  return /^[aàâeéèêiîoôuûyAÀÂEÉÈÊIÎOÔUÛY]/.test(name) ? `d’${name}` : `de ${name}`;
}

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

/** The slim browse index — same query key as /exams, so the two share one fetch. */
function useExamIndex() {
  return useQuery({
    queryKey: ['exam-catalog-index'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog_index.json');
      if (!res.ok) throw new Error('catalog index unavailable');
      return normalizeExamCatalog(await res.json()) as any[];
    },
    staleTime: Infinity,
  });
}

/** Last visit's subject/level, if the browser let us keep it. */
function readStoredFilter(): { subject: string; level: string } {
  try {
    const raw = localStorage.getItem(FILTER_KEY) || '';
    const [subject, level] = raw.split('|');
    return { subject: (subject || '').toUpperCase(), level: (level || '').toUpperCase() };
  } catch {
    return { subject: '', level: '' };
  }
}

export default function Practice() {
  const language = useStore((state) => state.language);
  const userId = useStore((state) => state.user?.uid);
  const grade = useStore((state) => state.grade);
  const toggleAuthModal = useStore((state) => state.toggleAuthModal);
  const isCreole = language === 'ht';
  const t = useCallback(
    (fr: string, ht: string) => (isCreole ? ht : fr),
    [isCreole],
  );

  const evidence = useEvidence();
  const profile = gradeProfile(grade);
  /** `examLevel: null` (7ᵉ/8ᵉ, NS1–NS3) means official papers are not this grade's errand. */
  const examsRelevant = profile.examLevel !== null;
  const examSlug = (profile.examLevel && EXAM_LEVEL_TO_SLUG[profile.examLevel]) || '';
  const myLevel = (grade && GRADE_TO_LEVEL[grade]) || '';

  // ── The filter: subject × level ───────────────────────────────────────────
  // Only courses the catalogue actually opens are offered. A `comingSoon`
  // course is real content that does not exist yet, so it cannot be a practice
  // target — it is named once, below the chips, instead of being a dead chip.
  const { data: appData, isError: coursesError, isLoading: coursesLoading } = useAppData();
  const courses: any[] = appData?.courses || [];
  const openCourses = useMemo(() => courses.filter((c) => !c.comingSoon), [courses]);

  const subjectOptions = useMemo(() => {
    const seen = new Set<string>(openCourses.map((c) => c.subject).filter(Boolean));
    const known = SUBJECT_ORDER.filter((s) => seen.has(s));
    const rest = Array.from(seen).filter((s) => !SUBJECT_ORDER.includes(s)).sort();
    return [...known, ...rest];
  }, [openCourses]);

  /** Subjects in the catalogue with nothing open yet — named, never offered. */
  const pendingSubjects = useMemo(() => {
    const open = new Set(subjectOptions);
    const seen = new Set<string>(
      courses.filter((c) => c.comingSoon && c.subject && !open.has(c.subject)).map((c) => c.subject),
    );
    return Array.from(seen);
  }, [courses, subjectOptions]);

  const levelsFor = useCallback(
    (subj: string) => {
      const set = new Set<string>(openCourses.filter((c) => c.subject === subj).map((c) => c.level));
      const known = LEVEL_ORDER.filter((l) => set.has(l));
      const rest = Array.from(set).filter((l) => !LEVEL_ORDER.includes(l)).sort();
      return [...known, ...rest];
    },
    [openCourses],
  );

  // Read once, at mount, so writing the URL below can never feed back into the
  // resolution and start a loop. A deep link wins; then the last visit; then
  // the student's own class.
  const [requested] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    const stored = readStoredFilter();
    return {
      subject: (sp.get('matiere') || stored.subject || '').toUpperCase(),
      level: (sp.get('niveau') || stored.level || '').toUpperCase(),
    };
  });

  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');
  const [, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!subjectOptions.length) return;

    let nextSubject = subjectOptions.includes(subject) ? subject : '';
    if (!nextSubject && subjectOptions.includes(requested.subject)) nextSubject = requested.subject;
    if (!nextSubject) {
      // The student's own class leads: the first subject that actually ships a
      // course at their level, and only then the first subject at all.
      nextSubject =
        subjectOptions.find((s) => openCourses.some((c) => c.subject === s && c.level === myLevel)) ||
        subjectOptions[0];
    }

    const levels = levelsFor(nextSubject);
    const keep = nextSubject === subject ? level : '';
    let nextLevel = levels.includes(keep) ? keep : '';
    if (!nextLevel && levels.includes(requested.level)) nextLevel = requested.level;
    if (!nextLevel) nextLevel = levels.includes(myLevel) ? myLevel : levels[0] || '';

    if (nextSubject !== subject) setSubject(nextSubject);
    if (nextLevel !== level) setLevel(nextLevel);
  }, [subjectOptions, openCourses, levelsFor, myLevel, requested, subject, level]);

  // The choice rides in the URL (so it survives a reload and can be shared) and
  // in localStorage (so it survives leaving the page). Both writes are
  // best-effort; a browser that refuses storage just forgets.
  useEffect(() => {
    if (!subject || !level) return;
    try {
      localStorage.setItem(FILTER_KEY, `${subject}|${level}`);
    } catch {
      /* private mode / blocked storage — the page works without it */
    }
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('matiere') === subject && sp.get('niveau') === level) return;
    sp.set('matiere', subject);
    sp.set('niveau', level);
    setSearchParams(sp, { replace: true });
  }, [subject, level, setSearchParams]);

  const levelOptions = useMemo(() => levelsFor(subject), [levelsFor, subject]);
  const subjectName = subject ? t(SUBJECTS[subject]?.fr || subject, SUBJECTS[subject]?.ht || subject) : '';
  const levelLabel = level ? level.replace(/^NS(.*)$/i, 'NS $1') : '';
  const scopeLabel = subjectName && levelLabel ? `${subjectName} · ${levelLabel}` : subjectName;

  /** The selected course, and what it really holds. */
  const selected = useMemo(
    () => openCourses.find((c) => c.subject === subject && c.level === level) || null,
    [openCourses, subject, level],
  );
  const unitCount = selected ? (selected.modules || []).length : 0;
  const lessonCount = selected
    ? (selected.modules || []).reduce((n: number, m: any) => n + (m.lessons?.length || 0), 0)
    : 0;

  const courseCode = subject && level ? `${subject}-${level}` : '';
  const quizHref = courseCode ? `/quizzes?course=${encodeURIComponent(courseCode)}` : '/quizzes';
  const quizTenHref = courseCode
    ? `/quizzes?course=${encodeURIComponent(courseCode)}&mode=quiz`
    : '/quizzes?mode=quiz';

  // ── Exams: counted from the catalogue, never quoted ───────────────────────
  const examIndex = useExamIndex();
  const examStat = useMemo(() => {
    if (!examsRelevant || !profile.examLevel) return null;
    if (examIndex.isPending) return { kind: 'loading' as const };
    if (examIndex.isError || !Array.isArray(examIndex.data)) return { kind: 'unavailable' as const };
    const rows = examIndex.data.filter((e) => e?.level === profile.examLevel);
    const examName = subject ? SUBJECTS[subject]?.exam : '';
    const mine = examName ? rows.filter((e) => e?.subject === examName) : [];
    return {
      kind: 'ready' as const,
      atLevel: rows.length,
      mine: mine.length,
      // 83 of the 530 catalog entries genuinely carry no duration, and ExamTake
      // starts no countdown without one — so they are reported as untimed.
      untimed: mine.filter((e) => !e?.duration_minutes).length,
    };
  }, [examsRelevant, profile.examLevel, examIndex.isPending, examIndex.isError, examIndex.data, subject]);

  const examHref = useMemo(() => {
    if (!examSlug) return '/exams';
    const examName = subject ? SUBJECTS[subject]?.exam : '';
    if (examStat?.kind === 'ready' && examStat.mine > 0 && examName) {
      return `/exams/${examSlug}/matiere/${encodeURIComponent(examName)}`;
    }
    return `/exams/${examSlug}`;
  }, [examSlug, subject, examStat]);

  const dueCount = evidence.kind === 'review' ? evidence.count : 0;
  /** Exactly one card is visually strongest (§7). Mistakes win when there are any. */
  const primaryKey = dueCount > 0 ? 'review' : examsRelevant ? 'exam' : 'drill';

  const trainingChoices: PracticeChoice[] = [
    {
      href: '/revision',
      icon: <Brain size={23} aria-hidden="true" />,
      tone: 'amber',
      eyebrow: t('À partir de vos erreurs', 'Soti nan erè ou yo'),
      title: t('Revoir ce que vous avez manqué', 'Revize sa ou te rate'),
      description: t(
        'Une session bâtie uniquement avec les questions d’entraînement que vous avez ratées, toutes matières confondues. Une bonne réponse retire la question de la liste.',
        'Yon sesyon ki fèt sèlman ak kesyon pratik ou te rate yo, nan tout matyè. Yon bon repons retire kesyon an nan lis la.',
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
      // The review list is the quiz bank, never an exam paper, and it is not
      // filtered by the chips above. Both facts are stated rather than implied.
      stat: t(
        'Questions d’entraînement uniquement — pas les épreuves d’examen · toutes matières',
        'Se kesyon pratik sèlman — pa eprèv egzamen · tout matyè',
      ),
      primary: primaryKey === 'review',
    },
    {
      href: quizHref,
      icon: <ListChecks size={23} aria-hidden="true" />,
      tone: 'azure',
      eyebrow: t('Série courte', 'Seri kout'),
      title: scopeLabel
        ? t(`S’entraîner en ${scopeLabel}`, `Pratike nan ${scopeLabel}`)
        : t('S’entraîner par matière', 'Pratike pa matyè'),
      description: t(
        'Les questions arrivent une par une, avec la correction tout de suite. Vous choisissez l’unité et vous arrêtez quand vous voulez.',
        'Kesyon yo vini youn apre lòt, ak koreksyon an touswit. Ou chwazi inite a epi ou kanpe lè ou vle.',
      ),
      facts: [
        t('Une question à la fois, autant que vous voulez', 'Yon kesyon alafwa, otan ou vle'),
        t('Non chronométré', 'San kwonomèt'),
        t('Trois essais avec indices', 'Twa esè ak endis'),
        t('Aucune note enregistrée', 'Pa gen nòt ki anrejistre'),
      ],
      stat:
        unitCount > 0
          ? t(
              `${unitCount} unité${unitCount === 1 ? '' : 's'} · ${lessonCount} leçon${lessonCount === 1 ? '' : 's'} en ${scopeLabel}`,
              `${unitCount} inite · ${lessonCount} leson nan ${scopeLabel}`,
            )
          : null,
      primary: primaryKey === 'drill',
    },
    {
      href: quizTenHref,
      icon: <Timer size={23} aria-hidden="true" />,
      tone: 'violet',
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
      stat: scopeLabel
        ? t(`Sur une unité ${ofFr(scopeLabel)}`, `Sou yon inite nan ${scopeLabel}`)
        : null,
    },
  ];

  const examStatLine = (() => {
    if (!examStat) return null;
    if (examStat.kind === 'loading') {
      return t('Nous comptons les épreuves disponibles…', 'N ap konte eprèv ki disponib yo…');
    }
    if (examStat.kind === 'unavailable') {
      return t(
        'La liste des épreuves ne se charge pas pour l’instant — le lien fonctionne quand même.',
        'Lis eprèv yo pa chaje kounye a — men lyen an ap mache kanmenm.',
      );
    }
    if (examStat.mine === 0) {
      return t(
        `Aucune épreuve ${ofFr(subjectName)} à ce niveau. Le lien ouvre les ${examStat.atLevel} épreuves du niveau, toutes matières.`,
        `Pa gen eprèv ${subjectName} nan nivo sa a. Lyen an ouvri tout ${examStat.atLevel} eprèv nivo a, nan tout matyè.`,
      );
    }
    const timed = examStat.mine - examStat.untimed;
    const n = examStat.mine;
    const s = n === 1 ? '' : 's';
    // Three shapes, because "0 sans durée" is noise and "toutes chronométrées"
    // would be a lie on the 83 papers whose duration_minutes is genuinely null.
    if (examStat.untimed === 0) {
      return t(
        `${n} épreuve${s} ${ofFr(subjectName)}, toutes avec une durée officielle`,
        `${n} eprèv ${subjectName}, tout gen yon dire ofisyèl`,
      );
    }
    if (timed === 0) {
      return t(
        `${n} épreuve${s} ${ofFr(subjectName)} · aucune n’a de durée officielle, donc aucune n’est chronométrée`,
        `${n} eprèv ${subjectName} · pa gen youn ki gen dire ofisyèl, donk pa gen kwonomèt`,
      );
    }
    return t(
      `${n} épreuves ${ofFr(subjectName)} · ${timed} chronométrées, ${examStat.untimed} sans durée officielle (non chronométrée${examStat.untimed === 1 ? '' : 's'})`,
      `${n} eprèv ${subjectName} · ${timed} ak kwonomèt, ${examStat.untimed} san dire ofisyèl (san kwonomèt)`,
    );
  })();

  const examChoice: PracticeChoice = {
    href: examHref,
    icon: <ClipboardCheck size={23} aria-hidden="true" />,
    tone: 'emerald',
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
    stat: examStatLine,
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
    <section className="section practice-hub pf">
      <div className="container practice-hub__container">
        {/* A heading and the suggestion, not a hero.
            It WAS a wash panel 378px tall on desktop and 504px on a phone: a
            pill eyebrow, a 2.65rem display heading and a paragraph explaining
            that each entry states what it measures — which every entry below
            then states for itself. The filter bar landed at 542px / 606px.

            Ted: "the hero is too big - i want people to start taking action as
            soon as they are on the page". So the eyebrow and the paragraph are
            gone and the heading is one line. The suggestion card stays and is
            now the first thing under it, because it is the only element here
            addressed to this student in particular — it is the action. */}
        <div className="practice-hero">
          <header className="practice-hub__header">
            <h1>{t('De quoi avez-vous besoin aujourd’hui ?', 'Kisa ou bezwen travay jodi a?')}</h1>
          </header>

          <Suggestion evidence={evidence} t={t} onSignIn={toggleAuthModal} signedIn={!!userId} />
        </div>

        {userId && <ProgressStrip t={t} />}

        {/* Two or three missions for today, each one's progress derived from a
            record the app already writes, each expiring at the same local
            midnight the streak uses. Renders nothing for a signed-out visitor
            — see components/DailyQuests.tsx. */}
        <DailyQuests />

        <FilterBar
          t={t}
          subject={subject}
          level={level}
          subjectOptions={subjectOptions}
          levelOptions={levelOptions}
          pendingSubjects={pendingSubjects}
          myLevel={myLevel}
          loading={coursesLoading && !appData}
          failed={coursesError && openCourses.length === 0}
          onSubject={setSubject}
          onLevel={setLevel}
        />

        {/* §5: grade emphasis is preserved as ORDER. NS4/9ᵉ/Post-Bac lead with
            the paper they are sitting; 7ᵉ/8ᵉ and NS1–NS3 (examLevel: null) lead
            with training and get the exam block quieted, never removed (§11:
            no feature becomes unreachable). */}
        {examsRelevant ? <>{examGroup}{trainingGroup}</> : <>{trainingGroup}{examGroup}</>}

        <SampleQuestion t={t} isCreole={isCreole} subject={subject} href={quizHref} scope={scopeLabel} />

        <p className="practice-offline">
          <span className="pf-tile pf-tile--slate pf-tile--sm" aria-hidden="true">
            <WifiOff size={15} />
          </span>
          <span>
            {t(
              'Réseau coupé : les pages et les sujets d’examen déjà ouverts restent lisibles, parce qu’ils sont gardés sur votre appareil. Une série de questions jamais ouverte, elle, a besoin du réseau, et rien n’est enregistré tant qu’il n’est pas revenu.',
              'Lè rezo a koupe : paj yo ak sijè egzamen ou te deja louvri rete lizib, paske yo sere sou aparèy ou. Men yon seri kesyon ou pa t janm louvri bezwen rezo, epi anyen pa anrejistre toutotan rezo a pa tounen.',
            )}
          </span>
        </p>

        {/* Planning is neither training nor an exam, so it is a row, not a
            fifth equal-weight card. §6.1: a plan you made is not a
            recommendation, and the copy says who made it. */}
        <Link to="/study-plan" className="practice-plan">
          <span className="pf-tile pf-tile--azure pf-tile--md practice-plan__icon" aria-hidden="true">
            <Hourglass size={20} />
          </span>
          <span className="practice-plan__text">
            <span className="practice-plan__title">{t('Ouvrir mon plan d’étude', 'Louvri plan etid mwen')}</span>
            <span className="practice-plan__note">
              {t(
                'Créé par vous à partir de votre filière et de vos résultats · sans chronomètre · enregistré sur votre compte',
                'Ou menm ki kreye l ak filyè ou ak rezilta ou · san kwonomèt · anrejistre nan kont ou',
              )}
            </span>
          </span>
          <ChevronRight size={18} aria-hidden="true" className="practice-plan__chev" />
        </Link>
      </div>
    </section>
  );
}

/**
 * Subject × level, above everything it scopes.
 *
 * The chips are the catalogue, not a menu someone typed: a subject appears
 * because a course of that subject is open, and a level appears because that
 * subject ships it. That is why there is no "toutes matières" chip — it would
 * promise a shape of practice the quiz screen cannot take.
 *
 * Level is encoded by how much of the one azure the chip carries (§ palette:
 * one accent), not by a per-level hue. The student's own class is marked.
 */
function FilterBar({
  t,
  subject,
  level,
  subjectOptions,
  levelOptions,
  pendingSubjects,
  myLevel,
  loading,
  failed,
  onSubject,
  onLevel,
}: {
  t: (fr: string, ht: string) => string;
  subject: string;
  level: string;
  subjectOptions: string[];
  levelOptions: string[];
  pendingSubjects: string[];
  myLevel: string;
  loading: boolean;
  failed: boolean;
  onSubject: (s: string) => void;
  onLevel: (l: string) => void;
}) {
  if (loading) {
    return (
      <div className="practice-filter practice-filter--flat" role="status" aria-busy="true">
        <p className="practice-filter__note">
          {t('Nous chargeons les matières ouvertes…', 'N ap chaje matyè ki ouvè yo…')}
        </p>
      </div>
    );
  }

  if (failed || subjectOptions.length === 0) {
    return (
      <div className="practice-filter practice-filter--flat" role="status">
        <p className="practice-filter__note">
          {failed
            ? t(
                'Le catalogue ne se charge pas, donc nous ne pouvons pas vous proposer de matière ici. Les entrées ci-dessous fonctionnent et vous laisseront choisir sur place.',
                'Katalòg la pa chaje, konsa nou pa ka pwopoze ou yon matyè isit la. Antre anba yo ap mache epi w ap chwazi sou plas.',
              )
            : t(
                'Aucune matière n’est encore ouverte. Les entrées ci-dessous restent accessibles.',
                'Pa gen matyè ki ouvè ankò. Antre anba yo rete aksesib.',
              )}
        </p>
      </div>
    );
  }

  return (
    <div className="practice-filter">
      <div className="practice-filter__row">
        <span className="practice-filter__label" id="practice-filter-subject">
          {t('Matière', 'Matyè')}
        </span>
        <div className="practice-filter__chips" role="group" aria-labelledby="practice-filter-subject">
          {subjectOptions.map((code) => (
            <button
              key={code}
              type="button"
              className={`practice-chip practice-chip--subject${code === subject ? ' is-on' : ''}`}
              aria-pressed={code === subject}
              onClick={() => onSubject(code)}
            >
              {SUBJECT_ICON[code] && (
                <span className="practice-chip__glyph">{SUBJECT_ICON[code]}</span>
              )}
              {t(SUBJECTS[code]?.fr || code, SUBJECTS[code]?.ht || code)}
            </button>
          ))}
        </div>
      </div>

      <div className="practice-filter__row">
        <span className="practice-filter__label" id="practice-filter-level">
          {t('Niveau', 'Nivo')}
        </span>
        <div className="practice-filter__chips" role="group" aria-labelledby="practice-filter-level">
          {levelOptions.map((code) => {
            const rank = LEVEL_ORDER.indexOf(code);
            return (
              <button
                key={code}
                type="button"
                className={`practice-chip practice-chip--level${code === level ? ' is-on' : ''}`}
                data-rank={rank >= 0 ? rank + 1 : 0}
                aria-pressed={code === level}
                onClick={() => onLevel(code)}
              >
                {code.replace(/^NS(.*)$/i, 'NS $1')}
                {code === myLevel && (
                  <span className="practice-chip__mine">{t('votre classe', 'klas ou')}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="practice-filter__note">
        {t(
          'Ce choix suit : les entrées ci-dessous, l’exemple en bas de page et votre prochaine visite.',
          'Chwa sa a swiv ou : antre anba yo, egzanp ki nan pye paj la, ak pwochèn vizit ou.',
        )}
        {pendingSubjects.length > 0 && ' '}
        {pendingSubjects.length > 0 &&
          t(
            `${pendingSubjects.map((c) => SUBJECTS[c]?.fr || c).join(', ')} : les cours sont écrits mais aucune leçon n’est encore ouverte.`,
            `${pendingSubjects.map((c) => SUBJECTS[c]?.ht || c).join(', ')} : kou yo ekri men pa gen leson ki ouvè ankò.`,
          )}
      </p>
    </div>
  );
}

/**
 * Points, streak and the daily challenge — read from the two stores that own
 * them, and never shown to a signed-out visitor, because for them the numbers
 * would be zeros that mean nothing rather than zeros that mean "not yet".
 *
 * The scope line is the point of the strip. XP is written by the games, the
 * daily challenge and now a finished daily quest (triviaService). The streak is
 * written by a saved exam attempt, the study plan, a game and a claimed quest
 * (streakService.recordActivity) — and still NOT by the practice quizzes
 * themselves, which save nothing at all: DirectBankQuiz records the missed
 * question and stops there. A student who sees "0" after an hour of quizzes
 * deserves to be told why, not left to conclude the app lost their work.
 */
function ProgressStrip({ t }: { t: (fr: string, ht: string) => string }) {
  const { profile, isLoading: triviaLoading, level, daily } = useTrivia();
  const { streak, isLoading: streakLoading } = useStreak();

  if (triviaLoading || streakLoading) {
    return (
      <div className="practice-strip practice-strip--loading" role="status" aria-busy="true">
        <p className="practice-strip__note">
          {t('Nous lisons vos points et votre série…', 'N ap li pwen ou yo ak seri ou…')}
        </p>
      </div>
    );
  }

  const xp = profile?.xp || 0;
  const days = streak?.currentStreak || 0;

  return (
    <div className="practice-strip">
      {/* The mockups' stat tile: caps micro-label, a pastel glyph opposite it,
          the figure below in the heading face. The figure is whatever the store
          returned — including the sentence that says there is none yet. */}
      <dl className="practice-strip__stats">
        <div className="practice-strip__stat">
          <dt>
            <span>{t('Points', 'Pwen')}</span>
            <span className="pf-tile pf-tile--azure pf-tile--sm" aria-hidden="true">
              <Sparkles size={14} />
            </span>
          </dt>
          <dd>
            {xp > 0
              ? t(`${xp} XP · niveau ${level.level}`, `${xp} XP · nivo ${level.level}`)
              : t('Aucun point encore', 'Poko gen pwen')}
          </dd>
        </div>
        <div className="practice-strip__stat">
          <dt>
            <span>{t('Série', 'Seri')}</span>
            <span className="pf-tile pf-tile--amber pf-tile--sm" aria-hidden="true">
              <Flame size={14} />
            </span>
          </dt>
          <dd>
            {days > 0
              ? t(`${days} jour${days === 1 ? '' : 's'} de suite`, `${days} jou youn dèyè lòt`)
              : t('Aucune série en cours', 'Pa gen seri k ap mache')}
          </dd>
        </div>
        <div className="practice-strip__stat">
          <dt>
            <span>{t('Défi du jour', 'Defi jodi a')}</span>
            <span className="pf-tile pf-tile--emerald pf-tile--sm" aria-hidden="true">
              <Target size={14} />
            </span>
          </dt>
          <dd>
            {daily.completedToday
              ? t(`Fait — ${daily.score}/${daily.total}`, `Fèt — ${daily.score}/${daily.total}`)
              : t('Pas encore fait', 'Poko fèt')}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ── The playable example ────────────────────────────────────────────────────

type Bilingual = { fr: string; ht: string };

type Sample = {
  /** The real unit this exercise represents — it exists in the catalogue. */
  unit: Bilingual;
  course: string;
  question: Bilingual;
  choices: Bilingual[];
  answer: number;
  /** Why each choice is what it is. The wrong ones are the mistakes the unit is about. */
  why: Bilingual[];
};

/**
 * One exercise per open subject, written to represent a real unit — NOT lifted
 * from a past State paper, and never presented as one. Same contract as the
 * homepage's sample: it explains every wrong option, it links to the unit, and
 * it produces no score, no level and no readiness signal. One question tells a
 * student nothing about their Bac and the copy never suggests it does.
 */
const SAMPLES: Record<string, Sample> = {
  MATH: {
    unit: { fr: 'Mathématiques NS1 · Nombres, Calcul et Proportionnalité', ht: 'Matematik NS1 · Nonb, Kalkil ak Pwopòsyonalite' },
    course: '/courses/math-ns1',
    question: {
      fr: 'Le prix d’un cahier passe de 250 gourdes à 300 gourdes. De quel pourcentage a-t-il augmenté ?',
      ht: 'Pri yon kaye pase de 250 goud a 300 goud. Ki pousantaj li monte?',
    },
    choices: [
      { fr: '50 %', ht: '50 %' },
      { fr: '20 %', ht: '20 %' },
      { fr: '120 %', ht: '120 %' },
      { fr: '16,7 %', ht: '16,7 %' },
    ],
    answer: 1,
    why: [
      {
        fr: '50, c’est l’augmentation en gourdes (300 − 250), pas un pourcentage. Un pourcentage se calcule toujours par rapport au prix de départ.',
        ht: '50, se monte a an goud (300 − 250), se pa yon pousantaj. Yon pousantaj toujou kalkile parapò ak pri depa a.',
      },
      {
        fr: 'Augmentation = 300 − 250 = 50. Rapportée au prix de départ : 50 ÷ 250 = 0,2, soit 20 %.',
        ht: 'Monte a = 300 − 250 = 50. Parapò ak pri depa a : 50 ÷ 250 = 0,2, sa vle di 20 %.',
      },
      {
        fr: '300 ÷ 250 = 1,20, donc le nouveau prix vaut 120 % de l’ancien. L’augmentation, c’est ce qui dépasse 100 % : 20 %.',
        ht: '300 ÷ 250 = 1,20, donk nouvo pri a se 120 % ansyen an. Monte a se sa ki depase 100 % : 20 %.',
      },
      {
        fr: 'C’est 50 ÷ 300, donc un calcul fait sur le nouveau prix. C’est la baisse qu’il faudrait pour revenir à 250, pas la hausse.',
        ht: 'Sa se 50 ÷ 300, donk yon kalkil ki fèt sou nouvo pri a. Se bès ki ta nesesè pou tounen 250, se pa monte a.',
      },
    ],
  },
  CHEM: {
    unit: { fr: 'Chimie NS1 · Grandeurs et Mesures', ht: 'Chimi NS1 · Grandè ak Mezi' },
    course: '/courses/chem-ns1',
    question: {
      fr: 'Un morceau de fer a une masse de 79 g et un volume de 10 cm³. Quelle est sa masse volumique ?',
      ht: 'Yon moso fè gen yon mas 79 g ak yon volim 10 cm³. Ki mas volimik li?',
    },
    choices: [
      { fr: '790 g/cm³', ht: '790 g/cm³' },
      { fr: '7,9 g/cm³', ht: '7,9 g/cm³' },
      { fr: '89 g/cm³', ht: '89 g/cm³' },
      { fr: '0,13 g/cm³', ht: '0,13 g/cm³' },
    ],
    answer: 1,
    why: [
      {
        fr: 'C’est 79 × 10. La masse volumique est une division, pas une multiplication : elle dit combien pèse UN centimètre cube.',
        ht: 'Sa se 79 × 10. Mas volimik se yon divizyon, se pa yon miltiplikasyon : li di konbyen YON santimèt kib peze.',
      },
      {
        fr: 'ρ = m ÷ V = 79 ÷ 10 = 7,9 g/cm³. C’est bien l’ordre de grandeur du fer.',
        ht: 'ρ = m ÷ V = 79 ÷ 10 = 7,9 g/cm³. Se byen valè ki nòmal pou fè.',
      },
      {
        fr: 'C’est 79 + 10. On n’additionne pas une masse et un volume : ce sont deux grandeurs différentes, avec deux unités différentes.',
        ht: 'Sa se 79 + 10. Ou pa adisyone yon mas ak yon volim : se de grandè diferan, ak de inite diferan.',
      },
      {
        fr: 'C’est 10 ÷ 79, la division à l’envers. Ce rapport-là donne un volume par gramme, pas une masse par centimètre cube.',
        ht: 'Sa se 10 ÷ 79, divizyon an alanvè. Rapò sa a bay yon volim pou chak gram, se pa yon mas pou chak santimèt kib.',
      },
    ],
  },
  ECON: {
    unit: { fr: 'Économie NS2 · Consommation et Épargne', ht: 'Ekonomi NS2 · Konsomasyon ak Epay' },
    course: '/courses/econ-ns2',
    question: {
      fr: 'Un ménage dispose d’un revenu de 40 000 gourdes par mois et en consomme 34 000. Quelle est sa propension moyenne à épargner ?',
      ht: 'Yon fanmi gen yon revni 40 000 goud pa mwa epi li depanse 34 000 ladan l. Ki pwopansyon mwayèn li pou l fè epay?',
    },
    choices: [
      { fr: '0,85', ht: '0,85' },
      { fr: '6 000 gourdes', ht: '6 000 goud' },
      { fr: '0,15', ht: '0,15' },
      { fr: '0,18', ht: '0,18' },
    ],
    answer: 2,
    why: [
      {
        fr: 'C’est 34 000 ÷ 40 000, la propension moyenne à CONSOMMER. Les deux propensions s’additionnent toujours à 1 : celle d’épargner est donc 1 − 0,85.',
        ht: 'Sa se 34 000 ÷ 40 000, pwopansyon mwayèn pou KONSOME. De pwopansyon yo toujou fè 1 ansanm : sa pou fè epay la se 1 − 0,85.',
      },
      {
        fr: 'C’est bien l’épargne (40 000 − 34 000), mais en gourdes. Une propension est un rapport : elle n’a pas d’unité.',
        ht: 'Se byen epay la (40 000 − 34 000), men an goud. Yon pwopansyon se yon rapò : li pa gen inite.',
      },
      {
        fr: 'Épargne = 40 000 − 34 000 = 6 000. Rapportée au revenu : 6 000 ÷ 40 000 = 0,15.',
        ht: 'Epay = 40 000 − 34 000 = 6 000. Parapò ak revni an : 6 000 ÷ 40 000 = 0,15.',
      },
      {
        fr: 'C’est 6 000 ÷ 34 000 : l’épargne rapportée à la consommation. La propension se calcule toujours sur le revenu.',
        ht: 'Sa se 6 000 ÷ 34 000 : epay la parapò ak konsomasyon an. Pwopansyon an toujou kalkile sou revni an.',
      },
    ],
  },
};

/**
 * A question you can actually answer, before you have chosen anything.
 *
 * It follows the subject chosen above, and its correction explains every option
 * rather than only marking one right — that is the difference between teaching
 * and testing, and it is the same contract as the homepage's sample. What it
 * deliberately does NOT do: score you, estimate a level, or claim to be a Bac
 * question. The real papers are a separate thing and are linked separately.
 */
function SampleQuestion({
  t,
  isCreole,
  subject,
  href,
  scope,
}: {
  t: (fr: string, ht: string) => string;
  isCreole: boolean;
  subject: string;
  href: string;
  scope: string;
}) {
  const setLanguage = useStore((s) => s.setLanguage);
  const [picked, setPicked] = useState<number | null>(null);

  // Reset when the student switches subject: a correction for the previous
  // subject's question next to this subject's question would be nonsense.
  useEffect(() => { setPicked(null); }, [subject]);

  const sample = SAMPLES[subject];
  if (!sample) return null;

  const lang = (b: Bilingual) => (isCreole ? b.ht : b.fr);
  const answered = picked !== null;

  return (
    <section className="practice-sample" aria-labelledby="practice-sample-title">
      <div className="practice-sample__head">
        <h2 className="practice-sample__title" id="practice-sample-title">
          {t('À quoi ressemble une question', 'Kijan yon kesyon ye')}
        </h2>
        <p className="practice-sample__lede">
          {t(
            'Un exercice écrit pour cette unité, comme ceux des séries ci-dessus. Changez de langue : la question, les réponses et la correction suivent. Ce n’est pas une question du Bac et rien n’est noté ici.',
            'Yon egzèsis ki ekri pou inite sa a, tankou sa ki nan seri anwo yo. Chanje lang : kesyon an, repons yo ak koreksyon an swiv. Se pa yon kesyon Bak epi anyen pa note isit la.',
          )}
        </p>
      </div>

      <div className="practice-sample__card">
        <div className="practice-sample__bar">
          <span className="pf-pill pf-pill--azure practice-sample__source">{lang(sample.unit)}</span>
          <div className="practice-sample__lang" role="group" aria-label={t('Langue', 'Lang')}>
            <button
              type="button"
              className={`practice-sample__lang-btn${!isCreole ? ' is-on' : ''}`}
              aria-pressed={!isCreole}
              onClick={() => setLanguage('fr')}
            >
              Français
            </button>
            <button
              type="button"
              className={`practice-sample__lang-btn${isCreole ? ' is-on' : ''}`}
              aria-pressed={isCreole}
              onClick={() => setLanguage('ht')}
            >
              Kreyòl
            </button>
          </div>
        </div>

        <div className="practice-sample__stage">
          <p className="practice-sample__question">{lang(sample.question)}</p>
        </div>

        <ul className="practice-sample__choices">
          {sample.choices.map((choice, i) => {
            const isAnswer = i === sample.answer;
            const isPicked = i === picked;
            const state = !answered ? '' : isAnswer ? ' is-answer' : isPicked ? ' is-picked' : ' is-dim';
            return (
              <li key={i}>
                <button
                  type="button"
                  className={`practice-sample__choice${state}`}
                  onClick={() => !answered && setPicked(i)}
                  disabled={answered}
                >
                  <span className="practice-sample__mark" aria-hidden="true">
                    {answered && isAnswer ? '✓' : answered && isPicked ? '✕' : String.fromCharCode(65 + i)}
                  </span>
                  <span className="practice-sample__label">{lang(choice)}</span>
                  <span className="practice-sample__dot" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>

        {answered ? (
          <div className="practice-sample__why" role="status">
            <p className="practice-sample__verdict">
              <span
                className={`pf-pill pf-pill--${picked === sample.answer ? 'emerald' : 'amber'}`}
              >
                {picked === sample.answer ? t('C’est juste.', 'Se sa menm.') : t('Pas tout à fait.', 'Pa fin kòrèk.')}
              </span>
            </p>
            {/* The student's own answer is explained first, because that is the
                one they need; the worked solution follows. */}
            <p>{lang(sample.why[picked as number])}</p>
            {picked !== sample.answer && <p>{lang(sample.why[sample.answer])}</p>}

            <div className="practice-sample__after">
              <Link className="practice-sample__cta" to={href}>
                {scope
                  ? t(`S’entraîner en ${scope}`, `Pratike nan ${scope}`)
                  : t('S’entraîner', 'Pratike')}
              </Link>
              <Link className="practice-sample__link" to={sample.course}>
                {t('Ouvrir le cours', 'Louvri kou a')}
              </Link>
              <button type="button" className="practice-sample__link" onClick={() => setPicked(null)}>
                {t('Recommencer', 'Rekòmanse')}
              </button>
            </div>
          </div>
        ) : (
          <p className="practice-sample__hint">
            {t(
              'Choisissez une réponse — la correction explique aussi les trois autres.',
              'Chwazi yon repons — koreksyon an esplike twa lòt yo tou.',
            )}
          </p>
        )}
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
      <span
        className={`pf-tile pf-tile--${choice.tone} pf-tile--md practice-choice__icon`}
        aria-hidden="true"
      >
        {choice.icon}
      </span>
      <span className="practice-choice__eyebrow">{choice.eyebrow}</span>
      <h3 className="practice-choice__title">{choice.title}</h3>
      <p className="practice-choice__desc">{choice.description}</p>
      {/* A counted figure about what this entry actually contains. It is
          omitted, not faked, when nothing can be counted. */}
      {choice.stat && <span className="practice-choice__stat">{choice.stat}</span>}
      <span className="practice-choice__footer">
        {/* The facts stay in the DOM at every width: they are the reason to
            pick one entry over another, so the phone must not drop them. */}
        <ul className="practice-choice__facts">
          {choice.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        <ChevronRight size={18} aria-hidden="true" className="practice-choice__chev" />
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
  const eyebrow = (
    <span className="practice-suggest__head">
      <span className="pf-tile pf-tile--azure pf-tile--sm" aria-hidden="true">
        <Compass size={14} />
      </span>
      <span className="practice-suggest__eyebrow">{t('Par où commencer', 'Kote pou kòmanse')}</span>
    </span>
  );

  if (evidence.kind === 'loading') {
    return (
      <div className="practice-suggest" aria-busy="true" role="status">
        {eyebrow}
        <p className="practice-suggest__body">
          {t('Nous lisons votre travail enregistré…', 'N ap li travay ou ki anrejistre…')}
        </p>
      </div>
    );
  }

  if (evidence.kind === 'signed-out') {
    return (
      <div className="practice-suggest">
        {eyebrow}
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
        {eyebrow}
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
        {eyebrow}
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
        {eyebrow}
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
