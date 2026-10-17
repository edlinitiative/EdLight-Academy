import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw, RotateCcw, Play } from '../../icons';
import { evidenceLabel, trackJourney } from '../../../utils/learningJourney';
import { lessonFrame } from '../../../utils/lessonFrames';
import { GRADES } from '../../../../shared/trackConfig';
import useStore from '../../../contexts/store';
import { Skeleton } from '../../Skeleton';
import { formatClock, lessonHref, flatLessons, type Continuation } from './homeJourney';

/**
 * HomeContinuation — LJ-01's one dominant next action on the signed-in Home.
 *
 * It is a single row on the page canvas, not a banner and not the old
 * « Reprendre où tu en étais » card: the exact destination (lesson title,
 * subject, class, unit, recorded status) on the left of one primary button,
 * with a compact review count and a quiet browse link beside it. The student
 * can read where the button goes before pressing it.
 *
 * Every state the PRD's matrix asks of Home is drawn here: loading (a
 * skeleton the shape of the row), load failure (retry, while the rest of the
 * page stays usable), new account, class not chosen, class not covered,
 * covered-but-unpublished class, caught up, stale link.
 */

type Props = {
  state: Continuation | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  retrying?: boolean;
  /** Due review questions; null while unknown (never shown as 0). */
  dueCount: number | null;
  /** Answers saved on the unfinished exam, when its attempt is known. */
  examAnswered?: number | null;
  /** The student's class code ('NS1', '9e'…), or null when not chosen. */
  grade: string | null;
  onSkipClass: () => void;
  subjectName: (code: string) => string;
  levelLabel: (lv: string) => string;
  courseLevel: (c: any) => string;
  L: (fr: string, ht: string) => string;
};

const gradeLabel = (code: string, isCreole: boolean) => {
  const g = GRADES.find((x: any) => x.code === code) as any;
  return g ? (isCreole ? g.labelHt : g.label) : code;
};

export default function HomeContinuation({
  state, loading, failed, onRetry, retrying, dueCount, examAnswered, grade, onSkipClass,
  subjectName, levelLabel, courseLevel, L,
}: Props) {
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const setGrade = useStore((s) => s.setGrade);
  const setGradeChosen = useStore((s) => s.setGradeChosen);
  const isCreole = language === 'ht';
  const [changingClass, setChangingClass] = useState(false);

  const select = (action: string, extra?: Record<string, string | number | boolean | null | undefined>) =>
    trackJourney('learning_next_action_selected', { source: 'home', action, ...extra });

  // ── Secondary actions: one compact review count, one quiet browse link ──
  const secondary = (
    <>
      {typeof dueCount === 'number' && dueCount > 0 && (
        <Link to="/revision" className="jh-next__alt jh-next__alt--review" onClick={() => select('review', { due: dueCount })}>
          <RotateCcw size={16} aria-hidden="true" />
          {L(`${dueCount} question${dueCount > 1 ? 's' : ''} à revoir`, `${dueCount} kesyon pou revize`)}
        </Link>
      )}
      <Link to="/courses" className="jh-next__alt jh-next__alt--quiet" onClick={() => select('browse')}>
        {L('Parcourir les cours', 'Gade tout kou yo')}
      </Link>
    </>
  );

  const classChooser = (
    <div className="jh-class" role="group" aria-label={L('Choisis ta classe', 'Chwazi klas ou')}>
      {GRADES.map((g: any) => (
        <button
          key={g.code}
          type="button"
          className={`jh-class__chip${grade === g.code ? ' is-on' : ''}`}
          aria-pressed={grade === g.code}
          onClick={() => {
            setGrade(g.code);
            setGradeChosen(true);
            setChangingClass(false);
            select('choose_class', { grade: g.code });
          }}
        >
          {isCreole ? g.labelHt : g.label}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <section className="jh-next jh-next--loading" aria-busy="true" aria-label={L('Ta prochaine leçon', 'Pwochen leson ou')}>
        <span className="jh-next__media"><Skeleton width="100%" height="100%" radius={14} /></span>
        <div className="jh-next__body">
          <Skeleton width="38%" height={14} />
          <Skeleton width="72%" height={26} style={{ margin: '0.6rem 0 0.5rem' }} />
          <Skeleton width="46%" height={14} />
          <Skeleton width={190} height={52} radius={12} style={{ marginTop: '1rem' }} />
        </div>
        <span className="jh-sr" role="status">{L('Chargement de ta prochaine leçon…', 'N ap chaje pwochen leson ou…')}</span>
      </section>
    );
  }

  if (failed) {
    return (
      <section className="jh-next jh-next--plain" aria-labelledby="jh-next-title">
        <div className="jh-next__body">
          <h2 id="jh-next-title" className="jh-next__title">{L('Tes cours n’ont pas pu se charger', 'Kou ou yo pa t ka chaje')}</h2>
          <p className="jh-next__status">
            {L('Vérifie ta connexion, puis réessaie. Tes examens et tes révisions ci-dessous restent disponibles.',
              'Tcheke koneksyon ou, epi eseye ankò. Egzamen ak revizyon ou yo anba a toujou disponib.')}
          </p>
          <div className="jh-next__actions">
            <button type="button" className="button button--primary button--lg" onClick={onRetry} disabled={retrying}>
              <RefreshCw size={18} aria-hidden="true" />
              {retrying ? L('Nouvel essai…', 'N ap eseye…') : L('Réessayer', 'Eseye ankò')}
            </button>
            {secondary}
          </div>
        </div>
      </section>
    );
  }

  if (!state) return null;

  const staleNote = 'staleLink' in state && state.staleLink ? (
    <p className="jh-next__note">
      {L('La dernière leçon que tu as ouverte n’est plus dans le catalogue. Voici la suite la plus proche.',
        'Dènye leson ou te louvri a pa nan katalòg la ankò. Men pi pwòch etap la.')}
    </p>
  ) : null;

  // ── An unfinished exam stays first (existing rule) ───────────────────────
  if (state.kind === 'exam') {
    return (
      <section className="jh-next jh-next--plain" aria-labelledby="jh-next-title">
        <div className="jh-next__body">
          <p className="jh-next__context">{L('Examen blanc · en cours', 'Egzamen blan · an kou')}</p>
          <h2 id="jh-next-title" className="jh-next__title">
            <span className="jh-next__verb">{L('Reprendre :', 'Kontinye :')}</span> {state.title}
          </h2>
          <p className="jh-next__status">
            {typeof examAnswered === 'number'
              ? L(`${examAnswered} réponse${examAnswered > 1 ? 's' : ''} enregistrée${examAnswered > 1 ? 's' : ''}. Tu reprends là où tu t’es arrêté.`,
                `${examAnswered} repons anrejistre. W ap kontinye kote ou te kanpe a.`)
              : L('Tu ne l’as pas encore rendu. Tu reprends là où tu t’es arrêté.', 'Ou poko remèt li. W ap kontinye kote ou te kanpe a.')}
          </p>
          <div className="jh-next__actions">
            <button
              type="button"
              className="button button--primary button--lg"
              onClick={() => {
                select('resume_exam');
                navigate(state.path, { state: { autostart: true, resume: true } });
              }}
            >
              {L('Reprendre l’examen', 'Kontinye egzamen an')} <ArrowRight size={18} aria-hidden="true" />
            </button>
            {secondary}
          </div>
        </div>
      </section>
    );
  }

  // ── A real lesson: resume, next, recent course or a first lesson ─────────
  if (state.kind === 'lesson') {
    const { course, unit, unitIndex, lesson, reason, evidence, positionSec, otherLevel } = state;
    const lvl = courseLevel(course);
    const href = lessonHref(course.id, lesson.id);
    // The lesson's OWN best still. When none of its stills is usable we show
    // the subject-tinted block, not another lesson's frame: the picture must
    // be of the lesson the button opens.
    const frame = lessonFrame(lesson.videoUrl);
    const unitNo = Number(unit?.unit_no) || unitIndex + 1;
    const total = flatLessons(course).length;
    const verb = reason === 'resume' ? L('Reprendre :', 'Kontinye :')
      : reason === 'start' ? L('Commencer :', 'Kòmanse :')
        : L('Leçon suivante :', 'Pwochen leson :');
    const cta = reason === 'resume' ? L('Reprendre la leçon', 'Kontinye leson an')
      : reason === 'start' ? L('Commencer la leçon', 'Kòmanse leson an')
        : L('Ouvrir la leçon', 'Louvri leson an');
    const status: string[] = [];
    if (reason === 'resume' && positionSec > 0) {
      status.push(L(`La vidéo reprend à ${formatClock(positionSec)} sur cet appareil`, `Videyo a ap repran nan ${formatClock(positionSec)} sou aparèy sa a`));
    }
    if (reason === 'next') status.push(L('Tu as terminé la leçon précédente', 'Ou fini leson anvan an'));
    if (reason === 'start') {
      status.push(state.lesson === flatLessons(course)[0]?.lesson
        ? L(`Première leçon du cours · ${total} leçons`, `Premye leson kou a · ${total} leson`)
        : L(`Ta prochaine leçon · ${total} dans le cours`, `Pwochen leson ou · ${total} nan kou a`));
    }
    const go = () => {
      select(reason === 'start' ? 'start_lesson' : 'resume_lesson', { reason, course_id: course.id, lesson_id: lesson.id });
      if (reason === 'resume' || reason === 'next' || reason === 'recent') {
        trackJourney('lesson_resume_requested', { source: 'home', course_id: course.id, lesson_id: lesson.id, reason, has_position: positionSec > 0 });
      }
    };
    return (
      <section className="jh-next" aria-labelledby="jh-next-title">
        <span className={`jh-next__media jh-next__media--${course.subject}`} aria-hidden="true">
          {frame ? <img src={frame} alt="" /> : null}
          <span className="jh-next__play"><Play size={20} /></span>
        </span>
        <div className="jh-next__body">
          <p className="jh-next__context">
            <span>{subjectName(course.subject)} · {levelLabel(lvl)}</span>
            <span aria-hidden="true"> · </span>
            <span>{L(`Unité ${unitNo}`, `Inite ${unitNo}`)}{unit?.title ? ` — ${unit.title}` : ''}</span>
          </p>
          <h2 id="jh-next-title" className="jh-next__title">
            <span className="jh-next__verb">{verb}</span> {lesson.title}
          </h2>
          <p className="jh-next__status">
            <span className={`jh-ev jh-ev--${evidence || 'new'}`}>
              {evidence ? evidenceLabel(evidence, isCreole) : L('Pas encore commencée', 'Poko kòmanse')}
            </span>
            {status.map((s) => <span key={s} className="jh-next__fact">{s}</span>)}
            {otherLevel && grade && (
              <span className="jh-next__fact">
                {L(`Pas ta classe (${gradeLabel(grade, false)})`, `Se pa klas ou (${gradeLabel(grade, true)})`)}
              </span>
            )}
          </p>
          {staleNote}
          <div className="jh-next__actions">
            <Link to={href} className="button button--primary button--lg" onClick={go}>
              {cta} <ArrowRight size={18} aria-hidden="true" />
            </Link>
            {secondary}
          </div>
        </div>
      </section>
    );
  }

  // ── No class yet: a skippable choice, with a real first lesson ───────────
  if (state.kind === 'choose-class') {
    const s = state.suggestion;
    return (
      <section className="jh-next jh-next--plain" aria-labelledby="jh-next-title">
        <div className="jh-next__body">
          <h2 id="jh-next-title" className="jh-next__title">{L('En quelle classe es-tu ?', 'Nan ki klas ou ye ?')}</h2>
          <p className="jh-next__status">
            {L('On te propose alors une première leçon de ta classe. Tu peux la changer à tout moment.',
              'N ap pwopoze w yon premye leson nan klas ou. Ou ka chanje l nenpòt ki lè.')}
          </p>
          {classChooser}
          <div className="jh-next__actions">
            {s && (
              <Link
                to={lessonHref(s.course.id, s.lesson.id)}
                className="button button--secondary"
                onClick={() => select('start_lesson', { reason: 'no_class', course_id: s.course.id, lesson_id: s.lesson.id })}
              >
                {L('Commencer sans choisir :', 'Kòmanse san chwazi :')} {s.lesson.title} · {subjectName(s.course.subject)} {levelLabel(courseLevel(s.course))}
              </Link>
            )}
            <button type="button" className="jh-next__alt jh-next__alt--quiet" onClick={() => { select('skip_class'); onSkipClass(); }}>
              {L('Passer', 'Sote')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ── Class not covered / class not published / caught up ─────────────────
  const changeClass = changingClass ? classChooser : (
    <button type="button" className="jh-next__alt jh-next__alt--quiet" onClick={() => setChangingClass(true)}>
      {L('Changer de classe', 'Chanje klas')}
    </button>
  );

  if (state.kind === 'uncovered') {
    const g = state.grade;
    const exam = g === '9e' ? { to: '/exams/9e', fr: 'Voir les épreuves de 9ᵉ AF', ht: 'Gade eprèv 9yèm AF yo' }
      : g === 'POSTBAC' ? { to: '/exams/university', fr: 'Voir les concours d’université', ht: 'Gade konkou inivèsite yo' }
        : null;
    return (
      <section className="jh-next jh-next--plain" aria-labelledby="jh-next-title">
        <div className="jh-next__body">
          <p className="jh-next__context">{L('Ta classe', 'Klas ou')} · {gradeLabel(g, isCreole)}</p>
          <h2 id="jh-next-title" className="jh-next__title">
            {L('Les cours vidéo ne couvrent pas encore ta classe', 'Kou videyo yo poko kouvri klas ou')}
          </h2>
          <p className="jh-next__status">
            {L('Ils existent pour le Nouveau Secondaire, de NS I à NS IV. Ce n’est pas ta recherche : ce contenu n’a pas encore été publié.',
              'Yo egziste pou Nouvo Segondè a, soti NS I rive NS IV. Se pa rechèch ou : kontni sa a poko pibliye.')}
          </p>
          {staleNote}
          <div className="jh-next__actions">
            {exam ? (
              <Link to={exam.to} className="button button--primary button--lg" onClick={() => select('uncovered_exams', { grade: g })}>
                {L(exam.fr, exam.ht)} <ArrowRight size={18} aria-hidden="true" />
              </Link>
            ) : (
              <Link to="/courses?niveau=NSI" className="button button--primary button--lg" onClick={() => select('uncovered_browse', { grade: g })}>
                {L('Voir les cours de NS I', 'Gade kou NS I yo')} <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
            {exam && (
              <Link to="/courses?niveau=NSI" className="jh-next__alt" onClick={() => select('uncovered_browse', { grade: g })}>
                {L('Cours de NS I (autre classe)', 'Kou NS I (lòt klas)')}
              </Link>
            )}
            {changeClass}
          </div>
        </div>
      </section>
    );
  }

  if (state.kind === 'level-empty') {
    return (
      <section className="jh-next jh-next--plain" aria-labelledby="jh-next-title">
        <div className="jh-next__body">
          <p className="jh-next__context">{L('Ta classe', 'Klas ou')} · {levelLabel(state.level)}</p>
          <h2 id="jh-next-title" className="jh-next__title">
            {L(`Les cours de ${levelLabel(state.level)} ne sont pas encore publiés`, `Kou ${levelLabel(state.level)} yo poko pibliye`)}
          </h2>
          <p className="jh-next__status">
            {L('Les autres classes du Nouveau Secondaire sont disponibles. Choisis toi-même si l’une d’elles te sert.',
              'Lòt klas Nouvo Segondè yo disponib. Chwazi tèt ou si youn ladan yo ka ede w.')}
          </p>
          {staleNote}
          <div className="jh-next__actions">
            <Link to="/courses" className="button button--primary button--lg" onClick={() => select('browse', { reason: 'level_empty' })}>
              {L('Parcourir les cours', 'Gade tout kou yo')} <ArrowRight size={18} aria-hidden="true" />
            </Link>
            {changeClass}
          </div>
        </div>
      </section>
    );
  }

  // caught-up
  const due = typeof dueCount === 'number' ? dueCount : 0;
  return (
    <section className="jh-next jh-next--plain" aria-labelledby="jh-next-title">
      <div className="jh-next__body">
        {state.level && <p className="jh-next__context">{L('Ta classe', 'Klas ou')} · {levelLabel(state.level)}</p>}
        <h2 id="jh-next-title" className="jh-next__title">
          {L('Toutes les leçons de ta classe sont terminées', 'Tout leson klas ou yo fini')}
        </h2>
        <p className="jh-next__status">
          {L('Terminer une vidéo n’est pas encore la maîtriser : les tests de chapitre le confirment.',
            'Fini yon videyo poko vle di ou metrize l : tès chapit yo konfime sa.')}
        </p>
        {staleNote}
        <div className="jh-next__actions">
          {due > 0 ? (
            <Link to="/revision" className="button button--primary button--lg" onClick={() => select('review', { due, reason: 'caught_up' })}>
              {L(`Revoir ${due} question${due > 1 ? 's' : ''}`, `Revize ${due} kesyon`)} <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ) : (
            <Link to="/quizzes" className="button button--primary button--lg" onClick={() => select('practice', { reason: 'caught_up' })}>
              {L('S’entraîner', 'Pratike')} <ArrowRight size={18} aria-hidden="true" />
            </Link>
          )}
          <Link to="/courses" className="jh-next__alt jh-next__alt--quiet" onClick={() => select('browse')}>
            {L('Parcourir les cours', 'Gade tout kou yo')}
          </Link>
        </div>
      </div>
    </section>
  );
}
