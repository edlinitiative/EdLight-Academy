/**
 * /suivi/:token — the progress record a student chose to share with a parent.
 *
 * Signed out by design: the reader has no account. The page shows exactly what
 * /api/progress-share returns for the token (shared/progressShare.ts names the
 * scope), drawn with the same ReleveSheet as /releve so a parent reads the same
 * figures the student sees. Minimal chrome, both languages, noindex, and the
 * token never leaves this tab (no-referrer on the route, see vercel.json).
 */
import React from 'react';
import { useParams } from 'react-router-dom';
import useStore from '../../contexts/store';
import { ReleveSheet, type ExamRow, type ReleveSheetProps } from '../ReleveSheet';
import type { CourseRecord } from '../../services/progressRecord';
import type { PublicProgress, PublicShareResponse } from '../../../shared/progressShare';
import { isShareToken } from '../../../shared/progressShare';
import { GRADES } from '../../config/trackConfig';
import { LEVEL_SLUG_LABELS, levelToSlug } from '../../utils/examLevels';
import '../../styles/pf.css';
import '../Releve.css';
import './Suivi.css';

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Port-au-Prince' });
const fmtDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Public payload → the props the printable sheet already knows how to draw. */
export function releveFromPublic(p: PublicProgress, isCreole: boolean): ReleveSheetProps {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const grade = GRADES.find((g) => g.code === p.grade);
  const identity = ([
    [t('Prénom', 'Premye non'), p.firstName || ''],
    [t('Classe', 'Klas'), grade ? (isCreole ? grade.labelHt : grade.label) : ''],
  ] as Array<[string, string]>).filter(([, v]) => !!v);
  const courses: CourseRecord[] = p.courses.map((c) => ({
    courseId: c.courseId, name: c.name, level: '', subject: '', lessonsCompleted: c.lessonsCompleted, lessonTotal: c.lessonTotal,
    points: 0, badges: [], units: c.units, mastery: c.mastery, unknownCourse: false,
  }));
  const exams: ExamRow[] = p.exams.map((e, i) => {
    const slug = levelToSlug(e.level);
    return { examKey: `${i}`, title: e.title || t('Examen', 'Egzamen'), subject: e.subject, year: e.year,
      levelLabel: LEVEL_SLUG_LABELS[slug]?.[isCreole ? 'ht' : 'fr'] || '', percentage: e.percentage, submittedAtMs: e.submittedAtMs };
  });
  return {
    isCreole, generatedLabel: fmtDate(p.generatedAt), identity, lessonsDone: p.lessonsDone, accuracy: null, totalQuestions: 0, games: 0,
    currentStreak: p.streak.current, bestStreak: p.streak.best, courses, exams,
  };
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'rate' } | { kind: 'done'; out: PublicShareResponse };

export default function Suivi() {
  const { token = '' } = useParams();
  const storeLanguage = useStore((s) => s.language);
  const [lang, setLang] = React.useState<'fr' | 'ht'>(storeLanguage === 'ht' ? 'ht' : 'fr');
  const isCreole = lang === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [state, setState] = React.useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    const r = document.createElement('meta');
    r.name = 'referrer'; r.content = 'no-referrer';
    document.head.appendChild(r);
    document.documentElement.setAttribute('data-releve', '');
    return () => { m.remove(); r.remove(); document.documentElement.removeAttribute('data-releve'); };
  }, []);

  React.useEffect(() => {
    if (!isShareToken(token)) { setState({ kind: 'done', out: { status: 'not_found' } }); return; }
    const controller = new AbortController();
    setState({ kind: 'loading' });
    fetch(`/api/progress-share?token=${encodeURIComponent(token)}`, { signal: controller.signal, referrerPolicy: 'no-referrer' })
      .then(async (res) => {
        if (res.status === 429) { setState({ kind: 'rate' }); return; }
        if (!res.ok) throw new Error(String(res.status));
        setState({ kind: 'done', out: await res.json() });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ kind: 'error' }); });
    return () => controller.abort();
  }, [token, attempt]);

  const progress = state.kind === 'done' && state.out.status === 'ok' ? state.out.progress : null;
  const closed = state.kind === 'done' && state.out.status !== 'ok' ? state.out.status : null;

  return (
    <main className="pf rlv suivi">
      <div className="container">
        <header className="suivi-bar" data-noprint>
          <span className="suivi-brand">EdLight Academy</span>
          <div className="suivi-lang" role="group" aria-label={t('Langue', 'Lang')}>
            <button type="button" aria-pressed={!isCreole} onClick={() => setLang('fr')}>Français</button>
            <button type="button" aria-pressed={isCreole} onClick={() => setLang('ht')}>Kreyòl</button>
          </div>
        </header>

        {state.kind === 'loading' && <p className="pf-empty" role="status">{t('Chargement du suivi…', 'Y ap chaje swivi a…')}</p>}

        {(state.kind === 'error' || state.kind === 'rate') && (
          <div className="pf-card suivi-message" role="alert">
            <h1>{t('Suivi indisponible pour le moment', 'Swivi a pa disponib kounye a')}</h1>
            <p>{state.kind === 'rate'
              ? t('Trop de consultations depuis cette connexion. Réessayez dans quelques minutes.', 'Twòp vizit sou koneksyon sa a. Eseye ankò nan kèk minit.')
              : t('Vérifiez votre connexion puis réessayez.', 'Tcheke koneksyon ou epi eseye ankò.')}</p>
            <button type="button" className="button button--primary" onClick={() => setAttempt((n) => n + 1)}>{t('Réessayer', 'Eseye ankò')}</button>
          </div>
        )}

        {closed && (
          <div className="pf-card suivi-message">
            <h1>{closed === 'expired' ? t('Ce lien a expiré', 'Lyen sa a ekspire') : t('Ce lien n’est plus actif', 'Lyen sa a pa aktif ankò')}</h1>
            <p>{closed === 'expired'
              ? t('Pour continuer à suivre les progrès, demandez à l’élève de vous envoyer un nouveau lien depuis son profil.', 'Pou kontinye swiv pwogrè yo, mande elèv la voye yon nouvo lyen ba ou depi nan pwofil li.')
              : t('L’élève a peut-être désactivé ce lien, ou il est incomplet. Demandez-lui de vous en envoyer un nouveau.', 'Petèt elèv la dezaktive lyen sa a, oswa li pa konplè. Mande l voye yon nouvo ba ou.')}</p>
          </div>
        )}

        {progress && (
          <>
            <section className="pf-card suivi-summary" data-noprint aria-label={t('Résumé', 'Rezime')}>
              <p className="pf-eyebrow">{t('Suivi partagé par l’élève', 'Swivi elèv la pataje')}</p>
              <h1 className="suivi-title">
                {progress.firstName ? t(`Les progrès de ${progress.firstName}`, `Pwogrè ${progress.firstName}`) : t('Les progrès de l’élève', 'Pwogrè elèv la')}
              </h1>
              <dl className="suivi-facts">
                <div><dt>{t('Mis à jour', 'Mete ajou')}</dt><dd>{fmtDate(progress.generatedAt)}</dd></div>
                <div><dt>{t('Dernière activité', 'Dènye aktivite')}</dt><dd>{progress.lastActivityDay ? fmtDay(progress.lastActivityDay) : t('aucune pour l’instant', 'poko genyen')}</dd></div>
                {progress.xp != null && <div><dt>XP</dt><dd className="num">{new Intl.NumberFormat('fr-FR').format(progress.xp)}</dd></div>}
                <div><dt>{t('Série en cours', 'Seri kounye a')}</dt><dd className="num">{progress.streak.current} {t(progress.streak.current < 2 ? 'jour' : 'jours', 'jou')}</dd></div>
              </dl>
              <p className="pf-note">{t(`Ce lien reste valable jusqu’au ${fmtDate(progress.expiresAt)}, sauf si l’élève le désactive avant.`, `Lyen sa a valab jiska ${fmtDate(progress.expiresAt)}, sòf si elèv la dezaktive l anvan.`)}</p>
              <button type="button" className="button button--ghost" onClick={() => window.print()}>{t('Imprimer ou enregistrer en PDF', 'Enprime oswa anrejistre an PDF')}</button>
            </section>
            <ReleveSheet {...releveFromPublic(progress, isCreole)} />
          </>
        )}
      </div>
    </main>
  );
}
