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
import { Printer, GraduationCap, FileText } from '../components/icons';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { useAllProgress } from '../hooks/useProgress';
import { useCourses } from '../hooks/useData';
import { useExamAttempts } from '../hooks/useExamAttempts';
import { readMastery, toProgressMap } from '../services/masteryService';
import {
  buildCourseRecords, totalLessonsCompleted, quizAccuracy,
  type CourseRecord,
} from '../services/progressRecord';
import { GRADES, TRACK_BY_CODE } from '../config/trackConfig';
import { normalizeExamCatalog } from '../utils/examCatalog';
import { examDisplayTitle } from '../utils/examUtils';
import { LEVEL_SLUG_LABELS, levelToSlug } from '../utils/examLevels';
import '../styles/pf.css';
import './Releve.css';

export { NOT_OFFICIAL, ReleveSheet, type ExamRow, type ReleveSheetProps } from './ReleveSheet';
import { NOT_OFFICIAL, ReleveSheet, type ExamRow } from './ReleveSheet';

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
