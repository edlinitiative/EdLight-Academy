/**
 * Releve — /releve, the printable progress record.
 *
 * WHO READS IT. Not the student. A parent, a teacher, a head teacher — often on
 * paper, or on a PDF printed from a browser, with no way to ask a follow-up
 * question. Everything below follows from that: the document explains its own
 * vocabulary, names the source of every figure, and states in both languages
 * what it is not.
 *
 * NO PDF LIBRARY. The browser's print pipeline is the whole mechanism
 * (Cmd/Ctrl+P → Enregistrer en PDF), the same choice /arena/autorisation makes
 * and for the same reason: it works on a phone in Port-au-Prince exactly as it
 * works on a desk, and it adds nothing to the bundle.
 *
 * EVERY FIGURE ON THE SHEET AND WHERE IT COMES FROM
 * ─────────────────────────────────────────────────
 *   Name, class, track        the store (`user.name`, `grade`, `track`), i.e.
 *                             what the student typed into their own profile.
 *   School, city, department  `gamification/profile.leaderboard` via useTrivia —
 *                             the one place the app keeps them.
 *   Leçons terminées          SUM of `completedLessons.length` over the
 *                             per-course documents (users/{uid}/progress/*),
 *                             deduplicated. There is no single total field.
 *   Points, badges            `totalPoints` / `badges` on those same per-course
 *                             documents, stated PER COURSE because that is how
 *                             they are awarded.
 *   Maîtrise par unité        users/{uid}/mastery/lessons — the ONE shared
 *                             document the mobile app also writes — read via
 *                             masteryService and aggregated with the shared
 *                             model's `summarize`. NEVER derived from
 *                             `completedLessons`, which can only ever prove the
 *                             `seen` rung (see services/progressRecord.ts).
 *   Précision aux quiz        `totalCorrect / totalQuestions` on the trivia
 *                             profile; `null`, not 0 %, when nothing was asked.
 *   Parties jouées            `totalGames` on the same profile.
 *   Série                     users/{uid}/streak via useStreak (current + best).
 *   Examens                   useExamAttempts — the saved correction per exam
 *                             (one document per exam), titled from the public
 *                             exam catalog index.
 *
 * WHAT THIS DOCUMENT REFUSES TO SAY, all of which the mockups had:
 *   • no grade, average, mark out of 20 or "mention" — the app does not grade,
 *     and a "14.8/20 — Mention Bien Projetée" beside a student's name is an
 *     invented assessment that a parent has no way to check;
 *   • no Bac prediction or readiness verdict;
 *   • no "VÉRIFIÉ MENFP", ministry endorsement, or claim that units validated
 *     here count towards contrôle continu — they do not, and saying so would
 *     be a lie told to a teacher;
 *   • no percentile, rank or "top X %";
 *   • no signature line, stamp, seal or matricule — the furniture that makes a
 *     page look like a certificate;
 *   • no study-hours chart: the app does not track time at all.
 * The one honest line replacing all of it is `NOT_OFFICIAL`, printed in French
 * AND Kreyòl regardless of the interface language, because the person holding
 * the paper did not choose that language.
 *
 * ZEROS. A figure that is zero or missing is omitted, or said out loud. Nothing
 * is filled with a placeholder, an em dash or a "—" standing in for a number.
 *
 * SHAPE. `ReleveSheet` is the document and is pure: everything it draws arrives
 * as props. The default export is the page — it reads the hooks, assembles the
 * props and owns the signed-out state. Keeping the two apart is what lets the
 * printed sheet be looked at without a signed-in Firestore behind it.
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Printer, BookOpen, Brain, Target, Flame, GraduationCap, FileText, Layers,
} from '../components/icons';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { useAllProgress } from '../hooks/useProgress';
import { useCourses } from '../hooks/useData';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { readMastery, toProgressMap } from '../services/masteryService';
import {
  buildCourseRecords, totalLessonsCompleted, quizAccuracy, hasAnythingToRecord,
  type CourseRecord,
} from '../services/progressRecord';
import { masteryLabel, type MasteryLevel } from '../../shared/mastery';
import { GRADES, TRACK_BY_CODE } from '../config/trackConfig';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { examDisplayTitle } from '../utils/examUtils';
import { LEVEL_SLUG_LABELS, levelToSlug } from '../utils/examLevels';
import '../styles/pf.css';
import './Releve.css';

/* The sentence this whole page is built around. Both languages, always: the
   student may have the app in Kreyòl and hand the paper to a French-reading
   head teacher, or the reverse. */
export const NOT_OFFICIAL = {
  fr: 'Ce relevé décrit l’activité d’un élève sur EdLight Academy, une application d’apprentissage gratuite. Ce n’est pas un document officiel : il n’est ni délivré ni reconnu par une école ou par le MENFP, il ne contient aucune note, aucune moyenne et aucun classement, et il ne remplace pas un bulletin.',
  ht: 'Relve sa a dekri aktivite yon elèv sou EdLight Academy, yon aplikasyon aprantisaj gratis. Se pa yon dokiman ofisyèl : ni yon lekòl ni MENFP pa bay li epi yo pa rekonèt li, li pa gen okenn nòt, okenn mwayèn ni okenn klasman, epi li pa ranplase yon bilten.',
};

/** The mastery ladder, explained on the sheet so a reader who has never used
 *  the app can tell what "Maîtrisé" cost. Straight from /shared/mastery.ts. */
const LADDER: Array<{ level: MasteryLevel; fr: string; ht: string }> = [
  { level: 'seen', fr: 'la leçon a été regardée', ht: 'yo gade leson an' },
  { level: 'familiar', fr: 'au moins 70 % aux exercices de la leçon', ht: 'omwen 70 % nan egzèsis leson an' },
  { level: 'proficient', fr: '100 % aux exercices de la leçon', ht: '100 % nan egzèsis leson an' },
  {
    level: 'mastered',
    fr: 'confirmée plus tard au test du chapitre, mélangée aux autres leçons de l’unité',
    ht: 'konfime pita nan tès chapit la, melanje ak lòt leson yo nan inite a',
  },
];

const TONE_BY_LEVEL: Record<MasteryLevel, string> = {
  none: 'slate', seen: 'slate', familiar: 'amber', proficient: 'azure', mastered: 'emerald',
};

export interface ExamRow {
  examKey: string;
  title: string;
  subject: string;
  year: string | number;
  levelLabel: string;
  percentage: number;
  submittedAtMs: number | null;
}

export interface ReleveSheetProps {
  isCreole: boolean;
  /** Already formatted — the page decides the locale, the sheet just prints it. */
  generatedLabel: string;
  /** [label, value] pairs, already filtered to the ones that are actually set. */
  identity: Array<[string, string]>;
  lessonsDone: number;
  accuracy: number | null;
  totalQuestions: number;
  games: number;
  currentStreak: number;
  bestStreak: number;
  courses: CourseRecord[];
  exams: ExamRow[];
  loading?: boolean;
}

function Figure({ tone, icon, value, label, hint }: {
  tone: string; icon: React.ReactNode; value: string; label: string; hint?: string;
}) {
  return (
    <div className="rlv-figure">
      <span className={`pf-tile pf-tile--${tone} pf-tile--sm`} aria-hidden="true">{icon}</span>
      <span className="rlv-figure__value num">{value}</span>
      <span className="rlv-figure__label">{label}</span>
      {hint && <span className="rlv-figure__hint">{hint}</span>}
    </div>
  );
}

/**
 * The document itself. Pure — no hooks, no store, no network — so it renders
 * identically whether the numbers came from Firestore or from a fixture.
 */
export function ReleveSheet({
  isCreole, generatedLabel, identity, lessonsDone, accuracy, totalQuestions,
  games, currentStreak, bestStreak, courses, exams, loading = false,
}: ReleveSheetProps) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  /* French agrees in number and this document is read closely — "1 chapitres
     pas encore commencés" on a page handed to a teacher is a small thing that
     makes every other figure look unchecked. Kreyòl does not inflect, so its
     strings are written once. */
  const pl = (n: number, one: string, many: string) => (n < 2 ? one : many);

  const fmtDate = (ms?: number | null) =>
    ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  const anything = hasAnythingToRecord({
    lessons: lessonsDone,
    courses,
    quizQuestions: totalQuestions,
    exams: exams.length,
    streakBest: bestStreak,
  });

  return (
    <article className="rlv-sheet" aria-label={t('Relevé de progression', 'Relve pwogrè')}>

      <header className="rlv-mast">
        <div>
          <span className="pf-eyebrow">EdLight Academy</span>
          <h2 className="rlv-mast__title">{t('Relevé de progression', 'Relve pwogrè')}</h2>
        </div>
        <p className="rlv-mast__date">{t('Généré le', 'Jenere')} {generatedLabel}</p>
      </header>

      {/* The one honest line, in both languages, above everything it qualifies
          — not in a footnote a reader can miss. */}
      <p className="rlv-disclaimer">
        <span lang="fr">{NOT_OFFICIAL.fr}</span>
        <span lang="ht">{NOT_OFFICIAL.ht}</span>
      </p>

      {identity.length > 0 && (
        <section className="rlv-block">
          <h3 className="rlv-block__title">{t('Élève', 'Elèv')}</h3>
          <dl className="rlv-identity">
            {identity.map(([label, value]) => (
              <div className="rlv-identity__row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {loading ? (
        <p className="pf-empty rlv-loading">{t('Chargement du relevé…', 'Y ap chaje relve a…')}</p>
      ) : !anything ? (
        /* Honest emptiness: no zeros dressed up as figures. */
        <section className="rlv-block">
          <h3 className="rlv-block__title">{t('Activité', 'Aktivite')}</h3>
          <p className="pf-empty">
            {t(
              'Aucune activité n’est encore enregistrée sur ce compte. Dès qu’une leçon, un quiz ou un examen est terminé, il apparaît ici.',
              'Pa gen okenn aktivite anrejistre sou kont sa a pou kounye a. Depi w fini yon leson, yon kiz oswa yon egzamen, l ap parèt isit la.',
            )}
          </p>
          <Link to="/courses" className="pf-link rlv-inline-link" data-noprint>
            {t('Commencer un cours', 'Kòmanse yon kou')}
          </Link>
        </section>
      ) : (
        <>
          {/* ── The figures, each stated once, each from one source ── */}
          <section className="rlv-block">
            <h3 className="rlv-block__title">{t('En résumé', 'An rezime')}</h3>
            <div className="rlv-figures">
              {lessonsDone > 0 && (
                <Figure
                  tone="azure" icon={<BookOpen size={15} />} value={String(lessonsDone)}
                  label={t(pl(lessonsDone, 'leçon terminée', 'leçons terminées'), 'leson fini')}
                  hint={courses.length > 0
                    ? t(`dans ${courses.length} cours`, `nan ${courses.length} kou`)
                    : undefined}
                />
              )}
              {accuracy !== null && (
                <Figure
                  tone="emerald" icon={<Target size={15} />} value={`${accuracy} %`}
                  label={t('de réponses justes', 'repons ki kòrèk')}
                  hint={t(
                    `sur ${totalQuestions} ${pl(totalQuestions, 'question', 'questions')} de quiz`,
                    `sou ${totalQuestions} kesyon kiz`,
                  )}
                />
              )}
              {games > 0 && (
                <Figure
                  tone="violet" icon={<Brain size={15} />} value={String(games)}
                  label={t(pl(games, 'partie de quiz jouée', 'parties de quiz jouées'), 'pati kiz jwe')}
                />
              )}
              {bestStreak > 0 && (
                <Figure
                  tone="amber" icon={<Flame size={15} />} value={String(bestStreak)}
                  label={t(
                    pl(bestStreak, 'jour de suite, au mieux', 'jours de suite, au mieux'),
                    'jou youn dèyè lòt, pi bon an',
                  )}
                  hint={currentStreak > 0
                    ? t(`série en cours : ${currentStreak}`, `seri kounye a : ${currentStreak}`)
                    : t('série en cours : aucune', 'seri kounye a : okenn')}
                />
              )}
            </div>
          </section>

          {/* ── Per course, per unit: the mastery document ── */}
          {courses.length > 0 && (
            <section className="rlv-block">
              <h3 className="rlv-block__title">{t('Cours et chapitres', 'Kou ak chapit')}</h3>
              <p className="rlv-block__note">
                {t(
                  'La maîtrise est mesurée leçon par leçon, séparément des leçons terminées : terminer une leçon veut dire l’avoir parcourue, la maîtriser veut dire l’avoir prouvée. Une unité prend le niveau de sa leçon la plus faible.',
                  'Yo mezire metriz leson pa leson, apa de leson ki fini : fini yon leson vle di ou pase nan li, metrize l vle di ou pwouve l. Yon inite pran nivo leson ki pi fèb la.',
                )}
              </p>

              {courses.map((c) => {
                const started = c.units.filter((u) => u.mastery.started > 0);
                const untouched = c.units.length - started.length;
                return (
                  <div className="rlv-course" key={c.courseId}>
                    <div className="rlv-course__head">
                      <span className="pf-tile pf-tile--azure pf-tile--sm" aria-hidden="true">
                        <Layers size={15} />
                      </span>
                      <h4 className="rlv-course__name">{c.name}</h4>
                      <span className="pf-pill pf-pill--slate">
                        {c.lessonTotal > 0
                          ? t(
                            `${c.lessonsCompleted} / ${c.lessonTotal} leçons terminées`,
                            `${c.lessonsCompleted} / ${c.lessonTotal} leson fini`,
                          )
                          : t(
                            `${c.lessonsCompleted} ${pl(c.lessonsCompleted, 'leçon terminée', 'leçons terminées')}`,
                            `${c.lessonsCompleted} leson fini`,
                          )}
                      </span>
                    </div>

                    <p className="rlv-course__meta">
                      {c.mastery.total > 0 && (
                        <span>
                          {t(
                            `${c.mastery.mastered} ${pl(c.mastery.mastered, 'leçon maîtrisée', 'leçons maîtrisées')} sur ${c.mastery.total}`,
                            `${c.mastery.mastered} leson metrize sou ${c.mastery.total}`,
                          )}
                        </span>
                      )}
                      {c.points > 0 && (
                        <span>{t(`${c.points} ${pl(c.points, 'point', 'points')}`, `${c.points} pwen`)}</span>
                      )}
                      {c.badges.length > 0 && (
                        <span>
                          {t(
                            `${c.badges.length} ${pl(c.badges.length, 'distinction', 'distinctions')} dans ce cours`,
                            `${c.badges.length} distenksyon nan kou sa a`,
                          )}
                        </span>
                      )}
                    </p>

                    {started.length > 0 ? (
                      <ul className="rlv-units">
                        {started.map((u) => (
                          <li className="rlv-unit" key={u.unitId}>
                            <span className="rlv-unit__title">{u.title || t('Unité', 'Inite')}</span>
                            {/* A unit takes the level of its WEAKEST lesson, so a
                                chapter with two mastered lessons and one untouched
                                one is still `none`. Printing the `none` label —
                                "À découvrir" — beside a chapter the student has
                                clearly worked on would read as a denial of the work
                                the two columns to its right are counting. Started
                                but not yet levelled is exactly "Commencée". */}
                            <span className={`pf-pill pf-pill--${TONE_BY_LEVEL[u.mastery.level]} rlv-unit__pill`}>
                              {u.mastery.level === 'none'
                                ? t('Commencée', 'Kòmanse')
                                : masteryLabel(u.mastery.level, isCreole)}
                            </span>
                            <span className="rlv-unit__counts num">
                              {t(
                                `${u.mastery.mastered} / ${u.mastery.total} maîtrisées`,
                                `${u.mastery.mastered} / ${u.mastery.total} metrize`,
                              )}
                            </span>
                            <span className="pf-meter pf-meter--azure rlv-unit__meter" aria-hidden="true">
                              <span className="pf-meter__fill" style={{ width: `${u.mastery.points}%` }} />
                            </span>
                            <span className="rlv-unit__points num">{u.mastery.points} / 100</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="pf-empty">
                        {t(
                          'Aucun chapitre commencé dans ce cours.',
                          'Pa gen chapit ki kòmanse nan kou sa a.',
                        )}
                      </p>
                    )}

                    {untouched > 0 && (
                      <p className="rlv-course__rest">
                        {t(
                          `${untouched} ${pl(untouched, 'chapitre pas encore commencé', 'chapitres pas encore commencés')}.`,
                          `${untouched} chapit ki poko kòmanse.`,
                        )}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* The ladder, explained. Without it "Maîtrisé" is a word a
                  reader has to take on trust. */}
              <div className="rlv-ladder">
                <span className="pf-eyebrow">{t('Ce que veut dire chaque niveau', 'Sa chak nivo vle di')}</span>
                <ul>
                  {LADDER.map((r) => (
                    <li key={r.level}>
                      <span className={`pf-pill pf-pill--${TONE_BY_LEVEL[r.level]}`}>
                        {masteryLabel(r.level, isCreole)}
                      </span>
                      <span>{isCreole ? r.ht : r.fr}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* ── Exams: only when there are any ── */}
          {exams.length > 0 && (
            <section className="rlv-block">
              <h3 className="rlv-block__title">{t('Examens corrigés', 'Egzamen korije')}</h3>
              <p className="rlv-block__note">
                {t(
                  'Score de la correction enregistrée pour chaque épreuve. Une épreuve travaillée en ligne n’a aucune valeur officielle.',
                  'Nòt koreksyon ki anrejistre pou chak epidèv. Yon epidèv ou travay sou entènèt pa gen okenn valè ofisyèl.',
                )}
              </p>
              <ul className="rlv-exams">
                {exams.map((e) => (
                  <li className="rlv-exam" key={e.examKey}>
                    <span className="rlv-exam__title">
                      {e.title}
                      {(e.subject || e.year) && (
                        <span className="rlv-exam__meta">
                          {[e.subject, e.year, e.levelLabel].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    {fmtDate(e.submittedAtMs) && (
                      <span className="rlv-exam__date">{fmtDate(e.submittedAtMs)}</span>
                    )}
                    <span className="rlv-exam__score num">{Math.round(e.percentage)} %</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <footer className="rlv-foot">
        <p>
          {t(
            'Chaque chiffre de ce relevé est compté à partir de l’activité enregistrée sur le compte de l’élève. EdLight Academy ne note pas les élèves et ne mesure pas le temps passé.',
            'Chak chif nan relve sa a konte apati aktivite ki anrejistre sou kont elèv la. EdLight Academy pa bay elèv nòt epi li pa mezire tan yo pase.',
          )}
        </p>
        <p className="rlv-foot__repeat">
          <span lang="fr">Ce relevé n’est pas un document officiel.</span>
          {' · '}
          <span lang="ht">Relve sa a se pa yon dokiman ofisyèl.</span>
          {' · edlight.org'}
        </p>
      </footer>
    </article>
  );
}

/**
 * The mastery map for the whole account.
 *
 * `readMastery` reads the ONE shared document. The per-course `completedLessons`
 * arrays are then folded IN through `toProgressMap` — the join masteryService
 * itself defines, which merges the `completed` flag without ever writing over a
 * record. That is not "deriving mastery from the progress doc": the rungs all
 * come from the mastery document, and this only lets a lesson that was merely
 * watched on the web still read as `Vu` instead of disappearing.
 */
function useAccountMastery(uid: string | null, allProgress: any[]) {
  const completedLessons = React.useMemo(
    () => (allProgress || []).flatMap((p: any) => p?.completedLessons || []),
    [allProgress],
  );
  const { data: lessons } = useQuery({
    queryKey: ['record-mastery', uid],
    queryFn: () => readMastery(uid),
    enabled: !!uid,
    staleTime: 60_000,
  });
  return React.useMemo(
    () => toProgressMap({ lessons: lessons || {}, completedLessons }),
    [lessons, completedLessons],
  );
}

/** Same query key as /exams/resultats, so the two share one cached answer. */
function useExamCatalogIndex(enabled: boolean) {
  return useQuery({
    queryKey: ['exam-catalog-index'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog_index.json');
      if (!res.ok) throw new Error('catalog index unavailable');
      return normalizeExamCatalog(await res.json());
    },
    staleTime: Infinity,
    enabled,
  });
}

export default function Releve() {
  const navigate = useNavigate();
  const {
    user, isAuthenticated, language, grade, track, setActiveTab, toggleAuthModal,
  } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const uid = user?.uid || null;
  const { profile } = useTrivia();
  const { streak } = useStreak();
  const { progress: allProgress, loading: progressLoading } = useAllProgress();
  const { data: courses = [], isLoading: coursesLoading } = useCourses();
  const mastery = useAccountMastery(uid, allProgress);
  const attempts = useExamAttempts();
  const { data: examCatalog } = useExamCatalogIndex(Object.keys(attempts).length > 0);

  /* Fixed at mount: a re-render must not silently change the date printed on a
     document somebody has already started reading. */
  const [generatedAt] = React.useState(() => new Date());

  /*
   * Print rules cannot be scoped to a route, and this page's stylesheet stays
   * in the document once its chunk has loaded — so an unscoped `@media print`
   * rule here would follow the visitor to every other page they printed for
   * the rest of the session. The attribute is the scope: every print rule in
   * Releve.css sits under `[data-releve]`, and it is removed on unmount.
   */
  React.useEffect(() => {
    document.documentElement.setAttribute('data-releve', '');
    return () => document.documentElement.removeAttribute('data-releve');
  }, []);

  const courseRecords: CourseRecord[] = React.useMemo(
    () => buildCourseRecords(allProgress, courses as any[], mastery),
    [allProgress, courses, mastery],
  );

  const examRows: ExamRow[] = React.useMemo(() => {
    if (!examCatalog) return [];
    const byKey = new Map<string, any>();
    for (const e of examCatalog as any[]) byKey.set(String(e.exam_id ?? e._idx), e);
    return Object.entries(attempts)
      .map(([examKey, info]) => {
        const exam = byKey.get(examKey);
        if (!exam || info?.percentage == null) return null;
        const slug = levelToSlug(exam.level);
        return {
          examKey,
          title: examDisplayTitle(exam, isCreole ? 'Egzamen' : 'Examen'),
          subject: exam._subject || exam.subject || '',
          year: exam.year || '',
          levelLabel: LEVEL_SLUG_LABELS[slug]?.[isCreole ? 'ht' : 'fr'] || slug,
          percentage: info.percentage as number,
          submittedAtMs: info.submittedAtMs,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (b.submittedAtMs ?? 0) - (a.submittedAtMs ?? 0)) as ExamRow[];
  }, [examCatalog, attempts, isCreole]);

  // ── Signed out: an invitation, never a blank page ───────────────────────
  if (!isAuthenticated || !user) {
    return (
      <section className="section pf rlv">
        <div className="container rlv-guest">
          <div className="pf-card">
            <span className="pf-tile pf-tile--azure pf-tile--lg" aria-hidden="true"><FileText size={24} /></span>
            <h1 className="rlv-guest__title">{t('Relevé de progression', 'Relve pwogrè')}</h1>
            <p className="rlv-guest__lead">
              {t(
                'Ce relevé rassemble sur une page ce que vous avez fait sur EdLight Academy : leçons terminées, maîtrise par chapitre, quiz, examens et série. Il s’imprime, ou s’enregistre en PDF, pour le montrer à un parent ou à un professeur.',
                'Relve sa a mete sou yon sèl paj sa ou fè sou EdLight Academy : leson ou fini, metriz chak chapit, kiz, egzamen ak seri ou. Ou ka enprime l, oswa anrejistre l an PDF, pou montre yon paran oswa yon pwofesè.',
              )}
            </p>
            <p className="rlv-guest__lead">
              {t(
                'Il est construit à partir de votre compte, il faut donc être connecté pour le voir.',
                'Yo bati l ak kont ou, kidonk ou dwe konekte pou w wè l.',
              )}
            </p>
            <div className="rlv-guest__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={() => { setActiveTab('signin'); toggleAuthModal(); }}
              >
                {t('Se connecter', 'Konekte')}
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => { setActiveTab('signup'); toggleAuthModal(); }}
              >
                {t('Créer un compte', 'Kreye yon kont')}
              </button>
            </div>
            <p className="pf-note">
              {t('Sans compte, les cours restent accessibles.', 'San kont, kou yo rete disponib.')}{' '}
              <Link to="/courses" className="pf-link rlv-inline-link">{t('Voir les cours', 'Gade kou yo')}</Link>
            </p>
          </div>

          {/* Said here too, so nobody signs in expecting a certificate. */}
          <p className="rlv-disclaimer rlv-disclaimer--plain">
            <span lang="fr">{NOT_OFFICIAL.fr}</span>
            <span lang="ht">{NOT_OFFICIAL.ht}</span>
          </p>
        </div>
      </section>
    );
  }

  const gradeEntry = GRADES.find((g) => g.code === grade);
  const gradeLabel = gradeEntry ? (isCreole ? gradeEntry.labelHt : gradeEntry.label) : '';
  let trackLabel = '';
  try { trackLabel = track ? (TRACK_BY_CODE[track]?.label || '') : ''; } catch { trackLabel = ''; }
  const board = profile?.leaderboard || {};

  const identity = ([
    [t('Nom', 'Non'), user.name || user.displayName || ''],
    [t('Classe', 'Klas'), gradeLabel],
    [t('Filière', 'Filyè'), trackLabel],
    [t('École', 'Lekòl'), board.school || ''],
    [t('Ville', 'Vil'), board.city || board.department || ''],
  ] as Array<[string, string]>).filter(([, v]) => !!v);

  return (
    <section className="section pf rlv">
      <div className="container">

        {/* ── Toolbar: screen only. Nothing here belongs on the paper. ── */}
        <div className="rlv-toolbar pf-card" data-noprint>
          <div className="rlv-toolbar__text">
            <span className="pf-eyebrow">{t('Mon espace', 'Espas mwen')}</span>
            <h1 className="rlv-toolbar__title">{t('Relevé de progression', 'Relve pwogrè')}</h1>
            <p className="rlv-toolbar__lead">
              {t(
                'Imprimez cette page, ou enregistrez-la en PDF depuis la fenêtre d’impression, pour la montrer à un parent, à un professeur ou à votre école. Seul le relevé ci-dessous s’imprime — ni le menu, ni ce bandeau.',
                'Enprime paj sa a, oswa anrejistre l an PDF nan fenèt enpresyon an, pou montre yon paran, yon pwofesè oswa lekòl ou. Se relve ki anba a sèlman ki enprime — ni meni an, ni bandwòl sa a.',
              )}
            </p>
          </div>
          <div className="rlv-toolbar__actions">
            <button type="button" className="button button--primary rlv-print" onClick={() => window.print()}>
              <Printer size={16} aria-hidden="true" />
              {t('Imprimer ou enregistrer en PDF', 'Enprime oswa anrejistre an PDF')}
            </button>
            <button type="button" className="button button--ghost" onClick={() => navigate('/profile')}>
              {t('Retour au profil', 'Retounen nan pwofil')}
            </button>
          </div>
        </div>

        <ReleveSheet
          isCreole={isCreole}
          generatedLabel={generatedAt.toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', year: 'numeric',
          })}
          identity={identity}
          lessonsDone={totalLessonsCompleted(allProgress)}
          accuracy={quizAccuracy(profile?.totalCorrect, profile?.totalQuestions)}
          totalQuestions={profile?.totalQuestions || 0}
          games={profile?.totalGames || 0}
          currentStreak={streak?.currentStreak || 0}
          bestStreak={streak?.longestStreak || 0}
          courses={courseRecords}
          exams={examRows}
          loading={progressLoading || coursesLoading}
        />

        <p className="rlv-after" data-noprint>
          <GraduationCap size={16} aria-hidden="true" />
          {t(
            'Pour faire grandir ce relevé : terminez une leçon, faites ses exercices, puis passez le test du chapitre.',
            'Pou fè relve sa a grandi : fini yon leson, fè egzèsis li yo, epi pase tès chapit la.',
          )}
        </p>
      </div>
    </section>
  );
}
